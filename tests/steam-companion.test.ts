import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const provider = readFileSync(new URL('src/providers/steam-provider.ts', root), 'utf8');
const bridge = readFileSync(new URL('src-tauri/src/steam_companion.rs', root), 'utf8');

test('browser Steam is opt-in and has no owner-specific path', () => {
  assert.match(provider, /localStorage\.getItem\('steam_enabled'\) !== '1'/);
  assert.doesNotMatch(provider + bridge, /nobara-user|\/home\/devin|steam-preview/);
});

test('companion is loopback-only, paired, and does not expose Steam credentials', () => {
  assert.match(bridge, /127\.0\.0\.1:1421/);
  assert.match(bridge, /authorized\(&request, &state\)/);
  assert.match(bridge, /Access-Control-Allow-Private-Network/);
  assert.doesNotMatch(bridge, /webapi_token.*respond|steamLoginSecure.*respond/);
});

test('Docker keeps Steam outside the container boundary', () => {
  const compose = readFileSync(new URL('docker-compose.yml', root), 'utf8');
  assert.doesNotMatch(compose, /docker\.sock|\/proc:\/proc|steamLoginSecure/);
  assert.match(compose, /optional companion/);
});
