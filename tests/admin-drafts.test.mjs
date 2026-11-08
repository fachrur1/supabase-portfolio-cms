/**
 * tests/admin-drafts.test.mjs - draft store + router wiring guards.
 *
 * Regression: the admin router re-renders #content on every hash change, so a
 * form in progress (fields plus documentation media that only exists in the
 * form state) was wiped the moment the editor opened another tab. Uploading the
 * first documentation image, glancing at the Gallery tab and coming back lost
 * the upload.
 *
 * These tests pin the storage behaviour and the wiring that makes the form
 * snapshot itself before the router throws its DOM away.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  draftKey, readDraft, writeDraft, clearDraft, rowFromValues, describeDraft, DRAFT_TTL_MS,
} from '../admin/src/drafts.js';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

const CRUD = fs.readFileSync(path.join(process.cwd(), 'admin/src/crud.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(process.cwd(), 'admin/src/main.js'), 'utf8');

test('draft keys are stable per table and id', () => {
  assert.equal(draftKey('projects', 'abc'), 'cms:draft:projects:abc');
  assert.equal(draftKey('projects', null), 'cms:draft:projects:new');
  assert.equal(draftKey('experiences', undefined), 'cms:draft:experiences:new');
});

test('a written draft round-trips with its media list', () => {
  const store = new MemoryStorage();
  const row = rowFromValues({ title: 'Thesis' }, [{ url: 'a.png' }, { url: 'b.png' }]);
  assert.equal(writeDraft(store, 'projects', 'p1', row), true);

  const draft = readDraft(store, 'projects', 'p1');
  assert.ok(draft);
  assert.equal(draft.row.title, 'Thesis');
  assert.equal(draft.row.__project_media.length, 2);
  assert.equal(describeDraft(draft.row).media, 2);
});

test('new-entry drafts use the "new" slot and do not collide with saved rows', () => {
  const store = new MemoryStorage();
  writeDraft(store, 'projects', null, { title: 'draft' });
  assert.ok(readDraft(store, 'projects', null));
  assert.equal(readDraft(store, 'projects', 'some-id'), null);
});

test('clearing removes the draft', () => {
  const store = new MemoryStorage();
  writeDraft(store, 'projects', 'p1', { title: 'x' });
  clearDraft(store, 'projects', 'p1');
  assert.equal(readDraft(store, 'projects', 'p1'), null);
});

test('stale drafts are dropped after the TTL', () => {
  const store = new MemoryStorage();
  const now = 1_700_000_000_000;
  writeDraft(store, 'projects', 'p1', { title: 'old' }, now);
  assert.equal(readDraft(store, 'projects', 'p1', now + DRAFT_TTL_MS - 1000).row.title, 'old');
  assert.equal(readDraft(store, 'projects', 'p1', now + DRAFT_TTL_MS + 1), null);
  // …and the stale entry is removed rather than left to rot
  assert.equal(store.getItem(draftKey('projects', 'p1')), null);
});

test('corrupt or foreign JSON never crashes the editor', () => {
  const store = new MemoryStorage();
  store.setItem(draftKey('projects', 'bad'), 'not json{');
  assert.equal(readDraft(store, 'projects', 'bad'), null);

  store.setItem(draftKey('projects', 'shape'), JSON.stringify({ at: Date.now(), row: 'nope' }));
  assert.equal(readDraft(store, 'projects', 'shape'), null);

  store.setItem(draftKey('projects', 'noat'), JSON.stringify({ row: { title: 'x' } }));
  assert.equal(readDraft(store, 'projects', 'noat'), null);
});

test('a disabled storage backend degrades to no-op instead of throwing', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(readDraft(broken, 'projects', 'p1'), null);
  assert.equal(writeDraft(broken, 'projects', 'p1', { title: 'x' }), false);
  assert.doesNotThrow(() => clearDraft(broken, 'projects', 'p1'));
  assert.equal(readDraft(null, 'projects', 'p1'), null);
});

test('rowFromValues only folds media in when it is an array', () => {
  assert.deepEqual(rowFromValues({ a: 1 }, null), { a: 1 });
  assert.deepEqual(rowFromValues({ a: 1 }, []), { a: 1, __project_media: [] });
  assert.equal(describeDraft({ a: 1 }).media, 0);
  assert.equal(describeDraft({ __media: [{ url: 'x' }] }).media, 1);
});

/* --- wiring: the router must snapshot BEFORE it replaces #content ---- */

test('router flushes the active form draft before rendering a new section', () => {
  const routeIdx = MAIN.indexOf('async function route()');
  assert.ok(routeIdx > -1, 'route() should exist');
  const afterRoute = MAIN.slice(routeIdx, routeIdx + 400);
  assert.match(afterRoute, /flushActiveFormDraft\(\)/, 'route() must flush the draft first');
  assert.ok(
    afterRoute.indexOf('flushActiveFormDraft()') < afterRoute.indexOf('parseRoute'),
    'the flush must happen before the new route is resolved/rendered'
  );
  assert.match(MAIN, /import \{[^}]*flushActiveFormDraft[^}]*\} from '\.\/crud\.js'/, 'main.js must import the flush helper');
});

test('the form restores a draft, marks itself dirty and offers a discard action', () => {
  assert.match(CRUD, /const draft = readDraft\(config, id\);/, 'the form must look for a draft');
  assert.match(CRUD, /row = \{ \.\.\.row, \.\.\.draft\.row \}/, 'the draft must be merged over the fetched row');
  assert.match(CRUD, /if \(draft && draft\.row\) setDirty\(true\);/, 'a restored draft counts as unsaved work');
  assert.match(CRUD, /draftBanner\(/, 'a banner must explain the restored draft');
  assert.match(CRUD, /data-act="discard-draft"/, 'the banner needs a discard action');
  assert.match(CRUD, /clearDraft\(config, id\);/, 'discarding must clear the stored draft');
});

test('saving clears the draft (also for a brand-new entry)', () => {
  const anchor = CRUD.indexOf("querySelector('[data-act=\"save\"]')");
  assert.ok(anchor > -1, 'the save handler should exist');
  const saveBlock = CRUD.slice(anchor, anchor + 1800);
  assert.match(saveBlock, /clearDraft\(config, id\);/, 'save must drop the draft for this row');
  assert.match(saveBlock, /if \(isNew\) clearDraft\(config, null\);/, 'save must drop the "new" draft slot too');
});

test('tab navigation is never blocked, explicit cancel still confirms', () => {
  assert.match(CRUD, /const guard = \(\) => true;/, 'route changes must not be blocked anymore');
  assert.match(CRUD, /const confirmDiscard = \(\) =>/, 'Cancel/Back keeps a discard confirmation');
  assert.match(CRUD, /if \(confirmDiscard\(\)\) leave\(\);/, 'Cancel/Back must ask before throwing changes away');
});
