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
