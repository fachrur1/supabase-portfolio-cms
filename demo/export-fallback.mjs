#!/usr/bin/env node
// ============================================================================
// demo/export-fallback.mjs - turn the demo dataset into the static fallback
// JSON files the public page loads when Supabase is unreachable.
//
//   node demo/export-fallback.mjs --site <dir-with-built-site> [--shape <path/to/src/cms/shape.js>]
//
// It exercises the real mapper (src/cms/shape.js) over the demo rows, so the
// demo doubles as a smoke test of buildContentShape().
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { demoDataset } from './demo-dataset.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const siteDir = path.resolve(arg('site', 'dist'));
const shapePath = path.resolve(arg('shape', 'src/cms/shape.js'));

if (!fs.existsSync(shapePath)) {
  console.error(`[demo] shape mapper not found at ${shapePath} - pass --shape <repo>/src/cms/shape.js`);
  process.exit(1);
}

const { buildContentShape } = await import(pathToFileURL(shapePath).href);
const db = demoDataset();

const settings = Object.fromEntries(db.site_settings.map((r) => [r.key, r.value]));

const shape = buildContentShape({
  profiles: db.profiles,
  projects: db.projects,
  projectMedia: db.project_media,
  experiences: db.experiences,
  education: db.education,
  skills: db.skills,
  organizations: db.organizations,
  gallery: db.gallery,
  categories: db.content_categories,
  settings,
  socialLinks: db.social_links,
  documents: db.documents,
  siteImages: db.site_images
});

const apiDir = path.join(siteDir, 'api');
fs.mkdirSync(apiDir, { recursive: true });

const write = (name, value) => {
  fs.writeFileSync(path.join(apiDir, name), JSON.stringify(value, null, 2));
  console.log(`[demo] wrote api/${name}`);
};

write('data.json', shape.textData);
write('images.json', shape.imgData);
write('settings.json', shape.settingsData);
write('motion.json', {
  heading: settings.motion_heading,
  description: settings.motion_description,
  items: db.motion_media
});
write('render3d.json', {
  heading: settings.render3d_heading,
  description: settings.render3d_description,
  items: db.render_3d
});
write('contact.json', {
  heading: settings.contact_heading,
  body: settings.contact_body,
  email: settings.contact_email
});

console.log(`[demo] fallback bundles written to ${apiDir}`);
console.log(
  `[demo] shape check: ${shape.textData.works.length} works, ` +
  `${shape.textData.education.length} education, ` +
  `${shape.textData.skills.length} skill groups, ` +
  `${shape.textData.photography.length} photographs, ` +
  `${Object.keys(shape.imgData).length} image slots`
);