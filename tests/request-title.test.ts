import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRequestTitle } from '../src/request-title.ts';

test('only request stock with a configured integration has request controls and stickers', () => {
  const gap = { collectionGap: true, tmdbId: 42 };
  assert.equal(isRequestTitle(gap, false), false);
  assert.equal(isRequestTitle(gap, true), true);
  assert.equal(isRequestTitle({ discovery: true, tmdbId: 42 }, true), true);
  assert.equal(isRequestTitle({ tmdbId: 42 }, true), false);
  assert.equal(isRequestTitle({ ...gap, streaming: true }, true), false);
  assert.equal(isRequestTitle({ streaming: true, tmdbId: 42 }, false), false);
  assert.equal(isRequestTitle({ ...gap, game: true }, true), false);
  for (const tmdbId of [undefined, NaN, 0, -1, 1.5]) {
    assert.equal(isRequestTitle({ ...gap, tmdbId }, true), false);
  }
});
