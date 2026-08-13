// GH #50: the request-server integration speaks the Overseerr API, which
// Jellyseerr inherited as a fork — so the config accepts either name. These
// pin the resolution rules that decide whether an install is "configured",
// which is the switch that also decides whether the recommendation clasps and
// the Coming Soon wall get built at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSeerrConfig } from '../src/seerr-config.ts';

/** A reader over a plain map, standing in for localStorage + import.meta.env. */
const from = (map: Record<string, string>) => (key: string) => map[key] ?? null;

test('canonical jellyseerr_* keys resolve', () => {
  const cfg = resolveSeerrConfig(from({ jellyseerr_url: 'http://box:5055', jellyseerr_apikey: 'abcd' }));
  assert.deepEqual(cfg, { url: 'http://box:5055', apiKey: 'abcd' });
});

test('neutral seerr_* and overseerr_* aliases resolve the same way', () => {
  for (const prefix of ['seerr', 'overseerr']) {
    const cfg = resolveSeerrConfig(from({ [`${prefix}_url`]: 'http://box:5055', [`${prefix}_apikey`]: 'abcd' }));
    assert.deepEqual(cfg, { url: 'http://box:5055', apiKey: 'abcd' }, `${prefix}_* should resolve`);
  }
});

test('the canonical key wins over the aliases', () => {
  const cfg = resolveSeerrConfig(from({
    jellyseerr_url: 'http://canonical:5055', jellyseerr_apikey: 'canon',
    seerr_url: 'http://neutral:5055', seerr_apikey: 'neut',
    overseerr_url: 'http://over:5055', overseerr_apikey: 'over',
  }));
  assert.deepEqual(cfg, { url: 'http://canonical:5055', apiKey: 'canon' });
});

test('url and key may come from different flavors of the key name', () => {
  // Half-migrated configs shouldn't silently disable the integration.
  const cfg = resolveSeerrConfig(from({ jellyseerr_url: 'http://box:5055', overseerr_apikey: 'abcd' }));
  assert.deepEqual(cfg, { url: 'http://box:5055', apiKey: 'abcd' });
});

test('either half missing means not configured', () => {
  assert.equal(resolveSeerrConfig(from({ jellyseerr_url: 'http://box:5055' })), null);
  assert.equal(resolveSeerrConfig(from({ jellyseerr_apikey: 'abcd' })), null);
  assert.equal(resolveSeerrConfig(from({})), null);
});

test('blank and whitespace-only values are not configuration', () => {
  assert.equal(resolveSeerrConfig(from({ jellyseerr_url: '   ', jellyseerr_apikey: 'abcd' })), null);
  assert.equal(resolveSeerrConfig(from({ jellyseerr_url: 'http://box:5055', jellyseerr_apikey: '  ' })), null);
});

test('a blank canonical key falls through to an alias instead of losing the config', () => {
  const cfg = resolveSeerrConfig(from({
    jellyseerr_url: '', jellyseerr_apikey: '',
    overseerr_url: 'http://over:5055', overseerr_apikey: 'abcd',
  }));
  assert.deepEqual(cfg, { url: 'http://over:5055', apiKey: 'abcd' });
});

test('a trailing slash is trimmed off the url', () => {
  const cfg = resolveSeerrConfig(from({ jellyseerr_url: 'http://box:5055/', jellyseerr_apikey: 'abcd' }));
  assert.equal(cfg?.url, 'http://box:5055');
});

test("base64 '=' padding lost to double-click selection is restored", () => {
  // 'MTIzNDU2Nzg5MA' is 14 chars — 14 % 4 === 2, so two '=' are missing.
  const cfg = resolveSeerrConfig(from({ jellyseerr_url: 'http://box:5055', jellyseerr_apikey: 'MTIzNDU2Nzg5MA' }));
  assert.equal(cfg?.apiKey, 'MTIzNDU2Nzg5MA==');
});

test('a key that is already padded, or not base64 at all, is left alone', () => {
  const padded = resolveSeerrConfig(from({ jellyseerr_url: 'http://b', jellyseerr_apikey: 'MTIzNDU2Nzg5MA==' }));
  assert.equal(padded?.apiKey, 'MTIzNDU2Nzg5MA==');
  const notB64 = resolveSeerrConfig(from({ jellyseerr_url: 'http://b', jellyseerr_apikey: 'plain-key_with.punct' }));
  assert.equal(notB64?.apiKey, 'plain-key_with.punct');
});

test('surrounding whitespace is trimmed before the padding test', () => {
  const cfg = resolveSeerrConfig(from({ jellyseerr_url: ' http://box:5055 ', jellyseerr_apikey: '  MTIzNDU2Nzg5MA  ' }));
  assert.deepEqual(cfg, { url: 'http://box:5055', apiKey: 'MTIzNDU2Nzg5MA==' });
});
