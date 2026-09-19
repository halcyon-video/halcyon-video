import test from 'node:test';
import assert from 'node:assert/strict';
import { DeferredModelLoads } from '../src/deferred-model-loads.ts';

function fixture() {
  const controller = new AbortController();
  const idle = new Set<() => void>();
  const errors: unknown[] = [];
  const queue = new DeferredModelLoads(controller.signal, work => {
    idle.add(work); return () => { idle.delete(work); };
  }, error => errors.push(error));
  const tick = async () => {
    const work = idle.values().next().value;
    if (work) { idle.delete(work); work(); }
    await new Promise(resolve => setImmediate(resolve));
  };
  return { queue, controller, idle, errors, tick };
}

test('no model request begins before entry release, then only one load runs at a time', async () => {
  const f = fixture(); const calls: string[] = []; let finish!: () => void;
  f.queue.enqueue(() => { calls.push('first'); return new Promise(resolve => { finish = resolve; }); });
  f.queue.enqueue(async () => { calls.push('second'); });
  await f.tick(); assert.deepEqual(calls, []); assert.equal(f.idle.size, 0);
  f.queue.release(); f.queue.release(); assert.equal(f.idle.size, 1);
  await f.tick(); assert.deepEqual(calls, ['first']); assert.equal(f.idle.size, 0);
  finish(); await f.tick(); assert.deepEqual(calls, ['first']);
  await f.tick(); assert.deepEqual(calls, ['first', 'second']);
});

test('fixture disposal before dequeue starts no fetch', async () => {
  const f = fixture(); let calls = 0;
  const cancel = f.queue.enqueue(async () => { calls++; });
  f.queue.release(); cancel(); await f.tick(); assert.equal(calls, 0);
});

test('scene teardown drops queued work and never releases another scene queue', async () => {
  const f = fixture(), other = fixture(); const calls: string[] = [];
  f.queue.enqueue(async () => { calls.push('old'); });
  other.queue.enqueue(async () => { calls.push('new'); });
  f.controller.abort(); f.queue.release(); await f.tick(); await other.tick();
  assert.deepEqual(calls, []);
  other.queue.release(); await other.tick(); assert.deepEqual(calls, ['new']);
});

test('teardown during an active load prevents the following load', async () => {
  const f = fixture(); const calls: string[] = []; let finish!: () => void;
  f.queue.enqueue(() => { calls.push('active'); return new Promise(resolve => { finish = resolve; }); });
  f.queue.enqueue(async () => { calls.push('queued'); });
  f.queue.release(); await f.tick(); f.controller.abort(); finish(); await f.tick(); await f.tick();
  assert.deepEqual(calls, ['active']); assert.equal(f.idle.size, 0);
});

test('a missing or failed detail does not prevent the next queued model', async () => {
  const f = fixture(); const failure = new Error('missing model'); let next = false;
  f.queue.enqueue(async () => { throw failure; });
  f.queue.enqueue(async () => { next = true; });
  f.queue.release(); await f.tick(); await f.tick();
  assert.deepEqual(f.errors, [failure]); assert.equal(next, true);
});

test('a cancelled scene never admits later requests', async () => {
  const f = fixture(); let calls = 0; f.controller.abort();
  f.queue.enqueue(async () => { calls++; }); f.queue.release(); await f.tick();
  assert.equal(calls, 0); assert.equal(f.idle.size, 0);
});


test('release before any fixtures exist also admits later detail requests', async () => {
  const f = fixture(); let calls = 0;
  f.queue.release(); await f.tick(); assert.equal(f.idle.size, 0);
  f.queue.enqueue(async () => { calls++; }); await f.tick();
  assert.equal(calls, 1);
});
