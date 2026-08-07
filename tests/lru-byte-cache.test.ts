// The byte-budgeted LRU cache backing video-case.ts's posterPixelCache /
// lowResCache (see lru-byte-cache.ts's header for why: an unbounded Map here
// was the ~1.7GB heap leak on the demo catalog). Covers the two properties
// that actually matter for that fix: recency is refreshed on read (so a
// still-being-viewed entry survives), and the byte budget is enforced by
// evicting the truly-oldest entry, releasing its reference.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LruByteCache } from '../src/lru-byte-cache.ts';

function bytes(n: number): Uint8Array {
  return new Uint8Array(n);
}

test('set() evicts the oldest entry once the byte budget is exceeded', () => {
  const cache = new LruByteCache(25); // room for exactly 2 x 10-byte + slack, not 3
  cache.set('a', bytes(10));
  cache.set('b', bytes(10));
  cache.set('c', bytes(10)); // pushes total to 30 > 25 — 'a' (oldest) must go
  assert.equal(cache.has('a'), false);
  assert.equal(cache.has('b'), true);
  assert.equal(cache.has('c'), true);
  assert.equal(cache.byteSize, 20);
});

test('get() refreshes recency so a re-accessed entry is not the eviction victim', () => {
  const cache = new LruByteCache(25);
  cache.set('a', bytes(10));
  cache.set('b', bytes(10));
  cache.get('a'); // touch 'a' — 'b' is now the oldest
  cache.set('c', bytes(10)); // over budget — 'b' must be evicted, not 'a'
  assert.equal(cache.has('a'), true);
  assert.equal(cache.has('b'), false);
  assert.equal(cache.has('c'), true);
});

test('a single entry larger than the budget is kept, not evicted to empty', () => {
  const cache = new LruByteCache(10);
  cache.set('huge', bytes(1000));
  assert.equal(cache.has('huge'), true);
  assert.equal(cache.size, 1);
});

test('re-setting an existing key updates its byte accounting instead of double-counting', () => {
  const cache = new LruByteCache(1000);
  cache.set('a', bytes(10));
  cache.set('a', bytes(50));
  assert.equal(cache.byteSize, 50);
  assert.equal(cache.size, 1);
});

test('clear() drops every reference and resets byte accounting', () => {
  const cache = new LruByteCache(1000);
  cache.set('a', bytes(10));
  cache.set('b', bytes(10));
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.byteSize, 0);
  assert.equal(cache.has('a'), false);
});

test('delete() removes an entry and updates byte accounting', () => {
  const cache = new LruByteCache(1000);
  cache.set('a', bytes(10));
  cache.set('b', bytes(10));
  assert.equal(cache.delete('a'), true);
  assert.equal(cache.has('a'), false);
  assert.equal(cache.byteSize, 10);
  assert.equal(cache.delete('missing'), false);
});

test('setBudget() shrinking the budget evicts immediately', () => {
  const cache = new LruByteCache(1000);
  cache.set('a', bytes(10));
  cache.set('b', bytes(10));
  cache.set('c', bytes(10));
  cache.setBudget(15); // only room for the newest entry
  assert.equal(cache.has('a'), false);
  assert.equal(cache.has('b'), false);
  assert.equal(cache.has('c'), true);
});
