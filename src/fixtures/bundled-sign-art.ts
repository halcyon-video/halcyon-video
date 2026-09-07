// Committed campaign-sign renders (src/assets/signage/*.png), each with an
// optional user-asset override, recoloured to the ACTIVE THEME'S LIVERY the
// moment they decode.
//
// Owner ruling 2026-09-06: a two-ink sign in a rental chain's blue and gold is
// trade dress however brand-free its words are, so no render is ever shown in
// its own colours. On load its blue becomes palette.primary, its gold becomes
// palette.secondary and its white becomes the house knockout/text colour; the
// same remap runs over a user-asset drop, so a store's own art still wears the
// store's colours. Pixels that are not a blend of the sign's declared inks
// (drop shadows, outlines, photos) are left exactly as they were.

import * as THREE from 'three';
import { getActiveTheme } from '../themes';
import { getActiveLogoSpec } from '../logo-spec';
import { tryLoadUserAssetTexture } from '../user-assets';

export type LiveryRole = 'primary' | 'secondary' | 'text';

export interface SignArtSpec {
  /** Vite-imported URL of the committed render. */
  bundled: string;
  /** public/user-assets/<path> override, tried first. */
  userAsset: string;
  /** The render's own ink colours, keyed by the livery role each one takes. */
  inks: Partial<Record<LiveryRole, string>>;
}

type Rgb = [number, number, number];
interface Anchor { src: Rgb; dst: Rgb }
interface Livery { key: string; rgb: Record<LiveryRole, Rgb> }

// Longest side of the working canvas; a 6 ft poster does not need 3342 px and
// the per-pixel pass is the only CPU work these signs ever cost.
const MAX_SIDE = 2048;
// A pixel further than this (0-255 RGB) from every ink-to-ink blend is not
// sign ink and stays untouched.
const TOLERANCE = 46;

const images = new Map<string, unknown>();        // decoded source per URL
const textures = new Map<string, THREE.Texture>(); // recoloured per URL + livery
const misses = new Set<string>();                  // user-asset paths known absent

function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    const n = new THREE.Color(hex).getHex();
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function activeLivery(): Livery {
  const theme = getActiveTheme();
  const primary = theme.palette.primary;
  const secondary = theme.palette.secondary;
  const text = getActiveLogoSpec(theme).textColor;
  return {
    key: `${primary}|${secondary}|${text}`,
    rgb: { primary: hexToRgb(primary), secondary: hexToRgb(secondary), text: hexToRgb(text) },
  };
}

function anchorsFor(spec: SignArtSpec, livery: Livery): Anchor[] {
  const out: Anchor[] = [];
  for (const role of ['primary', 'secondary', 'text'] as LiveryRole[]) {
    const ink = spec.inks[role];
    if (ink) out.push({ src: hexToRgb(ink), dst: livery.rgb[role] });
  }
  return out;
}

function drawable(image: unknown): image is CanvasImageSource & { width: number; height: number } {
  return (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement)
    || (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
    || (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement);
}

// Every pixel is projected onto the blend segment between its nearest ink and
// each other ink; the closest segment wins. Pixels on (or near) a segment are
// re-blended between the two target colours at the same mix, so anti-aliased
// edges recolour as cleanly as flat fields; anything off every segment is
// left alone. Alpha is never touched, so die-cuts keep their outline.
function recolour(image: CanvasImageSource & { width: number; height: number }, anchors: Anchor[]): HTMLCanvasElement | null {
  const srcW = (image as HTMLImageElement).naturalWidth || image.width;
  const srcH = (image as HTMLImageElement).naturalHeight || image.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, w, h);
  if (anchors.length === 0) return canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = anchors.length;
  const tol2 = TOLERANCE * TOLERANCE;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    let ia = 0, da = Infinity;
    for (let k = 0; k < n; k++) {
      const s = anchors[k].src;
      const dr = r - s[0], dg = g - s[1], db = b - s[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < da) { da = dist; ia = k; }
    }
    const A = anchors[ia].src;
    let ib = ia, bestT = 0, bestResid = da;
    for (let k = 0; k < n; k++) {
      if (k === ia) continue;
      const B = anchors[k].src;
      const ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2];
      const len2 = ex * ex + ey * ey + ez * ez;
      if (len2 === 0) continue;
      let t = ((r - A[0]) * ex + (g - A[1]) * ey + (b - A[2]) * ez) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = A[0] + ex * t - r, py = A[1] + ey * t - g, pz = A[2] + ez * t - b;
      const resid = px * px + py * py + pz * pz;
      if (resid < bestResid) { bestResid = resid; bestT = t; ib = k; }
    }
    if (bestResid > tol2) continue;
    const DA = anchors[ia].dst, DB = anchors[ib].dst;
    d[i] = Math.round(DA[0] + (DB[0] - DA[0]) * bestT);
    d[i + 1] = Math.round(DA[1] + (DB[1] - DA[1]) * bestT);
    d[i + 2] = Math.round(DA[2] + (DB[2] - DA[2]) * bestT);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function finish(key: string, image: unknown, spec: SignArtSpec, fallback: THREE.Texture | null): THREE.Texture {
  const hit = textures.get(key);
  if (hit) return hit;
  let tex: THREE.Texture | null = null;
  if (drawable(image)) {
    const canvas = recolour(image, anchorsFor(spec, activeLivery()));
    if (canvas) tex = new THREE.CanvasTexture(canvas);
  }
  if (!tex) {
    // Not drawable (a compressed user asset) or no 2D context: show it as-is.
    tex = fallback ?? new THREE.Texture(image as HTMLImageElement);
    tex.needsUpdate = true;
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  textures.set(key, tex);
  return tex;
}

/** The recoloured user override, else the recoloured bundled render, if either has already decoded. */
export function cachedSignArt(spec: SignArtSpec): THREE.Texture | null {
  const livery = activeLivery();
  const userKey = `user:${spec.userAsset}|${livery.key}`;
  const userHit = textures.get(userKey);
  if (userHit) return userHit;
  const userImg = images.get(`user:${spec.userAsset}`);
  if (userImg) return finish(userKey, userImg, spec, null);
  const bundledKey = `bundled:${spec.bundled}|${livery.key}`;
  const bundledHit = textures.get(bundledKey);
  if (bundledHit) return bundledHit;
  const bundledImg = images.get(spec.bundled);
  if (bundledImg) return finish(bundledKey, bundledImg, spec, null);
  return null;
}

/**
 * Hand `apply` the sign's texture in the active livery: the user-asset
 * override when present, else the committed render. Synchronous on a cache
 * hit, otherwise once the image decodes.
 */
export function resolveSignArt(spec: SignArtSpec, apply: (tex: THREE.Texture) => void): void {
  const cached = cachedSignArt(spec);
  if (cached) { apply(cached); return; }

  const useBundled = () => {
    const hit = cachedSignArt(spec);
    if (hit) { apply(hit); return; }
    new THREE.TextureLoader().load(spec.bundled, (tex) => {
      images.set(spec.bundled, tex.image);
      const livery = activeLivery();
      const out = finish(`bundled:${spec.bundled}|${livery.key}`, tex.image, spec, tex);
      if (out !== tex) tex.dispose();
      apply(out);
    });
  };

  if (misses.has(spec.userAsset)) { useBundled(); return; }
  tryLoadUserAssetTexture(spec.userAsset, (tex) => {
    images.set(`user:${spec.userAsset}`, tex.image);
    const livery = activeLivery();
    const out = finish(`user:${spec.userAsset}|${livery.key}`, tex.image, spec, tex);
    if (out !== tex) tex.dispose();
    apply(out);
  }, { srgb: true, onMiss: () => { misses.add(spec.userAsset); useBundled(); } });
}
