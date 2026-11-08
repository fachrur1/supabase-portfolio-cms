# Verification

Cheap checks first. A failure higher up makes everything below it meaningless, so run
them in this order and stop at the first red line.

## 1. Unit tests, no database

```bash
node --test
```

Two groups run here:

- `tests/shape.test.mjs` and `demo/shape.test.mjs`: the mapper over fixture rows.
  These check the contract between the database and the renderer, including the
  metadata block rules, block header detection, ordering of merged works, and the
  handling of draft rows.
- `tests/admin-*.test.mjs`: the pure admin helpers. Draft snapshot TTL, tag
  serialisation, media diff plans, nullable category resolution, icon library
  sanity.

None of these need credentials. They run without a network.

## 2. Migration fidelity gate

```bash
node scripts/migrate-to-supabase.mjs
```

Dry run. It reads the source content, builds the rows, maps them back through the real
mapper, and compares both sides section by section. Expected last line:

```
PASSED - every section round-trips byte-for-byte
```

If it prints mismatches, do not pass `--confirm`. The output names the section and the
differing field, which is usually enough to see whether the parser or the content is
wrong.

## 3. Live security and CRUD suite

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
  node scripts/verify-cms.mjs
```

This one talks to the real project. What it proves, in order:

| Check | Proves |
|---|---|
| public reads on every content table | the read policies are complete, nothing 403s |
| migrated content present | the import actually landed |
| `site_settings` readable | the key allowlist includes the copy the page needs |
| active CV publicly readable | exactly one active document, and it is reachable |
| anon INSERT blocked | the write policies work, not just the UI |
| `admin_users` hidden from anon | the allow-list is not enumerable |
| admin login | the auth user exists and is confirmed |
| `admin_users` membership | the account is allowed in |
| create draft project | writes work with a real JWT |
| draft hidden from public | RLS, not application code, hides drafts |
| publish | the status transition works |
| published visible to public | the read policy sees the change immediately |
| edit reflected publicly | updates propagate |
| image upload | the bucket and its policy accept admin writes |
| delete removes publicly | cleanup works end to end |

Two of these are security assertions, and they fail loudly on purpose. "anon INSERT
blocked" printing `INSERT SUCCEEDED - RLS IS BROKEN` means the policy needs fixing
before anything else.

## 4. Build and typecheck

```bash
npm run typecheck
npm run build
```

The build catches missing environment variables, broken imports and a syntax error in
the inline renderer. A page that builds is not automatically correct, but a page that
does not build is definitely broken.

## 5. Browser smoke against the built site

Serve `dist/` and check the parts that a build cannot prove:

- section counts match the database
- the works modal opens, and a rich description renders with its metadata grid, cards
  and table
- both media galleries load, drag, and respect rotation
- the CV link points at the active document
- `/admin/` renders the login form, and signing in reaches the dashboard

The puppeteer gates in `tests/` automate this. Run them against a local static server
over `dist/`, not against the live domain: a live check mixes code correctness with
cache behaviour and content edits.

## 6. After deploy

- Custom domain, cache-busted, shows the new marker.
- `/admin/` login works.
- One real edit through the UI, published, visible on the public page.

That last one is the only check that exercises the whole chain a person actually uses.

## What is not covered

- Visual regression. There is no screenshot diffing in this repo, so a CSS change is
  verified by looking at it.
- Performance budgets. The page is one HTML file with a large inline script; measure
  before optimising.
- Content correctness. Tests prove the plumbing works, not that the writing is good.