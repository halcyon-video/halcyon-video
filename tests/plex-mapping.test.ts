// Plex → domain-model mapping. The fixtures below are trimmed from real
// responses of a Plex Media Server 1.41.5, because the shapes that matter here
// are exactly the ones documentation gets wrong: which rating is on which
// scale, where HDR is signalled, and the difference between a Stream's `id`
// (what track selection uses) and its `index` (the ffmpeg one, which silently
// selects the wrong track).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// plex.ts reaches for localStorage to keep its client identifier stable.
(globalThis as any).localStorage ??= {
  _s: new Map<string, string>(),
  getItem(k: string) { return this._s.get(k) ?? null; },
  setItem(k: string, v: string) { this._s.set(k, v); },
  removeItem(k: string) { this._s.delete(k); },
};

const { toMovie, toEpisode } = await import('../src/plex.ts');

const BASE = 'http://plex.local:32400';
const TOKEN = 'tok';

/** Trimmed from /library/metadata/11373 — Dr. No, in a hand-made collection. */
const DR_NO = {
  ratingKey: '11373',
  type: 'movie',
  title: 'Agent 007 med rätt att döda',
  originalTitle: 'Dr. No',
  studio: 'EON Productions',
  contentRating: 'PG',
  summary: 'James Bond möter Dr. No.',
  rating: 9.5,          // critic, 0-10
  audienceRating: 8.2,  // viewers, 0-10
  year: 1962,
  originallyAvailableAt: '1962-10-10',
  thumb: '/library/metadata/11373/thumb/1784580524',
  art: '/library/metadata/11373/art/1784580524',
  duration: 6590416,    // ms
  addedAt: 1784578406,  // epoch SECONDS
  viewCount: 2,
  lastViewedAt: 1784600000,
  Guid: [{ id: 'imdb://tt0055928' }, { id: 'tmdb://646' }, { id: 'tvdb://450' }],
  Genre: [{ tag: 'Action' }, { tag: 'Adventure' }],
  Collection: [{ tag: 'James Bond' }],
  Director: [{ tag: 'Terence Young' }],
  Role: [
    { id: 578, tag: 'Sean Connery', role: 'James Bond', thumb: 'https://metadata-static.plex.tv/a.jpg' },
    { id: 71571, tag: 'Ursula Andress', role: 'Honey Ryder' },
  ],
  Media: [{
    id: 14108, duration: 6590416, width: 1808, height: 1080, aspectRatio: 1.66,
    audioCodec: 'dca', videoCodec: 'h264', videoResolution: '1080', container: 'mkv',
    Part: [{
      id: 14108, key: '/library/parts/14108/1784471753/file.mkv',
      file: '/volume1/Movies/Dr. No (1962)/dr.no.mkv', size: 5399241794, container: 'mkv',
      Stream: [
        { id: 3, streamType: 1, codec: 'h264', index: 0, width: 1808, height: 1080 },
        { id: 4, streamType: 2, codec: 'dca', index: 1, channels: 6, language: 'English',
          displayTitle: 'English (DTS 5.1)', default: true },
        { id: 5, streamType: 3, codec: 'srt', index: 2, language: 'Svenska', displayTitle: 'Svenska' },
      ],
    }],
  }],
};

test('maps the core shelf fields off a section item', () => {
  const m = toMovie(DR_NO, BASE, TOKEN, 'Filmer');
  assert.equal(m.id, '11373');
  assert.equal(m.title, 'Agent 007 med rätt att döda');
  assert.equal(m.year, 1962);
  assert.equal(m.premiereDate, '1962-10-10');
  assert.equal(m.duration, '110m');
  assert.equal(m.rating, 'PG');
  assert.equal(m.director, 'Terence Young');
  assert.deepEqual(m.genres, ['Action', 'Adventure']);
  assert.equal(m.libraryName, 'Filmer');
  assert.deepEqual(m.studios, ['EON Productions']);
  assert.equal(m.collectionName, 'James Bond');
  assert.equal(m.tmdbId, 646);
  assert.equal(m.isSeries, false);
  assert.equal(m.localPath, '/volume1/Movies/Dr. No (1962)/dr.no.mkv');
});

test('keeps the two rating scales apart', () => {
  const m = toMovie(DR_NO, BASE, TOKEN, 'Filmer');
  // audienceRating is already the model's 0-10 star scale...
  assert.equal(m.communityRating, 8.2);
  // ...while criticRating is a 0-100 percentage, so the 0-10 critic score x10.
  assert.equal(m.criticRating, 95);
});

test('converts Plex milliseconds to the store ticks', () => {
  const m = toMovie(DR_NO, BASE, TOKEN, 'Filmer');
  assert.equal(m.runTimeTicks, 6590416 * 10_000);
});

test('converts epoch seconds to ISO for the New Releases wall', () => {
  const m = toMovie(DR_NO, BASE, TOKEN, 'Filmer');
  assert.equal(m.dateCreated, new Date(1784578406 * 1000).toISOString());
  assert.equal(m.played, true);
  assert.equal(m.playCount, 2);
  assert.equal(m.lastPlayedDate, new Date(1784600000 * 1000).toISOString());
});

test('carries audio/subtitle tracks keyed on the Plex stream id, not its ffmpeg index', () => {
  const m = toMovie(DR_NO, BASE, TOKEN, 'Filmer');
  const audio = m.mediaStreams!.filter((s) => s.type === 'Audio');
  const subs = m.mediaStreams!.filter((s) => s.type === 'Subtitle');
  assert.equal(audio.length, 1);
  assert.equal(subs.length, 1);
  // Stream.id === 4, Stream.index === 1. Selecting on the index picks the
  // wrong track, so the model must carry the id.
  assert.equal(audio[0].index, 4);
  assert.equal(audio[0].channels, 6);
  assert.equal(audio[0].isDefault, true);
  assert.equal(subs[0].index, 5);
  assert.equal(subs[0].language, 'Svenska');
  // The video stream is not a selectable track.
  assert.ok(!m.mediaStreams!.some((s) => s.index === 3));
});

test('routes posters through the photo transcoder rather than the raw image', () => {
  const m = toMovie(DR_NO, BASE, TOKEN, 'Filmer');
  assert.match(m.posterUrl!, /\/photo\/:\/transcode\?/);
  assert.match(m.posterUrl!, /width=400&height=600/);
  assert.match(m.posterUrl!, /X-Plex-Token=tok/);
  assert.ok(m.posterUrl!.includes(encodeURIComponent('/library/metadata/11373/thumb/1784580524')));
});

test('takes cast portraits verbatim and drops the ones with none', () => {
  const m = toMovie(DR_NO, BASE, TOKEN, 'Filmer');
  assert.deepEqual(m.actors, ['Sean Connery', 'Ursula Andress']);
  assert.equal(m.castPeople![0].imageUrl, 'https://metadata-static.plex.tv/a.jpg');
  assert.equal(m.castPeople![1].imageUrl, undefined);
});

test('reports a container only once the part id is known, so a miss falls back to HLS', () => {
  // A fresh item whose part carries no id: direct play cannot be addressed, so
  // withholding the container is what makes isDirectPlaySafe refuse it.
  const noPart = {
    ...DR_NO, ratingKey: '999',
    Media: [{ ...DR_NO.Media[0], Part: [{ ...DR_NO.Media[0].Part[0], id: undefined }] }],
  };
  const m = toMovie(noPart, BASE, TOKEN, 'Filmer');
  assert.equal(m.mediaPlaybackInfo!.container, undefined);
  // The codec is still reported — it only drives the transcode hint.
  assert.equal(m.mediaPlaybackInfo!.videoCodec, 'h264');

  // With a part id present the container comes through.
  const ok = toMovie(DR_NO, BASE, TOKEN, 'Filmer');
  assert.equal(ok.mediaPlaybackInfo!.container, 'mkv');
  assert.equal(ok.mediaPlaybackInfo!.aspectRatio, '1.66:1');
});

test('flags Dolby Vision and HDR10 off the video stream, not the codec', () => {
  const dovi = {
    ...DR_NO, ratingKey: '2001',
    Media: [{ ...DR_NO.Media[0], videoResolution: '4k', width: 3840, height: 2076, videoCodec: 'hevc',
      Part: [{ ...DR_NO.Media[0].Part[0], id: 2073,
        Stream: [{ id: 1, streamType: 1, codec: 'hevc', bitDepth: 10, colorTrc: 'bt709', DOVIPresent: true }] }] }],
  };
  assert.equal(toMovie(dovi, BASE, TOKEN, 'F').mediaPlaybackInfo!.videoRange, 'DOVI');

  const hdr10 = structuredClone(dovi);
  (hdr10 as any).Media[0].Part[0].Stream[0] = { id: 1, streamType: 1, codec: 'hevc', colorTrc: 'smpte2084' };
  assert.equal(toMovie(hdr10, BASE, TOKEN, 'F').mediaPlaybackInfo!.videoRange, 'HDR10');

  // A plain 10-bit encode with no transfer function declared is NOT HDR —
  // badging it would put an HDR sticker on ordinary anime rips.
  const plain10 = structuredClone(dovi);
  (plain10 as any).Media[0].Part[0].Stream[0] = { id: 1, streamType: 1, codec: 'hevc', bitDepth: 10 };
  assert.equal(toMovie(plain10, BASE, TOKEN, 'F').mediaPlaybackInfo!.videoRange, 'SDR');
});

test("takes Plex's own 4K bucket, and the frame size when it disagrees", () => {
  const tagged = { ...DR_NO, ratingKey: '3001', Media: [{ ...DR_NO.Media[0], videoResolution: '4k' }] };
  assert.equal(toMovie(tagged, BASE, TOKEN, 'F').is4k, true);
  // Untagged but plainly 4K by frame size.
  const bySize = { ...DR_NO, ratingKey: '3002',
    Media: [{ ...DR_NO.Media[0], videoResolution: '', width: 3840, height: 2160 }] };
  assert.equal(toMovie(bySize, BASE, TOKEN, 'F').is4k, true);
  assert.equal(toMovie(DR_NO, BASE, TOKEN, 'F').is4k, false);
});

test('turns several Media entries into version choices, addressed by position', () => {
  const twin = {
    ...DR_NO, ratingKey: '4001',
    Media: [
      { ...DR_NO.Media[0], videoResolution: '4k', width: 3840, height: 2160, videoCodec: 'hevc',
        Part: [{ id: 900, file: '/m/a-4k.mkv', size: 54_000_000_000, Stream: [] }] },
      { ...DR_NO.Media[0], Part: [{ id: 901, file: '/m/a-1080.mkv', size: 8_000_000_000, Stream: [] }] },
    ],
  };
  const m = toMovie(twin, BASE, TOKEN, 'F');
  assert.equal(m.versions!.length, 2);
  // The transcoder addresses an edition by its POSITION in Media[].
  assert.deepEqual(m.versions!.map((v) => v.mediaSourceId), ['0', '1']);
  assert.equal(m.versions![0].is4k, true);
  assert.match(m.versions![0].label, /4K/);
  assert.match(m.versions![0].label, /HEVC/);
  assert.match(m.versions![0].label, /50\.3 GB/);
  assert.equal(m.versions![1].localPath, '/m/a-1080.mkv');
});

test('disambiguates two versions that would otherwise read identically', () => {
  const dupe = {
    ...DR_NO, ratingKey: '4002',
    Media: [
      { ...DR_NO.Media[0], Part: [{ id: 910, file: '/m/freelance.remux.mkv', size: 1_500_000_000, Stream: [] }] },
      { ...DR_NO.Media[0], Part: [{ id: 911, file: '/m/freelance.webdl.mkv', size: 1_500_000_000, Stream: [] }] },
    ],
  };
  const labels = toMovie(dupe, BASE, TOKEN, 'F').versions!.map((v) => v.label);
  assert.notEqual(labels[0], labels[1]);
  assert.match(labels[0], /freelance\.remux\.mkv/);
  assert.match(labels[1], /freelance\.webdl\.mkv/);
});

test('a series is a container: no versions, no streams, no runtime', () => {
  const show = {
    ratingKey: '11104', type: 'show', title: '100 höjdare', year: 2004,
    summary: '', thumb: '/library/metadata/11104/thumb/1', duration: 1448472,
    childCount: 2, leafCount: 19, Genre: [{ tag: 'Comedy' }], Role: [],
  };
  const m = toMovie(show, BASE, TOKEN, 'TV-serier');
  assert.equal(m.isSeries, true);
  assert.equal(m.duration, 'Series');
  assert.equal(m.versions, undefined);
  assert.equal(m.mediaStreams, undefined);
  assert.equal(m.mediaPlaybackInfo, undefined);
  assert.equal(m.runTimeTicks, undefined);
  assert.equal(m.is4k, false);
});

test('maps an episode with its season/series references', () => {
  const ep = {
    ratingKey: '11106', type: 'episode', title: 'Sveriges roligaste ögonblick 100-89',
    summary: 'Nedräkningen börjar.', index: 1, parentIndex: 1,
    grandparentRatingKey: 11104, grandparentTitle: '100 höjdare',
    parentRatingKey: 11105, parentThumb: '/library/metadata/11105/thumb/2',
    thumb: '/library/metadata/11106/thumb/3', duration: 1448472, viewOffset: 60000,
    Media: [{ id: 1, Part: [{ id: 77, file: '/tv/s01e01.avi', Stream: [] }] }],
  };
  const e = toEpisode(ep, BASE, TOKEN);
  assert.equal(e.id, '11106');
  assert.equal(e.seriesId, '11104');
  assert.equal(e.seriesName, '100 höjdare');
  assert.equal(e.seasonNumber, 1);
  assert.equal(e.episodeNumber, 1);
  assert.equal(e.path, '/tv/s01e01.avi');
  assert.equal(e.runTimeTicks, 1448472 * 10_000);
  assert.equal(e.resumePositionTicks, 60000 * 10_000);
  assert.equal(e.seasonId, '11105');
  assert.ok(e.thumbUrl!.includes('photo/:/transcode'));
  assert.ok(e.seasonPrimaryUrl!.includes(encodeURIComponent('/library/metadata/11105/thumb/2')));
});

test('an unwatched title reports no resume position', () => {
  const fresh = { ...DR_NO, ratingKey: '5001', viewCount: undefined, lastViewedAt: undefined };
  const m = toMovie(fresh, BASE, TOKEN, 'F');
  assert.equal(m.played, false);
  assert.equal(m.playCount, undefined);
  assert.equal(m.resumePositionTicks, undefined);
  assert.equal(m.lastPlayedDate, undefined);
});
