/**
 * scripts/repair-tag-fields.mjs
 *
 * The admin's payload builder mapped `tags` fields through the gallery branch,
 * so ["Blender"] was stored as [{url:"",caption:"",alt:""}] and the site printed
 * "[object Object]". This restores those columns to plain string arrays, using
 * the original markdown frontmatter where it still exists.
 *
 *   node scripts/repair-tag-fields.mjs            # dry run
 *   node scripts/repair-tag-fields.mjs --write    # apply (backup first)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const URL_ = /SUPABASE_URL=(.*)/.exec(env)[1].trim();
const KEY = /SUPABASE_SERVICE_ROLE_KEY=(.*)/.exec(env)[1].trim();
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

const TARGETS = [
  ['projects', ['technologies', 'tools', 'technical_skills']],
  ['experiences', ['skills', 'technologies', 'tools']],
  ['education', ['relevant_coursework']],
  ['skills', ['related_projects']],
  ['organizations', ['related_experiences']],
  ['motion_media', ['software']],
  ['render_3d', ['software']],
];

/* ----------------------------------------------------------- frontmatter */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function parseFrontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i += 1) {
    const kv = /^([a-z_]+):\s*(.*)$/i.exec(lines[i].trim());
    if (!kv) continue;
    const [, key, raw] = kv;
    const value = raw.trim();

    if (value.startsWith('[') && !value.endsWith(']')) {
      // Multi-line flow sequence:  tools: [\n  "QGIS",\n  "LEAP"\n]
      const collected = [value.slice(1)];
      while (i + 1 < lines.length && !collected[collected.length - 1].trim().endsWith(']')) {
        i += 1;
        collected.push(lines[i]);
      }
      out[key] = splitList(collected.join(' ').replace(/\]\s*$/, ''));
    } else if (value.startsWith('[')) {
      out[key] = splitList(value.replace(/^\[|\]$/g, ''));
    } else if (value === '') {
      // Block sequence:  tools:\n  - "QGIS"\n  - "LEAP"
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(lines[j].replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, ''));
        j += 1;
      }
      if (items.length) {
        out[key] = items.filter(Boolean);
        i = j - 1;
      } else {
        out[key] = '';
      }
    } else {
      out[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

function splitList(raw) {
  return raw
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

const fmByTitle = new Map();
const contentDir = path.join(ROOT, 'content');
if (fs.existsSync(contentDir)) {
  for (const file of walk(contentDir)) {
    const fm = parseFrontmatter(file);
    if (!fm || !fm.title) continue;
    fmByTitle.set(norm(fm.title), fm);
  }
}
console.log(`frontmatter entries: ${fmByTitle.size}`);

/* --------------------------------------------------------------- helpers */

const labelOf = (v) => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (!v || typeof v !== 'object') return '';
  for (const k of ['value', 'label', 'name', 'title', 'text', 'tag']) {
    if (typeof v[k] === 'string' && v[k].trim()) return v[k].trim();
  }
  return '';
};

const isCorrupt = (arr) => Array.isArray(arr) && arr.some((v) => v && typeof v === 'object');

/* ------------------------------------------------------------------ main */

const backup = { at: new Date().toISOString(), rows: [] };

for (const [table, columns] of TARGETS) {
  const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, { headers: H });
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    console.log(`skip ${table}: ${res.status}`);
    continue;
  }

  for (const row of rows) {
    const patch = {};
    for (const column of columns) {
      const current = row[column];
      if (!isCorrupt(current)) continue;

      // 1. keep any label we can still read out of the damaged objects
      const salvaged = current.map(labelOf).filter(Boolean);

      // 2. otherwise fall back to the original markdown frontmatter
      let restored = salvaged;
      if (!restored.length) {
        const fm = fmByTitle.get(norm(row.title || row.name));
        if (fm) {
          const source = fm[column]
            || (column === 'technologies' ? fm.tools : null)
            || (column === 'tools' ? fm.technologies : null);
          if (Array.isArray(source)) restored = source.filter((s) => typeof s === 'string' && s.trim());
          // "Focus" lives as a comma-separated string in the markdown.
          else if (column === 'technical_skills' && typeof fm.focus === 'string') {
            restored = fm.focus.split(',').map((s) => s.trim()).filter(Boolean);
          }
        }
      }

      patch[column] = restored;
      console.log(
        `${WRITE ? 'fix ' : 'would fix'} ${table}.${column} «${String(row.title || row.name || row.id).slice(0, 44)}» ` +
          `${JSON.stringify(current).slice(0, 40)}… -> ${JSON.stringify(restored)}` +
          (restored.length ? '' : '   [NO SOURCE - left empty]')
      );
      backup.rows.push({ table, id: row.id, title: row.title || row.name || '', column, before: current, after: restored });
    }

    if (Object.keys(patch).length) {
      if (WRITE) {
        const up = await fetch(`${URL_}/rest/v1/${table}?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify(patch),
        });
        if (up.status >= 300) console.log('  !! update failed', up.status, (await up.text()).slice(0, 120));
      }
    }
  }
}

if (backup.rows.length) {
  const dir = path.join(ROOT, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `tag-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`\nbackup: ${path.relative(ROOT, file)}`);
}
console.log(WRITE ? '\napplied.' : '\ndry run - re-run with --write to apply.');
