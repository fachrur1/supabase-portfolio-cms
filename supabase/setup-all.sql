-- ============================================================================
-- setup-all.sql  (generated: concatenation of supabase/migrations/*.sql)
--
-- Paste this whole file into the Supabase SQL editor, then run it once.
-- Every migration is idempotent, so re-running after a partial failure is safe.
-- ============================================================================

-- >>> 0001_schema.sql
-- ============================================================================
-- 0001_schema.sql - Portfolio CMS database schema
-- Target: Supabase (PostgreSQL 15+)
-- Run in the Supabase SQL editor (or `supabase db push`) BEFORE 0002_rls.sql.
--
-- Design notes:
--   * Every content table carries: created_at, updated_at, status ('draft'|'published'),
--     and sort_order for custom display ordering.
--   * 'draft' rows must never appear publicly - enforced by RLS in 0002_rls.sql,
--     not only by application code.
--   * Rich text fields are Markdown (the public renderer already parses Markdown
--     with marked.js).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- updated_at trigger used by every content table
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Admin check used by RLS policies (security definer so policies can read
-- admin_users without recursive RLS).
-- ---------------------------------------------------------------------------
-- Admin users (authorization source of truth)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'admin' check (role in ('admin', 'editor')),
  created_at  timestamptz not null default now()
);

comment on table public.admin_users is
  'Allow-list of authenticated users permitted to manage portfolio content.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- Slug helper (used by the admin app conventions; kept in DB for seeds/scripts)
create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(input), '[^a-z0-9]+', '-', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Content categories (projects, skill groups, gallery, ...) - managed at runtime
-- ---------------------------------------------------------------------------
create table if not exists public.content_categories (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('project', 'skill_group', 'gallery', 'experience', 'organization')),
  name        text not null,
  slug        text not null,
  icon        text,                       -- material-symbols icon name (skill groups)
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (kind, slug)
);

drop trigger if exists set_updated_at on public.content_categories;
create trigger set_updated_at before update on public.content_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles (hero + about) - single primary row
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key default gen_random_uuid(),
  full_name            text not null default '',
  hero_line1           text not null default '',
  hero_line2           text not null default '',
  professional_headline text not null default '',
  short_intro          text not null default '',   -- hero typewriter line
  about_heading        text not null default '',
  about_body           text not null default '',   -- markdown
  profile_photo_url    text,
  profile_photo_alt    text not null default '',
  professional_interests jsonb not null default '[]'::jsonb,  -- text[]
  areas_of_expertise   jsonb not null default '[]'::jsonb,    -- text[]
  location             text not null default '',
  availability_status  text not null default '',
  is_primary           boolean not null default false,
  status               text not null default 'published' check (status in ('draft', 'published')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists profiles_single_primary on public.profiles (is_primary) where is_primary;
drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Projects (core module)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  short_description text not null default '',
  full_description text not null default '',      -- markdown body
  category_id     uuid references public.content_categories (id) on delete set null,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  start_date      date,
  completion_date date,
  location        text not null default '',
  role            text not null default '',
  team            text not null default '',
  technologies    jsonb not null default '[]'::jsonb,   -- text[]
  tools           jsonb not null default '[]'::jsonb,   -- text[]
  technical_skills jsonb not null default '[]'::jsonb,  -- text[]
  methodology           text not null default '',       -- markdown
  technical_specifications text not null default '',    -- markdown
  key_achievements      text not null default '',       -- markdown
  project_outcomes      text not null default '',       -- markdown
  thumbnail_url   text,
  thumbnail_alt   text not null default '',
  cover_url       text,
  cover_alt       text not null default '',
  video_url       text,
  live_url        text,
  github_url      text,
  documentation_url text,
  publication_url text,
  related_resources jsonb not null default '[]'::jsonb, -- [{label, url}]
  featured        boolean not null default false,
  include_in_works boolean not null default true,       -- show on the public Works carousel
  display_priority integer not null default 0,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists projects_status_sort on public.projects (status, sort_order, created_at desc);
create index if not exists projects_category on public.projects (category_id);
drop trigger if exists set_updated_at on public.projects;
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- Project gallery images (one row per image; ordered)
create table if not exists public.project_media (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  url         text not null,
  caption     text not null default '',
  alt         text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists project_media_project on public.project_media (project_id, sort_order);

-- ---------------------------------------------------------------------------
-- Experiences (work, internships, research, freelance)
-- ---------------------------------------------------------------------------
create table if not exists public.experiences (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  title              text not null default '',  -- optional display title override
                     -- (public site defaults to "Organization - Position")
  organization_name  text not null,
  position           text not null,
  short_description  text not null default '',
  employment_type    text not null default '',   -- Full-time, Internship, Part-time, Freelance, Volunteer
  location           text not null default '',
  start_date         date,
  end_date           date,
  currently_working  boolean not null default false,
  description        text not null default '',   -- markdown
  responsibilities   text not null default '',   -- markdown
  achievements       text not null default '',   -- markdown
  skills             jsonb not null default '[]'::jsonb,   -- text[]
  logo_url           text,
  media              jsonb not null default '[]'::jsonb,   -- [{url, caption, alt}]
  external_links     jsonb not null default '[]'::jsonb,   -- [{label, url}]
  include_in_works   boolean not null default false,
  display_priority   integer not null default 0,
  sort_order         integer not null default 0,
  status             text not null default 'draft' check (status in ('draft', 'published')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists experiences_status_sort on public.experiences (status, sort_order, created_at desc);
drop trigger if exists set_updated_at on public.experiences;
create trigger set_updated_at before update on public.experiences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Education
-- ---------------------------------------------------------------------------
create table if not exists public.education (
  id               uuid primary key default gen_random_uuid(),
  institution      text not null,
  degree           text not null default '',
  field_of_study   text not null default '',
  start_date       date,
  graduation_date  date,
  description      text not null default '',   -- markdown
  achievements     text not null default '',   -- markdown
  relevant_coursework jsonb not null default '[]'::jsonb,  -- text[]
  logo_url         text,
  documents        jsonb not null default '[]'::jsonb,     -- [{label, url}]
  display_order    integer not null default 0,
  status           text not null default 'draft' check (status in ('draft', 'published')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists education_status_sort on public.education (status, display_order, created_at desc);
drop trigger if exists set_updated_at on public.education;
create trigger set_updated_at before update on public.education
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Skills (grouped by content_categories(kind='skill_group'))
-- ---------------------------------------------------------------------------
create table if not exists public.skills (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  category_id        uuid references public.content_categories (id) on delete set null,
  proficiency_level  text check (proficiency_level in ('beginner', 'intermediate', 'advanced', 'expert')),
  proficiency_percent integer check (proficiency_percent between 0 and 100),
  show_proficiency   boolean not null default false,   -- percentages hidden unless explicitly enabled
  description        text not null default '',
  icon_url           text,
  related_projects   jsonb not null default '[]'::jsonb, -- project uuids
  sort_order         integer not null default 0,
  status             text not null default 'draft' check (status in ('draft', 'published')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists skills_status_sort on public.skills (status, sort_order, created_at desc);
create index if not exists skills_category on public.skills (category_id);
drop trigger if exists set_updated_at on public.skills;
create trigger set_updated_at before update on public.skills
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  organization_name text not null,
  position          text not null default '',
  organization_type text not null default '',   -- Student organization, NGO, Community, Professional
  description       text not null default '',   -- markdown
  responsibilities  text not null default '',   -- markdown
  achievements      text not null default '',   -- markdown
  start_date        date,
  end_date          date,
  logo_url          text,
  related_experiences jsonb not null default '[]'::jsonb, -- experience uuids
  external_links    jsonb not null default '[]'::jsonb,   -- [{label, url}]
  sort_order        integer not null default 0,
  status            text not null default 'draft' check (status in ('draft', 'published')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists organizations_status_sort on public.organizations (status, sort_order, created_at desc);
drop trigger if exists set_updated_at on public.organizations;
create trigger set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Gallery / Photography
-- ---------------------------------------------------------------------------
create table if not exists public.gallery (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text not null default '',
  category_id   uuid references public.content_categories (id) on delete set null,
  location      text not null default '',
  capture_date  date,
  image_url     text not null,
  alt_text      text not null default '',
  featured      boolean not null default false,
  sort_order    integer not null default 0,
  status        text not null default 'draft' check (status in ('draft', 'published')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists gallery_status_sort on public.gallery (status, sort_order, created_at desc);
drop trigger if exists set_updated_at on public.gallery;
create trigger set_updated_at before update on public.gallery
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Documents (CV management - exactly one active CV at a time)
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text not null default '',
  doc_type      text not null default 'cv' check (doc_type in ('cv', 'portfolio', 'certificate', 'other')),
  file_url      text not null,
  storage_path  text not null default '',
  mime_type     text not null default 'application/pdf',
  file_size     bigint not null default 0,
  version       text not null default '',
  is_active     boolean not null default false,
  uploaded_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Only one active document per type (the public Download CV button follows it)
create unique index if not exists documents_single_active on public.documents (doc_type) where is_active;
drop trigger if exists set_updated_at on public.documents;
create trigger set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contact & social links
-- ---------------------------------------------------------------------------
create table if not exists public.social_links (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null,              -- email, linkedin, github, instagram, website, other
  label       text not null default '',
  url         text not null,
  icon        text not null default '',
  sort_order  integer not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.social_links;
create trigger set_updated_at before update on public.social_links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Site images (named media slots, e.g. the legacy images.json keys such as
-- "profile_image"; also the image library for reusable media)
-- ---------------------------------------------------------------------------
create table if not exists public.site_images (
  key         text primary key,
  url         text not null default '',
  alt         text not null default '',
  caption     text not null default '',
  updated_at  timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.site_images;
create trigger set_updated_at before update on public.site_images
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Site settings (key/value JSON): contact heading/body/email, text alignment, SEO
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null,
  label       text not null default '',
  updated_at  timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.site_settings;
create trigger set_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

-- Seed the settings the public renderer expects (values match content/settings.json)
insert into public.site_settings (key, value, label) values
  ('text_alignment', '"text-justify"'::jsonb, 'Body text alignment'),
  ('contact_heading', '"Let''s Discuss Energy Solutions"'::jsonb, 'Contact section heading'),
  ('contact_body', '"Open for collaborations, research opportunities, or technical discussions regarding sustainable energy transition."'::jsonb, 'Contact section body (markdown)'),
  ('contact_email', '"hello@example.com"'::jsonb, 'Contact email address')
on conflict (key) do nothing;

-- >>> 0002_rls.sql
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

-- >>> 0003_hardening.sql
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

-- >>> 0004_upload_fix.sql
-- ============================================================================
-- 0004_upload_fix.sql - storage upload policy fix (paste once in SQL Editor → Run)
--
-- Why: on current Supabase Storage versions the object row is INSERTed before
-- the file metadata (mimetype/size) is written, so insert policies that check
-- metadata->>'mimetype'/'size' can never pass. The MIME/size validation stays
-- in the admin app (client-side) and uploads remain strictly admin-only below.
-- ============================================================================

begin;

drop policy if exists storage_media_insert on storage.objects;
drop policy if exists storage_media_update on storage.objects;
drop policy if exists storage_docs_insert on storage.objects;
drop policy if exists storage_docs_update on storage.objects;

create policy storage_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portfolio-media' and public.is_admin());

create policy storage_media_update on storage.objects
  for update to authenticated
  using (bucket_id = 'portfolio-media' and public.is_admin())
  with check (bucket_id = 'portfolio-media' and public.is_admin());

create policy storage_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());

create policy storage_docs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public.is_admin())
  with check (bucket_id = 'documents' and public.is_admin());

commit;

-- >>> 0005_photography_section_settings.sql
-- ============================================================================
-- 0005_photography_section_settings.sql
-- Adds editable public heading and description for the Photography section.
-- Run once in the Supabase SQL editor after migrations 0001-0004.
-- Safe to re-run.
-- ============================================================================

begin;

insert into public.site_settings (key, value, label) values
  (
    'photography_heading',
    '"Photography"'::jsonb,
    'Photography section heading'
  ),
  (
    'photography_description',
    '"The Symbiosis of Engineering and Aesthetics: A visual storyteller bridging technical rigor with artistic vision, capturing the structural beauty of the human and industrial landscape."'::jsonb,
    'Photography section description'
  )
on conflict (key) do nothing;

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated
  using (key in (
    'text_alignment',
    'contact_heading',
    'contact_body',
    'contact_email',
    'site_title',
    'meta_description',
    'photography_heading',
    'photography_description'
  ));

commit;

-- >>> 0006_motion_gallery.sql
-- ============================================================================
-- 0006_motion_gallery.sql
-- Adds the "Motion in Frames" video gallery: one table for every video entry
-- (final renders AND behind-the-scenes footage live in the same table so the
-- public site can render them in a single carousel).
--
-- Run once in the Supabase SQL editor after migrations 0001-0005.
-- Safe to re-run (idempotent).
--
-- Design notes:
--   * project_id is an OPTIONAL grouping identifier (text). Store either the
--     slug of an existing row in public.projects, or any free-form key you
--     like (e.g. 'the-fall-of-keys'). Media rows sharing a project_id are
--     grouped together by the public gallery; a project with a single final
--     render is perfectly valid and needs no behind-the-scenes sibling.
--   * status/is_published mirror the rest of the CMS: `status` is the write
--     column (draft|published) and `is_published` is a generated, read-only
--     convenience column so public queries can filter on a boolean.
--   * aspect_ratio is a human-typed hint ("16:9", "9:16", "4:5", "1:1",
--     "21:9" or a decimal like "1.777"). The public gallery prefers the real
--     video/poster metadata and only falls back to this value.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.motion_media (
  id              uuid primary key default gen_random_uuid(),
  project_id      text,                          -- optional grouping identifier
  title           text not null default '',
  slug            text not null,
  description     text not null default '',
  media_type      text not null default 'final_render'
                    check (media_type in ('final_render', 'behind_the_scenes')),
  video_url       text not null default '',
  video_provider  text not null default 'upload'
                    check (video_provider in ('upload', 'youtube', 'vimeo', 'gdrive',
                                              'cloudflare_stream', 'bunny', 'other')),
  poster_url      text,
  aspect_ratio    text,                          -- optional hint, e.g. '16:9'
  duration        text,                          -- free-form, e.g. '1:24'
  year            integer,
  category        text,
  software        jsonb not null default '[]'::jsonb,  -- text[]
  display_order   integer not null default 0,
  status          text not null default 'draft'
                    check (status in ('draft', 'published')),
  is_published    boolean generated always as (status = 'published') stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists motion_media_slug_key
  on public.motion_media (slug);
create index if not exists motion_media_public_order
  on public.motion_media (display_order) where status = 'published';
create index if not exists motion_media_project
  on public.motion_media (project_id);

comment on table public.motion_media is
  'Video gallery entries (final renders and behind-the-scenes footage) shown in the public "Motion in Frames" carousel.';

drop trigger if exists set_updated_at on public.motion_media;
create trigger set_updated_at before update on public.motion_media
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS (same model as every other content table)
-- ---------------------------------------------------------------------------
alter table public.motion_media enable row level security;

grant select on public.motion_media to anon;
grant all on public.motion_media to authenticated;

drop policy if exists motion_media_public_read on public.motion_media;
create policy motion_media_public_read on public.motion_media
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists motion_media_admin_write on public.motion_media;
create policy motion_media_admin_write on public.motion_media
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Section copy (editable heading / description, same pattern as photography)
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value, label) values
  (
    'motion_heading',
    '"Motion in Frames."'::jsonb,
    'Motion gallery section heading'
  ),
  (
    'motion_description',
    '"An archive of moving images, visual experiments, and the creative processes behind selected works."'::jsonb,
    'Motion gallery section description'
  )
on conflict (key) do nothing;

-- Public read allow-list must include the two new keys (recreated, not altered).
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated
  using (key in (
    'text_alignment',
    'contact_heading',
    'contact_body',
    'contact_email',
    'site_title',
    'meta_description',
    'photography_heading',
    'photography_description',
    'motion_heading',
    'motion_description'
  ));

commit;

-- >>> 0007_motion_media_combined_type.sql
-- ============================================================================
-- 0007_motion_media_combined_type.sql
-- Allows a single media entry to be both: "Final + BTS" (a clip that shows the
-- finished animation and the production process in one cut).
--
-- Run once in the Supabase SQL editor after 0006. Safe to re-run.
-- ============================================================================

begin;

alter table public.motion_media
  drop constraint if exists motion_media_media_type_check;

alter table public.motion_media
  add constraint motion_media_media_type_check
  check (media_type in ('final_render', 'behind_the_scenes', 'combined'));

comment on column public.motion_media.media_type is
  'final_render | behind_the_scenes | combined (a single clip showing both the result and the process).';

commit;

-- >>> 0008_render_3d.sql
-- ============================================================================
-- 0008_render_3d.sql - "Turntable" gallery of 3D renders (stills).
--
-- Run once in the Supabase SQL editor after 0007. Safe to re-run.
--
-- Data model mirrors 0006 (motion_media): slug unique key, draft/published
-- with RLS, display_order, is_published generated column. Groups are optional
-- (project_id); a standalone still is perfectly valid.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.render_3d (
  id              uuid primary key default gen_random_uuid(),
  project_id      text,                          -- optional grouping identifier
  title           text not null default '',
  slug            text not null,
  description     text not null default '',
  image_url       text not null default '',
  thumb_url       text,
  kind            text not null default 'other'
                    check (kind in ('mesh', 'lighting', 'scene', 'turntable', 'other')),
  aspect_ratio    text,                          -- optional hint, e.g. '16:9'
  year            integer,
  category        text,
  software        jsonb not null default '[]'::jsonb,  -- text[]
  display_order   integer not null default 0,
  status          text not null default 'draft'
                    check (status in ('draft', 'published')),
  is_published    boolean generated always as (status = 'published') stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists render_3d_slug_key
  on public.render_3d (slug);
create index if not exists render_3d_public_order
  on public.render_3d (display_order) where status = 'published';
create index if not exists render_3d_project
  on public.render_3d (project_id);

comment on table public.render_3d is
  '"Turntable" gallery of 3D renders - still images shown on a circular rotating platform (#render-3d).';

drop trigger if exists set_updated_at on public.render_3d;
create trigger set_updated_at before update on public.render_3d
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS (same model as every other content table)
-- ---------------------------------------------------------------------------
alter table public.render_3d enable row level security;

grant select on public.render_3d to anon;
grant all on public.render_3d to authenticated;

drop policy if exists render_3d_public_read on public.render_3d;
create policy render_3d_public_read on public.render_3d
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists render_3d_admin_write on public.render_3d;
create policy render_3d_admin_write on public.render_3d
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Section copy (editable heading / description)
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value, label) values
  (
    'render3d_heading',
    '"Turntable."'::jsonb,
    '3D renders section heading'
  ),
  (
    'render3d_description',
    '"Stills from the turntable - rendered models, lighting studies, and scenes under construction."'::jsonb,
    '3D renders section description'
  ),
  (
    'render3d_hint',
    '"Drag to rotate the table"'::jsonb,
    '3D renders drag hint'
  )
on conflict (key) do nothing;

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated
  using (key in (
    'text_alignment',
    'contact_heading',
    'contact_body',
    'contact_email',
    'site_title',
    'meta_description',
    'photography_heading',
    'photography_description',
    'motion_heading',
    'motion_description',
    'render3d_heading',
    'render3d_description',
    'render3d_hint'
  ));

commit;

-- >>> 0009_media_rotation.sql
-- 0009_media_rotation.sql
--
-- Adds a CMS-controlled rotation to the two media galleries so a clip/image shot
-- in portrait can be presented in landscape (and vice versa).
--   0   = as shot (default)
--   90  = quarter turn clockwise  -> portrait becomes landscape
--   180 = upside down
--   270 = quarter turn anticlockwise
--
-- Idempotent: safe to re-run. Paste the whole file into the Supabase SQL editor.

begin;

alter table public.motion_media
  add column if not exists rotation integer not null default 0;

alter table public.render_3d
  add column if not exists rotation integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'motion_media_rotation_check'
  ) then
    alter table public.motion_media
      add constraint motion_media_rotation_check check (rotation in (0, 90, 180, 270));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'render_3d_rotation_check'
  ) then
    alter table public.render_3d
      add constraint render_3d_rotation_check check (rotation in (0, 90, 180, 270));
  end if;
end $$;

comment on column public.motion_media.rotation is 'CMS media rotation in degrees (0/90/180/270).';
comment on column public.render_3d.rotation is 'CMS media rotation in degrees (0/90/180/270).';

commit;
