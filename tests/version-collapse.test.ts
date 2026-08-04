// Quality-version handling (4K/1080p): buildItemVersions turns a merged
// item's MediaSources into picker choices, and collapseDuplicateVersions
// folds duplicate same-film entries into one shelf box.
//
//   npm run test:versions
//
// Runs under plain `node --test` with type stripping — no test framework.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie } from '../src/jellyfin.ts';
import { buildItemVersions, collapseDuplicateVersions } from '../src/jellyfin.ts';

function mk(title: string, extra: Partial<Movie> = {}): Movie {
  return {
    id: `id-${title}`,
    title,
    year: 1999,
    duration: '1h 40m',
    rating: 'PG-13',
    overview: '',
    director: '',
    actors: [],
    genres: [],
    localPath: `/movies/${title}.mkv`,
    ...extra,
  };
}

function src(id: string, w: number, h: number, size = 0, name = ''): any {
  return {
    Id: id,
    Name: name,
    Size: size,
    Path: `/movies/${id}.mkv`,
    Container: 'mkv',
    MediaStreams: [
      { Type: 'Video', Codec: 'hevc', Width: w, Height: h },
      { Type: 'Audio', Codec: 'eac3', Index: 1 },
    ],
  };
}

test('merged item: one version per MediaSource, MediaSourceId only when multi-source', () => {
  const item = {
    Id: 'item1',
    Path: '/movies/heat-4k.mkv',
    MediaSources: [src('src-4k', 3840, 2160, 54 * 1024 ** 3), src('src-hd', 1920, 1036, 8 * 1024 ** 3)],
  };
  const versions = buildItemVersions(item);
  assert.equal(versions.length, 2);
  assert.equal(versions[0].itemId, 'item1');
  assert.equal(versions[0].mediaSourceId, 'src-4k');
  assert.equal(versions[0].is4k, true);
  assert.match(versions[0].label, /4K/);
  assert.equal(versions[1].mediaSourceId, 'src-hd');
  assert.equal(versions[1].is4k, false);
  assert.match(versions[1].label, /1080p/);
  // per-source stream/codec info rides along for the player
  assert.equal(versions[1].mediaPlaybackInfo?.videoCodec, 'hevc');
  assert.equal(versions[1].mediaStreams?.length, 1); // the audio track

  const single = buildItemVersions({ Id: 'item2', Path: '/m/x.mkv', MediaSources: [src('only', 1920, 800)] });
  assert.equal(single.length, 1);
  assert.equal(single[0].mediaSourceId, undefined); // single source streams by item id
  assert.match(single[0].label, /1080p/); // scope AR: width decides the bucket
});

test('duplicate 4K/1080p items collapse to one shelf box, best-first, 4K badge', () => {
  const hd = mk('Heat', { versions: buildItemVersions({ Id: 'hd', Path: '/m/heat.mkv', MediaSources: [src('hd-src', 1920, 1080)] }) });
  const uhd = mk('Heat (4K)', {
    id: 'uhd',
    is4k: true,
    versions: buildItemVersions({ Id: 'uhd', Path: '/m/heat-2160p.mkv', MediaSources: [src('uhd-src', 3840, 2160)] }),
  });
  const other = mk('Casino', { versions: buildItemVersions({ Id: 'c', Path: '/m/casino.mkv', MediaSources: [src('c-src', 1920, 1080)] }) });

  const out = collapseDuplicateVersions([hd, uhd, other], 'test');
  assert.equal(out.length, 2); // Heat collapsed, Casino untouched
  const heat = out.find((m) => m.title === 'Heat')!;
  assert.ok(heat, 'first-seen entry keeps the shelf spot');
  assert.equal(heat.versions?.length, 2);
  assert.equal(heat.versions![0].itemId, 'uhd'); // 4K sorts first
  assert.equal(heat.versions![1].itemId, 'hd');
  assert.equal(heat.is4k, true); // box advertises best quality
  const casino = out.find((m) => m.title === 'Casino')!;
  assert.equal(casino.versions, undefined); // single version -> no picker
});

test('same title different year, and series/games, never collapse', () => {
  const a = mk('It', { year: 1990, versions: buildItemVersions({ Id: 'a', MediaSources: [src('a1', 1920, 1080)] }) });
  const b = mk('It', { id: 'b', year: 2017, versions: buildItemVersions({ Id: 'b', MediaSources: [src('b1', 3840, 2160)] }) });
  const s1 = mk('Twin Peaks', { isSeries: true });
  const s2 = mk('Twin Peaks (4K)', { id: 's2', isSeries: true });
  const out = collapseDuplicateVersions([a, b, s1, s2], 'test');
  assert.equal(out.length, 4);
  assert.ok(out.every((m) => m.versions === undefined));
});
