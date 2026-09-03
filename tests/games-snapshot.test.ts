import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGamesFromSnapshot } from '../src/games-snapshot.ts';
import snapshotData from '../src/data/games-snapshot.json' with { type: 'json' };

test('the committed games snapshot has valid platforms and titles', () => {
  const ids = snapshotData.platforms.map((p: any) => p.id).sort();
  assert.deepEqual(ids, ['genesis', 'n64', 'psx', 'snes'].sort());
  for (const p of snapshotData.platforms as any[]) {
    assert.ok(p.titles.length > 0, `${p.id} has titles`);
    for (const t of p.titles) {
      assert.equal(typeof t.title, 'string');
      assert.equal(typeof t.year, 'number');
      assert.ok(t.title.length > 0);
    }
  }
});

test('fetchGamesFromSnapshot returns shelvable game Movies with platform metadata', () => {
  const games = fetchGamesFromSnapshot();
  assert.ok(games.length > 0, 'returns games');
  for (const g of games) {
    assert.equal(g.game, true);
    assert.ok(g.platform);
    assert.ok(g.title);
    assert.ok(g.posterUrl);
  }
});
