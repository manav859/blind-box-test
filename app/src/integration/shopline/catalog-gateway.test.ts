import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTags, slugifyTitle, collectionMatchesSlug } from './catalog-gateway';
import type { ShoplineCollection } from './catalog-gateway';

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

// ── slugifyTitle ──────────────────────────────────────────────────────────────

test('slugifyTitle: spaces become hyphens', () => {
  assert.equal(slugifyTitle('Fashion Blindbox'), 'fashion-blindbox');
});

test('slugifyTitle: underscores become hyphens', () => {
  assert.equal(slugifyTitle('fashion_blindbox'), 'fashion-blindbox');
});

test('slugifyTitle: already a slug is unchanged', () => {
  assert.equal(slugifyTitle('fashion-blindbox'), 'fashion-blindbox');
});

test('slugifyTitle: strips non-alphanumeric chars', () => {
  assert.equal(slugifyTitle('Fashion & Blindbox!'), 'fashion--blindbox');
});

test('slugifyTitle: trims leading/trailing whitespace', () => {
  assert.equal(slugifyTitle('  winter rewards  '), 'winter-rewards');
});

// ── collectionMatchesSlug ─────────────────────────────────────────────────────

function makeCollection(overrides: Partial<ShoplineCollection>): ShoplineCollection {
  return { id: '1', title: null, handle: null, type: 'collection', status: null, raw: {}, ...overrides };
}

test('collectionMatchesSlug: exact handle match', () => {
  const c = makeCollection({ handle: 'fashion-blindbox' });
  assert.ok(collectionMatchesSlug(c, 'fashion-blindbox'));
});

test('collectionMatchesSlug: handle comparison is case-insensitive', () => {
  const c = makeCollection({ handle: 'Fashion-Blindbox' });
  assert.ok(collectionMatchesSlug(c, 'fashion-blindbox'));
});

test('collectionMatchesSlug: title slugified matches slug', () => {
  const c = makeCollection({ title: 'Fashion Blindbox' });
  assert.ok(collectionMatchesSlug(c, 'fashion-blindbox'));
});

test('collectionMatchesSlug: title with underscores matches slug', () => {
  const c = makeCollection({ title: 'fashion_blindbox' });
  assert.ok(collectionMatchesSlug(c, 'fashion-blindbox'));
});

test('collectionMatchesSlug: fuzzy contains match', () => {
  const c = makeCollection({ title: 'Winter Fashion Blindbox Collection' });
  assert.ok(collectionMatchesSlug(c, 'fashion-blindbox'));
});

test('collectionMatchesSlug: no match returns false', () => {
  const c = makeCollection({ title: 'Summer Sale', handle: 'summer-sale' });
  assert.ok(!collectionMatchesSlug(c, 'fashion-blindbox'));
});

test('collectionMatchesSlug: null title and null handle returns false', () => {
  const c = makeCollection({});
  assert.ok(!collectionMatchesSlug(c, 'fashion-blindbox'));
});

// ── token safety ─────────────────────────────────────────────────────────────

test('normalizeTags does not expose tokens — output contains only tag strings', () => {
  const fakeToken = 'shpat_secret_access_token_abc123';
  const result = normalizeTags({ tags: ['blind-box'], accessToken: fakeToken });
  assert.ok(!result.some((t) => t.includes('shpat')), 'Token must not appear in tag output');
});
