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
  currentTranscodeSessionId,
  stopTranscodeSession,
  transcodeStreamUrl,
  transcodeStreamUrlSync,
  playbackIsDirectSafe,
  subtitleTrackUrl,
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
  assert.match(subtitleTrackUrl(SERVER, 'tok', '42', 2)!, /\/Videos\/42\/42\/Subtitles\/2\/0\/Stream\.vtt/);
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

  // Plex does not serve Jellyfin /Videos/.../Subtitles endpoints (GH #300).
  assert.equal(subtitleTrackUrl(SERVER, 'tok', '42', 2), undefined);
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
  assert.equal(subtitleTrackUrl(SERVER, 'tok', '42', 2, undefined, 'plex'), undefined);

  useBackend('plex'); // and the mirror image: primary Plex, this title Jellyfin
  assert.match(await transcodeStreamUrl(SERVER, 'tok', '42', {}, 'jellyfin'), /\/Videos\/42\//);
  assert.match(transcodeStreamUrlSync(SERVER, 'tok', '42', {}, 'jellyfin'), /\/Videos\/42\//);
  assert.match(directStreamUrl(SERVER, 'tok', '42', undefined, 'jellyfin'), /\/Videos\/42\//);
  assert.match(subtitleTrackUrl(SERVER, 'tok', '42', 2, undefined, 'jellyfin')!, /\/Videos\/42\//);
  assert.equal(playbackIsDirectSafe(MP4, 'jellyfin'), true);
});

test('omitting the kind still falls back to the install-wide backend', async () => {
  // Single-backend stores pass nothing and must behave exactly as before.
  useBackend('plex');
  assert.doesNotMatch(await transcodeStreamUrl(SERVER, 'tok', '42', {}), /\/Videos\//);
  assert.equal(subtitleTrackUrl(SERVER, 'tok', '42', 2), undefined);
  useBackend('jellyfin');
  assert.match(await transcodeStreamUrl(SERVER, 'tok', '42', {}), /\/Videos\/42\//);
  assert.match(subtitleTrackUrl(SERVER, 'tok', '42', 2)!, /\/Videos\/42\//);
});


test('Emby playback follows the title source even when the primary server differs', async () => {
  useBackend('plex');
  const direct = new URL(directStreamUrl('http://emby.local/base', 'emby-token', 'film', 'source', 'emby'));
  assert.equal(direct.pathname, '/base/Videos/film/stream');
  assert.equal(direct.searchParams.get('api_key'), 'emby-token');
  assert.equal(direct.searchParams.get('MediaSourceId'), 'source');
  const hls = new URL(transcodeStreamUrlSync('http://emby.local/base/emby', 'emby-token', 'film', { mediaSourceId: 'source', startPositionTicks: 600000000 }, 'emby'));
  assert.equal(hls.pathname, '/base/emby/Videos/film/master.m3u8');
  assert.equal(hls.searchParams.get('MediaSourceId'), 'source');
  assert.equal(hls.searchParams.get('StartTimeTicks'), '600000000');
  const sub = new URL(subtitleTrackUrl('http://emby.local/base/emby', 'emby-token', 'film', 2, 'source', 'emby')!);
  assert.equal(sub.pathname, '/base/emby/Videos/film/source/Subtitles/2/0/Stream.vtt');
  assert.equal(sub.searchParams.get('api_key'), 'emby-token');
  useBackend('emby');
  assert.equal(new URL(directStreamUrl('http://jellyfin.local', 'jf-token', 'film', undefined, 'jellyfin')).pathname, '/Videos/film/stream');
  assert.match(subtitleTrackUrl('http://jellyfin.local', 'jf-token', 'film', 2, undefined, 'jellyfin')!, /\/Videos\/film\/film\/Subtitles\/2\/0\/Stream\.vtt/);
});


test('transcode teardown retains the playing stream when another source builds an HLS URL', () => {
  const playing = transcodeStreamUrlSync('http://emby.local', 'tok', '1', {mediaSourceId: 'a'}, 'emby');
  const other = transcodeStreamUrlSync('http://other.local', 'other', '1', {mediaSourceId: 'b'}, 'emby');
  assert.notEqual(currentTranscodeSessionId('emby', playing), currentTranscodeSessionId('emby', other));
  assert.equal(currentTranscodeSessionId('emby', playing), new URL(playing).searchParams.get('PlaySessionId'));
  assert.equal(currentTranscodeSessionId('emby', 'http://emby.local/emby/Videos/1/stream'), undefined);
});

test('Plex transcode session ID is extracted from the session parameter', async () => {
  const hls = await transcodeStreamUrl(SERVER, 'tok', '42', {}, 'plex');
  const sessionId = currentTranscodeSessionId('plex', hls);
  assert.ok(sessionId);
  assert.match(sessionId, /^halcyon-/);
  assert.equal(sessionId, new URL(hls).searchParams.get('session'));
  assert.equal(currentTranscodeSessionId('plex', 'http://plex.local:32400/library/parts/1/file.mkv'), undefined);
  assert.equal(currentTranscodeSessionId('plex', ''), undefined);
  assert.equal(currentTranscodeSessionId('plex', undefined), undefined);

  // Falls back to install-wide backend if kind is omitted
  useBackend('plex');
  assert.equal(currentTranscodeSessionId(undefined, hls), sessionId);
});

test('stopTranscodeSession invokes stop endpoint on Plex server', async (t) => {
  const calls: Array<[string, any]> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, opts: any) => {
    calls.push([url, opts]);
    return new Response('ok', { status: 200 });
  });

  const logs: string[] = [];
  await stopTranscodeSession('halcyon-session-123', (m) => logs.push(m), {
    url: 'http://plex.local:32400',
    token: 'plex-token',
    kind: 'plex',
  });

  assert.equal(calls.length, 1);
  const [calledUrl, calledOpts] = calls[0];
  const urlObj = new URL(calledUrl);
  assert.equal(urlObj.pathname, '/video/:/transcode/universal/stop');
  assert.equal(urlObj.searchParams.get('session'), 'halcyon-session-123');
  assert.equal(urlObj.searchParams.get('X-Plex-Token'), 'plex-token');
  assert.equal(calledOpts.headers['X-Plex-Token'], 'plex-token');
  assert.equal(logs.length, 0);
});

test('stopTranscodeSession is a no-op when server is null', async (t) => {
  let called = false;
  t.mock.method(globalThis, 'fetch', async () => {
    called = true;
    return new Response('ok', { status: 200 });
  });
  await stopTranscodeSession('halcyon-session-123', () => {}, null);
  assert.equal(called, false);
});

test('stopTranscodeSession reports error via log callback on Plex failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Plex unreachable');
  });

  const logs: string[] = [];
  await stopTranscodeSession('halcyon-session-123', (m) => logs.push(m), {
    url: 'http://plex.local:32400',
    token: 'plex-token',
    kind: 'plex',
  });

  assert.ok(logs.some((msg) => msg.includes('[Player] stopPlexTranscode failed: Plex unreachable')));
});

