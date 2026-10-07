import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
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

test('phones use the current rendered clerk sheets instead of the retired mobile art', () => {
 for (const pass of ['color', 'livery']) {
  const source = `textures/clerk/${pass}.png`;
  assert.equal(mobileAssetPath(source, true), `mobile/textures/clerk/rendered-${pass}.webp`);
  assert.equal(mobileAssetPath(source, false), source);
 }
});

test('compressed clerk assets are regenerated together when either source atlas changes', () => {
 const record = JSON.parse(readFileSync(new URL('fixtures/mobile-clerk-sources.json', import.meta.url), 'utf8'));
 for (const [path, expected] of Object.entries(record)) {
  const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected,
    `${path} changed: regenerate the phone atlas pair and update its source receipt`);
 }
});
