import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drainUploadSteps, type UploadStep } from '../src/upload-budget.ts';

test('does not start even the first task without headroom', () => {
  let called = false;
  const queue = [() => { called = true; }];
  assert.equal(drainUploadSteps(queue, () => 1.75, 2, 16), 0);
  assert.equal(called, false);
  assert.equal(queue.length, 1);
});
test('an indivisible overrun stops the frame without losing subsequent work', () => {
  let time = 0;
  const queue = [() => { time += 5; }, () => { time += 1; }];
  assert.equal(drainUploadSteps(queue, () => time, 2, 16), 1);
  assert.equal(queue.length, 1);
});
test('continuations finish before later jobs and survive a frame boundary', () => {
  let time = 0, slices = 0, published = false;
  const queue: UploadStep[] = [() => { time += 0.6; return ++slices === 4; },
    () => { published = true; }];
  drainUploadSteps(queue, () => time, 2, 16);
  assert.equal(slices, 3);
  assert.equal(published, false);
  drainUploadSteps(queue, () => time, time + 2, 16);
  assert.equal(published, true);
  assert.equal(queue.length, 0);
});
test('exceptions do not wedge the queue', () => {
  const queue: UploadStep[] = [() => { throw Error('expected test failure'); }, () => {}];
  drainUploadSteps(queue, () => 0, 2, 16);
  assert.equal(queue.length, 0);
});
