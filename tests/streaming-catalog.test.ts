// Streaming-service sections (GH #86): the selection/synthesis logic behind
// the "WATCH ON <SERVICE>" aisles (main.ts's fetchStreamingMovies plumbing
// stays untested here — like jellyseerr.ts's own network functions, it needs
// a live server; see streaming-catalog.ts's header comment for why this file
// is import-light on purpose).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STREAMING_SERVICES,
  resolveEnabledServices,
  matchProviderId,
  buildStreamingUrl,
  tmdbWatchFallbackUrl,
  synthesizeStreamingMovie,
  ingestStreamingResults,
  buildStreamingLibraries,
} from '../src/streaming-catalog.ts';

test('the default eight services have unique, non-blank ids and names', () => {
  assert.equal(DEFAULT_STREAMING_SERVICES.length, 8);
  const ids = DEFAULT_STREAMING_SERVICES.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const d of DEFAULT_STREAMING_SERVICES) {
    assert.ok(d.id.trim().length > 0);
    assert.ok(d.name.trim().length > 0);
    assert.ok(d.aliases.length > 0);
  }
});

test('resolveEnabledServices: blank/undefined/whitespace-only keeps the default eight', () => {
  assert.equal(resolveEnabledServices(undefined), DEFAULT_STREAMING_SERVICES);
  assert.equal(resolveEnabledServices(null), DEFAULT_STREAMING_SERVICES);
  assert.equal(resolveEnabledServices(''), DEFAULT_STREAMING_SERVICES);
  assert.equal(resolveEnabledServices('   , , '), DEFAULT_STREAMING_SERVICES);
});

test('resolveEnabledServices: matches defaults by id or alias, case-insensitively', () => {
  const svcs = resolveEnabledServices('netflix, Hulu');
  assert.equal(svcs.length, 2);
  assert.equal(svcs[0].id, 'netflix');
  assert.equal(svcs[1].id, 'hulu');

  const byAlias = resolveEnabledServices('HBO Max');
  assert.equal(byAlias.length, 1);
  assert.equal(byAlias[0].id, 'max');
});

test('resolveEnabledServices: a name outside the default eight becomes a template-less custom def', () => {
  const svcs = resolveEnabledServices('Shudder');
  assert.equal(svcs.length, 1);
  assert.equal(svcs[0].id, 'shudder');
  assert.equal(svcs[0].name, 'SHUDDER');
  assert.deepEqual(svcs[0].aliases, ['Shudder']);
  assert.equal(svcs[0].urlTemplate, undefined);
});

test('matchProviderId: exact case-insensitive alias match, and null when absent', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  assert.equal(
    matchProviderId(netflix, [{ id: 8, name: 'netflix' }, { id: 9, name: 'Amazon Video' }]),
    8
  );
  assert.equal(matchProviderId(netflix, [{ id: 9, name: 'Amazon Video' }]), null);

  // A substring must NOT match -- "Apple TV" (transactional rent/buy) is a
  // real, DIFFERENT TMDB provider from "Apple TV Plus" (the subscription).
  const appletv = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'appletv')!;
  assert.equal(matchProviderId(appletv, [{ id: 2, name: 'Apple TV' }]), null);
  assert.equal(matchProviderId(appletv, [{ id: 350, name: 'Apple TV Plus' }]), 350);
});

test('buildStreamingUrl: a service with a template uses it; one without falls back to the TMDB watch page', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  const url = buildStreamingUrl(netflix, 'The Matrix', 603);
  assert.equal(url, 'https://www.netflix.com/search?q=The%20Matrix');

  const max = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'max')!;
  assert.equal(buildStreamingUrl(max, 'X', 42), tmdbWatchFallbackUrl(42));
});

test('synthesizeStreamingMovie: maps a raw discover item to a shelvable streaming Movie', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  const movie = synthesizeStreamingMovie({
    id: 603,
    title: 'The Matrix',
    releaseDate: '1999-03-31',
    posterPath: '/poster.jpg',
    overview: 'A hacker discovers reality is a simulation.',
    voteAverage: 8.7,
    genreIds: [28, 878, 99999], // 99999 = unknown id, dropped rather than guessed
  }, netflix);
  assert.ok(movie);
  assert.equal(movie!.id, 'streaming_netflix_603');
  assert.equal(movie!.title, 'The Matrix');
  assert.equal(movie!.year, 1999);
  assert.equal(movie!.streaming, true);
  assert.equal(movie!.streamingServiceId, 'netflix');
  assert.equal(movie!.streamingServiceName, 'NETFLIX');
  assert.equal(movie!.streamingUrl, 'https://www.netflix.com/search?q=The%20Matrix');
  assert.equal(movie!.posterUrl, 'https://image.tmdb.org/t/p/w342/poster.jpg');
  assert.equal(movie!.communityRating, 8.7);
  assert.deepEqual(movie!.genres, ['Action', 'Science Fiction']);
  assert.equal(movie!.localPath, '');
});

test('synthesizeStreamingMovie: a malformed item (no id/title) is dropped, not thrown', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  assert.equal(synthesizeStreamingMovie({ title: 'No id' }, netflix), null);
  assert.equal(synthesizeStreamingMovie({ id: 1 }, netflix), null);
});

test('ingestStreamingResults: skips owned/requested (mediaInfo), dismissed, duplicate and malformed entries, caps at the limit', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  const items = [
    { id: 1, title: 'Fresh One' },
    { id: 2, title: 'Already owned', mediaInfo: { status: 5 } },
    { id: 3, title: 'Dismissed' },
    { id: 1, title: 'Fresh One (dup)' },
    { title: 'No id' },
    { id: 4, title: 'Fresh Two' },
  ];
  const out = ingestStreamingResults(items, netflix, { dismissed: new Set([3]), cap: 10 });
  assert.deepEqual(out.map((m) => m.tmdbId), [1, 4]);
});

test('ingestStreamingResults: caps at the requested limit', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  const items = Array.from({ length: 30 }, (_, i) => ({ id: i, title: `Title ${i}` }));
  const out = ingestStreamingResults(items, netflix, { cap: 5 });
  assert.equal(out.length, 5);
});

test('buildStreamingLibraries: groups by service, orders per the resolved service list, drops empty services', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  const hulu = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'hulu')!;
  const movies = [
    synthesizeStreamingMovie({ id: 1, title: 'Hulu Title' }, hulu)!,
    synthesizeStreamingMovie({ id: 2, title: 'Netflix Title A' }, netflix)!,
    synthesizeStreamingMovie({ id: 3, title: 'Netflix Title B' }, netflix)!,
  ];
  const libs = buildStreamingLibraries(movies, DEFAULT_STREAMING_SERVICES);
  assert.equal(libs.length, 2);
  // DEFAULT_STREAMING_SERVICES lists netflix before hulu -- the library order
  // must follow that, not insertion order of the movies array.
  assert.equal(libs[0].id, 'streaming:netflix');
  assert.equal(libs[0].name, 'NETFLIX');
  assert.equal(libs[0].movies.length, 2);
  assert.equal(libs[0].streaming, true);
  assert.deepEqual(libs[0].genres, []);
  assert.equal(libs[1].id, 'streaming:hulu');
  assert.equal(libs[1].movies.length, 1);
});

test('buildStreamingLibraries: no movies -> no libraries', () => {
  assert.deepEqual(buildStreamingLibraries([], DEFAULT_STREAMING_SERVICES), []);
});
