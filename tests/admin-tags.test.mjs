/**
 * tests/admin-tags.test.mjs - tag fields must be plain string arrays.
 *
 * Regression: buildPayload() routed `tags` through the gallery branch, so a
 * software tag typed as ["Blender"] was written to the database as
 * [{url:'',caption:'',alt:''}] and the site rendered "[object Object]".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, toTagList } from '../admin/src/payload.js';
import { arr, labelOf } from '../src/cms/shape.js';

const config = {
  fields: [
    { name: 'software', type: 'tags' },
    { name: 'media', type: 'gallery' },
    { name: 'title', type: 'text' },
  ],
};

test('tags survive the payload builder as strings', () => {
  const payload = buildPayload(config, {
    title: 'Kota',
    software: ['Blender', 'After Effects'],
    media: [{ url: 'https://x/1.png', caption: 'c', alt: 'a' }],
  });
  assert.deepEqual(payload.software, ['Blender', 'After Effects']);
  // gallery keeps its object shape
  assert.deepEqual(payload.media, [{ url: 'https://x/1.png', caption: 'c', alt: 'a' }]);
  assert.equal(payload.title, 'Kota');
});

test('a single tag is never wrapped in an object', () => {
  const payload = buildPayload(config, { software: ['SketchUp'] });
  assert.deepEqual(payload.software, ['SketchUp']);
  assert.equal(typeof payload.software[0], 'string');
});

test('toTagList accepts strings, csv strings and legacy objects', () => {
  assert.deepEqual(toTagList(['a', 'b']), ['a', 'b']);
  assert.deepEqual(toTagList('a, b ,c'), ['a', 'b', 'c']);
  assert.deepEqual(toTagList([{ label: 'Blender' }, { value: 'Maya' }, { name: 'ZBrush' }]), ['Blender', 'Maya', 'ZBrush']);
  assert.deepEqual(toTagList([{ url: '', caption: '', alt: '' }]), []);
  assert.deepEqual(toTagList([null, undefined, 3, 'x']), ['3', 'x']);
  assert.deepEqual(toTagList(['a', 'a', ' b ']), ['a', 'b']);
  assert.deepEqual(toTagList(null), []);
});

test('renderer array coercion never stringifies an object', () => {
  assert.deepEqual(arr(['QGIS', 'LEAP']), ['QGIS', 'LEAP']);
  assert.deepEqual(arr([{ url: '', caption: '', alt: '' }]), []);
  assert.deepEqual(arr([{ label: 'QGIS' }]), ['QGIS']);
  assert.deepEqual(arr('a, b'), ['a', 'b']);
  assert.deepEqual(arr(null), []);
  assert.equal(labelOf({ title: 'Blender' }), 'Blender');
  assert.equal(labelOf({}), '');
  assert.equal(labelOf(undefined), '');
});
