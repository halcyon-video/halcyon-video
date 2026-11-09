// #429: on the two-field chain floor, a small library listed first must not
// hold the entrance-facing field alone while a far larger library is pushed
// whole into the field behind the counter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie, JellyfinLibrary } from '../src/jellyfin.ts';
import { StorePlan } from '../src/store-plan.ts';
import { STORE_CENTER_X, UNIT_SIDE_CAPACITY, type ArrangementId } from '../src/store-layout.ts';

const GENRES = ['Action', 'Comedy', 'Drama', 'Thriller', 'Horror', 'Sci-Fi', 'Family', 'Romance'];
function lib(id: string, count: number, isSeries = false): JellyfinLibrary {
  const movies: Movie[] = Array.from({ length: count }, (_, i) => ({
    id: `${id}${i}`, title: `${id} ${String(i).padStart(5, '0')}`, year: 2000 + (i % 20), duration: '1h 30m',
    rating: 'PG', overview: '', director: '', actors: [], genres: [GENRES[i % GENRES.length]], localPath: '',
    ...(isSeries ? { isSeries: true } : {}),
  }));
  return { id, name: id, movies, genres: GENRES };
}

/** Stocked faces per library in the entrance-facing (first, right-hand) field. */
function frontFieldFaces(plan: StorePlan): Map<number, number> {
  const out = new Map<number, number>();
  for (const unit of plan.shelvingUnits) {
    if (unit.xCenter <= STORE_CENTER_X) continue;
    for (const side of unit.singleSided ? ['front'] as const : ['front', 'back'] as const) {
      const owner = plan.faceOwner(unit, side);
      if (owner && owner.block < Math.ceil(plan.layoutFor(owner.libraryIdx).entries.length / UNIT_SIDE_CAPACITY)) out.set(owner.libraryIdx, (out.get(owner.libraryIdx) ?? 0) + 1);
    }
  }
  return out;
}

for (const arrangement of ['straight', 'diagonal', 'herringbone'] as ArrangementId[]) {
  for (const [shows, movies] of [[40, 293], [40, 600], [12, 293]]) {
    test(`a large library after a small one still stocks the front field (${arrangement}, ${shows}+${movies})`, () => {
      const plan = new StorePlan([lib('Shows', shows, true), lib('Movies', movies)]);
      plan.arrangement = arrangement;
      plan.plan('bb-2000');
      const front = frontFieldFaces(plan);
      assert.ok((front.get(0) ?? 0) > 0, 'shows stay on the front field');
      // More than the one face left over on the back of the shows bay (#395).
      assert.ok((front.get(1) ?? 0) > 1, `movies continue on the front field after the shows (${front.get(1) ?? 0} faces)`);
    });
  }
  test(`two comparable libraries still keep one field each (${arrangement})`, () => {
    const plan = new StorePlan([lib('A', 180), lib('B', 290)]);
    plan.arrangement = arrangement;
    plan.plan('bb-2000');
    const fieldsOf = (libraryIdx: number) => new Set(plan.shelvingUnits
      .filter(u => u.libraryIdx === libraryIdx).map(u => u.xCenter > STORE_CENTER_X));
    assert.equal(fieldsOf(0).size, 1, 'library A sits in one field');
    assert.equal(fieldsOf(1).size, 1, 'library B sits in one field');
  });
}
