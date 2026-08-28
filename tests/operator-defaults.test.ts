// GH #129: an operator sets server-wide connection defaults and keeps the API
// key on the server. These pin the two halves that make that safe — what the
// browser is allowed to be told, and which requests may spend the operator's
// credential — because both are security boundaries where a quiet regression
// looks like nothing at all until someone reads a key out of devtools or
// deletes a rom through the proxy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  operatorAuthHeaders,
  operatorDefault,
  operatorRequestAllowed,
  operatorServiceForTarget,
  publicOperatorDefaults,
  readOperatorEnv,
  setOperatorDefaults,
  targetBelongsTo,
} from '../src/operator-defaults.ts';

const ROMM = { HALCYON_ROMM_URL: 'http://box:8080', HALCYON_ROMM_APIKEY: 'devin:devin' };

test('both halves are required, and the URL must be one a proxy can fetch', () => {
  assert.deepEqual(readOperatorEnv({ HALCYON_ROMM_URL: 'http://box:8080' }), {});
  assert.deepEqual(readOperatorEnv({ HALCYON_ROMM_APIKEY: 'k' }), {});
  assert.deepEqual(readOperatorEnv({ HALCYON_ROMM_URL: 'box:8080', HALCYON_ROMM_APIKEY: 'k' }), {});
  assert.deepEqual(readOperatorEnv(ROMM), { romm: { url: 'http://box:8080', apiKey: 'devin:devin' } });
});

test('trailing slashes are stripped and HALCYON_*_API_KEY is accepted', () => {
  const cfg = readOperatorEnv({ HALCYON_ROMM_URL: 'http://box:8080//', HALCYON_ROMM_API_KEY: 'k' });
  assert.deepEqual(cfg.romm, { url: 'http://box:8080', apiKey: 'k' });
});

test('seerr/overseerr aliases resolve, canonical name first', () => {
  for (const prefix of ['HALCYON_JELLYSEERR', 'HALCYON_SEERR', 'HALCYON_OVERSEERR']) {
    const cfg = readOperatorEnv({ [`${prefix}_URL`]: 'http://seerr:5055', [`${prefix}_APIKEY`]: 'k' });
    assert.equal(cfg.jellyseerr?.url, 'http://seerr:5055', `${prefix}_* should resolve`);
  }
  const both = readOperatorEnv({
    HALCYON_JELLYSEERR_URL: 'http://canonical:5055', HALCYON_JELLYSEERR_APIKEY: 'canon',
    HALCYON_OVERSEERR_URL: 'http://other:5055', HALCYON_OVERSEERR_APIKEY: 'other',
  });
  assert.equal(both.jellyseerr?.apiKey, 'canon');
});

test('what the browser is told carries the address and never the key', () => {
  const pub = publicOperatorDefaults(readOperatorEnv({
    ...ROMM, HALCYON_JELLYSEERR_URL: 'http://seerr:5055', HALCYON_JELLYSEERR_APIKEY: 'sekrit',
  }));
  assert.deepEqual(pub, {
    romm: { url: 'http://box:8080', managed: true },
    jellyseerr: { url: 'http://seerr:5055', managed: true },
  });
  assert.ok(!JSON.stringify(pub).includes('sekrit'));
  assert.ok(!JSON.stringify(pub).includes('devin'));
});

test('a target only belongs to the operator on an exact origin + path-segment match', () => {
  const base = 'http://box:8080';
  assert.ok(targetBelongsTo('http://box:8080/api/platforms', base));
  assert.ok(!targetBelongsTo('http://box:8080.evil.test/api/roms', base), 'host-suffix lookalike');
  assert.ok(!targetBelongsTo('https://box:8080/api/roms', base), 'protocol must match');
  assert.ok(!targetBelongsTo('http://box:9090/api/roms', base), 'port is part of the host');
  assert.ok(!targetBelongsTo('http://evil.test/?u=http://box:8080/api/roms', base), 'not a prefix game');
  assert.ok(!targetBelongsTo('nonsense', base));
  // A base URL with a path only owns that subtree.
  assert.ok(targetBelongsTo('http://box/romm/api/roms', 'http://box/romm'));
  assert.ok(!targetBelongsTo('http://box/romm-public/api/roms', 'http://box/romm'));
});

test('only the endpoints the store itself calls may spend the operator credential', () => {
  const allowed = (svc: 'romm' | 'jellyseerr', method: string, url: string) =>
    operatorRequestAllowed(svc, method, url);

  assert.ok(allowed('romm', 'GET', 'http://box:8080/api/platforms'));
  assert.ok(allowed('romm', 'GET', 'http://box:8080/api/roms?platform_ids=3&limit=500'));
  assert.ok(allowed('romm', 'GET', 'http://box:8080/assets/romm/resources/roms/3/9/cover.png'));
  assert.ok(!allowed('romm', 'GET', 'http://box:8080/api/users'), 'not the user list');
  assert.ok(!allowed('romm', 'DELETE', 'http://box:8080/api/roms/9'), 'never a write');
  assert.ok(!allowed('romm', 'POST', 'http://box:8080/api/roms'), 'romm takes no writes at all');

  assert.ok(allowed('jellyseerr', 'GET', 'http://seerr:5055/api/v1/discover/trending?page=1'));
  assert.ok(allowed('jellyseerr', 'GET', 'http://seerr:5055/api/v1/movie/603'));
  assert.ok(allowed('jellyseerr', 'POST', 'http://seerr:5055/api/v1/request'), '"Order it for me"');
  assert.ok(!allowed('jellyseerr', 'POST', 'http://seerr:5055/api/v1/request/7/approve'), 'not approval');
  assert.ok(!allowed('jellyseerr', 'GET', 'http://seerr:5055/api/v1/user'), 'not the user list');
  assert.ok(!allowed('jellyseerr', 'GET', 'http://seerr:5055/api/v1/settings/main'));
  // A query string can't smuggle an allowed path onto a denied one.
  assert.ok(!allowed('jellyseerr', 'GET', 'http://seerr:5055/api/v1/settings?x=/api/v1/movie/1'));
});

test('the injected header matches what each service actually speaks', () => {
  assert.deepEqual(
    operatorAuthHeaders('romm', { url: 'http://box:8080', apiKey: 'devin:devin' }),
    { authorization: `Basic ${Buffer.from('devin:devin').toString('base64')}` }
  );
  assert.deepEqual(
    operatorAuthHeaders('romm', { url: 'http://box:8080', apiKey: 'token123' }),
    { authorization: 'Bearer token123' }
  );
  assert.deepEqual(
    operatorAuthHeaders('jellyseerr', { url: 'http://seerr:5055', apiKey: 'k' }),
    { 'x-api-key': 'k' }
  );
});

test('a target belonging to no configured service gets nothing injected', () => {
  const cfg = readOperatorEnv(ROMM);
  assert.equal(operatorServiceForTarget(cfg, 'http://box:8080/api/roms'), 'romm');
  assert.equal(operatorServiceForTarget(cfg, 'http://elsewhere.test/api/roms'), null);
  assert.equal(operatorServiceForTarget({}, 'http://box:8080/api/roms'), null);
});

test('the client cache reports only what the server actually sent', () => {
  setOperatorDefaults(null);
  assert.equal(operatorDefault('romm'), null);
  setOperatorDefaults({ romm: { url: 'http://box:8080', managed: true } });
  assert.deepEqual(operatorDefault('romm'), { url: 'http://box:8080', managed: true });
  assert.equal(operatorDefault('jellyseerr'), null);
  setOperatorDefaults(null);
});
