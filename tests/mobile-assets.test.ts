import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mobileAssetPath} from '../src/mobile-assets.ts';
test('phone surface variants retain map kind while desktop stays original', () => {
 for (const map of ['color','normal','roughness']) {
  const path = `textures/surfaces/store-carpet/${map}.png`;
  assert.equal(mobileAssetPath(path,true),`mobile/textures/surfaces/store-carpet/${map}.webp`);
  assert.equal(mobileAssetPath(path,false),path);
 }
});
test('private drop-ins, provider URLs, and unknown assets never get rewritten', () => {
 for (const path of ['user-assets/surfaces/store-carpet/color.png','https://server/art.png','textures/new.png']) assert.equal(mobileAssetPath(path,true),path);
});
