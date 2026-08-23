// The playback path has to follow the SAME backend the catalog came from.
//
// This is regression cover for a bug that shipped in v0.6.0: the catalog moved
// behind the provider in 0.5.3 but playback did not, so a Plex install browsed
// its own library and then built Jellyfin `/Videos/<id>/stream` URLs against a
// Plex server — no playback, and no resume point ever written. Nothing caught
// it because with one backend the two paths were indistinguishable.
//
// These assertions are about WHICH server's endpoints get addressed. They are
// cheap, and they are the thing that stays true when a third backend lands.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// activeProviderKind() reads localStorage; Node has none. Shim before import.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

// transcodeStreamUrl awaits preflightPlexTranscodeDecision on Plex (#76),
// which hits fetch(); mock fetch so it doesn't fail with a connection error.
(globalThis as any).fetch = async () => new Response('ok', { status: 200 });

const {
  directStreamUrl,
  transcodeStreamUrl,
  transcodeStreamUrlSync,
  playbackIsDirectSafe,
} = await import('../src/playback-routing.ts');

const SERVER = 'http://media.local:32400';
const MP4 = { container: 'mp4', videoCodec: 'h264', audioCodecs: ['aac'] };

beforeEach(() => store.clear());
const useBackend = (kind: string) => store.set('provider_kind', kind);

test('an install with no provider_kind still behaves as Jellyfin', async () => {
  const url = await transcodeStreamUrl(SERVER, 'tok', '42', {});
  assert.match(url, /\/Videos\/42\//, 'installs predating the boundary must not change');
  const syncUrl = transcodeStreamUrlSync(SERVER, 'tok', '42', {});
  assert.match(syncUrl, /\/Videos\/42\//);
});

test('Jellyfin routes to Jellyfin endpoints', async () => {
  useBackend('jellyfin');
  assert.match(directStreamUrl(SERVER, 'tok', '42'), /\/Videos\/42\//);
  assert.match(await transcodeStreamUrl(SERVER, 'tok', '42', {}), /\/Videos\/42\//);
  assert.match(transcodeStreamUrlSync(SERVER, 'tok', '42', {}), /\/Videos\/42\//);
  assert.equal(playbackIsDirectSafe(MP4), true, 'a plain mp4/h264/aac is direct-playable');
});

test('Plex routes to Plex endpoints, and never to a Jellyfin route', async () => {
  useBackend('plex');
  const hls = await transcodeStreamUrl(SERVER, 'tok', '42', {});
  assert.match(hls, /\/video\/:\/transcode\/universal\/start\.m3u8/);
  assert.match(hls, /X-Plex-Token=tok/);
  assert.doesNotMatch(hls, /\/Videos\//, 'the bug this file exists for');

  const syncHls = transcodeStreamUrlSync(SERVER, 'tok', '42', {});
  assert.match(syncHls, /\/video\/:\/transcode\/universal\/start\.m3u8/);
  assert.match(syncHls, /X-Plex-Token=tok/);

  // Even the direct builder — unreachable today, see playbackIsDirectSafe —
  // must not fabricate a Jellyfin URL if a future direct path calls it.
  assert.doesNotMatch(directStreamUrl(SERVER, 'tok', '42'), /\/Videos\//);
});

test('Plex declines synchronous direct play regardless of codecs', () => {
  useBackend('plex');
  assert.equal(
    playbackIsDirectSafe(MP4),
    false,
    "Plex's direct URL needs a Part key no synchronous caller holds; its " +
      'directStream transcode stream-copies a compatible file anyway'
  );
});

test('switching backend switches the playback path with no reload', async () => {
  useBackend('jellyfin');
  assert.match(await transcodeStreamUrl(SERVER, 'tok', '7', {}), /\/Videos\/7\//);
  assert.match(transcodeStreamUrlSync(SERVER, 'tok', '7', {}), /\/Videos\/7\//);
  useBackend('plex');
  assert.match(await transcodeStreamUrl(SERVER, 'tok', '7', {}), /transcode\/universal/);
  assert.match(transcodeStreamUrlSync(SERVER, 'tok', '7', {}), /transcode\/universal/);
});

test('a resume position survives into the stream URL on both backends', async () => {
  const oneMinute = 60 * 10_000_000; // ticks
  useBackend('jellyfin');
  assert.match(
    await transcodeStreamUrl(SERVER, 'tok', '7', { startPositionTicks: oneMinute }),
    /StartTimeTicks=600000000/
  );
  assert.match(
    transcodeStreamUrlSync(SERVER, 'tok', '7', { startPositionTicks: oneMinute }),
    /StartTimeTicks=600000000/
  );
  useBackend('plex');
  assert.match(
    await transcodeStreamUrl(SERVER, 'tok', '7', { startPositionTicks: oneMinute }),
    /offset=60/,
    'Plex takes seconds where Jellyfin takes ticks'
  );
  assert.match(
    transcodeStreamUrlSync(SERVER, 'tok', '7', { startPositionTicks: oneMinute }),
    /offset=60/,
    'Plex takes seconds where Jellyfin takes ticks'
  );
});

// ── Mixed-backend stores (GH #84) ────────────────────────────────────────────
//
// A store can now be stocked from several servers at once, and they need not
// all speak the same backend. `provider_kind` describes only the PRIMARY one,
// so every routed call takes the kind of the source it is actually addressing;
// reading the install-wide one for a second, different backend is how a Plex
// server would be handed Jellyfin URLs — the exact failure this file exists
// for, arriving by a new route.

test('an explicit kind overrides the install-wide one, both directions', async () => {
  useBackend('jellyfin'); // primary is Jellyfin…
  // …but THIS title came from a Plex source.
  const hls = await transcodeStreamUrl(SERVER, 'tok', '42', {}, 'plex');
  assert.match(hls, /\/video\/:\/transcode\/universal\/start\.m3u8/);
  assert.doesNotMatch(hls, /\/Videos\//, 'a Plex source must never get a Jellyfin route');
  assert.match(transcodeStreamUrlSync(SERVER, 'tok', '42', {}, 'plex'),
    /\/video\/:\/transcode\/universal\/start\.m3u8/);
  assert.doesNotMatch(directStreamUrl(SERVER, 'tok', '42', undefined, 'plex'), /\/Videos\//);
  assert.equal(playbackIsDirectSafe(MP4, 'plex'), false, 'Plex is never direct-play');

  useBackend('plex'); // and the mirror image: primary Plex, this title Jellyfin
  assert.match(await transcodeStreamUrl(SERVER, 'tok', '42', {}, 'jellyfin'), /\/Videos\/42\//);
  assert.match(transcodeStreamUrlSync(SERVER, 'tok', '42', {}, 'jellyfin'), /\/Videos\/42\//);
  assert.match(directStreamUrl(SERVER, 'tok', '42', undefined, 'jellyfin'), /\/Videos\/42\//);
  assert.equal(playbackIsDirectSafe(MP4, 'jellyfin'), true);
});

test('omitting the kind still falls back to the install-wide backend', async () => {
  // Single-backend stores pass nothing and must behave exactly as before.
  useBackend('plex');
  assert.doesNotMatch(await transcodeStreamUrl(SERVER, 'tok', '42', {}), /\/Videos\//);
  useBackend('jellyfin');
  assert.match(await transcodeStreamUrl(SERVER, 'tok', '42', {}), /\/Videos\/42\//);
});
