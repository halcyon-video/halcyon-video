// Shared-place link parsing/building (issue #137). Pure string-in/string-out
// logic with no DOM dependency for the parse half, which is what most of the
// contract's correctness rests on — see src/shared-place.ts's header for why
// it's kept dependency-free. The URL-building half needs `location`, so it's
// covered by tools/verify_shared_place.mjs (real browser) instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSharedPlace } from '../src/shared-place.ts';

test('no params -> null (bare link boots the ordinary store)', () => {
  assert.equal(parseSharedPlace(''), null);
  assert.equal(parseSharedPlace('?demo=1'), null);
});

test('?title= -> a title place, flip defaulting false', () => {
  assert.deepEqual(parseSharedPlace('?title=Return+of+the+Harness'), {
    kind: 'title', title: 'Return of the Harness', flip: false,
  });
});

test('?title=&flip=1 -> flip true', () => {
  assert.deepEqual(parseSharedPlace('?title=Foo&flip=1'), {
    kind: 'title', title: 'Foo', flip: true,
  });
});

test('blank/whitespace-only title is treated as absent', () => {
  assert.equal(parseSharedPlace('?title=%20%20'), null);
});

test('?walk=x,z -> yaw/pitch default 0, y defaults to eye height', () => {
  assert.deepEqual(parseSharedPlace('?walk=11,-20'), {
    kind: 'walk', x: 11, z: -20, yaw: 0, pitch: 0, y: 5.5,
  });
});

test('?walk=x,z,yaw,pitch,y -> every field carried through', () => {
  assert.deepEqual(parseSharedPlace('?walk=11.5,-20.25,90,-4,5.2'), {
    kind: 'walk', x: 11.5, z: -20.25, yaw: 90, pitch: -4, y: 5.2,
  });
});

test('malformed walk (non-numeric, or fewer than 2 fields) is ignored, not thrown', () => {
  assert.equal(parseSharedPlace('?walk=nope'), null);
  assert.equal(parseSharedPlace('?walk=11'), null);
});

test('title takes priority over walk when both are present', () => {
  const place = parseSharedPlace('?title=Foo&walk=11,-20');
  assert.equal(place?.kind, 'title');
});

test('never exposes the private harness surface (?state=/?lib=/bb_*) as a place', () => {
  assert.equal(parseSharedPlace('?state=promo&lib=400&bb_theme=bb-2000'), null);
});
