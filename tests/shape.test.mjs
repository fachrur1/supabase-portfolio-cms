/**
 * tests/shape.test.mjs - unit tests for the CMS row → legacy shape mapper.
 * Run: node --test tests/shape.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arr,
  yearOf,
  durationText,
  educationPeriod,
  hasMetaLine,
  hasBlockHeader,
  hasAnyMetaLine,
  extractMetaLines,
  ensureMetaBlock,
  startsWithMetaLine,
  buildProjectDescription,
  buildExperienceDescription,
  experienceTitle,
  buildContentShape
} from '../src/cms/shape.js';

test('arr() normalizes jsonb arrays and strings', () => {
  assert.deepEqual(arr(['a', 'b']), ['a', 'b']);
  assert.deepEqual(arr('a, b ,c'), ['a', 'b', 'c']);
  assert.deepEqual(arr(null), []);
  assert.deepEqual(arr(undefined), []);
});

test('yearOf extracts 4-digit years', () => {
  assert.equal(yearOf('2026-01-01'), '2026');
  assert.equal(yearOf('2024'), '2024');
  assert.equal(yearOf(null), '');
});

test('durationText matches legacy style', () => {
  assert.equal(durationText('2024-01-01', '2024-12-31', false), '2024');
  assert.equal(durationText('2026-01-01', null, false), '2026 - Present');
  assert.equal(durationText('2026-01-01', '2026-06-01', true), '2026 - Present');
  assert.equal(durationText('2019-01-01', '2022-12-31', false), '2019 - 2022');
  assert.equal(durationText(null, null, false), '');
});

test('educationPeriod matches legacy style', () => {
  assert.equal(educationPeriod({ start_date: '2022-01-01', graduation_date: null }), '2022 - Present');
  assert.equal(educationPeriod({ start_date: '2019-01-01', graduation_date: '2022-01-01' }), '2019 - 2022');
  assert.equal(educationPeriod({}), '');
});

test('meta-line and block-header detection', () => {
  const text = 'Role: Tester\n\n**Organization:** UGM\n\nOutcome:\n\nGood.\n\nKey Learnings:\n\n- x';
  assert.ok(hasMetaLine(text, 'Role'));
  assert.ok(hasMetaLine(text, 'Organization'));
  assert.ok(!hasMetaLine(text, 'Tools'));
  assert.ok(hasBlockHeader(text, 'Outcome'));
  assert.ok(hasBlockHeader(text, 'Key Learnings'));
  assert.ok(!hasBlockHeader(text, 'Problem'));
  assert.ok(hasAnyMetaLine(text));
  assert.ok(!hasAnyMetaLine('just a plain sentence'));
});

test('extractMetaLines reads legacy meta keys only', () => {
  const text = 'Role: Research Staff\n\nOrganization: RESP\n\nDuration: 2026 - Present\n\nNot a meta: value\n\nProblem:\n\n...';
  assert.deepEqual(extractMetaLines(text), {
    Role: 'Research Staff',
    Organization: 'RESP',
    Duration: '2026 - Present'
  });
});

test('buildProjectDescription: self-describing body stays verbatim', () => {
  const body = 'Role: X\n\nDuration: 2024\n\nProblem:\n\nP';
  const out = buildProjectDescription({
    role: 'X', team: 'Org that would duplicate', location: 'Somewhere',
    start_date: '2024-01-01', completion_date: '2024-12-31',
    tools: ['A'], technical_skills: ['B'], full_description: body
  });
  assert.equal(out, body); // byte-identical, no merged meta lines
});

test('buildProjectDescription: narrative body gets structured meta merged', () => {
  const out = buildProjectDescription({
    role: 'Designer', team: 'Team X', location: 'YK',
    start_date: '2024-01-01', completion_date: null,
    tools: ['Blender'], technical_skills: [],
    full_description: 'A short narrative.',
    project_outcomes: 'Shipped it.'
  });
  assert.ok(out.startsWith('Role: Designer\n\nOrganization: Team X\n\nDuration: 2024 - Present\n\nLocation: YK\n\nTools: Blender\n\nA short narrative.'));
  assert.ok(out.includes('Outcome:\n\nShipped it.'));
});

test('ensureMetaBlock: a description that opens with a meta line is untouched', () => {
  const body = 'Role: Mine\n\nDuration: 2025\n\nProblem:\n\nP';
  assert.equal(ensureMetaBlock(body, [['Role', 'Mine'], ['Location', 'YK']]), body);
  assert.ok(startsWithMetaLine(body));
  assert.ok(!startsWithMetaLine('A narrative that mentions Role: later on.'));
});

test('ensureMetaBlock: mid-text meta is kept and only missing keys are added', () => {
  const body = 'Intro paragraph.\n\nMy role required adaptation.\n\nDuration: 1 Month (Full-time)\n\nFocus: Ops';
  const out = ensureMetaBlock(body, [
    ['Role', 'Engineering Intern'],
    ['Organization', 'PT JKB'],
    ['Duration', '2025 - 2026'],
    ['Location', 'Indramayu'],
    ['Focus', 'Ops'],
    ['Tools', '']
  ]);
  // Added on top: Role, Organization, Location (Duration/Focus already present).
  assert.ok(out.startsWith('Role: Engineering Intern\n\nOrganization: PT JKB\n\nLocation: Indramayu\n\nIntro paragraph.'));
  // Author's own wording wins, and no key is duplicated.
  assert.equal((out.match(/^Duration:/gm) || []).length, 1);
  assert.ok(out.includes('Duration: 1 Month (Full-time)'));
  assert.ok(!/^Duration: 2025 - 2026$/m.test(out));
  assert.ok(!out.includes('Tools:'));
});

test('buildProjectDescription: empty structured fields add no meta lines', () => {
  const out = buildProjectDescription({
    role: '', team: '', location: '', start_date: null, completion_date: null,
    tools: [], technologies: [], technical_skills: [],
    full_description: 'Only prose.'
  });
  assert.equal(out, 'Only prose.');
});

test('buildProjectDescription: tools fall back to technologies for the meta line', () => {
  const out = buildProjectDescription({
    role: 'Intern', tools: [], technologies: ['AutoCAD', 'Excel'],
    full_description: 'Prose.'
  });
  assert.ok(out.startsWith('Role: Intern\n\nTools: AutoCAD, Excel\n\nProse.'));
});

test('buildExperienceDescription merges position/org for empty bodies', () => {
  const out = buildExperienceDescription({
    position: 'Intern', organization_name: 'ACME', location: 'Jakarta',
    start_date: '2025-01-01', end_date: null, currently_working: true,
    description: '', responsibilities: 'Did things', achievements: 'Won award'
  });
  assert.ok(out.includes('Role: Intern'));
  assert.ok(out.includes('Organization: ACME'));
  assert.ok(out.includes('Duration: 2025 - Present'));
  assert.ok(out.includes('Action:\n\nDid things'));
  assert.ok(out.includes('Outcome:\n\nWon award'));
});

test('experienceTitle overrides then composes', () => {
  assert.equal(experienceTitle({ title: 'Exact Title', organization_name: 'A', position: 'B' }), 'Exact Title');
  assert.equal(experienceTitle({ organization_name: 'A', position: 'B' }), 'A - B');
  assert.equal(experienceTitle({ organization_name: 'A' }), 'A');
});

const baseRows = {
  profiles: [{
    hero_line1: 'Morgan', hero_line2: 'Owner',
    professional_headline: 'Student', short_intro: 'Intro',
    about_heading: 'About', about_body: 'Body',
    profile_photo_url: 'https://x.test/p.jpg', is_primary: true, status: 'published'
  }],
  categories: [{ id: 'c1', kind: 'project', name: 'Research', slug: 'research', sort_order: 0 }],
  projects: [
    {
      id: 'p2', slug: 'second', title: 'Second', short_description: 's2',
      full_description: 'd2', category_id: 'c1', status: 'published',
      sort_order: 20, include_in_works: true, technologies: ['T2']
    },
    {
      id: 'p1', slug: 'first', title: 'First', short_description: 's1',
      full_description: 'd1', category_id: 'c1', status: 'published',
      sort_order: 10, include_in_works: true, technologies: ['T1'],
      cover_url: 'https://x.test/cover.jpg'
    },
    {
      id: 'p3', slug: 'draft', title: 'Draft', short_description: 's3',
      full_description: 'd3', status: 'draft', sort_order: 5, include_in_works: true
    },
    {
      id: 'p4', slug: 'hidden', title: 'NotInWorks', short_description: 's4',
      full_description: 'd4', status: 'published', sort_order: 1, include_in_works: false
    }
  ],
  projectMedia: [
    { project_id: 'p1', url: 'https://x.test/g1.jpg', sort_order: 10 },
    { project_id: 'p1', url: '', sort_order: 20 }
  ],
  experiences: [],
  education: [],
  skills: [],
  organizations: [],
  gallery: [],
  settings: { text_alignment: 'text-justify', contact_heading: 'Hi', contact_body: 'Body', contact_email: 'a@b.test' },
  socialLinks: [{ platform: 'linkedin', url: 'https://li.test', visible: true }],
  siteImages: [{ key: 'profile_image', url: 'https://x.test/old.jpg' }]
};

test('buildContentShape: drafts excluded, works ordered, images resolved', () => {
  const { textData, imgData } = buildContentShape(baseRows);
  const titles = textData.works.map(w => w.title);
  assert.deepEqual(titles, ['First', 'Second']); // draft + include_in_works=false excluded, sort_order respected
  assert.equal(textData.works[0].category, 'Research');
  assert.equal(textData.works[0].image_id, 'wm1'); // p1 is index 1 in the source array
  assert.equal(imgData[textData.works[0].image_id], 'https://x.test/cover.jpg');
  assert.deepEqual(textData.works[0].gallery_ids, ['wg1_0']); // empty URL dropped
  assert.equal(imgData['wg1_0'], 'https://x.test/g1.jpg');
  assert.equal(textData.works[1].image_id, '');
});

test('buildContentShape: hero/about/contact/settings wiring', () => {
  const { textData, imgData, settingsData } = buildContentShape(baseRows);
  assert.deepEqual(textData.hero, {
    title_line1: 'Morgan', title_line2: 'Owner',
    subtitle: 'Student', description: 'Intro'
  });
  assert.equal(textData.about.heading, 'About');
  assert.equal(textData.contact.email, 'a@b.test');
  assert.equal(textData.contact.linkedin, 'https://li.test');
  assert.equal(settingsData.text_alignment, 'text-justify');
  assert.equal(imgData.profile_image, 'https://x.test/p.jpg'); // profile field wins over site_images
});

test('buildContentShape: skill grouping and ordering', () => {
  const rows = {
    ...baseRows,
    categories: [
      { id: 'g1', kind: 'skill_group', name: 'GIS', icon: 'map', sort_order: 10 },
      { id: 'g2', kind: 'skill_group', name: 'Energy', icon: 'leaf', sort_order: 0 }
    ],
    skills: [
      { name: 'QGIS', category_id: 'g1', status: 'published', sort_order: 0 },
      { name: 'LEAP', category_id: 'g2', status: 'published', sort_order: 0 },
      { name: 'DraftSkill', category_id: 'g2', status: 'draft', sort_order: 5 },
      { name: 'Solo', category_id: null, status: 'published', sort_order: 0 }
    ]
  };
  const { textData } = buildContentShape(rows);
  assert.deepEqual(textData.skills, [
    { category: 'Energy', icon: 'leaf', items: ['LEAP'] },
    { category: 'GIS', icon: 'map', items: ['QGIS'] },
    { category: 'Other', icon: 'category', items: ['Solo'] }
  ]);
});

test('buildContentShape: empty input is safe', () => {
  const { textData, imgData } = buildContentShape({});
  assert.deepEqual(textData.works, []);
  assert.deepEqual(textData.education, []);
  assert.equal(textData.hero.title_line1, '');
  assert.deepEqual(imgData, { profile_image: '' });
});
