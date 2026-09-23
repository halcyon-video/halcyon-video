import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const root = new URL('../dist/', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const manifest = JSON.parse(read('data/manifest.json'));
test('manifest, pages and search share the validated snapshot identity', () => {
  const fixture = readFileSync(new URL('../fixtures/catalog.json', import.meta.url));
  assert.equal(manifest.snapshotHash, createHash('sha256').update(fixture).digest('hex'));
  let count = 0;
  for (const path of [...manifest.pages, manifest.search]) {
    const data = JSON.parse(read(path.slice(1)));
    for (const field of ['schemaVersion','snapshotVersion','snapshotHash','region','checkedAt']) assert.equal(data[field], manifest[field]);
    if (data.page) { assert.ok(data.titles.length <= 24); count += data.titles.length; }
  }
  assert.equal(count, manifest.count);
  const search = JSON.parse(read(manifest.search.slice(1)));
  assert.deepEqual(search.titles.map(title => title.key), ['movie:1', 'tv:1']);
  assert.ok(gzipSync(read(manifest.search.slice(1))).length < 250 * 1024);
});
test('all routes are static and noindex, without browser scripts or 3D assets', () => {
  const walk = (url) => readdirSync(url).flatMap(name => { const child = new URL(name, url); return statSync(child).isDirectory() ? walk(new URL(name+'/',url)) : [child]; });
  const files = walk(root);
  assert.ok(files.every(file => !/\.(?:m?js|glb|gltf|wasm|mp4|hdr)$/.test(file.pathname)));
  const paths = ['index.html','browse/index.html','title/movie/1/index.html','title/tv/1/index.html','about/index.html','store/index.html','self-host/index.html','404.html'];
  for (const path of paths) {
    const html = read(path).toString();
    assert.match(html, /noindex/);
    assert.match(html, /fictional sample titles/);
    assert.doesNotMatch(html, /<script\b|rel="(?:prefetch|preload|modulepreload)"|<iframe\b/);
  }
  assert.match(read('title/movie/1/index.html').toString(), /The Last Picture House/);
  assert.match(read('title/tv/1/index.html').toString(), /Midnight Matinee/);
});
