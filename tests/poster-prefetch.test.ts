import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { setExternalGameActive } from '../src/external-game-state.ts';
import {
  clearPosterPrefetch, prefetchPosterBytes, prefetchedPosterCount,
  takePrefetchedPosterBytes, whenCoverPrefetchIdle,
} from '../src/poster-prefetch.ts';

interface Request {
  url: string;
  succeed: (bytes?: Uint8Array) => void;
  fail: () => void;
}
const originalFetch = globalThis.fetch;
const requests: Request[] = [];
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const urls = (count: number) => Array.from({ length: count }, (_, i) => `https://covers.example/${i}.jpg`);

beforeEach(() => {
  setExternalGameActive(false);
  clearPosterPrefetch();
  requests.length = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const signal = init?.signal;
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    requests.push({
      url: String(input),
      succeed: (bytes = new Uint8Array([7, 8])) => {
        signal?.removeEventListener('abort', abort);
        resolve({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as Response);
      },
      fail: () => {
        signal?.removeEventListener('abort', abort);
        reject(new Error('Cover unavailable'));
      },
    });
    if (signal?.aborted) abort();
  })) as typeof fetch;
});

afterEach(async () => {
  clearPosterPrefetch();
  setExternalGameActive(false);
  await whenCoverPrefetchIdle();
  globalThis.fetch = originalFetch;
});

test('a queued cover consumer waits for its single prefetch and receives independent transferable copies', async () => {
  const covers = urls(9);
  assert.equal(prefetchPosterBytes([...covers, covers[8]], url => url), 9);
  await tick();
  assert.equal(requests.length, 8);
  let settled = false;
  const first = takePrefetchedPosterBytes(covers[8])!;
  void first.then(() => { settled = true; });
  const second = takePrefetchedPosterBytes(covers[8])!;
  await tick();
  assert.equal(settled, false, 'a queued URL must not fall through to a duplicate direct fetch');
  requests[0].succeed();
  await tick();
  assert.equal(requests.length, 9);
  assert.equal(requests.filter(request => request.url === covers[8]).length, 1);
  requests[8].succeed();
  const [a, b] = await Promise.all([first, second]);
  assert.ok(a && b);
  assert.notEqual(a, b);
  assert.deepEqual([...new Uint8Array(a)], [7, 8]);
  new Uint8Array(a)[0] = 99;
  assert.deepEqual([...new Uint8Array(b)], [7, 8]);
  assert.deepEqual([...new Uint8Array((await takePrefetchedPosterBytes(covers[8]))!)], [7, 8]);
});

test('failed prefetch settles existing consumers and permits the normal retry path', async () => {
  const [url] = urls(1);
  prefetchPosterBytes([url], value => value);
  const handoff = takePrefetchedPosterBytes(url)!;
  await tick();
  requests[0].fail();
  assert.equal(await handoff, null);
  assert.equal(takePrefetchedPosterBytes(url), undefined);
  assert.equal(prefetchedPosterCount(), 0);
});

test('clearing a queue settles waiting consumers and old pumps cannot clobber a new prefetch', async () => {
  const covers = urls(9);
  prefetchPosterBytes(covers, url => url);
  await tick();
  const oldHandoff = takePrefetchedPosterBytes(covers[8])!;
  const oldRequests = requests.slice();
  clearPosterPrefetch();
  assert.equal(await oldHandoff, null);
  assert.equal(prefetchPosterBytes([covers[8]], url => url), 1);
  const newHandoff = takePrefetchedPosterBytes(covers[8])!;
  await tick();
  oldRequests.forEach(request => request.succeed(new Uint8Array([1])));
  await tick();
  assert.equal(requests.filter(request => request.url === covers[8]).length, 1);
  requests[8].succeed(new Uint8Array([42]));
  assert.deepEqual([...new Uint8Array((await newHandoff)!)], [42]);
  assert.deepEqual([...new Uint8Array((await takePrefetchedPosterBytes(covers[8]))!)], [42]);
});

test('the byte-budget cutoff settles covers still waiting for a network slot', async () => {
  const covers = urls(10);
  prefetchPosterBytes(covers, url => url);
  await tick();
  const waiting = [takePrefetchedPosterBytes(covers[8])!, takePrefetchedPosterBytes(covers[9])!];
  requests[0].succeed(new Uint8Array(48 * 1024 * 1024));
  await tick();
  assert.deepEqual(await Promise.all(waiting), [null, null]);
  assert.equal(requests.length, 8);
  assert.equal(takePrefetchedPosterBytes(covers[8]), undefined);
});

test('a consumer promotes its late queued cover ahead of unused speculative downloads', async () => {
  const covers = urls(11);
  prefetchPosterBytes(covers, url => url);
  await tick();
  assert.equal(requests.length, 8);
  const wanted = takePrefetchedPosterBytes(covers[10])!;
  requests[0].succeed();
  await tick();
  assert.equal(requests[8].url, covers[10]);
  requests[8].succeed(new Uint8Array([10]));
  assert.deepEqual([...new Uint8Array((await wanted)!)], [10]);
  assert.equal(requests.filter(request => request.url === covers[10]).length, 1);
});

test('simultaneous pump completions consume the single remaining URL once', async () => {
  const covers = urls(9);
  prefetchPosterBytes(covers, url => url);
  await tick();
  assert.equal(requests.length, 8);
  const last = takePrefetchedPosterBytes(covers[8])!;
  requests.slice().forEach(request => request.succeed());
  await tick();
  assert.equal(requests.length, 9);
  assert.equal(requests[8].url, covers[8]);
  requests[8].succeed(new Uint8Array([9]));
  assert.deepEqual([...new Uint8Array((await last)!)], [9]);
  await whenCoverPrefetchIdle();
  assert.equal(new Set(requests.map(request => request.url)).size, 9);
});

test('clearing paused pumps settles their handoffs and resuming cannot start cancelled URLs', async () => {
  const covers = urls(9);
  setExternalGameActive(true);
  prefetchPosterBytes(covers, url => url);
  const cancelled = takePrefetchedPosterBytes(covers[8])!;
  await tick();
  assert.equal(requests.length, 0);
  clearPosterPrefetch();
  assert.equal(await cancelled, null);
  setExternalGameActive(false);
  await whenCoverPrefetchIdle();
  assert.equal(requests.length, 0);
  assert.equal(prefetchedPosterCount(), 0);
  prefetchPosterBytes([covers[8]], url => url);
  const restarted = takePrefetchedPosterBytes(covers[8])!;
  await tick();
  assert.equal(requests.length, 1);
  requests[0].succeed(new Uint8Array([42]));
  assert.deepEqual([...new Uint8Array((await restarted)!)], [42]);
});
