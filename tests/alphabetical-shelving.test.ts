import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie, JellyfinLibrary } from '../src/jellyfin.ts';
import { StorePlan } from '../src/store-plan.ts';
import { alphabeticalTitleCompare, UNIT_SIDE_CAPACITY, type ArrangementId } from '../src/store-layout.ts';

function movie(title: string, extra: Partial<Movie> = {}): Movie {
  return { id: title, title, year: 2000, duration: '', rating: 'PG', overview: '',
    director: '', actors: [], genres: [], localPath: '', ...extra };
}
function library(id: string, movies: Movie[]): JellyfinLibrary {
  return { id, name: id, movies, genres: ['Action', 'Drama', 'Horror'] };
}
function plan(libraries: JellyfinLibrary[], organization: 'genre' | 'alphabetical', arrangement: ArrangementId = 'straight') {
  const value = new StorePlan(libraries);
  value.organization = organization;
  value.arrangement = arrangement;
  value.plan();
  return value;
}

test('alphabetical order ignores articles/case and collection names, uses natural numbers and stable remake ties', () => {
  const titles = [movie('Zulu', { collectionName: 'Alpha Collection' }), movie('The Part 10'),
    movie('part 2'), movie('An Alien', { year: 2020 }), movie('ALIEN', { id: 'b', year: 1979 }),
    movie('Alien', { id: 'a', year: 1979 }), movie('A Bug'), movie('2001'), movie('12 Monkeys')];
  assert.deepEqual(titles.sort(alphabeticalTitleCompare).map(m => m.id),
    ['12 Monkeys', '2001', 'a', 'b', 'An Alien', 'A Bug', 'part 2', 'The Part 10', 'Zulu']);
});

for (const arrangement of ['straight', 'diagonal', 'herringbone'] as const) {
  test(`mixed genres remain continuously alphabetized across shelf faces (${arrangement})`, () => {
    const movies = Array.from({ length: 1400 }, (_, i) => movie(`Title ${i + 1}`,
      { genres: [['Action', 'Drama', 'Horror'][i % 3]] })).reverse();
    const libraries = [library('Movies', [...movies, movies[0]]), library('Other', [movie('Separate')])];
    const alpha = plan(libraries, 'alphabetical', arrangement);
    const entries = alpha.layoutFor(0).entries;
    assert.equal(entries.length, 1400);
    assert.equal(alpha.layoutFor(0).categorized, false);
    assert.equal(alpha.layoutFor(0).sectionLabels.size, 0);
    assert.deepEqual(entries.map(m => m?.title), Array.from({ length: 1400 }, (_, i) => `Title ${i + 1}`));
    const faces = alpha.entryBlockOrder(0);
    assert.ok(faces.length > 2, 'crosses physical shelves');
    const walked = faces.flatMap(({ unit, side }) => {
      const block = alpha.blockIndexOf(0, unit, side);
      return entries.slice(block * UNIT_SIDE_CAPACITY, (block + 1) * UNIT_SIDE_CAPACITY);
    });
    assert.deepEqual(walked, entries);
    assert.deepEqual(alpha.layoutFor(1).entries.map(m => m?.id), ['Separate']);
    const genre = plan(libraries, 'genre', arrangement);
    assert.equal(genre.layoutFor(0).categorized, true);
    assert.ok(genre.layoutFor(0).sectionLabels.size > 1);
    const ids = (p: StorePlan) => [...new Set(p.layoutFor(0).entries.filter(Boolean).map(m => m!.id))].sort();
    assert.deepEqual(ids(genre), ids(alpha));
    assert.deepEqual(libraries[0].movies, [...movies, movies[0]], 'source catalog is untouched');
  });
}

test('empty and single-title libraries preserve exact stock and series/version metadata', () => {
  const series = movie('The Series', { isSeries: true, versions: [{ id: 'version', name: '4K' } as any] });
  const alpha = plan([library('Empty', []), library('Series', [series, series])], 'alphabetical');
  assert.deepEqual(alpha.layoutFor(0).entries, []);
  assert.deepEqual(alpha.layoutFor(1).entries, [series]);
  assert.equal(alpha.layoutFor(1).entries[0], series);
});
