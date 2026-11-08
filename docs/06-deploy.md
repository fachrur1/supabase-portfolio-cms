# Build and deploy

The site is a static bundle on Cloudflare Pages. There is no server runtime, no
functions layer, and no environment configuration at request time. Everything the
browser needs is decided at build time.

## Build

```bash
npm run build
```

Two steps, in this order:

1. `tsx scripts/build-cms.ts` writes `public/api/*.json` from `content/`. This is the
   static fallback the page uses when Supabase is unreachable.
2. `vite build` bundles the page, the admin app and the extra entries into `dist/`.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are inlined by Vite during step 2.
Two consequences:

- A build made on a laptop with a valid `.env` is deployable as-is. Pages does not
  need its own environment variables.
- Changing the Supabase project requires a rebuild, not a dashboard setting.

## Deploy to Cloudflare Pages

```bash
npx wrangler pages deployment list --project-name <project>   # find the production branch
npx wrangler pages deploy dist --project-name <project> --branch=main
```

**Use the project's existing production branch.** If the project was created with
production branch `main`, deploying with `--branch=production` creates a separate
deployment environment. The result looks successful and is misleading: the
`<project>.pages.dev` alias shows the new build while the custom domain keeps serving
the previous one, sometimes for hours, depending on how the check is made.

When the production branch is unclear, check the Cloudflare dashboard or
`deployment list`: the production deployment is labelled as such.

## Verify the real domain

The deployment alias is not what visitors see. Verify the custom domain:

```bash
curl -s "https://<domain>/?v=$(date +%s)" | grep -c "<marker from the new build>"
```

Then open it in a browser and check the sections that changed. A cache-busting query
is not paranoia: the alias and the domain are served by different cache rules, and the
domain is the one that matters.

Also confirm the admin app answers:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/admin/
```

A 200 on `/admin/` only proves the HTML is served. The login form proves the bundle
built with the expected environment.

## What ships

| Path | Content |
|---|---|
| `index.html` plus `assets/*` | The public page and its hashed bundles |
| `admin/` | The admin SPA, `noindex, nofollow` |
| `api/*.json` | Static fallback content |
| `assets/images/*` | Legacy images referenced by absolute URL |
| extra entry points | Standalone tools built from the same repo |

Hashed asset filenames mean a rewrite of `index.html` is enough for a new deploy;
there is no need to purge individual assets.

One cache quirk worth knowing: `public/assets/images/*` is served from the static
directory while `dist/assets/` is also the hashed bundle output directory. Right after
a deploy, a legacy image URL can 404 for a short window. Re-check after propagation
before concluding that the path is broken.

## Rollback

Every deploy is immutable and listed in the dashboard. Rolling back means promoting a
previous deployment, which is why the production branch matters: a deployment made to
a different branch cannot be promoted to production.

If the build itself is broken, the fastest safe move is to re-deploy the previous
commit rather than to patch forward. The database is versioned by migrations, not by
deployments, so content written after the last good build stays intact.

## Deploy checklist

- [ ] `node --test` passes
- [ ] `node scripts/verify-cms.mjs` all green
- [ ] `npm run build` succeeds, no missing env warning
- [ ] Browser smoke of `dist/` locally: sections, modal, gallery, CV link, `/admin/`
- [ ] Deploy to the production branch
- [ ] Custom domain shows the new marker, cache-busted
- [ ] `/admin/` login works with a real account