import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placementBudget } from '../src/progressive-placement.ts';

test('initial placement yields at either frame budget and resumes without losing slots', () => {
  let time = 0;
  const admit = placementBudget(() => time);
  assert.equal(admit(), true);
  time = 2;
  assert.equal(admit(), false);
  let remaining = 30_000, frames = 0;
  while (remaining) {
    const next = placementBudget(() => time);
    let processed = 0;
    while (remaining && next()) { remaining--; processed++; }
    assert.ok(processed <= 96);
    assert.ok(processed > 0);
    frames++;
  }
  assert.equal(frames, Math.ceil(30_000 / 96));
});
