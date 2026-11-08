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
