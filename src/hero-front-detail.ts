// HERO-RESOLUTION CASE FRONT — the cover art of the case you PICKED UP.
//
// video-case.ts's hero-face block (see HERO_COVER_SCALE) gave every printed face
// of the inspected case a 3x singleton canvas, for the reason spelled out there:
// on the 4K kiosk that case covers ~700x1250 display pixels (and ~975x1780 of the
// supersampled settle frame), so a face drawn at shelf resolution is magnified
// past what its pixels can carry and no amount of framebuffer supersampling
// invents the detail back. Every face got the treatment except one — the retail
// front — because it is not a canvas draw but a decoded poster, and the decode
// was hardcoded to the shelf's 320x480 (that file's own comment: "The retail
// front is a decoded poster and is bounded by that decode ... unaffected by
// this"). So the one face carrying the artwork — the whole point of picking a box
// up — stayed the softest thing on screen, on every quality tier, while the
// rental clamshell beside it was sharp. Owner report, 2026-08-17.
//
// The pixels exist: nothing upstream is throttling them. Jellyfin's poster URL is
// built with no maxWidth (jellyfin.ts buildItemImageUrl), so the source is
// whatever the server holds — commonly 1000x1500 or larger — and even the bundled
// demo posters are 598x874. The 320x480 was only ever the size the SHELVES need,
// where hundreds of covers share a texture array and 256MB pixel budget.
//
// So: decode the same art a second time at HERO_COVER_SCALE, for the one title
// being inspected. That is affordable for exactly the reason the sibling faces
// are — one case is ever inspected at a time — so this module holds a SINGLE
// slot, replaced when the inspected title changes, rather than a per-title cache.
// The decode runs in the existing worker pool off the main thread and reads the
// raw bytes back out of its IndexedDB cache, so it costs no network fetch and no
// main-thread stall; until it lands the caller keeps the shelf-resolution
// material it already had, so the swap is a sharpen in place and there is never
// a blank or placeholder frame.
//
// Kept OUT of video-case.ts deliberately, same as hero-lowres-front.ts next door:
// that file sits at its 6000-line budget (tools/check-file-budget.mjs), and per
// CLAUDE.md hitting the ceiling means extracting, not raising it.
import * as THREE from 'three';
import { Movie } from './jellyfin';
import {
  COVER_WIDTH,
  COVER_HEIGHT,
  HERO_COVER_SCALE,
  POSTER_CROP_X,
  edgeBusyCache,
  posterWorkerPool,
  reflectionProbes,
  hasRealGameBox,
  gameFaceAspect,
  getMovieOffsets,
  stampCollectionGapSticker,
  stampStaffPickSticker,
  makePlasticMaterial,
  cropFrontTextureForMedium,
  applyWhiteBorderShader,
  type CaseFinish,
} from './video-case';
import { isDiscoveryRequested } from './jellyseerr';
import { uploadTextureNow } from './poster-textures';
import { BB_ARCHIVO_BLACK } from './bundled-fonts';
import type { DecodeMode } from './poster-worker';

// Material-array index of the +Z face on the case BoxGeometry, whose face order
// is [+X, -X, +Y, -Y, +Z, -Z] (video-case.ts names the other three it addresses).
const FACE_FRONT = 4;

// Instant A/B off-switch, no rebuild — the same convention as bb_motion_sharp /
// bb_settle_ss next door in three-scene.ts. Set localStorage.bb_hero_art = "0"
// and every inspected face falls back to the shelf-resolution art it used to
// wear, which is both how the before/after was shot and the escape hatch if the
// extra decode ever misbehaves on a particular machine. Read once: this is
// consulted on every browse keypress that lands in inspect.
let heroArtFlag: boolean | null = null;
export function heroDetailArtEnabled(): boolean {
  if (heroArtFlag === null) {
    heroArtFlag = typeof localStorage === 'undefined' || localStorage.getItem('bb_hero_art') !== '0';
  }
  return heroArtFlag;
}

/**
 * The 4K badge, as a fraction of whatever buffer it is stamped onto.
 *
 * Moved here out of the poster queue's decode completion, where it was drawn
 * twice with the geometry hardcoded at each resolution (320x480 and 64x96). The
 * two copies were already the same fractions — 245/320 === 49/64, 400/480 ===
 * 80/96, 35/320 === 7/64 — so folding them into one fraction-based pass is
 * lossless AND makes the badge follow the buffer, which is what lets the hero
 * decode below wear it at 960x1440 instead of losing it.
 *
 * The two deliberate small-buffer exceptions are preserved by the `w >= COVER_WIDTH`
 * tests: the 64x96 layer draws slightly fatter lettering (it is a handful of
 * pixels tall and needs the weight) and skips the border stroke entirely.
 *
 * The buffer is stored bottom-up, hence the negative Y scale on the lettering —
 * the 1.45 is a deliberate stretch on the glyphs, not a buffer correction (see
 * stampCollectionGapSticker, which flips with a pure -1 for that reason).
 */
export function stamp4kSticker(data: Uint8Array, w: number, h: number, movieId: string): Uint8Array {
  const { r1, r2, r3 } = getMovieOffsets(movieId);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(w, h);
  imgData.data.set(data);
  ctx.putImageData(imgData, 0, 0);

  const R = w * 0.109375;                                  // 35/320
  const cx = w * 0.765625 + r1 * (w * 0.015625);            // 245/320, jitter 5/320
  const cy = h * 0.8333333 + r2 * (h * 0.0104167);          // 400/480, jitter 5/480
  const big = w >= COVER_WIDTH;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(r3 * 0.15);

  ctx.fillStyle = '#ffeb3b'; // circular yellow sticker
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, 2 * Math.PI);
  ctx.fill();

  if (big) {
    ctx.lineWidth = Math.max(1, w * 0.0046875); // 1.5/320
    ctx.strokeStyle = '#fbc02d';                // sticker border
    ctx.stroke();
  }

  ctx.scale(1.0, -1.45); // flip and stretch text only
  ctx.fillStyle = '#0d47a1'; // house-color letters
  ctx.font = `bold ${Math.round(w * (big ? 0.1125 : 0.125))}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('4K', 0, -1.5 * (w / COVER_WIDTH)); // nudge up (negative Y is up on the flipped buffer)

  ctx.restore();
  return new Uint8Array(ctx.getImageData(0, 0, w, h).data);
}

/**
 * Every sticker the shelf decode applies, at this buffer's scale. Shared by the
 * poster queue and the hero decode so a case cannot gain or lose a badge purely
 * by being picked up — the failure mode a second stamping site would invite.
 */
export function stampPosterBadges(data: Uint8Array, w: number, h: number, movie: Movie): Uint8Array {
  let out = data;
  if (movie.is4k) out = stamp4kSticker(out, w, h, movie.id);
  // A case standing in for a title the store doesn't have: blue REQUEST,
  // flipping to gold COMING SOON once ordered. Requested state is read at stamp
  // time so an ordered case comes back gold after a reload, not just in the
  // session that ordered it. A gap title is never is4k (you don't own the file),
  // so those two stickers can't collide.
  if (movie.collectionGap || movie.discovery) {
    const requested = !!movie.discoveryRequested || isDiscoveryRequested(movie.tmdbId);
    out = stampCollectionGapSticker(out, w, h, movie.id, requested);
  }
  // Watch-history staff pick (staff-picks.ts): endcap order candidates only.
  if (movie.staffPick) out = stampStaffPickSticker(out, w, h, movie.id);
  return out;
}

// ─── The single hero slot ────────────────────────────────────────────────────

// Resolved lazily, never at module scope: video-case.ts imports this module
// back (the poster queue stamps its badges through stampPosterBadges above), so
// whichever of the two the bundler enters first, the other's consts can still be
// in their temporal dead zone while this module body runs. Every imported
// binding here is therefore read inside a function.
const heroW = () => COVER_WIDTH * HERO_COVER_SCALE;
const heroH = () => COVER_HEIGHT * HERO_COVER_SCALE;

interface HeroSlot {
  movieId: string;
  pixels: Uint8Array;
  tex: THREE.DataTexture;
  // The material's variant inputs, so a probe/finish change rebuilds the
  // material without re-decoding the (far more expensive) pixels.
  variantKey: string;
  cropped: THREE.Texture | null; // crop clone owns its own GL texture
  mat: THREE.MeshPhysicalMaterial;
}

let slot: HeroSlot | null = null;
// In-flight decode target. Compared against on completion so a fast browse
// through several titles lands only the one still selected.
let pending: string | null = null;

function variantKey(probeIdx: number | undefined, isAnimated: boolean, skipCrop: boolean, finish?: CaseFinish) {
  return `${probeIdx ?? 'none'}_${isAnimated}_${skipCrop}_${finish ?? 'default'}`;
}

function disposeSlot() {
  if (!slot) return;
  if (slot.cropped && slot.cropped !== slot.tex) slot.cropped.dispose();
  slot.tex.dispose();
  slot.mat.dispose();
  slot = null;
}

function buildMaterial(
  s: HeroSlot,
  probeIdx: number | undefined,
  isAnimated: boolean,
  skipCrop: boolean,
  finish?: CaseFinish,
) {
  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;
  // Mirrors getPosterMaterial's own handling so the swap is a sharpen in place:
  // same crop window, same animated white-border treatment (which samples raw
  // UVs and therefore applies the crop itself), same probe and finish.
  const cropped = (skipCrop || isAnimated) ? null : cropFrontTextureForMedium(s.tex);
  const mat = makePlasticMaterial({ map: cropped ?? s.tex, envMap: env, finish });
  if (isAnimated) applyWhiteBorderShader(mat, skipCrop ? 0 : POSTER_CROP_X);
  s.cropped = cropped;
  s.mat = mat;
  s.variantKey = variantKey(probeIdx, isAnimated, skipCrop, finish);
}

/** Push `pixels` (already badge-stamped) onto the slot's live GPU texture. */
function uploadPixels(s: HeroSlot, pixels: Uint8Array) {
  s.pixels = pixels;
  (s.tex.image as { data: Uint8Array }).data.set(pixels);
  s.tex.needsUpdate = true;
  if (s.cropped && s.cropped !== s.tex) s.cropped.needsUpdate = true;
}

/**
 * The hero-resolution front for `movie`, or null when this title's hero pixels
 * aren't decoded yet — in which case the caller keeps the shelf-resolution
 * material it already built, and `requestHeroFrontDetail` below swaps this in
 * once the decode lands.
 */
export function getHeroFrontMaterial(
  movie: Movie,
  probeIdx?: number,
  isAnimated: boolean = false,
  skipCrop: boolean = false,
  finish?: CaseFinish,
): THREE.MeshPhysicalMaterial | null {
  if (!heroDetailArtEnabled()) return null;
  if (!slot || slot.movieId !== movie.id) return null;
  const want = variantKey(probeIdx, isAnimated, skipCrop, finish);
  if (slot.variantKey !== want) {
    if (slot.cropped && slot.cropped !== slot.tex) slot.cropped.dispose();
    slot.mat.dispose();
    buildMaterial(slot, probeIdx, isAnimated, skipCrop, finish);
  }
  return slot.mat;
}

/**
 * Ensure `movie`'s hero-resolution front exists, swapping it into `mats` IN
 * PLACE when it lands so a mesh already holding the array picks it up. Resolves
 * true only when it actually changed something, so the caller can request a
 * render (render-on-demand) exactly like applyGameCaseArt's swap.
 *
 * Fire and forget from the hero rebuild: this runs on every browse keypress that
 * lands in inspect, and blocking the rebuild on a decode would stall the cursor.
 */
export async function requestHeroFrontDetail(
  movie: Movie,
  mats: THREE.Material[],
  probeIdx?: number,
  isAnimated: boolean = false,
  skipCrop: boolean = false,
  finish?: CaseFinish,
): Promise<boolean> {
  if (!heroDetailArtEnabled() || !movie.posterUrl) return false;
  // Already decoded — getHeroFrontMaterial handled it synchronously.
  if (slot && slot.movieId === movie.id) return false;
  if (pending === movie.id) return false;
  pending = movie.id;

  // The exact mode the shelf decode used for this title (PosterLoadingQueue),
  // and the letterbox decision it already made — see the worker's
  // decodeImageBytes on why that decision is pinned rather than recomputed.
  const mode: DecodeMode = movie.game
    ? (hasRealGameBox(movie.platform) ? 'fill' : 'cart')
    : POSTER_CROP_X > 0 ? 'vhs' : 'crop';
  try {
    const { highResData } = await posterWorkerPool.decode(
      movie.posterUrl,
      mode,
      mode === 'cart' ? gameFaceAspect(movie.platform) : undefined,
      HERO_COVER_SCALE,
      edgeBusyCache.get(movie.id),
    );
    if (pending !== movie.id) return false; // selection moved on mid-decode
    pending = null;

    const W = heroW(), H = heroH();
    const pixels = stampPosterBadges(highResData, W, H, movie);
    disposeSlot();
    const tex = new THREE.DataTexture(pixels, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    // No mipmaps, LinearFilter both ways — the same treatment
    // createPosterDataTexture gives the shelf texture. This face is only ever
    // MAGNIFIED (it fills the frame), so a mip chain would cost 1.8MB of upload
    // for levels nothing samples.
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    // Pay the upload here rather than through the budgeted queue: this runs once
    // per case picked up, and deferring it would leave the soft front on screen
    // for extra frames — the thing this module exists to remove.
    uploadTextureNow(tex);

    slot = { movieId: movie.id, pixels, tex, cropped: null, variantKey: '', mat: null as unknown as THREE.MeshPhysicalMaterial };
    buildMaterial(slot, probeIdx, isAnimated, skipCrop, finish);
    mats[FACE_FRONT] = slot.mat;
    return true;
  } catch (err) {
    if (pending === movie.id) pending = null;
    console.warn('Failed to decode hero-resolution poster:', err);
    return false;
  }
}

/**
 * Re-stamp the badges onto the live hero front — for an inspected case whose
 * sticker state just changed under it (ordering a not-in-stock title from the
 * inspect view flips its corner label to gold COMING SOON). Without this the
 * high-resolution front would keep showing the blue REQUEST label every other
 * surface had already repainted. No-op unless that title is the one held.
 */
export function restampHeroFront(movie: Movie): boolean {
  if (!slot || slot.movieId !== movie.id) return false;
  uploadPixels(slot, stampPosterBadges(slot.pixels, heroW(), heroH(), movie));
  return true;
}

/**
 * Drop the held front. Called from video-case's medium/art cache clears, where
 * the decoded pixels are themselves being thrown away — the poster decode is
 * medium-dependent (the worker bakes the VHS letterbox in), so keeping this
 * would show the OUTGOING medium's art on the first case picked up after a swap.
 */
export function disposeHeroFrontDetail() {
  pending = null;
  disposeSlot();
}
