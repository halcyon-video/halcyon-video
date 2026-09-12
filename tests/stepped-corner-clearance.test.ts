import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitSteppedCornerDepth } from '../src/stepped-corner-clearance.ts';
import { NR_RUN_DEPTH } from '../src/store-layout.ts';

test('wall notch and shelf leave a four-foot aisle beside the nearest island', () => {
  const obstacle = { label: 'island', kind: 'shelving' as const, cx: 39, cz: -26, w: 2, d: 8, yaw: 0 };
  const depth = fitSteppedCornerDepth(7, 40, -38, [obstacle]);
  assert.ok(Math.abs((-30 - (-38 + depth + NR_RUN_DEPTH)) - 4) < 1e-9);
  assert.ok(depth < 7);
});

test('rotated shelf corners count, distant shelves do not shorten a clear notch', () => {
  const obstacle = { label: 'island', kind: 'shelving' as const, cx: 39, cz: -30, w: 2, d: 8, yaw: Math.PI / 4 };
  assert.ok(fitSteppedCornerDepth(7, 40, -38, [obstacle]) < 1);
  assert.equal(fitSteppedCornerDepth(7, 40, -38, [{ ...obstacle, cx: -20 }]), 7);
  assert.equal(fitSteppedCornerDepth(7, 40, -32, [obstacle]), 0);
});
