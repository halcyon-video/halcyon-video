// Pin 056: a shelf-run genre section used to stop mid-row and resume on an
// unrelated row. Root cause: fillField() (src/store-plan.ts) can pour a
// single straight physical row as several `lineId` CHUNKS purely to cap run
// length at maxRunUnits (a real RUN_BREAK_GAP cross-aisle between chunks),
// but StorePlan.planRuns()'s per-library walk-order pass and
// entryBlockOrder() used to treat every lineId as an independent, freely
// reorderable "line" — so the 2-opt could route the walk order through an
// unrelated line between two chunks that are actually flush continuations of
// the same row, and the content assigned to the second chunk (via
// entryBlockOrder) had nothing to do with the first. Fix: ShelvingUnit now
// carries rowGroupId, shared by every chunk poured from one fillField() run,
// and both the walk-order grouping and entryBlockOrder() key off it instead
// of the raw per-chunk lineId — so a same-row split can never separate two
// chunks that are physically flush.
//
// Runs under plain `node --test` with type stripping (StorePlan is pure
// layout math — no THREE renderer, no DOM):
//
//   node --experimental-strip-types --test tests/store-plan.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie, JellyfinLibrary } from '../src/jellyfin.ts';
import { activeStoreFormat } from '../src/store-format.ts';
import { StorePlan } from '../src/store-plan.ts';
import { BOX_SPACING, MAX_SHELF_COLS, RUN_BREAK_GAP, type ArrangementId, type ShelvingUnit } from '../src/store-layout.ts';

function mkMovie(i: number, genre: string): Movie {
  return {
    id: `m${i}`,
    title: `Title ${String(i).padStart(5, '0')}`,
    year: 2000 + (i % 20),
    duration: '1h 30m',
    rating: 'PG',
    overview: '',
    director: '',
    actors: [],
    genres: [genre],
    localPath: '',
  };
}

// Eight genre tags, each mapping to exactly one STORE_CATEGORY_ORDER category
// (see storeCategoryCandidates), so a big library sections cleanly with no
// GENERAL overflow noise to wade through.
const GENRE_TAGS = ['Action', 'Comedy', 'Drama', 'Thriller', 'Horror', 'Sci-Fi', 'Family', 'Romance'];

function buildBigLibrary(count: number): JellyfinLibrary {
  const movies: Movie[] = [];
  for (let i = 0; i < count; i++) movies.push(mkMovie(i, GENRE_TAGS[i % GENRE_TAGS.length]));
  return { id: 'Big', name: 'Big Library', movies, genres: GENRE_TAGS };
}

// Every pair of lineId chunks (same library) that are physically flush
// continuations of ONE straight row: chunk A's last unit sits exactly
// (unit length + RUN_BREAK_GAP) from chunk B's first unit, dead ahead along
// the row's own direction — i.e. exactly what fillField() produces when a
// row's unit count crosses the maxRunUnits cap.
function findSameRowContinuations(plan: StorePlan, libIdx: number) {
  const L = (MAX_SHELF_COLS - 1) * BOX_SPACING + 1.0;
  const units = plan.shelvingUnits.filter((u) => u.libraryIdx === libIdx);
  const byLine = new Map<number, ShelvingUnit[]>();
  for (const u of units) {
    let arr = byLine.get(u.lineId);
    if (!arr) byLine.set(u.lineId, (arr = []));
    arr.push(u);
  }
  for (const arr of byLine.values()) arr.sort((a, b) => a.posInLine - b.posInLine);
  const lines = [...byLine.values()];

  const pairs: { a: ShelvingUnit; b: ShelvingUnit }[] = [];
  for (const arrA of lines) {
    const lastA = arrA[arrA.length - 1];
    const dx = -Math.sin(lastA.yaw), dz = -Math.cos(lastA.yaw);
    const zA = plan.aisleZCenter(lastA);
    for (const arrB of lines) {
      if (arrB === arrA) continue;
      const firstB = arrB[0];
      if (Math.abs(firstB.yaw - lastA.yaw) > 1e-3) continue;
      const zB = plan.aisleZCenter(firstB);
      const ddx = firstB.xCenter - lastA.xCenter, ddz = zB - zA;
      const dist = Math.hypot(ddx, ddz);
      if (dist < 1e-6) continue;
      const dot = (ddx / dist) * dx + (ddz / dist) * dz;
      if (dot > 0.999 && Math.abs(dist - (L + RUN_BREAK_GAP)) < 0.05) {
        pairs.push({ a: lastA, b: firstB });
      }
    }
  }
  return pairs;
}

// Force a short run cap in this fixture so all three layouts exercise a
// real cross-aisle split. At 45 degrees the normal six-unit cap can reach
// the field edge before a second chunk, even with a large catalogue.
const CASES: { arrangement: ArrangementId; movieCount: number; requirePairs: boolean }[] = [
  { arrangement: 'straight', movieCount: 9000, requirePairs: true },
  { arrangement: 'diagonal', movieCount: 9000, requirePairs: true },
  { arrangement: 'herringbone', movieCount: 9000, requirePairs: true },
];

for (const { arrangement, movieCount, requirePairs } of CASES) {
  test(`a shelf run split by RUN_BREAK_GAP stays walk-order contiguous (${arrangement})`, () => {
    const lib = buildBigLibrary(movieCount);
    const format=activeStoreFormat(), savedCap=format.maxRunUnitsCap;
    let plan: StorePlan;
    try {
      format.maxRunUnitsCap=3;
      plan = new StorePlan([lib]);
      plan.arrangement = arrangement;
      plan.plan();
    } finally { format.maxRunUnitsCap=savedCap; }
    for(const unit of plan.shelvingUnits) {
      const steps=unit.yaw/(Math.PI/4);
      assert.ok(Math.abs(steps-Math.round(steps))<1e-8,'aisles follow the floor-plan angle grid');
    }

    const pairs = findSameRowContinuations(plan, 0);
    if (requirePairs) {
      // Guard against a vacuous pass: this library must actually be big
      // enough that some physical row needed more than one maxRunUnits chunk.
      assert.ok(pairs.length > 0, 'expected at least one multi-chunk row split to exercise the fix');
    }

    for (const { a, b } of pairs) {
      assert.equal(
        Math.abs(a.unitIdxInLibrary - b.unitIdxInLibrary),
        1,
        `chunks physically flush (lineId ${a.lineId} -> ${b.lineId}) must be walk-order-adjacent ` +
        `(got unitIdxInLibrary ${a.unitIdxInLibrary} and ${b.unitIdxInLibrary})`
      );
    }
  });
}

test('herringbone fills more wings before growing beyond the six-pane baseline', () => {
  const plan = new StorePlan([buildBigLibrary(1200)]);
  plan.setArrangement('herringbone');
  plan.plan();
  assert.equal(15 - plan.backWallZ, 52.5);
  assert.ok(new Set(plan.shelvingUnits.map(u => u.rowGroupId)).size >= 5);
  assert.ok(plan.shelvingUnits.length >= 10, 'retain all stock capacity');
});

test('herringbone retains clear parallel aisles and still grows for large collections', () => {
  const plan = new StorePlan([buildBigLibrary(9600)]);
  plan.setArrangement('herringbone');
  plan.plan();
  assert.ok(15 - plan.backWallZ > 60, 'depth is not capped at six panes');
  const units = plan.shelvingUnits;
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i], b = units[j];
      if (a.rowGroupId === b.rowGroupId || a.yaw !== b.yaw) continue;
      const normal = Math.abs((b.xCenter-a.xCenter)*Math.cos(a.yaw)
        -(plan.aisleZCenter(b)-plan.aisleZCenter(a))*Math.sin(a.yaw));
      assert.ok(normal - 2.16 >= 3, `parallel aisle clearance ${normal - 2.16}`);
    }
  }
});


test('2400 titles fill existing wings before adding a seventh side pane', () => {
  const plan = new StorePlan([buildBigLibrary(2400)]);
  plan.setArrangement('herringbone');
  plan.plan();
  assert.ok(15 - plan.backWallZ < 56.5, 'retain six whole panes at this stock level');
  assert.ok(plan.shelvingUnits.length >= 20, 'do not discard stock to avoid growth');
});
