# Troubleshooting

Symptoms in the order they usually appear. Each entry names the cause before the fix,
because the same symptom has more than one cause and guessing wastes an afternoon.

## Content does not appear on the public page

| Symptom | Likely cause | Fix |
|---|---|---|
| A section renders nothing, no console error | RLS hides the rows: still `draft` | Publish the row, or check `status` |
| Everything is empty after a fresh setup | `VITE_SUPABASE_*` were not set at build time | Set them in `.env`, rebuild. Vite inlines them, so editing `.env` alone changes nothing |
| The page shows old content after an edit | The browser is showing a cached deploy, or the build was never deployed | Cache-bust the domain and check the deployment list |
| A section is empty but the table has rows | A new `site_settings` key is missing from the public read policy | Recreate `site_settings_public_read` with the key in its allowlist. `alter policy` is not enough |
| Images 404 right after a deploy | Legacy `public/assets/images/*` URLs collide with the hashed bundle directory for a short window | Re-check after propagation |
| The page works locally, not on the domain | Deployed to a branch that is not the production branch | Redeploy with `--branch=<the production branch>` |

## Admin dashboard problems

**A select shows only the empty option.** The category rows were not threaded through
every builder hop. Check all three: `buildForm(config, row, categories)` →
`renderControl(field, value, { config, categories })` → `defaultControl(field, value,
ctx)`. Missing one hop produces no error, and the list filter keeps working, which is
why it looks like a data bug.

**Saving a select fails with a check constraint violation.** The field is bound to a
column with a `CHECK`, and the empty option saved `''`. Add `required: true` so the
editor cannot submit empty.

**A number field turns empty into zero.** A nullable numeric column without
`nullable: true` gets coerced by the payload builder. Declare it nullable.

**Uploads return 403 even when signed in.** Two usual causes: the bucket policy still
checks `metadata->>'mimetype'` (which is null at insert time, see
`0004_upload_fix.sql`), or the signed-in user is not in `admin_users`.

**A gallery lost its images after an edit.** Something used delete-then-insert on a
child table. Restore from storage with `scripts/recover-orphan-media.mjs` (dry run
first), then fix the sync path to use `planMediaSync`.

**An edit vanished when switching tabs.** The form was not snapshotted. Drafts live in
`admin/src/drafts.js` and are keyed by table and row id, with a 12 hour TTL; the router
must call `flushActiveFormDraft()` at the top of `route()`.

**A save was silently skipped.** Check the console for `column "x" is not in the
database yet`. The write fallback dropped a column PostgREST reported as missing, which
means a migration is pending.

**An icon renders as text instead of a glyph.** The Material Symbols font is not
loaded, or the name is misspelled. The picker flags unknown names; the font comes from
Google Fonts in both apps.

**Tags print `[object Object]`.** Tags were serialised as an object array. Fix
`admin/src/payload.js` so tag fields become a flat `string[]`, then run
`scripts/repair-tag-fields.mjs` to clean existing rows.

## Database and policy problems

**Anonymous visitors can insert.** A policy is missing or too broad. Run
`node scripts/verify-cms.mjs`; it prints `INSERT SUCCEEDED` and that is a stop-the-line
result. Common cause: a `for all to authenticated` policy written with `using` but no
`with check`.

**A migration fails halfway.** Re-run the same file. Every statement is guarded, so the
second run continues instead of failing on objects that already exist. If a file
contains a `create policy` without a preceding `drop policy if exists`, add one.

**`function is_admin() does not exist` during a migration.** The function is created
in an earlier file, or a SQL-language function referenced a table that does not exist
yet. Create tables before the functions that query them.

**A `TRUNCATE` succeeded for a non-admin.** `grant all` included it. Apply
`0003_hardening.sql`.

**Every write from the admin fails with `new row violates row-level security policy`.**
The JWT is valid but the user has no `admin_users` row, or `is_admin()` reads a
different schema because it is missing `set search_path = ''`.

## Mapper and rendering problems

**The page changed appearance after migration.** The fidelity gate was bypassed or the
content was edited during import. Restore from a backup and re-run the dry run; it
names the section and the field that differs.

**A draft is visible publicly.** RLS is not the problem at that point: check whether the
public query uses the anon key. Anything using the service role bypasses every policy.

**`render_3d` cards show a UUID instead of a label.** `project_id` is a display label,
not a foreign key. Put the label there, not the project's id.

**The gallery is completely empty and the section collapses.** The query filters on
`is_published`, which is a generated column. Rows with `status = 'draft'` correctly
return nothing, and a section with zero items hides itself on purpose.

## Deploy problems

**The alias updates, the domain does not.** Wrong production branch. See
[06-deploy.md](06-deploy.md).

**The build works locally and fails on Pages.** Vite inlines environment variables from
`.env` at build time; a CI build has no `.env`. Either commit nothing and upload a
local build, or configure the variables in the Pages project.

**A password with `!` breaks a script.** Bash history expansion. Single-quote the
assignment: `ADMIN_PASSWORD='p@ss!word' node scripts/bootstrap-admin.mjs ...`.

## When the whole thing is confusing

Two commands answer most questions:

```bash
node scripts/verify-cms.mjs                  # is the database doing what I think?
node demo/serve.mjs --site dist              # is the front-end doing what I think?
```

The second one runs entirely locally with fictional data. If it renders correctly
there but not in production, the problem is data or deployment, not code.