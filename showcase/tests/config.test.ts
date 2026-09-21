import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const check = (extra: Record<string,string>) => spawnSync(process.execPath, ['astro.config.mjs'], { cwd: new URL('../', import.meta.url), env: {...process.env, SHOWCASE_ORIGIN: '', SHOWCASE_DEPLOY_TARGET: 'preview', ...extra}, encoding:'utf8' });
test('unowned origin is not assumed and production cannot silently deploy fixtures', () => {
  assert.equal(check({}).status, 0);
  const production = check({SHOWCASE_DEPLOY_TARGET:'production'});
  assert.notEqual(production.status, 0); assert.match(production.stderr, /Production requires/);
});
test('canonical origin refuses credentials, insecure scheme and injected paths', () => {
  for (const origin of ['http://example.org', 'https://user:password@example.org', 'https://example.org/path', 'https://example.org/?key=secret']) assert.notEqual(check({SHOWCASE_ORIGIN:origin}).status, 0);
  assert.equal(check({SHOWCASE_ORIGIN:'https://example.org'}).status, 0);
});
