import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMediaBrowserClient } from '../src/media-browser-client.ts';
import { scrubText } from '../src/setup-failure-report.ts';

for (const dialect of ['jellyfin', 'emby'] as const) {
  test(`${dialect} media URLs carry the supported credential without changing proxy paths`, () => {
    const client = createMediaBrowserClient(dialect);
    const server = 'https://media.test/proxy/', token = 'session+with&reserved=characters';
    const urls = [
      client.buildHlsStreamUrl(server, token, 'movie', { startPositionTicks: 30000000, mediaSourceId: 'cut' }),
      client.buildStaticStreamUrl(server, token, 'movie', 'cut'),
      client.buildSubtitleTrackUrl(server, token, 'movie', 2, 'cut'),
      client.buildItemImageUrl(server, token, 'movie', 'poster', 300),
    ];
    for (const value of urls) {
      const url = new URL(value!);
      assert.ok(url.pathname.startsWith('/proxy/'));
      const key = dialect === 'jellyfin' ? 'ApiKey' : 'api_key';
      assert.equal(url.searchParams.get(key), token);
      assert.equal(url.searchParams.has(dialect === 'jellyfin' ? 'api_key' : 'ApiKey'), false);
    }
    const hls = new URL(urls[0]!);
    assert.equal(hls.searchParams.get('StartTimeTicks'), '30000000');
    assert.equal(hls.searchParams.get('MediaSourceId'), 'cut');
    assert.ok(hls.searchParams.get('PlaySessionId'));
  });
}

test('failure reports redact modern and legacy Jellyfin URL credentials', () => {
  const result = scrubText('GET https://media.test/master.m3u8?ApiKey=modern-secret&x=1 api_key=legacy-secret apikey=lower-secret');
  for (const secret of ['modern-secret', 'legacy-secret', 'lower-secret']) assert.ok(!result.includes(secret));
});
