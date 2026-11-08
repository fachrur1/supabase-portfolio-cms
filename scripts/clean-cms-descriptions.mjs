// scripts/clean-cms-descriptions.mjs
//
// Removes WYSIWYG paste artifacts ("List item…", "Heading…") from CMS text
// fields and gives Key Learnings items a real markdown bullet.
//
//   node scripts/clean-cms-descriptions.mjs          # dry run, report only
//   node scripts/clean-cms-descriptions.mjs --write  # apply + backup originals
//
// Only rows whose text actually contains an artifact (or a bare Key Learnings
// line) are patched; formatting-only whitespace differences are ignored.
import fs from 'fs';

const WRITE = process.argv.includes('--write');

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env');
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const PASTE_LABEL = /^(?:heading\s*[1-6]?|list\s+item|bullet\s+point|bullet|numbered\s+list|normal\s+text|paragraph|subtitle)(?=[A-Z0-9("'“‘])/i;
const PASTE_LABEL_ONLY = /^(?:heading\s*[1-6]?|list\s+item|bullet\s+point|bullet|numbered\s+list|normal\s+text|paragraph|subtitle)\s*$/i;

/** @returns {{text: string, removed: number}} */
function cleanArtifacts(text) {
  let removed = 0;
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map(line => {
    const prefix = (line.match(/^\s*#{1,6}\s+/) || [''])[0];
    let body = prefix ? line.slice(prefix.length) : line;
    if (PASTE_LABEL_ONLY.test(body.trim())) { removed++; return ''; }
    if (PASTE_LABEL.test(body)) { removed++; body = body.replace(PASTE_LABEL, ''); }
    return prefix + body.replace(/[ \t]+$/, '');
  });
  return { text: lines.join('\n'), removed };
}

/** Give bare lines inside a Key Learnings block a markdown bullet. */
function bulletizeKeyLearnings(text) {
  const lines = String(text).split('\n');
  const out = [];
  let inBlock = false;
  let added = 0;

  for (const line of lines) {
    const t = line.trim();
    const isKeyHeader = /^key\s+learnings?\s*:?\s*$/i
      .test(t.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, ''));

    if (isKeyHeader) { inBlock = true; out.push(line); continue; }

    // Any new header / rule / bold title / long prose line ends the block.
    const endsBlock = /^#{1,6}\s/.test(t)
      || /^(?:[-*_]\s*){3,}$/.test(t)
      || /^\*\*[^*]+\*\*:?$/.test(t)
      || (/[:：]\s*$/.test(t) && t.length <= 48)
      || t.length > 140;

    if (inBlock && endsBlock) { inBlock = false; out.push(line); continue; }

    if (inBlock && t && !/^([-*+]|\d+[.)])\s+/.test(t)) {
      added++;
      out.push('- ' + t);
      continue;
    }
    out.push(line);
  }
  return { text: out.join('\n'), added };
}

const tables = [
  { table: 'projects', fields: ['full_description', 'methodology', 'project_outcomes', 'key_achievements'] },
  { table: 'experiences', fields: ['description', 'responsibilities', 'achievements'] }
];

const backup = {};
let patched = 0;

for (const { table, fields } of tables) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id,slug,${fields.join(',')}`, { headers });
  const rows = await res.json();
  if (!Array.isArray(rows)) { console.log('FETCH FAILED', table, JSON.stringify(rows).slice(0, 200)); continue; }
  backup[table] = [];

  for (const row of rows) {
    const patch = {};
    for (const field of fields) {
      const before = row[field];
      if (!before) continue;

      const cleaned = cleanArtifacts(before);
      const bullets = bulletizeKeyLearnings(cleaned.text);
      const after = bullets.text.replace(/\n{3,}/g, '\n\n').trim();

      if (cleaned.removed === 0 && bullets.added === 0) continue;
      patch[field] = after;
      console.log(`  ${table}/${row.slug} → ${field}: ${cleaned.removed} artifact line(s), ${bullets.added} bullet(s) added`);
    }

    const changed = Object.keys(patch);
    if (!changed.length) continue;
    patched++;
    if (process.argv.includes('--show')) {
      for (const f of changed) {
        console.log(`\n----- ${table}/${row.slug} :: ${f} (cleaned) -----`);
        console.log(patch[f]);
        console.log('----- end -----\n');
      }
    }
    backup[table].push({ id: row.id, slug: row.slug, ...Object.fromEntries(changed.map(f => [f, row[f]])) });

    if (WRITE) {
      const r = await fetch(`${url}/rest/v1/${table}?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(patch)
      });
      const body = await r.json();
      console.log(`    PATCH ${r.status} ${Array.isArray(body) ? `updated ${body.length} row` : JSON.stringify(body).slice(0, 160)}`);
    }
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = `backups/cms-descriptions-${stamp}.json`;
fs.mkdirSync('backups', { recursive: true });
fs.writeFileSync(file, JSON.stringify(backup, null, 2));

console.log(`\nrows needing changes: ${patched}`);
console.log('original values saved to', file);
console.log(WRITE ? 'WRITE MODE: patches applied' : 'DRY RUN: nothing written (re-run with --write)');
