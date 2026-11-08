---
name: supabase-portfolio-cms
description: Use when adding a Supabase CMS to a static site.
version: 2.0.0
license: MIT
---

# Supabase CMS playbook

Turn an existing static or Vite site into a database-driven CMS without redesigning
it: Supabase (Auth + PostgreSQL + Storage) behind a private admin dashboard, a
fidelity-safe migration of the current content, and a Cloudflare Pages deploy.

Load this file as project instructions and follow it in order. Each step has a
done-when line, so progress is measurable.

The full working code sits next to this file: `supabase/migrations/`, `admin/`,
`scripts/`, `src/cms/`, `demo/`. Read it when the prose is not enough.

## When to use this

- A site with hardcoded content needs an editing UI and a database, but the design
  must not change.
- Content already lives in JSON or HTML and has to move into Postgres without a
  visual diff.
- A single owner (or a small allow-list) edits the site, and visitors must never be
  able to write.

Do not use it for: a multi-tenant product, a site that needs editorial workflows
(review, scheduling), or anything where content should live in git instead.

## Mental model

Three layers, one direction of data flow:

1. **Database** owns content and permissions. RLS decides what an anonymous visitor
   can read. Application code never compensates for a missing policy.
2. **Mapper** (`src/cms/shape.js`) converts rows into the exact shape the existing
   renderer already consumes. One pure function, no DOM, no network, importable by
   the browser, by Node scripts and by `node --test`.
3. **Renderer** stays untouched where possible. It paints the shape it always
   painted, from a different source.

The admin app is a separate consumer of the same database. It uses `supabase-js`
for auth, storage and CRUD. The public page deliberately does not.

## Procedure

### 1. Create the schema

Write migrations in `supabase/migrations/NNNN_name.sql`, one concern per file.

Every content table carries: `created_at`, `updated_at` (trigger), `status`
(`draft` | `published`), and an ordering column (`sort_order`, or `display_order`
for tables sorted by a name of their own). Reference tables get a `slug unique`.

Rules that keep the SQL editor usable:

- Idempotent throughout: `create table if not exists`, `drop policy if exists`
  before `create policy`, `drop trigger if exists` before `create trigger`.
- Wrap multi-statement files in `begin; ... commit;`.
- Create tables **before** SQL functions that query them. A SQL-language function
  validates its relations at create time.
- Comment the why, not the what. The next reader arrives in six months with no context.

Done when: the SQL editor reports success and re-running the same file also
succeeds.

### 2. Write the RLS policies

This is the security boundary, so write it first and test it early.

- `grant select` to `anon`, `grant all` to `authenticated`, then let policies decide
  rows. Enable RLS on every table, no exceptions.
- Public read: `using (status = 'published' or public.is_admin())`.
- Admin write: `for all to authenticated using (public.is_admin()) with check
  (public.is_admin())`.
- Child tables (media rows) read through a parent check:
  `exists (select 1 from projects p where p.id = project_id and (p.status =
  'published' or public.is_admin()))`.
- Helper tables: `documents` is public only for the active row; `social_links` only
  for visible rows; `site_settings` only for an explicit key allowlist.
- `admin_users`: `select` gated by `is_admin()`, and **no insert policy at all**.
  The only way in is the service role, from a local script.
- `is_admin()` is `security definer`, `set search_path = ''`, body fully qualified.

Done when: an anonymous key can read published rows, cannot see drafts, cannot
insert, and cannot read `admin_users`.

### 3. Create the storage buckets

`portfolio-media` for images and video, `documents` for PDFs. Public read, admin-only
write, MIME and size limits enforced in the client because current Supabase Storage
writes object metadata *after* the row insert, so policy checks on
`metadata->>'mimetype'` can never pass. Keep the policy simple
(`bucket_id = 'x' and public.is_admin()`) and validate in `admin/src/uploads.js`.

Done when: an admin can upload an image, and an anonymous upload is rejected.

### 4. Build the mapper before touching the site

`src/cms/shape.js` exports `buildContentShape({ profiles, projects, ... })` and
returns the legacy `{ textData, imgData, settingsData }`.

- Keep it pure and dependency-free, so the same file runs in the browser, in Node
  scripts and in unit tests.
- Filter drafts in the mapper too, even though RLS already does. The mapper is also
  used offline against exported rows.
- Derive image slots deterministically (`wm3`, `wg3_1`) so URLs stay stable.

Done when: `node --test` can import it and produce a shape from fixture rows.

### 5. Migrate the content with a fidelity gate

`scripts/migrate-to-supabase.mjs`:

- Dry run by default; `--confirm` writes.
- Gate every write behind an offline check: run the mapper over the rows that are
  about to be inserted and compare section by section against the existing content.
  Refuse to import on any mismatch. A migration that changes rendering is a bug,
  not a detail.
- Store rich text verbatim. Merge structured columns only where the body does not
  already carry the matching `Key:` line or block header.
- Skip any table that already has rows, so a partial failure is recoverable by
  re-running.

Done when: the dry run prints a byte-for-byte pass for every section.

### 6. Bootstrap the first admin

`scripts/bootstrap-admin.mjs` creates the auth user with
`auth.admin.createUser({ email_confirm: true })` using the service role key, then
inserts the `admin_users` row. Password comes from `ADMIN_PASSWORD`, never argv, so
it does not land in shell history.

Also turn off "Allow new users to sign up" in the Supabase auth settings. Without
that, anyone can create an auth user (they still cannot read content, but the clean
state is no signup at all).

Done when: the account can sign in at `/admin/` and `verify-cms.mjs` sees the
`admin_users` row.

### 7. Wire the public loader

`src/cms/public-content.ts` sets `window.CMS = { loadContent, isCmsConfigured }`.

- Fetch PostgREST with plain `fetch` and the anon key. Do not bundle `supabase-js`
  into the public page.
- Fetch all tables in one `Promise.all`. 13 requests in parallel beats a waterfall.
- On any failure, throw. The page catches it and falls back to `api/*.json`.
- Rewrite the "Download CV" anchors to the active document, but only anchors whose
  href already ends in `.pdf`.

Done when: the built page renders identical sections with and without Supabase
reachable.

### 8. Build the admin engine, not twelve bespoke screens

`admin/` is a hash-routed SPA with one schema-driven CRUD engine.

- `admin/src/schemas.js` declares each module: list columns, form fields, sections,
  types (`text`, `textarea`, `markdown`, `select`, `tags`, `image`, `gallery`,
  `links`, `date`, `checkbox`, `number`, `icon`).
- `admin/src/crud.js` renders list, filters, pagination, drag ordering, and the form.
- Adding a module is one entry in `modules` plus one nav row in `main.js`. Never
  write a custom view for a CRUD table.
- Singleton screens (profile, contact, settings, documents) reuse the same form
  builder through `editInModal`.
- Select fields driven by categories need the row list threaded through every
  builder hop: `buildForm(config, row, categories)` → `renderControl(field, value,
  { categories })` → `defaultControl`. Miss one hop and the select silently shows
  only the empty option.
- A `select` bound to a `CHECK` column must be `required: true`, otherwise the empty
  option saves `''` and violates the constraint. Nullable numeric columns need
  `nullable: true` or the payload coerces them to `0`.
- Unsaved form state must survive hash navigation. `admin/src/drafts.js` snapshots
  the active form on every route change; gallery uploads included.

Done when: a new table can be listed, filtered, reordered, created, edited, published
and deleted without new view code.

### 9. Verify against the live project

`scripts/verify-cms.mjs` runs the security and CRUD checks end to end: public reads,
draft invisibility, anonymous insert blocked, `admin_users` hidden, admin login,
create draft, publish, edit reflected publicly, upload, delete removes publicly,
active CV readable.

Done when: every check prints green. Fix the policy, not the test.

### 10. Deploy and verify the real domain

- Build locally with `.env` present. Vite inlines `VITE_*` at build time, so a local
  build is deployable as-is.
- `npx wrangler pages deploy dist --project-name <project> --branch=<existing
  production branch>`. Check `wrangler pages deployment list` first. Uploading to a
  branch that is not the production branch creates a parallel deployment: the
  `*.pages.dev` alias updates, the custom domain keeps serving the old build.
- Verify the custom domain, not the alias: fetch it with a cache-busting query and
  grep for a marker that only exists in the new build.

## Adding a new public section

Worked example: a video gallery.

1. Migration: table with `status`, ordering, `grant select to anon`, public-read and
   admin-write policies. If the section is filtered on a boolean, expose it as
   `generated always as (status = 'published') stored`.
2. Section copy: seed `site_settings` keys, then **recreate** the
   `site_settings_public_read` policy with the new keys in its allowlist. An
   `alter policy` will leave them hidden.
3. Admin: one `modules` entry plus one nav row. Schema-driven, no custom view.
4. Public: a separate Vite module with its own namespaced CSS, reading PostgREST
   through the same env vars, falling back to `api/<feature>.json`, and keeping the
   section `display: none` until data arrives so an empty database never ships a
   broken block.
5. Scope discipline: do not touch navigation or theme tokens for a new section.

## Pitfalls

1. **`grant all` includes TRUNCATE, which bypasses RLS.** Revoke it explicitly:
   `revoke truncate, references on all tables in schema public from anon,
   authenticated`.
2. **World-readable key/value tables leak future secrets.** Restrict
   `site_settings` public read to an explicit key allowlist.
3. **New settings keys stay invisible.** Recreating the policy is required; altering
   it does not replace the `using` list.
4. **Storage policies that inspect `metadata` fail silently.** Validate MIME and size
   in the client, keep the bucket policy admin-only.
5. **SQL functions validate relations at create time.** Order migrations accordingly
   or the first run fails.
6. **Pastable SQL gets re-run.** Idempotency is not optional when the user is
   clicking "Run" in a web editor.
7. **A missing column should not lose an edit.** `writeWithFallback` in
   `admin/src/api.js` drops the column PostgREST names in the error and retries, so
   the editor keeps saving until the migration is applied.
8. **Never sync child rows with delete-then-insert.** That once wiped a gallery. Use
   `admin/src/media-sync.js#planMediaSync`: match by id, fall back to URL, insert and
   update before delete, and pass `null` to mean "leave alone".
9. **Tags stored the wrong shape print `[object Object]`.** `admin/src/payload.js`
   must serialise tag fields as a flat `string[]`. `scripts/repair-tag-fields.mjs`
   fixes rows that were damaged before the fix.
10. **XSS at the render sink.** Every CMS string reaches `innerHTML`. Escape every
    interpolation, allowlist-sanitize markdown output with a DOMParser walk, and
    scheme-check `href`/`src` (`http`, `https`, `mailto`, `data:image:`, relative
    only).
11. **Deploying to a non-production branch looks successful.** See step 10.
12. **Passwords with `!` need single quotes** in bash assignments, or history
    expansion eats them.

## Verification ladder

Cheapest first. A failure higher up makes everything below meaningless.

1. `node --test` on the mapper and the pure admin helpers (`tests/`).
2. Migration dry run: fidelity gate passes, nothing written.
3. `node scripts/verify-cms.mjs`: RLS, auth, CRUD, uploads, active CV.
4. `npm run build` plus a typecheck: no missing env, no broken imports.
5. Browser smoke against the built site: section counts, modal, CV link, `/admin`
   login.
6. Deploy, then re-check the custom domain in a browser.