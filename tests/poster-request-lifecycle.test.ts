import test from 'node:test';
import assert from 'node:assert/strict';
import { guardPosterRequest } from '../src/poster-request-lifecycle.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('cleared decode cannot publish or consume replacement callbacks', async () => {
  const oldCallbacks: string[] = [], newCallbacks: string[] = [];
  const requests = new Map([['title', oldCallbacks]]);
  const oldDecode = deferred<string>(), newDecode = deferred<string>();
  const uploads: Array<() => void> = [];
  const publish = (request: string[], pixels: string) => {
    uploads.push(guardPosterRequest(requests, 'title', request, () => {
      request.push(pixels); requests.delete('title');
    }));
  };
  const oldTask = oldDecode.promise.then(guardPosterRequest(requests, 'title', oldCallbacks,
    (pixels: string) => publish(oldCallbacks, pixels)));
  requests.clear(); requests.set('title', newCallbacks);
  const newTask = newDecode.promise.then(guardPosterRequest(requests, 'title', newCallbacks,
    (pixels: string) => publish(newCallbacks, pixels)));
  oldDecode.resolve('old-medium'); await oldTask;
  assert.equal(uploads.length, 0);
  assert.equal(requests.get('title'), newCallbacks);
  newDecode.resolve('new-medium'); await newTask;
  uploads.shift()!();
  assert.deepEqual(oldCallbacks, []); assert.deepEqual(newCallbacks, ['new-medium']);
  assert.equal(requests.size, 0);
});

test('upload queued before a clear cannot revive pixels or delete the new request', () => {
  const oldRequest = {}, replacement = {};
  const requests = new Map([['title', oldRequest]]);
  const pixels: string[] = [];
  const upload = guardPosterRequest(requests, 'title', oldRequest, () => {
    pixels.push('old-medium'); requests.delete('title');
  });
  requests.clear(); requests.set('title', replacement);
  upload();
  assert.deepEqual(pixels, []); assert.equal(requests.get('title'), replacement);
});

test('stale failure leaves the replacement registered and current fan-out runs once', async () => {
  const oldRequest = {}, replacement = {};
  const requests = new Map([['title', oldRequest]]);
  const oldDecode = deferred<string>();
  let failures = 0, callbacks = 0;
  const failure = oldDecode.promise.catch(guardPosterRequest(requests, 'title', oldRequest,
    () => { failures++; requests.delete('title'); }));
  requests.clear(); requests.set('title', replacement);
  oldDecode.reject(new Error('retired decode')); await failure;
  assert.equal(failures, 0); assert.equal(requests.get('title'), replacement);
  const completion = guardPosterRequest(requests, 'title', replacement, () => {
    requests.delete('title'); callbacks += 2;
  });
  completion(); completion();
  assert.equal(callbacks, 2); assert.equal(requests.size, 0);
});
