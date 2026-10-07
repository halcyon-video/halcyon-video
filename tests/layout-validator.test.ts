import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout, type Footprint } from '../src/layout-validator.ts';
const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
const box = (label: string, cx: number, yaw = 0): Footprint =>
  ({ label, kind: 'fixture', cx, cz: 0, w: 2, d: 2, yaw });

test('diagonal rectangles retain SAT clearance warnings despite separated world bounds', () => {
  assert.deepEqual(validateLayout([box('a', 0, Math.PI / 4), box('b', 4.35, Math.PI / 4)], bounds),
    [{ severity: 'warn', a: 'a', b: 'b', message: 'only 1.08 ft clearance (min 1.5 ft)' }]);
});

test('explicit clearances still apply to structures and far-separated rectangles', () => {
  const a = { ...box('a', 0), clearance: 8 };
  const b: Footprint = { ...box('b', 9), kind: 'structure' };
  assert.deepEqual(validateLayout([a, b], bounds),
    [{ severity: 'warn', a: 'a', b: 'b', message: 'only 7.00 ft clearance (min 8.0 ft)' }]);
  b.cx = 20;
  assert.deepEqual(validateLayout([a, b], bounds), []);
});

test('a moved or rotated footprint is re-evaluated on the next validation', () => {
  const a = box('a', 0), b = box('b', 8);
  b.w = 8; b.d = 1; b.yaw = Math.PI / 2;
  assert.deepEqual(validateLayout([a, b], bounds), []);
  b.cx = 4; b.yaw = 0;
  assert.deepEqual(validateLayout([a, b], bounds),
    [{ severity: 'error', a: 'a', b: 'b', message: 'overlaps by 1.00 ft' }]);
});
