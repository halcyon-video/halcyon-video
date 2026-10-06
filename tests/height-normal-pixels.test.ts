import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeHeightNormalPixels } from '../src/height-normal-pixels.ts';

test('flat heights produce upright opaque normals, regardless of other channels', () => {
  const input = new Uint8ClampedArray([20, 1, 2, 0, 20, 255, 9, 8]);
  const output = new Uint8ClampedArray(input.length);
  writeHeightNormalPixels(input, output, 2, 1, 1.5);
  assert.deepEqual([...output], [128, 128, 255, 255, 128, 128, 255, 255]);
  assert.deepEqual([...input], [20, 1, 2, 0, 20, 255, 9, 8]);
});

test('opposing ramp normals wrap across the horizontal tile edge', () => {
  const input = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
  const output = new Uint8ClampedArray(input.length);
  writeHeightNormalPixels(input, output, 3, 1, 1);
  assert.deepEqual([...output], [37, 128, 218, 255, 218, 128, 218, 255, 128, 128, 255, 255]);
});

test('opposing ramp normals wrap across the vertical tile edge', () => {
  const input = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
  const output = new Uint8ClampedArray(input.length);
  writeHeightNormalPixels(input, output, 1, 3, 1);
  assert.deepEqual([...output], [128, 37, 218, 255, 128, 218, 218, 255, 128, 128, 255, 255]);
});
