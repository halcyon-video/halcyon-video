import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
const { decodeModelBytes, fetchModelBytes } = await import('../src/compressed-models.ts');

const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 9, 9, 9]);
const buffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

test('gzip twins decode to the original glTF bytes', async () => {
  const decoded = await decodeModelBytes(buffer(gzipSync(glb)));
  assert.deepEqual(new Uint8Array(decoded!), glb);
});

test('a host-decoded twin passes through; an HTML fallback page is rejected', async () => {
  assert.deepEqual(new Uint8Array((await decodeModelBytes(buffer(glb)))!), glb);
  assert.equal(await decodeModelBytes(buffer(new TextEncoder().encode('<!doctype html>'))), null);
});

test('fetch prefers the twin and falls back to the plain model', async () => {
  const requested: string[] = [];
  const serve = (twin: Uint8Array | null) => {
    globalThis.fetch = (async (url: string) => {
      requested.push(url);
      if (url.endsWith('.gz')) return twin ? new Response(twin) : new Response('missing', { status: 404 });
      return new Response(glb);
    }) as typeof fetch;
  };
  serve(gzipSync(glb));
  assert.deepEqual(new Uint8Array(await fetchModelBytes('models/a.glb', undefined, true)), glb);
  assert.deepEqual(requested, ['models/a.glb.gz']);
  requested.length = 0; serve(null);
  assert.deepEqual(new Uint8Array(await fetchModelBytes('models/a.glb', undefined, true)), glb);
  assert.deepEqual(requested, ['models/a.glb.gz', 'models/a.glb']);
  requested.length = 0; serve(gzipSync(glb));
  await fetchModelBytes('models/a.glb', undefined, false);
  assert.deepEqual(requested, ['models/a.glb']);
});
