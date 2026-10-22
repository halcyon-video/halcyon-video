// #395: libraries pack at bay granularity — slack never sits between two
// libraries' stock; empty bays only remain at the end of the floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie, JellyfinLibrary } from '../src/jellyfin.ts';
import { StorePlan } from '../src/store-plan.ts';
import { UNIT_SIDE_CAPACITY, type ArrangementId } from '../src/store-layout.ts';

const GENRES = ['Action', 'Comedy', 'Drama', 'Thriller', 'Horror', 'Sci-Fi', 'Family', 'Romance'];
function lib(id: string, count: number): JellyfinLibrary {
  const movies: Movie[] = Array.from({ length: count }, (_, i) => ({
    id: `${id}${i}`, title: `${id} ${String(i).padStart(5, '0')}`, year: 2000 + (i % 20), duration: '1h 30m',
    rating: 'PG', overview: '', director: '', actors: [], genres: [GENRES[i % GENRES.length]], localPath: '',
  }));
  return { id, name: id, movies, genres: GENRES };
}
const SIZES = [[250, 410, 170, 330], [130, 130, 130, 130, 130], [61, 700, 59, 301]];
for (const arrangement of ['straight', 'diagonal', 'herringbone'] as ArrangementId[]) {
  for (const sizes of SIZES) test(`no empty bay precedes another library's stock (${arrangement}, ${sizes.join('/')})`, () => {
    const plan = new StorePlan(sizes.map((n, i) => lib(`L${i}`, n)));
    plan.arrangement = arrangement;
    plan.plan();
    const stocked = sizes.map((_, i) => Math.ceil(plan.layoutFor(i).entries.length / UNIT_SIDE_CAPACITY));
    const owners = new Set<string>();
    let empties = 0;
    const emptyLibs = new Set<number>();
    for (const unit of plan.shelvingUnits) for (const side of ['front', 'back'] as const) {
      if (side === 'back' && unit.singleSided) continue;
      const o = plan.faceOwner(unit, side);
      const key = `${o.libraryIdx}.${o.block}`;
      assert.ok(!owners.has(key), `block ${key} owned by two faces`);
      owners.add(key);
      if (o.block >= stocked[o.libraryIdx]) { empties++; emptyLibs.add(o.libraryIdx); }
    }
    for (let i = 0; i < sizes.length; i++) for (let b = 0; b < stocked[i]; b++) assert.ok(owners.has(`${i}.${b}`), `lib ${i} block ${b} has a face`);
    assert.ok(emptyLibs.size <= 1, `slack pools on one library, got ${[...emptyLibs]}`);
    if (empties) assert.equal([...emptyLibs][0], sizes.length - 1, 'slack belongs to the last library on the floor');
  });
}
