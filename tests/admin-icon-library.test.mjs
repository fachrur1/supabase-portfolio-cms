/**
 * tests/admin-icon-library.test.mjs - Material Symbols library + picker wiring.
 *
 * The library is generated from the official Google metadata
 * (scripts/build-icon-library.mjs); these tests guard against typos, stale
 * generation and the picker being unwired from the form engine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ICON_GROUPS, ICON_NAMES, isKnownIcon, searchIcons } from '../admin/src/icon-library.js';

test('library ships the full official icon list', () => {
  assert.ok(ICON_NAMES.length > 3000, `expected thousands of icons, got ${ICON_NAMES.length}`);
  assert.equal(new Set(ICON_NAMES).size, ICON_NAMES.length, 'icon names must be unique');
  const bad = ICON_NAMES.filter((n) => !/^[a-z0-9_]+$/.test(n));
  assert.deepEqual(bad.slice(0, 5), [], 'names must be snake_case identifiers');
});

test('every curated group icon exists in the official list', () => {
  const missing = [];
  for (const group of ICON_GROUPS) {
    assert.ok(group.label, 'group needs a label');
    assert.ok(group.icons.length >= 4, `${group.label} should offer a usable set`);
    for (const name of group.icons) {
      if (!ICON_NAMES.includes(name)) missing.push(`${group.label}: ${name}`);
    }
  }
  assert.deepEqual(missing, [], 'curated icons must be real Material Symbols names');
});

test('every curated group icon resolves through isKnownIcon', () => {
  for (const group of ICON_GROUPS) {
    for (const name of group.icons) assert.equal(isKnownIcon(name), true, name);
  }
  assert.equal(isKnownIcon('not_a_real_icon'), false);
  assert.equal(isKnownIcon(''), false);
  assert.equal(isKnownIcon(undefined), false);
  assert.equal(isKnownIcon('  bolt  '), true, 'surrounding spaces are tolerated');
});

test('the icons this project already uses are present', () => {
  for (const name of ['energy_savings_leaf', 'settings_input_component', 'solar_power', 'map', 'category']) {
    assert.equal(isKnownIcon(name), true, `${name} must exist in the library`);
  }
});

test('searchIcons ranks prefix matches first and respects the limit', () => {
  const results = searchIcons('arrow', 5);
  assert.equal(results.length, 5);
  assert.ok(results[0].startsWith('arrow'), `first result should start with the query, got ${results[0]}`);
  assert.ok(searchIcons('arrow', 3).length <= 3);
  assert.equal(searchIcons('solar', 10)[0], 'solar_power');
});

test('searchIcons handles spaces, casing and empty queries', () => {
  assert.equal(searchIcons('').length, 0);
  assert.equal(searchIcons('   ').length, 0);
  assert.deepEqual(searchIcons('Solar Power').slice(0, 1), searchIcons('solar_power').slice(0, 1));
  assert.ok(searchIcons('GIS').length > 0);
});

test('wiring: the form engine renders icon fields and the picker is exported', () => {
  const src = fs.readFileSync(new URL('../admin/src/components.js', import.meta.url), 'utf8');
  assert.match(src, /case 'icon':\s*\n\s*return iconField\(field, value\)/);
  assert.match(src, /export function iconPicker\(/);
  assert.match(src, /import \{ ICON_GROUPS, ICON_NAMES, searchIcons, isKnownIcon \} from '\.\/icon-library\.js'/);
  assert.match(src, /attachIconPicker\(iconPick, icon, syncIconPreview\)/, 'category rows must offer the picker');
});

test('wiring: social link icon uses the icon field type', async () => {
  const { schemas } = await import('../admin/src/schemas.js');
  const iconField = schemas.social_links.fields.find((f) => f.name === 'icon');
  assert.equal(iconField.type, 'icon');
});

test('the admin page loads the Material Symbols font', () => {
  const html = fs.readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
  assert.match(html, /Material\+Symbols\+Outlined/);
});

test('the library file records how it was generated', () => {
  const src = fs.readFileSync(new URL('../admin/src/icon-library.js', import.meta.url), 'utf8');
  assert.match(src, /GENERATED FILE - do not edit by hand/);
  assert.match(src, /scripts\/build-icon-library\.mjs/);
});
