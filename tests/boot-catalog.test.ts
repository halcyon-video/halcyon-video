import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncConfiguredCatalog } from '../src/boot-catalog.ts';

test('saved game and platform settings land before any catalog reads them', async () => {
  let restore!: () => void;
  const restored = new Promise<void>((resolve) => { restore = resolve; });
  const settings = { games: false, platform: 'SNES', library: 'old' };
  const calls: string[] = [];
  const movies = [{ id: 'movie-1' }];
  let games: { id: string; platform: string; game: boolean; posterUrl: string }[] = [];
  let finishMovies!: () => void;
  const movieSync = new Promise<void>((resolve) => { finishMovies = resolve; });
  const pending = syncConfiguredCatalog(async () => {
    await restored;
    Object.assign(settings, { games: true, platform: 'PLAYSTATION', library: 'saved' });
  }, async () => {
    calls.push('movies');
    assert.equal(settings.library, 'saved');
    await movieSync;
    return movies;
  }, [async () => {
    calls.push('games');
    if (settings.games) games = [{ id: 'game_1', platform: settings.platform,
      game: true, posterUrl: '/cover.png' }];
  }]);
  assert.deepEqual(calls, [], 'no loader races the pending account restore');
  restore();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['movies', 'games'], 'games sync while movies are still downloading');
  assert.equal(games.length, 1);
  assert.equal(games[0].platform, 'PLAYSTATION');
  finishMovies();
  assert.equal(await pending, movies, 'movie catalog identity and contents are preserved');
});

test('boot waits for game stock before returning the movie catalog', async () => {
  let finishGames!: () => void;
  const games = new Promise<void>((resolve) => { finishGames = resolve; });
  let done = false;
  const pending = syncConfiguredCatalog(async () => {}, async () => ['movie'],
    [() => games]).then((result) => { done = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, false);
  finishGames();
  assert.deepEqual(await pending, ['movie']);
});

test('the movie watchdog does not cut off a still-loading RomM library', async () => {
  let finishGames!: () => void;
  const games = new Promise<void>((resolve) => { finishGames = resolve; });
  let stall!: (error: Error) => void;
  const deadline = new Promise<never>((_, reject) => { stall = reject; });
  const pending = syncConfiguredCatalog(async () => {}, async () => ['movie'],
    [() => games], deadline);
  await new Promise((resolve) => setImmediate(resolve));
  stall(new Error('movie watchdog expired'));
  finishGames();
  assert.deepEqual(await pending, ['movie']);
});

test('restoring a disabled department prevents stale local game stock from loading', async () => {
  let enabled = true;
  let requests = 0;
  await syncConfiguredCatalog(async () => { enabled = false; }, async () => [],
    [async () => { if (enabled) requests++; }]);
  assert.equal(requests, 0);
});
