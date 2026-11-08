# demo

A local, dependency-free stand-in for Supabase plus a fictional dataset. Read
[docs/10-demo-harness.md](../docs/10-demo-harness.md) for the full explanation.

## Quick use

```bash
npm run build                                # build the site first
node demo/export-fallback.mjs --site dist    # fictional api/*.json
node demo/serve.mjs --site dist              # http://localhost:8787
```

Public page: `http://localhost:8787/`
Admin: `http://localhost:8787/admin/` with `admin@example.com` / `demo-password`

## Files

| File | Role |
|---|---|
| `demo-dataset.mjs` | Fictional rows for all 16 tables |
| `serve.mjs` | Static server plus mock PostgREST, GoTrue and Storage |
| `export-fallback.mjs` | Writes the static fallback bundles from the demo rows |
| `capture-docs.mjs` | Puppeteer capture run that produces `docs/images/` |
| `redactions.local.json` | Gitignored. Identity strings to redact when capturing from a build that still carries them |

## Notes

- The mock is not Postgres. Filters run in JavaScript, writes live in memory, and
  restarting resets the data.
- There is no RLS in the mock. It is a single-user demo with only fiction in it.
- `capture-docs.mjs` refuses to run against a page whose hero is not the demo hero, and
  refuses to write a screenshot if a redaction target survives. That is the guarantee
  that the published screenshots contain no personal data.