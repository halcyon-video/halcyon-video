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
import type { Movie } from '../src/providers/media-source-provider.ts';
import { selectNewReleases, stockNewReleaseBays } from '../src/store-new-releases.ts';
import { nrBaysForRuns, planNrBays } from '../src/store-nr-bays.ts';

// The full-scale corporate store as measured 2026-09-06: left wall 44 cols,
// back-wall runs 130 / 10 / 10 — none a multiple of eight.
const MEASURED_RUNS = [44, 130, 10, 10];

test('bays are cut per run from each run\'s own first column', () => {
  const bays = nrBaysForRuns(MEASURED_RUNS);
  assert.equal(bays.length, 6 + 17 + 2 + 2);
  let runStart = 0;
  let runIdx = 0;
  for (const bay of bays) {
    if (bay.runIdx !== runIdx) {
      runStart += MEASURED_RUNS[runIdx];
      runIdx = bay.runIdx;
    }
    assert.equal((bay.startCol - runStart) % 8, 0, `bay at ${bay.startCol} starts on a divider of run ${bay.runIdx}`);
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
  assert.deepEqual(partials.map(b => b.cols), [4, 2, 2, 2]);
  assert.deepEqual(partials.map(b => b.runIdx), [0, 1, 2, 3]);
  // The left wall's stub sits at its corner end, right before Run 1's first bay.
  assert.deepEqual([partials[0].startCol, partials[0].endCol], [40, 43]);
  assert.equal(bays[6].startCol, 44);
});

test('runs with no columns (no step, no left wall) contribute no bays', () => {
  assert.deepEqual(nrBaysForRuns([0, 36, 0, 0]).map(b => [b.runIdx, b.startCol, b.endCol]),
    [[1, 0, 7], [1, 8, 15], [1, 16, 23], [1, 24, 31], [1, 32, 35]]);
  assert.deepEqual(nrBaysForRuns([0, 0, 0, 0]), []);
});

test('a double-feature only takes two full side-by-side bays of the same run', () => {
  // Left wall = 7 full bays + a 2-col stub; asking for 4 doubles fits 3 on the
  // left wall (bays 0-1, 2-3, 4-5), and the 4th must skip bay 6 (its neighbour
  // is the stub) AND the stub itself, landing on Run 1's first pair.
  const bays = nrBaysForRuns(MEASURED_RUNS);
  const plan = planNrBays(bays, 4, 0);
  assert.deepEqual(plan.doubleStarts, [0, 2, 6, 8]);
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
  assert.deepEqual(plan.superBays, [4, 6, 7, 8, 9]); // bay 7 is the 2-col stub
  const roles = new Array(bays.length).fill(0);
  for (const b of plan.doubleStarts) { roles[b]++; roles[b + 1]++; }
  for (const b of plan.superBays) roles[b]++;
  for (const b of plan.regularBays) roles[b]++;
  assert.ok(roles.every(n => n === 1), 'each bay is claimed exactly once');
  assert.ok(plan.regularBays.includes(5), 'the stub bay shows regular titles');
});

test('wants are upper bounds — a wall too short for them places fewer', () => {
  const plan = planNrBays(nrBaysForRuns([0, 18, 0, 0]), 3, 3); // 2 full bays + 2-col stub
  assert.deepEqual(plan.doubleStarts, [0]);
  assert.deepEqual(plan.superBays, []);
  assert.deepEqual(plan.regularBays, [2]);
});

function film(title: string, extra: Partial<Movie> = {}): Movie {
  return { id: title, title, year: 1990, duration: '', rating: '', overview: '', director: '',
    actors: [], genres: [], localPath: '', ...extra };
}

test('personal releases use valid add dates, independent of ratings, premiere or catalog order', () => {
  const latest = film('Archive find', { tmdbId: 21, dateCreated: '2026-10-03' });
  const previous = film('Summer premiere', { year: 2026, dateCreated: '2026-10-02', criticRating: 99 });
  const other = { dateCreated: '2026-10-04' };
  const items = [previous, film('Undated'), film('Malformed', { dateCreated: 'bad' }),
    film('Show', { ...other, isSeries: true }), film('Game', { ...other, game: true }),
    film('Online', { ...other, streaming: true }), film('Suggested', { ...other, discovery: true }),
    film('Pending', { ...other, comingSoon: true }), film('Missing', { ...other, collectionGap: true }),
    { ...latest, id: 'another-server', dateCreated: '2026-10-01' }, latest];
  assert.deepEqual(selectNewReleases(items, null), [latest, previous]);
  assert.deepEqual(selectNewReleases(items.toReversed(), null), [latest, previous]);
  assert.deepEqual(selectNewReleases([film('Unknown')], null), []);
});

test('only the newest titles that fit reach physical bays, then they face out alphabetically', () => {
  const movies = Array.from({ length: 32 }, (_, i) => film('Title ' + (32 - i), {
    dateCreated: new Date(Date.UTC(2026, 8, 32 - i)).toISOString(),
    criticRating: i === 1 || i >= 20 ? 99 : 40,
    communityRating: i === 1 || i >= 20 ? 9 : 4,
  }));
  const ranked = selectNewReleases(movies.toReversed(), null);
  const wall = stockNewReleaseBays(nrBaysForRuns([48]), ranked, true);
  assert.equal(wall.sections.filter(s => s.type === 'double-feature').length, 1);
  assert.deepEqual(wall.movies, movies.slice(0, 20));
  const faces = wall.sections.flatMap(s => s.movies ?? [s.movie!]);
  assert.deepEqual([...new Set(faces)], wall.movies.toReversed());
  assert.deepEqual(faces, faces.toSorted((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })));
  assert.deepEqual(stockNewReleaseBays(nrBaysForRuns([8]), ranked, false).movies, movies.slice(0, 8));
});

test('short or empty walls repeat only eligible stock and pinned and external stores remain browsable', () => {
  const a = film('A', { dateCreated: '2026-08-01', premiereDate: '1985-01-01' });
  const b = film('B', { dateCreated: '2026-07-01', premiereDate: '1989-01-01' });
  const future = film('Later', { premiereDate: '1995-01-01' });
  assert.deepEqual(selectNewReleases([a, b, future], new Date('1990-01-01')), [b, a]);
  const online = film('Streaming', { streaming: true, premiereDate: '2026-09-01' });
  assert.deepEqual(selectNewReleases([online], null), [online]);
  const game = film('Game', { game: true, year: 0 });
  assert.deepEqual(selectNewReleases([game], null), [game]);
  const bays = nrBaysForRuns([8]);
  assert.deepEqual(stockNewReleaseBays(bays, [], true).sections[0].movies, []);
  const wall = stockNewReleaseBays(bays, [a, b], false);
  assert.deepEqual(wall.movies, [a, b]);
  assert.deepEqual(wall.sections[0].movies, [a, a, a, a, b, b, b, b]);
  assert.deepEqual(stockNewReleaseBays([], [a], true), { movies: [], sections: [] });
});
