import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie } from '../src/jellyfin.ts';
import {
  buildTvStreamablePool,
  isTvStreamableTitle,
  type TvPoolLibrary,
} from '../src/ambient-tv-pool.ts';

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'movie-1',
    title: 'Test Movie',
    genres: ['Action'],
    isSeries: false,
    ...overrides,
  } as Movie;
}

test('isTvStreamableTitle: identifies streamable server titles vs synthetic/unstocked titles', () => {
  const realFilm = makeMovie({ id: 'f-1', title: 'Real Film' });
  assert.equal(isTvStreamableTitle(realFilm), true);

  const streamingMovie = makeMovie({ id: 's-1', title: 'Stream Title', streaming: true });
  assert.equal(isTvStreamableTitle(streamingMovie), false);

  const discoveryMovie = makeMovie({ id: 'd-1', title: 'Discovery Title', discovery: true });
  assert.equal(isTvStreamableTitle(discoveryMovie), false);

  const gapMovie = makeMovie({ id: 'g-1', title: 'Gap Title', collectionGap: true });
  assert.equal(isTvStreamableTitle(gapMovie), false);

  const comingSoonMovie = makeMovie({ id: 'cs-1', title: 'Coming Soon', comingSoon: true });
  assert.equal(isTvStreamableTitle(comingSoonMovie), false);

  const gameMovie = makeMovie({ id: 'gm-1', title: 'Game Title', game: true });
  assert.equal(isTvStreamableTitle(gameMovie), false);

  const gameObjMovie = makeMovie({ id: 'gm-2', title: 'Game Object' } as any);
  (gameObjMovie as any).isGame = true;
  assert.equal(isTvStreamableTitle(gameObjMovie), false);

  assert.equal(isTvStreamableTitle(realFilm, { streaming: true }), false);
  assert.equal(isTvStreamableTitle(realFilm, { games: true }), false);
});

test('buildTvStreamablePool: unchosen default excludes streaming and synthetic titles', () => {
  const realAction = makeMovie({ id: 'm-1', title: 'Die Hard', genres: ['Action'] });
  const realFamily = makeMovie({ id: 'm-2', title: 'Toy Story', genres: ['Family', 'Animation'] });
  const streamingFamily = makeMovie({ id: 's-1', title: 'Moana', genres: ['Family'], streaming: true });
  const gapFamily = makeMovie({ id: 'g-1', title: 'Lion King', genres: ['Family'], collectionGap: true });

  const libs: TvPoolLibrary[] = [
    {
      id: 'lib-movies',
      name: 'Movies',
      movies: [realAction, realFamily, gapFamily],
    },
    {
      id: 'lib-netflix',
      name: 'Netflix',
      streaming: true,
      movies: [streamingFamily],
    },
  ];

  const result = buildTvStreamablePool(libs, new Set());
  assert.equal(result.fromChosen, false);
  // Only realFamily should be in the pool (family filter applied, synthetic excluded)
  assert.deepEqual(result.pool, [realFamily]);
});

test('buildTvStreamablePool: unchosen default falls back to all streamable films when no family titles exist', () => {
  const realAction = makeMovie({ id: 'm-1', title: 'Die Hard', genres: ['Action'] });
  const realSciFi = makeMovie({ id: 'm-2', title: 'Alien', genres: ['Sci-Fi', 'Horror'] });
  const streamingFilm = makeMovie({ id: 's-1', title: 'Extraction', genres: ['Action'], streaming: true });
  const gameTitle = makeMovie({ id: 'gm-1', title: 'Chrono Trigger', game: true });

  const libs: TvPoolLibrary[] = [
    {
      id: 'lib-movies',
      name: 'Movies',
      movies: [realAction, realSciFi],
    },
    {
      id: 'lib-streaming',
      name: 'Prime Video',
      streaming: true,
      movies: [streamingFilm],
    },
    {
      id: 'lib-games',
      name: 'Games',
      games: true,
      movies: [gameTitle],
    },
  ];

  const result = buildTvStreamablePool(libs, new Set());
  assert.equal(result.fromChosen, false);
  assert.deepEqual(result.pool, [realAction, realSciFi]);
});

test('buildTvStreamablePool: unchosen default excludes series containers', () => {
  const realFilm = makeMovie({ id: 'm-1', title: 'Die Hard', genres: ['Action'], isSeries: false });
  const realSeries = makeMovie({ id: 'tv-1', title: 'Twin Peaks', genres: ['Drama'], isSeries: true });

  const libs: TvPoolLibrary[] = [
    {
      id: 'lib-movies',
      name: 'Movies',
      movies: [realFilm],
    },
    {
      id: 'lib-tv',
      name: 'TV Shows',
      movies: [realSeries],
    },
  ];

  const result = buildTvStreamablePool(libs, new Set());
  assert.equal(result.fromChosen, false);
  assert.deepEqual(result.pool, [realFilm]);
});

test('buildTvStreamablePool: chosen libraries include series containers but still exclude synthetic stock', () => {
  const realSeries = makeMovie({ id: 'tv-1', title: 'Twin Peaks', isSeries: true });
  const gapSeries = makeMovie({ id: 'tv-2', title: 'Lost', isSeries: true, collectionGap: true });
  const realFilm = makeMovie({ id: 'm-1', title: 'Die Hard', isSeries: false });

  const libs: TvPoolLibrary[] = [
    {
      id: 'lib-movies',
      name: 'Movies',
      movies: [realFilm],
    },
    {
      id: 'lib-tv',
      name: 'TV Shows',
      movies: [realSeries, gapSeries],
    },
  ];

  const result = buildTvStreamablePool(libs, new Set(['lib-tv']));
  assert.equal(result.fromChosen, true);
  assert.deepEqual(result.pool, [realSeries]);
});

test('buildTvStreamablePool: empty / fully synthetic libraries yield an empty pool', () => {
  const streamingFilm = makeMovie({ id: 's-1', title: 'Stream', streaming: true });
  const libs: TvPoolLibrary[] = [
    {
      id: 'lib-stream',
      name: 'Netflix',
      streaming: true,
      movies: [streamingFilm],
    },
  ];

  const result = buildTvStreamablePool(libs, new Set());
  assert.equal(result.fromChosen, false);
  assert.deepEqual(result.pool, []);
});
