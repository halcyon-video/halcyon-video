// ─── Poster GPU upload pipeline ────────────────────────────────────────────
//
// Everything between "decoded poster pixels exist on the CPU" and "the shelf
// shader can sample them": the budgeted texture-upload queue, the CPU mip-chain
// builder, the raw texSubImage3D layer streamer, and TextureArrayManager — the
// movieId -> array-layer allocator that owns the low/high-res DataArrayTextures
// and the loaded-flags LUT the case shaders read.
//
// Extracted from video-case.ts (file-budget ceiling): that module still owns
// poster DECODE, case art and materials, and re-exports this module's API for
// its existing consumers.
//
// The one dependency pointing back at video-case is the pair of persisted
// global case materials whose compiled uniforms hold the array references —
// injected via setCaseMaterialUniformProvider() rather than imported, so the
// two modules don't form a cycle.

import * as THREE from 'three';
import { perfTrace, perfSlot } from './perf-trace.ts';

const SP_UPLOAD = perfSlot('texUploadMs');  // uploadTextureNow (initTexture + mipmaps)
const CT_UPLOAD = perfSlot('texUploadN');
const SP_ARRAYUP = perfSlot('arrayLayerMs'); // texture-array layer streams (all mips, texSubImage3D)
const CT_ARRAYUP = perfSlot('arrayLayerN');

/**
 * Supplies the persisted global case materials (regular + animated fronts)
 * whose `userData.compiledUniformsList` entries hold the array/LUT uniforms.
 * video-case.ts registers this at module load; until then binding is a no-op.
 */
let caseMaterialUniformProvider: (() => any[]) | null = null;
export function setCaseMaterialUniformProvider(fn: () => any[]) {
  caseMaterialUniformProvider = fn;
}

// Two lanes, drained priority-first. Bulk cache-hit re-uploads (a rebuild, or
// walking back onto an already-decoded shelf) go in the normal lane; freshly
// DECODED posters go in the priority lane, because their task is what fires the
// poster's settle callback — and texturesReadyPromise (the boot overlay) waits
// on those. Letting a few hundred fresh decodes sit behind a few thousand
// re-uploads is what held the overlay up for the entire drain.
const priorityUploadQueue: Array<() => void> = [];
const textureUploadQueue: Array<() => void> = [];
const pendingUploads = () => priorityUploadQueue.length + textureUploadQueue.length;
let isUploading = false;

// Poster DataArrayTextures (low/high-res) are mip-mapped for distance LOD, but
// every layer upload goes through raw gl.texSubImage3D (see
// updateTextureArrayLayer) rather than three's normal upload path, so three
// never calls gl.generateMipmap() for us after the first allocation. WebGL has
// no per-layer generateMipmap either — regenerating on the GPU means the WHOLE
// array (hundreds of MB at library scale) per call, a frame-tanking stall that
// used to fire every 2s during a browse-driven streaming wave. Instead each
// layer's mip chain is box-filtered on the CPU (sub-millisecond at 160x240,
// inside the budgeted upload loop) and every level is uploaded explicitly, so
// streaming cost stays proportional to the posters actually streamed and
// gl.generateMipmap is never called after the array's first allocation.
//
// The per-level scratch buffers are shared across uploads (uploads run
// sequentially on the main thread), keyed by level-0 dimensions, so a
// streaming wave allocates nothing per poster.
const mipChainScratch = new Map<string, Array<{ data: Uint8Array; w: number; h: number }>>();

function getMipChainScratch(w: number, h: number): Array<{ data: Uint8Array; w: number; h: number }> {
  const key = `${w}x${h}`;
  let chain = mipChainScratch.get(key);
  if (!chain) {
    chain = [];
    // GL level-n dimensions: max(1, floor(level0 / 2^n)) — matches the mip
    // count three.js sized the texStorage3D allocation with.
    let cw = w, ch = h;
    while (cw > 1 || ch > 1) {
      cw = Math.max(1, cw >> 1);
      ch = Math.max(1, ch >> 1);
      chain.push({ data: new Uint8Array(cw * ch * 4), w: cw, h: ch });
    }
    mipChainScratch.set(key, chain);
  }
  return chain;
}

// 2x2 box filter (clamped at odd edges). Averages in sRGB space — technically
// generateMipmap on an sRGB texture filters in linear space, but at poster
// scale the difference is invisible and the table-free path stays cheap.
function boxFilterHalf(src: Uint8Array, sw: number, sh: number, dst: Uint8Array, dw: number, dh: number) {
  for (let y = 0; y < dh; y++) {
    const r0 = Math.min(y * 2, sh - 1) * sw;
    const r1 = Math.min(y * 2 + 1, sh - 1) * sw;
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.min(x * 2, sw - 1);
      const sx1 = Math.min(x * 2 + 1, sw - 1);
      const a = (r0 + sx0) << 2, b = (r0 + sx1) << 2, c = (r1 + sx0) << 2, d = (r1 + sx1) << 2;
      const o = (y * dw + x) << 2;
      dst[o] = (src[a] + src[b] + src[c] + src[d] + 2) >> 2;
      dst[o + 1] = (src[a + 1] + src[b + 1] + src[c + 1] + src[d + 1] + 2) >> 2;
      dst[o + 2] = (src[a + 2] + src[b + 2] + src[c + 2] + src[d + 2] + 2) >> 2;
      dst[o + 3] = (src[a + 3] + src[b + 3] + src[c + 3] + src[d + 3] + 2) >> 2;
    }
  }
}

// The renderer is registered here so the upload queue can force each texture's
// GPU upload + mipmap generation to happen *synchronously inside the budgeted
// loop* (via initTexture). Without this, three.js defers the upload to the next
// render() call, where all textures flagged that frame upload at once — causing
// the frame hitch we're trying to avoid. With it, the time budget below actually
// measures (and therefore throttles) the real GPU cost.
let uploadRenderer: THREE.WebGLRenderer | null = null;

export function setUploadRenderer(renderer: THREE.WebGLRenderer) {
  uploadRenderer = renderer;
}

/** The renderer uploads are issued against, or null before a scene exists. */
export function getUploadRenderer(): THREE.WebGLRenderer | null {
  return uploadRenderer;
}

// Wake hook for the render-on-demand loop (issue #24): loaded-flag flips land
// in queued upload tasks, possibly after the scene has settled back to IDLE —
// without a nudge the freshly-loaded covers would sit invisible until the
// next input. StoreScene registers requestRender() here.
// Called when a title's art actually becomes samplable (its loaded flag flips),
// as opposed to when it finished DECODING. The two are not the same moment:
// decode fires the poster callback, which re-dirties the slot, but the GPU
// upload is still sitting in the budgeted queue — so the dirty pass can run
// while hasArt() is still false and leave the cover box collapsed with nothing
// scheduled to un-collapse it. Cheap to ignore in the common case (a low-res
// upload lands within a frame or two of the decode); load-bearing at catalog
// scale, where the queue is thousands deep and a title can wait seconds.
let posterLoadedNotify: ((movieId: string) => void) | null = null;
export function setPosterLoadedNotify(cb: ((movieId: string) => void) | null) {
  posterLoadedNotify = cb;
}

let textureStreamWake: (() => void) | null = null;
export function setTextureStreamWake(cb: (() => void) | null) {
  textureStreamWake = cb;
}

/**
 * Fire the render-on-demand wake registered above, if any. TextureArrayManager's
 * setFlag() already calls this on every loaded-flag flip; this export lets other
 * CPU-cache-driven material swaps that DON'T go through the texture-array loaded
 * flags — hero/dedicated/fixture cases rebuilt straight from posterPixelCache
 * (video-case.ts's browse-bin loadShelfDetails, person-endcap cases, etc.) — reuse
 * the exact same nudge instead of each threading its own scene/requestRender
 * reference through a module that otherwise has none. Callers that DO have a
 * `scene` handy (store-inspect.ts, store-clerk-flow.ts) just call
 * scene.requestRender() directly, same as every other request in those files.
 */
export function wakeTextureStream() {
  textureStreamWake?.();
}

// Force a texture's GPU upload (and mipmap build) to happen now, so its cost is
// paid inside the budgeted loop rather than during the next scene render.
export function uploadTextureNow(texture: THREE.Texture) {
  if (uploadRenderer) {
    // Best-effort: forcing the upload here is only an optimization to keep the
    // cost inside the throttled loop. If it fails (lost/exhausted GL context),
    // swallow it — three.js will upload the texture normally on the next
    // render(). Letting it throw would abort caching the texture and firing its
    // callbacks, so that movie's cover would never appear.
    perfTrace.count(CT_UPLOAD);
    perfTrace.begin(SP_UPLOAD);
    try {
      uploadRenderer.initTexture(texture);
    } catch (err) {
      console.warn('uploadTextureNow(initTexture) failed; deferring to renderer:', err);
    } finally {
      perfTrace.end(SP_UPLOAD);
    }
  }
}

// Per-frame budget for GPU texture uploads. Each initTexture() upload + mipmap
// build of a 320x480 poster costs real GPU/main-thread time, so we cap how much
// of the frame we're willing to spend on it. Keeping this well under the ~16ms
// frame leaves headroom for the scene render and keeps interactions smooth even
// while many covers stream in.
// Normal (interactive) limits — keeps the render loop smooth.
const UPLOAD_BUDGET_MS = 4;
const UPLOAD_MAX_PER_FRAME = 4;
// Burst limits — used when the queue is large AND the user hasn't touched an
// input recently (initial boot wave, or streaming while standing still): drain
// fast, nobody is trying to move. Backs off automatically once the queue
// drains below the threshold.
const UPLOAD_BURST_BUDGET_MS = 12;
const UPLOAD_BURST_MAX_PER_FRAME = 16;
const UPLOAD_BURST_THRESHOLD = 20;
// Browsing produces near-continuous input, so this cooldown effectively locks
// the queue to the polite budget while the user is actually interacting —
// walking into a fresh aisle used to flip the queue into burst mode and spend
// 12ms/frame on uploads mid-walk.
const BURST_INPUT_COOLDOWN_MS = 2000;
let lastUserActivityTime = -Infinity;

/** InputManager funnels every keyboard/mouse/gamepad activity here. */
export function notifyUserActivity() {
  lastUserActivityTime = performance.now();
}

// Test-harness override (see harness.ts's ?fast=1): lift the per-frame caps so a
// headless software-GL run — where a frame can take seconds, making any per-FRAME
// cap glacial — drains the whole queue in a few frames. Interactive smoothness,
// which these caps protect, is irrelevant there.
let uploadTurbo = false;
export function setUploadTurbo(on: boolean) { uploadTurbo = on; }

// Set for the duration of a no-reload scene rebuild: nothing is interactive
// behind the boot overlay, so the queue should drain at burst rate immediately
// rather than waiting out BURST_INPUT_COOLDOWN_MS from the keypress that
// triggered the rebuild. Self-clearing — processUploads drops it when the
// queue empties, so a caller can never leave it stuck on.
let rebuildDraining = false;
export function beginRebuildDrain() { rebuildDraining = true; }

/** Upload tasks still queued — for verification scripts and boot diagnostics. */
export function pendingTextureUploads(): number { return pendingUploads(); }

function processUploads() {
  if (pendingUploads() === 0) {
    isUploading = false;
    rebuildDraining = false;
    return;
  }
  isUploading = true;

  // During a no-reload rebuild the store sits behind the boot overlay and the
  // user cannot interact with anything, so the polite interactive budget only
  // makes them wait longer. The input-idle test can't work that out on its own:
  // the keypress that closed the settings drawer is recent, so it would pin the
  // queue to 4/frame through the first two seconds of exactly the drain we want
  // to rush. Cleared in the empty branch above.
  const burst = rebuildDraining ||
    (pendingUploads() > UPLOAD_BURST_THRESHOLD &&
      performance.now() - lastUserActivityTime > BURST_INPUT_COOLDOWN_MS);
  const budget = uploadTurbo ? 1000 : burst ? UPLOAD_BURST_BUDGET_MS : UPLOAD_BUDGET_MS;
  const maxPerFrame = uploadTurbo ? Infinity : burst ? UPLOAD_BURST_MAX_PER_FRAME : UPLOAD_MAX_PER_FRAME;

  const start = performance.now();
  let count = 0;
  // Drain tasks until we exceed the time budget or the per-frame count cap.
  // Because the upload tasks now call uploadTextureNow() (initTexture), the
  // performance.now() check genuinely reflects GPU upload cost and throttles it.
  while (
    pendingUploads() > 0 &&
    count < maxPerFrame &&
    (count === 0 || performance.now() - start < budget)
  ) {
    const task = priorityUploadQueue.length > 0 ? priorityUploadQueue.shift() : textureUploadQueue.shift();
    // A task may throw (e.g. initTexture on a lost/exhausted GL context). It must
    // not propagate out of the loop: that would skip the reschedule below and
    // leave isUploading stuck true, permanently wedging every later upload so
    // those posters never load. Isolate each task so one failure is survivable.
    if (task) {
      try {
        task();
      } catch (err) {
        console.warn('Texture upload task failed:', err);
      }
    }
    count++;
  }

  // Both lanes, not just the bulk one: the loop above drains PRIORITY first,
  // so a frame that hits the per-frame cap on priority tasks alone (fresh
  // decodes of titles whose uploads were already queued push nothing into the
  // bulk lane) would leave the rest of that lane stranded with no rAF pending —
  // and those posters never flip their loaded flag, so their cover boxes sit
  // unpainted until some unrelated enqueue happens to restart the pump.
  if (pendingUploads() > 0) {
    requestAnimationFrame(processUploads);
  } else {
    isUploading = false;
  }
}

export function queueTextureUpload(task: () => void, lane: 'bulk' | 'priority' = 'bulk') {
  (lane === 'priority' ? priorityUploadQueue : textureUploadQueue).push(task);
  if (!isUploading) {
    // Defer the drain to the next rAF instead of running synchronously:
    // completions arriving one-per-event (e.g. 8 decode workers finishing a
    // wave in a single event-loop turn) used to each drain their own task
    // immediately — the queue never accumulated, the per-frame cap never
    // engaged, and perf-trace still caught 73 layer uploads in one frame.
    // One drain per frame, always, so the budget actually budgets.
    isUploading = true;
    requestAnimationFrame(processUploads);
  }
}

export function updateTextureArrayLayer(
  renderer: THREE.WebGLRenderer,
  arrayTexture: THREE.DataArrayTexture,
  layerIndex: number,
  pixelData: Uint8Array
) {
  perfTrace.count(CT_ARRAYUP);
  perfTrace.begin(SP_ARRAYUP);
  try {
    updateTextureArrayLayerImpl(renderer, arrayTexture, layerIndex, pixelData);
  } finally {
    perfTrace.end(SP_ARRAYUP);
  }
}

function updateTextureArrayLayerImpl(
  renderer: THREE.WebGLRenderer,
  arrayTexture: THREE.DataArrayTexture,
  layerIndex: number,
  pixelData: Uint8Array
) {
  // Always update the JS memory backing array first!
  // If Three.js hasn't allocated the GPU texture yet, our texSubImage3D call will fail, 
  // but Three.js will use this JS memory when it eventually allocates the texture.
  const layerSize = arrayTexture.image.width * arrayTexture.image.height * 4;
  const byteOffset = layerIndex * layerSize;
  if (arrayTexture.image.data) {
    arrayTexture.image.data.set(pixelData, byteOffset);
  }

  // In Three.js, initTexture() checks if texture.version > 0. If it is 0 (the default),
  // it returns early and does NOT create properties.__webglTexture.
  // Set version to 1 to force initialization.
  if (arrayTexture.version === 0) {
    arrayTexture.version = 1;
  }

  const properties = renderer.properties.get(arrayTexture) as any;
  let webglTexture = properties ? properties.__webglTexture : null;
  if (!webglTexture) {
    renderer.initTexture(arrayTexture);
    webglTexture = properties ? properties.__webglTexture : null;
    if (properties) {
      properties.__storageAllocated = true;
      properties.__version = arrayTexture.version;
    }
  }
  if (!webglTexture) {
    console.warn("Failed to retrieve __webglTexture from renderer properties.");
    return;
  }

  const gl = renderer.getContext() as WebGL2RenderingContext;
  
  // Save unpack parameters that aren't allowed for 3D textures/arrays in WebGL2
  const oldFlipY = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
  const oldPremultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  // We use the active texture unit, but we MUST tell Three.js to reset its state cache
  // afterwards because we are making raw WebGL calls that Three.js doesn't track.
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, webglTexture);

  try {
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0, // lod level
      0, // xoffset
      0, // yoffset
      layerIndex, // zoffset
      arrayTexture.image.width,
      arrayTexture.image.height,
      1, // depth
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixelData
    );
    // This raw texSubImage3D bypasses three's normal upload path entirely, so
    // three never sees a version bump and never calls gl.generateMipmap() for
    // us — and calling it ourselves would regenerate EVERY layer's mip chain
    // (there is no per-layer generateMipmap in WebGL). Box-filter this layer's
    // chain on the CPU and upload each level explicitly instead; the layer is
    // then renderable at every distance the moment this call returns.
    if (arrayTexture.generateMipmaps) {
      const chain = getMipChainScratch(arrayTexture.image.width, arrayTexture.image.height);
      let src = pixelData;
      let sw = arrayTexture.image.width;
      let sh = arrayTexture.image.height;
      for (let level = 0; level < chain.length; level++) {
        const mip = chain[level];
        boxFilterHalf(src, sw, sh, mip.data, mip.w, mip.h);
        gl.texSubImage3D(
          gl.TEXTURE_2D_ARRAY,
          level + 1,
          0, 0, layerIndex,
          mip.w, mip.h, 1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          mip.data
        );
        src = mip.data;
        sw = mip.w;
        sh = mip.h;
      }
    }
  } catch (err) {
    console.warn("WebGL upload deferred until Three.js allocation.", err);
  }

  // Restore unpack parameters
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, oldFlipY);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, oldPremultiply);

  // Restore Three.js state cache so it can re-bind textures correctly
  renderer.resetState();
}

// ── Low-res atlas tile writer ───────────────────────────────────────────────
// Same raw-GL contract as updateTextureArrayLayer above (mirror the CPU copy
// first, lazily initialize the GPU texture, reset three's state cache after)
// but writes a LOW_RES_TILE_W x LOW_RES_TILE_H sub-rectangle of one atlas
// layer instead of the whole layer — see the atlas note in the "Layer
// banking" section below. No mip chain to maintain: the atlas array is
// allocated with generateMipmaps=false, so there is nothing to box-filter
// after the base-level texSubImage3D.
export function updateAtlasTile(
  renderer: THREE.WebGLRenderer,
  arrayTexture: THREE.DataArrayTexture,
  layerIndex: number,
  tileX: number,
  tileY: number,
  pixelData: Uint8Array
) {
  perfTrace.count(CT_ARRAYUP);
  perfTrace.begin(SP_ARRAYUP);
  try {
    updateAtlasTileImpl(renderer, arrayTexture, layerIndex, tileX, tileY, pixelData);
  } finally {
    perfTrace.end(SP_ARRAYUP);
  }
}

function updateAtlasTileImpl(
  renderer: THREE.WebGLRenderer,
  arrayTexture: THREE.DataArrayTexture,
  layerIndex: number,
  tileX: number,
  tileY: number,
  pixelData: Uint8Array
) {
  const atlasW = arrayTexture.image.width;
  const tileW = LOW_RES_TILE_W;
  const tileH = LOW_RES_TILE_H;
  const xOffset = tileX * tileW;
  const yOffset = tileY * tileH;

  // Mirror into the CPU backing array first (same contract as
  // updateTextureArrayLayerImpl — see its opening comment): a tile is a
  // sub-rectangle of the layer rather than a contiguous run, so this copies
  // row by row instead of one flat .set().
  if (arrayTexture.image.data) {
    const dst = arrayTexture.image.data as Uint8Array;
    const layerByteOffset = layerIndex * atlasW * arrayTexture.image.height * 4;
    for (let row = 0; row < tileH; row++) {
      const dstOffset = layerByteOffset + ((yOffset + row) * atlasW + xOffset) * 4;
      const srcOffset = row * tileW * 4;
      dst.set(pixelData.subarray(srcOffset, srcOffset + tileW * 4), dstOffset);
    }
  }

  if (arrayTexture.version === 0) {
    arrayTexture.version = 1;
  }

  const properties = renderer.properties.get(arrayTexture) as any;
  let webglTexture = properties ? properties.__webglTexture : null;
  if (!webglTexture) {
    renderer.initTexture(arrayTexture);
    webglTexture = properties ? properties.__webglTexture : null;
    if (properties) {
      properties.__storageAllocated = true;
      properties.__version = arrayTexture.version;
    }
  }
  if (!webglTexture) {
    console.warn("Failed to retrieve __webglTexture from renderer properties (atlas tile).");
    return;
  }

  const gl = renderer.getContext() as WebGL2RenderingContext;

  const oldFlipY = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
  const oldPremultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, webglTexture);

  try {
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0, // lod level — the atlas array has exactly one
      xOffset, yOffset, layerIndex,
      tileW, tileH, 1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixelData
    );
  } catch (err) {
    console.warn("WebGL atlas tile upload deferred until Three.js allocation.", err);
  }

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, oldFlipY);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, oldPremultiply);
  renderer.resetState();
}

// Extracts one atlas tile's pixels back out of a layer's CPU mirror — the
// inverse of the row-copy in updateAtlasTileImpl. Used by getFallbackPixels,
// which needs a compact, standalone Uint8Array (not a view into the shared,
// multi-hundred-KB atlas layer buffer) to hand a soft-cover material.
function extractAtlasTile(
  atlasData: Uint8Array,
  atlasW: number,
  layerByteOffset: number,
  tileX: number,
  tileY: number,
  tileW: number,
  tileH: number
): Uint8Array {
  const out = new Uint8Array(tileW * tileH * 4);
  const xOffset = tileX * tileW;
  const yOffset = tileY * tileH;
  for (let row = 0; row < tileH; row++) {
    const srcOffset = layerByteOffset + ((yOffset + row) * atlasW + xOffset) * 4;
    out.set(atlasData.subarray(srcOffset, srcOffset + tileW * 4), row * tileW * 4);
  }
  return out;
}

// Scratch reuse: the result is consumed synchronously by texSubImage3D (GL
// copies the pixels during the call), and upload waves used to allocate a
// fresh 150KB buffer per layer — 70-layer waves showed up as multi-MB
// heap spikes followed by GC-pause hitches in perf-trace.
let downsampleScratch: Uint8Array | null = null;
function downsample320To160(src: Uint8Array): Uint8Array {
  const dst = (downsampleScratch ??= new Uint8Array(160 * 240 * 4));
  let dstIdx = 0;
  for (let y = 0; y < 240; y++) {
    const srcRowOffset = y * 2 * 320 * 4;
    for (let x = 0; x < 160; x++) {
      const srcIdx = srcRowOffset + x * 2 * 4;
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
      dstIdx += 4;
    }
  }
  return dst;
}

// Spare layers allocated beyond the current catalog so TextureArrayManager's
// rebuild fast path survives small catalog churn between rebuilds. Bounded
// cost even post-atlas: worst case (all headroom lands in the high-res bank
// or opens a fresh atlas layer) is ~178KB of array-texture backing per title
// (64x96 + 160x240, RGBA); in the common case the headroom's low-res share
// lands inside an atlas layer's existing rounding slack and costs nothing.
const LAYER_CHURN_HEADROOM = 64;

// Low-res ATLAS (issue #60): each GPU layer of the low-res bank packs an
// 8x8 grid of 64x96 tiles instead of one poster per layer, so the low-res
// bank's TITLE capacity is TILES_PER_ATLAS_LAYER (64x) its GPU layer count —
// for the same GL_MAX_ARRAY_TEXTURE_LAYERS ceiling and the same total byte
// footprint (one 512x768 layer is exactly 64 64x96 layers' worth of pixels).
// A poster's low-res "slot" (see lowResBase below) was always a bare layer
// index before; decomposing it into (layer, tileX, tileY) is confined to the
// write/read paths here plus samplePosterBank's low-res branch (video-case.ts)
// — getIndex() and every public method still hand out/accept a flat slot
// number, so no caller outside this file knows the atlas exists.
//
// The atlas array has NO mip chain (generateMipmaps: false) — mipmapping a
// shared atlas layer bleeds neighbor tiles into each other at every level
// past 0, and there is no per-tile mipmap in WebGL. The high-res bank keeps
// its full mip chain unchanged. Trading the low-res tier's distance-LOD
// filtering for correct colors is the right side of that trade: this bank
// only ever paints a title that would otherwise render with NO cover art at
// all (the progressive-preview use is on screen for a frame or two, and the
// overflow-bank use is titles past the old hard ceiling). samplePosterBank
// also clamps its UV a half-texel inside the tile so bilinear filtering can
// never sample across a tile boundary either.
const LOW_RES_TILE_W = 64;
const LOW_RES_TILE_H = 96;
const ATLAS_TILE_COLS = 8;
const ATLAS_TILE_ROWS = 8;
const TILES_PER_ATLAS_LAYER = ATLAS_TILE_COLS * ATLAS_TILE_ROWS; // 64
const ATLAS_LAYER_W = LOW_RES_TILE_W * ATLAS_TILE_COLS; // 512
const ATLAS_LAYER_H = LOW_RES_TILE_H * ATLAS_TILE_ROWS; // 768

// ── Layer banking ───────────────────────────────────────────────────────────
// GL_MAX_ARRAY_TEXTURE_LAYERS is a HARD driver ceiling on one array texture —
// 4096 on this store's Radeon, and as low as 256 in the WebGL2 spec. A catalog
// bigger than that used to fail silently in the worst possible way: three's
// texStorage3D call errored, every poster sampled an unallocated array, and the
// whole store rendered as bare rental shells while the console filled with
// "WebGL: too many errors". Measured with a 7.1k-title catalog (games-only mode
// over a full Romm library, which is what made a >4096 catalog reachable at
// all).
//
// The obvious fix — a second pair of sampler2DArrays and a branch — is NOT
// available: the case fragment shader is a MeshPhysicalMaterial in a room full
// of shadow-casting lights and already sits at exactly MAX_TEXTURE_IMAGE_UNITS
// (32 here). Measured, twice: adding two samplers and then even one failed to
// link with "FRAGMENT shader texture image units count exceeds
// MAX_TEXTURE_IMAGE_UNITS(32)", which silently invalidates the program and
// leaves the whole store unpainted. There is zero sampler headroom.
//
// So the two arrays we ALREADY bind become the two banks, and what a title
// spends changes with the catalog's size:
//
//   catalog <= bankSize  — unchanged from before. Every title owns one layer in
//                          the high-res array and one ATLAS TILE in the
//                          low-res array: the 64x96 tile paints first while
//                          the 160x240 layer streams (the progressive tier).
//   catalog >  bankSize  — the tiers split into a flat address space. Titles
//                          below bankSize live in the high-res array, titles
//                          above it in the low-res atlas (offset by
//                          `lowResBase`). Every title still gets a painted
//                          cover up to the new, much higher ceiling below;
//                          what's traded away past bankSize is the
//                          progressive tier — a case simply appears when its
//                          art lands — and the overflow titles' shelf art is
//                          64x96. The INSPECT and hero views are unaffected
//                          either way: those paint from posterPixelCache at
//                          full 320x480, not from these arrays.
//
// Distance LOD comes from the high-res array's mip chain; the low-res atlas
// has none (see the atlas note above the tile constants) — a deliberate,
// disclosed trade, not an oversight. The loaded-flags LUT stays single and
// globally indexed (a plain 2D texture bounded by MAX_TEXTURE_SIZE = 32768,
// nowhere near binding), and its existing 255/128 values are exactly the
// "which array" signal the shader needs.
//
// Ceiling: bankSize (high-res) + bankSize x TILES_PER_ATLAS_LAYER (low-res
// atlas) titles — e.g. 4096 + 4096*64 = 266240 on a 4096-layer driver, vs the
// old 8192. Past that a title gets no layer and shelves unpainted — see
// getIndex. This is also the number the counter-terminal shortfall notice
// reports against (see counter-terminal.ts's #60 note).
// Fallback bank size when no renderer is on hand to ask (headless/asset-viewer
// paths that allocate before a context exists). 2048 is the smallest layer
// count in real-world WebGL2 use.
const FALLBACK_BANK_LAYERS = 2048;

function maxArrayLayers(renderer?: THREE.WebGLRenderer): number {
  // Dev/test override (issue #60 verification): reproduce a specific driver's
  // GL_MAX_ARRAY_TEXTURE_LAYERS — 2048 is the common Windows/ANGLE figure —
  // on hardware that reports a different real value, so the surfaced-
  // shortfall path below can be exercised without building a catalog large
  // enough to exceed this machine's actual (8192-class) budget. Never set in
  // the shipped app; `--set bb_debug_layer_cap=<n>` from tools/shot.mjs.
  if (typeof localStorage !== 'undefined') {
    const override = Number(localStorage.getItem('bb_debug_layer_cap'));
    if (override > 0) return override;
  }
  const gl = renderer?.getContext() as WebGL2RenderingContext | undefined;
  const limit = gl?.getParameter?.(gl.MAX_ARRAY_TEXTURE_LAYERS);
  return typeof limit === 'number' && limit > 0 ? limit : FALLBACK_BANK_LAYERS;
}

// Set when the decoded poster pixels themselves become invalid (a medium /
// box-art / cover-scan change re-decodes every poster with different
// letterboxing), so the array layers on hand no longer match the catalog and
// TextureArrayManager.init must genuinely reallocate rather than reuse.
let posterLayersInvalid = true;

/** Force the next TextureArrayManager.init() to reallocate from scratch. */
export function invalidatePosterLayers() {
  posterLayersInvalid = true;
}

class TextureArrayManager {
  private movieToIndex = new Map<string, number>();
  private nextIndex = 0;
  public maxMovies = 0;
  /** Layers per bank — the driver's MAX_ARRAY_TEXTURE_LAYERS (see above). */
  public bankSize = FALLBACK_BANK_LAYERS;
  /**
   * Global index the LOW-RES array starts addressing from. 0 while the catalog
   * fits one bank (both arrays hold every title, the progressive tier); equal
   * to bankSize once it overflows, when the low-res array becomes the second
   * bank rather than the first bank's preview. The shader subtracts it.
   */
  public lowResBase = 0;
  /**
   * LUT slot that is never minted to any title, so its loaded flag stays 0 for
   * the life of the allocation. getIndex() hands it to titles past the layer
   * budget: the shader reads "no art here" and paints the house rental wrap
   * instead of whatever title happens to own layer 0.
   */
  public unpaintedIndex = 0;
  private layerBudgetWarned = false;
  /**
   * Titles beyond the poster layer budget on the CURRENT catalog (0 = no
   * shortfall). Settled synchronously inside init(), straight off the
   * `totalMovies` argument — layers themselves mint lazily as slots build
   * (see getIndex), but this number does not: it does not depend on how many
   * layers have actually been minted yet, only on the catalog size and the
   * budget, both known the instant init() is called. Safe to read any time
   * after a store build starts (see entrance/index.ts's refreshIdleTerminal,
   * called once buildAllMovieBoxes() returns) — see counter-terminal #60.
   */
  public shortfall = 0;
  /** The poster layer budget `shortfall` (if any) was measured against. */
  public layerBudget = 0;

  public lowResArray: THREE.DataArrayTexture | null = null;
  public highResArray: THREE.DataArrayTexture | null = null;
  public loadedFlags: Uint8Array | null = null;
  public loadedFlagsTexture: THREE.DataTexture | null = null;

  /** Is this index served by the high-res array (vs. the low-res bank)? */
  private isHighBank(idx: number): boolean {
    return this.lowResBase === 0 || idx < this.bankSize;
  }

  /**
   * Decomposes a low-res SLOT number (idx - lowResBase, always >= 0 for any
   * title that reaches this — see isHighBank/setFlag) into its physical atlas
   * address. Shared by the write path (updateLowRes) and the read path
   * (getFallbackPixels) so the two can never disagree about where a title's
   * tile lives.
   */
  private atlasTileFor(slot: number): { layer: number; tileX: number; tileY: number } {
    const layer = Math.floor(slot / TILES_PER_ATLAS_LAYER);
    const tile = slot % TILES_PER_ATLAS_LAYER;
    return { layer, tileX: tile % ATLAS_TILE_COLS, tileY: Math.floor(tile / ATLAS_TILE_COLS) };
  }

  public init(totalMovies: number, renderer?: THREE.WebGLRenderer) {
    // ── Rebuild fast path ────────────────────────────────────────────────
    // A no-reload rebuild (quality/AO/theme/arrangement/render-mode change)
    // constructs a fresh WebGLRenderer, so the GPU-side layers die with the old
    // context — but the decoded PIXELS are untouched, and
    // updateTextureArrayLayerImpl mirrors every layer into image.data as it
    // uploads. So the arrays already carry a complete CPU copy: keep them, keep
    // the movieId->layer map, and keep the uploaded/queued sets, then let the
    // new context re-upload the whole mirror in one three.js texture init.
    //
    // Reallocating instead meant every one of ~3k layers re-streamed through
    // the budgeted upload queue at 4-16/frame, and because a not-yet-cached
    // title fires its settle callback from inside one of those queued tasks,
    // texturesReadyPromise (i.e. the boot overlay) waited on the whole drain —
    // measured at 7.2s of the 9.4s rebuild on a warm cache, plus a further 3.5s
    // of blank cases after the store reappeared.
    //
    // A medium/box-art change genuinely invalidates the pixels; that path calls
    // invalidatePosterLayers() and falls through to the full reallocation.
    const haveArrays = !!(this.lowResArray && this.highResArray && this.loadedFlagsTexture);
    if (haveArrays && !posterLayersInvalid && totalMovies <= this.maxMovies &&
        this.maxMovies - this.nextIndex >= LAYER_CHURN_HEADROOM / 2) {
      // Re-settle the shortfall against this call's (possibly smaller, on a
      // catalog refresh) totalMovies — this.layerBudget is still correct,
      // fixed by the last full allocation, so this stays cheap and settled.
      this.shortfall = Math.max(0, totalMovies - this.layerBudget);
      // Re-upload the mirrored pixels into the new GL context on first use.
      // Anisotropy only re-applies to the high-res array: the low-res atlas
      // has no mip chain (see the atlas note above) and anisotropic filtering
      // needs one.
      const maxAniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 0;
      this.lowResArray!.needsUpdate = true;
      this.highResArray!.needsUpdate = true;
      if (maxAniso) this.highResArray!.anisotropy = maxAniso;
      this.loadedFlagsTexture!.needsUpdate = true;
      this.bindUniforms();
      return;
    }

    // Release the previous allocation before reallocating. Without this, a
    // no-reload scene rebuild leaks the old DataArrayTextures on the GPU every
    // time (they'd fail the 5x-rebuild memory baseline test).
    this.lowResArray?.dispose();
    this.highResArray?.dispose();
    this.loadedFlagsTexture?.dispose();

    this.movieToIndex.clear();
    this.nextIndex = 0;
    this.layerBudgetWarned = false;
    // Spare layers so the fast path above survives the small catalog churn a
    // rebuild can introduce (a refreshed discovery/gap list, a games refetch).
    // Without headroom the very first rebuild would find nextIndex == maxMovies
    // and reallocate anyway, and the fast path would never engage.
    this.bankSize = maxArrayLayers(renderer);
    // High-res bank: bankSize titles, one layer each (unchanged). Low-res
    // bank: ATLASED (see the note above the tile constants) — bankSize GPU
    // layers, each holding TILES_PER_ATLAS_LAYER titles.
    const layerBudget = this.bankSize + this.bankSize * TILES_PER_ATLAS_LAYER;
    this.layerBudget = layerBudget;
    this.shortfall = Math.max(0, totalMovies - layerBudget);
    this.maxMovies = Math.max(1, Math.min(totalMovies + LAYER_CHURN_HEADROOM, layerBudget));
    // Overflow: the low-res array stops being every title's preview and becomes
    // the second bank (see the "Layer banking" note above).
    this.lowResBase = this.maxMovies > this.bankSize ? this.bankSize : 0;
    if (totalMovies > layerBudget) {
      // Past the banked budget a title simply gets no layer (see getIndex) and
      // shows as an unpainted case — the same treatment as a title whose art
      // never arrived. Say so loudly; silently blank shelves read as a bug.
      console.warn(
        `[posters] Catalog of ${totalMovies} exceeds the poster layer budget ` +
        `(${this.bankSize} high-res + ${this.bankSize}x${TILES_PER_ATLAS_LAYER} ` +
        `low-res atlas = ${layerBudget}); ${totalMovies - layerBudget} title(s) ` +
        `will shelve without cover art.`
      );
    }
    // Fresh arrays hold no pixels yet, so every layer must upload again.
    this.lowResUploaded.clear();
    this.highResQueued.clear();
    posterLayersInvalid = false;

    // The high-res array is mip-mapped for distance LOD (perf #28): distant
    // shelves sampled without mips alias/shimmer and thrash the GPU texture
    // cache. Layers stream in one at a time via raw texSubImage3D (see
    // updateTextureArrayLayer), which uploads every mip level explicitly from
    // CPU-box-filtered pixels — gl.generateMipmap is never called after the
    // first allocation (whole-array regen is a frame-tanking stall). Keep
    // `generateMipmaps` true anyway: three sizes the texStorage3D mip chain
    // from `generateMipmaps` + `minFilter` at allocation time, so flipping it
    // (or setting the mip-capable minFilter after the array is on the GPU)
    // would leave the wrong number of mip levels allocated and posters would
    // render black. The low-res ATLAS array deliberately has NO mip chain —
    // see the note above the tile constants — so it skips all of this.
    const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 0;
    const allocBank = (w: number, h: number, layers: number, mipmapped: boolean): THREE.DataArrayTexture => {
      const tex = new THREE.DataArrayTexture(new Uint8Array(w * h * layers * 4), w, h, layers);
      tex.format = THREE.RGBAFormat;
      tex.type = THREE.UnsignedByteType;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      if (mipmapped) {
        // Bound for the DISTANT shelves — precisely where grazing-angle
        // shimmer is worst — so anisotropy matters here even though it used
        // to sit at 1 while its high-res twin got 8 (which made the far
        // cases crawl). Cap at the driver's max (some report less than 4).
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        if (aniso) tex.anisotropy = aniso;
      } else {
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
      }
      tex.version = 1;
      return tex;
    };
    // High-res covers indices [0, bankSize), one layer per title. Only as
    // many layers as the catalog needs are built — a 5k catalog on a
    // 4096-layer driver costs 4096 high-res layers, not a full extra bank.
    this.highResArray = allocBank(160, 240, Math.min(this.bankSize, this.maxMovies), true);

    // Low-res ATLAS: covers either the same range as high-res (progressive
    // tier, lowResBase === 0) or [bankSize, maxMovies) (second bank) — either
    // way, `lowResSlotsNeeded` title-slots pack TILES_PER_ATLAS_LAYER to a
    // GPU layer, so the array only needs ceil(slots / 64) layers.
    const lowResSlotsNeeded = this.lowResBase === 0 ? this.maxMovies : this.maxMovies - this.bankSize;
    const lowResLayers = Math.max(1, Math.min(this.bankSize, Math.ceil(lowResSlotsNeeded / TILES_PER_ATLAS_LAYER)));
    this.lowResArray = allocBank(ATLAS_LAYER_W, ATLAS_LAYER_H, lowResLayers, false);

    // Allocate loaded flags LUT (1D texture). Sized for one entry BEYOND the
    // last mintable layer: getIndex() only ever hands out [0, maxMovies), so
    // index maxMovies is guaranteed to keep the zero it allocates with — that
    // is `unpaintedIndex`, the shader's "no art for this title" address.
    const lutSize = THREE.MathUtils.ceilPowerOfTwo(this.maxMovies + 1);
    this.unpaintedIndex = this.maxMovies;
    this.loadedFlags = new Uint8Array(lutSize);
    this.loadedFlagsTexture = new THREE.DataTexture(
      this.loadedFlags,
      lutSize,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );
    this.loadedFlagsTexture.minFilter = THREE.NearestFilter;
    this.loadedFlagsTexture.magFilter = THREE.NearestFilter;
    this.loadedFlagsTexture.generateMipmaps = false;
    this.loadedFlagsTexture.needsUpdate = true;

    this.bindUniforms();
  }

  /**
   * Point the persisted global case materials at the current array/LUT objects.
   * Runs on both init paths: after a reallocation the references genuinely
   * changed, and on the rebuild fast path the compiled uniform list belongs to
   * shaders that survived the swap, so re-binding is a cheap no-op that keeps
   * the two paths from drifting.
   */
  private bindUniforms() {
    const updateUniforms = (mat: any) => {
      if (mat && mat.userData.compiledUniformsList) {
        mat.userData.compiledUniformsList.forEach((u: any) => {
          u.lowResMapArray.value = this.lowResArray;
          u.highResMapArray.value = this.highResArray;
          u.posterLowResBase.value = this.lowResBase;
          u.highResLoadedTex.value = this.loadedFlagsTexture;
          u.maxMoviesCount.value = this.loadedFlagsTexture ? this.loadedFlagsTexture.image.width : 2048;
        });
      }
    };
    for (const mat of caseMaterialUniformProvider?.() ?? []) updateUniforms(mat);
  }

  public getIndex(movieId: string): number {
    if (this.movieToIndex.has(movieId)) {
      return this.movieToIndex.get(movieId)!;
    }
    // Out of layers: hand back the PERMANENTLY-UNPAINTED index WITHOUT
    // recording it, so the title never gets a loaded flag and hasArt() stays
    // false. That index's LUT entry is never written, so the case shader takes
    // its loadStatus == 0 branch and the box wears the house rental wrap —
    // the same thing a title whose art hasn't streamed in yet shows. It used
    // to hand back 0, which was safe only because the box was then collapsed
    // out of the scene entirely; a visible box at index 0 samples the FIRST
    // title's poster, i.e. every over-budget case wearing one shared cover.
    if (this.nextIndex >= this.maxMovies) {
      if (!this.layerBudgetWarned) {
        this.layerBudgetWarned = true;
        console.warn(
          `[posters] Poster layer budget (${this.maxMovies}) exhausted at "${movieId}" — ` +
          'further titles shelve without cover art.'
        );
      }
      return this.unpaintedIndex;
    }
    const idx = this.nextIndex++;
    this.movieToIndex.set(movieId, idx);
    return idx;
  }

  /** True once a title actually owns a layer (see getIndex's exhaustion path). */
  private hasLayer(movieId: string): boolean {
    return this.movieToIndex.has(movieId);
  }

  /**
   * Does this title's ONLY layer live in the high-res array? True for
   * first-bank titles once the catalog overflows, and it changes how callers
   * must stream: there is no cheap preview tier to paint first, so the
   * full-res upload has to happen even at background priority or the case
   * would never paint at all (see store-stock's loadShelfDetails).
   */
  public usesHighResOnly(movieId: string): boolean {
    if (this.lowResBase === 0) return false;
    const idx = this.movieToIndex.get(movieId);
    return idx !== undefined && idx < this.bankSize;
  }

  // Layers whose low-res pixels are on the GPU or already queued for upload
  // (issue #98) — marked at queue time so updateLOD()'s per-keypress re-runs
  // dedupe before enqueueing. Cleared by init() only when it genuinely
  // reallocates; the rebuild fast path keeps them, since the layers are still
  // live in the arrays' CPU mirror and get re-uploaded to the new context in
  // one go rather than one queued task at a time.
  private lowResUploaded = new Set<number>();
  private highResQueued = new Set<number>();

  // Cache-hit streaming (scene rebuilds, walking back to an already-decoded
  // shelf) used to call updateLowRes/updateHighRes synchronously — a warm
  // shelf reveal paid dozens of uploads in one frame. These wrappers put that
  // path through the same budgeted queue as fresh decodes, deduped at queue
  // time, flipping the shader's loaded flag only once the pixels are up.
  // NOTE: the queued closures deliberately resolve the renderer when they RUN
  // (getUploadRenderer()) instead of capturing the one passed in. A no-reload
  // rebuild builds a fresh WebGLRenderer while tasks from the outgoing scene
  // are still queued; a captured renderer would have those tasks stream into
  // the dead context — writing the pixels into the array's CPU mirror but never
  // onto the live GPU texture, while still flipping the shader's loaded flag.
  // The poster would then be marked ready and render as whatever the layer
  // happened to hold. Resolving late means a stale task simply lands on the
  // current renderer, which is always the right one.
  public queueLowRes(_renderer: THREE.WebGLRenderer, movieId: string, pixelData: Uint8Array) {
    const idx = this.getIndex(movieId);
    if (!this.hasLayer(movieId)) return; // past the layer budget — no art for this one
    // In overflow mode the low-res array is the SECOND BANK, not a preview
    // tier: a high-bank title has no low-res tile to write (see "Layer
    // banking" above).
    if (this.isHighBank(idx) && this.lowResBase !== 0) return;
    if (this.lowResUploaded.has(idx)) return;
    this.lowResUploaded.add(idx);
    queueTextureUpload(() => {
      const r = getUploadRenderer();
      if (r) this.updateLowRes(r, movieId, pixelData);
      this.setLowResLoaded(movieId, true);
    });
  }

  public queueHighRes(_renderer: THREE.WebGLRenderer, movieId: string, pixelData: Uint8Array) {
    const idx = this.getIndex(movieId);
    if (!this.hasLayer(movieId)) return;
    // An overflow-bank title has no high-res layer; its cover is painted by
    // the low-res path from the same decoded pixels (see updateLowRes's
    // caller in store-stock), so this is not a dropped poster.
    if (!this.isHighBank(idx)) return;
    if (this.highResQueued.has(idx)) return;
    if (this.loadedFlags && this.loadedFlags[idx] >= 255) return;
    this.highResQueued.add(idx);
    queueTextureUpload(() => {
      const r = getUploadRenderer();
      if (r) this.updateHighRes(r, movieId, pixelData);
      this.setHighResLoaded(movieId, true);
    });
  }

  public updateLowRes(renderer: THREE.WebGLRenderer, movieId: string, pixelData: Uint8Array) {
    const idx = this.getIndex(movieId);
    if (!this.hasLayer(movieId)) return;
    if (this.isHighBank(idx) && this.lowResBase !== 0) return;
    if (this.lowResArray) {
      const { layer, tileX, tileY } = this.atlasTileFor(idx - this.lowResBase);
      updateAtlasTile(renderer, this.lowResArray, layer, tileX, tileY, pixelData);
      this.lowResUploaded.add(idx);
    }
  }

  public updateHighRes(renderer: THREE.WebGLRenderer, movieId: string, pixelData: Uint8Array) {
    const idx = this.getIndex(movieId);
    if (!this.hasLayer(movieId) || !this.isHighBank(idx)) return;
    if (this.highResArray) {
      updateTextureArrayLayer(renderer, this.highResArray, idx, downsample320To160(pixelData));
    }
  }

  // Flag flips are immediate: updateTextureArrayLayer uploads the full mip
  // chain, so a layer is renderable at every distance the moment its upload
  // returns. (These used to be deferred behind the batched mipmap regen —
  // flipping early made distant boxes sample allocation-time zeros, pitch
  // black, until the next whole-array generateMipmap.)
  private setFlag(movieId: string, value: number, low: boolean) {
    if (!this.loadedFlags || !this.loadedFlagsTexture) return;
    const idx = this.getIndex(movieId);
    if (!this.hasLayer(movieId)) return; // no layer, nothing to mark loaded
    // A low-res flip never downgrades an already-applied high-res (255) flag,
    // and never fires for a HIGH-bank title in overflow mode — that title has
    // no low-res layer, so the shader's 128 branch would sample someone else's.
    if (low && ((this.isHighBank(idx) && this.lowResBase !== 0) || this.loadedFlags[idx] >= 255)) return;
    const wasUnpainted = this.loadedFlags[idx] === 0;
    this.loadedFlags[idx] = value;
    this.loadedFlagsTexture.needsUpdate = true;
    // The moment a title goes from "no art" to "art": its cover box is sitting
    // collapsed and only a re-dirty will bring it back (see setPosterLoadedNotify).
    if (wasUnpainted && value > 0) posterLoadedNotify?.(movieId);
    // Nudge the render-on-demand loop (issue #24) — the scene may have
    // settled to IDLE between the poster callback and this flip landing.
    textureStreamWake?.();
  }

  /**
   * Has ANY art landed for this title (low-res counts)? Non-allocating on
   * purpose: getIndex() would mint a layer for a title that has none, so this
   * reads the map directly. Callers use it to keep an unpainted cover box out
   * of the scene entirely rather than showing a blank one.
   */
  public hasArt(movieId: string): boolean {
    const idx = this.movieToIndex.get(movieId);
    if (idx === undefined || !this.loadedFlags) return false;
    return this.loadedFlags[idx] > 0;
  }

  /**
   * Has the FULL-res layer landed (as opposed to just the low-res preview)?
   * The GPU array layer, once uploaded, is never evicted — unlike
   * posterPixelCache/lowResCache, whose CPU-side entries can vanish under a
   * byte budget. Callers that only re-request a decode to refill an evicted
   * CPU cache entry (store-stock's loadShelfDetails) check this first: if the
   * resolution they actually need for this priority is already on the GPU,
   * the shelf already looks right and a redecode would be pure churn.
   */
  public hasHighRes(movieId: string): boolean {
    const idx = this.movieToIndex.get(movieId);
    if (idx === undefined || !this.loadedFlags) return false;
    return this.loadedFlags[idx] >= 255;
  }

  public setLowResLoaded(movieId: string, loaded: boolean) {
    this.setFlag(movieId, loaded ? 128 : 0, true);
  }

  public setHighResLoaded(movieId: string, loaded: boolean) {
    this.setFlag(movieId, loaded ? 255 : 0, false);
  }

  /**
   * A COPY of this title's best available art straight from the array
   * textures' CPU mirrors (updateTextureArrayLayerImpl always writes pixels
   * there before/alongside the GPU upload — see that function's opening
   * comment), or null if the title has no layer at all.
   *
   * Why this exists: hero-lowres-front.ts's soft-cover fallback used to stop
   * at lowResCache/posterPixelCache — both small, evictable CPU caches
   * (256MB / 64MB, video-case.ts) bounded well under a real library's size.
   * A title decoded early in a background sweep (loadAllArtworkForActiveLibrary)
   * routinely ages out of BOTH before the browse cursor ever reaches it, even
   * though hasArt()/hasHighRes() are true — its layer has been sitting on the
   * GPU, uploaded, the whole time. Before this existed, that combination (art
   * on the GPU, nothing in either CPU cache) fell all the way through to the
   * flat placeholder — the exact black-flash bug the low-res tier was built to
   * remove, just reopened by a cache the size of the low-res tier itself.
   * Measured on a 1400-title synthetic catalog: titles more than ~200 browse
   * steps from boot order reliably hit this path (scratch/hoverflicker2.mjs).
   *
   * Prefers the low-res (64x96) layer even when high-res (160x240) has also
   * landed: this is a TRANSITIONAL cover, on screen for a frame or two before
   * the real decode swaps in (same contract as the CPU lowResCache tier this
   * sits behind), so the high-res layer's extra sharpness buys nothing but a
   * ~6x heavier synchronous GPU upload (uploadTextureNow, called right on the
   * cursor-move keypress that triggered the miss). Measured on a 5000-title
   * catalog (tools/shot.mjs --perf 60 --lib 5000, worst case: every title on
   * this path — far past this app's ~3000-title production target):
   * always-preferring high-res cost ~550ms of extra heroMs/caseCanvasMs over
   * the 60-move sweep (vs. a placeholder-fallback baseline that pays neither);
   * preferring low-res here recovers about 3.5-4x of that (down to ~65-80ms
   * extra caseCanvasMs/heroMs — the remaining cost is the texture upload
   * itself, unavoidable once a real per-title texture has to exist at all).
   * At the scale that actually reproduced the original report (~1400 titles),
   * neither version is distinguishable from baseline in p50/p90/hitch count —
   * this only matters once a catalog is large enough that browsing routinely
   * outruns both CPU caches on nearly every step.
   * Falls back to high-res only when there's no low-res layer for this title
   * at all — a high-bank title once the catalog overflows into two banks
   * (isHighBank), where the low-res array becomes a SECOND BANK holding
   * different titles entirely, not a preview tier for this one.
   *
   * A copy, not a view: a view would keep the ENTIRE multi-hundred-KB
   * array-texture backing buffer (or, for the low-res atlas, layer) alive
   * for as long as one caller holds a texture built from a tiny slice of it.
   */
  public getFallbackPixels(movieId: string): { data: Uint8Array; w: number; h: number } | null {
    const idx = this.movieToIndex.get(movieId);
    if (idx === undefined || !this.loadedFlags || this.loadedFlags[idx] === 0) return null;
    if (this.lowResArray) {
      const lowSlot = idx - this.lowResBase;
      if (lowSlot >= 0) {
        const { width: atlasW, height: atlasH, data } = this.lowResArray.image;
        const { layer, tileX, tileY } = this.atlasTileFor(lowSlot);
        const layerSize = atlasW * atlasH * 4;
        const layerByteOffset = layer * layerSize;
        if (layerByteOffset + layerSize <= (data as Uint8Array).length) {
          return {
            data: extractAtlasTile(data as Uint8Array, atlasW, layerByteOffset, tileX, tileY, LOW_RES_TILE_W, LOW_RES_TILE_H),
            w: LOW_RES_TILE_W,
            h: LOW_RES_TILE_H,
          };
        }
      }
    }
    if (this.highResArray) {
      const { width: w, height: h, data } = this.highResArray.image;
      const layerSize = w * h * 4;
      const start = idx * layerSize;
      if (start + layerSize <= (data as Uint8Array).length) {
        return { data: (data as Uint8Array).slice(start, start + layerSize), w, h };
      }
    }
    return null;
  }
}

export const textureArrayManager = new TextureArrayManager();
