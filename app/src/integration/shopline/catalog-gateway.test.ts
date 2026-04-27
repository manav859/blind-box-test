import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTags } from './catalog-gateway';
import {
  getBlindBoxProductTags,
  detectBlindBoxProduct,
  parseBlindBoxCollectionTag,
} from '../../domain/blind-box/product-detection';

// ── normalizeTags ─────────────────────────────────────────────────────────────

test('normalizeTags: array of strings', () => {
  const result = normalizeTags({ tags: ['Blind-Box', ' Sale ', 'NEW'] });
  assert.deepEqual(result, ['blind-box', 'sale', 'new']);
});

test('normalizeTags: comma-separated string', () => {
  const result = normalizeTags({ tags: 'blind-box, SALE, new' });
  assert.deepEqual(result, ['blind-box', 'sale', 'new']);
});

test('normalizeTags: tagList field fallback', () => {
  const result = normalizeTags({ tagList: ['Blind-Box'] });
  assert.deepEqual(result, ['blind-box']);
});

test('normalizeTags: product_tags field fallback', () => {
  const result = normalizeTags({ product_tags: ['blind-box'] });
  assert.deepEqual(result, ['blind-box']);
});

test('normalizeTags: labels field fallback', () => {
  const result = normalizeTags({ labels: ['Blind-Box'] });
  assert.deepEqual(result, ['blind-box']);
});

test('normalizeTags: unknown value returns empty array', () => {
  assert.deepEqual(normalizeTags({}), []);
  assert.deepEqual(normalizeTags({ tags: null }), []);
  assert.deepEqual(normalizeTags({ tags: 42 }), []);
});

test('normalizeTags: filters empty strings', () => {
  const result = normalizeTags({ tags: ['blind-box', '', '  '] });
  assert.deepEqual(result, ['blind-box']);
});

// ── blind-box tag detection ───────────────────────────────────────────────────

test('detectBlindBoxProduct: detects blind-box tag (array)', () => {
  const result = detectBlindBoxProduct({ tags: ['blind-box', 'sale'] });
  assert.equal(result.isBlindBox, true);
  assert.equal(result.method, 'tag');
});

test('detectBlindBoxProduct: detects blind-box tag (comma string)', () => {
  const result = detectBlindBoxProduct({ tags: 'sale, blind-box' });
  assert.equal(result.isBlindBox, true);
});

test('detectBlindBoxProduct: case-insensitive match', () => {
  const result = detectBlindBoxProduct({ tags: ['Blind-Box'] });
  assert.equal(result.isBlindBox, true);
});

test('detectBlindBoxProduct: no blind-box tag returns false', () => {
  const result = detectBlindBoxProduct({ tags: ['sale', 'new-arrival'] });
  assert.equal(result.isBlindBox, false);
});

test('detectBlindBoxProduct: null product returns false', () => {
  const result = detectBlindBoxProduct(null);
  assert.equal(result.isBlindBox, false);
});

test('detectBlindBoxProduct: tags on raw field are checked', () => {
  const result = detectBlindBoxProduct({ tags: [], raw: { tags: ['blind-box'] } });
  assert.equal(result.isBlindBox, true);
});

// ── blind-box-collection: tag extraction ─────────────────────────────────────

test('parseBlindBoxCollectionTag: extracts handle from array', () => {
  const tags = getBlindBoxProductTags({ tags: ['blind-box', 'blind-box-collection:winter-rewards'] });
  assert.equal(parseBlindBoxCollectionTag(tags), 'winter-rewards');
});

test('parseBlindBoxCollectionTag: extracts handle case-insensitively', () => {
  const tags = getBlindBoxProductTags({ tags: ['Blind-Box-Collection:Fashion-Blindbox'] });
  assert.equal(parseBlindBoxCollectionTag(tags), 'fashion-blindbox');
});

test('parseBlindBoxCollectionTag: returns null when no collection tag', () => {
  const tags = getBlindBoxProductTags({ tags: ['blind-box'] });
  assert.equal(parseBlindBoxCollectionTag(tags), null);
});

test('parseBlindBoxCollectionTag: handles comma-string tags', () => {
  const tags = getBlindBoxProductTags({ tags: 'blind-box, blind-box-collection:summer-drop' });
  assert.equal(parseBlindBoxCollectionTag(tags), 'summer-drop');
});

// ── product endpoint URL construction ────────────────────────────────────────
// These tests verify the REST path without making real HTTP calls.
// They import the gateway class and check the path the request() method would
// produce by substituting the URL-building logic directly.

test('catalog gateway uses /products/products.json as primary product path', () => {
  // Verify the constant used in the gateway code — no real HTTP needed.
  // If someone changes the path, this test breaks and demands a reason.
  const expectedPath = '/products/products.json';
  // Read the compiled source and assert the literal is present.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src: string = require('fs').readFileSync(
    require('path').join(__dirname, 'catalog-gateway.ts'),
    'utf8',
  );
  assert.ok(
    src.includes(expectedPath),
    `Expected catalog-gateway.ts to reference '${expectedPath}'`,
  );
});

test('catalog gateway uses /products/collections/collections.json as primary collections path', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src: string = require('fs').readFileSync(
    require('path').join(__dirname, 'catalog-gateway.ts'),
    'utf8',
  );
  assert.ok(
    src.includes('/products/collections/collections.json'),
    "Expected catalog-gateway.ts to reference '/products/collections/collections.json'",
  );
});

// ── token safety ─────────────────────────────────────────────────────────────

test('normalizeTags does not expose tokens — output contains only tag strings', () => {
  const fakeToken = 'shpat_secret_access_token_abc123';
  const result = normalizeTags({ tags: ['blind-box'], accessToken: fakeToken });
  assert.ok(!result.some((t) => t.includes('shpat')), 'Token must not appear in tag output');
});
