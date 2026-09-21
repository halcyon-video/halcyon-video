import test from 'node:test';
import assert from 'node:assert/strict';
import { STEAM_REVIEW_TIERS, steamTitle, filterSteamTitles, expandedSteamCatalog } from '../src/steam-catalog.ts';
import { isExternalGameActive, onExternalGameChange, withExternalGame, waitForExternalGame } from '../src/external-game-state.ts';

test('Steam exposes every native review score and Everything without inventing thresholds', () => {
  assert.deepEqual(STEAM_REVIEW_TIERS.map(t => t.id).sort(), ['0','1','2','3','4','5','6','7','8','9','all']);
  const titles = Array.from({ length: 10 }, (_, score) => steamTitle({ appid: score + 1, name: `Game ${score}` }, { score, total: 10, positive: score }));
  for (let score = 0; score <= 9; score++) assert.deepEqual(filterSteamTitles(titles, String(score)).map(t => t.steamAppId), [score + 1]);
  assert.equal(filterSteamTitles(titles, 'all').length, 10);
  assert.equal(filterSteamTitles(titles, '10').length, 0);
  assert.equal(filterSteamTitles([steamTitle({ appid: 100, name: 'Unfetched' })], '0').length, 0);
});
test('full Steam shelving preserves movies and every game beyond department capacity', () => {
  const games = Array.from({ length: 1001 }, (_, i) => steamTitle({ appid: i + 1, name: `Game ${i}` }));
  const movies = [{ id: 'movies', name: 'Movies', genres: [], movies: [] }];
  const romm = { ...games[0], id: 'romm:1', steamAppId: undefined };
  const result = expandedSteamCatalog(movies, [...games, romm]);
  assert.equal(result.libraries[0], movies[0]);
  assert.equal(result.libraries[1].movies.length, 1001);
  assert.equal(new Set(result.libraries[1].movies.map(m => m.id)).size, 1001);
  assert.deepEqual(result.games, [romm]);
  assert.equal(expandedSteamCatalog(result.libraries, games).libraries.length, 2);
});
test('game suspension remains latched until completion and releases waiting work', async () => {
  const changes: boolean[] = [];
  const unsubscribe = onExternalGameChange(v => changes.push(v));
  let finish!: () => void;
  let resumed = false;
  const running = withExternalGame(() => new Promise<void>(resolve => { finish = resolve; }));
  assert.equal(isExternalGameActive(), true);
  const waiting = waitForExternalGame().then(() => { resumed = true; });
  await Promise.resolve();
  assert.equal(resumed, false);
  await assert.rejects(withExternalGame(async () => {}), /already/);
  assert.equal(isExternalGameActive(), true);
  finish(); await running; await waiting;
  assert.equal(resumed, true);
  assert.equal(isExternalGameActive(), false);
  assert.deepEqual(changes, [true, false]); unsubscribe();
});
test('failed game launch always releases the suspension latch', async () => {
  await assert.rejects(withExternalGame(async () => { throw new Error('Steam unavailable'); }), /unavailable/);
  assert.equal(isExternalGameActive(), false);
});
