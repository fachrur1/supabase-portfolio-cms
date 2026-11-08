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
