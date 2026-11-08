// scripts/recover-orphan-media.mjs
//
// The old admin sync (delete-all + insert-what-the-form-had) could wipe a
// project's documentation rows while the uploaded FILES stayed in Storage.
// This script finds those orphans and proposes where they came from, using:
//   • the epoch-ms prefix Supabase Storage writes into every uploaded name,
//   • the time window of each project's surviving media rows,
//   • filename keywords (kesesuaian/pltmh → thesis, scafolding/tugas → internship, …).
//
//   node scripts/recover-orphan-media.mjs                 # report + proposals
//   node scripts/recover-orphan-media.mjs --write         # attach the CONFIDENT ones
//   node scripts/recover-orphan-media.mjs --write --only <slug>
//
// Originals are written to backups/media-recovery-<stamp>.json before writing.

import fs from 'fs';

const WRITE = process.argv.includes('--write');
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i > -1 ? process.argv[i + 1] : null;
})();

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const BUCKET = 'portfolio-media';
const WINDOW_MS = 60 * 60 * 1000; // 1 h

const KEYWORDS = [
  { re: /kesesuaian|pltmh|pltb|pltbm|_plot_|raster|dem/i, slug: 'undergraduate-thesis-research' },
  { re: /scafolding|tugas_h\d|cuplikan|whatsapp_image_2026-11-03/i, slug: 'internship-pt-jasa-kita-bersama-2025' },
  { re: /nala/i, slug: null }, // ambiguous: pikiran 2023 vs 2024 vs pionir
];

async function listBucket(prefix, all = [], depth = 0) {
  const res = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  const rows = await res.json();
  if (!Array.isArray(rows)) return all;
  for (const row of rows) {
    const full = prefix ? `${prefix}/${row.name}` : row.name;
    if (row.id === null || row.metadata === null) { if (depth < 3) await listBucket(full, all, depth + 1); }
    else all.push({ path: full, size: row.metadata?.size || 0 });
  }
  return all;
}

const stampOf = (s) => {
  const m = String(s).match(/(\d{13})/);
  return m ? Number(m[1]) : null;
};
const publicUrl = (p) => `${url}/storage/v1/object/public/${BUCKET}/${p}`;

const files = (await listBucket('media')).filter((f) => f.path !== 'media');
const projects = await (await fetch(`${url}/rest/v1/projects?select=id,slug,title,cover_url,thumbnail_url&order=sort_order.asc`, { headers: H })).json();
const media = await (await fetch(`${url}/rest/v1/project_media?select=id,project_id,url,sort_order`, { headers: H })).json();

const referenced = new Set();
const ref = (u) => { if (typeof u === 'string' && u.includes('/media/')) referenced.add(decodeURIComponent(u.split('/media/').pop())); };
media.forEach((m) => ref(m.url));
projects.forEach((p) => { ref(p.cover_url); ref(p.thumbnail_url); });

const byProject = new Map();
for (const m of media) {
  if (!byProject.has(m.project_id)) byProject.set(m.project_id, []);
  byProject.get(m.project_id).push(m);
}

const orphans = files
  .filter((f) => !referenced.has(f.path.replace(/^media\//, '')))
  .map((f) => ({ ...f, ts: stampOf(f.path), name: f.path.split('/').pop() }))
  .filter((f) => f.ts)
  .sort((a, b) => a.ts - b.ts);

// Uploads often repeat the same file with a fresh timestamp; keep one copy per
// logical filename so the recovered gallery is not full of duplicates.
const seenNames = new Set();
const deduped = orphans.filter((o) => {
  const key = o.name.replace(/^\d{13}-/, '').toLowerCase();
  if (seenNames.has(key)) return false;
  seenNames.add(key);
  return true;
});
const dropped = orphans.length - deduped.length;
if (dropped) console.log(`(deduplicated ${dropped} repeated upload(s))\n`);

/** Nearest project by survival window, plus keyword override. */
function suggest(orphan) {
  let best = null;
  for (const project of projects) {
    const rows = byProject.get(project.id) || [];
    const times = rows.map((r) => stampOf(r.url)).filter(Boolean);
    if (!times.length) continue;
    const nearest = times.reduce((acc, t) => (Math.abs(t - orphan.ts) < Math.abs(acc - orphan.ts) ? t : acc), times[0]);
    const delta = Math.abs(nearest - orphan.ts);
    if (delta <= WINDOW_MS && (!best || delta < best.delta)) best = { project, delta };
  }
  const kw = KEYWORDS.find((k) => k.re.test(orphan.name) && k.slug);
  if (kw) {
    const project = projects.find((p) => p.slug === kw.slug);
    if (project) return { project, delta: best ? best.delta : null, reason: 'filename' };
  }
  if (best) return { ...best, reason: 'time-window' };
  return { project: null, delta: null, reason: 'unassigned' };
}

const proposals = deduped.map((o) => ({ orphan: o, ...suggest(o) }));

console.log(`storage files: ${files.length} · referenced: ${referenced.size} · orphaned: ${orphans.length}\n`);
const grouped = new Map();
for (const p of proposals) {
  const slug = p.project ? p.project.slug : '(unassigned)';
  if (!grouped.has(slug)) grouped.set(slug, []);
  grouped.get(slug).push(p);
}
for (const [slug, list] of grouped) {
  const size = Math.round(list.reduce((n, p) => n + p.orphan.size, 0) / 1024);
  console.log(`${slug} - ${list.length} file(s), ${size} kB · reason: ${list[0].reason}`);
  for (const p of list.slice(0, 30)) {
    const when = new Date(p.orphan.ts).toISOString().replace('T', ' ').slice(0, 16);
    console.log(`   ${when}  ${p.orphan.name.slice(0, 62)}  (${Math.round(p.orphan.size / 1024)} kB)`);
  }
  if (list.length > 30) console.log(`   … ${list.length - 30} more`);
  console.log('');
}

if (!WRITE) {
  console.log('DRY RUN - nothing written. Re-run with --write to append the grouped files to each project gallery.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `backups/media-recovery-${stamp}.json`;
fs.mkdirSync('backups', { recursive: true });
fs.writeFileSync(backupFile, JSON.stringify({ media, projects }, null, 2));

let attached = 0;
for (const [slug, list] of grouped) {
  if (slug === '(unassigned)') { console.log(`skip ${slug}: ${list.length} file(s) need a manual home`); continue; }
  if (ONLY && slug !== ONLY) continue;
  const project = projects.find((p) => p.slug === slug);
  const existing = (byProject.get(project.id) || []).sort((a, b) => a.sort_order - b.sort_order);
  const usedUrls = new Set(existing.map((r) => r.url));
  const nextOrder = existing.length ? Math.max(...existing.map((r) => r.sort_order)) + 1 : 0;
  const rows = list
    .map((p) => publicUrl(p.orphan.path))
    .filter((u) => !usedUrls.has(u))
    .map((u, i) => ({ project_id: project.id, url: u, caption: '', alt: '', sort_order: nextOrder + i }));
  if (!rows.length) continue;
  const res = await fetch(`${url}/rest/v1/project_media`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  console.log(`attach ${slug}: ${res.status} (+${rows.length})`);
  if (!res.ok) console.log('  ', (await res.text()).slice(0, 200));
  else attached += rows.length;
}
console.log(`\nattached ${attached} row(s). Originals saved to ${backupFile}`);
