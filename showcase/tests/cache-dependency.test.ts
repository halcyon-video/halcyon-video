import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// SECURITY-STATUS.md records why http-cache-semantics (GHSA-ch52-4w7c-c8xp) is not reachable.
// These checks fail if that reasoning stops being true.
const root = new URL('..', import.meta.url).pathname;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

test('Astro never asks the cache library whether a request is served without revalidation', () => {
  // Both methods contain the max-stale branch; satisfiesWithoutRevalidation delegates to evaluateRequest.
  const files = walk(join(root, 'node_modules/astro/dist')).filter((file) => file.endsWith('.js'));
  const users = files.filter((file) => /satisfiesWithoutRevalidation|evaluateRequest/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(users, []);
});

test('the showcase source does not use Astro remote image processing', () => {
  const files = walk(join(root, 'src')).filter((file) => /\.(astro|ts|mjs)$/.test(file));
  const users = files.filter((file) => /astro:assets|getImage\(|<Image\b|<Picture\b/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(users, []);
});
