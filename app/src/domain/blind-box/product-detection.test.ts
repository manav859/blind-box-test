import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectBlindBoxProduct,
  isBlindBoxProduct,
  parseBlindBoxCollectionTag,
} from './product-detection';

test('isBlindBoxProduct matches the supported blind-box tag aliases', () => {
  assert.equal(
    isBlindBoxProduct({
      tags: ['featured', 'blind-box'],
    }),
    true,
  );

  assert.equal(
    isBlindBoxProduct({
      tags: ['blind-box-active'],
    }),
    true,
  );
});

test('detectBlindBoxProduct falls back to raw SHOPLINE payload tags when normalized tags are absent', () => {
  const result = detectBlindBoxProduct({
    raw: {
      tags: 'featured, blind-box',
    },
  });

  assert.equal(result.isBlindBox, true);
  assert.equal(result.method, 'tag');
  assert.equal(result.matchedValue, 'blind-box');
});

test('isBlindBoxProduct returns false for untagged products', () => {
  assert.equal(
    isBlindBoxProduct({
      tags: ['featured', 'summer'],
    }),
    false,
  );
});

test('parseBlindBoxCollectionTag extracts the collection handle from blind-box tags', () => {
  assert.equal(
    parseBlindBoxCollectionTag(['blind-box', 'blind-box-collection:anime-figures']),
    'anime-figures',
  );
});

test('parseBlindBoxCollectionTag returns null when no collection tag is present', () => {
  assert.equal(parseBlindBoxCollectionTag(['blind-box', 'featured']), null);
});

test('parseBlindBoxCollectionTag returns null for an empty collection handle', () => {
  assert.equal(parseBlindBoxCollectionTag(['blind-box-collection:']), null);
});
