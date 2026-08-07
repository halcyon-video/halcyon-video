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

// requirePairs: whether this arrangement is expected to actually exercise a
// same-row multi-chunk split at a scale worth unit-testing (i.e. the vacuous-
// pass guard below is meaningful, not just "0 pairs found so trivially ok").
// A physical row's maximum length is bounded by the field width divided by
// sin(yaw) (how fast a tilted row drifts out of the field's X-range) — at the
// current constants (CENTER_WALKWAY, margin, WIDTH_CAP, and each
// arrangement's own aisle angle) that bound sits ABOVE one maxRunUnits chunk
// for 'straight' (unbounded — a straight row never drifts in X at all) and
// 'diagonal' (AISLE_ANGLE=40°), so both reliably need a second chunk well
// under 25k titles. 'herringbone' tilts steeper (+10°, see
// HERRINGBONE_AISLE_ANGLE) and that bound lands just BELOW one maxRunUnits
// chunk instead (verified empirically up to 200k titles in a single library —
// see scratch investigation for pin 056) — every row hits the field's own
// X-clip before it would ever need a second chunk, so this exact failure
// mode doesn't arise for herringbone under today's constants. The contiguity
// check itself still runs unconditionally (harmless — and it stays a real
// regression guard if the constants ever change and herringbone starts
// producing multi-chunk rows too).
const CASES: { arrangement: ArrangementId; movieCount: number; requirePairs: boolean }[] = [
  { arrangement: 'straight', movieCount: 9000, requirePairs: true },
  { arrangement: 'diagonal', movieCount: 9000, requirePairs: true },
  { arrangement: 'herringbone', movieCount: 9000, requirePairs: false },
];

for (const { arrangement, movieCount, requirePairs } of CASES) {
  test(`a shelf run split by RUN_BREAK_GAP stays walk-order contiguous (${arrangement})`, () => {
    const lib = buildBigLibrary(movieCount);
    const plan = new StorePlan([lib]);
    plan.arrangement = arrangement;
    plan.plan();

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
