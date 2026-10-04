import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectNetflixTitleIds } from '../tools/refresh-netflix-title-ids.mjs';
import ids from '../src/data/netflix-title-ids.json' with { type: 'json' };
import snapshot from '../src/data/streaming-snapshot.json' with { type: 'json' };
import { DEFAULT_STREAMING_SERVICES, buildStreamingUrl } from '../src/streaming-catalog.ts';

const binding = (tmdb: string, netflix: string, item = 'Q1') => ({
  tmdb: { value: tmdb }, netflix: { value: netflix },
  item: { value: 'http://www.wikidata.org/entity/' + item },
});

test('provider identity refresh rejects ambiguous, malformed and unrelated mappings', () => {
  const result = collectNetflixTitleIds([
    binding('1', '81278442'), binding('1', '81278442'),
    binding('2', '81002747'), binding('2', '81278442'),
    binding('3', '81002747', 'Q3'), binding('3', '81002747', 'Q4'),
    binding('4', 'not-a-provider-id'), binding('999', '81278442'),
  ], [1, 2, 3, 4]);
  assert.deepEqual(result, { movies: { '1': '81278442' }, wikidata: { '1': 'Q1' } });
});

test('bundled Netflix identifiers have auditable movie identities', () => {
  const movieIds = new Set(snapshot.services.find(service => service.id === 'netflix')!.titles.map(title => String(title.tmdbId)));
  assert.ok(Object.keys(ids.movies).length > 0);
  for (const [tmdb, netflix] of Object.entries(ids.movies)) {
    assert.ok(movieIds.has(tmdb), tmdb);
    assert.match(netflix, /^[1-9]\d{5,7}$/);
    assert.match((ids.wikidata as Record<string, string>)[tmdb], /^Q[1-9]\d*$/);
  }
});

test('every bundled Netflix movie has a title-specific destination without a title-search fallback', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find(service => service.id === 'netflix')!;
  for (const title of snapshot.services.find(service => service.id === 'netflix')!.titles) {
    const url = new URL(buildStreamingUrl(netflix, title.title, title.tmdbId));
    if (url.hostname === 'www.netflix.com') {
      assert.match(url.pathname, /^\/title\/[1-9]\d{5,7}$/);
      assert.equal(url.search, '');
    } else {
      assert.equal(url.hostname, 'www.themoviedb.org');
      assert.equal(url.pathname, '/movie/' + title.tmdbId + '/watch');
      assert.equal(url.searchParams.get('locale'), 'US');
    }
  }
});
