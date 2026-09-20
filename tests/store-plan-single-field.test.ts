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
const { UNIT_SIDE_CAPACITY } = await import('../src/store-layout.ts');

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
    // Wall overflow continues next to its wall; other libraries retain their
    // relative queue order. The contiguity assertions above include the wall.
    const wallLibrary = plan.shelvingUnits.find(unit => unit.singleSided)?.libraryIdx;
    const order = counts.map((_, i) => i);
    if (wallLibrary !== undefined) {
      order.splice(order.indexOf(wallLibrary), 1);
      order.unshift(wallLibrary);
    }
    const leftmost = order.map(li => Math.min(...libUnits(li).filter(u => !u.singleSided).map((u) => runX(u.anchorX)))).filter(Number.isFinite);
    for (let li = 1; li < leftmost.length; li++) {
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

for (const { counts, maximumDepth, minimumColumns } of [
  { counts: [500], maximumDepth: 40, minimumColumns: 3 },
  { counts: [3000, 900, 200], maximumDepth: 65, minimumColumns: 5 },
]) {
  test(`stock uses the shop width before extending an isolated rear aisle (${counts})`, () => {
    const libraries = counts.map((count, index) => mkLibrary(index, count));
    const plan = new StorePlan(libraries);
    plan.plan();
    assert.ok(15 - plan.backWallZ <= maximumDepth, 'compact catalog must not produce a long empty-sided room');
    assert.ok(plan.getStoreWidth() <= 44, 'the shop remains within its width envelope');
    const columns = new Set(plan.shelvingUnits.filter(unit => !unit.singleSided).map(unit => unit.anchorX));
    assert.ok(columns.size >= minimumColumns, 'stock occupies the available parallel aisles');
    for (let i = 0; i < libraries.length; i++) {
      const expected = new Set(libraries[i].movies.map(movie => movie.id));
      const stocked = new Set(plan.layoutFor(i).entries.filter(Boolean).map(movie => movie!.id));
      assert.deepEqual(stocked, expected, 'shortening the shop preserves every title');
    }
    const footprints = plan.getUnitFootprints();
    for (const footprint of footprints) {
      assert.ok(footprint.cz - footprint.d / 2 - plan.backWallZ >= 6 - 1e-6,
        'the rear cross-aisle remains clear');
    }
    for (let i = 0; i < footprints.length; i++) for (let j = i + 1; j < footprints.length; j++) {
      const a = footprints[i], b = footprints[j];
      if (Math.abs(a.cx - b.cx) < 1e-6 || Math.abs(a.cz - b.cz) >= (a.d + b.d) / 2) continue;
      assert.ok(Math.abs(a.cx - b.cx) - (a.w + b.w) / 2 >= 3,
        'parallel shelves preserve a usable walking aisle');
    }
  });
}

test('short libraries share balanced floor rows without leaving deep empty tails', () => {
  store.set('bb_library_organization', 'alphabetical');
  try {
    for (const counts of [[1500, 400, 90, 60, 40], [3000, 900, 200], [400, 100, 80, 70, 60]]) {
      const plan = new StorePlan(counts.map((n, i) => mkLibrary(i, n)));
      plan.plan();
      const rows = new Map<number, number>();
      for (const unit of plan.shelvingUnits.filter(unit => !unit.singleSided)) {
        rows.set(unit.anchorX, (rows.get(unit.anchorX) ?? 0) + 1);
      }
      const lengths = [...rows.values()];
      assert.ok(Math.max(...lengths) - Math.min(...lengths) <= 1,
        `floor rows must differ by at most one shelf unit: ${lengths}`);
      for (let i = 0; i < counts.length; i++) {
        const capacity = plan.entryBlockOrder(i).length * UNIT_SIDE_CAPACITY;
        assert.ok(capacity >= plan.layoutFor(i).entries.length, 'all library entries retain shelf space');
      }
    }
  } finally { store.delete('bb_library_organization'); }
});
