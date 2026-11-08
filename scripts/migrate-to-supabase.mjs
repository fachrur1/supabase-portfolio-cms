#!/usr/bin/env node
/**
 * scripts/migrate-to-supabase.mjs - one-time import of the existing portfolio
 * content (content/data.json + content/images.json + CV PDF) into Supabase.
 *
 * SAFE BY DEFAULT:
 *   - `node scripts/migrate-to-supabase.mjs`          → dry-run (prints plan +
 *     runs the offline fidelity check, writes nothing).
 *   - `node scripts/migrate-to-supabase.mjs --confirm` → performs the import.
 *   - Re-runs never overwrite existing rows (inserts are conflict-safe and
 *     non-empty tables are skipped entirely).
 *
 * REQUIRED ENV (never commit these - see .env.example):
 *   SUPABASE_URL                e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   service-role key (server-side only!)
 *   SITE_URL                    (optional) public site origin used to resolve
 *                               relative image paths; default
 *                               https://example.com
 *
 * FIDELITY GUARANTEE: after building the rows, the script runs the same
 * mapper the public site uses (src/cms/shape.js) and compares the output to
 * the legacy content/data.json shape - descriptions must match byte-for-byte,
 * every section must round-trip. Nothing is written unless this passes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  buildContentShape,
  extractMetaLines,
  durationText,
  educationPeriod
} from '../src/cms/shape.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIRM = process.argv.includes('--confirm');
const SITE_URL = (process.env.SITE_URL || 'https://example.com').replace(/\/$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ---------------------------------------------------------------------------
// Legacy data
// ---------------------------------------------------------------------------
const legacyData = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/data.json'), 'utf-8'));
const legacyImages = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/images.json'), 'utf-8'));

function resolveUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^(data:|https?:|blob:)/i.test(s)) return s;
  return `${SITE_URL}/${s.replace(/^\.?\//, '')}`;
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'entry';
}

function parseYearRange(text) {
  // '2024' | '2026 - Present' | '2019 - 2022' -> [startISO, endISO|null]
  const s = String(text || '');
  const years = s.match(/\d{4}/g);
  if (!years || !years.length) return [null, null];
  const y1 = years[0];
  const present = /present/i.test(s);
  if (years.length >= 2 && !present) {
    const y2 = years[1];
    return [`${y1}-01-01`, y1 === y2 ? `${y2}-12-31` : `${y2}-12-31`];
  }
  if (present) return [`${y1}-01-01`, null];
  return [`${y1}-01-01`, `${y1}-12-31`];
}

function parseEduPeriod(period) {
  const [start, end] = parseYearRange(period);
  return [start, end];
}

// ---------------------------------------------------------------------------
// Transform legacy entries into CMS rows
// ---------------------------------------------------------------------------
const EXPERIENCE_CATEGORIES = new Set(['Community', 'Organization']);

const toRows = {};
let idSeed = 0;
const fakeId = (prefix) => `00000000-0000-4000-8000-${String(++idSeed).padStart(12, '0')}`;

// --- content_categories -----------------------------------------------------
const categoryRows = [];
const catIdByName = new Map();
const projectCatNames = [...new Set(
  legacyData.works
    .filter(w => !EXPERIENCE_CATEGORIES.has(w.category))
    .map(w => w.category || 'Other')
)];
projectCatNames.forEach((name, i) => {
  const id = fakeId('cat');
  catIdByName.set(`project:${name}`, id);
  categoryRows.push({ id, kind: 'project', name, slug: slugify(name), icon: null, sort_order: i * 10 });
});
legacyData.skills.forEach((group, i) => {
  const id = fakeId('cat');
  catIdByName.set(`skill:${group.category}`, id);
  categoryRows.push({
    id, kind: 'skill_group', name: group.category,
    slug: slugify(group.category), icon: group.icon || 'category', sort_order: i * 10
  });
});
toRows.content_categories = categoryRows;

// --- profiles ---------------------------------------------------------------
const hero = legacyData.hero || {};
const about = legacyData.about || {};
toRows.profiles = [{
  id: fakeId('prof'),
  full_name: `${hero.title_line1 || ''} ${hero.title_line2 || ''}`.trim(),
  hero_line1: hero.title_line1 || '',
  hero_line2: hero.title_line2 || '',
  professional_headline: hero.subtitle || '',
  short_intro: hero.description || '',
  about_heading: about.heading || '',
  about_body: about.body || '',
  profile_photo_url: resolveUrl(legacyImages.profile_image) || null,
  profile_photo_alt: `${hero.title_line1 || ''} ${hero.title_line2 || ''}`.trim(),
  professional_interests: [],
  areas_of_expertise: [],
  location: '',
  availability_status: '',
  is_primary: true,
  status: 'published'
}];

// --- projects + project_media + experiences ---------------------------------
const projectRows = [];
const projectMediaRows = [];
const experienceRows = [];

legacyData.works.forEach((work, idx) => {
  const meta = extractMetaLines(work.description || '');
  const isExperience = EXPERIENCE_CATEGORIES.has(work.category);
  const sortOrder = idx * 10;
  const [startDate, endDate] = parseYearRange(meta.Duration || '');
  const coverUrl = resolveUrl(legacyImages[work.image_id]) || null;
  const gallery = (work.gallery_ids || [])
    .map(key => ({ key, url: resolveUrl(legacyImages[key]) }))
    .filter(g => g.url);

  if (isExperience) {
    experienceRows.push({
      id: fakeId('exp'),
      slug: slugify(work.title),
      title: work.title || '',
      organization_name: meta.Organization || work.title || '',
      position: meta.Role || '',
      short_description: work.short_desc || '',
      employment_type: work.category || '',
      location: meta.Location || '',
      start_date: startDate,
      end_date: endDate,
      currently_working: /present/i.test(meta.Duration || ''),
      description: work.description || '',   // verbatim - fidelity critical
      responsibilities: '',
      achievements: '',
      skills: work.tags || [],
      logo_url: coverUrl,
      media: gallery.map(g => ({ url: g.url, caption: '', alt: '' })),
      external_links: [],
      include_in_works: true,
      display_priority: 0,
      sort_order: sortOrder,
      status: 'published'
    });
  } else {
    const projectId = fakeId('proj');
    projectRows.push({
      id: projectId,
      slug: slugify(work.title),
      title: work.title || '',
      short_description: work.short_desc || '',
      full_description: work.description || '',  // verbatim - fidelity critical
      category_id: catIdByName.get(`project:${work.category}`) || null,
      status: 'published',
      start_date: startDate,
      completion_date: endDate,
      location: meta.Location || '',
      role: meta.Role || '',
      team: meta.Organization || '',
      technologies: work.tags || [],
      tools: (meta.Tools || '').split(',').map(s => s.trim()).filter(Boolean),
      technical_skills: (meta.Focus || '').split(',').map(s => s.trim()).filter(Boolean),
      methodology: '',
      technical_specifications: '',
      key_achievements: '',
      project_outcomes: '',
      thumbnail_url: coverUrl,
      thumbnail_alt: work.title || '',
      cover_url: coverUrl,
      cover_alt: work.title || '',
      video_url: null,
      live_url: null,
      github_url: null,
      documentation_url: null,
      publication_url: null,
      related_resources: [],
      featured: false,
      include_in_works: true,
      display_priority: 0,
      sort_order: sortOrder
    });
    gallery.forEach((g, j) => {
      projectMediaRows.push({
        id: fakeId('pm'),
        project_id: projectId,
        url: g.url,
        caption: '',
        alt: '',
        sort_order: j * 10
      });
    });
  }
});
toRows.projects = projectRows;
toRows.project_media = projectMediaRows;
toRows.experiences = experienceRows;

// --- education --------------------------------------------------------------
toRows.education = (legacyData.education || []).map((e, i) => {
  const [start, end] = parseEduPeriod(e.period || '');
  return {
    id: fakeId('edu'),
    institution: e.institution || '',
    degree: '',
    field_of_study: e.major || '',
    start_date: start,
    graduation_date: end,
    description: '',
    achievements: '',
    relevant_coursework: [],
    logo_url: null,
    documents: [],
    display_order: i * 10,
    status: 'published'
  };
});

// --- skills -----------------------------------------------------------------
const skillRows = [];
(legacyData.skills || []).forEach(group => {
  const catId = catIdByName.get(`skill:${group.category}`);
  (group.items || []).forEach((name, i) => {
    skillRows.push({
      id: fakeId('skl'),
      name,
      category_id: catId,
      proficiency_level: null,
      proficiency_percent: null,
      show_proficiency: false,
      description: '',
      icon_url: null,
      related_projects: [],
      sort_order: i * 10,
      status: 'published'
    });
  });
});
toRows.skills = skillRows;

// --- organizations ----------------------------------------------------------
toRows.organizations = (legacyData.organizations || []).map((o, i) => ({
  id: fakeId('org'),
  slug: slugify(o.name),
  organization_name: o.name || '',
  position: o.role || '',
  organization_type: '',
  description: '',
  responsibilities: '',
  achievements: '',
  start_date: null,
  end_date: null,
  logo_url: null,
  related_experiences: [],
  external_links: [],
  sort_order: i * 10,
  status: 'published'
}));

// --- gallery (photography) --------------------------------------------------
toRows.gallery = (legacyData.photography || []).map((p, i) => ({
  id: fakeId('gal'),
  title: p.title || '',
  description: '',
  category_id: null,
  location: '',
  capture_date: null,
  image_url: resolveUrl(legacyImages[p.image_id]) || '',
  alt_text: '',
  featured: false,
  sort_order: i * 10,
  status: 'published'
}));

// --- site_settings (only insert keys that don't exist yet) ------------------
const contact = legacyData.contact || {};
toRows.site_settings = [
  { key: 'text_alignment', value: 'text-justify', label: 'Body text alignment' },
  { key: 'contact_heading', value: contact.heading || '', label: 'Contact section heading' },
  { key: 'contact_body', value: contact.body || '', label: 'Contact section body (markdown)' },
  { key: 'contact_email', value: contact.email || '', label: 'Contact email address' }
];

// --- social_links -----------------------------------------------------------
toRows.social_links = [
  { platform: 'email', label: 'Email', url: contact.email ? `mailto:${contact.email}` : '', icon: 'mail', sort_order: 10, visible: true },
  { platform: 'linkedin', label: 'LinkedIn', url: contact.linkedin || '', icon: 'linkedin', sort_order: 20, visible: true },
  { platform: 'instagram', label: 'Instagram', url: contact.instagram || '', icon: 'instagram', sort_order: 30, visible: true }
].filter(l => l.url);

// --- site_images (full legacy media registry, incl. unreferenced keys) ------
toRows.site_images = Object.entries(legacyImages)
  .filter(([, v]) => String(v || '').trim())
  .map(([key, v]) => ({ key, url: resolveUrl(v), alt: '', caption: '' }));

// ---------------------------------------------------------------------------
// Offline fidelity check: shape(migrated rows) must equal legacy content
// ---------------------------------------------------------------------------
function checkFidelity() {
  const shape = buildContentShape({
    profiles: toRows.profiles,
    projects: toRows.projects,
    projectMedia: toRows.project_media,
    experiences: toRows.experiences,
    education: toRows.education,
    skills: toRows.skills,
    organizations: toRows.organizations,
    gallery: toRows.gallery,
    categories: toRows.content_categories,
    settings: Object.fromEntries(toRows.site_settings.map(s => [s.key, s.value])),
    socialLinks: toRows.social_links,
    siteImages: toRows.site_images
  });

  const errors = [];
  const eq = (label, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      errors.push(`${label}\n  got:  ${JSON.stringify(got)?.slice(0, 200)}\n  want: ${JSON.stringify(want)?.slice(0, 200)}`);
    }
  };

  eq('hero', shape.textData.hero, legacyData.hero);
  eq('about', shape.textData.about, legacyData.about);
  eq('contact.heading', shape.textData.contact.heading, legacyData.contact.heading);
  eq('contact.body', shape.textData.contact.body, legacyData.contact.body);
  eq('contact.email', shape.textData.contact.email, legacyData.contact.email);
  eq('contact.linkedin', shape.textData.contact.linkedin, legacyData.contact.linkedin);
  eq('contact.instagram', shape.textData.contact.instagram, legacyData.contact.instagram);
  eq('education', shape.textData.education, legacyData.education);
  eq('skills', shape.textData.skills, legacyData.skills);
  eq('organizations', shape.textData.organizations, legacyData.organizations);
  // photography: compare title + resolved image URL (internal keys are synthetic)
  eq('photography', shape.textData.photography.map((p, i) => ({
    title: p.title,
    image: resolveUrl(shape.imgData[p.image_id])
  })), legacyData.photography.map(p => ({
    title: p.title,
    image: resolveUrl(legacyImages[p.image_id])
  })));

  // works: compare item-by-item (descriptions must be byte-identical)
  const gotWorks = shape.textData.works;
  const wantWorks = legacyData.works;
  eq('works.length', gotWorks.length, wantWorks.length);
  wantWorks.forEach((w, i) => {
    const g = gotWorks[i] || {};
    eq(`works[${i}].title`, g.title, w.title);
    eq(`works[${i}].category`, g.category, w.category);
    eq(`works[${i}].short_desc`, g.short_desc, w.short_desc);
    eq(`works[${i}].tags`, g.tags, w.tags);
    eq(`works[${i}].description`, g.description, w.description);
    // images: resolve both sides to absolute URLs before comparing
    eq(`works[${i}].image`, resolveUrl(shape.imgData[g.image_id]), resolveUrl(legacyImages[w.image_id]));
    eq(
      `works[${i}].gallery`,
      (g.gallery_ids || []).map(k => resolveUrl(shape.imgData[k])),
      (w.gallery_ids || []).map(k => resolveUrl(legacyImages[k])).filter(Boolean)
    );
  });
  eq('profile_image', resolveUrl(shape.imgData.profile_image), resolveUrl(legacyImages.profile_image));

  return errors;
}

const fidelityErrors = checkFidelity();
console.log('\n=== OFFLINE FIDELITY CHECK (migrated rows vs legacy content) ===');
if (fidelityErrors.length) {
  console.error(`FAILED - ${fidelityErrors.length} mismatch(es):`);
  for (const e of fidelityErrors) console.error('  ✗ ' + e);
  console.error('\nNothing was written. Fix the mapper/migration before importing.');
  process.exit(1);
}
console.log('PASSED - every section round-trips byte-for-byte ✓');

// ---------------------------------------------------------------------------
// Plan summary
// ---------------------------------------------------------------------------
console.log('\n=== MIGRATION PLAN ===');
for (const [table, rows] of Object.entries(toRows)) {
  console.log(`  ${table.padEnd(20)} ${rows.length} row(s)`);
}
console.log(`  ${'documents'.padEnd(20)} 1 file (cv.pdf → storage)`);

if (!CONFIRM) {
  console.log('\nDry-run only. Re-run with --confirm to import:');
  console.log('  node scripts/migrate-to-supabase.mjs --confirm');
  process.exit(0);
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\nERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to import.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Import (conflict-safe: never overwrite existing data)
// ---------------------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function insertIfEmpty(table, rows, uniqueColumn) {
  if (!rows.length) return { inserted: 0, note: 'no rows' };
  const { count, error: countErr } = await supabase
    .from(table).select('*', { count: 'exact', head: true });
  if (countErr) throw new Error(`${table}: ${countErr.message}`);
  if (count > 0) return { inserted: 0, note: `skipped (${count} existing rows - not touching)` };

  const { error } = await supabase.from(table).upsert(rows, {
    onConflict: uniqueColumn,
    ignoreDuplicates: true
  });
  if (error) throw new Error(`${table}: ${error.message}`);
  return { inserted: rows.length, note: 'inserted' };
}

async function insertMissing(table, rows, uniqueColumn) {
  // For tables pre-seeded by 0001_schema.sql (site_settings): only add missing keys
  let inserted = 0;
  for (const row of rows) {
    const { data: existing } = await supabase
      .from(table).select('*').eq(uniqueColumn, row[uniqueColumn]).maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from(table).insert(row);
    if (error) throw new Error(`${table}: ${error.message}`);
    inserted++;
  }
  return { inserted, note: 'inserted missing only' };
}

async function main() {
  console.log('\n=== IMPORT ===');

  await insertIfEmpty('content_categories', toRows.content_categories, 'id');
  await insertIfEmpty('profiles', toRows.profiles, 'id');

  // projects first, then their media (FK on project_id)
  await insertIfEmpty('projects', toRows.projects, 'id');
  const { count: pmCount } = await supabase
    .from('project_media').select('*', { count: 'exact', head: true });
  if ((pmCount ?? 0) === 0 && toRows.project_media.length) {
    // remap project ids: ids were generated locally; fetch real rows by slug
    const { data: real } = await supabase.from('projects').select('id, slug');
    const idBySlug = new Map((real || []).map(r => [r.slug, r.id]));
    const media = toRows.project_media.map(m => {
      const proj = toRows.projects.find(p => p.id === m.project_id);
      return { ...m, project_id: idBySlug.get(proj.slug) || m.project_id };
    });
    const { error } = await supabase.from('project_media').upsert(media, {
      onConflict: 'id', ignoreDuplicates: true
    });
    if (error) throw new Error(`project_media: ${error.message}`);
    console.log(`  ${'project_media'.padEnd(20)} ${media.length} row(s) inserted`);
  }

  await insertIfEmpty('experiences', toRows.experiences, 'id');
  await insertIfEmpty('education', toRows.education, 'id');
  await insertIfEmpty('skills', toRows.skills, 'id');
  await insertIfEmpty('organizations', toRows.organizations, 'id');
  await insertIfEmpty('gallery', toRows.gallery, 'id');
  await insertMissing('site_settings', toRows.site_settings, 'key');
  await insertIfEmpty('social_links', toRows.social_links, 'id');
  await insertIfEmpty('site_images', toRows.site_images, 'key');

  // CV upload + document row
  const cvPath = path.join(ROOT, 'cv.pdf');
  if (fs.existsSync(cvPath)) {
    const { data: existingDoc } = await supabase
      .from('documents').select('id').eq('doc_type', 'cv').maybeSingle();
    if (existingDoc) {
      console.log(`  ${'documents'.padEnd(20)} skipped (CV row exists - not touching)`);
    } else {
      const buf = fs.readFileSync(cvPath);
      const storagePath = `documents/cv.pdf`;
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, buf, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw new Error(`storage/documents: ${upErr.message}`);
      const { data: pub } = supabase.storage.from('documents').getPublicUrl(storagePath);
      const { error: docErr } = await supabase.from('documents').insert({
        title: 'Curriculum Vitae',
        description: 'Active CV (migrated from the static site)',
        doc_type: 'cv',
        file_url: pub.publicUrl,
        storage_path: storagePath,
        mime_type: 'application/pdf',
        file_size: buf.length,
        version: '1.0',
        is_active: true
      });
      if (docErr) throw new Error(`documents: ${docErr.message}`);
      console.log(`  ${'documents'.padEnd(20)} 1 CV uploaded + registered`);
    }
  } else {
    console.log('  documents            (cv.pdf not found - skipped)');
  }

  console.log('\nImport complete ✓');
  console.log('Next: `node scripts/verify-cms.mjs` to run the live end-to-end checks.');
}

main().catch(err => {
  console.error('\nIMPORT FAILED:', err.message);
  process.exit(1);
});
