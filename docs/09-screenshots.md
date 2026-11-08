# Screenshots

Every image here was captured from the demo harness in `demo/`: a local mock of the
Supabase HTTP API serving a fictional dataset. No personal data from the production
site appears in any of them, by construction and by an automated gate that refuses to
write a file if a known identity string survives redaction.

Reproduce them:

```bash
npm run build
node demo/export-fallback.mjs --site dist --shape ../<site>/src/cms/shape.js
node demo/serve.mjs --site dist --port 8787
node demo/capture-docs.mjs --out docs/images --base http://localhost:8787
```

Desktop frames are 1440x900, mobile frames 390x844, device scale 1.

## Public page

### Hero

![Hero](images/01-hero.png)

The hero is a `profiles` row: `hero_line1`, `hero_line2` in the accent colour, the
professional headline, and a typed intro line. The two buttons are static markup; only
their CV href is rewritten at load time to the active document.

### About and education

![About](images/02-about-education.png)

The portrait is a `site_images` slot (`profile_image`) resolved through `imgData`.
The about body is markdown, rendered through the same sanitiser as every other rich
field, which is why the blockquote and the list keep their styling.

### Skills

![Skills](images/03-skills.png)

Skills are grouped by `content_categories` rows where `kind = 'skill_group'`, each with
a Material Symbols icon. Ungrouped skills fall into an "Other" group. Proficiency
percentages exist in the schema but stay hidden unless `show_proficiency` is enabled.

### Works carousel

![Works carousel](images/04-works-carousel.png)

One card at a time. The list is `projects` plus `experiences` where `include_in_works`
is true, merged and sorted, then rendered by a single template. The category comes from
`content_categories`, the tags from `technologies` (falling back to `tools`).

### Work detail modal

![Modal](images/05-work-modal.png)

![Modal body](images/05b-work-modal-body.png)

![Modal learnings](images/05c-work-modal-learnings.png)

The description is not a blob of HTML. It is parsed into a metadata grid
(`Role`, `Duration`, `Focus`, `Tools`), themed cards recognised from block headers
(`Problem:`, `Action:`, `Outcome:`, `Key Learnings:`), and a markdown body that keeps
headings, numbered steps and tables. Markdown that is not a recognised header stays
markdown, which is what the "Data and method" section shows.

### Photography

![Photography](images/06-photography.png)

A grid from the `gallery` table, with section copy from `site_settings`
(`photography_heading`, `photography_description`).

### Motion in Frames

![Motion gallery](images/07-motion-gallery.png)

Hanging prints on a wire, driven by `motion_media`. The counter, the active caption and
the side prints are all one component; the stylised "final render" label comes from
`media_type`, and the timecode from `duration`.

### Rendered studies

![3D renders](images/08-render3d-gallery.png)

The same gallery class as the section above, sourced from `render_3d` with
`data-mf-source="render3d"`. Stills instead of video, and a `rotation` column that can
turn a portrait plate into a landscape one.

### Organizations and stats

![Organizations](images/09-organizations-contact.png)

Organization cards come from the `organizations` table. The counters under them are
derived from the same payload, so they cannot drift from the lists.

### Contact

![Contact](images/09b-contact.png)

Heading and body from `site_settings`, the email and social links from `social_links`.
Hidden links are filtered by RLS, so unchecking one in the admin removes it from the
payload rather than hiding it in CSS.

### Mobile

![Mobile hero](images/10-mobile-hero.png)

![Mobile works](images/11-mobile-works.png)

Same data, same renderer, different breakpoints. The carousel becomes a single column
and the navigation collapses.

## Admin dashboard

### Login

![Login](images/12-admin-login.png)

Email and password against Supabase Auth. No registration link exists, because there is
no registration path.

### Dashboard

![Dashboard](images/13-admin-dashboard.png)

Counts per table, the most recently updated rows, and quick actions. The numbers come
from `head: true` count queries, not from fetching every row.

### Projects and experiences

![Works list](images/14-admin-works.png)

Two tabs over the same engine. Search, status filter, category filter, sortable headers,
drag handles for ordering, and per-row edit, preview and delete.

### Photography grid

![Gallery module](images/15-admin-gallery.png)

The gallery module renders as cards instead of a table, because the thumbnail matters
more than the columns. Everything else, including filters and ordering, is the same
engine.

### Media galleries

![Motion module](images/16-admin-motion.png)

![3D module](images/17-admin-render3d.png)

Both galleries are ordinary CRUD modules. The `rotation` select is a plain `select`
field, which is what keeps a design detail out of the code.

### Website settings

![Settings](images/18-admin-settings.png)

Every `site_settings` row, with its label. Editing here changes section copy on the
public page without a deploy.

### Project editor

![Project form](images/19-admin-project-form.png)

![Project form media](images/20-admin-project-form-media.png)

The form is generated from the module declaration: sectioned fields, a markdown editor
with Write and Preview, a tag input, and a gallery control that diffs child rows instead
of replacing them. The toolbar above the description is part of the editor, not a
separate plugin.

### Category manager

![Categories](images/21-admin-categories.png)

Inline editing for name, slug and icon, with drag ordering. Categories are rows, not
enums, so adding one never needs a migration.

![Icon picker](images/22-admin-icon-picker.png)

Material Symbols, 4,267 de-duplicated names, grouped by theme and searchable. The chosen
name is stored as text and rendered by the font on the public site.