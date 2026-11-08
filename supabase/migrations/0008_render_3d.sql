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
