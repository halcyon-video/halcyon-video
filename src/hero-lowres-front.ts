// TRANSITIONAL LOW-RES CASE FRONT — what a hovered box wears for the ~3 frames
// between "its full-res pixels aren't cached" and "the re-decode landed".
//
// Since the poster caches were re-bounded (256MB full-res, wave 2), boot decodes
// every title through posterPixelCache and then evicts all but the newest ~435,
// so on any library bigger than that the FIRST hover of nearly every title is a
// full-res cache miss. getPosterMaterial's miss path fell straight through to
// sharedJellyfinFrontPlaceholderMaterial — a flat #0f172a fill — which against
// the store's white shelving reads as the case flashing solid BLACK for ~47ms
// before the real cover pops in (owner report, 2026-08-06; reproduced at 10/10
// hovers on a 1400-title catalog, 0/10 on a 400-title one that fits the budget).
//
// The art to show instead is already in memory, in TWO places of very different
// size:
//  - lowResCache (video-case.ts) is a 64MB budget of 64x96 thumbnails
//    (24,576 B/title ~ 2,700 titles) — cheap, and checked first below.
//  - textureArrayManager (poster-textures.ts) never evicts: once a layer is
//    uploaded it lives on the GPU (and in its CPU mirror) for the life of the
//    scene. On a catalog that outgrows lowResCache too (or just outpaces it —
//    a background sweep, loadAllArtworkForActiveLibrary, decodes the whole
//    library regardless of where the browse cursor is, so titles the cursor
//    reaches late routinely age out of BOTH small CPU caches before they're
//    ever hovered) this is the ONLY tier still holding the title's pixels.
//    Confirmed still-reproducible after the lowResCache-only version of this
//    fix landed: scratch/hoverflicker2.mjs on a 1400-title catalog shows
//    hasArt()/hasHighRes() true with BOTH CPU caches missed, past ~move 18 of
//    a browse sweep — exactly the flat-placeholder case again.
//
// Both tiers are decoded from the same source, through the same medium mode,
// and carry the same gap/staff-pick stamps as the full-res pixels — so the
// transitional frame is always the title's OWN cover (sometimes low-res,
// sometimes even the sharper 160x240 GPU layer), which reads as the box
// sharpening rather than as a black flash.
//
// Kept OUT of video-case.ts deliberately: that file sits at its 6000-line budget
// (tools/check-file-budget.mjs), and per CLAUDE.md hitting the ceiling means
// extracting, not raising it.
//
// Two call-site notes, since the video-case diff is now nearly comment-free:
//  - The miss path lives in getPosterMaterial, so EVERY consumer of it (hero
//    inspect case, person endcaps, decor fixtures, the degenerate race its own
//    comment describes) gets the soft cover, not just the hovered box.
//  - createHeroJellyfinMaterials' old `posterPixelCache.has()` gate is gone
//    with it. That gate was independently wrong: it showed the flat placeholder
//    whenever the CPU pixels had been evicted even if this title's full-res
//    GPU texture was still live in heroPosterTextureLRU or pinned, so a case
//    could flash black with its real texture sitting right there unused.
import * as THREE from 'three';
import {
  lowResCache,
  reflectionProbes,
  makePlasticMaterial,
  cropFrontTextureForMedium,
  applyWhiteBorderShader,
  POSTER_CROP_X,
  type CaseFinish,
} from './video-case';
import { uploadTextureNow, textureArrayManager } from './poster-textures';
import { onProbesReplaced } from './case-env-probes';

// The low-res thumbnails the decode worker produces (see video-case's decode
// path, which stamps both tiers at these exact dimensions).
const LOW_W = 64;
const LOW_H = 96;

/**
 * lowResCache first (cheapest — no copy, this title's OWN small buffer), then
 * the array textures' never-evicted GPU mirror (a `.slice()` copy — see
 * TextureArrayManager.getFallbackPixels). Null only when the title has
 * genuinely never been decoded at all, in which case the caller's existing
 * flat-placeholder fallback is correct (there is really nothing to show yet).
 */
function resolveFallbackPixels(movieId: string): { data: Uint8Array; w: number; h: number } | null {
  const cached = lowResCache.get(movieId);
  if (cached) return { data: cached, w: LOW_W, h: LOW_H };
  return textureArrayManager.getFallbackPixels(movieId);
}

// These materials are transient by nature — one per title the cursor passes
// over, each superseded a few frames later by the full-res build. Bounded like
// heroPosterTextureLRU next door so a long browse can't accumulate GPU textures;
// the cap is a little higher because a fast cursor sweep can outrun the decodes.
const LOWRES_FRONT_LRU_CAP = 24;
interface LowResEntry {
  mat: THREE.MeshPhysicalMaterial;
  tex: THREE.DataTexture;
  cropped: THREE.Texture | null; // crop clone owns its own GL texture — dispose separately
}
const lowResFrontLRU = new Map<string, LowResEntry>();

// These survive a scene, so a fresh probe generation has to be handed to them —
// otherwise they sample a disposed cube map and render unlit (see
// case-env-probes.ts).
onProbesReplaced((repoint) => lowResFrontLRU.forEach((e) => repoint(e.mat)));

function disposeEntry(e: LowResEntry) {
  if (e.cropped && e.cropped !== e.tex) e.cropped.dispose();
  e.tex.dispose();
  e.mat.dispose();
}

function evictOverflow() {
  while (lowResFrontLRU.size > LOWRES_FRONT_LRU_CAP) {
    const oldest = lowResFrontLRU.keys().next().value as string;
    const entry = lowResFrontLRU.get(oldest)!;
    lowResFrontLRU.delete(oldest);
    disposeEntry(entry);
  }
}

/**
 * A soft-but-correct front for `movieId`, or null when even the low-res tier
 * has nothing (a title that genuinely never decoded — the caller then falls
 * back to the shared placeholder exactly as before).
 *
 * Mirrors getPosterMaterial's own crop/animated-border handling so the swap to
 * full-res is a sharpen in place, not a reframe: same crop window, same white
 * border treatment, same envMap probe and finish.
 */
export function getLowResFrontMaterial(
  movieId: string,
  probeIdx?: number,
  isAnimated: boolean = false,
  skipCrop: boolean = false,
  finish?: CaseFinish,
): THREE.MeshPhysicalMaterial | null {
  const src = resolveFallbackPixels(movieId);
  if (!src) return null;

  const key = `${movieId}_anim_${isAnimated}_crop_${skipCrop}_probe_${probeIdx !== undefined ? probeIdx : 'none'}_fin_${finish ?? 'default'}`;
  const cached = lowResFrontLRU.get(key);
  if (cached) {
    lowResFrontLRU.delete(key); // refresh recency
    lowResFrontLRU.set(key, cached);
    return cached.mat;
  }

  const tex = new THREE.DataTexture(src.data, src.w, src.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  // LinearFilter both ways: this is a 64x96 thumbnail blown up onto a case
  // face, and the whole point is that it reads as a soft COVER rather than a
  // blocky one. No mipmaps — it is on screen for a few frames.
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  // Pay the upload here, same as getOrCreatePosterTexture: this runs on a
  // selection move, never per frame, and deferring it would put a black frame
  // back on screen — the exact thing this module exists to remove.
  uploadTextureNow(tex);

  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;
  const cropped = (skipCrop || isAnimated) ? null : cropFrontTextureForMedium(tex);
  const mat = makePlasticMaterial({ map: cropped ?? tex, envMap: env, finish });
  if (isAnimated) applyWhiteBorderShader(mat, skipCrop ? 0 : POSTER_CROP_X);

  lowResFrontLRU.set(key, { mat, tex, cropped });
  evictOverflow();
  return mat;
}

/**
 * Drop every cached transitional front. Called from video-case's medium/art
 * cache clears, where the low-res pixels these were built from are themselves
 * being thrown away — keeping them would show the OUTGOING medium's art on the
 * first hover after the swap.
 */
export function disposeLowResFrontMaterials() {
  lowResFrontLRU.forEach(disposeEntry);
  lowResFrontLRU.clear();
}
