// Mom-and-pop browse walk: the camera used to "jump all over the place" in
// the single-field store format, for two reasons this file pins.
//
// 1. fillField() (src/store-plan.ts) chose AND poured the field's runs from
//    the centreline outward — centre, one right, one LEFT, two right... — so a
//    library that spilled off one run continued on the far side of the store,
//    and its browse walk had to cross the whole floor to follow it. The run
//    SET is still chosen centre-out (the smallest store keeps its one run down
//    the middle) but the chosen runs are poured in floor order, so every
//    library sits on contiguous runs.
// 2. The browse walker (src/store-nav.ts) hopped rows by lineId CHUNK while
//    planRuns() numbers units by physical ROW (rowGroupId, pin 056). A long
//    mom-and-pop row is several chunks, so the camera looped chunk 1, then
//    leapt a whole row-length to chunk 2. The walker now keys on rowGroupId.
//
// `tools/browse-walk.mjs` prints the actual walk, hop by hop, for any format.
//
// The store format is resolved once at module load from localStorage, so the
// stub must exist before store-plan is imported (hence the dynamic import).
//
//   node --experimental-strip-types --test tests/store-plan-single-field.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Movie, JellyfinLibrary } from '../src/jellyfin.ts';

const store = new Map<string, string>([['bb_store_format', 'mom-and-pop']]);
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
const { StorePlan } = await import('../src/store-plan.ts');
const { activeStoreFormat } = await import('../src/store-format.ts');

const GENRE_TAGS = ['Action', 'Comedy', 'Drama', 'Thriller', 'Horror', 'Sci-Fi', 'Family', 'Romance'];
function mkMovie(lib: number, i: number): Movie {
  return {
    id: `${lib}-m${i}`,
    title: `Title ${String(i).padStart(5, '0')}`,
    year: 2000 + (i % 20),
    duration: '1h 30m',
    rating: 'PG',
    overview: '',
    director: '',
    actors: [],
    genres: [GENRE_TAGS[i % GENRE_TAGS.length]],
    localPath: '',
  };
}
function mkLibrary(idx: number, count: number): JellyfinLibrary {
  const movies: Movie[] = [];
  for (let i = 0; i < count; i++) movies.push(mkMovie(idx, i));
  return { id: `L${idx}`, name: `Library ${idx}`, movies, genres: GENRE_TAGS };
}

test('the stub really selected the single-field format', () => {
  assert.equal(activeStoreFormat().id, 'mom-and-pop');
  assert.equal(activeStoreFormat().singleField, true);
});

for (const counts of [[1500, 400], [3000, 900, 200], [400, 120]]) {
  test(`each library occupies contiguous runs (${counts.join('+')} titles)`, () => {
    const plan = new StorePlan(counts.map((n, i) => mkLibrary(i, n)));
    plan.plan();
    const libUnits = (li: number) => plan.shelvingUnits.filter((u) => u.libraryIdx === li);
    // Runs on the floor, by their anchor X, left to right.
    const runX = (x: number) => Math.round(x * 100) / 100;
    const floor = Array.from(new Set(plan.shelvingUnits
      .filter((u) => u.libraryIdx >= 0 && u.libraryIdx < counts.length)
      .map((u) => runX(u.anchorX)))).sort((a, b) => a - b);
    assert.ok(floor.length >= 2, 'test needs a store with more than one run');
    counts.forEach((_, li) => {
      const mine = Array.from(new Set(libUnits(li).map((u) => runX(u.anchorX)))).sort((a, b) => a - b);
      assert.ok(mine.length > 0, `library ${li} was stocked`);
      const lo = floor.indexOf(mine[0]);
      const hi = floor.indexOf(mine[mine.length - 1]);
      // Every floor run between this library's leftmost and rightmost run
      // is one of its own: no other library's run splits it.
      assert.deepEqual(floor.slice(lo, hi + 1), mine,
        `library ${li} is split across the floor: uses ${mine.join(',')} of ${floor.join(',')}`);
    });
    // Libraries read left to right in queue order: library 0 leftmost.
    const leftmost = counts.map((_, li) => Math.min(...libUnits(li).map((u) => runX(u.anchorX))));
    for (let li = 1; li < counts.length; li++) {
      assert.ok(leftmost[li] >= leftmost[li - 1], `library ${li} starts left of library ${li - 1}`);
    }
  });
}

test('a long row is poured as several chunks, numbered as one continuous row', () => {
  const plan = new StorePlan([mkLibrary(0, 3000)]);
  plan.plan();
  const units = plan.shelvingUnits.filter((u) => u.libraryIdx === 0);
  const rows = new Map<number, typeof units>();
  for (const u of units) rows.set(u.rowGroupId, [...(rows.get(u.rowGroupId) ?? []), u]);
  const multi = Array.from(rows.values()).filter((r) => new Set(r.map((u) => u.lineId)).size > 1);
  assert.ok(multi.length > 0, 'mom-and-pop rows this long must split into lineId chunks');
  for (const row of multi) {
    const idx = row.map((u) => u.unitIdxInLibrary).sort((a, b) => a - b);
    for (let i = 1; i < idx.length; i++) assert.equal(idx[i], idx[i - 1] + 1, 'row numbering has a hole');
  }
});

test('the browse walker hops rows by rowGroupId, never by lineId chunk', () => {
  const src = readFileSync(new URL('../src/store-nav.ts', import.meta.url), 'utf8');
  assert.match(src, /export function rowStartUnit\(/);
  // The four same-row neighbour checks (front/back x left/right) must compare
  // rows, not chunks — comparing chunks is exactly the pre-fix leap.
  assert.equal((src.match(/\.rowGroupId === currentUnit\.rowGroupId/g) ?? []).length, 4);
  assert.doesNotMatch(src, /(prevUnit|nextUnit)\.lineId === currentUnit\.lineId/);
  assert.doesNotMatch(src, /u\.lineId !== currentUnit\.lineId/);
});
