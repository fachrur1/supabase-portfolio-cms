# Supabase CMS Build & Deploy Playbook

Turn a **static or Vite website** into a fully database-driven CMS — without
redesigning it. This repository is a complete, battle-tested playbook:
Supabase (Auth + PostgreSQL + Storage) behind a private admin dashboard,
fidelity-safe migration of your existing content, and Cloudflare Pages
deployment.

It was built and verified end-to-end for a real production portfolio site
(12 projects, media gallery, CV management) — every step below was executed
and tested live, including automated byte-for-byte content-fidelity checks.

## What you get

| Piece | What it does |
|---|---|
| **Database schema + RLS** | Content tables (projects, experiences, education, skills, organizations, gallery, documents, settings) with draft/publish states, custom ordering, and Row Level Security so drafts never leak and anonymous visitors can never write |
| **Admin dashboard** | Private `/admin` area with 11 modules: schema-driven CRUD, markdown editor with preview, image/PDF uploads, drag-and-drop ordering, search/filter/sort, publish workflow |
| **Public-site integration** | Your existing site renders CMS content through a shared shape-mapper — visually identical to before, with a static fallback if the database is unreachable |
| **Migration tooling** | Imports your existing hardcoded content *verbatim* (refuses to run unless output is byte-identical), conflict-safe and re-runnable |
| **Verification suite** | One command checks auth, draft invisibility, CRUD round-trips, uploads and the public CV link against the live database |
| **Hardening notes** | XSS escaping at render sinks, TRUNCATE-vs-RLS, storage policy quirks, and other pitfalls found by independent security review |

## Quick start

1. Create a Supabase project → run the SQL migrations in its SQL editor.
2. Copy `.env.example` → `.env`, fill in your project URL + keys.
3. `node scripts/migrate-to-supabase.mjs` (dry-run + fidelity check), then
   `--confirm` to import your content.
4. `ADMIN_PASSWORD=... node scripts/bootstrap-admin.mjs <email>` — first admin.
5. `node scripts/verify-cms.mjs` — require all green.
6. `npm run build` and deploy `dist/` to Cloudflare Pages
   (`npx wrangler pages deploy dist --project-name <proj> --branch=<prod-branch>`).

Full instructions (architecture, environment variables, security model,
content-management guide): see [`SKILL.md`](./SKILL.md) — the complete
step-by-step playbook — and the reference implementation links below.

## Use it with any AI coding assistant

`SKILL.md` is written to be loaded directly as project instructions for an
AI coding agent (Claude Code, Cursor, Codex, Copilot, or any assistant that
accepts markdown context):

> "Read SKILL.md and follow it to add this CMS to my site."

The playbook is tool-agnostic: all steps are plain SQL, Node scripts, and CLI
commands a human can run too.

## Reference implementation

The complete working code (schema, admin dashboard, migration scripts, tests)
lives in the portfolio project that this playbook was extracted from:

- `github.com/fachrur1/aru-labs` — branch **`oji-redesign`**:
  `CMS_SETUP.md`, `supabase/migrations/`, `scripts/`, `src/cms/`, `admin/`, `tests/`

## Author

**Muhammad Fachrurrozy** — Engineering Physics student, Universitas Gadjah Mada.
Portfolio: [fachrur.is-a.dev](https://fachrur.is-a.dev)

## License

MIT — use it for your own site, no attribution required (appreciated though!).
