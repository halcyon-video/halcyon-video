// New Releases bays: title sections are cut per wall run exactly like the
// divider panels, so a title never spans a divider or the corner between runs
// (owner's rule, 2026-09-06: one bay per title, unless a double feature takes
// two whole neighbouring bays).
//
//   npm run test:nrbays
//
// Runs under plain `node --test` with type stripping — no test framework.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nrBaysForRuns, planNrBays } from '../src/store-nr-bays.ts';

// The full-scale corporate store as measured 2026-09-06: left wall 44 cols,
// back-wall runs 130 / 10 / 10 — none a multiple of six.
const MEASURED_RUNS = [44, 130, 10, 10];

test('bays are cut per run from each run\'s own first column', () => {
  const bays = nrBaysForRuns(MEASURED_RUNS);
  assert.equal(bays.length, 8 + 22 + 2 + 2);
  let runStart = 0;
  let runIdx = 0;
  for (const bay of bays) {
    if (bay.runIdx !== runIdx) {
      runStart += MEASURED_RUNS[runIdx];
      runIdx = bay.runIdx;
    }
    assert.equal((bay.startCol - runStart) % 6, 0, `bay at ${bay.startCol} starts on a divider of run ${bay.runIdx}`);
    assert.ok(bay.endCol < runStart + MEASURED_RUNS[bay.runIdx], `bay at ${bay.startCol} stays inside run ${bay.runIdx}`);
    assert.equal(bay.cols, bay.endCol - bay.startCol + 1);
  }
  // Contiguous coverage of the whole ribbon, no gaps, no overlap.
  let next = 0;
  for (const bay of bays) {
    assert.equal(bay.startCol, next);
    next = bay.endCol + 1;
  }
  assert.equal(next, 44 + 130 + 10 + 10);
});

test('trailing partial bays keep their real width and are never "full"', () => {
  const bays = nrBaysForRuns(MEASURED_RUNS);
  const partials = bays.filter(b => !b.full);
  assert.deepEqual(partials.map(b => b.cols), [2, 4, 4, 4]);
  assert.deepEqual(partials.map(b => b.runIdx), [0, 1, 2, 3]);
  // The left wall's stub sits at its corner end, right before Run 1's first bay.
  assert.deepEqual([partials[0].startCol, partials[0].endCol], [42, 43]);
  assert.equal(bays[8].startCol, 44);
});

test('runs with no columns (no step, no left wall) contribute no bays', () => {
  assert.deepEqual(nrBaysForRuns([0, 36, 0, 0]).map(b => [b.runIdx, b.startCol, b.endCol]),
    [[1, 0, 5], [1, 6, 11], [1, 12, 17], [1, 18, 23], [1, 24, 29], [1, 30, 35]]);
  assert.deepEqual(nrBaysForRuns([0, 0, 0, 0]), []);
});

test('a double-feature only takes two full side-by-side bays of the same run', () => {
  // Left wall = 7 full bays + a 2-col stub; asking for 4 doubles fits 3 on the
  // left wall (bays 0-1, 2-3, 4-5), and the 4th must skip bay 6 (its neighbour
  // is the stub) AND the stub itself, landing on Run 1's first pair.
  const bays = nrBaysForRuns(MEASURED_RUNS);
  const plan = planNrBays(bays, 4, 0);
  assert.deepEqual(plan.doubleStarts, [0, 2, 4, 8]);
  for (const b of plan.doubleStarts) {
    assert.ok(bays[b].full && bays[b + 1].full);
    assert.equal(bays[b].runIdx, bays[b + 1].runIdx);
  }
  // A 10-column run (one full bay + a 4-col stub) can never host a double.
  assert.deepEqual(planNrBays(nrBaysForRuns([0, 10, 0, 0]), 1, 0).doubleStarts, []);
});

test('super-features avoid partial bays; every bay ends up with exactly one role', () => {
  const bays = nrBaysForRuns(MEASURED_RUNS);
  const plan = planNrBays(bays, 2, 5);
  assert.deepEqual(plan.doubleStarts, [0, 2]);
  assert.deepEqual(plan.superBays, [4, 5, 6, 8, 9]); // bay 7 is the 2-col stub
  const roles = new Array(bays.length).fill(0);
  for (const b of plan.doubleStarts) { roles[b]++; roles[b + 1]++; }
  for (const b of plan.superBays) roles[b]++;
  for (const b of plan.regularBays) roles[b]++;
  assert.ok(roles.every(n => n === 1), 'each bay is claimed exactly once');
  assert.ok(plan.regularBays.includes(7), 'the stub bay shows regular titles');
});

test('wants are upper bounds — a wall too short for them places fewer', () => {
  const plan = planNrBays(nrBaysForRuns([0, 14, 0, 0]), 3, 3); // 2 full bays + 2-col stub
  assert.deepEqual(plan.doubleStarts, [0]);
  assert.deepEqual(plan.superBays, []);
  assert.deepEqual(plan.regularBays, [2]);
});
