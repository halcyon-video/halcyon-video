import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMediaBrowserClient } from '../src/media-browser-client.ts';

const emby = createMediaBrowserClient('emby');
const jellyfin = createMediaBrowserClient('jellyfin');
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

// Each mock inspects the actual request constructed by the shared client.
test('Emby auth carries independent protocol and normalizes proxy prefixes exactly once', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string, opts: RequestInit) => {
    assert.equal(input, 'https://server.test/proxy/emby/Users/AuthenticateByName');
    const h = opts.headers as Record<string, string>;
    assert.match(h['X-Emby-Authorization'], /^Emby Client=/);
    assert.equal(h.Authorization, undefined);
    assert.equal(h['X-Emby-Token'], undefined);
    assert.deepEqual(JSON.parse(String(opts.body)), { Username: 'Alice', Pw: 'test-only' });
    return json({ AccessToken: 'fake', User: { Id: 'u', Name: 'Alice' } });
  });
  assert.deepEqual(await emby.authenticateUser('https://server.test/proxy/emby///', 'Alice', 'test-only'), { accessToken: 'fake', userId: 'u', userName: 'Alice' });
  assert.equal(emby.normalizeUrl('server.test/proxy'), 'http://server.test/proxy/emby');
});

test('interleaved backends and sessions never exchange token headers or route prefixes', async (t) => {
  const seen: Array<[string, Record<string, string>]> = [];
  t.mock.method(globalThis, 'fetch', async (input: string, opts: RequestInit) => {
    seen.push([input, opts.headers as Record<string, string>]);
    await new Promise(r => setTimeout(r, input.includes('first') ? 5 : 0));
    return json({});
  });
  await Promise.all([emby.validateToken('https://first.test', 'e1'), jellyfin.validateToken('https://native.test', 'j'), emby.validateToken('https://second.test/base', 'e2')]);
  assert.deepEqual(seen.map(([url]) => url), ['https://first.test/emby/System/Info', 'https://native.test/Users/Me', 'https://second.test/base/emby/System/Info']);
  assert.equal(seen[0][1]['X-Emby-Token'], 'e1');
  assert.match(seen[1][1].Authorization, /^MediaBrowser .*Token="j"$/);
  assert.equal(seen[1][1]['X-Emby-Token'], undefined);
  assert.equal(seen[2][1]['X-Emby-Token'], 'e2');
});

test('only rejected credentials invalidate sessions; transient and malformed responses fail', async (t) => {
  for (const status of [401, 403, 500]) {
    t.mock.method(globalThis, 'fetch', async () => json({ secret: 'must-not-leak' }, status));
    if (status < 500) assert.equal(await emby.validateToken('https://server.test', 'fake'), false);
    else await assert.rejects(emby.validateToken('https://server.test', 'fake'), /^Error: HTTP error 500: Media server request failed$/);
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => json({}));
  await assert.rejects(emby.authenticateUser('https://server.test', 'Alice'), /Invalid response payload/);
});

test('catalog pagination, conversion, watch state, artwork and exclusion use Emby routes', async (t) => {
  const starts: number[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, opts: RequestInit) => {
    const u = new URL(input);
    assert.ok(u.pathname.startsWith('/emby/'));
    assert.equal((opts.headers as Record<string,string>)['X-Emby-Token'], 'fake');
    if (u.pathname.endsWith('/Views')) return json({ Items: [{ Id: 'films', Name: 'Films', Type: 'CollectionFolder', CollectionType: 'movies' }] });
    if (u.searchParams.get('IncludeItemTypes') === 'BoxSet') return json({ Items: [], TotalRecordCount: 0 });
    const start = Number(u.searchParams.get('StartIndex'));
    starts.push(start);
    const count = start === 0 ? 500 : 1;
    return json({ Items: Array.from({ length: count }, (_, i) => ({ Id: String(start+i), Name: `Film ${start+i}`, Type: 'Movie', ProductionYear: 2000, Genres: ['Drama'], UserData: { Played: true, PlayCount: 2, PlaybackPositionTicks: 123 }, MediaSources: [{ Id: `opaque-${start+i}`, Container: 'mp4', MediaStreams: [{Type:'Video',Codec:'h264'}, {Type:'Audio',Codec:'aac',Index:1}] }] })), TotalRecordCount: 501 });
  });
  const libs = await emby.fetchJellyfinLibrariesAndMovies('https://server.test', 'fake', 'u');
  assert.equal(new URL(emby.buildHlsStreamUrl('https://server.test', 'fake', '0')).searchParams.get('MediaSourceId'), 'opaque-0');
  assert.equal(new URL(emby.buildHlsStreamUrl('https://server.test', 'another-user', '0')).searchParams.get('MediaSourceId'), null);
  assert.deepEqual(starts, [0, 500]);
  assert.equal(libs[0].movies.length, 501);
  assert.equal(libs[0].movies[0].resumePositionTicks, 123);
  assert.equal(libs[0].movies[0].played, true);
  assert.equal(libs[0].movies[0].mediaPlaybackInfo?.videoCodec, 'h264');
  assert.match(libs[0].movies[0].posterUrl!, /\/emby\/Items\/0\/Images\/Primary/);
  assert.deepEqual(await emby.fetchJellyfinLibrariesAndMovies('https://server.test', 'fake', 'u', undefined, { excludeLibraryIds: new Set(['films']) }), []);
  assert.deepEqual(starts, [0, 500]);
});

test('playback URLs retain proxy path, encode tokens and select versions with unique sessions', async () => {
  const direct = new URL(emby.buildStaticStreamUrl('https://server.test/base', 'a&b', 'film', 'v2'));
  assert.equal(direct.pathname, '/base/emby/Videos/film/stream');
  assert.equal(direct.searchParams.get('api_key'), 'a&b');
  assert.equal(direct.searchParams.get('MediaSourceId'), 'v2');
  const options = { mediaSourceId:'v2', audioStreamIndex:2, subtitleStreamIndex:3, startPositionTicks:123, maxWidth:720 };
  const first = new URL(emby.buildHlsStreamUrl('https://server.test/base', 'fake', 'film', options));
  const second = new URL(emby.buildHlsStreamUrl('https://server.test/base', 'fake', 'film', options));
  assert.notEqual(first.searchParams.get('PlaySessionId'), second.searchParams.get('PlaySessionId'));
  assert.equal(first.searchParams.get('AudioStreamIndex'), '2');
  assert.equal(first.searchParams.get('SubtitleStreamIndex'), '3');
  assert.equal(first.searchParams.get('StartTimeTicks'), '123');
  assert.match(emby.buildSubtitleTrackUrl('https://server.test/base/emby', 'fake', 'film', 3, 'v2'), /\/base\/emby\/Videos\/film\/v2\/Subtitles\/3\/0\/Stream.vtt/);
  await assert.rejects(emby.stopActiveEncoding('session'), /requires its source connection/);
});

test('playback reports and cancellation carry the explicit source token', async (t) => {
  const calls: Array<[string, RequestInit]> = [];
  t.mock.method(globalThis, 'fetch', async (input: string, opts: RequestInit) => { calls.push([input, opts]); return new Response(null, {status:204}); });
  await emby.reportPlaybackStart('https://server.test', 'fake', 'film');
  await emby.reportPlaybackProgress('https://server.test', 'fake', 'film', 123, true);
  await emby.reportPlaybackStopped('https://server.test', 'fake', 'film', 456);
  await emby.stopActiveEncoding('session', undefined, {url:'https://server.test',token:'fake'});
  const progress = JSON.parse(String(calls[1][1].body));
  assert.equal(progress.ItemId, 'film');
  assert.equal(progress.PositionTicks, 123);
  assert.equal(progress.IsPaused, true);
  assert.ok(progress.PlaySessionId);
  assert.equal(progress.PlaySessionId, JSON.parse(String(calls[0][1].body)).PlaySessionId);
  assert.equal(calls[3][1].method, 'DELETE');
  assert.equal(new URL(calls[3][0]).searchParams.get('playSessionId'), 'session');
  for (const [url, opts] of calls) { assert.match(url, /\/emby\//); assert.equal((opts.headers as Record<string,string>)['X-Emby-Token'], 'fake'); }
});

test('episodes retain season ordering, resume positions and Emby artwork', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const u=new URL(input);
    assert.equal(u.pathname, '/emby/Users/u/Items');
    assert.equal(u.searchParams.get('SortBy'), 'ParentIndexNumber,IndexNumber');
    return json({Items:[{Id:'episode',Name:'Pilot',SeriesName:'Series',ParentIndexNumber:1,IndexNumber:1,SeasonId:'season',UserData:{PlaybackPositionTicks:789}}]});
  });
  const episodes = await emby.fetchSeriesEpisodes('https://server.test','fake','u','series');
  assert.equal(episodes[0].seasonNumber,1);
  assert.equal(episodes[0].resumePositionTicks,789);
  assert.match(episodes[0].seasonPrimaryUrl!, /\/emby\/Items\/season\/Images/);
});

test('transport errors and malformed pages cannot masquerade as a valid empty Emby catalog', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  await assert.rejects(emby.validateToken('https://server.test', 'fake'), /offline/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => json({Items:'not an array'}));
  await assert.rejects(emby.fetchMediaCatalog('https://server.test','fake','u'), /invalid items page/);
});

test('Emby provider exposes registered backend capabilities and uses protocol-specific playback', async () => {
  const { EmbyProvider } = await import('../src/providers/emby-provider.ts');
  const provider = new EmbyProvider();
  assert.equal(provider.id, 'emby');
  assert.equal(provider.capabilities.userConfigStorage, true);
  const source = await provider.resolvePlaybackSource('https://server.test', {accessToken:'fake',userId:'u',userName:'Alice'}, 'film', {kind:'transcode',mediaSourceId:'opaque'});
  assert.equal(new URL(source.url).pathname, '/emby/Videos/film/master.m3u8');
  assert.equal(new URL(source.url).searchParams.get('MediaSourceId'), 'opaque');
  assert.equal(new URL(source.url).searchParams.get('PlaySessionId'), source.sessionId);
  const metadata = provider.getCollectionMetadata();
  metadata.tmdbIds.set('External mutation',123);
  assert.equal(provider.getCollectionMetadata().tmdbIds.has('External mutation'),false);
});

test('plain HTTP LAN playback works without secure-context randomUUID', async (t) => {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')!;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues } });
  try {
  const client = createMediaBrowserClient('emby');
  const ids: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: string, opts: RequestInit) => {
    const body = JSON.parse(String(opts.body));
    ids.push(body.PlaySessionId);
    return new Response(null, {status:204});
  });
  // Unprepared local playback, a direct source, then a transcode each need IDs.
  await client.reportPlaybackStart('http://lan.test','fake','unprepared');
  client.buildStaticStreamUrl('http://lan.test','fake','direct','opaque');
  await client.reportPlaybackStart('http://lan.test','fake','direct');
  const hls=client.buildHlsStreamUrl('http://lan.test','fake','hls',{mediaSourceId:'opaque'});
  ids.push(new URL(hls).searchParams.get('PlaySessionId')!);
  for (const id of ids) assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(ids).size,3);
  } finally { Object.defineProperty(globalThis, 'crypto', originalCrypto); }
});

test('Emby episode paths cache opaque sources before local playback and subtitles', async (t) => {
  const client=createMediaBrowserClient('emby');
  t.mock.method(globalThis,'fetch',async (input:string) => {
    assert.match(new URL(input).searchParams.get('Fields')!, /MediaSources/);
    return json({Items:[{Id:'ep',Path:'/test/episode.mp4',MediaSources:[{Id:'opaque-episode'}]}]});
  });
  await client.fetchFirstEpisodeOfSeries('https://server.test','first','u','series');
  await client.fetchSeriesEpisodes('https://server.test','second','u','series');
  for(const token of ['first','second']) {
    const subtitle=client.buildSubtitleTrackUrl('https://server.test',token,'ep',2);
    assert.match(subtitle,/\/ep\/opaque-episode\/Subtitles/);
    const hls=client.buildHlsStreamUrl('https://server.test',token,'ep');
    assert.equal(new URL(hls).searchParams.get('MediaSourceId'),'opaque-episode');
  }
});

test('metadata arriving after direct URL creation completes the existing report session', async (t) => {
  const client = createMediaBrowserClient('emby');
  let report: any;
  t.mock.method(globalThis,'fetch', async (_input:string,opts:RequestInit) => {
    if(opts.method==='POST') { report=JSON.parse(String(opts.body)); return new Response(null,{status:204}); }
    return json({Id:'ep',MediaSources:[{Id:'late-source'}]});
  });
  client.buildStaticStreamUrl('https://server.test','fake','ep');
  await client.fetchItemPlaybackInfo('https://server.test','fake','u','ep');
  await client.reportPlaybackStart('https://server.test','fake','ep');
  assert.equal(report.MediaSourceId,'late-source');
});
