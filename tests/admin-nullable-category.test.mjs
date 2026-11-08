import test from 'node:test';
import assert from 'node:assert/strict';
import { modules } from '../admin/src/schemas.js';
import { buildPayload } from '../admin/src/payload.js';

test('optional category UUID fields save empty selection as SQL NULL', () => {
  for (const key of ['projects', 'skills', 'gallery']) {
    const config = modules[key];
    const field = config.fields.find((item) => item.name === 'category_id');
    assert.ok(field, `${key} defines category_id`);
    assert.equal(field.nullable, true, `${key}.category_id is nullable`);
    assert.equal(buildPayload(config, { category_id: '' }).category_id, null,
      `${key}.category_id empty value serializes as null`);
  }
});
