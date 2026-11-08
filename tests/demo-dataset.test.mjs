// ============================================================================
// tests/demo-dataset.test.mjs - the mapper, exercised over the demo dataset.
//
// The fixture is the same fictional dataset the demo server serves, so a change
// to the mapper that breaks the real page shapes shows up here without a
// database or a browser.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { demoDataset } from '../demo/demo-dataset.mjs';
import { buildContentShape } from '../src/cms/shape.js';

const db = demoDataset();

const shape = () => {
  const settings = Object.fromEntries(db.site_settings.map((r) => [r.key, r.value]));
  return buildContentShape({
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
};

test('demo dataset shapes into the legacy contract', () => {
  const { textData, imgData, settingsData } = shape();

  assert.ok(textData.hero.title_line1, 'hero line 1 is populated');
  assert.ok(textData.hero.title_line2, 'hero line 2 is populated');
  assert.ok(textData.about.body.includes('##'), 'about body keeps its markdown');
  assert.equal(settingsData.text_alignment, 'text-justify');
  assert.ok(imgData.profile_image, 'profile image slot is resolved');
});

test('works merges projects and experiences, drafts excluded', () => {
  const { textData } = shape();
  const published = db.projects.filter((p) => p.status === 'published' && p.include_in_works !== false).length;
  const includedExperiences = db.experiences.filter(
    (e) => e.status === 'published' && e.include_in_works === true
  ).length;

  assert.equal(textData.works.length, published + includedExperiences);
  assert.ok(
    !textData.works.some((w) => /Field Survey Workbook/.test(w.title)),
    'the draft project is not in the carousel'
  );
});

test('every work carries a description, a category and an image slot', () => {
  const { textData, imgData } = shape();
  for (const work of textData.works) {
    assert.ok(work.title, 'title');
    assert.ok(work.category, `category for ${work.title}`);
    assert.ok(work.description.length > 40, `description for ${work.title}`);
    assert.ok(work.image_id, `image slot for ${work.title}`);
    assert.ok(imgData[work.image_id], `image resolved for ${work.title}`);
  }
});

test('project galleries are grouped by project and ordered', () => {
  const { textData } = shape();
  const withGallery = textData.works.filter((w) => (w.gallery_ids || []).length > 0);
  assert.ok(withGallery.length > 0, 'at least one work has gallery images');
  for (const work of withGallery) {
    assert.ok(Array.isArray(work.gallery_ids));
    assert.equal(new Set(work.gallery_ids).size, work.gallery_ids.length, 'no duplicate slots');
  }
});

test('skills group by skill_group category, with icons', () => {
  const { textData } = shape();
  assert.ok(textData.skills.length >= 3);
  for (const group of textData.skills) {
    assert.ok(group.category);
    assert.ok(group.icon, `icon for ${group.category}`);
    assert.ok(group.items.length > 0, `items for ${group.category}`);
  }
});

test('education periods and organization roles are derived', () => {
  const { textData } = shape();
  assert.ok(textData.education.length > 0);
  for (const entry of textData.education) {
    assert.ok(entry.institution);
    assert.ok(entry.period, 'period text is derived from the dates');
  }
  for (const org of textData.organizations) {
    assert.ok(org.name && org.role);
  }
});

test('contact resolves email from settings and links from rows', () => {
  const { textData } = shape();
  assert.equal(textData.contact.email, 'hello@example.com');
  assert.ok(textData.contact.body.length > 0);
});

test('photography keeps one image slot per gallery row', () => {
  const { textData, imgData } = shape();
  const published = db.gallery.filter((g) => g.status === 'published').length;
  assert.equal(textData.photography.length, published);
  for (const photo of textData.photography) {
    assert.ok(imgData[photo.image_id], `slot resolved for ${photo.title}`);
  }
});