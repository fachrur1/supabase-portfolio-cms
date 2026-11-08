/**
 * tests/admin-fields.test.mjs - admin form field helpers + wiring guards.
 *
 * Regression: every category dropdown (Skills → Group, Projects → Category,
 * Gallery → Category) rendered only “- None -” because `buildForm` never
 * forwarded the loaded `content_categories` rows to the select control.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectChoices, needsPlaceholderOption } from '../admin/src/fields.js';

const SKILL_GROUPS = [
  { id: 'b1a1', name: 'Renewable Energy', slug: 'renewable-energy' },
  { id: 'b2b2', name: 'GIS Analysis', slug: 'gis-analysis' },
];

test('selectChoices: category-backed field maps rows to options', () => {
  const field = { name: 'category_id', type: 'select', optionsFromCategories: 'skill_group', nullable: true };
  assert.deepEqual(selectChoices(field, SKILL_GROUPS), [
    { value: 'b1a1', label: 'Renewable Energy' },
    { value: 'b2b2', label: 'GIS Analysis' },
  ]);
});

test('selectChoices: empty/undefined categories never throw', () => {
  const field = { name: 'category_id', optionsFromCategories: 'skill_group' };
  assert.deepEqual(selectChoices(field, undefined), []);
  assert.deepEqual(selectChoices(field, null), []);
  assert.deepEqual(selectChoices({ name: 'x' }, SKILL_GROUPS), []);
});

test('selectChoices: static options still work (proficiency, status)', () => {
  const field = { name: 'status', type: 'select', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }] };
  assert.deepEqual(selectChoices(field), [
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
  ]);
});

test('selectChoices: rows without an id are dropped, slug/name fallbacks used', () => {
  const rows = [{ id: 'x1', name: '' , slug: 'from-slug' }, { id: 'x2' }, { name: 'no id' }];
  assert.deepEqual(selectChoices({ optionsFromCategories: 'gallery' }, rows), [
    { value: 'x1', label: 'from-slug' },
    { value: 'x2', label: 'x2' },
  ]);
});

test('needsPlaceholderOption: keeps an unmatched saved id visible', () => {
  const field = { optionsFromCategories: 'skill_group' };
  const choices = selectChoices(field, SKILL_GROUPS);
  assert.equal(needsPlaceholderOption(field, 'b1a1', choices), false); // present
  assert.equal(needsPlaceholderOption(field, 'stale-id', choices), true); // filtered out
  assert.equal(needsPlaceholderOption(field, '', choices), false);
  assert.equal(needsPlaceholderOption(field, null, choices), false);
});

test('needsPlaceholderOption: required static select keeps an unknown value', () => {
  assert.equal(needsPlaceholderOption({ required: true, options: [] }, 'legacy', []), true);
  assert.equal(needsPlaceholderOption({ required: false, options: [] }, 'legacy', []), false);
});

test('wiring: buildForm forwards the loaded categories to renderControl', () => {
  const crud = fs.readFileSync(new URL('../admin/src/crud.js', import.meta.url), 'utf8');
  assert.match(
    crud,
    /renderControl\(field,\s*values0\[field\.name\],\s*\{\s*config,\s*categories\s*\}\)/,
    'buildForm must pass categories into renderControl'
  );
  assert.match(
    crud,
    /listCategories\(config\.categoryKind\)/,
    'edit/new screens must load categories for the current module'
  );
});

test('wiring: renderControl forwards ctx to defaultControl and uses selectChoices', () => {
  const src = fs.readFileSync(new URL('../admin/src/components.js', import.meta.url), 'utf8');
  assert.match(src, /defaultControl\(field,\s*value,\s*ctx\)/);
  assert.match(src, /selectChoices\(field,\s*ctx\.categories\)/);
  assert.match(src, /needsPlaceholderOption\(field,\s*value,\s*choices\)/);
});

test('wiring: every category-backed field declares its kind in schemas.js', async () => {
  const { modules } = await import('../admin/src/schemas.js');
  const backed = [];
  for (const [key, mod] of Object.entries(modules)) {
    for (const field of mod.fields || []) {
      if (field.optionsFromCategories) backed.push({ module: key, field: field.name, kind: field.optionsFromCategories, configKind: mod.categoryKind });
    }
  }
  assert.ok(backed.length >= 3, 'expected category-backed selects in the admin schemas');
  for (const entry of backed) {
    assert.equal(entry.configKind, entry.kind, `${entry.module}.${entry.field} must match categoryKind`);
  }
});
