// Direct-to-TMDB streaming client (GH #86 follow-up): config resolution +
// v3/v4 credential detection are pure and tested directly; the network round
// trip (fetchStreamingMoviesFromTmdb) is tested against fetch mocks + fixture
// responses shaped like TMDB's real snake_case payloads -- no live key, ever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTmdbConfig,
  isV4ReadAccessToken,
  normalizeDiscoverItem,
  fetchStreamingMoviesFromTmdb,
} from '../src/tmdb.ts';

// ─── Pure helpers (no network, no storage) ─────────────────────────────────

test('getTmdbConfig: blank/absent reads as unconfigured', () => {
  assert.equal(getTmdbConfig(() => null), null);
  assert.equal(getTmdbConfig(() => undefined), null);
  assert.equal(getTmdbConfig(() => ''), null);
  assert.equal(getTmdbConfig(() => '   '), null);
});

test('getTmdbConfig: a non-blank key is configured, trimmed', () => {
  assert.deepEqual(getTmdbConfig(() => '  abc123  '), { apiKey: 'abc123' });
});

test('isV4ReadAccessToken: JWT-shaped v4 tokens start with eyJ; a v3 hex key does not', () => {
  assert.equal(isV4ReadAccessToken('eyJhbGciOiJIUzI1NiJ9.payload.sig'), true);
  assert.equal(isV4ReadAccessToken('1234567890abcdef1234567890abcdef'), false);
});

test('normalizeDiscoverItem: TMDB snake_case -> streaming-catalog.ts camelCase RawDiscoverItem', () => {
  const raw = {
    id: 603,
    title: 'The Matrix',
    release_date: '1999-03-31',
    poster_path: '/poster.jpg',
    overview: 'A hacker discovers reality is a simulation.',
    vote_average: 8.7,
    genre_ids: [28, 878],
  };
  assert.deepEqual(normalizeDiscoverItem(raw), {
    id: 603,
    title: 'The Matrix',
    releaseDate: '1999-03-31',
    posterPath: '/poster.jpg',
    overview: 'A hacker discovers reality is a simulation.',
    voteAverage: 8.7,
    genreIds: [28, 878],
  });
});

test('normalizeDiscoverItem: falls back to `name` when `title` is absent', () => {
  assert.equal(normalizeDiscoverItem({ id: 1, name: 'Show Name' }).title, 'Show Name');
});

// ─── fetchStreamingMoviesFromTmdb (mocked localStorage + fetch) ────────────

class FakeLocalStorage {
  private map = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.map.set(k, v);
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

/** Swap in a fake localStorage + fetch for the duration of `fn`, always
 *  restoring the real globals afterward -- these tests never touch a live
 *  TMDB key or a live network. */
async function withEnv(
  storageInit: Record<string, string>,
  fetchImpl: (url: string, init?: any) => Promise<any> | any,
  fn: () => Promise<void>
): Promise<void> {
  const originalLocalStorage = (globalThis as any).localStorage;
  const originalFetch = globalThis.fetch;
  (globalThis as any).localStorage = new FakeLocalStorage(storageInit);
  (globalThis as any).fetch = fetchImpl;
  try {
    await fn();
  } finally {
    (globalThis as any).localStorage = originalLocalStorage;
    globalThis.fetch = originalFetch;
  }
}

test('fetchStreamingMoviesFromTmdb: unconfigured (no tmdb_apikey) resolves to [] without a single fetch call', async () => {
  let calls = 0;
  await withEnv({}, async () => { calls++; return jsonResponse({}); }, async () => {
    const movies = await fetchStreamingMoviesFromTmdb();
    assert.deepEqual(movies, []);
  });
  assert.equal(calls, 0);
});

test('fetchStreamingMoviesFromTmdb: a v3 key goes on the URL as api_key, never as an Authorization header', async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = async (url: string, init: any) => {
    calls.push({ url, headers: (init && init.headers) || {} });
    if (url.includes('/watch/providers/movie')) {
      return jsonResponse({ results: [{ provider_id: 8, provider_name: 'Netflix' }] });
    }
    return jsonResponse({ results: [] });
  };
  await withEnv({ tmdb_apikey: '1234567890abcdef1234567890abcdef' }, fetchImpl, async () => {
    await fetchStreamingMoviesFromTmdb('Netflix');
  });
  assert.equal(calls.length, 2); // provider list + one discover call
  for (const c of calls) {
    assert.ok(c.url.includes('api_key=1234567890abcdef1234567890abcdef'), c.url);
    assert.equal(c.headers.Authorization, undefined);
  }
});

test('fetchStreamingMoviesFromTmdb: a v4 read-access token goes in an Authorization Bearer header, never on the URL', async () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.payload.sig';
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = async (url: string, init: any) => {
    calls.push({ url, headers: (init && init.headers) || {} });
    if (url.includes('/watch/providers/movie')) {
      return jsonResponse({ results: [{ provider_id: 8, provider_name: 'Netflix' }] });
    }
    return jsonResponse({ results: [] });
  };
  await withEnv({ tmdb_apikey: token }, fetchImpl, async () => {
    await fetchStreamingMoviesFromTmdb('Netflix');
  });
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.headers.Authorization, `Bearer ${token}`);
    assert.ok(!c.url.includes('api_key='), c.url);
  }
});

test('fetchStreamingMoviesFromTmdb: discover call is scoped to flatrate/region/provider, parses results, and honors the dismissed pool', async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    if (url.includes('/watch/providers/movie')) {
      return jsonResponse({ results: [{ provider_id: 8, provider_name: 'Netflix' }] });
    }
    if (url.includes('/discover/movie')) {
      return jsonResponse({
        results: [
          {
            id: 603, title: 'The Matrix', release_date: '1999-03-31',
            poster_path: '/p.jpg', overview: 'x', vote_average: 8.7, genre_ids: [28],
          },
          { id: 999, title: 'Dismissed Film' },
        ],
      });
    }
    throw new Error(`unexpected url ${url}`);
  };
  await withEnv(
    { tmdb_apikey: 'abcd', jellyseerr_dismissed_ids: JSON.stringify([999]) },
    fetchImpl,
    async () => {
      const movies = await fetchStreamingMoviesFromTmdb('Netflix');
      assert.equal(movies.length, 1);
      assert.equal(movies[0].tmdbId, 603);
      assert.equal(movies[0].streamingServiceId, 'netflix');
      assert.equal(movies[0].posterUrl, 'https://image.tmdb.org/t/p/w342/p.jpg');
    }
  );
  const discoverCall = calls.find((u) => u.includes('/discover/movie'))!;
  assert.ok(discoverCall.includes('watch_region=US'));
  assert.ok(discoverCall.includes('with_watch_providers=8'));
  assert.ok(discoverCall.includes('with_watch_monetization_types=flatrate'));
});

test('fetchStreamingMoviesFromTmdb: a service absent from the region provider list is skipped (no discover call), never throws', async () => {
  const discoverCalls: string[] = [];
  const fetchImpl = async (url: string) => {
    if (url.includes('/watch/providers/movie')) {
      return jsonResponse({ results: [{ provider_id: 8, provider_name: 'Netflix' }] }); // Hulu absent
    }
    discoverCalls.push(url);
    return jsonResponse({ results: [] });
  };
  await withEnv({ tmdb_apikey: 'abcd' }, fetchImpl, async () => {
    const movies = await fetchStreamingMoviesFromTmdb('Hulu');
    assert.deepEqual(movies, []);
  });
  assert.equal(discoverCalls.length, 0);
});

test('fetchStreamingMoviesFromTmdb: a failed watch-provider-list fetch resolves to [] rather than throwing', async () => {
  await withEnv({ tmdb_apikey: 'abcd' }, async () => jsonResponse({}, false, 401), async () => {
    const movies = await fetchStreamingMoviesFromTmdb();
    assert.deepEqual(movies, []);
  });
});

test("fetchStreamingMoviesFromTmdb: one service's failed discover call does not block the others", async () => {
  const fetchImpl = async (url: string) => {
    if (url.includes('/watch/providers/movie')) {
      return jsonResponse({
        results: [
          { provider_id: 8, provider_name: 'Netflix' },
          { provider_id: 15, provider_name: 'Hulu' },
        ],
      });
    }
    if (url.includes('with_watch_providers=8')) return jsonResponse({}, false, 500); // Netflix discover fails
    if (url.includes('with_watch_providers=15')) return jsonResponse({ results: [{ id: 1, title: 'Hulu Title' }] });
    throw new Error(`unexpected url ${url}`);
  };
  await withEnv({ tmdb_apikey: 'abcd' }, fetchImpl, async () => {
    const movies = await fetchStreamingMoviesFromTmdb('Netflix,Hulu');
    assert.equal(movies.length, 1);
    assert.equal(movies[0].streamingServiceId, 'hulu');
  });
});

test('fetchStreamingMoviesFromTmdb: a rejected key never appears in what it logs', async () => {
  const apiKey = 'super-secret-tmdb-key';
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    await withEnv({ tmdb_apikey: apiKey }, async () => jsonResponse({}, false, 401), async () => {
      await fetchStreamingMoviesFromTmdb();
    });
  } finally {
    console.warn = originalWarn;
  }
  const serialized = warnings
    .map((a) => a.map((x) => (x instanceof Error ? x.message : String(x))).join(' '))
    .join('\n');
  assert.ok(!serialized.includes(apiKey), serialized);
});
