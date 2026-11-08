# The demo harness

A local stand-in for Supabase, plus a fictional dataset. It exists so the project can
be demonstrated, screenshotted and tested without an account, a network call, or any
of the real owner's content.

Nothing here is used in production. It is a development tool, and it is deliberately
small.

## Pieces

| File | Role |
|---|---|
| `demo/demo-dataset.mjs` | Fictional rows for all 16 tables, in the real column shapes |
| `demo/serve.mjs` | HTTP server: a static file server plus mock PostgREST, GoTrue and Storage |
| `demo/export-fallback.mjs` | Runs the real mapper over the demo rows and writes `api/*.json` |
| `demo/capture-docs.mjs` | Puppeteer script that produces every screenshot in `docs/images/` |
| `demo/shape.test.mjs` | Mapper tests over the demo rows |

## Run it

```bash
npm run build                                    # or any build of the site
node demo/export-fallback.mjs --site dist        # fictional api/*.json fallbacks
node demo/serve.mjs --site dist --port 8787
```

Then open:

- `http://localhost:8787/` for the public page
- `http://localhost:8787/admin/` for the dashboard

The demo account is `admin@example.com` with password `demo-password`. It is a local
object in `demo-dataset.mjs`, not a real credential anywhere.

## Pointing a build at the mock

The site reads its Supabase URL at build time, so the build has to know where the mock
lives:

```bash
VITE_SUPABASE_URL=http://localhost:8787 \
VITE_SUPABASE_ANON_KEY=demo-anon-key \
  npx vite build --outDir <demo-site>
```

The anon key is not checked by the mock. It exists so the build takes the "CMS
configured" path instead of the static fallback.

## What the mock implements

Enough of the wire protocol for the real client code to run unmodified:

| Endpoint | Behaviour |
|---|---|
| `GET /rest/v1/<table>` | `select`, `order`, `limit`, `offset`, `eq`, `neq`, `in`, `is`, `like`, `ilike`, `or=(...)` |
| `POST /rest/v1/<table>` | Insert, with `Prefer: return=representation` and upsert on `Prefer: resolution=merge-duplicates` |
| `PATCH`, `DELETE /rest/v1/<table>` | Filtered update and delete |
| `Prefer: count=exact` | Returns a `Content-Range` header so paging counts work |
| `Accept: application/vnd.pgrst.object+json` | Returns a single object, 406 when the row count is not one |
| `POST /auth/v1/token` | Password and refresh grants, returns a bearer token and a user object |
| `GET /auth/v1/user`, `POST /auth/v1/logout` | Session checks |
| `POST /storage/v1/object/<bucket>/<path>` | In-memory upload |
| everything else | Static files from `--site`, with an `/admin` fallback |

Deliberately missing: row level security (the demo is single-user and already only has
fiction in it), RPC, realtime, SQL, and JWT verification. The token is shaped like a
JWT and is explicitly not signed.

## The dataset

Fictional on purpose, and shaped to exercise the real rendering paths:

- 9 projects, one of them a draft, one excluded from the works carousel.
- 4 experiences, 3 of them in the carousel, so `works` merges two tables.
- Descriptions that include metadata lines, block headers, a markdown heading, a
  numbered list, a table and a `Key Learnings` block.
- 7 motion entries and 5 render entries with a mix of aspect ratios and rotations.
- 6 photographs, 2 organizations, 12 skills in 4 groups, 13 settings, 3 social links.
- Placeholder artwork generated as SVG from a hash of the slot name, so captures are
  byte-stable across runs.

## Screenshot capture

`demo/capture-docs.mjs` drives the built site with puppeteer:

1. Waits for the hero to render and refuses to continue if the copy is not the demo
   copy. A capture run against a production build fails immediately.
2. Hides the custom-cursor overlays, which otherwise land in the middle of a section.
3. Applies `demo/redactions.local.json` if it exists, then checks the rendered text and
   every `href`/`src` for the identity strings it lists. If one survives, it throws.
4. Asserts that each gallery actually rendered before screenshotting it. A gallery that
   fails to load collapses to zero height, and the next screenshot would silently
   capture the section above it.
5. Closes the work modal through its own button rather than pressing Escape, because the
   modal does not bind Escape.

`redactions.local.json` is gitignored. It only matters when capturing from a build whose
page chrome still contains the owner's real strings (footer name, contact defaults, CV
filename). For a build that is entirely demo content, the file is unnecessary and the
harness says so.

## Limits worth stating

- The mock is not Postgres. Filters are applied in JavaScript, ordering is naive string
  comparison, and there are no joins.
- Writes live in memory. Restarting the server resets the dataset.
- Storage accepts anything. In production the bucket policy and the client both have an
  opinion.
- It proves the client talks to PostgREST correctly. It cannot prove a policy is right.
  That is what `scripts/verify-cms.mjs` does against a real project.