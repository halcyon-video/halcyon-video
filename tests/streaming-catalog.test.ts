// Streaming-service sections (GH #86): the selection/synthesis logic behind
// the "WATCH ON <SERVICE>" aisles (main.ts's fetchStreamingMovies plumbing
// stays untested here — like jellyseerr.ts's own network functions, it needs
// a live server; see streaming-catalog.ts's header comment for why this file
// is import-light on purpose).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STREAMING_SERVICES,
  ALL_DEFAULT_STREAMING_SERVICES_CSV,
  resolveEnabledServices,
  resolveStreamingSource,
  matchProviderId,
  buildStreamingUrl,
  tmdbWatchFallbackUrl,
  fallbackToSnapshotOnFailure,
  synthesizeStreamingMovie,
  ingestStreamingResults,
  deduplicateStreamingMovies,
  buildStreamingLibraries,
  resolveStreamingWatchRegion,
  DEFAULT_STREAMING_WATCH_REGION,
} from '../src/streaming-catalog.ts';

test('fallbackToSnapshotOnFailure: falls back to snapshot when network source yields no titles', async () => {
  let fallbackCalled = false;
  const dummySnapshotMovie = synthesizeStreamingMovie({ id: 999, title: 'Snapshot Title' }, DEFAULT_STREAMING_SERVICES[0])!;
  const fallback = async () => {
    fallbackCalled = true;
    return [dummySnapshotMovie];
  };

  // 1. TMDB returns empty -> falls back
  const recovered = await fallbackToSnapshotOnFailure([], 'tmdb', fallback);
  assert.equal(fallbackCalled, true);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].title, 'Snapshot Title');

  // 2. TMDB returns movies -> does NOT fall back
  fallbackCalled = false;
  const netflixMovie = synthesizeStreamingMovie({ id: 1, title: 'Network Title' }, DEFAULT_STREAMING_SERVICES[0])!;
  const retained = await fallbackToSnapshotOnFailure([netflixMovie], 'tmdb', fallback);
  assert.equal(fallbackCalled, false);
  assert.equal(retained.length, 1);
  assert.equal(retained[0].title, 'Network Title');

  // 3. Snapshot source itself returning empty -> does NOT recursively fall back
  fallbackCalled = false;
  const snapEmpty = await fallbackToSnapshotOnFailure([], 'snapshot', fallback);
  assert.equal(fallbackCalled, false);
  assert.deepEqual(snapEmpty, []);
});

test('a snapshot year stays in its calendar year west of UTC', () => {
  const timezone = process.env.TZ;
  process.env.TZ = 'America/Chicago';
  try {
    const movie = synthesizeStreamingMovie({ id: 123, title: 'Calendar boundary', releaseDate: '2026-01-01' }, DEFAULT_STREAMING_SERVICES[0]);
    assert.equal(movie?.year, 2026);
  } finally {
    if (timezone === undefined) delete process.env.TZ;
    else process.env.TZ = timezone;
  }
});

test('resolveStreamingSource: TMDB wins when both are configured; Jellyseerr is the fallback; neither falls back to the bundled snapshot', () => {
  assert.equal(resolveStreamingSource(true, true), 'tmdb');
  assert.equal(resolveStreamingSource(true, false), 'tmdb');
  assert.equal(resolveStreamingSource(false, true), 'jellyseerr');
  assert.equal(resolveStreamingSource(false, false), 'snapshot');
});

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

test('resolveEnabledServices: blank/undefined/whitespace-only means NONE chosen (owner ruling 2026-08-21 -- a fresh local install has no streaming aisles until the opening-day terminal picks some)', () => {
  assert.deepEqual(resolveEnabledServices(undefined), []);
  assert.deepEqual(resolveEnabledServices(null), []);
  assert.deepEqual(resolveEnabledServices(''), []);
  assert.deepEqual(resolveEnabledServices('   , , '), []);
});

test('ALL_DEFAULT_STREAMING_SERVICES_CSV resolves back to the full default eight, in order -- the demo build\'s own setting default', () => {
  assert.deepEqual(resolveEnabledServices(ALL_DEFAULT_STREAMING_SERVICES_CSV), DEFAULT_STREAMING_SERVICES);
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

test('resolveEnabledServices: deduplicates repeated service names and aliases, keeping the first occurrence', () => {
  const svcs = resolveEnabledServices('netflix, Netflix, shudder, Shudder, HBO Max, max');
  assert.equal(svcs.length, 3);
  assert.deepEqual(svcs.map((s) => s.id), ['netflix', 'shudder', 'max']);
});

test('matchProviderId: exact case-insensitive alias match, and null when absent', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  assert.equal(
    matchProviderId(netflix, [{ id: 8, name: 'netflix' }, { id: 9, name: 'Amazon Video' }]),
    8
  );
  assert.equal(matchProviderId(netflix, [{ id: 9, name: 'Amazon Video' }]), null);

  // TMDB renamed both sides of this pair since the aliases were first
  // written (verified live against Jellyseerr 2026-08-21, GH #86 bundled-
  // snapshot follow-up): the subscription is now plain "Apple TV" (id 350)
  // and the transactional rent/buy store picked up "Apple TV Store" (id 2).
  // A substring still must not cross-match the two.
  const appletv = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'appletv')!;
  assert.equal(matchProviderId(appletv, [{ id: 2, name: 'Apple TV Store' }]), null);
  assert.equal(matchProviderId(appletv, [{ id: 350, name: 'Apple TV' }]), 350);
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
    duration: '2h 16m',
    rating: 'R',
    director: 'Lilly Wachowski',
    actors: ['Keanu Reeves', 'Laurence Fishburne'],
    voteAverage: 8.7,
    genreIds: [28, 878, 99999], // 99999 = unknown id, dropped rather than guessed
  }, netflix);
  assert.ok(movie);
  assert.equal(movie!.id, 'streaming_netflix_603');
  assert.equal(movie!.title, 'The Matrix');
  assert.equal(movie!.year, 1999);
  assert.equal(movie!.streaming, true);
  assert.equal(movie!.libraryName, 'Movies');
  assert.equal(movie!.streamingServiceId, 'netflix');
  assert.equal(movie!.streamingServiceName, 'NETFLIX');
  assert.equal(movie!.streamingUrl, 'https://www.netflix.com/search?q=The%20Matrix');
  assert.equal(movie!.posterUrl, 'https://image.tmdb.org/t/p/w342/poster.jpg');
  assert.equal(movie!.duration, '2h 16m');
  assert.equal(movie!.rating, 'R');
  assert.equal(movie!.director, 'Lilly Wachowski');
  assert.deepEqual(movie!.actors, ['Keanu Reeves', 'Laurence Fishburne']);
  assert.equal(movie!.communityRating, 8.7);
  assert.deepEqual(movie!.genres, ['Action', 'Science Fiction']);
  assert.equal(movie!.localPath, '');
  assert.deepEqual(movie!.streamingServices, [{
    id: 'netflix',
    name: 'NETFLIX',
    url: 'https://www.netflix.com/search?q=The%20Matrix',
  }]);
});

test('synthesizeStreamingMovie: a malformed item (no id/title) is dropped, not thrown', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  assert.equal(synthesizeStreamingMovie({ title: 'No id' }, netflix), null);
  assert.equal(synthesizeStreamingMovie({ id: 1 }, netflix), null);
});

test('synthesizeStreamingMovie: maps backdropPath to TMDB backdrop URL', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  const movie = synthesizeStreamingMovie({
    id: 603,
    title: 'The Matrix',
    backdropPath: '/backdrop.jpg',
  }, netflix);
  assert.ok(movie);
  assert.equal(movie!.backdropUrl, 'https://image.tmdb.org/t/p/w780/backdrop.jpg');
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

test('deduplicateStreamingMovies: consolidates titles with same tmdbId across services and merges streaming services in order', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  const prime = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'prime')!;
  const hulu = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'hulu')!;

  const netflixMovie = synthesizeStreamingMovie({
    id: 424,
    title: "Schindler's List",
    duration: '3h 15m',
    rating: 'R',
    director: 'Steven Spielberg',
    actors: ['Liam Neeson', 'Ben Kingsley'],
  }, netflix)!;

  const primeMovie = synthesizeStreamingMovie({
    id: 424,
    title: "Schindler's List",
    backdropPath: '/schindler-backdrop.jpg',
  }, prime)!;

  const huluMovie = synthesizeStreamingMovie({
    id: 999,
    title: 'Different Title',
  }, hulu)!;

  const deduplicated = deduplicateStreamingMovies([primeMovie, netflixMovie, huluMovie], DEFAULT_STREAMING_SERVICES);
  assert.equal(deduplicated.length, 2);

  const schindler = deduplicated.find((m) => m.tmdbId === 424)!;
  assert.ok(schindler);
  assert.equal(schindler.title, "Schindler's List");
  assert.equal(schindler.libraryName, 'Movies');
  assert.equal(schindler.duration, '3h 15m');
  assert.equal(schindler.rating, 'R');
  assert.equal(schindler.director, 'Steven Spielberg');
  assert.deepEqual(schindler.actors, ['Liam Neeson', 'Ben Kingsley']);
  assert.equal(schindler.backdropUrl, 'https://image.tmdb.org/t/p/w780/schindler-backdrop.jpg');

  // In DEFAULT_STREAMING_SERVICES, netflix precedes prime.
  assert.equal(schindler.streamingServices?.length, 2);
  assert.equal(schindler.streamingServices?.[0].id, 'netflix');
  assert.equal(schindler.streamingServices?.[1].id, 'prime');
  assert.equal(schindler.streamingServiceId, 'netflix');
});

test('buildStreamingLibraries: returns single unified Movies library with deduplicated stock', () => {
  const netflix = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'netflix')!;
  const hulu = DEFAULT_STREAMING_SERVICES.find((d) => d.id === 'hulu')!;
  const movies = [
    synthesizeStreamingMovie({ id: 1, title: 'Hulu Title' }, hulu)!,
    synthesizeStreamingMovie({ id: 2, title: 'Netflix Title A' }, netflix)!,
    synthesizeStreamingMovie({ id: 2, title: 'Netflix Title A' }, hulu)!, // duplicate across services
    synthesizeStreamingMovie({ id: 3, title: 'Netflix Title B' }, netflix)!,
  ];
  const libs = buildStreamingLibraries(movies, DEFAULT_STREAMING_SERVICES);
  assert.equal(libs.length, 1);
  assert.equal(libs[0].id, 'streaming:movies');
  assert.equal(libs[0].name, 'Movies');
  assert.equal(libs[0].streaming, true);
  assert.deepEqual(libs[0].genres, []);
  assert.equal(libs[0].movies.length, 3); // 1, 2, 3

  const dup = libs[0].movies.find((m) => m.tmdbId === 2)!;
  assert.equal(dup.streamingServices?.length, 2);
});

test('buildStreamingLibraries: no movies -> no libraries', () => {
  assert.deepEqual(buildStreamingLibraries([], DEFAULT_STREAMING_SERVICES), []);
});

test('resolveStreamingWatchRegion: defaults to US and normalizes whitespace and case', () => {
  assert.equal(DEFAULT_STREAMING_WATCH_REGION, 'US');
  assert.equal(resolveStreamingWatchRegion(), 'US');
  assert.equal(resolveStreamingWatchRegion(null), 'US');
  assert.equal(resolveStreamingWatchRegion(''), 'US');
  assert.equal(resolveStreamingWatchRegion('  gb  '), 'GB');
  assert.equal(resolveStreamingWatchRegion('ca'), 'CA');
});
