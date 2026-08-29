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
import { resolveEpisodePlaybackArgs, resolveFlatDetailAction } from '../src/flat/flat-playback.ts';

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

function mkMovie(extra: Partial<Movie> = {}): Movie {
  return {
    id: 'm-1',
    title: 'The Matrix',
    year: 1999,
    duration: '136 min',
    rating: 'R',
    overview: 'A computer hacker learns the truth...',
    director: 'The Wachowskis',
    actors: ['Keanu Reeves'],
    genres: ['Action', 'Sci-Fi'],
    localPath: '/media/movies/The Matrix (1999).mkv',
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

// ── Layer 3: resolveFlatDetailAction pure button resolution ─────────────────

test('resolveFlatDetailAction: standard movie resolves to Play button', () => {
  const m = mkMovie();
  assert.deepEqual(resolveFlatDetailAction(m), {
    kind: 'play',
    text: 'Play',
    icon: '▶',
    disabled: false,
  });
});

test('resolveFlatDetailAction: game resolves to Rent button', () => {
  const m = mkMovie({ game: true, platform: 'SNES' });
  assert.deepEqual(resolveFlatDetailAction(m), {
    kind: 'game',
    text: 'Rent',
    icon: '🎮',
    disabled: false,
  });
});

test('resolveFlatDetailAction: unrequested discovery/collectionGap resolves to Request button', () => {
  const gap = mkMovie({ collectionGap: true, tmdbId: 101 });
  assert.deepEqual(resolveFlatDetailAction(gap, { isRequested: false }), {
    kind: 'request',
    text: 'Request',
    icon: '✦',
    disabled: false,
  });

  const disc = mkMovie({ discovery: true, tmdbId: 102 });
  assert.deepEqual(resolveFlatDetailAction(disc, { isRequested: false }), {
    kind: 'request',
    text: 'Request',
    icon: '✦',
    disabled: false,
  });
});

test('resolveFlatDetailAction: requested discovery/collectionGap resolves to disabled Requested/Coming Soon button', () => {
  const gap = mkMovie({ collectionGap: true, tmdbId: 101 });
  assert.deepEqual(resolveFlatDetailAction(gap, { isRequested: true }), {
    kind: 'request',
    text: 'Coming Soon',
    icon: '✓',
    disabled: true,
  });

  const disc = mkMovie({ discovery: true, tmdbId: 102 });
  assert.deepEqual(resolveFlatDetailAction(disc, { isRequested: true }), {
    kind: 'request',
    text: 'Requested',
    icon: '✓',
    disabled: true,
  });
});

test('resolveFlatDetailAction: comingSoon resolves to disabled Coming Soon button', () => {
  const m = mkMovie({ comingSoon: true });
  assert.deepEqual(resolveFlatDetailAction(m), {
    kind: 'coming-soon',
    text: 'Coming Soon',
    icon: '⏱',
    disabled: true,
  });
});

test('resolveFlatDetailAction: streaming-service title resolves to Watch on <Service> button with link icon', () => {
  const m = mkMovie({
    streaming: true,
    streamingServiceId: 'netflix',
    streamingServiceName: 'NETFLIX',
    streamingUrl: 'https://www.netflix.com/search?q=The%20Matrix',
  });
  assert.deepEqual(resolveFlatDetailAction(m), {
    kind: 'streaming',
    text: 'Watch on NETFLIX',
    icon: '↗',
    disabled: false,
  });
});

