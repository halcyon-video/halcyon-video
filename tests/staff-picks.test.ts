// The staff-picks aggregation: watched anchors vote via their TMDB
// "people who liked this also liked" lists; overlap across anchors dominates
// the ranking; picks split into on-shelf stickers vs endcap order candidates.
//
//   npm run test:picks
//
// Runs under plain `node --test` with type stripping — staff-picks.ts keeps
// type-only runtime imports precisely so this works.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { JellyfinLibrary, Movie } from '../src/jellyfin.ts';
import type { RecommendationSeed } from '../src/jellyseerr.ts';
import {
  aggregateSeeds,
  discoveryPickToMovie,
  normalizeTitleKey,
  pickAnchors,
  splitPicks,
  syntheticSeedsFor,
  titleMatchKeys,
} from '../src/staff-picks.ts';

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
  };
}

function seed(tmdbId: number, extra: Partial<RecommendationSeed> = {}): RecommendationSeed {
  return {
    tmdbId,
    title: `Seed ${tmdbId}`,
    year: 2010,
    genres: [],
    hasMediaInfo: false,
    ...extra,
  };
}

function lib(name: string, movies: Movie[]): JellyfinLibrary {
  return { id: name, name, movies, genres: [] };
}

test('pickAnchors: only real owned played films, most recent first, capped', () => {
  const movies = [
    mk('Old Watch', { tmdbId: 1, played: true, lastPlayedDate: '2026-01-01T00:00:00Z' }),
    mk('New Watch', { tmdbId: 2, played: true, lastPlayedDate: '2026-06-01T00:00:00Z' }),
    mk('Unplayed', { tmdbId: 3 }),
    mk('No TmdbId', { played: true }),
    mk('Series Watch', { tmdbId: 4, played: true, isSeries: true }),
    mk('Gap', { tmdbId: 5, played: true, collectionGap: true }),
  ];
  const anchors = pickAnchors([lib('L', movies)]);
  assert.deepEqual(
    anchors.map((a) => a.title),
    ['New Watch', 'Old Watch']
  );
  assert.equal(pickAnchors([lib('L', movies)], 1).length, 1);
});

test('aggregateSeeds: overlap across anchors outranks single-list score', () => {
  const a1 = mk('A1', { tmdbId: 1 });
  const a2 = mk('A2', { tmdbId: 2 });
  const seeds = new Map<number, RecommendationSeed[]>([
    // 100 is the head of one list; 200 appears on BOTH lists (deep in each).
    [1, [seed(100), seed(101), seed(200)]],
    [2, [seed(300), seed(301), seed(200)]],
  ]);
  const picks = aggregateSeeds([a1, a2], seeds);
  assert.equal(picks[0].tmdbId, 200);
  assert.deepEqual(picks[0].sources, ['A1', 'A2']);
  // An anchor recommending itself is dropped, not counted.
  const selfSeeds = new Map([[1, [seed(1), seed(50)]]]);
  const selfPicks = aggregateSeeds([a1], selfSeeds);
  assert.deepEqual(
    selfPicks.map((p) => p.tmdbId),
    [50]
  );
});

test('splitPicks: owned unwatched get the sticker, unowned become order candidates', () => {
  const owned = mk('On Shelf', { tmdbId: 100 });
  const watched = mk('Watched Already', { tmdbId: 101, played: true });
  const libraries = [lib('L', [owned, watched])];
  const picks = aggregateSeeds(
    [mk('A', { tmdbId: 1 })],
    new Map([[1, [seed(100), seed(101), seed(500), seed(501, { hasMediaInfo: true }), seed(502)]]])
  );
  const { owned: op, discovery } = splitPicks(picks, libraries, { dismissed: new Set([502]) });
  // The watched title landed already; the dismissed and mediaInfo'd ones never surface.
  assert.deepEqual(op.map((o) => o.movie.title), ['On Shelf']);
  assert.deepEqual(discovery.map((d) => d.tmdbId), [500]);
});

test('splitPicks: an owned title with no tmdbId still reads as owned (title join)', () => {
  // "Amélie" on the shelf without a Tmdb provider id; TMDB recommends it as
  // id 700 with the accent-less title and a year one off. It must NOT become
  // a "we don't have this" order candidate.
  const owned = mk('Amélie', { year: 2001 });
  const remake = mk('Aladdin', { year: 1992 }); // TMDB recommends the 2019 one
  const picks = aggregateSeeds(
    [mk('A', { tmdbId: 1 })],
    new Map([
      [1, [
        seed(700, { title: 'Amelie', year: 2002 }),
        seed(701, { title: 'Aladdin', year: 2019 }),
        seed(702, { title: 'Fresh Film', year: 2012 }),
      ]],
    ])
  );
  const { owned: op, discovery } = splitPicks(picks, [lib('L', [owned, remake])]);
  assert.deepEqual(op.map((o) => o.movie.title), ['Amélie']);
  // The 2019 Aladdin is a different film from the owned 1992 one — but a
  // same-named REQUEST case beside the one on the shelf reads as a lie, so
  // the pick is dropped outright rather than advertised. Unrelated titles
  // still become candidates.
  assert.deepEqual(discovery.map((d) => d.tmdbId), [702]);
});

test('normalizeTitleKey/titleMatchKeys: spelling variants fold to shared keys', () => {
  assert.equal(normalizeTitleKey('Frozen II'), normalizeTitleKey('Frozen 2'));
  assert.equal(
    normalizeTitleKey('Barbie & the Diamond Castle'),
    normalizeTitleKey('Barbie and the Diamond Castle')
  );
  // Ambiguous single letters stay literal — "V for Vendetta" is not "5 for Vendetta".
  assert.equal(normalizeTitleKey('V for Vendetta'), 'v for vendetta');
  const keys = titleMatchKeys("Beauty and the Beast: Belle's Magical World");
  assert.ok(keys.includes(normalizeTitleKey("Belle's Magical World")));
  // Short subtitles would collide across franchises — full key only.
  assert.equal(titleMatchKeys('Saw: Part 2').length, 1);
});

test('splitPicks: owned titles under variant spellings never become candidates', () => {
  // The user-reported trio: &/and, Roman numeral, franchise-prefixed subtitle.
  const libraries = [
    lib('L', [
      mk('Barbie & the Diamond Castle', { year: 2008 }),
      mk('Frozen 2', { year: 2019 }),
      mk("Belle's Magical World", { year: 1998 }),
    ]),
  ];
  const picks = aggregateSeeds(
    [mk('A', { tmdbId: 1 })],
    new Map([
      [1, [
        seed(801, { title: 'Barbie and the Diamond Castle', year: 2008 }),
        seed(802, { title: 'Frozen II', year: 2019 }),
        seed(803, { title: "Beauty and the Beast: Belle's Magical World", year: 1998 }),
        seed(804, { title: 'Some Fresh Film', year: 2020 }),
      ]],
    ])
  );
  const { owned: op, discovery } = splitPicks(picks, libraries);
  assert.deepEqual(
    new Set(op.map((o) => o.movie.title)),
    new Set(['Barbie & the Diamond Castle', 'Frozen 2', "Belle's Magical World"])
  );
  assert.deepEqual(discovery.map((d) => d.tmdbId), [804]);
});

test('splitPicks: minDiscoverySources filters one-anchor echoes', () => {
  const picks = aggregateSeeds(
    [mk('A', { tmdbId: 1 }), mk('B', { tmdbId: 2 })],
    new Map([
      [1, [seed(500), seed(600)]],
      [2, [seed(500)]],
    ])
  );
  const { discovery } = splitPicks(picks, [lib('L', [])], { minDiscoverySources: 2 });
  assert.deepEqual(discovery.map((d) => d.tmdbId), [500]);
});

test('discoveryPickToMovie: orderable empty-box with the overlap as its why', () => {
  const picks = aggregateSeeds(
    [mk('Heat', { tmdbId: 1 }), mk('Ronin', { tmdbId: 2 })],
    new Map([
      [1, [seed(500, { title: 'Thief', genres: ['Crime'] })]],
      [2, [seed(500, { title: 'Thief', genres: ['Crime'] })]],
    ])
  );
  picks[0].detail = { director: 'Michael Mann' };
  const movie = discoveryPickToMovie(picks[0], new Set([500]));
  assert.equal(movie.title, 'Thief');
  assert.equal(movie.discovery, true);
  assert.equal(movie.staffPick, true);
  assert.equal(movie.discoveryRequested, true);
  assert.equal(movie.director, 'Michael Mann');
  assert.match(movie.overview, /because you watched Heat and Ronin/);
});

test('syntheticSeedsFor: deterministic, overlapping for same-genre anchors', () => {
  const pool: Movie[] = [];
  for (let i = 0; i < 30; i++) {
    pool.push(mk(`T${i}`, { tmdbId: 100000 + i, genres: [i % 2 ? 'Drama' : 'Action'] }));
  }
  const a1 = pool[0]; // Action, tmdbId 100000
  const a2 = pool[4]; // Action, tmdbId 100004
  const s1 = syntheticSeedsFor(a1, pool);
  const s2 = syntheticSeedsFor(a2, pool);
  assert.deepEqual(s1, syntheticSeedsFor(a1, pool)); // deterministic
  const ids1 = new Set(s1.map((s) => s.tmdbId));
  const overlap = s2.filter((s) => ids1.has(s.tmdbId));
  assert.ok(overlap.length >= 2, `expected overlap, got ${overlap.length}`);
  // The unowned candidates live in their own tmdb block and share the genre.
  const synth = s1.filter((s) => s.tmdbId >= 600000);
  assert.equal(synth.length, 3);
  assert.deepEqual(synth[0].genres, ['Action']);
});
