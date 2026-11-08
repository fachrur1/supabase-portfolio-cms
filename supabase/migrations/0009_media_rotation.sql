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
