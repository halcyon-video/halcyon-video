import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const provider = readFileSync(new URL('src/providers/steam-provider.ts', root), 'utf8');
const client = readFileSync(new URL('src/steam-companion-client.ts', root), 'utf8');
const bridge = readFileSync(new URL('src-tauri/src/steam_companion.rs', root), 'utf8');
const native = readFileSync(new URL('src-tauri/src/lib.rs', root), 'utf8');
const approval = readFileSync(new URL('companion-approve.html', root), 'utf8');

test('browser Steam is opt-in and has no owner-specific path', () => {
  assert.match(provider, /localStorage\.getItem\('steam_enabled'\) !== '1'/);
  assert.doesNotMatch(provider + client + bridge, /nobara-user|\/home\/devin|steam-preview/);
});

test('companion is loopback-only, paired, and does not expose Steam credentials', () => {
  assert.match(bridge, /127\.0\.0\.1:1421/);
  assert.match(bridge, /authorize\(&state/);
  assert.match(bridge, /Access-Control-Allow-Private-Network/);
  assert.match(bridge, /is_approval_window\(window\.label\(\)\)/);
  assert.doesNotMatch(bridge, /path\.starts_with\("\/approve\/"\)/);
  assert.match(approval, /frame-ancestors 'none'/);
  assert.doesNotMatch(bridge, /webapi_token.*respond|steamLoginSecure.*respond/);
});

test('native Steam-off mode does not start the loopback listener', () => {
  const setup = native.slice(native.indexOf('.setup(|app|'), native.indexOf('.invoke_handler'));
  assert.match(setup, /if companion_only \{\s*steam_companion::start/);
  assert.doesNotMatch(setup, /steam_companion::start\(app\.handle\(\)\)\?;\s*if companion_only/);
});

test('pairing is bounded, expiring, single-delivery and host checked', () => {
  assert.match(bridge, /MAX_PENDING/);
  assert.match(bridge, /Semaphore::new\(MAX_CONNECTIONS\)/);
  assert.match(bridge, /PAIR_TTL_SECS/);
  assert.match(bridge, /completed\.remove\(id\)/);
  assert.match(bridge, /Invalid companion host/);
});

test('browser never transmits its reusable pairing key', () => {
  assert.doesNotMatch(client, /Authorization:\s*`Bearer/);
  assert.match(client, /X-Halcyon-Nonce/);
  assert.match(client, /X-Halcyon-Proof/);
  assert.match(client, /verifyHmac/);
  assert.match(bridge, /header_read_timeout/);
  assert.match(bridge, /Limited::new/);
});

test('Docker keeps Steam outside the container boundary', () => {
  const compose = readFileSync(new URL('docker-compose.yml', root), 'utf8');
  assert.doesNotMatch(compose, /docker\.sock|\/proc:\/proc|steamLoginSecure/);
  assert.match(compose, /optional companion/);
});
