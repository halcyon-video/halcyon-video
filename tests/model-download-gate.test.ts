import test from 'node:test';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Record loads instead of fetching; the gate wraps whatever load it finds.
const started: string[] = [];
GLTFLoader.prototype.load = function (url: string) { started.push(url); } as GLTFLoader['load'];
const { holdModelDownloads, modelDownloadsHeld } = await import('../src/model-download-gate.ts');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('model loads wait for the held download, then start in order', async () => {
  started.length = 0;
  let arrive!: () => void;
  holdModelDownloads(new Promise<void>(resolve => { arrive = resolve; }));
  const loader = new GLTFLoader();
  loader.load('a.glb', () => {});
  loader.load('b.glb', () => {});
  await flush();
  assert.deepEqual(started, []);
  assert.equal(modelDownloadsHeld(), true);
  arrive(); await flush();
  assert.deepEqual(started, ['a.glb', 'b.glb']);
  assert.equal(modelDownloadsHeld(), false);
  loader.load('c.glb', () => {});
  assert.deepEqual(started, ['a.glb', 'b.glb', 'c.glb']);
});

test('a failed or stalled held download never strands model loads', async () => {
  started.length = 0;
  holdModelDownloads(Promise.reject(new Error('404')));
  new GLTFLoader().load('a.glb', () => {});
  await flush();
  assert.deepEqual(started, ['a.glb']);

  started.length = 0;
  holdModelDownloads(new Promise(() => {}), 5);
  new GLTFLoader().load('b.glb', () => {});
  await flush();
  assert.deepEqual(started, []);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(started, ['b.glb']);
  assert.equal(modelDownloadsHeld(), false);
});
