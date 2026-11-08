#!/usr/bin/env node
/**
 * scripts/bootstrap-admin.mjs - securely create the FIRST administrator.
 *
 * Run ONCE from your own machine after the SQL migrations:
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/bootstrap-admin.mjs you@example.com 'StrongPassword123!'
 *
 * The service-role key is used only here (server-side), never in the browser.
 * There is NO public registration path: admin access is granted exclusively
 * through this script (or the Supabase SQL editor) via the admin_users table.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const email = process.argv[2] || process.env.ADMIN_EMAIL || '';
// Password via ADMIN_PASSWORD env (preferred) - argv keeps it out of shell
// history is NOT guaranteed, so env avoids process-list exposure entirely.
const password = process.env.ADMIN_PASSWORD || process.argv[3] || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: ADMIN_PASSWORD=... node scripts/bootstrap-admin.mjs <email>');
  process.exit(1);
}
if (password.length < 12) {
  console.error('ERROR: password must be at least 12 characters.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  // 1. Find or create the auth user
  let userId = null;
  const { data: users, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);
  const existing = users.users.find(u => u.email === email);

  if (existing) {
    userId = existing.id;
    console.log(`User ${email} already exists (${userId}) - granting admin role.`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    userId = data.user.id;
    console.log(`Created user ${email} (${userId}).`);
  }

  // 2. Grant admin role (idempotent)
  const { error: upErr } = await supabase
    .from('admin_users')
    .upsert({ user_id: userId, role: 'admin' }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (upErr) throw new Error(`admin_users: ${upErr.message}`);

  console.log('\nDone ✓ Admin account ready.');
  console.log(`  Login: ${email}`);
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
  console.log(`  Dashboard: ${siteUrl ? `${siteUrl}/admin` : '/admin on your deployed site'}`);
  console.log('\nReminder: disable "Sign ups" in Supabase → Authentication → Providers → Email.');
}

main().catch(err => {
  console.error('BOOTSTRAP FAILED:', err.message);
  process.exit(1);
});
