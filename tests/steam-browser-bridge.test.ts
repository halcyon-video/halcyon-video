import test from 'node:test';
import assert from 'node:assert/strict';
import { browserSteamOriginAllowed, browserSteamRequestAllowed, parseCookieJar } from '../tools/steam-browser-bridge.mjs';

test('browser Steam companion accepts only loopback clients', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(browserSteamRequestAllowed({ socket: { remoteAddress: address } }), true);
  for (const address of ['192.168.1.2', '100.64.1.2', undefined]) assert.equal(browserSteamRequestAllowed({ socket: { remoteAddress: address } }), false);
});

test('browser Steam companion rejects cross-site requests to localhost', () => {
  const request = (origin?: string) => ({ socket: { remoteAddress: '127.0.0.1' }, headers: origin ? { origin } : {} });
  assert.equal(browserSteamOriginAllowed(request()), true);
  assert.equal(browserSteamOriginAllowed(request('http://localhost:1420')), true);
  assert.equal(browserSteamOriginAllowed(request('http://127.0.0.1:1420')), true);
  assert.equal(browserSteamOriginAllowed(request('https://attacker.invalid')), false);
});

test('Steam cookie parser keeps live Steam cookies without logging secrets', () => {
  const jar = '# Netscape HTTP Cookie File\n#HttpOnly_.steampowered.com\tTRUE\t/\tTRUE\t2000000000\tsteamLoginSecure\tsecret%7Ctoken\n.example.com\tTRUE\t/\tTRUE\t2000000000\tbad\tleak\n.steampowered.com\tTRUE\t/\tTRUE\t1\texpired\told\n';
  assert.deepEqual(parseCookieJar(jar, 100), [{ name: 'steamLoginSecure', value: 'secret%7Ctoken' }]);
});
