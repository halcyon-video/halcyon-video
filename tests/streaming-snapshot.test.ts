// Bundled streaming-service snapshot (GH #86 zero-setup follow-up, owner
// ruling 2026-08-21): fetchStreamingMoviesFromSnapshot is the third rung of
// the source ladder (streaming-catalog.ts's resolveStreamingSource), the one
// that runs with neither TMDB nor Jellyseerr configured. No network mocks
// needed -- it reads the committed JSON directly, so these tests read the
// same file to avoid hardcoding brittle title/id fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchStreamingMoviesFromSnapshot, getStreamingSnapshotMeta } from '../src/streaming-snapshot.ts';
import snapshotData from '../src/data/streaming-snapshot.json' with { type: 'json' };

class FakeLocalStorage {
  private map = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.map.set(k, v);
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
}

async function withStorage(initial: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const original = (globalThis as any).localStorage;
  (globalThis as any).localStorage = new FakeLocalStorage(initial);
  try {
    await fn();
  } finally {
    (globalThis as any).localStorage = original;
  }
}

test('getStreamingSnapshotMeta: returns provenance, freshness policy, and watch region', () => {
  const meta = getStreamingSnapshotMeta();
  assert.equal(meta.watchRegion, 'US');
  assert.equal(meta.provenance, 'tmdb-watch-providers');
  assert.equal(meta.refreshPolicy, 'weekly');
  assert.ok(typeof meta.generatedAt === 'string' && meta.generatedAt.length > 0);
});

test('the committed snapshot has all eight default services with real stock and factual metadata', () => {
  const ids = snapshotData.services.map((s: any) => s.id).sort();
  assert.deepEqual(ids, ['appletv', 'disney', 'hulu', 'max', 'netflix', 'paramount', 'peacock', 'prime'].sort());
  for (const s of snapshotData.services as any[]) {
    assert.ok(s.titles.length > 0, `${s.id} has titles`);
    for (const t of s.titles) {
      assert.equal(typeof t.tmdbId, 'number');
      assert.equal(typeof t.title, 'string');
      assert.ok(typeof t.overview === 'string' && t.overview.length > 0);
      assert.ok(typeof t.duration === 'string' && t.duration.length > 0);
      assert.ok(typeof t.rating === 'string' && t.rating.length > 0);
      assert.ok(typeof t.director === 'string' && t.director.length > 0);
      assert.ok(Array.isArray(t.actors) && t.actors.length > 0);
      assert.ok(Array.isArray(t.genres) && t.genres.length > 0);
    }
  }
});

test('fetchStreamingMoviesFromSnapshot: blank/undefined chosen-services resolves to [] (local install default)', async () => {
  await withStorage({}, async () => {
    assert.deepEqual(await fetchStreamingMoviesFromSnapshot(), []);
    assert.deepEqual(await fetchStreamingMoviesFromSnapshot(''), []);
    assert.deepEqual(await fetchStreamingMoviesFromSnapshot(null), []);
  });
});

test('fetchStreamingMoviesFromSnapshot: one chosen service returns only its stock, synthesized as shelvable streaming Movies', async () => {
  await withStorage({}, async () => {
    const movies = await fetchStreamingMoviesFromSnapshot('netflix');
    const netflixSnapshot = (snapshotData.services as any[]).find((s) => s.id === 'netflix')!;
    assert.equal(movies.length, netflixSnapshot.titles.length);
    for (const m of movies) {
      assert.equal(m.streaming, true);
      assert.equal(m.streamingServiceId, 'netflix');
      assert.equal(m.streamingServiceName, 'NETFLIX');
      assert.ok(m.posterUrl === undefined || m.posterUrl!.startsWith('https://image.tmdb.org/'));
      assert.notEqual(m.duration, 'N/A');
      assert.notEqual(m.rating, 'NR');
      assert.notEqual(m.director, 'Unknown Director');
      assert.ok(m.actors && m.actors.length > 0);
      assert.ok(m.genres && m.genres.length > 0);
      assert.ok(m.streamingServices && m.streamingServices.length === 1);
    }
  });
});

test('fetchStreamingMoviesFromSnapshot: multiple chosen services stay independent; an unchosen one contributes nothing', async () => {
  await withStorage({}, async () => {
    const movies = await fetchStreamingMoviesFromSnapshot('netflix,hulu');
    const ids = new Set(movies.map((m) => m.streamingServiceId));
    assert.deepEqual([...ids].sort(), ['hulu', 'netflix']);
  });
});

test('fetchStreamingMoviesFromSnapshot: a service outside the snapshot (custom CSV entry) contributes nothing, never throws', async () => {
  await withStorage({}, async () => {
    const movies = await fetchStreamingMoviesFromSnapshot('shudder');
    assert.deepEqual(movies, []);
  });
});

test('fetchStreamingMoviesFromSnapshot: honors the shared jellyseerr_dismissed_ids pool', async () => {
  const netflixSnapshot = (snapshotData.services as any[]).find((s) => s.id === 'netflix')!;
  const dismissedId = netflixSnapshot.titles[0].tmdbId;
  await withStorage({ jellyseerr_dismissed_ids: JSON.stringify([dismissedId]) }, async () => {
    const movies = await fetchStreamingMoviesFromSnapshot('netflix');
    assert.ok(!movies.some((m) => m.tmdbId === dismissedId));
    assert.equal(movies.length, netflixSnapshot.titles.length - 1);
  });
});
