import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContentShape } from '../src/cms/shape.js';

test('public shape exposes editable photography heading and description settings', () => {
  const shape = buildContentShape({
    settings: {
      photography_heading: 'Photography',
      photography_description: 'A visual storyteller.'
    }
  });

  assert.equal(shape.textData.photography_heading, 'Photography');
  assert.equal(shape.textData.photography_description, 'A visual storyteller.');
});
