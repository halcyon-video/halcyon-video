import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchStickVector } from '../src/touch-stick.ts';
test('thumbstick drift is ignored and movement ramps up outside its dead zone', () => {
  assert.deepEqual(touchStickVector(0, 0), {x: 0, y: 0});
  assert.deepEqual(touchStickVector(4, -3), {x: 0, y: 0});
  const half = touchStickVector(0, -24);
  assert.equal(half.x, 0); assert.ok(half.y < -.4 && half.y > -.6);
});
test('thumbstick diagonal and off-pad movement never exceed walking speed', () => {
  const diagonal = touchStickVector(200, -200);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-10);
  assert.ok(diagonal.x > 0 && diagonal.y < 0);
  assert.deepEqual(touchStickVector(-1000, 0), {x: -1, y: 0});
  assert.deepEqual(touchStickVector(NaN, 1), {x: 0, y: 0});
});
