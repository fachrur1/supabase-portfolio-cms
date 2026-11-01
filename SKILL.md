---
name: supabase-portfolio-cms
description: Build and deploy a Supabase-backed CMS for static sites.
version: 1.0.0
author: Muhammad Fachrurrozy (fachrur1)
license: MIT
---

# Supabase CMS Build & Deploy Playbook

Turn a static or Vite site into a database-driven CMS: Supabase (Auth +
PostgreSQL + Storage) behind an admin dashboard, with a fidelity-safe content
migration and Cloudflare Pages deployment. It does NOT redesign the site —
the existing renderer keeps its look and reads CMS data through a shared
shape-mapper. Written for any developer or AI coding assistant; follow it
step by step or load this file as instructions for your agent.

Reference implementation (full working code):
`github.com/fachrur1/aru-labs` — branch `oji-redesign` (see `CMS_SETUP.md`,
`supabase/migrations/`, `scripts/`, `src/cms/`, `admin/`, `tests/` there).

## When to Use

- Adding a database-backed CMS / admin dashboard to an existing static site.
- Migrating hardcoded site content (JSON/HTML) into Supabase without changing
  how the public site renders.
- Deploying a Supabase + Cloudflare Pages stack.

Don't use for: sites better served by a git-based CMS, or greenfield apps
where a framework-native backend is already chosen.

## Prerequisites

- Node project with Vite (or any bundler with env inlining), `@supabase/supabase-js`.
- Supabase project: Project URL + `anon` publishable key + `service_role` key
  (service role stays server-side / local scripts only — never in frontend).
- Cloudflare account with `wrangler` logged in for deployment.

## Architecture Rules

1. Map DB rows into the EXACT legacy content shape via a shared pure mapper
   (importable by browser, Node scripts, and `node --test`). Never fork the
   rendering logic.
2. Public pages read via plain `fetch` to Supabase REST with the anon key —
   do NOT bundle `supabase-js` into public pages. The admin app uses
   `supabase-js` for auth/storage/CRUD.
3. Keep a static-content fallback so the site works before/without Supabase.
4. RLS is the security boundary: `status='published'` select policies for
   anon; writes gated by an `is_admin()` helper; `admin_users` table with NO
   insert policy (bootstrap via service-role script only).

## Procedure

1. **Schema + RLS migrations** (`supabase/migrations/`): content tables with
   `created_at`/`updated_at` triggers, `status` ('draft'|'published'),
   `sort_order`, FKs. Idempotent scripts (`create table if not exists`,
   `drop policy if exists` before every `create policy`) wrapped in
   `begin;/commit;` — users paste them into the SQL editor and re-run on
   failure. Create tables BEFORE SQL functions that reference them (SQL
   functions validate relations at CREATE time).
   Done when: SQL editor returns "Success. No rows returned".
2. **Storage buckets** (`portfolio-media` images, `documents` PDFs) with
   admin-only insert/update/delete policies and public read.
3. **Admin bootstrap script**: service-role `auth.admin.createUser`
   (email_confirm) + `admin_users` row; password via `ADMIN_PASSWORD` env,
   never argv. Done when: script prints the login email.
4. **Content migration script**: dry-run by default (`--confirm` to write),
   conflict-safe (skip non-empty tables, never overwrite), each table gated on
   its OWN emptiness (partial failures recoverable). Store description text
   VERBATIM; merge structured meta fields only when the body lacks the
   matching `Key:` line / block header.
   Done when: the offline fidelity check (mapper output byte-compared against
   the legacy source, every section) passes BEFORE any write.
5. **Public integration**: swap the static fetch for a loader that prefers CMS
   data and falls back to static JSON; escape/sanitize at render sinks (see
   Pitfalls). Done when: site renders identical section counts in both modes.
6. **Admin dashboard** (`admin/`): hash-routed, schema-driven CRUD engine
   (list: search/filter/sort/pagination/drag-order; forms: markdown editor,
   image upload with client-side type+size validation, unsaved-changes guard,
   preview-before-publish). Singleton modules (profile/contact/settings/CV)
   reuse the same form engine.
7. **Verification ladder**: mapper unit tests (`node --test`) → migration
   dry-run fidelity gate → live verify script (public reads, draft
   invisibility, anon write blocked, admin CRUD round-trip, upload, active CV)
   → build + typecheck → browser smoke of the built site → deploy → live
   browser re-check. Require all green before deploy.

## Quick Reference

```bash
node scripts/migrate-to-supabase.mjs            # dry-run + fidelity check
node scripts/migrate-to-supabase.mjs --confirm  # import (conflict-safe)
ADMIN_PASSWORD=... node scripts/bootstrap-admin.mjs <email>
SUPABASE_URL=... SUPABASE_ANON_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
  node scripts/verify-cms.mjs                   # live E2E suite
npm run build && node tests/public-smoke.mjs    # build + browser smoke
npx wrangler pages deploy dist --project-name <proj> --branch=<prod-branch>
```

## Pitfalls

- **`grant all ... to authenticated` includes TRUNCATE, which bypasses RLS.**
  Always `revoke truncate, references on all tables in schema public from
  anon, authenticated`.
- **Storage RLS `metadata->>'mimetype'/'size'` checks fail on current
  Supabase Storage** (metadata is written after the row insert). Keep
  admin-only bucket policies; enforce MIME/size in the client; document it.
- **XSS**: DB content flows into `innerHTML` and markdown renderers pass raw
  HTML. Escape every text interpolation, allowlist-sanitize markdown output
  (DOMParser walk), scheme-check href/src (http/https/mailto/data:image +
  relative only).
- **World-readable key/value tables** (site_settings) must be restricted to a
  public-key allowlist in the read policy, or future private values leak.
- **Cloudflare Pages**: deploy to the project's EXISTING production branch
  (check `npx wrangler pages deployment list`). `--branch=production` when the
  production branch is `main` creates a parallel deployment — the
  `*.pages.dev` alias shows the new build but the custom domain keeps serving
  old content. Verify the CUSTOM DOMAIN after deploy.
- **VITE_\* env vars are baked at build time**; building locally with `.env`
  present makes Pages env vars unnecessary for direct uploads.
- **Passwords with `!`** must be single-quoted in bash env assignments.
- SQL scripts a user pastes into a web SQL editor WILL be re-run after a
  failure — make them idempotent or the second run fails on "already exists".

## Verification

- Mapper unit tests pass (`node --test`).
- Migration dry-run prints "PASSED — every section round-trips byte-for-byte".
- The live verify script reports all checks passed (drafts hidden from anon,
  anon INSERT denied, admin CRUD round-trip works, uploads work, active CV
  public).
- Browser smoke green against the built site in BOTH modes (fallback and live
  CMS).
- Post-deploy: browser check of the custom domain shows the new build marker
  and CMS-rendered content; `/admin` serves the dashboard login.
