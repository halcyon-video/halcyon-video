// The "why" cascade: every recommendation has to justify itself with a fact
// about the library you own, and the strongest available fact wins.
//
//   npm run test:why
//
// Runs under plain `node --test` with type stripping — no test framework.
// recommend-why.ts keeps type-only runtime imports precisely so this works.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie } from '../src/jellyfin.ts';
import {
  buildLibraryIndex,
  explainRecommendation,
  pickRecommendations,
} from '../src/recommend-why.ts';

function mk(title: string, extra: Partial<Movie> = {}): Movie {
  return {
    id: title,
    title,
    year: 2000,
    duration: '1h 30m',
    rating: 'R',
    overview: '',
    director: 'Unknown Director',
    actors: [],
    genres: [],
    localPath: '',
    ...extra,
  } as Movie;
}

test('a shared director beats the collaborative signal that surfaced the film', () => {
  // Both reasons are true. The director names a specific film on your shelf,
  // so it's the one worth printing.
  const index = buildLibraryIndex([
    mk('Heat', { director: 'Michael Mann', year: 1995 }),
    mk('Collateral', { director: 'Michael Mann', year: 2004 }),
  ]);
  const anchor = mk('Heat', { director: 'Michael Mann' });
  const why = explainRecommendation(mk('Thief', { director: 'Michael Mann' }), index, anchor);

  assert.equal(why?.kind, 'director');
  // Cites the most recent owned film by that director, not just the first.
  assert.equal(why?.anchorTitle, 'Collateral');
  assert.equal(why?.text, 'Michael Mann also directed Collateral, on your shelf.');
});

test('an incomplete collection outranks everything else', () => {
  const index = buildLibraryIndex([
    mk('Potter 1', { collectionName: 'Harry Potter Collection', director: 'Chris Columbus', year: 2001 }),
    mk('Potter 2', { collectionName: 'Harry Potter Collection', director: 'Chris Columbus', year: 2002 }),
  ]);
  // Same director as an owned film too — collection still wins.
  const why = explainRecommendation(
    mk('Potter 3', { collectionName: 'Harry Potter Collection', director: 'Chris Columbus' }),
    index
  );

  assert.equal(why?.kind, 'collection');
  // "Collection" is stripped — the card says the saga's name, not Jellyfin's label.
  assert.equal(why?.text, 'You have 2 of the Harry Potter films.');
});

test('one shared actor is a coincidence; two is a reason', () => {
  const oneFilm = buildLibraryIndex([mk('Heat', { actors: ['Al Pacino'] })]);
  // Falls through the actor rung — with no anchor and nothing else to say,
  // there is no card at all.
  assert.equal(explainRecommendation(mk('Serpico', { actors: ['Al Pacino'] }), oneFilm), null);

  const twoFilms = buildLibraryIndex([
    mk('Heat', { actors: ['Al Pacino'], year: 1995 }),
    mk('The Godfather', { actors: ['Al Pacino'], year: 1972 }),
  ]);
  const why = explainRecommendation(mk('Serpico', { actors: ['Al Pacino'] }), twoFilms);
  assert.equal(why?.kind, 'actor');
  assert.equal(why?.text, 'Al Pacino is in 2 films you own.');
});

test('the actor rung picks the face you own most of, not the top-billed one', () => {
  const index = buildLibraryIndex([
    mk('A', { actors: ['Bit Player', 'Character Actor'] }),
    mk('B', { actors: ['Character Actor'] }),
    mk('C', { actors: ['Character Actor'] }),
  ]);
  const why = explainRecommendation(mk('D', { actors: ['Bit Player', 'Character Actor'] }), index);
  assert.equal(why?.text, 'Character Actor is in 3 films you own.');
});

test('a film with no connection to the library gets no card at all', () => {
  const index = buildLibraryIndex([mk('Heat', { director: 'Michael Mann', genres: ['Crime'] })]);
  // No shared director, cast, studio, collection — and a genre count of 1 is
  // well under the "sounds like a habit" threshold. Silence beats filler.
  assert.equal(explainRecommendation(mk('Paddington', { genres: ['Family'] }), index), null);
});

test('titles you already own are never recommended back to you', () => {
  const index = buildLibraryIndex([mk('Heat', { director: 'Michael Mann', year: 1995 })]);
  const picks = pickRecommendations(
    [mk('Heat', { director: 'Michael Mann' }), mk('Thief', { director: 'Michael Mann' })],
    index
  );
  assert.deepEqual(picks.map((p) => p.movie.title), ['Thief']);
});

test('"Unknown Director" never anchors a reason', () => {
  // Jellyfin's placeholder for a missing credit would otherwise match every
  // unscraped film in the library against every other one.
  const index = buildLibraryIndex([mk('A'), mk('B'), mk('C')]); // all Unknown Director
  assert.equal(explainRecommendation(mk('D'), index), null);
  assert.equal(index.byDirector.size, 0);
});

test('unowned titles are not evidence of taste', () => {
  // A gap or coming-soon title is something you do NOT have. Letting it into
  // the index would let one recommendation justify another.
  const index = buildLibraryIndex([
    mk('Owned', { director: 'Michael Mann' }),
    mk('A Gap', { director: 'Ridley Scott', collectionGap: true }),
    mk('Requested', { director: 'Ridley Scott', comingSoon: true }),
    mk('On The Rack', { director: 'Ridley Scott', discovery: true }),
  ]);
  assert.equal(index.total, 1);
  assert.equal(explainRecommendation(mk('Alien', { director: 'Ridley Scott' }), index), null);
});

test('the shelf-talker spreads its reasons instead of repeating one', () => {
  // Three "people who rented X rented this too" cards is a worse shelf than
  // one of each kind, even when the flat scores would stack them.
  const index = buildLibraryIndex([
    mk('Heat', { director: 'Michael Mann', actors: ['Al Pacino'], year: 1995 }),
    mk('The Godfather', { actors: ['Al Pacino'], year: 1972 }),
  ]);
  const anchor = mk('Heat', { director: 'Michael Mann' });
  const picks = pickRecommendations(
    [
      mk('Thief', { director: 'Michael Mann', communityRating: 7.4 }),
      mk('Manhunter', { director: 'Michael Mann', communityRating: 7.2 }),
      mk('Serpico', { actors: ['Al Pacino'], communityRating: 7.7 }),
      mk('Unrelated', { communityRating: 9.9 }),
    ],
    index,
    anchor
  );

  assert.equal(picks.length, 3);
  const kinds = picks.map((p) => p.why.kind);
  // Strongest single reason still leads...
  assert.equal(kinds[0], 'director');
  // ...but the second director film doesn't crowd out the other rungs.
  assert.ok(new Set(kinds).size >= 2, `expected varied reasons, got ${kinds.join(', ')}`);
  assert.ok(kinds.includes('actor'), `expected an actor card, got ${kinds.join(', ')}`);
});

test('with an anchor, an otherwise-unconnected film still earns the also-liked line', () => {
  const index = buildLibraryIndex([mk('Heat', { director: 'Michael Mann' })]);
  const anchor = mk('Heat', { director: 'Michael Mann' });
  const why = explainRecommendation(mk('Ronin', {}), index, anchor);
  assert.equal(why?.kind, 'alsoLiked');
  assert.equal(why?.text, 'People who rented Heat rented this too.');
});
