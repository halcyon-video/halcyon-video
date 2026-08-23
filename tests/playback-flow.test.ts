// Playback-exit/queue logic shared by both playback paths (in-app HTML5 and
// local mpv) — the mpv path can't be exercised end to end without a live
// Jellyfin server + mpv session, so these pure functions are what stand in
// for that coverage.
//
//   npm run test:playbackflow (or: node --experimental-strip-types --test tests/playback-flow.test.ts)
//
// Runs under plain `node --test` with type stripping — no test framework.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie, Episode } from '../src/jellyfin.ts';
import {
  nextEpisodeInQueue,
  episodeLabel,
  resolveActiveItemTiming,
  markWatchedAndFindNext,
  isMpvNaturalFinish,
  playLocalWithMpv,
  type SeriesQueue,
} from '../src/playback-flow.ts';

function mkMovie(extra: Partial<Movie> = {}): Movie {
  return {
    id: 'series-1',
    title: 'Twin Peaks',
    year: 1990,
    duration: 'Series',
    rating: 'TV-14',
    overview: '',
    director: '',
    actors: [],
    genres: [],
    localPath: '',
    isSeries: true,
    ...extra,
  };
}

function mkEpisode(id: string, season: number, ep: number, extra: Partial<Episode> = {}): Episode {
  return {
    id,
    seriesId: 'series-1',
    seriesName: 'Twin Peaks',
    seasonNumber: season,
    episodeNumber: ep,
    name: `Episode ${ep}`,
    overview: '',
    path: `/tv/${id}.mkv`,
    ...extra,
  };
}

test('nextEpisodeInQueue: walks the queue and crosses season boundaries', () => {
  const queue: SeriesQueue = {
    seriesId: 'series-1',
    episodes: [mkEpisode('e1', 1, 1), mkEpisode('e2', 1, 2), mkEpisode('e3', 2, 1)],
  };
  const movie = mkMovie();
  assert.equal(nextEpisodeInQueue(queue, movie, 'e1')?.id, 'e2');
  assert.equal(nextEpisodeInQueue(queue, movie, 'e2')?.id, 'e3'); // crosses into season 2
  assert.equal(nextEpisodeInQueue(queue, movie, 'e3'), null); // series finale: nothing next
});

test('nextEpisodeInQueue: a non-series movie or a stale/mismatched queue never advances', () => {
  const queue: SeriesQueue = { seriesId: 'series-1', episodes: [mkEpisode('e1', 1, 1), mkEpisode('e2', 1, 2)] };
  assert.equal(nextEpisodeInQueue(queue, mkMovie({ isSeries: false }), 'e1'), null);
  assert.equal(nextEpisodeInQueue(queue, mkMovie({ id: 'other-series' }), 'e1'), null);
  assert.equal(nextEpisodeInQueue(null, mkMovie(), 'e1'), null);
});

test('episodeLabel: zero-pads and includes the title when present', () => {
  assert.equal(episodeLabel(mkEpisode('e1', 2, 5, { name: 'The Return' })), 'S02E05 · The Return');
  assert.equal(episodeLabel(mkEpisode('e1', 1, 1, { name: '' })), 'S01E01');
});

test('resolveActiveItemTiming: movie-level fields when playing the item itself', () => {
  const movie = mkMovie({ isSeries: false, resumePositionTicks: 12_000_000, runTimeTicks: 72_000_000_000 });
  const timing = resolveActiveItemTiming(movie, undefined, null);
  assert.equal(timing.resumeTicks, 12_000_000);
  assert.equal(timing.durationTicks, 72_000_000_000);
});

test('resolveActiveItemTiming: an overridden episode looks itself up in the queue, never the movie', () => {
  const movie = mkMovie({ resumePositionTicks: 999, runTimeTicks: 999 }); // must NOT leak into the episode case
  const queue: SeriesQueue = {
    seriesId: 'series-1',
    episodes: [mkEpisode('e1', 1, 1, { resumePositionTicks: 30_000_000, runTimeTicks: 260_000_000_000 })],
  };
  const timing = resolveActiveItemTiming(movie, 'e1', queue);
  assert.equal(timing.resumeTicks, 30_000_000);
  assert.equal(timing.durationTicks, 260_000_000_000);
});

test('resolveActiveItemTiming: unknown episode/absent fields resolve to 0, never undefined', () => {
  const movie = mkMovie();
  assert.deepEqual(resolveActiveItemTiming(movie, 'missing-ep', null), { resumeTicks: 0, durationTicks: 0 });
  assert.deepEqual(resolveActiveItemTiming(mkMovie({ isSeries: false }), undefined, null), { resumeTicks: 0, durationTicks: 0 });
});

test('markWatchedAndFindNext: a quit never bumps watch state or advances', () => {
  const movie = mkMovie({ isSeries: false, played: undefined, playCount: undefined });
  let restocked = false;
  const next = markWatchedAndFindNext(movie, false, null, 'series-1', () => { restocked = true; });
  assert.equal(next, null);
  assert.equal(movie.played, undefined);
  assert.equal(movie.playCount, undefined);
  assert.equal(restocked, false);
});

test('markWatchedAndFindNext: a natural end marks watched, restocks, and returns the next episode', () => {
  const movie = mkMovie({ playCount: 2 });
  const queue: SeriesQueue = { seriesId: 'series-1', episodes: [mkEpisode('e1', 1, 1), mkEpisode('e2', 1, 2)] };
  let restocked = false;
  const next = markWatchedAndFindNext(movie, true, queue, 'e1', () => { restocked = true; });
  assert.equal(next?.id, 'e2');
  assert.equal(movie.played, true);
  assert.equal(movie.playCount, 3);
  assert.equal(restocked, true);
});

test('isMpvNaturalFinish: unknown duration is always ambiguous, never a finish', () => {
  assert.equal(isMpvNaturalFinish(0, 0), false);
  assert.equal(isMpvNaturalFinish(7200, 0), false);
});

test('isMpvNaturalFinish: within tolerance of the known runtime counts as finished', () => {
  const TICKS_PER_SECOND = 10_000_000;
  const duration = 7200 * TICKS_PER_SECOND;
  assert.equal(isMpvNaturalFinish(duration, duration), true); // exact
  assert.equal(isMpvNaturalFinish(duration - 2 * TICKS_PER_SECOND, duration), true); // within tolerance
  assert.equal(isMpvNaturalFinish(duration - 30 * TICKS_PER_SECOND, duration), false); // an early quit
});

test('playLocalWithMpv: returns false when endpoint is unreachable', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error('Connection refused');
    };
    const started = await playLocalWithMpv(
      '/media/test.mkv',
      'movie-1',
      0,
      1000,
      {},
      () => {},
      () => {}
    );
    assert.equal(started, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('playLocalWithMpv: routes playback reporting to active provider (Jellyfin vs Plex)', async () => {
  const origFetch = globalThis.fetch;
  const origLocalStorage = globalThis.localStorage;
  const origSetInterval = globalThis.setInterval;
  const origClearInterval = globalThis.clearInterval;

  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };

  store.set('jellyfin_url', 'http://media.local:8096');
  store.set('jellyfin_token', 'test-token');

  const requests: string[] = [];
  const timerCallbacks: Array<() => Promise<void> | void> = [];
  (globalThis as any).setInterval = (fn: any) => {
    timerCallbacks.push(fn);
    return 123 as any;
  };
  (globalThis as any).clearInterval = () => {};

  try {
    let mpvExited = false;
    let mpvPosition = 10;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url === '/__play') {
        return new Response(JSON.stringify({ id: 'mpv-1' }), { status: 200 });
      }
      if (url.startsWith('/__play?id=')) {
        return new Response(JSON.stringify({ id: 'mpv-1', position: mpvPosition, exited: mpvExited }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    // Test under Jellyfin
    store.set('provider_kind', 'jellyfin');
    requests.length = 0;
    timerCallbacks.length = 0;
    mpvExited = false;
    let exitedNaturally = false;
    const startedJellyfin = await playLocalWithMpv(
      '/media/test.mkv',
      'item-1',
      0,
      100 * 10_000_000,
      {},
      (_ticks, natural) => { exitedNaturally = natural; },
      () => {}
    );
    assert.equal(startedJellyfin, true);
    assert(requests.some((r) => r.includes('/Sessions/Playing')), 'Jellyfin receives /Sessions/Playing on start');
    assert(!requests.some((r) => r.includes('/:/progress')), 'Plex endpoint not called under Jellyfin');

    // Poll progress under Jellyfin
    requests.length = 0;
    await timerCallbacks[0]();
    assert(requests.some((r) => r.includes('/Sessions/Playing/Progress')), 'Jellyfin receives progress');

    // Exit under Jellyfin
    requests.length = 0;
    mpvExited = true;
    mpvPosition = 99; // finished naturally
    await timerCallbacks[0]();
    assert(requests.some((r) => r.includes('/Sessions/Playing/Stopped')), 'Jellyfin receives stop');
    assert.equal(exitedNaturally, true);

    // Test under Plex
    store.set('provider_kind', 'plex');
    requests.length = 0;
    timerCallbacks.length = 0;
    mpvExited = false;
    mpvPosition = 20;
    exitedNaturally = false;
    const startedPlex = await playLocalWithMpv(
      '/media/test.mkv',
      'item-2',
      0,
      100 * 10_000_000,
      {},
      (_ticks, natural) => { exitedNaturally = natural; },
      () => {}
    );
    assert.equal(startedPlex, true);
    assert(!requests.some((r) => r.includes('/Sessions/Playing')), 'Jellyfin start endpoint not called under Plex');

    // Poll progress under Plex
    requests.length = 0;
    await timerCallbacks[0]();
    assert(requests.some((r) => r.includes('/:/progress') && r.includes('state=playing')), 'Plex receives progress ping');

    // Exit naturally under Plex (>=90% for scrobble, within 3s for natural finish)
    requests.length = 0;
    mpvExited = true;
    mpvPosition = 99;
    await timerCallbacks[0]();
    assert(requests.some((r) => r.includes('/:/scrobble')), 'Plex receives scrobble on natural finish');
    assert.equal(exitedNaturally, true);
  } finally {
    globalThis.fetch = origFetch;
    globalThis.localStorage = origLocalStorage;
    globalThis.setInterval = origSetInterval;
    globalThis.clearInterval = origClearInterval;
  }
});


