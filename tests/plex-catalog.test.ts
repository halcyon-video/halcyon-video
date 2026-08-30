// Layer 1 of the backend test pattern: the Plex mapping, against an in-process
// mock server, on every change and with no container.
//
// The fixtures below are TRIMMED CAPTURES of what a real PMS 1.43.3 returned —
// same field names, same types, same nesting, same omissions (note that the
// list query carries Media but no Part[].Stream, and Role entries with a tag
// and nothing else: both are real, and both are why the mapping does what it
// does). Layer 2, tools/verify_plex.mjs, is what re-checks these captures
// against a live server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import {
  fetchPlexLibrariesAndMovies,
  fetchPlexLibraryList,
  fetchPlexSeriesEpisodes,
  fetchPlexServers,
  validatePlexToken,
  buildPlexImageUrl,
  buildPlexHlsStreamUrl,
  buildPlexDirectStreamUrl,
  normalizePlexUrl,
} from '../src/plex.ts';

const SECTIONS = {
  MediaContainer: {
    size: 2,
    Directory: [
      { key: '1', type: 'movie', title: 'Movies' },
      { key: '2', type: 'show', title: 'TV Shows' },
      // Music must not become a shelf — the store has no representation for it.
      { key: '3', type: 'artist', title: 'Music' },
    ],
  },
};

const MOVIES = {
  MediaContainer: {
    size: 2,
    Metadata: [
      {
        ratingKey: '1',
        type: 'movie',
        title: 'Aliens',
        year: 1986,
        contentRating: 'R',
        summary: 'Ripley returns to LV-426 with a team of Colonial Marines.',
        studio: 'SLM Production Group',
        rating: 9.3,
        audienceRating: 9.4,
        thumb: '/library/metadata/1/thumb/1786677811',
        art: '/library/metadata/1/art/1786677811',
        duration: 8520000,
        originallyAvailableAt: '1986-07-18',
        addedAt: 1786677735,
        viewCount: 2,
        lastViewedAt: 1786677881,
        Media: [
          {
            id: 1, duration: 8520000, width: 1920, height: 1080, aspectRatio: 1.78,
            audioChannels: 6, audioCodec: 'aac', videoCodec: 'h264',
            videoResolution: '1080', container: 'mp4',
            Part: [{ id: 1, key: '/library/parts/1/1786677735/file.mp4', file: '/data/Movies/Aliens (1986).mp4', container: 'mp4' }],
          },
        ],
        Genre: [{ tag: 'Action' }, { tag: 'Science Fiction' }],
        Director: [{ tag: 'James Cameron' }],
        Role: [{ tag: 'Sigourney Weaver' }, { tag: 'Carrie Henn' }, { tag: 'Michael Biehn' }],
        Guid: [{ id: 'imdb://tt0090605' }, { id: 'tmdb://679' }, { id: 'tvdb://654' }],
        // No `Rating` array here on purpose: the LIST query doesn't send one
        // (verified against 1.43.3) — only the per-item metadata call does.
        // Blade Runner below covers the array-only fallback.
      },
      {
        // Two Media entries = a multi-version title, and an edition name Plex
        // curators can set where Jellyfin infers one from the filename.
        ratingKey: '2',
        type: 'movie',
        title: 'Blade Runner',
        year: 1982,
        editionTitle: "Director's Cut",
        summary: 'A blade runner must pursue and terminate four replicants.',
        duration: 6660000,
        viewOffset: 1200000,
        thumb: '/library/metadata/2/thumb/1',
        Media: [
          {
            id: 2, width: 1920, height: 1080, audioCodec: 'aac', videoCodec: 'h264',
            videoResolution: '1080', container: 'mp4',
            Part: [{ id: 2, key: '/library/parts/2/1/file.mp4', file: '/data/Movies/Blade Runner (1982).mp4' }],
          },
          {
            id: 3, width: 3840, height: 2160, audioCodec: 'aac', videoCodec: 'hevc',
            videoResolution: '4k', container: 'mkv',
            Part: [{ id: 3, key: '/library/parts/3/1/file.mkv', file: '/data/Movies/Blade Runner (1982) 4K.mkv' }],
          },
        ],
        Genre: [{ tag: 'Science Fiction' }],
        Director: [{ tag: 'Ridley Scott' }],
        Role: [{ tag: 'Harrison Ford' }],
        Guid: [{ id: 'tmdb://78' }],
        // No flat rating/audienceRating — exercises the Rating[] fallback, and
        // the source order that makes reading it first the wrong default.
        Rating: [
          { image: 'imdb://image.rating', value: 8.1, type: 'audience' },
          { image: 'rottentomatoes://image.rating.ripe', value: 8.9, type: 'critic' },
          { image: 'rottentomatoes://image.rating.upright', value: 9.1, type: 'audience' },
        ],
      },
    ],
  },
};

const SHOWS = {
  MediaContainer: {
    size: 1,
    Metadata: [
      {
        ratingKey: '71', type: 'show', title: 'Twin Peaks', year: 1990,
        summary: 'A body washes ashore in a small town.',
        thumb: '/library/metadata/71/thumb/1',
        Genre: [{ tag: 'Drama' }], Director: [], Role: [{ tag: 'Kyle MacLachlan' }],
        Guid: [{ id: 'tmdb://1920' }],
      },
    ],
  },
};

const EPISODES = {
  MediaContainer: {
    size: 3,
    // Deliberately out of order: the mapper is what guarantees shelf order.
    Metadata: [
      {
        ratingKey: '75', parentRatingKey: '72', grandparentRatingKey: '71',
        grandparentTitle: 'Twin Peaks', parentIndex: 1, index: 3, title: 'Zen',
        summary: 'Cooper explains the Tibetan method.', duration: 2820000,
        thumb: '/library/metadata/75/thumb/1', parentThumb: '/library/metadata/72/thumb/1',
        Media: [{ Part: [{ file: '/data/TV Shows/Twin Peaks/Season 01/s01e03.mp4' }] }],
      },
      {
        ratingKey: '73', parentRatingKey: '72', grandparentRatingKey: '71',
        grandparentTitle: 'Twin Peaks', parentIndex: 1, index: 1, title: 'Pilot',
        summary: 'Laura Palmer is found.', duration: 5760000, viewOffset: 600000,
        thumb: '/library/metadata/73/thumb/1', parentThumb: '/library/metadata/72/thumb/1',
        Media: [{ Part: [{ file: '/data/TV Shows/Twin Peaks/Season 01/s01e01.mp4' }] }],
      },
      {
        ratingKey: '74', parentRatingKey: '72', grandparentRatingKey: '71',
        grandparentTitle: 'Twin Peaks', parentIndex: 1, index: 2, title: 'Traces to Nowhere',
        summary: 'Cooper interviews the town.', duration: 2760000,
        thumb: '/library/metadata/74/thumb/1', parentThumb: '/library/metadata/72/thumb/1',
        Media: [{ Part: [{ file: '/data/TV Shows/Twin Peaks/Season 01/s01e02.mp4' }] }],
      },
    ],
  },
};

const COLLECTIONS = {
  MediaContainer: { size: 1, Metadata: [{ ratingKey: '112', title: 'Ridley & Cameron', smart: null }] },
};
const COLLECTION_CHILDREN = {
  MediaContainer: { size: 2, Metadata: [{ ratingKey: '1' }, { ratingKey: '2' }] },
};

let server: Server;
let base: string;

async function withMock(fn: (base: string) => Promise<void>) {
  server = createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    const body =
      path === '/library/sections' ? SECTIONS
      : path === '/library/sections/1/all' ? MOVIES
      : path === '/library/sections/2/all' ? SHOWS
      : path === '/library/sections/1/collections' ? COLLECTIONS
      : path === '/library/sections/2/collections' ? { MediaContainer: { size: 0 } }
      : path === '/library/metadata/112/children' ? COLLECTION_CHILDREN
      : path === '/library/metadata/71/allLeaves' ? EPISODES
      : null;
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as any).port;
  base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test('a Plex section list becomes stocked libraries, minus the ones with no shelf', async () => {
  await withMock(async (base) => {
    const libs = await fetchPlexLibrariesAndMovies(base, 'tok');
    assert.equal(libs.length, 2, 'the music section must not become a library');
    assert.deepEqual(libs.map((l) => l.name), ['Movies', 'TV Shows']);
    assert.equal(libs[0].movies.length, 2);
    assert.deepEqual(libs[0].genres, ['Action', 'Science Fiction']);
  });
});

test('excludeLibraryIds skips a library at sync rather than hiding it after', async () => {
  await withMock(async (base) => {
    const libs = await fetchPlexLibrariesAndMovies(base, 'tok', undefined, {
      excludeLibraryIds: new Set(['2']),
    });
    assert.deepEqual(libs.map((l) => l.name), ['Movies']);
  });
});

// GH #128: the sync stage had NO request timeout at all — a hung request
// (server accepts the connection, then answers nothing) hung the whole sync
// forever, with only the boot flow's blunt 45s stall watchdog ever noticing,
// and it couldn't say what stalled. Each sync-stage request now carries its
// own budget and fails fast with a named cause instead.
test('a library request that never answers fails fast, named, instead of hanging forever', async () => {
  const hang = createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    if (path === '/library/sections') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(SECTIONS));
      return;
    }
    // '/library/sections/1/all' (and everything else) — accept the
    // connection, answer nothing. This is the reported hang, not a refusal.
  });
  await new Promise<void>((r) => hang.listen(0, '127.0.0.1', r));
  const port = (hang.address() as any).port;
  const hangBase = `http://127.0.0.1:${port}`;
  try {
    await assert.rejects(
      fetchPlexLibrariesAndMovies(hangBase, 'tok', undefined, { timeoutMs: 150 }),
      (err: any) => {
        assert.match(err.message, /The "Movies" library did not answer within/);
        return true;
      }
    );
  } finally {
    await new Promise<void>((r) => hang.close(() => r()));
  }
});

test('validatePlexToken fails fast, named, against a server that never answers', async () => {
  const hang = createServer(() => { /* accept, never respond */ });
  await new Promise<void>((r) => hang.listen(0, '127.0.0.1', r));
  const port = (hang.address() as any).port;
  const hangBase = `http://127.0.0.1:${port}`;
  try {
    await assert.rejects(
      validatePlexToken(hangBase, 'tok', { timeoutMs: 150 }),
      /did not answer the sign-in check within/
    );
  } finally {
    await new Promise<void>((r) => hang.close(() => r()));
  }
});

// The setup terminal draws its "which libraries does this store carry?" rows
// from this, and it used to call jellyfin.ts's fetchLibraryList (/Users/<id>/
// Views) no matter which backend was selected — so every Plex install failed
// first-run setup with COULD NOT LIST LIBRARIES, reported from the field.
test('the library list names the sections without pulling any catalog', async () => {
  await withMock(async (base) => {
    const libs = await fetchPlexLibraryList(base, 'tok');
    assert.deepEqual(libs, [
      { id: '1', name: 'Movies' },
      { id: '2', name: 'TV Shows' },
    ], 'the music section has no shelf, so it must not be offered as a toggle');
  });
});

// The invariant that makes the toggles mean anything: the id shown on a
// checkbox row is the id the sync matches excludeLibraryIds against. If these
// two ever drift, every toggle silently governs nothing.
test('a library-list id is the same id excludeLibraryIds honours', async () => {
  await withMock(async (base) => {
    const listed = await fetchPlexLibraryList(base, 'tok');
    const tvId = listed.find((l) => l.name === 'TV Shows')!.id;
    const stocked = await fetchPlexLibrariesAndMovies(base, 'tok', undefined, {
      excludeLibraryIds: new Set([tvId]),
    });
    assert.deepEqual(stocked.map((l) => l.name), ['Movies']);
    // …and the ids agree in the other direction too.
    assert.deepEqual(
      listed.map((l) => l.id),
      (await fetchPlexLibrariesAndMovies(base, 'tok')).map((l) => l.id)
    );
  });
});

test('a movie maps onto every field the shelf reads', async () => {
  await withMock(async (base) => {
    const [movies] = await fetchPlexLibrariesAndMovies(base, 'tok');
    const aliens = movies.movies.find((m) => m.title === 'Aliens')!;
    assert.equal(aliens.id, '1');
    assert.equal(aliens.year, 1986);
    assert.equal(aliens.duration, '142m', 'ms → whole minutes');
    assert.equal(aliens.rating, 'R', 'contentRating is the shelf-visible certificate');
    assert.equal(aliens.director, 'James Cameron');
    assert.deepEqual(aliens.actors, ['Sigourney Weaver', 'Carrie Henn', 'Michael Biehn']);
    assert.deepEqual(aliens.genres, ['Action', 'Science Fiction']);
    assert.equal(aliens.localPath, '/data/Movies/Aliens (1986).mp4');
    assert.equal(aliens.libraryName, 'Movies');
    assert.deepEqual(aliens.studios, ['SLM Production Group']);
    assert.equal(aliens.premiereDate, '1986-07-18');
    assert.equal(aliens.isSeries, false);
    assert.equal(aliens.runTimeTicks, 8520000 * 10_000);
    assert.equal(aliens.dateCreated, new Date(1786677735 * 1000).toISOString());
  });
});

test('tmdbId is parsed from the Guid array — the staff-picks join key', async () => {
  await withMock(async (base) => {
    const [movies] = await fetchPlexLibrariesAndMovies(base, 'tok');
    assert.equal(movies.movies.find((m) => m.title === 'Aliens')!.tmdbId, 679);
    assert.equal(movies.movies.find((m) => m.title === 'Blade Runner')!.tmdbId, 78);
  });
});

test('ratings fill the two back-of-box slots, flat fields winning over Rating[]', async () => {
  await withMock(async (base) => {
    const [movies] = await fetchPlexLibrariesAndMovies(base, 'tok');

    // The list query's flat fields: critic is Rotten Tomatoes on a 0-10 scale,
    // and the case prints it 0-100.
    const aliens = movies.movies.find((m) => m.title === 'Aliens')!;
    assert.equal(aliens.criticRating, 93);
    assert.equal(aliens.communityRating, 9.4);

    // Array-only item: falls back to Rating[], picking by TYPE not by position.
    const blade = movies.movies.find((m) => m.title === 'Blade Runner')!;
    assert.equal(blade.criticRating, 89);
    assert.equal(
      blade.communityRating,
      8.1,
      'the array is source-ordered — this is IMDb, which is exactly why the flat ' +
        'audienceRating must win whenever the server sends one'
    );
  });
});

test('watch state maps to played / playCount / resume', async () => {
  await withMock(async (base) => {
    const [movies] = await fetchPlexLibrariesAndMovies(base, 'tok');
    const aliens = movies.movies.find((m) => m.title === 'Aliens')!;
    const blade = movies.movies.find((m) => m.title === 'Blade Runner')!;
    assert.equal(aliens.played, true);
    assert.equal(aliens.playCount, 2);
    assert.equal(aliens.lastPlayedDate, new Date(1786677881 * 1000).toISOString());
    assert.equal(blade.played, false, 'a resume position is not a watch');
    assert.equal(blade.resumePositionTicks, 1200000 * 10_000);
  });
});

test('two Media entries become versions, best first, carrying the edition name', async () => {
  await withMock(async (base) => {
    const [movies] = await fetchPlexLibrariesAndMovies(base, 'tok');
    const blade = movies.movies.find((m) => m.title === 'Blade Runner')!;
    assert.equal(blade.versions?.length, 2);
    assert.equal(blade.versions![0].is4k, true, 'best quality first');
    assert.match(blade.versions![0].label, /Director's Cut/);
    assert.match(blade.versions![0].label, /4K/);
    assert.equal(blade.versions![1].is4k, false);
    // A single-Media title gets no picker at all.
    assert.equal(movies.movies.find((m) => m.title === 'Aliens')!.versions, undefined);
  });
});

test('collection membership is tagged onto members', async () => {
  await withMock(async (base) => {
    const [movies] = await fetchPlexLibrariesAndMovies(base, 'tok');
    assert.equal(movies.movies.find((m) => m.title === 'Aliens')!.collectionName, 'Ridley & Cameron');
    assert.equal(movies.movies.find((m) => m.title === 'Blade Runner')!.collectionName, 'Ridley & Cameron');
  });
});

test('a series shelves as a Series and its episodes come back in broadcast order', async () => {
  await withMock(async (base) => {
    const libs = await fetchPlexLibrariesAndMovies(base, 'tok');
    const show = libs[1].movies[0];
    assert.equal(show.isSeries, true);
    assert.equal(show.duration, 'Series');

    const eps = await fetchPlexSeriesEpisodes(base, 'tok', '71');
    assert.deepEqual(eps.map((e) => e.episodeNumber), [1, 2, 3], 'mapper sorts, server does not');
    assert.equal(eps[0].name, 'Pilot');
    assert.equal(eps[0].seriesName, 'Twin Peaks');
    assert.equal(eps[0].seasonNumber, 1);
    assert.equal(eps[0].path, '/data/TV Shows/Twin Peaks/Season 01/s01e01.mp4');
    assert.equal(eps[0].resumePositionTicks, 600000 * 10_000);
    assert.equal(eps[1].resumePositionTicks, undefined);
  });
});

test('image URLs: relative paths get the resizer, absolute plex.tv ones pass through', async () => {
  const url = buildPlexImageUrl('http://plex:32400', 'tok', '/library/metadata/1/thumb/9', 400)!;
  assert.match(url, /\/photo\/:\/transcode\?/);
  assert.match(url, /X-Plex-Token=tok/);
  assert.match(url, /upscale=0/);
  // Cast portraits are absolute and unauthenticated — rewriting them breaks them.
  const portrait = 'https://metadata-static.plex.tv/9/people/abc.jpg';
  assert.equal(buildPlexImageUrl('http://plex:32400', 'tok', portrait), portrait);
  assert.equal(buildPlexImageUrl('http://plex:32400', 'tok', undefined), undefined);
});

test('stream URLs carry the token, and HLS hands back a teardown handle', () => {
  const direct = buildPlexDirectStreamUrl('http://plex:32400/', 'tok', '/library/parts/1/2/file.mp4');
  assert.equal(direct, 'http://plex:32400/library/parts/1/2/file.mp4?X-Plex-Token=tok');

  const { url, sessionId } = buildPlexHlsStreamUrl('http://plex:32400', 'tok', '1', {
    maxBitrate: 4_000_000,
    startPositionTicks: 60 * 10_000_000,
  });
  assert.match(url, /\/video\/:\/transcode\/universal\/start\.m3u8\?/);
  assert.match(url, /maxVideoBitrate=4000/, 'bps → kbps');
  assert.match(url, /offset=60/, 'ticks → seconds');
  assert.match(url, new RegExp(`session=${sessionId}`));
  assert.ok(sessionId, 'the session id is the transcode teardown handle');
});

test('server addresses are normalized the way a person would type them', () => {
  assert.equal(normalizePlexUrl('192.168.1.9:32400'), 'http://192.168.1.9:32400');
  assert.equal(normalizePlexUrl('http://plex.local:32400/'), 'http://plex.local:32400');
  assert.equal(normalizePlexUrl('  https://plex.example.com  '), 'https://plex.example.com');
  assert.equal(normalizePlexUrl(''), '');
});

// GH #120: a plain LAN IP must beat plex.direct, which fails outright on
// DNS-rebind-protecting resolvers (Pi-hole, pfSense, common router defaults).
test('fetchPlexServers: plain-IP local beats plex.direct local beats remote beats relay', async () => {
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify([
      {
        name: 'Home',
        clientIdentifier: 'abc123',
        accessToken: 'srv-token',
        owned: true,
        provides: 'server',
        connections: [
          { uri: 'https://192-168-1-50.aabbccdd.plex.direct:32400', local: true, relay: false },
          { uri: 'https://relay.plex.direct:32400', local: false, relay: true },
          { uri: 'https://1-2-3-4.plex.tv:32400', local: false, relay: false },
          { uri: 'http://192.168.1.50:32400', local: true, relay: false },
        ],
      },
    ]),
  });
  try {
    const servers = await fetchPlexServers('acct-token');
    assert.equal(servers.length, 1);
    assert.deepEqual(servers[0].connections, [
      'http://192.168.1.50:32400',
      'https://192-168-1-50.aabbccdd.plex.direct:32400',
      'https://1-2-3-4.plex.tv:32400',
      'https://relay.plex.direct:32400',
    ]);
    // GH #128: relay-ness has to survive past this call so the setup flow can
    // warn about it — it's tracked per-connection, not folded into a bool.
    assert.deepEqual(servers[0].relayConnections, ['https://relay.plex.direct:32400']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// GH #131: Plex servers (or XML-to-JSON serializations) often return single objects
// instead of arrays when a list has exactly 1 element (e.g. Directory, Metadata,
// Genre, Role, Director, Guid, Media, Part, Stream, Rating, collections).
test('single-object response shapes are parsed without crashing', async () => {
  const singleItemServer = createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    let body: any = null;
    if (path === '/library/sections') {
      body = {
        MediaContainer: {
          size: 1,
          Directory: { key: '10', type: 'movie', title: 'Single Movie Lib' },
        },
      };
    } else if (path === '/library/sections/10/all') {
      body = {
        MediaContainer: {
          size: 1,
          Metadata: {
            ratingKey: '100',
            type: 'movie',
            title: 'Sole Film',
            year: 2021,
            Media: {
              id: 50,
              width: 1920,
              height: 1080,
              Part: { id: 50, key: '/part/50.mp4', file: '/data/Sole Film.mp4', Stream: { streamType: 2, id: 1, codec: 'aac' } },
            },
            Genre: { tag: 'Drama' },
            Director: { tag: 'Solo Director' },
            Role: { tag: 'Solo Actor' },
            Guid: { id: 'tmdb://999' },
            Rating: { value: 8.5, type: 'critic' },
          },
        },
      };
    } else if (path === '/library/sections/10/collections') {
      body = {
        MediaContainer: {
          size: 1,
          Metadata: { ratingKey: '200', title: 'Single Collection' },
        },
      };
    } else if (path === '/library/metadata/200/children') {
      body = {
        MediaContainer: {
          size: 1,
          Metadata: { ratingKey: '100' },
        },
      };
    }
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => singleItemServer.listen(0, '127.0.0.1', r));
  const port = (singleItemServer.address() as any).port;
  const srvBase = `http://127.0.0.1:${port}`;
  try {
    const list = await fetchPlexLibraryList(srvBase, 'tok');
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Single Movie Lib');

    const ticks: string[] = [];
    const libs = await fetchPlexLibrariesAndMovies(srvBase, 'tok', (s) => ticks.push(s));
    assert.equal(libs.length, 1);
    assert.equal(libs[0].movies.length, 1);
    const m = libs[0].movies[0];
    assert.equal(m.title, 'Sole Film');
    assert.equal(m.director, 'Solo Director');
    assert.deepEqual(m.actors, ['Solo Actor']);
    assert.deepEqual(m.genres, ['Drama']);
    assert.equal(m.tmdbId, 999);
    assert.equal(m.collectionName, 'Single Collection');
    assert.ok(ticks.includes('page'), 'page progress ticks sent to keep watchdog alive');
  } finally {
    await new Promise<void>((r) => singleItemServer.close(() => r()));
  }
});

test('HTTP errors during sync name the failing library/stage', async () => {
  const errServer = createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    if (path === '/library/sections') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(SECTIONS));
      return;
    }
    if (path === '/library/sections/1/all') {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal error');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => errServer.listen(0, '127.0.0.1', r));
  const port = (errServer.address() as any).port;
  const srvBase = `http://127.0.0.1:${port}`;
  try {
    await assert.rejects(
      fetchPlexLibrariesAndMovies(srvBase, 'tok'),
      (err: any) => {
        assert.match(err.message, /The "Movies" library/);
        assert.match(err.message, /500/);
        return true;
      }
    );
  } finally {
    await new Promise<void>((r) => errServer.close(() => r()));
  }
});

test('Plex sync failure produces a scrubbed report with stage timings and server details', async () => {
  const { initSetupReport, recordSetupServer, recordSetupLibraries, startSetupStage, endSetupStage, recordSetupFailure, getLastSetupReport } = await import('../src/setup-failure-report.ts');
  initSetupReport('plex');
  recordSetupServer({
    product: 'Plex Media Server',
    version: '1.40.1.8227',
    isRelay: false,
    address: 'https://192-168-1-100.abcdef123.plex.direct:32400',
    username: 'test_user',
  });
  recordSetupLibraries([
    { name: 'Movies', carried: true },
    { name: 'TV Shows', carried: true },
  ]);

  startSetupStage('Plex link (PIN)');
  endSetupStage('Plex link (PIN)', 'ok');

  startSetupStage('Sync: Movies');
  try {
    throw new Error('The "Movies" library answered HTTP 500 while stocking items (token: plex_sec_tok_9988).');
  } catch (err: any) {
    recordSetupFailure(err, 'Sync: Movies');
  }

  const report = getLastSetupReport();
  assert.match(report, /=== Halcyon Setup Failure Report ===/);
  assert.match(report, /App: Halcyon 0\.11\.1/);
  assert.match(report, /Server: Plex Media Server \(v1\.40\.1\.8227, relay: false\)/);
  assert.match(report, /Libraries \(2 found, 2 carried\):/);
  assert.match(report, /  - Movies, carried/);
  assert.match(report, /  - TV Shows, carried/);
  assert.match(report, /Failing stage: Sync: Movies/);
  assert.match(report, /Error: The "Movies" library answered HTTP 500/);
  assert.match(report, /Stage timings:/);
  assert.match(report, /  - Plex link \(PIN\): \d+ms \(ok\)/);
  assert.match(report, /  - Sync: Movies: \d+ms \(failed\)/);
  assert.ok(!report.includes('test_user'), 'username must be redacted');
  assert.ok(!report.includes('abcdef123.plex.direct'), 'plex direct domain must be redacted');
});

