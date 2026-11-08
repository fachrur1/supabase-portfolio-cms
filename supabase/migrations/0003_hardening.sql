-- ============================================================================
-- 0003_hardening.sql - security-hardening pass (independent code review).
-- Safe to run once after 0001+0002 (idempotent). Run in the Supabase SQL editor.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. TRUNCATE/REFERENCES bypass RLS - remove them from client roles.
--    (PostgreSQL: "Operations that apply to the whole table, such as TRUNCATE
--    and REFERENCES, are not subject to row security.")
-- ---------------------------------------------------------------------------
revoke truncate, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public
  revoke truncate, references on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. site_settings: restrict public read to the known public keys so future
--    private settings can never leak to anonymous visitors.
-- ---------------------------------------------------------------------------
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated
  using (key in ('text_alignment', 'contact_heading', 'contact_body', 'contact_email', 'site_title', 'meta_description'));

-- ---------------------------------------------------------------------------
-- 3. is_admin(): pin search_path to empty (body is fully qualified).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

commit;
