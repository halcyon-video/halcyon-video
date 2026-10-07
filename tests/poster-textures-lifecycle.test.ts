import test from 'node:test';
import assert from 'node:assert/strict';
import type * as THREE from 'three';
import { textureArrayManager as arrays, setCaseMaterialUniformProvider, setUploadRenderer,
  releaseUploadRenderer, setUploadTurbo } from '../src/poster-textures.ts';

const renderer = {
  capabilities: { getMaxAnisotropy: () => 1 },
  getContext: () => ({ MAX_ARRAY_TEXTURE_LAYERS: 0x88ff, getParameter: () => 128 }),
} as unknown as THREE.WebGLRenderer;

function uniforms() {
  return { lowResMapArray: { value: null as unknown }, highResMapArray: { value: null as unknown },
    posterLowResBase: { value: 0 }, highResLoadedTex: { value: null as unknown }, maxMoviesCount: { value: 0 } };
}

test('full teardown drops CPU mirrors and shader references and can initialize again', () => {
  const u = uniforms();
  setCaseMaterialUniformProvider(() => [{ userData: { compiledUniformsList: [u] } }]);
  try {
    arrays.init(3, renderer);
    arrays.getIndex('retired-title');
    const low = arrays.lowResArray!, high = arrays.highResArray!, flags = arrays.loadedFlagsTexture!;
    let released = 0;
    for (const texture of [low, high, flags]) texture.addEventListener('dispose', () => released++);
    arrays.dispose(); arrays.dispose();
    assert.equal(released, 3);
    assert.equal(arrays.lowResArray, null); assert.equal(arrays.highResArray, null);
    assert.equal(arrays.loadedFlagsTexture, null); assert.equal(arrays.loadedFlags, null);
    assert.equal(arrays.maxMovies, 0); assert.equal(arrays.hasLayer('retired-title'), false);
    assert.equal(u.lowResMapArray.value, null); assert.equal(u.highResMapArray.value, null);
    assert.equal(u.highResLoadedTex.value, null);
    arrays.init(2, renderer);
    assert.notEqual(arrays.highResArray, high); assert.notEqual(arrays.lowResArray, low);
    assert.equal(arrays.getIndex('replacement-title'), 0);
    assert.equal(u.highResMapArray.value, arrays.highResArray);
  } finally { arrays.dispose(); setCaseMaterialUniformProvider(() => []); }
});

test('queued atlas uploads survive same-allocation rebuild but stop at full teardown', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalUpdate = arrays.updateLowRes;
  const frames: FrameRequestCallback[] = [], applied: string[] = [];
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  arrays.updateLowRes = (_renderer, title) => { applied.push(title); };
  setUploadTurbo(true);
  try {
    arrays.init(1, renderer); setUploadRenderer(renderer);
    arrays.queueLowRes(renderer, 'retired-title', new Uint8Array(64 * 96 * 4));
    arrays.queueHighRes(renderer, 'retired-title', new Uint8Array(320 * 480 * 4));
    arrays.dispose(); arrays.init(1, renderer);
    arrays.queueLowRes(renderer, 'replacement-title', new Uint8Array(64 * 96 * 4));
    const mirror = arrays.highResArray;
    arrays.init(1, renderer);
    assert.equal(arrays.highResArray, mirror);
    while (frames.length) frames.shift()!(performance.now());
    assert.deepEqual(applied, ['replacement-title']);
    assert.equal(arrays.hasLayer('retired-title'), false);
    assert.equal(arrays.hasArt('replacement-title'), true);
  } finally {
    releaseUploadRenderer(renderer); arrays.dispose(); setUploadTurbo(false);
    arrays.updateLowRes = originalUpdate;
    globalThis.requestAnimationFrame = originalRaf;
  }
});
