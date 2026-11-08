# Security model

The site publishes an anonymous API key in its HTML. That is normal and safe, but
only because the database refuses to hand out anything else. This document is the
policy set that makes that true, and the reasoning behind each decision.

## Threat model

| Actor | Capability | What stops them |
|---|---|---|
| Anonymous visitor | Has the anon key from the bundle | RLS: published rows only, no writes, no `admin_users` |
| Registered Supabase user (if signup were enabled) | Valid JWT, no `admin_users` row | `is_admin()` returns false on every write policy |
| Editor with a stolen session | Valid admin JWT until it expires | Session lifetime plus a 5 minute re-check of `admin_users` in the admin app |
| Someone with the service role key | Everything | Nothing. Keep that key out of the browser and out of git |
| Content author | Can paste arbitrary HTML into markdown | The renderer escapes and sanitises every string |

## Layer 1: grants

```sql
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to anon;
grant all on all tables in schema public to authenticated;
```

`grant all` is a blunt instrument, and it has one specific problem: it includes
`TRUNCATE`, and PostgreSQL does not apply row level security to `TRUNCATE` or
`REFERENCES`. A valid JWT could therefore empty a table while every policy still
looked correct. `0003_hardening.sql` closes that:

```sql
revoke truncate, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public
  revoke truncate, references on tables from anon, authenticated;
```

## Layer 2: RLS per table

The pattern for content:

```sql
create policy projects_public_read on public.projects
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

create policy projects_admin_write on public.projects
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

Three variations exist because three tables do not behave like the rest:

- **`documents`**: `using (is_active or public.is_admin())`. Only the active CV is
  public; older versions stay private even if their URL is guessed.
- **`social_links`**: `using (visible or public.is_admin())`. Hiding a link in the
  editor also removes it from anon reads.
- **`project_media`**: reads follow the parent. A media row is public only when its
  project is published.

```sql
create policy project_media_public_read on public.project_media
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and (p.status = 'published' or public.is_admin())
    )
  );
```

Without that `exists`, an unpublished project would still leak its images, because
media rows have no `status` column of their own.

## Layer 3: the allow-list

`admin_users` is the only authorization source. There is deliberately **no insert
policy**:

```sql
create policy admin_users_select on public.admin_users
  for select to authenticated
  using (public.is_admin());
```

The only path to a row is the service role, used by `scripts/bootstrap-admin.mjs`.
Two consequences worth stating out loud:

- Sign-up must be disabled in the Supabase auth settings. A new auth user is
  harmless (no `admin_users` row, so every write policy denies), but the clean state
  is no sign-up path at all.
- If the last admin is deleted, recovery means inserting a row with the service role
  again. There is no self-service way back in, by design.

`is_admin()` is `security definer` so policies can read `admin_users` without
recursing into its own policy, and it pins an empty `search_path` so a shadowed
schema cannot hijack it:

```sql
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()); $$;
```

## Layer 4: `site_settings` needs an allowlist

A key/value table with public read is a future leak waiting to happen: the first
private setting someone adds becomes world readable. The read policy names the keys
that are allowed to be public.

```sql
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated
  using (key in ('text_alignment', 'contact_heading', 'contact_body',
                 'contact_email', 'site_title', 'meta_description',
                 'photography_heading', 'photography_description',
                 'motion_heading', 'motion_description',
                 'render3d_heading', 'render3d_description', 'render3d_hint'));
```

Adding a section means **recreating** this policy with the new keys. An
`alter policy` looks like it edits the list and does not: the new key stays
invisible, and the section renders empty with no error anywhere.

## Layer 5: storage

Buckets `portfolio-media` and `documents` are public-read, admin-write.

```sql
create policy storage_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portfolio-media' and public.is_admin());
```

An earlier version also checked `metadata->>'mimetype'` and `metadata->>'size'`.
Those policies never pass on current Supabase Storage: the object row is inserted
before its metadata is written, so the check sees nulls. `0004_upload_fix.sql`
removes them, and the MIME and size rules moved to `admin/src/uploads.js`, where they
run before the upload starts:

| Bucket | Accepts | Limit |
|---|---|---|
| `portfolio-media` | jpeg, png, webp, gif, avif | 10 MB |
| `portfolio-media` (video) | mp4, webm, mov | 50 MB |
| `documents` | pdf | 20 MB |

Client-side validation is not a security boundary, but the bucket is admin-only, so
the only actor it needs to convince is the person who is already allowed to upload.

## Layer 6: the render sink

Everything in the database is treated as attacker-controlled text, including markdown
written by the site owner.

In the public page:

- `esc()` on every interpolation into an `innerHTML` template.
- Markdown goes through `marked` and then an allowlist sanitiser: a DOMParser walk
  that keeps a fixed set of tags and attributes and drops the rest, including event
  handlers and `<script>`.
- `href` and `src` are scheme-checked: `http`, `https`, `mailto`, `data:image/`, or a
  relative path. Anything else becomes empty.

In the admin app the same rule applies to list cells, modal previews and the markdown
preview pane. The admin is more trusted than the public page, but a preview that
executes pasted HTML is still an XSS in an authenticated session.

## What this model does not cover

- **Service role key hygiene.** It bypasses every policy above. It belongs in `.env`
  on a developer machine, used by local scripts, and nowhere else.
- **Compromised dependencies.** The public page loads Tailwind and Google Fonts from
  CDNs. That is a deliberate trade for a static site, and it is also the largest
  supply-chain surface in the project.
- **Content correctness.** RLS protects who can read and write. It does not stop an
  editor from publishing something wrong.

## How to check it quickly

```bash
node scripts/verify-cms.mjs
```

The script signs in as an admin, then exercises the same paths an attacker would try
with the anon key: read drafts, insert a row, read `admin_users`. All three must fail.
If one of them succeeds, the output says so in capitals, because that is a policy bug
and not a flaky test.