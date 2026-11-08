-- ============================================================================
-- 0002_rls.sql - Row Level Security + Storage policies
-- Target: Supabase (run AFTER 0001_schema.sql)
--
-- Security model:
--   * Anonymous visitors: SELECT on published content only. Drafts are
--     invisible at the database level - no application filter can leak them.
--   * Administrators (rows in public.admin_users): full CRUD.
--   * No public registration path exists: writing to admin_users requires the
--     service role (server-side bootstrap script / SQL editor), and Supabase
--     Auth "Sign ups" should be disabled (see CMS_SETUP.md).
--   * Uploads: images <= 10 MB into portfolio-media, PDF <= 20 MB into documents.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Grants (RLS below decides which rows are visible)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon;
grant select on all tables in schema public to anon;      -- filtered by RLS
grant all on all tables in schema public to authenticated; -- filtered by RLS

alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant all on tables to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table public.admin_users       enable row level security;
alter table public.content_categories enable row level security;
alter table public.profiles          enable row level security;
alter table public.site_images       enable row level security;
alter table public.projects          enable row level security;
alter table public.project_media     enable row level security;
alter table public.experiences       enable row level security;
alter table public.education         enable row level security;
alter table public.skills            enable row level security;
alter table public.organizations     enable row level security;
alter table public.gallery           enable row level security;
alter table public.documents         enable row level security;
alter table public.social_links      enable row level security;
alter table public.site_settings     enable row level security;

-- ---------------------------------------------------------------------------
-- admin_users: only admins may read the list; writes require service role
-- (bootstrap script) or SQL editor - deliberately no INSERT policy.
-- ---------------------------------------------------------------------------
drop policy if exists admin_users_select on public.admin_users;
create policy admin_users_select on public.admin_users
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- content_categories: public read, admin write
-- ---------------------------------------------------------------------------
drop policy if exists categories_public_read on public.content_categories;
create policy categories_public_read on public.content_categories
  for select to anon, authenticated
  using (true);

drop policy if exists categories_admin_write on public.content_categories;
create policy categories_admin_write on public.content_categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- profiles: public read of the published profile, admin write
-- ---------------------------------------------------------------------------
drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists site_images_public_read on public.site_images;
create policy site_images_public_read on public.site_images
  for select to anon, authenticated
  using (true);

drop policy if exists site_images_admin_write on public.site_images;
create policy site_images_admin_write on public.site_images
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- projects: public read of published only, admin write
-- ---------------------------------------------------------------------------
drop policy if exists projects_public_read on public.projects;
create policy projects_public_read on public.projects
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists projects_admin_write on public.projects;
create policy projects_admin_write on public.projects
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists project_media_public_read on public.project_media;
create policy project_media_public_read on public.project_media
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and (p.status = 'published' or public.is_admin())
    )
  );

drop policy if exists project_media_admin_write on public.project_media;
create policy project_media_admin_write on public.project_media
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- experiences / education / organizations / gallery / skills: same pattern
-- ---------------------------------------------------------------------------
drop policy if exists experiences_public_read on public.experiences;
create policy experiences_public_read on public.experiences
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists experiences_admin_write on public.experiences;
create policy experiences_admin_write on public.experiences
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists education_public_read on public.education;
create policy education_public_read on public.education
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists education_admin_write on public.education;
create policy education_admin_write on public.education
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists skills_public_read on public.skills;
create policy skills_public_read on public.skills
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists skills_admin_write on public.skills;
create policy skills_admin_write on public.skills
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists organizations_public_read on public.organizations;
create policy organizations_public_read on public.organizations
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists organizations_admin_write on public.organizations;
create policy organizations_admin_write on public.organizations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists gallery_public_read on public.gallery;
create policy gallery_public_read on public.gallery
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists gallery_admin_write on public.gallery;
create policy gallery_admin_write on public.gallery
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- documents: the ACTIVE document is public (Download CV button); admins see all
-- ---------------------------------------------------------------------------
drop policy if exists documents_public_read on public.documents;
create policy documents_public_read on public.documents
  for select to anon, authenticated
  using (is_active or public.is_admin());

drop policy if exists documents_admin_write on public.documents;
create policy documents_admin_write on public.documents
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- social_links / site_settings: public read, admin write
-- ---------------------------------------------------------------------------
drop policy if exists social_links_public_read on public.social_links;
create policy social_links_public_read on public.social_links
  for select to anon, authenticated
  using (visible or public.is_admin());

drop policy if exists social_links_admin_write on public.social_links;
create policy social_links_admin_write on public.social_links
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated
  using (true);

drop policy if exists site_settings_admin_write on public.site_settings;
create policy site_settings_admin_write on public.site_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- Storage buckets + policies
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('portfolio-media', 'portfolio-media', true),
       ('documents', 'documents', true)
on conflict (id) do nothing;

-- Public read of uploaded media (URLs are referenced by the public site)
drop policy if exists storage_public_read on storage.objects;
drop policy if exists storage_public_read on storage.objects;
create policy storage_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('portfolio-media', 'documents'));

-- Image uploads: admins only, image mime types, <= 10 MB
drop policy if exists storage_media_insert on storage.objects;
drop policy if exists storage_media_insert on storage.objects;
create policy storage_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'portfolio-media'
    and public.is_admin()
    and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif')
    and (metadata->>'size')::bigint <= 10 * 1024 * 1024
  );

drop policy if exists storage_media_update on storage.objects;
drop policy if exists storage_media_update on storage.objects;
create policy storage_media_update on storage.objects
  for update to authenticated
  using (bucket_id = 'portfolio-media' and public.is_admin())
  with check (
    bucket_id = 'portfolio-media'
    and public.is_admin()
    and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif')
    and (metadata->>'size')::bigint <= 10 * 1024 * 1024
  );

drop policy if exists storage_media_delete on storage.objects;
drop policy if exists storage_media_delete on storage.objects;
create policy storage_media_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'portfolio-media' and public.is_admin());

-- Document uploads: admins only, PDF only, <= 20 MB
drop policy if exists storage_docs_insert on storage.objects;
drop policy if exists storage_docs_insert on storage.objects;
create policy storage_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.is_admin()
    and (metadata->>'mimetype') = 'application/pdf'
    and (metadata->>'size')::bigint <= 20 * 1024 * 1024
  );

drop policy if exists storage_docs_update on storage.objects;
drop policy if exists storage_docs_update on storage.objects;
create policy storage_docs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public.is_admin())
  with check (
    bucket_id = 'documents'
    and public.is_admin()
    and (metadata->>'mimetype') = 'application/pdf'
    and (metadata->>'size')::bigint <= 20 * 1024 * 1024
  );

drop policy if exists storage_docs_delete on storage.objects;
drop policy if exists storage_docs_delete on storage.objects;
create policy storage_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());
