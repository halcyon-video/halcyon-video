// TextureArrayManager unit tests: layer banking, low-res atlas indexing,
// usesHighResOnly in overflow mode, loaded flags, and fallback pixels.
//
// Runs under plain `node --test` with type stripping.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textureArrayManager, invalidatePosterLayers } from '../src/poster-textures.ts';

test('single bank mode: lowResBase is 0 and usesHighResOnly is false', () => {
  invalidatePosterLayers();
  // 500 titles < FALLBACK_BANK_LAYERS (2048) -> single bank mode
  textureArrayManager.init(500);

  assert.equal(textureArrayManager.lowResBase, 0);
  assert.equal(textureArrayManager.shortfall, 0);

  const idx = textureArrayManager.getIndex('movie-1');
  assert.equal(idx, 0);
  assert.equal(textureArrayManager.usesHighResOnly('movie-1'), false);
  assert.equal(textureArrayManager.hasArt('movie-1'), false);
  assert.equal(textureArrayManager.hasHighRes('movie-1'), false);

  textureArrayManager.setLowResLoaded('movie-1', true);
  assert.equal(textureArrayManager.hasArt('movie-1'), true);
  assert.equal(textureArrayManager.hasHighRes('movie-1'), false);

  textureArrayManager.setHighResLoaded('movie-1', true);
  assert.equal(textureArrayManager.hasArt('movie-1'), true);
  assert.equal(textureArrayManager.hasHighRes('movie-1'), true);
});

test('overflow mode: first-bank titles are usesHighResOnly, second-bank titles are not', () => {
  invalidatePosterLayers();
  // 3000 titles > FALLBACK_BANK_LAYERS (2048) -> triggers overflow mode
  textureArrayManager.init(3000);

  assert.equal(textureArrayManager.bankSize, 2048);
  assert.equal(textureArrayManager.lowResBase, 2048);

  // Mint index 0 (first bank)
  const idx0 = textureArrayManager.getIndex('movie-0');
  assert.equal(idx0, 0);
  assert.equal(textureArrayManager.usesHighResOnly('movie-0'), true);

  // Mint up to bankSize (2048)
  for (let i = 1; i < 2048; i++) {
    textureArrayManager.getIndex(`movie-${i}`);
  }
  assert.equal(textureArrayManager.usesHighResOnly('movie-2047'), true);

  // Mint a second-bank (overflow low-res atlas) title at index 2048
  const overflowIdx = textureArrayManager.getIndex('movie-2048');
  assert.equal(overflowIdx, 2048);
  assert.equal(textureArrayManager.usesHighResOnly('movie-2048'), false);
});

test('budget exhaustion assigns unpaintedIndex and reports shortfall', () => {
  invalidatePosterLayers();
  // layerBudget with FALLBACK_BANK_LAYERS (2048) is 2048 + 2048 * 64 = 133120
  const maxBudget = 2048 + 2048 * 64;
  textureArrayManager.init(maxBudget + 50);

  assert.equal(textureArrayManager.layerBudget, maxBudget);
  assert.equal(textureArrayManager.shortfall, 50);
  assert.equal(textureArrayManager.unpaintedIndex, textureArrayManager.maxMovies);
  assert.equal(textureArrayManager.maxMovies, maxBudget);
});

test('getFallbackPixels extracts tile from low-res atlas and slice from high-res', () => {
  invalidatePosterLayers();
  // In overflow mode (>2048 titles):
  // movie-0 in bank 1 (idx 0 < 2048 -> high-res array only)
  // movie-2048 in bank 2 (idx 2048 >= 2048 -> low-res atlas)
  textureArrayManager.init(2500);

  textureArrayManager.getIndex('movie-0');
  textureArrayManager.setHighResLoaded('movie-0', true);

  // Populate synthetic pixels in highResArray CPU mirror for layer 0
  const highResData = textureArrayManager.highResArray!.image.data as Uint8Array;
  highResData.fill(42, 0, 160 * 240 * 4);

  const fallback0 = textureArrayManager.getFallbackPixels('movie-0');
  assert.ok(fallback0);
  assert.equal(fallback0.w, 160);
  assert.equal(fallback0.h, 240);
  assert.equal(fallback0.data[0], 42);

  // Mint up to movie-2048
  for (let i = 1; i <= 2048; i++) textureArrayManager.getIndex(`movie-${i}`);
  textureArrayManager.setLowResLoaded('movie-2048', true);

  const lowResData = textureArrayManager.lowResArray!.image.data as Uint8Array;
  lowResData.fill(99, 0, 512 * 768 * 4);

  const fallback2048 = textureArrayManager.getFallbackPixels('movie-2048');
  assert.ok(fallback2048);
  assert.equal(fallback2048.w, 64);
  assert.equal(fallback2048.h, 96);
  assert.equal(fallback2048.data[0], 99);
});
