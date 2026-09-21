import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createIntegrationProxy } from '../tools/integration-proxy.mjs';

const id = '0123456789abcdef0123456789abcdef';
const serverId = 'abcdef0123456789abcdef0123456789';
const key = 'private-seerr-key';
const token = 'personal-jellyfin-session';
const service = { url: 'https://seerr.example/base', apiKey: key };
const calls: { url: string; options: any }[] = [];
let mode = 'ok';
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let server: http.Server, origin: string;
const middleware = createIntegrationProxy({ jellyseerr: service }, { env: {}, fetchImpl: async (url: string, options: any) => {
  calls.push({ url, options });
  assert.equal(options.redirect, 'manual');
  if (mode === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://attacker.test' } });
  if (mode === 'large') return reply({ padding: 'x'.repeat(1024 * 1024) });
  if (mode === 'error') throw new Error(key + token);
  if (url.endsWith('/settings/jellyfin')) {
    assert.equal(options.headers['x-api-key'], key);
    assert.equal(options.headers['x-emby-token'], undefined);
    return reply({ ip: mode === 'bad-host' ? 'host@attacker.test' : 'jellyfin.internal',
      port: mode === 'string-port' ? '8096' : 8096,
      urlBase: '/jellyfin', useSsl: false, serverId, apiKey: 'do-not-use-admin-jellyfin-key' });
  }
  if (url.endsWith('/Users/Me')) {
    assert.equal(url, 'http://jellyfin.internal:8096/jellyfin/Users/Me');
    assert.equal(options.headers['x-api-key'], undefined);
    assert.equal(options.headers['x-emby-token'], mode === 'invalid' ? 'invalid' : token);
    if (mode === 'invalid') return reply({ secret: key }, 401);
    return reply({ Id: id, ServerId: mode === 'wrong-server' ? id : serverId, Policy: { IsDisabled: mode === 'disabled' } });
  }
  if (url.includes('/api/v1/user?')) {
    const user = { id: 7, jellyfinUserId: mode === 'unlinked' ? serverId : '01234567-89ab-cdef-0123-456789abcdef', email: 'private@example.test' };
    if (mode === 'pagination' && url.endsWith('skip=0')) return reply({ results: Array.from({ length: 100 }, () => ({ id: 3, jellyfinUserId: serverId })) });
    return reply({ results: [user] });
  }
  assert.equal(url, service.url + '/api/v1/request');
  assert.equal(options.headers['x-api-key'], key);
  assert.equal(options.headers['x-api-user'], '7');
  assert.equal(options.headers['x-halcyon-jellyfin-token'], undefined);
  assert.equal(options.headers['x-emby-token'], undefined);
  assert.deepEqual(JSON.parse(options.body), { mediaType: 'movie', mediaId: 431693 });
  return reply({ id: 12, requestedBy: { email: 'private@example.test' } }, mode === 'denied' ? 403 : 201);
} });
test.before(async () => {
  server = http.createServer((req, res) => middleware(req, res, () => res.end()));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
test.after(() => new Promise<void>(r => server.close(() => r())));
test.beforeEach(() => { calls.length = 0; mode = 'ok'; });
async function request(headers: Record<string, string> = {}, body = { mediaType: 'movie', mediaId: 431693 }) {
  return fetch(origin + '/dev-proxy', { method: 'POST', headers: {
    'x-proxy-target': service.url + '/api/v1/request', 'x-halcyon-jellyfin-token': token, ...headers,
  }, body: JSON.stringify(body) });
}
test('signed-in Jellyfin users request as their own linked Seerr user', async () => {
  const r = await request({ 'x-api-user': '1', 'x-jellyfin-user-id': serverId },
    { mediaType: 'movie', mediaId: 431693, userId: 1, isAutoRequest: true, serverId: 99 } as any);
  assert.equal(r.status, 201); assert.deepEqual(await r.json(), { ok: true });
  assert.equal(calls.length, 4);
});
test('string-encoded port from Jellyseerr settings succeeds', async () => {
  mode = 'string-port'; const r = await request();
  assert.equal(r.status, 201); assert.deepEqual(await r.json(), { ok: true });
  assert.equal(calls.length, 4);
});
test('links are found beyond the first page without trusting browser identities', async () => {
  mode = 'pagination'; const r = await request();
  assert.equal(r.status, 201); await r.text(); assert.equal(calls.length, 5);
});
test('missing, invalid, disabled, unlinked and wrong-server sessions cannot write', async () => {
  for (const m of ['missing', 'invalid', 'disabled', 'unlinked', 'wrong-server']) {
    mode = m; calls.length = 0;
    const r = await request({ 'x-halcyon-jellyfin-token': m === 'missing' ? '' : m === 'invalid' ? 'invalid' : token });
    assert.ok([401, 403].includes(r.status), m);
    const body = await r.text(); assert.ok(!body.includes(key)); assert.ok(!body.includes(token));
    assert.ok(!calls.some(c => c.options.method === 'POST'), m);
    if (m === 'missing') assert.equal(calls.length, 0);
    if (m === 'invalid') assert.equal(calls.length, 2);
    if (m === 'unlinked') assert.match(body, /Sign in to Jellyseerr/);
  }
});
test('Seerr rejection and quotas stay rejected without administrator fallback', async () => {
  mode = 'denied'; const r = await request();
  assert.equal(r.status, 403); assert.deepEqual(await r.json(), { error: 'Integration request failed', status: 403 });
  assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
});
test('redirects, invalid upstream configuration, oversized data and private errors fail closed', async () => {
  for (const m of ['redirect', 'bad-host', 'large', 'error']) {
    mode = m; calls.length = 0; const r = await request();
    assert.ok([401, 403, 502].includes(r.status), m);
    const body = await r.text(); assert.ok(!body.includes(key)); assert.ok(!body.includes(token));
    assert.ok(!calls.some(c => c.options.method === 'POST'));
    assert.equal(calls.length, 1);
  }
});
test('user token cannot authorize administration, cross-site, malformed or arbitrary-target requests', async () => {
  for (const headers of [
    { 'x-proxy-target': service.url + '/api/v1/settings/main' },
    { 'x-proxy-target': 'https://attacker.test/api/v1/request' },
    { origin: 'https://attacker.test' },
  ]) {
    const r = await request(headers); assert.equal(r.status, 403); await r.text();
  }
  const r = await request({}, { mediaType: 'movie', mediaId: -1 });
  assert.equal(r.status, 400); await r.text(); assert.equal(calls.length, 0);
});
