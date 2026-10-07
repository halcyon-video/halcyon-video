import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveClerkUniform, recolorClerkPixels } from '../src/clerk-uniform.ts';

test('store era selects Oxford for 1990 and 1993, then polo', () => {
  assert.equal(resolveClerkUniform(null), 'polo');
  assert.equal(resolveClerkUniform('unknown'), 'polo');
  assert.equal(resolveClerkUniform('bb-1990'), 'oxford');
  assert.equal(resolveClerkUniform('bb-1993'), 'oxford');
  assert.equal(resolveClerkUniform('bb-2000'), 'polo');
  assert.equal(resolveClerkUniform('bb-2010'), 'polo');
  assert.equal(resolveClerkUniform('oxford'), 'polo');
});
test('brand changes leave skin, khakis, and transparency untouched', () => {
  const pixels = new Uint8ClampedArray([178,123,80,255, 140,115,72,255, 200,200,200,0]);
  const before = pixels.slice();
  recolorClerkPixels(pixels, new Uint8ClampedArray([0,0,0,255, 0,0,0,255, 255,0,0,255]), [0,0,1], [1,0,0], 'polo');
  assert.deepEqual(pixels, before);
});
test('primary cloth and contrasting trim have independent brand colours', () => {
  const pixels = new Uint8ClampedArray([200,200,200,255, 200,200,200,255]);
  recolorClerkPixels(pixels, new Uint8ClampedArray([255,0,0,255, 0,255,0,255]), [0,0,1], [1,0,0], 'polo');
  assert.deepEqual([...pixels], [20,20,200,255, 200,20,20,255]);
});
test('Oxford cloth remains a pale version of the brand primary', () => {
  const pixels = new Uint8ClampedArray([200,200,200,255]);
  recolorClerkPixels(pixels, new Uint8ClampedArray([255,0,0,255]), [0,0,1], [1,0,0], 'oxford');
  assert.deepEqual([...pixels], [164,164,200,255]);
});
