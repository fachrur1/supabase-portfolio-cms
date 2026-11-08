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
