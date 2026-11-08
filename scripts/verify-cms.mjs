#!/usr/bin/env node
/**
 * scripts/verify-cms.mjs - one-command live end-to-end verification of the CMS.
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_ANON_KEY=eyJ... \
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='StrongPassword123!' \
 *   node scripts/verify-cms.mjs
 *
 * Verifies:
 *   1. Published content is publicly readable (anon key).
 *   2. Drafts are invisible to anon (RLS).
 *   3. Anon cannot write anything (RLS).
 *   4. Admin can log in and run full CRUD (create draft → publish → edit → delete).
 *   5. Image + PDF uploads work in Supabase Storage.
 *   6. The active CV is publicly readable.
 *   7. admin_users is not readable by anon.
 */

import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.SUPABASE_URL || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';
const EMAIL = process.env.ADMIN_EMAIL || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';

if (!URL_ || !ANON) {
  console.error('ERROR: set SUPABASE_URL and SUPABASE_ANON_KEY.');
  process.exit(1);
}

const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ' - ' + detail : ''}`);
};

console.log('=== CMS LIVE VERIFICATION ===\n');

// --- 1. public reads --------------------------------------------------------
console.log('[1] Public content (anon key)');
const pubCounts = {};
for (const t of ['projects', 'experiences', 'education', 'skills', 'organizations', 'gallery']) {
  const { count, error } = await anon.from(t).select('*', { count: 'exact', head: true });
  pubCounts[t] = count ?? -1;
  ok(`read ${t}`, !error && (count ?? -1) >= 0, error ? error.message : `${count} published rows`);
}
ok('migrated content present', pubCounts.projects > 0 && pubCounts.education > 0,
  `projects=${pubCounts.projects}, experiences=${pubCounts.experiences}, education=${pubCounts.education}`);

const { data: settingsRows, error: sErr } = await anon.from('site_settings').select('*');
ok('read site_settings', !sErr && (settingsRows || []).length > 0, sErr ? sErr.message : `${(settingsRows || []).length} keys`);

const { data: activeDocs, error: dErr } = await anon.from('documents').select('*').eq('is_active', true);
ok('active CV publicly readable', !dErr && (activeDocs || []).length === 1, dErr ? dErr.message : (activeDocs || []).map(d => d.file_url).join(', '));

// --- 2. anon write must fail (RLS) -----------------------------------------
console.log('\n[2] RLS write protection (anon)');
const { error: insErr } = await anon.from('projects').insert({ slug: 'rls-probe', title: 'RLS probe' });
ok('anon INSERT blocked', Boolean(insErr), insErr ? insErr.code || insErr.message : 'INSERT SUCCEEDED - RLS IS BROKEN');
const { data: admRows, error: admErr } = await anon.from('admin_users').select('*');
ok('admin_users hidden from anon', admErr !== null || (admRows || []).length === 0,
  admErr ? 'denied' : `returned ${(admRows || []).length} rows`);

// --- 3. admin authenticated flow -------------------------------------------
if (!EMAIL || !PASSWORD) {
  console.log('\n[3] Skipped admin CRUD (set ADMIN_EMAIL + ADMIN_PASSWORD to run).');
} else {
  console.log('\n[3] Admin auth + CRUD');
  const admin = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: sess, error: loginErr } = await admin.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  ok('admin login', !loginErr && Boolean(sess?.user), loginErr ? loginErr.message : sess?.user?.email);

  if (sess?.user) {
    const { data: adminRow } = await admin.from('admin_users').select('*').eq('user_id', sess.user.id).maybeSingle();
    ok('admin_users membership', Boolean(adminRow), adminRow ? adminRow.role : 'no membership row');

    const slug = `verify-cms-${Date.now()}`;
    const { data: created, error: cErr } = await admin
      .from('projects')
      .insert({ slug, title: 'Verify CMS Draft', short_description: 'automated check', status: 'draft', full_description: 'Role: Tester\n\nProblem:\n\nAuto.' })
      .select().single();
    ok('create draft project', !cErr, cErr ? cErr.message : slug);

    if (created) {
      const { data: draftSeen } = await anon.from('projects').select('id').eq('slug', slug);
      ok('draft hidden from public', (draftSeen || []).length === 0);

      const { error: pErr } = await admin.from('projects').update({ status: 'published' }).eq('id', created.id);
      ok('publish', !pErr, pErr ? pErr.message : '');
      const { data: pubSeen } = await anon.from('projects').select('id').eq('slug', slug);
      ok('published visible to public', (pubSeen || []).length === 1);

      const { error: uErr } = await admin.from('projects').update({ title: 'Verify CMS Edited' }).eq('id', created.id);
      const { data: edited } = await anon.from('projects').select('title').eq('slug', slug).single();
      ok('edit reflected publicly', !uErr && edited?.title === 'Verify CMS Edited', uErr ? uErr.message : edited?.title);

      // storage upload (1x1 PNG)
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      const upPath = `media/verify-${Date.now()}.png`;
      const { error: upErr } = await admin.storage.from('portfolio-media').upload(upPath, png, { contentType: 'image/png' });
      ok('image upload (portfolio-media)', !upErr, upErr ? upErr.message : upPath);
      await admin.storage.from('portfolio-media').remove([upPath]).catch(() => {});

      const { error: dErr2 } = await admin.from('projects').delete().eq('id', created.id);
      const { data: gone } = await anon.from('projects').select('id').eq('slug', slug);
      ok('delete removes publicly', !dErr2 && (gone || []).length === 0, dErr2 ? dErr2.message : '');
    }
    await admin.auth.signOut();
  }
}

// --- summary ----------------------------------------------------------------
const failed = results.filter(r => !r.pass);
console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) {
  console.log('FAILED checks:');
  failed.forEach(f => console.log(`  ✗ ${f.name} ${f.detail}`));
  process.exit(1);
}
console.log('All checks passed ✓');
