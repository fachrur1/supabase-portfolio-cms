#!/usr/bin/env node
// ============================================================================
// demo/serve.mjs - a local, dependency-free stand-in for Supabase.
//
// Serves a built copy of the site *and* implements just enough of the PostgREST
// + GoTrue + Storage HTTP surface for the public page and the admin dashboard to
// run against fictional data. No account, no keys, no network.
//
//   node demo/serve.mjs --site <dir-with-built-site> [--port 8787]
//
// Why this exists: documentation screenshots and demos must never leak a real
// person's content. Everything served here comes from demo/demo-dataset.mjs.
//
// Implemented (deliberately narrow - it is a demo, not a Postgres):
//   GET    /rest/v1/<table>?select=&order=&limit=&offset=&<col>=eq.v&or=(...)
//   POST   /rest/v1/<table>            (insert; Prefer: return=representation)
//   PATCH  /rest/v1/<table>?<filters>  (update)
//   DELETE /rest/v1/<table>?<filters>
//   POST   /auth/v1/token?grant_type=password|refresh_token
//   POST   /auth/v1/logout , GET /auth/v1/user
//   POST   /storage/v1/object/<bucket>/<path> , GET /storage/v1/object/public/...
//
// Not implemented: RLS (the demo is single-user), RPC, realtime, SQL.
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoDataset, DEMO_ACCOUNT } from './demo-dataset.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg('port', process.env.DEMO_PORT || 8787));
const SITE_DIR = path.resolve(arg('site', path.join(__dirname, 'site')));

/* -------------------------------------------------------------------------- */
/* In-memory database                                                         */
/* -------------------------------------------------------------------------- */

/** Deep clone so mutations during a demo session never touch the source data. */
const db = structuredClone(demoDataset());
const storage = new Map(); // "bucket/path" -> Buffer

const nowIso = () => new Date().toISOString();
const uuid = () => cryptoRandomHex(32);

function cryptoRandomHex(len) {
  const bytes = new Uint8Array(len / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Buffer.from(bytes).toString('hex');
}

/* -------------------------------------------------------------------------- */
/* PostgREST query support                                                    */
/* -------------------------------------------------------------------------- */

const RESERVED = new Set([
  'select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and',
  'not.or', 'apikey'
]);

function decode(value) {
  return decodeURIComponent(String(value).replace(/\+/g, ' '));
}

function coerce(s) {
  if (s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s;
}

function matchesValue(rowValue, expr) {
  const [op, ...rest] = String(expr).split('.');
  const raw = decode(rest.join('.'));
  switch (op) {
    case 'eq': return String(rowValue ?? '') === raw;
    case 'neq': return String(rowValue ?? '') !== raw;
    case 'is': return raw === 'null' ? rowValue == null : String(rowValue ?? '') === raw;
    case 'lt': return String(rowValue) < raw;
    case 'gt': return String(rowValue) > raw;
    case 'lte': return String(rowValue) <= raw;
    case 'gte': return String(rowValue) >= raw;
    case 'like': return wildcard(String(rowValue ?? ''), raw, false);
    case 'ilike': return wildcard(String(rowValue ?? ''), raw, true);
    case 'in': {
      const list = raw.replace(/^\(|\)$/g, '').split(',').map((v) => v.trim());
      return list.includes(String(rowValue ?? ''));
    }
    default: return true;
  }
}

function wildcard(value, pattern, ci) {
  const hay = ci ? value.toLowerCase() : value;
  const needle = (ci ? pattern.toLowerCase() : pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`^${needle.replace(/\*/g, '.*').replace(/%/g, '.*').replace(/_/g, '.')}$`);
  return rx.test(hay);
}

function applyFilters(rows, params) {
  let out = rows;
  for (const [key, value] of params) {
    if (RESERVED.has(key)) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      out = out.filter((row) => matchesValue(row[key], v));
    }
  }
  // or=(a.ilike.%x%,b.ilike.%x%)
  const or = params.get('or');
  if (or) {
    const groups = or.replace(/^\(|\)$/g, '').split(',');
    out = out.filter((row) =>
      groups.some((expr) => {
        const idx = expr.indexOf('.');
        const col = expr.slice(0, idx);
        return matchesValue(row[col], expr.slice(idx + 1));
      })
    );
  }
  return out;
}

function applyOrder(rows, params) {
  const order = params.get('order');
  if (!order) return rows;
  const keys = order.split(',').map((chunk) => {
    const [field, ...mods] = chunk.split('.');
    return { field, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') };
  });
  return [...rows].sort((a, b) => {
    for (const { field, desc, nullsFirst } of keys) {
      const av = a[field];
      const bv = b[field];
      if (av == null && bv == null) continue;
      if (av == null) return nullsFirst ? -1 : 1;
      if (bv == null) return nullsFirst ? 1 : -1;
      if (av === bv) continue;
      const cmp = av > bv ? 1 : -1;
      return desc ? -cmp : cmp;
    }
    return 0;
  });
}

function projectColumns(rows, params) {
  const select = params.get('select');
  if (!select || select === '*' || select.includes('(')) return rows;
  const cols = select.split(',').map((c) => c.trim()).filter(Boolean);
  return rows.map((row) => Object.fromEntries(cols.map((c) => [c, row[c]])));
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function issueToken(user) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat, exp
  });
  return {
    access_token: `${header}.${payload}.demo-signature-not-cryptographic`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'demo-refresh-token',
    user
  };
}

function demoUser() {
  return {
    id: DEMO_ACCOUNT.userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: DEMO_ACCOUNT.email,
    email_confirmed_at: '2025-01-04T08:00:00Z',
    phone: '',
    confirmed_at: '2025-01-04T08:00:00Z',
    last_sign_in_at: nowIso(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: 'Demo Admin' },
    identities: [],
    created_at: '2025-01-04T08:00:00Z',
    updated_at: nowIso()
  };
}

/* -------------------------------------------------------------------------- */
/* HTTP plumbing                                                              */
/* -------------------------------------------------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Location',
    ...headers
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function wantsObject(req) {
  return String(req.headers.accept || '').includes('application/vnd.pgrst.object+json');
}

function tableOf(name) {
  if (!(name in db)) throw new Error(`unknown table "${name}"`);
  return db[name];
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                   */
/* -------------------------------------------------------------------------- */

async function handleRest(req, res, url) {
  const table = url.pathname.replace('/rest/v1/', '');
  const params = new URLSearchParams(url.search);

  if (!(table in db)) return sendJson(res, 404, { message: `relation "public.${table}" does not exist` });

  const rows = db[table];
  const method = req.method;

  if (method === 'GET' || method === 'HEAD') {
    let out = applyFilters(rows, params);
    const total = out.length;
    out = applyOrder(out, params);
    const limit = Number(params.get('limit') ?? NaN);
    const offset = Number(params.get('offset') ?? 0);
    if (Number.isFinite(limit)) out = out.slice(offset, offset + limit);
    else if (offset) out = out.slice(offset);
    out = projectColumns(out, params);

    const headers = {};
    if (String(req.headers.prefer || '').includes('count=exact')) {
      const rangeEnd = Number.isFinite(limit) ? Math.min(offset + limit - 1, total - 1) : total - 1;
      headers['Content-Range'] = `${offset}-${Math.max(rangeEnd, 0)}/${total}`;
    }
    if (wantsObject(req)) {
      if (out.length !== 1) {
        return sendJson(res, 406, {
          code: 'PGRST116',
          details: `Results contain ${out.length} rows, application/vnd.pgrst.object+json requires 1 row`,
          message: 'JSON object requested, multiple (or no) rows returned'
        }, headers);
      }
      return sendJson(res, 200, out[0], headers);
    }
    return sendJson(res, 200, out, headers);
  }

  if (method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '[]');
    const incoming = Array.isArray(body) ? body : [body];
    const upsert = String(req.headers.prefer || '').includes('resolution=merge-duplicates');
    const inserted = [];
    for (const raw of incoming) {
      const row = { ...raw };
      row.id = row.id || uuid();
      if (!('created_at' in row) && table !== 'site_settings' && table !== 'site_images') row.created_at = nowIso();
      if ('updated_at' in row || table !== 'site_settings') row.updated_at = row.updated_at || nowIso();
      const conflictKey = 'id' in row && rows.some((r) => r.id === row.id)
        ? 'id'
        : ('key' in row ? 'key' : 'id');
      if (upsert) {
        const idx = rows.findIndex((r) => (conflictKey === 'key' ? r.key === row.key : r.id === row.id));
        if (idx > -1) {
          rows[idx] = { ...rows[idx], ...row };
          inserted.push(rows[idx]);
          continue;
        }
      }
      rows.push(row);
      inserted.push(row);
    }
    if (!String(req.headers.prefer || '').includes('return=representation')) {
      res.writeHead(201, { 'Access-Control-Allow-Origin': '*' });
      return res.end();
    }
    const out = projectColumns(inserted, params);
    if (wantsObject(req)) return sendJson(res, 201, out[0] ?? null);
    return sendJson(res, 201, out);
  }

  if (method === 'PATCH') {
    const patch = JSON.parse((await readBody(req)).toString() || '{}');
    const targets = applyFilters(rows, params);
    for (const row of targets) Object.assign(row, patch, { updated_at: nowIso() });
    if (!String(req.headers.prefer || '').includes('return=representation')) {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      return res.end();
    }
    const out = projectColumns(targets, params);
    if (wantsObject(req)) return sendJson(res, 200, out[0] ?? null);
    return sendJson(res, 200, out);
  }

  if (method === 'DELETE') {
    const targets = new Set(applyFilters(rows, params));
    db[table] = rows.filter((row) => !targets.has(row));
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }

  return sendJson(res, 405, { message: `method ${method} not supported by the demo` });
}

async function handleAuth(req, res, url) {
  if (url.pathname === '/auth/v1/settings') {
    return sendJson(res, 200, { external: {}, disable_signup: true, mailer_autoconfirm: true });
  }
  if (url.pathname === '/auth/v1/token') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'refresh_token') return sendJson(res, 200, issueToken(demoUser()));
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (String(body.email || '').toLowerCase() !== DEMO_ACCOUNT.email || body.password !== DEMO_ACCOUNT.password) {
      return sendJson(res, 400, {
        code: 400,
        error: 'invalid_grant',
        error_description: 'Invalid login credentials'
      });
    }
    return sendJson(res, 200, issueToken(demoUser()));
  }
  if (url.pathname === '/auth/v1/user') {
    return sendJson(res, 200, demoUser());
  }
  if (url.pathname === '/auth/v1/logout') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  return sendJson(res, 404, { message: `demo auth: unsupported path ${url.pathname}` });
}

async function handleStorage(req, res, url) {
  // POST /storage/v1/object/<bucket>/<path>
  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/);
  if (req.method === 'POST' && url.pathname.startsWith('/storage/v1/object/')) {
    const [, bucket, name] = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/) || [];
    if (!bucket) return sendJson(res, 400, { message: 'bad storage path' });
    const body = await readBody(req);
    storage.set(`${bucket}/${name}`, body);
    return sendJson(res, 200, { Key: `${bucket}/${name}`, Id: uuid() });
  }
  if (req.method === 'GET' && match) {
    const [, bucket, name] = match;
    const file = storage.get(`${bucket}/${name}`);
    if (!file) return sendJson(res, 404, { message: 'Object not found' });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    return res.end(file);
  }
  return sendJson(res, 501, { message: 'demo storage: unsupported operation' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(SITE_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(SITE_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA-ish fallback for the admin hash routes
    const fallback = path.join(SITE_DIR, 'index.html');
    if (rel.startsWith('/admin') && fs.existsSync(path.join(SITE_DIR, 'admin', 'index.html'))) {
      return sendFile(res, path.join(SITE_DIR, 'admin', 'index.html'));
    }
    if (fs.existsSync(fallback)) return sendFile(res, fallback);
    return sendJson(res, 404, { message: `not found: ${rel}` });
  }
  return sendFile(res, file);
}

function sendFile(res, file) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const stat = fs.statSync(file);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(file).pipe(res);
}

/* -------------------------------------------------------------------------- */
/* Placeholder artwork                                                        */
/* -------------------------------------------------------------------------- */

const PALETTES = [
  ['#1f6feb', '#0b1d3a'], ['#d29922', '#2a1c05'], ['#3fb950', '#08240f'],
  ['#a371f7', '#1c1030'], ['#f85149', '#2a0c0b'], ['#39c5cf', '#04201f'],
  ['#db6d28', '#241004'], ['#8b949e', '#101418']
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic abstract artwork so every capture looks the same on re-run. */
function placeholderSvg(name, w = 1200, h = 800) {
  const seed = hash(name);
  const [accent] = PALETTES[seed % PALETTES.length];
  const [accent2, bg] = PALETTES[(seed >> 3) % PALETTES.length];
  const label = name.replace(/[-_]/g, ' ').toUpperCase();
  const blobs = Array.from({ length: 5 }, (_, i) => {
    const s = hash(`${name}:${i}`);
    const cx = (s % w);
    const cy = ((s >> 7) % h);
    const r = 120 + ((s >> 3) % 260);
    const fill = i % 2 ? accent : accent2;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="0.28" />`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}" />
      <stop offset="100%" stop-color="#05060a" />
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="60" /></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)" />
  <g filter="url(#soft)">${blobs}</g>
  <g stroke="#ffffff" stroke-opacity="0.07">
    ${Array.from({ length: 9 }, (_, i) => `<line x1="${(i + 1) * (w / 10)}" y1="0" x2="${(i + 1) * (w / 10)}" y2="${h}" />`).join('')}
    ${Array.from({ length: 6 }, (_, i) => `<line x1="0" y1="${(i + 1) * (h / 7)}" x2="${w}" y2="${(i + 1) * (h / 7)}" />`).join('')}
  </g>
  <text x="48" y="${h - 48}" fill="#ffffff" fill-opacity="0.45"
        font-family="ui-sans-serif, system-ui, sans-serif" font-size="28" letter-spacing="6">${label}</text>
</svg>`;
}

function ensurePlaceholders() {
  const dir = path.join(SITE_DIR, 'demo-img');
  fs.mkdirSync(dir, { recursive: true });

  const names = new Set();
  const collect = (rows, fields) => {
    for (const row of rows) {
      for (const f of fields) {
        const v = row[f];
        if (typeof v === 'string') {
          for (const m of v.matchAll(/\/demo-img\/([a-z0-9-]+)\.svg/gi)) names.add(m[1]);
        }
        if (v && typeof v === 'object') {
          for (const val of Object.values(v)) {
            if (typeof val === 'string') {
              for (const m of val.matchAll(/\/demo-img\/([a-z0-9-]+)\.svg/gi)) names.add(m[1]);
            }
          }
        }
        if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === 'string') {
              for (const m of item.matchAll(/\/demo-img\/([a-z0-9-]+)\.svg/gi)) names.add(m[1]);
            } else if (item && typeof item === 'object') {
              for (const val of Object.values(item)) {
                if (typeof val === 'string') {
                  for (const m of val.matchAll(/\/demo-img\/([a-z0-9-]+)\.svg/gi)) names.add(m[1]);
                }
              }
            }
          }
        }
      }
    }
  };

  for (const rows of Object.values(db)) collect(rows, Object.keys(rows[0] || {}));

  let written = 0;
  for (const name of names) {
    const file = path.join(dir, `${name}.svg`);
    const tall = /portrait|render|motion|photo/.test(name);
    const svg = placeholderSvg(name, tall ? 900 : 1200, tall ? 1200 : 800);
    fs.writeFileSync(file, svg);
    written += 1;
  }
  return written;
}

/* -------------------------------------------------------------------------- */
/* Server                                                                     */
/* -------------------------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
      'Access-Control-Max-Age': '600'
    });
    return res.end();
  }

  try {
    if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url);
    if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/storage/v1/')) return await handleStorage(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    console.error('[demo]', err);
    return sendJson(res, 500, { message: String(err && err.message ? err.message : err) });
  }
});

if (!fs.existsSync(path.join(SITE_DIR, 'index.html'))) {
  console.error(`\n[demo] no built site at ${SITE_DIR}`);
  console.error('[demo] run: npm run build && node demo/serve.mjs --site dist\n');
  process.exit(1);
}

const images = ensurePlaceholders();
server.listen(PORT, () => {
  console.log(`[demo] Supabase mock + static site on http://localhost:${PORT}`);
  console.log(`[demo] site:  ${SITE_DIR}`);
  console.log(`[demo] admin: http://localhost:${PORT}/admin/`);
  console.log(`[demo] login: ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`);
  console.log(`[demo] ${images} placeholder images in demo-img/`);
  console.log(`[demo] tables: ${Object.keys(db).join(', ')}`);
});