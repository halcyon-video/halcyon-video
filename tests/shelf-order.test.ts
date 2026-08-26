// Collection-aware shelf order (Jellyfin BoxSets): members of one collection
// file together under the collection's name in premiere order, and adopt the
// collection's majority category so a saga never splits across sections.
//
//   npm run test:shelf
//
// Runs under plain `node --test` with type stripping — no test framework.
// store-layout.ts keeps type-only runtime imports precisely so this works.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie } from '../src/jellyfin.ts';
import {
  shelfTitleCompare,
  shelfFileKey,
  collectionCategoryMap,
  shelfCategoryOf,
  storeCategory,
  storeCategoryCandidates,
  collectionCategoryCandidates,
  shelfCategoryCandidatesOf,
  extraCopiesCount,
  categoryRank,
} from '../src/store-layout.ts';

function mk(title: string, extra: Partial<Movie> = {}): Movie {
  return {
    id: title,
    title,
    year: 2000,
    duration: '1h 30m',
    rating: 'PG',
    overview: '',
    director: '',
    actors: [],
    genres: [],
    localPath: '',
    ...extra,
  } as Movie;
}

test('loose titles still alphabetize ignoring leading articles', () => {
  const movies = [mk('The Matrix'), mk('Alien'), mk('A Bug\'s Life')].sort(shelfTitleCompare);
  assert.deepEqual(movies.map((m) => m.title), ['Alien', 'A Bug\'s Life', 'The Matrix']);
});

test('collection members file under the collection name, not their own titles', () => {
  assert.equal(
    shelfFileKey(mk('Raiders of the Lost Ark', { collectionName: 'Indiana Jones Collection' })),
    'indiana jones'
  );
  assert.equal(shelfFileKey(mk('The Matrix')), 'matrix');
});

test('a saga stands together in premiere order between its alphabetical neighbours', () => {
  const coll = 'Harness Saga Collection';
  const movies = [
    mk('Zebra Movie'),
    mk('The Harness Strikes Back', { collectionName: coll, year: 1999 }),
    mk('Alpha Movie'),
    mk('Return of the Harness', { collectionName: coll, year: 1995 }),
    mk('Harness Begins', { collectionName: coll, year: 1997 }),
  ].sort(shelfTitleCompare);
  assert.deepEqual(movies.map((m) => m.title), [
    'Alpha Movie',
    'Return of the Harness',      // 1995 — chronological, not alphabetical
    'Harness Begins',             // 1997
    'The Harness Strikes Back',   // 1999
    'Zebra Movie',
  ]);
});

test('premiere date breaks the tie between same-year collection members', () => {
  const coll = 'Marvel Collection';
  const movies = [
    mk('Thor', { collectionName: coll, year: 2011, premiereDate: '2011-05-06T00:00:00Z' }),
    mk('Captain America', { collectionName: coll, year: 2011, premiereDate: '2011-07-22T00:00:00Z' }),
  ].sort(shelfTitleCompare);
  assert.deepEqual(movies.map((m) => m.title), ['Thor', 'Captain America']);
});

test('a loose title matching a collection name stays out of the group but adjacent', () => {
  const movies = [
    mk('Alien 3', { collectionName: 'Alien Collection', year: 1992 }),
    mk('Alien', { collectionName: 'Alien Collection', year: 1979 }),
    mk('Alien', {}), // a loose duplicate title, e.g. from another edition
  ].sort(shelfTitleCompare);
  // Loose (no collection) sorts first at the shared key; the group stays contiguous.
  assert.deepEqual(
    movies.map((m) => `${m.title}${m.collectionName ? '*' : ''}`),
    ['Alien', 'Alien*', 'Alien 3*']
  );
});

test('collection members adopt the majority category; ties break by wall order', () => {
  const movies = [
    mk('Alien', { collectionName: 'Alien Collection', genres: ['Horror'] }),
    mk('Aliens', { collectionName: 'Alien Collection', genres: ['Horror'] }),
    mk('Alien 3', { collectionName: 'Alien Collection', genres: ['Sci-Fi'] }),
    mk('Loose Comedy', { genres: ['Comedy'] }),
  ];
  const cat = collectionCategoryMap(movies);
  assert.equal(cat.get('Alien Collection'), 'HORROR');
  assert.equal(shelfCategoryOf(movies[2], cat), 'HORROR'); // Sci-Fi member follows the saga
  assert.equal(shelfCategoryOf(movies[3], cat), 'COMEDY'); // loose titles unaffected

  const tied = [
    mk('One', { collectionName: 'Tied Collection', genres: ['Comedy'] }),
    mk('Two', { collectionName: 'Tied Collection', genres: ['Action'] }),
  ];
  // 1-1 tie: ACTION precedes COMEDY in STORE_CATEGORY_ORDER.
  assert.equal(collectionCategoryMap(tied).get('Tied Collection'), 'ACTION');
});

test('genre tags yield every qualifying category in shelving-priority order', () => {
  // The user-reported case: a History+Drama film prefers SPECIAL INTEREST, but
  // DRAMA is a real candidate, so the planner can file it there once the
  // overflow policy folds SPECIAL INTEREST away.
  assert.deepEqual(
    storeCategoryCandidates(mk('Hist', { genres: ['History', 'Drama'] })),
    ['SPECIAL INTEREST', 'DRAMA']
  );
  // Single-tag titles are unchanged, and the legacy single-value API still
  // returns the top candidate.
  assert.deepEqual(storeCategoryCandidates(mk('C', { genres: ['Comedy'] })), ['COMEDY']);
  assert.equal(storeCategory(mk('Hist', { genres: ['History', 'Drama'] })), 'SPECIAL INTEREST');
  // No recognised tag at all: the raw genre itself becomes the candidate
  // (GH #117) so the label can earn a section instead of vanishing.
  assert.deepEqual(storeCategoryCandidates(mk('X', { genres: ['Nonsense'] })), ['NONSENSE']);
  assert.equal(storeCategory(mk('X', { genres: ['Nonsense'] })), 'NONSENSE');
  // Series short-circuit is preserved.
  assert.deepEqual(storeCategoryCandidates(mk('S', { isSeries: true, genres: ['Drama'] })), ['TELEVISION']);
});

test('comedy loses to drama but still beats the lighter pairings', () => {
  // The dramedy: a drama with jokes is a drama. COMEDY survives only as a
  // tail fallback for when DRAMA is not a built section.
  assert.deepEqual(
    storeCategoryCandidates(mk('Dramedy', { genres: ['Comedy', 'Drama'] })),
    ['DRAMA', 'COMEDY']
  );
  assert.equal(storeCategory(mk('Dramedy', { genres: ['Comedy', 'Drama'] })), 'DRAMA');
  // Crime-comedy still reads as a comedy, so COMEDY keeps its early slot.
  assert.equal(storeCategory(mk('Crime', { genres: ['Comedy', 'Crime'] })), 'COMEDY');
  // Action already outranked comedy and continues to.
  assert.equal(storeCategory(mk('Act', { genres: ['Comedy', 'Action'] })), 'ACTION');
  // Comedy alone is untouched.
  assert.deepEqual(storeCategoryCandidates(mk('C2', { genres: ['Comedy'] })), ['COMEDY']);
  // A three-way tag resolves above DRAMA, as it did before.
  assert.equal(
    storeCategory(mk('Three', { genres: ['Comedy', 'Drama', 'Romance'] })),
    'ROMANCE'
  );
});

test('collection candidates lead with the majority category, then member fallbacks', () => {
  const movies = [
    mk('Doc One', { collectionName: 'Doc Collection', genres: ['History', 'Drama'] }),
    mk('Doc Two', { collectionName: 'Doc Collection', genres: ['History', 'Drama'] }),
    mk('Doc Three', { collectionName: 'Doc Collection', genres: ['Documentary', 'Comedy'] }),
  ];
  const cands = collectionCategoryCandidates(movies);
  // Majority is SPECIAL INTEREST (all three); fallbacks are the union of member
  // candidates in wall order, so the whole saga cascades together to COMEDY.
  assert.deepEqual(cands.get('Doc Collection'), ['SPECIAL INTEREST', 'COMEDY', 'DRAMA']);
  assert.deepEqual(shelfCategoryCandidatesOf(movies[0], cands), ['SPECIAL INTEREST', 'COMEDY', 'DRAMA']);
  // Loose titles fall back to their own candidates.
  const loose = mk('Loose', { genres: ['History', 'Drama'] });
  assert.deepEqual(shelfCategoryCandidatesOf(loose, cands), ['SPECIAL INTEREST', 'DRAMA']);
});

test('a collection gap files chronologically among the titles you own', () => {
  // You own 1, 3 and 4 of the saga; #2 is missing. The gap has to land in its
  // real release position, not at the end of the run — a hole in the middle of
  // the shelf is the whole point of the feature.
  const owned1 = mk('Return of the Harness', { collectionName: 'Harness Collection', year: 1995, premiereDate: '1995-06-15' });
  const gap    = mk('The Harness Gap',       { collectionName: 'Harness Collection', year: 1996, premiereDate: '1996-06-15', collectionGap: true });
  const owned2 = mk('Harness Begins',        { collectionName: 'Harness Collection', year: 1997, premiereDate: '1997-06-15' });
  const owned3 = mk('The Harness Strikes Back', { collectionName: 'Harness Collection', year: 1999, premiereDate: '1999-06-15' });

  // Deliberately shuffled, and alphabetical order differs from release order.
  const shelved = [owned3, gap, owned2, owned1].sort(shelfTitleCompare);
  assert.deepEqual(shelved.map((m) => m.title), [
    'Return of the Harness',
    'The Harness Gap',
    'Harness Begins',
    'The Harness Strikes Back',
  ]);

  // It files under the collection like any member, so it can't drift out of
  // the run when other titles sort around it.
  assert.equal(shelfFileKey(gap), shelfFileKey(owned1));
});

test('a collection gap carries no backstock copies, however well rated', () => {
  // Ratings come from TMDB, so a beloved missing film would otherwise earn the
  // full two extra copies. The flag has to win outright.
  const gap = mk('The Harness Gap', { collectionGap: true, communityRating: 9.4, criticRating: 96 });
  assert.equal(extraCopiesCount(gap), 0);

  // Same numbers on a title you actually own still stack three deep, so the
  // assertion above is testing the flag and not a broken threshold.
  const owned = mk('Return of the Harness', { communityRating: 9.4, criticRating: 96 });
  assert.equal(extraCopiesCount(owned), 2);
});

test('a genre outside the classic wall list becomes its own candidate (GH #117)', () => {
  // "Racing" matches no has(...) rule: before the fix it returned no
  // candidates and the label vanished into GENERAL everywhere in 3D.
  assert.deepEqual(storeCategoryCandidates(mk('Pole Position', { genres: ['Racing'] })), ['RACING']);
  assert.equal(storeCategory(mk('Pole Position', { genres: ['Racing'] })), 'RACING');

  // A genre the classic rules already claim is untouched by the fallback.
  assert.deepEqual(storeCategoryCandidates(mk('Scream Test', { genres: ['Horror'] })), ['HORROR']);

  // The fallback only fires when NO rule matched — a mixed tag list keeps its
  // classic candidates and gains nothing.
  assert.deepEqual(
    storeCategoryCandidates(mk('Rubber', { genres: ['Racing', 'Horror'] })),
    ['HORROR']
  );

  // No genres at all still lands in GENERAL.
  assert.equal(storeCategory(mk('Blank Tape')), 'GENERAL');

  // A literal "General" genre must not fabricate a section that shadows the
  // real GENERAL fallback.
  assert.deepEqual(storeCategoryCandidates(mk('Misc', { genres: ['General'] })), []);
});

test('a raw-genre category never outranks a named wall category (GH #117)', () => {
  // indexOf would return -1 for RACING and win every comparison; categoryRank
  // pins novel labels after the whole named list instead.
  assert.ok(categoryRank('RACING') > categoryRank('GENERAL'));
  assert.ok(categoryRank('ACTION') < categoryRank('RACING'));

  // Collection tie-break: equal votes between a named wall and a novel genre
  // go to the named wall.
  const map = collectionCategoryMap([
    mk('Fast Lap', { collectionName: 'Speed Collection', genres: ['Racing'] }),
    mk('Slow Burn', { collectionName: 'Speed Collection', genres: ['Drama'] }),
  ]);
  assert.equal(map.get('Speed Collection'), 'DRAMA');
});
