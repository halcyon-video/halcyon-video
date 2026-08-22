// GH #71 (P3, "latent, do not naively fix"): the 2.5D detail overlay's
// playEpisode used to "recover" a missing ep.path by calling
// fetchFirstEpisodeOfSeries(server, session, ep.id) — passing an EPISODE id
// where that method wants a SERIES id. It was deleted rather than "fixed"
// (see src/flat/flat-playback.ts for the full reasoning): the player builds
// every stream URL from the item id alone on both backends, so an empty path
// never needed recovering, and the "obvious" argument fix (ep.seriesId)
// would have started silently playing the series' first episode for
// whichever one was actually clicked.
//
// Two layers of coverage:
//  1. resolveEpisodePlaybackArgs (the function that replaced the fallback)
//     never attempts resolution — its signature has no server/session, so
//     that isn't a matter of correct behavior so much as it being
//     structurally impossible to reintroduce the network call here.
//  2. A direct regression test against the REAL jellyfin.ts/plex.ts code,
//     pinning the empirical claim the whole deletion rests on: asking either
//     backend for an episode's "children" (as fetchFirstEpisodeOfSeries does
//     when handed an episode id) returns nothing, on BOTH backends. If a
//     server ever stopped behaving this way, this test — not a production
//     incident — is what should catch it.
//
//   npm run test:flatdetail (or: node --experimental-strip-types --test tests/flat-detail.test.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { Episode, Movie } from '../src/jellyfin.ts';
import { fetchFirstEpisodeOfSeries } from '../src/jellyfin.ts';
import { fetchPlexFirstEpisodeOfSeries } from '../src/plex.ts';
import { resolveEpisodePlaybackArgs, resolveDetailButtonState } from '../src/flat/flat-playback.ts';

function mkEpisode(extra: Partial<Episode> = {}): Episode {
  return {
    id: 'ep-1',
    seriesId: 'series-1',
    seriesName: 'Twin Peaks',
    seasonNumber: 3,
    episodeNumber: 7,
    name: 'There\'s Also a Black Dog',
    overview: '',
    path: '',
    ...extra,
  };
}

// ── Layer 1: the pure function flat-detail.ts's playEpisode now calls ──────

test('resolveEpisodePlaybackArgs: a populated path (Jellyfin-shaped episode) passes through unchanged', () => {
  const ep = mkEpisode({ id: 'jf-episode-guid', path: '/media/TV/Twin Peaks/S03E07.mkv' });
  assert.deepEqual(resolveEpisodePlaybackArgs(ep), {
    itemId: 'jf-episode-guid',
    path: '/media/TV/Twin Peaks/S03E07.mkv',
  });
});

test('resolveEpisodePlaybackArgs: a populated path (Plex-shaped episode) passes through unchanged', () => {
  // Plex ids are numeric ratingKey strings, not GUIDs — a different id shape
  // from Jellyfin's, exercised here so this isn't only proven on one
  // backend's data.
  const ep = mkEpisode({ id: '4821', path: '/data/TV Shows/Twin Peaks/Season 03/s03e07.mkv' });
  assert.deepEqual(resolveEpisodePlaybackArgs(ep), {
    itemId: '4821',
    path: '/data/TV Shows/Twin Peaks/Season 03/s03e07.mkv',
  });
});

test('resolveEpisodePlaybackArgs: an empty path (Jellyfin-shaped id) is handed through as-is, never substituted', () => {
  const ep = mkEpisode({ id: 'jf-episode-guid', path: '' });
  assert.deepEqual(resolveEpisodePlaybackArgs(ep), { itemId: 'jf-episode-guid', path: '' });
});

test('resolveEpisodePlaybackArgs: an empty path (Plex-shaped id) is handed through as-is, never substituted', () => {
  const ep = mkEpisode({ id: '4821', path: '' });
  assert.deepEqual(resolveEpisodePlaybackArgs(ep), { itemId: '4821', path: '' });
});

// ── Layer 2: pin the empirical "never fires" claim against real backend code ─

let server: Server;

async function withMock(routes: Record<string, unknown>, fn: (base: string) => Promise<void>) {
  server = createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    const body = routes[path];
    if (body === undefined) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test('Jellyfin: asking for an episode-as-parent (the GH #71 trap) resolves null, exactly as the issue claims', async () => {
  // A real Jellyfin server, asked ?ParentId=<episodeId>, has no Episode
  // children of an episode to return — this route stands in for that "empty
  // Items" response.
  await withMock({ '/Users/u1/Items': { Items: [] } }, async (base) => {
    const result = await fetchFirstEpisodeOfSeries(base, 'tok', 'u1', 'jf-episode-guid');
    assert.equal(result, null);
  });
});

test('Plex: asking for an episode-as-series (the GH #71 trap) resolves null, exactly as the issue claims', async () => {
  // A real PMS, asked /library/metadata/<episodeId>/allLeaves, has no leaves
  // under an episode either.
  await withMock({ '/library/metadata/4821/allLeaves': { MediaContainer: { size: 0 } } }, async (base) => {
    const result = await fetchPlexFirstEpisodeOfSeries(base, 'tok', '4821');
    assert.equal(result, null);
  });
});

// ── Layer 3: detail action button state resolution ───────────────────────────

test('resolveDetailButtonState: standard library movie resolves to Play (enabled)', () => {
  const movie: Partial<Movie> = { id: 'm-1', title: 'Twin Peaks: Fire Walk With Me' };
  assert.deepEqual(resolveDetailButtonState(movie), {
    text: 'Play',
    icon: '▶',
    disabled: false,
  });
});

test('resolveDetailButtonState: game title resolves to Rent (enabled)', () => {
  const game: Partial<Movie> = { id: 'g-1', title: 'Chrono Trigger', game: true, platform: 'SNES' };
  assert.deepEqual(resolveDetailButtonState(game), {
    text: 'Rent',
    icon: '🎮',
    disabled: false,
  });
});

test('resolveDetailButtonState: unrequested discovery title resolves to Request (enabled)', () => {
  const discovery: Partial<Movie> = { id: 'd-1', title: 'Dune: Part Two', discovery: true, tmdbId: 693134 };
  assert.deepEqual(resolveDetailButtonState(discovery, false), {
    text: 'Request',
    icon: '✦',
    disabled: false,
  });
});

test('resolveDetailButtonState: requested discovery title resolves to Requested (disabled)', () => {
  const discovery: Partial<Movie> = { id: 'd-1', title: 'Dune: Part Two', discovery: true, tmdbId: 693134 };
  assert.deepEqual(resolveDetailButtonState(discovery, true), {
    text: 'Requested',
    icon: '✓',
    disabled: true,
  });
});

test('resolveDetailButtonState: unrequested collection gap resolves to Request (enabled)', () => {
  const gap: Partial<Movie> = { id: 'c-1', title: 'The Empire Strikes Back', collectionGap: true, tmdbId: 1891 };
  assert.deepEqual(resolveDetailButtonState(gap, false), {
    text: 'Request',
    icon: '✦',
    disabled: false,
  });
});

test('resolveDetailButtonState: requested collection gap resolves to Coming Soon (disabled)', () => {
  const gap: Partial<Movie> = { id: 'c-1', title: 'The Empire Strikes Back', collectionGap: true, tmdbId: 1891 };
  assert.deepEqual(resolveDetailButtonState(gap, true), {
    text: 'Coming Soon',
    icon: '✓',
    disabled: true,
  });
});

test('resolveDetailButtonState: streaming title resolves to Watch on <SERVICE> (enabled)', () => {
  const streaming: Partial<Movie> = {
    id: 'streaming_netflix_12345',
    title: 'Glass Onion',
    streaming: true,
    streamingServiceId: 'netflix',
    streamingServiceName: 'NETFLIX',
    streamingUrl: 'https://www.netflix.com/search?q=Glass%20Onion',
  };
  assert.deepEqual(resolveDetailButtonState(streaming), {
    text: 'Watch on NETFLIX',
    icon: '↗',
    disabled: false,
  });
});

test('resolveDetailButtonState: streaming title without explicit service name falls back to Streaming', () => {
  const streaming: Partial<Movie> = {
    id: 'streaming_custom_99999',
    title: 'Indie Film',
    streaming: true,
  };
  assert.deepEqual(resolveDetailButtonState(streaming), {
    text: 'Watch on Streaming',
    icon: '↗',
    disabled: false,
  });
});

test('resolveDetailButtonState: coming soon movie resolves to Coming Soon (disabled)', () => {
  const comingSoon: Partial<Movie> = { id: 'cs-1', title: 'Upcoming Film', comingSoon: true };
  assert.deepEqual(resolveDetailButtonState(comingSoon), {
    text: 'Coming Soon',
    icon: '⏱',
    disabled: true,
  });
});

