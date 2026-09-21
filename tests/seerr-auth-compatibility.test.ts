import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createIntegrationProxy } from '../tools/integration-proxy.mjs';

// HTTP contract fixture for Jellyfin 10.11 with EnableLegacyAuthorization=false.
// AuthorizationContext reads Authorization: MediaBrowser Token="..."; it ignores
// X-Emby-Token in this mode. Keep this independent of Halcyon's header builder.
// Source: jellyfin/jellyfin v10.11.0, Security/AuthorizationContext.cs.
const userId = '0123456789abcdef0123456789abcdef';
const serverId = 'abcdef0123456789abcdef0123456789';
const apiKey = 'fixture-host-key';
const oldToken = 'fixture-existing-session';
const newToken = 'fixture-fresh-login';
const send = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  return { server, port, origin: `http://127.0.0.1:${port}` };
}
async function close(server: http.Server) {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

test('Jellyfin sessions survive a Halcyon restart and fresh login without legacy auth', async t => {
  let token = oldToken, settingsStatus = 200, usersStatus = 200, sessionStatus = 200;
  const identities: string[] = [], writes: any[] = [];
  const jellyfin = await listen((req, res) => {
    identities.push(String(req.headers.authorization || ''));
    if (req.url !== '/jellyfin/Users/Me') return send(res, 404, {});
    if (sessionStatus !== 200) return send(res, sessionStatus, { private: apiKey });
    if (req.headers.authorization !== `MediaBrowser Token="${token}"`) return send(res, 401, {});
    send(res, 200, { Id: userId, ServerId: serverId, Policy: { IsDisabled: false } });
  });
  t.after(() => close(jellyfin.server));
  const seerr = await listen(async (req, res) => {
    if (req.headers['x-api-key'] !== apiKey) return send(res, 401, {});
    if (req.url === '/api/v1/settings/jellyfin') return send(res, settingsStatus, {
      ip: '127.0.0.1', port: String(jellyfin.port), urlBase: '/jellyfin', serverId,
    });
    if (req.url === '/api/v1/user?take=100&skip=0') return send(res, usersStatus, {
      results: [{ id: 7, jellyfinUserId: userId }],
    });
    if (req.url === '/api/v1/request' && req.method === 'POST') {
      let body = ''; for await (const part of req) body += part;
      writes.push({ headers: req.headers, body: JSON.parse(body) });
      return send(res, 201, { id: 12 });
    }
    send(res, 404, {});
  });
  t.after(() => close(seerr.server));
  const boot = () => {
    const proxy = createIntegrationProxy({ jellyseerr: { url: seerr.origin, apiKey } }, { env: {} });
    return listen((req, res) => proxy(req, res, () => send(res, 404, {})));
  };
  let app = await boot();
  t.after(() => close(app.server));
  async function request(session = token) {
    const res = await fetch(app.origin + '/dev-proxy', { method: 'POST', headers: {
      'x-proxy-target': seerr.origin + '/api/v1/request',
      'x-halcyon-jellyfin-token': session, 'x-api-user': '1',
    }, body: JSON.stringify({ mediaType: 'movie', mediaId: 431693, userId: 1 }) });
    return { status: res.status, body: await res.json() };
  }
  await t.test('existing saved session still requests as its own linked user after restart', async () => {
    assert.equal((await request()).status, 201);
    await close(app.server); app = await boot();
    assert.equal((await request()).status, 201);
    token = newToken;
    assert.equal((await request()).status, 201);
    assert.deepEqual(identities, [oldToken, oldToken, newToken].map(value => `MediaBrowser Token="${value}"`));
    assert.equal(writes.length, 3);
    for (const write of writes) {
      assert.equal(write.headers['x-api-user'], '7');
      assert.equal(write.headers.authorization, undefined);
      assert.equal(write.headers['x-halcyon-jellyfin-token'], undefined);
      assert.deepEqual(write.body, { mediaType: 'movie', mediaId: 431693 });
    }
  });
  await t.test('expired sessions fail closed with a session-specific diagnostic', async () => {
    const before = writes.length;
    const r = await request(oldToken);
    assert.equal(r.status, 401);
    assert.equal(r.body.code, 'jellyfin-session');
    assert.equal(r.body.upstreamStatus, 401);
    assert.match(r.body.error, /Sign in to Jellyfin/);
    assert.equal(writes.length, before);
  });
  await t.test('host errors and upstream redirects never masquerade as expired logins', async () => {
    const before = writes.length;
    for (const stage of ['seerr-settings', 'seerr-users', 'jellyfin-session']) {
      for (const status of [401, 403, 302, 404, 500]) {
        settingsStatus = stage === 'seerr-settings' ? status : 200;
        usersStatus = stage === 'seerr-users' ? status : 200;
        sessionStatus = stage === 'jellyfin-session' ? status : 200;
        const r = await request();
        assert.equal(r.status, stage === 'jellyfin-session' && [401, 403].includes(status) ? 401 : 502);
        assert.equal(r.body.code, stage);
        assert.equal(r.body.upstreamStatus, status);
        if (stage !== 'jellyfin-session' || ![401, 403].includes(status)) assert.doesNotMatch(r.body.error, /Sign in to Jellyfin/);
        assert.doesNotMatch(JSON.stringify(r.body), /fixture-host-key|fixture-fresh-login|127\.0\.0\.1/);
      }
    }
    settingsStatus = usersStatus = sessionStatus = 200;
    assert.equal(writes.length, before);
  });
  await t.test('quoted token injection is rejected before contacting upstream', async () => {
    const before = identities.length;
    const r = await request('fake", Token="fixture-fresh-login');
    assert.equal(r.status, 401);
    assert.equal(identities.length, before);
  });
});
