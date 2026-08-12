// How a chosen subtitle reaches the screen — the decision that determines
// whether the server re-encodes the whole film or serves a text file.
//
// Asking Jellyfin to burn subtitles in (SubtitleMethod=Encode) forces a full
// video re-encode, so on the browser/Remote Play path merely defaulting
// captions ON used to turn every direct-playable file into a transcode. Text
// subtitles are now fetched as a WebVTT sidecar and drawn by the browser
// instead; only bitmap formats, which have no client renderer, still pay the
// old price. Getting the classification wrong is expensive in one direction
// (a needless re-encode of the entire runtime) and invisible in the other
// (captions that silently never appear), so it's pinned here.
//
//   npm run test:subs (or: node --experimental-strip-types --test tests/subtitle-delivery.test.ts)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MediaStreamInfo } from '../src/jellyfin.ts';
import {
  isTextSubtitleCodec,
  pickSubtitleDelivery,
  buildSubtitleTrackUrl,
} from '../src/jellyfin.ts';

const sub = (index: number, codec: string): MediaStreamInfo =>
  ({ index, type: 'Subtitle', codec });

const STREAMS: MediaStreamInfo[] = [
  { index: 1, type: 'Audio', codec: 'eac3' },
  sub(2, 'subrip'),
  sub(3, 'ass'),
  sub(4, 'pgssub'),
  sub(5, 'dvd_subtitle'),
  sub(6, 'mov_text'),
];

test('text subtitle codecs are recognised in every spelling Jellyfin reports', () => {
  for (const c of ['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'vtt', 'text']) {
    assert.equal(isTextSubtitleCodec(c), true, `${c} should be text`);
  }
  // ffmpeg's casing is not guaranteed.
  assert.equal(isTextSubtitleCodec('SubRip'), true);
  assert.equal(isTextSubtitleCodec('ASS'), true);
});

test('bitmap subtitle codecs are not text — they have no client renderer', () => {
  for (const c of ['pgssub', 'dvd_subtitle', 'dvbsub', 'xsub', 'hdmv_pgs_subtitle']) {
    assert.equal(isTextSubtitleCodec(c), false, `${c} should be bitmap`);
  }
  assert.equal(isTextSubtitleCodec(undefined), false);
  assert.equal(isTextSubtitleCodec(''), false);
});

test('no subtitle selected asks for no delivery at all', () => {
  assert.deepEqual(pickSubtitleDelivery(STREAMS, undefined), { kind: 'none' });
});

test('a text track is delivered as a sidecar, never burned in', () => {
  assert.deepEqual(pickSubtitleDelivery(STREAMS, 2), { kind: 'text', streamIndex: 2 });
  assert.deepEqual(pickSubtitleDelivery(STREAMS, 3), { kind: 'text', streamIndex: 3 });
  assert.deepEqual(pickSubtitleDelivery(STREAMS, 6), { kind: 'text', streamIndex: 6 });
});

test('a bitmap track still has to be burned in', () => {
  assert.deepEqual(pickSubtitleDelivery(STREAMS, 4), { kind: 'burn-in', streamIndex: 4 });
  assert.deepEqual(pickSubtitleDelivery(STREAMS, 5), { kind: 'burn-in', streamIndex: 5 });
});

test('an unknown stream falls back to the CHEAP path, not the expensive one', () => {
  // A server that reports no codec, or an index we never saw, must not cost
  // the viewer a full re-encode on a guess: a sidecar that 404s loses only
  // the captions, and the film keeps playing.
  assert.deepEqual(pickSubtitleDelivery(STREAMS, 99), { kind: 'text', streamIndex: 99 });
  assert.deepEqual(pickSubtitleDelivery(undefined, 2), { kind: 'text', streamIndex: 2 });
  assert.deepEqual(
    pickSubtitleDelivery([{ index: 7, type: 'Subtitle' }], 7),
    { kind: 'text', streamIndex: 7 },
  );
});

test('an audio stream sharing a subtitle index is not mistaken for one', () => {
  // Jellyfin indices are per-file, not per-type: index 1 here is AUDIO. Asking
  // for subtitle index 1 must not classify off the audio codec.
  assert.deepEqual(pickSubtitleDelivery(STREAMS, 1), { kind: 'text', streamIndex: 1 });
});

test('the sidecar URL points at the VTT converter for the right source', () => {
  const url = buildSubtitleTrackUrl('http://jf:8096', 'tok en', 'item-1', 3, 'src-9');
  assert.equal(
    url,
    'http://jf:8096/Videos/item-1/src-9/Subtitles/3/0/Stream.vtt?api_key=tok%20en',
  );
});

test('the sidecar URL falls back to the item as its own media source', () => {
  const url = buildSubtitleTrackUrl('http://jf:8096', 't', 'item-1', 2);
  assert.equal(url, 'http://jf:8096/Videos/item-1/item-1/Subtitles/2/0/Stream.vtt?api_key=t');
});

test('a trailing slash on the server address does not double up', () => {
  const url = buildSubtitleTrackUrl('http://jf:8096/', 't', 'i', 0);
  assert.equal(url.startsWith('http://jf:8096/Videos/'), true, url);
});
