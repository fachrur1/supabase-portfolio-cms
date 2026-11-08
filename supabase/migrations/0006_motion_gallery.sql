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
