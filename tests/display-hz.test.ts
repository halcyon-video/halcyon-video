// Unit tests for the two pure fps-target rules in display-hz.ts: the
// presentation cap (computeFpsCap, which picks an even divisor of the panel's
// refresh) and the resolution scaler's separate, bounded target
// (computeScalerTargetFps).
//
//   npm run test:displayhz
//
// Runs under plain `node --test` with type stripping — no test framework.
// measureDisplayHz() is not covered here: it needs a live rAF cadence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFpsCap,
  computeScalerTargetFps,
  SCALER_TARGET_FPS_CAP,
} from '../src/display-hz.ts';

test('computeFpsCap targets 60 by default, on an even divisor of the panel', () => {
  assert.equal(computeFpsCap(60, null), 60);
  assert.equal(computeFpsCap(120, null), 60);
  assert.equal(computeFpsCap(144, null), 72);
  assert.equal(computeFpsCap(165, null), 82.5);
  assert.equal(computeFpsCap(240, null), 60);
  // 'auto' is the SERVICE MODE row's default cycle position, same as unset.
  assert.equal(computeFpsCap(144, 'auto'), 72);
});

test("computeFpsCap '0' presents uncapped at the panel's real refresh", () => {
  assert.equal(computeFpsCap(60, '0'), 60);
  assert.equal(computeFpsCap(144, '0'), 144);
  assert.equal(computeFpsCap(240, '0'), 240);
});

test('computeFpsCap clamps an explicit override to 24..hz', () => {
  assert.equal(computeFpsCap(144, '30'), 36); // 144/floor(144/30) = 144/4
  assert.equal(computeFpsCap(60, '1000'), 60); // never faster than the panel
  assert.equal(computeFpsCap(60, '5'), 30); // floored at 24, then the even divisor
});

test('computeFpsCap ignores a non-numeric override rather than stalling', () => {
  assert.equal(computeFpsCap(120, 'nonsense'), 60);
});

test('the scaler target never chases a rate resolution cannot buy', () => {
  // The bug this guards: uncapped presentation on a high-refresh panel put the
  // step-up threshold at ~0.97 x 144 = 140fps, which a mid-range GPU cannot
  // reach in this scene at any resolution — so resScale walked to its floor
  // and could never climb back out.
  assert.equal(computeScalerTargetFps(144), SCALER_TARGET_FPS_CAP);
  assert.equal(computeScalerTargetFps(165), SCALER_TARGET_FPS_CAP);
  assert.equal(computeScalerTargetFps(240), SCALER_TARGET_FPS_CAP);
  assert.ok(computeScalerTargetFps(144) * 0.97 < 60);
});

test('the scaler still defends a target below the cap', () => {
  assert.equal(computeScalerTargetFps(60), 60);
  assert.equal(computeScalerTargetFps(30), 30);
  assert.equal(computeScalerTargetFps(72), SCALER_TARGET_FPS_CAP);
});

test('the scaler target survives a garbage fps target', () => {
  assert.equal(computeScalerTargetFps(0), SCALER_TARGET_FPS_CAP);
  assert.equal(computeScalerTargetFps(-1), SCALER_TARGET_FPS_CAP);
  assert.equal(computeScalerTargetFps(NaN), SCALER_TARGET_FPS_CAP);
});
