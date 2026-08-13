// Artwork URL construction (GH #32). These strings used to be written out at
// ten call sites across the catalog sync, the collection walk and the episode
// list; they now all route through buildItemImageUrl, so what this file really
// pins is that the consolidation changed no URL. A poster path that shifts by
// one character loads nothing and every case on the shelf comes up bare.
//
//   node --experimental-strip-types --test tests/artwork-url.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItemImageUrl, buildUserAvatarUrl } from '../src/jellyfin.ts';

const SERVER = 'http://192.168.1.9:8096';
const TOKEN = 'abc123';

test('poster URL matches what the catalog sync built inline', () => {
  assert.equal(
    buildItemImageUrl(SERVER, TOKEN, 'item-1', 'poster'),
    `${SERVER}/Items/item-1/Images/Primary?api_key=${TOKEN}`
  );
});

test('backdrop takes the indexed Backdrop/0 path, not Primary', () => {
  assert.equal(
    buildItemImageUrl(SERVER, TOKEN, 'item-1', 'backdrop'),
    `${SERVER}/Items/item-1/Images/Backdrop/0?api_key=${TOKEN}`
  );
});

test('a person portrait is a Primary image of the person item', () => {
  // Wall décor tallies the library's most-featured actors off these; they are
  // Items, not a separate People endpoint.
  assert.equal(
    buildItemImageUrl(SERVER, TOKEN, 'person-7', 'person'),
    `${SERVER}/Items/person-7/Images/Primary?api_key=${TOKEN}`
  );
});

test('maxWidth is appended only when asked for', () => {
  // The episode list caps thumbs at 400 to keep a long season cheap; the shelf
  // poster must NOT inherit that cap or every case loses its art's detail.
  assert.equal(
    buildItemImageUrl(SERVER, TOKEN, 'ep-3', 'poster', 400),
    `${SERVER}/Items/ep-3/Images/Primary?api_key=${TOKEN}&maxWidth=400`
  );
  assert.ok(!buildItemImageUrl(SERVER, TOKEN, 'ep-3', 'poster').includes('maxWidth'));
});

test('a trailing slash on the server address does not double up', () => {
  // normalizeUrl strips it, but the catalog sync passes its own `url` local
  // here and this must not depend on who cleaned it.
  assert.equal(
    buildItemImageUrl(`${SERVER}/`, TOKEN, 'item-1', 'poster'),
    `${SERVER}/Items/item-1/Images/Primary?api_key=${TOKEN}`
  );
});

test('a user avatar is tag-keyed, and absent without a tag', () => {
  // Different shape from item art on purpose: the membership-card picker runs
  // BEFORE there is a token, so this one is keyed on the image tag instead.
  assert.equal(
    buildUserAvatarUrl(SERVER, 'user-1', 'tag9'),
    `${SERVER}/Users/user-1/Images/Primary?tag=tag9&quality=90`
  );
  assert.equal(buildUserAvatarUrl(SERVER, 'user-1', undefined), null);
});
