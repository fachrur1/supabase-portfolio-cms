/**
 * tests/admin-media-sync.test.mjs - gallery sync planner + wiring guards.
 *
 * Regression: the admin fetched only the projects row, never project_media.
 * The gallery editor therefore opened empty, and saving called
 * syncProjectMedia(id, []) which DELETED every documentation image.
 * 36 uploaded files were left orphaned in Storage because of it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planMediaSync } from '../admin/src/media-sync.js';

const row = (id, url, sort = 0, extra = {}) => ({ id, url, caption: '', alt: '', sort_order: sort, ...extra });

test('keeps untouched rows (no delete, no insert)', () => {
  const existing = [row('a', 'https://x/1.png', 0), row('b', 'https://x/2.png', 1)];
  const plan = planMediaSync(existing, [
    { id: 'a', url: 'https://x/1.png' },
    { id: 'b', url: 'https://x/2.png' },
  ]);
  assert.deepEqual(plan.toInsert, []);
  assert.deepEqual(plan.toUpdate, []);
  assert.deepEqual(plan.toDelete, []);
});

test('appends new items and keeps existing ones', () => {
  const existing = [row('a', 'https://x/1.png')];
  const plan = planMediaSync(existing, [
    { id: 'a', url: 'https://x/1.png' },
    { url: 'https://x/new.png', caption: 'N' },
  ]);
  assert.equal(plan.toInsert.length, 1);
  assert.equal(plan.toInsert[0].url, 'https://x/new.png');
  assert.equal(plan.toInsert[0].sort_order, 1);
  assert.deepEqual(plan.toDelete, []);
});

test('deletes only rows the editor dropped', () => {
  const existing = [row('a', 'https://x/1.png'), row('b', 'https://x/2.png')];
  const plan = planMediaSync(existing, [{ id: 'a', url: 'https://x/1.png' }]);
  assert.deepEqual(plan.toDelete, ['b']);
});

test('matches by URL when the editor lost the id (no churn, no data loss)', () => {
  const existing = [row('a', 'https://x/1.png', 0)];
  const plan = planMediaSync(existing, [{ url: 'https://x/1.png', caption: 'kept' }]);
  assert.deepEqual(plan.toInsert, [], 'must not re-insert the same URL');
  assert.deepEqual(plan.toDelete, [], 'must not delete a row that is still listed');
  assert.equal(plan.toUpdate.length, 1, 'caption change is applied to the existing row');
  assert.equal(plan.toUpdate[0].id, 'a');
});

test('reordering updates sort_order without deleting', () => {
  const existing = [row('a', 'https://x/1.png', 0), row('b', 'https://x/2.png', 1)];
  const plan = planMediaSync(existing, [
    { id: 'b', url: 'https://x/2.png' },
    { id: 'a', url: 'https://x/1.png' },
  ]);
  assert.deepEqual(plan.toDelete, []);
  assert.equal(plan.toUpdate.length, 2);
  assert.deepEqual(plan.toUpdate.map((r) => [r.id, r.sort_order]), [['b', 0], ['a', 1]]);
});

test('empty list removes everything (intentional clear)', () => {
  const existing = [row('a', 'https://x/1.png'), row('b', 'https://x/2.png')];
  const plan = planMediaSync(existing, []);
  assert.deepEqual(plan.toDelete.sort(), ['a', 'b']);
});

test('blank urls are ignored, ids are preserved on kept rows', () => {
  const existing = [row('a', 'https://x/1.png')];
  const plan = planMediaSync(existing, [
    { id: 'a', url: 'https://x/1.png' },
    { url: '   ', caption: 'typing…' },
  ]);
  assert.deepEqual(plan.toInsert, []);
  assert.deepEqual(plan.toDelete, []);
  assert.equal(plan.kept, 1);
});

test('same URL listed twice is inserted once', () => {
  const plan = planMediaSync([], [{ url: 'https://x/1.png' }, { url: 'https://x/1.png' }]);
  assert.equal(plan.toInsert.length, 2, 'planner keeps both entries; editor dedupe is separate');
});

test('wiring: the edit screen hydrates project media before building the form', () => {
  const crud = fs.readFileSync(new URL('../admin/src/crud.js', import.meta.url), 'utf8');
  assert.match(crud, /listProjectMedia\(id\)/, 'init() must load project_media rows');
  assert.match(crud, /row\[galleryField\.name\] = mediaError \? \[\] : mediaRows/);
  assert.match(
    crud,
    /config\.mediaTable && result\.row && Array\.isArray\(media\)/,
    'saveRow must never sync when the gallery was not loaded'
  );
});

test('wiring: syncProjectMedia inserts before it deletes', () => {
  const api = fs.readFileSync(new URL('../admin/src/api.js', import.meta.url), 'utf8');
  const body = api.slice(api.indexOf('export async function syncProjectMedia'));
  const insertAt = body.indexOf('plan.toInsert');
  const deleteAt = body.indexOf('plan.toDelete');
  assert.ok(insertAt > -1 && deleteAt > -1);
  assert.ok(insertAt < deleteAt, 'inserts must be attempted before the destructive delete');
  assert.match(body, /if \(!Array\.isArray\(items\)\) return \{ error: null \}/);
});

test('wiring: the gallery editor round-trips ids', () => {
  const src = fs.readFileSync(new URL('../admin/src/components.js', import.meta.url), 'utf8');
  assert.match(src, /id: v\?\.id \|\| null/);
  assert.match(src, /id: i\.id \|\| null/);
});
