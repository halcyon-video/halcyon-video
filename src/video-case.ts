import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Movie, Episode } from './jellyfin';
import { loadGameFaceTexture, isTwoFlapSpine, jewelSpineComposite, uprightSpine } from './game-case-art';
import { isJewelCasePlatform, JEWEL_FAT_DEPTH_IN } from './jewel-case';
import { getReviewSnippetForMovie } from './review-snippets';
import { getActiveTheme } from './themes';
import { getActiveLogoSpec } from './logo-spec';
import { buildCustomTemplateWrap, buildCustomTicketWrap, buildDvdBlueTemplateWrap, customWrapLabel, ensureWrapFontsLoaded } from './logo-wrap';
import type { BrandPackWrapSpec } from './brand-pack';
import { brandAssetUrl, brandString, getBrandPack } from './brand-pack';
import type { DecodeMode } from './poster-worker';
import { getRommConfig, authHeader } from './romm';
import { drawTechSpecsTable, TECH_SPECS_TABLE_H } from './tech-specs';
import { stampCollectionGapSticker } from './case-corner-stickers';
import { perfTrace, perfSlot } from './perf-trace';
import { LruByteCache } from './lru-byte-cache';
import { reflectionProbes, setReflectionProbes, onProbesReplaced } from './case-env-probes';
// Re-exported so the probes keep their long-standing import site: three-scene
// and store-stock have always reached them through this module.
export { reflectionProbes, setReflectionProbes };
import { getLowResFrontMaterial, disposeLowResFrontMaterials } from './hero-lowres-front';
// The inspected case's front is decoded at 3x by its own module, which also owns
// the shared badge stamper the poster queue above calls. Cycle is function-level
// only (that file reads every binding from here inside a function, never at
// module scope) — same arrangement as hero-lowres-front.
import { stampPosterBadges, getHeroFrontMaterial, disposeHeroFrontDetail, restampHeroFront, heroDetailArtEnabled } from './hero-front-detail';
// The two DVD typed-metadata passes live in their own module (this file is at
// its line budget — see dvd-overlays.ts's header). They import this file's
// shared text/measure helpers back; the cycle is function-level only.
import { drawDvd2003Overlays, drawDvdBlueOverlays, DVD_BLUE_WRAP_LAYOUT } from './dvd-overlays';
import {
  queueTextureUpload,
  textureArrayManager,
  invalidatePosterLayers,
  setCaseMaterialUniformProvider,
  getUploadRenderer,
  uploadTextureNow,
  wakeTextureStream,
} from './poster-textures';
// The GPU upload pipeline lives in poster-textures.ts (see its header). It's
// re-exported here so the modules that have always reached for these through
// video-case — store-stock, three-scene, harness — keep working unchanged.
export {
  queueTextureUpload,
  uploadTextureNow,
  setUploadRenderer,
  setTextureStreamWake,
  wakeTextureStream,
  setPosterLoadedNotify,
  notifyUserActivity,
  setUploadTurbo,
  beginRebuildDrain,
  pendingTextureUploads,
  invalidatePosterLayers,
  updateTextureArrayLayer,
  textureArrayManager,
} from './poster-textures';

// Hitch-tracer slots (see perf-trace.ts): the per-title work that runs the
// first time a selection lands on a movie — 2D-canvas cover draws and
// synchronous GPU texture uploads — so hitches can be attributed to it.
const SP_CANVAS = perfSlot('caseCanvasMs'); // cache-miss cover/spine/back canvas draws
const CT_CANVAS = perfSlot('caseCanvasN');
const SP_BACKDRAW = perfSlot('backDrawMs'); // drawJellyfinBack incl. async backdrop redraws
const CT_BACKDRAW = perfSlot('backDrawN');
// texUploadMs/N and arrayLayerMs/N are registered by poster-textures.ts, which
// owns the upload pipeline those slots measure.

/**
 * Fetch a poster's bytes through the main thread (routing authenticated/cross-origin
 * requests like Romm through dev-proxy or headers) and return them as an ArrayBuffer.
 * Returns null if the fetch fails so the worker can fall back to a direct fetch.
 */
async function fetchPosterBytes(url: string): Promise<ArrayBuffer | null> {
  // Integration art markers are the worker's job: it unwraps `/dev-proxy?art=`
  // into a header-addressed request (and handles the `alt` fallback). Fetching
  // the marker here plain-GETs it, which the middleware answers 400 — one
  // guaranteed-failed request per game cover before the worker got it right.
  if (url.startsWith('/dev-proxy?')) return null;
  const targetUrl = rewriteLocalhost(url);
  const rommConfig = getRommConfig();
  const isRommUrl = rommConfig && targetUrl.startsWith(rommConfig.url);
  const hasTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

  try {
    if (isRommUrl) {
      const headers: Record<string, string> = {
        'Authorization': authHeader(rommConfig)
      };
      if (hasTauri) {
        const response = await fetch(targetUrl, { headers });
        if (response.ok) return await response.arrayBuffer();
      } else {
        const response = await fetch('/dev-proxy', {
          method: 'GET',
          headers: {
            'X-Proxy-Target': targetUrl,
            ...headers
          }
        });
        if (response.ok) return await response.arrayBuffer();
      }
    } else {
      const response = await fetch(targetUrl);
      if (response.ok) return await response.arrayBuffer();
    }
  } catch (err) {
    console.warn(`[fetchPosterBytes] Failed to fetch bytes for ${url}:`, err);
  }
  return null;
}

/**
 * Rewrite a localhost/127.0.0.1 host in a poster URL to the host the browser is
 * currently connected to. The web app is served from the same machine as
 * Jellyfin, so a remote client (e.g. another Tailscale node) reaching us by
 * hostname can reach Jellyfin the same way. No-op for any other host.
 */
function rewriteLocalhost(url: string): string {
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      parsed.hostname = hostname;
      return parsed.toString();
    }
  } catch {
    // Leave malformed URLs untouched.
  }
  return url;
}

import { BB_ARCHIVO_BLACK, BB_OUTFIT, BB_ORBITRON } from './bundled-fonts';

// Dimensions in Three.js units (feet)
// Note: We use a single case geometry for all movies because all Jellyfin
// artwork is provided in DVD aspect ratio (approx 2:3).
//
// The store can be rendered as DVDs (default) or VHS tapes. VHS sleeves are
// noticeably narrower than a DVD case and roughly twice as thick. Because all
// poster art is authored at DVD (2:3) proportions, painting it onto the
// narrower VHS face would squash it — so on VHS we CROP the poster on the left
// and right instead (see POSTER_CROP_X), keeping the art at its native scale.
//
// The choice is global for the whole store and persisted in localStorage
// (`bb_medium`); switching it reloads the page so every layout constant below
// is re-evaluated for the new medium (mirrors how shelf arrangement works).
export type CaseMedium = 'dvd' | 'vhs';
export let CASE_MEDIUM: CaseMedium = 'dvd';

// Which box-wrap DESIGN to render, independent of the
// physical case shape above. 'auto' (default) follows CASE_MEDIUM — DVD-shaped
// cases get the DVD-era wrap, VHS-shaped cases get the VHS "BlueGold" wrap.
// Forcing 'vhs' or 'dvd' lets the user see either box design regardless of the
// case's physical proportions (e.g. a DVD-shaped case wearing the VHS art).
// Persisted as localStorage `bb_case_art`. GH #51: when initCaseMedium detects
// that the physical medium or the effective box-art medium changed, it disposes
// every medium-scoped material/texture cache (per-title rental panels,
// letterbox-cropped poster fronts) and redraws the shared scan textures in
// place, so a no-reload scene rebuild regenerates everything for the new
// medium — see disposeMediumScopedCaches below.
export type CaseArtOverride = 'auto' | 'vhs' | 'dvd';
export let CASE_ART_OVERRIDE: CaseArtOverride = 'auto';

/** Effective box-wrap design to draw: the override if forced, else CASE_MEDIUM. */
export function effectiveArtMedium(): CaseMedium {
  return CASE_ART_OVERRIDE === 'auto' ? CASE_MEDIUM : CASE_ART_OVERRIDE;
}

// Which PRINT each box-wrap design renders from — the rental cover art is
// swappable by configuration, one localStorage key per design family
// (`bb_cover_vhs` / `bb_cover_dvd`) so a forced CASE_ART_OVERRIDE keeps its
// own pick. Two printed families, matching how period rental sleeves worked:
//   • Cream-stock TEMPLATES (back synopsis window, spine form fields, front
//     right-edge title placeholder): the store types each title's metadata
//     into the blanks, so they use the medium's base geometry and the full
//     typed-metadata pass.
//   • ALL-EMBLEM wraps (the brand printed big on BOTH faces, printed spine
//     band): no window, no form fields, no placeholder anywhere — nothing to
//     type into, so they carry `layout` overrides with their own panel crops
//     (spine band x 484–570 of 1024) and `plain: true`, which renders the
//     print exactly as printed with no overlays at all.
export interface CoverVariant {
  /** Persisted value of `bb_cover_<medium>`. */
  id: string;
  /** Value label shown on the settings drawer row. */
  label: string;
  /** Image URL (a brand pack's print); for procedural variants a
   *  `procedural://` sentinel that only serves as the change-detection key in
   *  initCaseMedium (never fetched). */
  url: string;
  /** Geometry/behavior overrides merged over the medium's base BOX_LAYOUTS. */
  layout?: Partial<BoxLayout>;
  /** Procedural wrap painter (logo-wrap.ts): drawn once at boot from the
   *  active LogoSpec instead of loading an image. loadBoxImage hands the
   *  returned canvas straight to the panel compositors — same pixel
   *  dimensions, so all crop/fold math applies unchanged. */
  procedural?: (medium: CaseMedium) => HTMLCanvasElement;
}

// Shared crops for the all-emblem wraps: fold lines at the spine band's
// edges (x 484–570 px), faces run band-edge to wrap-edge like the base layout.
const TICKET_WRAP_LAYOUT: Partial<BoxLayout> = {
  front: [0.5576, 0.0, 1.0, 1.0],
  back: [0.0, 0.0, 0.4727, 1.0],
  spine: [0.4727, 0.0, 0.5576, 1.0],
  standardVhs: false,
  plain: true,
};

// DVD analog for the procedural all-emblem wrap: the band is drawn on the
// base DVD fold lines (x 478/558), so only the behavior flags override — the
// print has no form fields or placeholder, nothing to type into.
const DVD_TICKET_WRAP_LAYOUT: Partial<BoxLayout> = {
  dvd2003: false,
  plain: true,
};

// The brand spec the PROCEDURAL wrap variants (Phase B2, logo-wrap.ts) draw
// from. Resolved LAZILY, never at module init: the harness copies its URL
// params (?logo=...) into localStorage in its module body, which runs AFTER
// this module's import evaluation — a module-scope resolve would bake the
// previous boot's brand into the wraps. Within a boot the spec is stable
// (brand edits persist + reload, like theme/medium changes), so the wrap
// canvases logo-wrap caches per medium stay valid. The variants' labels
// derive from it too ("MEGAHIT — custom wrap") via getters, read when the
// settings drawer builds its rows (well past boot).
const wrapLogoSpec = () => getActiveLogoSpec(getActiveTheme());

export const COVER_VARIANTS: Record<CaseMedium, CoverVariant[]> = {
  // Procedural LogoSpec wraps: the store's own brand on every case. 'standard'
  // clones the printed-form pixel geometry, so it carries the full
  // typed-metadata pass; 'ticket' draws its spine band on the all-emblem fold
  // lines and is `plain` (final art, nothing typed over it). DVD-only 'blue'
  // is the same TEMPLATE family as 'standard' — the VHS wrap's cream-stock/
  // blue-panel/gold-rule design, redrawn on the DVD wrap's own fold geometry.
  //
  // A brand pack that ships wrap SCANS adds its own variants alongside these
  // (syncBrandPackWrapVariants below) — including replacing 'standard' with a
  // real print of the same geometry.
  vhs: [
    {
      id: 'standard', get label() { return customWrapLabel(wrapLogoSpec(), 'custom'); },
      url: 'procedural://logo-wrap/custom',
      procedural: (m) => buildCustomTemplateWrap(wrapLogoSpec(), m),
    },
    {
      id: 'ticket', get label() { return customWrapLabel(wrapLogoSpec(), 'custom-ticket'); },
      url: 'procedural://logo-wrap/custom-ticket', layout: TICKET_WRAP_LAYOUT,
      procedural: (m) => buildCustomTicketWrap(wrapLogoSpec(), m),
    },
  ],
  dvd: [
    {
      id: 'standard', get label() { return customWrapLabel(wrapLogoSpec(), 'custom'); },
      url: 'procedural://logo-wrap/custom',
      procedural: (m) => buildCustomTemplateWrap(wrapLogoSpec(), m),
    },
    {
      id: 'blue', get label() { return customWrapLabel(wrapLogoSpec(), 'custom-blue'); },
      url: 'procedural://logo-wrap/custom-blue', layout: DVD_BLUE_WRAP_LAYOUT,
      procedural: (_m) => buildDvdBlueTemplateWrap(wrapLogoSpec()),
    },
    {
      id: 'ticket', get label() { return customWrapLabel(wrapLogoSpec(), 'custom-ticket'); },
      url: 'procedural://logo-wrap/custom-ticket', layout: DVD_TICKET_WRAP_LAYOUT,
      procedural: (m) => buildCustomTicketWrap(wrapLogoSpec(), m),
    },
  ],
};

// ── User-supplied wrap image (W3 drop-in cover) ─────────────────────────────
// Some original cases (e.g. a real 2003 DVD cover's film-reel artwork) can't
// be recreated procedurally, so the user can upload ONE full flat wrap image
// per medium — [BACK | SPINE | FRONT] on a single canvas, normalized by the
// settings UI to the exact scan geometry below before storing. It renders as
// a 'user' cover variant with the medium's base panel crops and `plain: true`
// (the upload is final print — no metadata is typed over it).
export const USER_WRAP_KEYS: Record<CaseMedium, string> = {
  vhs: 'bb_wrap_user_vhs',
  dvd: 'bb_wrap_user_dvd',
};

// Target canvas per medium — identical to BOX_LAYOUTS' scan geometry (fold
// lines in px of the canvas width), exported so the settings upload UI can
// cover-fit-normalize to it and print the spec line.
export const USER_WRAP_SPECS: Record<CaseMedium, { w: number; h: number; folds: [number, number] }> = {
  vhs: { w: 1024, h: 762, folds: [473, 589] },
  dvd: { w: 1024, h: 683, folds: [478, 558] },
};

// Same crops as the medium's base scan; plain (no typed-metadata pass).
const USER_WRAP_LAYOUT: Record<CaseMedium, Partial<BoxLayout>> = {
  vhs: { standardVhs: false, plain: true },
  dvd: { dvd2003: false, plain: true },
};

/** The stored user wrap data URL for a medium, or null. */
export function getUserWrap(medium: CaseMedium): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(USER_WRAP_KEYS[medium]) : null;
}

/**
 * Add/remove each medium's 'user' cover variant so it exists exactly when its
 * localStorage key does. The data URL doubles as the variant url, which is
 * both loadBoxImage's decode-cache key and initCaseMedium's change-detection
 * key — replacing the upload naturally invalidates the old texture caches.
 */
export function syncUserWrapVariants(): void {
  for (const m of ['vhs', 'dvd'] as CaseMedium[]) {
    const list = COVER_VARIANTS[m];
    const idx = list.findIndex((v) => v.id === 'user');
    const dataUrl = getUserWrap(m);
    if (dataUrl) {
      const variant: CoverVariant = {
        id: 'user',
        label: 'My Wrap (Uploaded)',
        url: dataUrl,
        layout: USER_WRAP_LAYOUT[m],
      };
      if (idx >= 0) list[idx] = variant;
      else list.push(variant);
    } else if (idx >= 0) {
      list.splice(idx, 1);
    }
  }
}

/**
 * The brand-pack twin of syncUserWrapVariants: an installed pack that declares
 * `wraps.vhs` / `wraps.dvd` gets a 'pack' cover variant per medium, its PNG
 * read straight off disk instead of out of a localStorage data URL. Same
 * geometry contract as the uploads (USER_WRAP_SPECS: the flat
 * [BACK | SPINE | FRONT] scan at 1024x762 / 1024x683 with the folds where the
 * real wraps put them), same `plain` layout — a pack's print is final art, so
 * nothing is typed over it.
 *
 * Declared-only, never probed: a pack that ships no wraps must not cost a 404
 * per medium per boot, and an absent file simply leaves the variant list as it
 * was.
 */
// The three print geometries a pack's wraps can declare (brand-pack.ts's
// BrandPackWrapSpec.layout), resolved to the layout overrides the app already
// has: 'base' = the medium's own scan geometry AND its typed-metadata pass
// (undefined overrides), 'plain' = same crops, final art, 'ticket' = the
// all-emblem crops. One table, so a pack can restore every print family the
// store ever shipped rather than one flattened "pack wrap".
const PACK_WRAP_LAYOUTS: Record<CaseMedium, Record<'base' | 'plain' | 'ticket', Partial<BoxLayout> | undefined>> = {
  vhs: { base: undefined, plain: USER_WRAP_LAYOUT.vhs, ticket: TICKET_WRAP_LAYOUT },
  dvd: { base: undefined, plain: USER_WRAP_LAYOUT.dvd, ticket: DVD_TICKET_WRAP_LAYOUT },
};

// Variant ids this function owns, so a resync drops the previous pack's prints
// (ids are the pack's own — 'standard', 'ticket-video', … — and would
// otherwise accumulate across a pack switch).
let packWrapIds: Record<CaseMedium, string[]> = { vhs: [], dvd: [] };

export function syncBrandPackWrapVariants(): void {
  const pack = getBrandPack();
  const brandLabel = pack ? (pack.displayName ?? pack.name ?? pack.id) : '';
  const next: Record<CaseMedium, string[]> = { vhs: [], dvd: [] };
  for (const m of ['vhs', 'dvd'] as CaseMedium[]) {
    const list = COVER_VARIANTS[m];
    for (const id of packWrapIds[m]) {
      const i = list.findIndex((v) => v.id === id);
      if (i >= 0) list.splice(i, 1);
    }
    const declared = pack?.wraps?.[m];
    const prints: BrandPackWrapSpec[] = !declared
      ? []
      : typeof declared === 'string'
        ? [{ id: 'pack', label: `${brandLabel} — pack wrap`, file: declared, layout: 'plain' }]
        : declared;
    for (const print of prints) {
      const url = brandAssetUrl(print.file);
      if (!url) continue;
      const variant: CoverVariant = {
        id: print.id,
        label: print.label ?? `${brandLabel} — ${print.id}`,
        url,
        layout: PACK_WRAP_LAYOUTS[m][print.layout ?? 'plain'],
      };
      const i = list.findIndex((v) => v.id === print.id);
      if (i >= 0) list[i] = variant;
      else list.push(variant);
      next[m].push(print.id);
    }
  }
  packWrapIds = next;
}

/** Store/clear a user wrap (data URL, already normalized) and resync variants. */
export function setUserWrap(medium: CaseMedium, dataUrl: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (dataUrl) localStorage.setItem(USER_WRAP_KEYS[medium], dataUrl);
  else localStorage.removeItem(USER_WRAP_KEYS[medium]);
  syncUserWrapVariants();
}

// Loaded from localStorage in initCaseMedium(); first variant is the default.
const COVER_SELECTION: Record<CaseMedium, string> = { vhs: 'standard', dvd: 'standard' };

/** The scan variant the given medium's wrap currently renders from. */
export function activeCoverVariant(medium: CaseMedium): CoverVariant {
  const list = COVER_VARIANTS[medium];
  return list.find((v) => v.id === COVER_SELECTION[medium]) ?? list[0];
}

/** Cache tag for per-title panel materials: art medium + its cover variant. */
function artCacheTag(): string {
  const m = effectiveArtMedium();
  return `${m}-${activeCoverVariant(m).id}`;
}

// Physical case dimensions in feet, per medium (×12 = inches). Height is kept
// identical across mediums so the existing shelf heights and lean math stay
// valid; only width (narrower) and depth (thicker) change for VHS.
//
// Real-world VHS audit (GH #42) — the numbers these constants standardize on:
//   • VHS cassette itself: 7.4 × 4.06 × 1.0 in (188 × 103 × 25 mm).
//   • Retail cardboard SLIPCASE / sleeve (CASE_DIMS.vhs below): snug over the
//     tape, ~8.0 × 4.1 × ~1.0–1.1 in. Modeled 0.365 × 0.667 × 0.092 ft =
//     4.38 × 8.00 × 1.10 in. Height is pinned to 0.667 by the shelf constraint;
//     width runs a hair over real (4.38 vs ~4.1), within tolerance; depth bumped
//     0.082 → 0.092 ft to hit the real ~1.1 in tape-in-sleeve thickness.
//   • rental CLAMSHELL (hard plastic, built in getRentalGeometry):
//     was noticeably larger AND thicker than a sleeved tape, ~8.25 × 4.56 ×
//     1.2–1.3 in (21 × 11.6 × 3 cm). Because the sleeve's modeled height is
//     pinned above real (8.00 vs ~7.56 in), realism here means matching the
//     real clamshell:sleeve RATIOS (w 1.10×, h 1.09×, d ~1.15×), not the real
//     absolute inches. Modeled 0.403 × 0.727 × 0.104 ft via the VHS_RIM_*
//     enlargement + VHS_RENTAL_DEPTH_FT below — clearly bigger on every axis,
//     and (the key correction) distinctly THICKER than the sleeve.
const CASE_DIMS: Record<CaseMedium, { w: number; h: number; d: number }> = {
  dvd: { w: 0.445, h: 0.667, d: 0.045 },
  vhs: { w: 0.365, h: 0.667, d: 0.092 }, // sleeve: 4.38 × 8.00 × 1.10 in (see audit above)
};

// Rental stores never molded per-platform shells: a cartridge game rents
// in the same clamshell a VHS tape does (generic case, the game's art slipped
// under the window), a disc game in a standard DVD-size keep case. Two case
// shapes only — the rental box never changes aspect ratio per platform.
// Keys are romm.ts platformLabel() outputs; anything not listed here (unknown
// systems, ARCADE) is treated as cartridge — the generic clamshell is what a
// store would actually put an odd cart in.
const DISC_PLATFORMS = new Set<string>([
  'PLAYSTATION',
  'PLAYSTATION 2',
  'GAMECUBE',
  'DREAMCAST',
  'PSP',
  'WII U',
  'SEGA CD',
  'SEGA SATURN',
  'XBOX',
]);
export function isDiscPlatform(platform?: string): boolean {
  return !!platform && DISC_PLATFORMS.has(platform);
}
// FALLBACK dims for a platform with no carton on file: the movie mediums' dims
// (shared object references, so geometry caches coalesce), picked by the
// platform's media class instead of the store-wide CASE_MEDIUM. Platforms WITH
// a carton on file use it instead — see GAME_BOX_IN below.
export const GAME_CLASS_DIMS: Record<'cart' | 'disc', { w: number; h: number; d: number }> = {
  cart: CASE_DIMS.vhs,
  disc: CASE_DIMS.dvd,
};

// RETAIL box dims — the front box, the one wearing the game's own art. It
// varies by platform because the real cartons did, and it is modelled at REAL
// SIZE: a Game Boy carton is a 4.75 x 5.25 in near-square, not a VHS-shaped
// 4.4 x 8.0 in slab. Fitting square Game Boy scans onto the clamshell's 0.547
// face is what produced the 37-46% edge-colour letterbox bars, and sizing the
// box off the shelf's height budget rather than reality is what made those
// boxes tower over the carton they represent.
//
// NOMINAL RETAIL CARTON / CASE SIZE, inches: [width, height, depth]. These are
// the commonly cited sizes, not measurements off reference photos — correct any
// entry against a real photo when one is on hand (the authority rule the 1993
// POS art follows). A platform with NO entry keeps the generic clamshell shape,
// which is the right answer for an odd cart a store would just sleeve.
const GAME_BOX_IN: Record<string, [number, number, number]> = {
  // Cartridge era — cardboard cartons and plastic clamshells.
  'NES': [5.0, 7.0, 1.0],
  'SNES': [7.5, 5.25, 1.1],              // NA landscape carton
  'SUPER FAMICOM': [4.2, 7.5, 1.1],      // JP carton: tall and narrow, not a wide Snes box
  'NINTENDO 64': [7.5, 5.25, 1.1],       // landscape carton
  'GAME BOY': [4.75, 5.25, 0.9],         // near-square
  'GAME BOY COLOR': [4.75, 5.25, 0.9],
  'GAME BOY ADVANCE': [4.8, 5.4, 0.9],   // portrait, like the GB carton
  'GENESIS': [5.5, 7.5, 1.2],
  'SEGA MASTER SYSTEM': [5.5, 7.0, 1.0],
  'ATARI': [5.0, 7.0, 1.0],
  'TURBOGRAFX-16': [5.5, 4.9, 0.9],
  'ARCADE': [5.0, 7.0, 1.0],             // Neo Geo AES cartons are far larger;
                                         // a rental store sleeved odd carts.
  // Optical era — jewel cases and keep cases.
  'PLAYSTATION': [5.6, 4.9, 0.4],        // CD jewel case, landscape
  'SEGA SATURN': [4.9, 5.6, 0.4],        // CD jewel case, portrait
  'SEGA CD': [5.5, 7.9, 0.75],
  'DREAMCAST': [5.5, 7.5, 0.6],
  'PLAYSTATION 2': [5.3, 7.5, 0.55],     // DVD keep case
  'GAMECUBE': [5.3, 7.4, 0.6],
  'XBOX': [5.3, 7.5, 0.55],
  'NINTENDO 3DS': [5.4, 4.75, 0.5],      // small keep case, landscape
  'NINTENDO DSI': [5.4, 4.9, 0.5],       // DS-family keep case, landscape
  'NINTENDO SWITCH': [4.2, 6.6, 0.45],   // portrait keep case
  'PSP': [4.1, 6.7, 0.6],                // UMD case, portrait
  'WII U': [5.3, 7.5, 0.6],              // DVD-footprint keep case
};

/** Does this platform have a real carton on file (vs. the generic clamshell)? */
export function hasRealGameBox(platform?: string): boolean {
  return !!platform && !!GAME_BOX_IN[platform];
}

// Real size wins until it collides with the fixture. A box may not exceed the
// shelf's column pitch (BOX_SPACING 0.58 ft — store-layout.ts, repeated as a
// literal because importing it would close an import cycle) minus a sliver of
// air, nor the shelf's vertical clearance. Only the widest landscape cartons
// (SNES/N64 at 7.5 in vs a 6.96 in pitch) hit the cap; everything else stands
// at true scale. Capping scales BOTH axes, so the aspect never changes.
const GAME_BOX_MAX_W = 0.55;  // 6.6 in — pitch 6.96 in less a 0.36 in gap
const GAME_BOX_MAX_H = 0.70;  // 8.4 in — shelf pitch is 1.1 ft
const IN_TO_FT = 1 / 12;
// Memoised so every instance of a platform shares ONE dims object: the geometry
// cache and store-stock's instanced-mesh batching both key off identity.
// Two entries per jewel platform — single and fat — because `discCount >= 2`
// swaps the depth (JEWEL_FAT_DEPTH_IN) and everything downstream (geometry
// cache, batch key) hangs off the dims object.
const gameBoxDimsCache = new Map<string, { w: number; h: number; d: number }>();

export function gameCaseDims(platform?: string, discCount?: number): { w: number; h: number; d: number } {
  const box = platform ? GAME_BOX_IN[platform] : undefined;
  if (!box) return GAME_CLASS_DIMS[isDiscPlatform(platform) ? 'disc' : 'cart'];
  const fat = isJewelCasePlatform(platform) && (discCount ?? 1) >= 2;
  const key = fat ? `${platform}#fat` : platform!;
  let dims = gameBoxDimsCache.get(key);
  if (!dims) {
    let [w, h, d] = box.map((v) => v * IN_TO_FT) as [number, number, number];
    if (fat) d = JEWEL_FAT_DEPTH_IN * IN_TO_FT;
    const scale = Math.min(1, GAME_BOX_MAX_W / w, GAME_BOX_MAX_H / h);
    dims = { w: w * scale, h: h * scale, d };
    // Ride the marker on the dims object itself: getGeometry() sees only dims,
    // and a jewel case needs its corners near-sharp where every other case
    // keeps the molded d*0.28 round-over. The memo above makes this identity-
    // stable, and the class fallbacks (shared with the movie CASE_DIMS
    // objects) are never marked.
    if (isJewelCasePlatform(platform)) (dims as any).jewel = true;
    gameBoxDimsCache.set(key, dims);
  }
  return dims;
}

/** Front-face aspect (w/h) the art must be fitted to for this platform. */
export function gameFaceAspect(platform?: string): number {
  const d = gameCaseDims(platform);
  return d.w / d.h;
}

/**
 * Dims of the RENTAL shell standing behind a game's cover box —
 * deliberately NOT the game's own carton.
 *
 * Rental stores never molded per-platform shells (see the note above
 * DISC_PLATFORMS), so every cartridge goes in the VHS clamshell and every disc
 * in the DVD keep case no matter what shape the retail box is. A small Game Boy
 * carton legitimately stands in front of a full-height clamshell; that contrast
 * is the point.
 *
 * Exists because passing gameCaseDims() here is an easy and invisible mistake:
 * it squashes the clamshell to the game's aspect, so the rental copy
 * silently changes size from title to title. The shelf batches always got this
 * right (gameShapeKey splits retail from rental); the hero/inspect and
 * asset-viewer paths did not, until this.
 *
 * discCount is deliberately not a parameter: the multi-disc FAT box is a retail
 * shape only — the shell it sits in never changes.
 */
export function gameRentalDims(platform?: string): { w: number; h: number; d: number } {
  return GAME_CLASS_DIMS[isDiscPlatform(platform) ? 'disc' : 'cart'];
}

/**
 * How far to LIFT the rental shell so it stands on the same surface as the
 * retail box in front of it.
 *
 * Both boxes are RoundedBoxGeometry centred on their own origin and both are
 * placed at the slot's single Y (three-scene's fWorldY/bWorldY), so a shell
 * that is taller than the box in front of it hangs BELOW that box by half the
 * difference — straight through the shelf it is supposed to be sitting on.
 * Nothing clamps it, because a shelf is a surface the boxes are posed onto,
 * not a collider they rest against.
 *
 * That difference is never zero on a clamshell: the rental case is moulded
 * larger than the sleeve it holds (VHS_RIM_VERTICAL_FT), so even a movie sank
 * by half the rim. Games are far worse — the shell is the media CLASS case
 * (a full-height VHS clamshell for any cartridge) while the retail box is the
 * platform's real carton, so a landscape SNES box (5.25 in) stands in front of
 * an 8.73 in shell and drops it ~1.7 in under the shelf.
 *
 * Returns 0 for the DVD-medium movie case, where the rental box IS the retail
 * geometry (getRentalGeometry defers to getGeometry) and there is nothing to
 * correct.
 */
export function rentalBottomLift(
  retailDims?: { w: number; h: number; d: number },
  rentalDims?: { w: number; h: number; d: number }
): number {
  const retailH = retailDims?.h ?? CASE_HEIGHT;
  return (rentalBoxHeight(retailDims, rentalDims) - retailH) / 2;
}

/**
 * Real HEIGHT of the rental shell as getRentalGeometry builds it: a
 * DVD-shaped rental box is the retail geometry (no rim), anything else is the
 * moulded clamshell with VHS_RIM_VERTICAL_FT added.
 *
 * Split out from rentalBottomLift so the fit validator has a source of truth
 * for the shell's size that is INDEPENDENT of the placement being checked.
 * Deriving one from the other makes the assertion vacuous — which is exactly
 * what happened on the first cut of that check.
 */
export function rentalBoxHeight(
  retailDims?: { w: number; h: number; d: number },
  rentalDims?: { w: number; h: number; d: number }
): number {
  const base = rentalDims ?? (retailDims ? undefined : { w: CASE_WIDTH, h: CASE_HEIGHT, d: CASE_DEPTH });
  if (!base) return retailDims?.h ?? CASE_HEIGHT;
  const isDvdShaped = base.w === CASE_DIMS.dvd.w && base.h === CASE_DIMS.dvd.h;
  return isDvdShaped ? base.h : base.h + VHS_RIM_VERTICAL_FT;
}

/**
 * Real DEPTH of the rental shell, for the same reason rentalBottomLift()
 * exists: the slot has one depth (the retail box's) and offsets both boxes by
 * half of it, so the shell — which is always THICKER than what it holds —
 * straddles the parting plane and its front face pushes into the back of the
 * box standing in front. About 0.07 in on every game and every VHS movie:
 * small, but two cases interpenetrating reads as a rendering fault at any
 * range you can actually see it.
 *
 * Mirrors getRentalGeometry's depth choice exactly — a DVD-shaped rental box
 * IS the retail geometry (keeps its own depth), anything else is the thicker
 * moulded clamshell.
 */
export function rentalBoxDepth(
  retailDims?: { w: number; h: number; d: number },
  rentalDims?: { w: number; h: number; d: number }
): number {
  const base = rentalDims ?? (retailDims ? undefined : { w: CASE_WIDTH, h: CASE_HEIGHT, d: CASE_DEPTH });
  if (!base) return retailDims?.d ?? CASE_DEPTH;
  const isDvdShaped = base.w === CASE_DIMS.dvd.w && base.h === CASE_DIMS.dvd.h;
  return isDvdShaped ? base.d : VHS_RENTAL_DEPTH_FT;
}

// Instanced-mesh batching key: one batch per distinct BOX SIZE, not per platform
// — platforms sharing a carton (Game Boy / Game Boy Color, SNES / N64, the DVD
// keep-case consoles) share a batch. Only the RETAIL box varies: the rental
// shell stays the generic rental box in every batch — VHS clamshell for a
// cartridge, DVD keep case for a disc — because rental stores never molded
// per-platform shells (see the note above DISC_PLATFORMS). The carton sits in
// front of a shell that is the same size for every game of its media class.
const gameShapeRegistry = new Map<string, { retail: { w: number; h: number; d: number }; rental: { w: number; h: number; d: number } }>([
  ['disc', { retail: GAME_CLASS_DIMS.disc, rental: GAME_CLASS_DIMS.disc }],
  ['cart', { retail: GAME_CLASS_DIMS.cart, rental: GAME_CLASS_DIMS.cart }],
]);

export function gameShapeKey(platform?: string, discCount?: number): string {
  if (!hasRealGameBox(platform)) return isDiscPlatform(platform) ? 'disc' : 'cart';
  const d = gameCaseDims(platform, discCount);
  const key = `box${Math.round(d.w * 1000)}x${Math.round(d.h * 1000)}x${Math.round(d.d * 1000)}`;
  if (!gameShapeRegistry.has(key)) {
    gameShapeRegistry.set(key, { retail: d, rental: GAME_CLASS_DIMS[isDiscPlatform(platform) ? 'disc' : 'cart'] });
  }
  return key;
}

/** Dims for a batch key from gameShapeKey(); falls back to the generic shell. */
export function gameDimsForShape(shapeKey: string): { retail: { w: number; h: number; d: number }; rental: { w: number; h: number; d: number } } {
  return gameShapeRegistry.get(shapeKey) || gameShapeRegistry.get('cart')!;
}
export let CASE_WIDTH = CASE_DIMS[CASE_MEDIUM].w;
export let CASE_HEIGHT = CASE_DIMS[CASE_MEDIUM].h;
export let CASE_DEPTH = CASE_DIMS[CASE_MEDIUM].d;

// Poster art is authored to fill a DVD face exactly. On a narrower medium (VHS)
// we crop this fraction off EACH horizontal side of the poster so the visible
// band matches the face's aspect ratio at native (undistorted) scale. 0 for DVD.
const POSTER_ASPECT = CASE_DIMS.dvd.w / CASE_DIMS.dvd.h;
export let POSTER_CROP_X = Math.max(
  0,
  (1 - (CASE_WIDTH / CASE_HEIGHT) / POSTER_ASPECT) / 2
);

// VHS-only clamshell "rim" (GH issue #42). Each shelf slot shows TWO boxes:
// the Jellyfin retail cover box in front and the rental clamshell
// BEHIND it. A real rental VHS clamshell is molded a little larger than
// the retail sleeve, so the rental box must be slightly wider and taller than
// the cover box — a strip of black clamshell plastic peeking out around the
// cover's top, right, and bottom edges. The left edge stays flush (that's the
// spine/hinge side). DVD-era cases are cover-sized, so none of this applies
// there — and CASE_WIDTH/CASE_HEIGHT (which shelf placement elsewhere keys
// off) are deliberately left untouched; the enlargement lives only in the
// rental-box geometry built by getRentalGeometry() below.
// Clamshell-vs-sleeve enlargement (see the VHS audit on CASE_DIMS above). A real
// rental clamshell was bigger on every axis than a sleeved retail tape by
// about 10% in width/height — the earlier +0.20/+0.27 in rims modeled barely
// half that ratio, so the clamshell read as the same size as the cover box.
// Sized to the real ratios against the modeled sleeve (4.38 × 8.00 × 1.10 in):
//   width  1.10× → 4.84 in clamshell vs 4.38 in sleeve (+0.46 in = VHS_RIM_RIGHT_FT)
//   height 1.09× → 8.73 in clamshell vs 8.00 in sleeve (+0.73 in = VHS_RIM_VERTICAL_FT)
//   depth  1.14× → 1.25 in clamshell vs 1.10 in sleeve (via VHS_RENTAL_DEPTH_FT)
const VHS_RIM_RIGHT_FT = 0.038; // added to rental width, all on the +X (right) side  (0.46 in)
const VHS_RIM_VERTICAL_FT = 0.060; // added to rental height, split evenly top+bottom (0.73 in)
// The clamshell's OWN depth — deliberately GREATER than the sleeve's CASE_DEPTH
// (0.092 ft) so the hard case reads as clearly thicker than a bare sleeved tape.
// 0.104 ft = 1.25 in (sleeve is 1.10 in). Used only on the rental box geometry;
// CASE_DEPTH still drives the retail cover box and slot depth spacing.
const VHS_RENTAL_DEPTH_FT = 0.104;

// Geometry caches to optimize performance
let caseGeometryRegular: THREE.BufferGeometry | null = null;
let caseGeometryAnimated: THREE.BufferGeometry | null = null;
// Rental (rental clamshell) variants — VHS-only enlargement, see above.
let rentalGeometryRegular: THREE.BufferGeometry | null = null;
let rentalGeometryAnimated: THREE.BufferGeometry | null = null;

// Cache maps for custom dims geometries
const customDimsGeometriesRegular = new Map<string, THREE.BufferGeometry>();
const customDimsGeometriesAnimated = new Map<string, THREE.BufferGeometry>();
const customDimsRentalGeometriesRegular = new Map<string, THREE.BufferGeometry>();
const customDimsRentalGeometriesAnimated = new Map<string, THREE.BufferGeometry>();

// False until the module-init initCaseMedium() below has run once. The
// medium-change cache disposal must not fire on that very first call: the
// cache Maps further down this module are still in their temporal dead zone,
// and there is nothing cached yet anyway.
let caseMediumInitialized = false;

export function initCaseMedium() {
  const prevMedium = CASE_MEDIUM;
  const prevArtMedium = effectiveArtMedium();
  const prevCoverUrl = activeCoverVariant(prevArtMedium).url;
  const theme = getActiveTheme();
  let medium: CaseMedium = theme.defaultMedium;
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('bb_medium');
    if (saved === 'vhs' || saved === 'dvd') {
      medium = saved;
    }
  }
  CASE_MEDIUM = medium;

  let artOverride: CaseArtOverride = 'auto';
  if (typeof localStorage !== 'undefined') {
    const savedArt = localStorage.getItem('bb_case_art');
    if (savedArt === 'auto' || savedArt === 'vhs' || savedArt === 'dvd') {
      artOverride = savedArt;
    }
  }
  CASE_ART_OVERRIDE = artOverride;

  // W3: the 'user' variants exist exactly when their uploads do — sync before
  // validating the cover picks so a persisted bb_cover_*='user' only survives
  // while its upload is still stored (and falls back to the default otherwise).
  syncUserWrapVariants();
  // Same deal for the installed brand pack's own prints ('pack').
  syncBrandPackWrapVariants();

  // Cover-scan picks, one per design family. Unknown/absent ids fall back to
  // the medium's first (default) variant via activeCoverVariant.
  for (const m of ['vhs', 'dvd'] as CaseMedium[]) {
    const saved = typeof localStorage !== 'undefined'
      ? localStorage.getItem(`bb_cover_${m}`)
      : null;
    COVER_SELECTION[m] = COVER_VARIANTS[m].some((v) => v.id === saved)
      ? (saved as string)
      : COVER_VARIANTS[m][0].id;
  }

  CASE_WIDTH = CASE_DIMS[CASE_MEDIUM].w;
  CASE_HEIGHT = CASE_DIMS[CASE_MEDIUM].h;
  CASE_DEPTH = CASE_DIMS[CASE_MEDIUM].d;
  POSTER_CROP_X = Math.max(
    0,
    (1 - (CASE_WIDTH / CASE_HEIGHT) / POSTER_ASPECT) / 2
  );
  // Dispose the old case-geometry templates before dropping them. On a
  // no-reload rebuild this runs after the previous scene is destroyed (so
  // nothing live references these shared templates), and getGeometry() lazily
  // rebuilds them at the new dimensions — without the dispose they'd leak one
  // BufferGeometry pair per rebuild.
  caseGeometryRegular?.dispose();
  caseGeometryAnimated?.dispose();
  caseGeometryRegular = null;
  caseGeometryAnimated = null;
  rentalGeometryRegular?.dispose();
  rentalGeometryAnimated?.dispose();
  rentalGeometryRegular = null;
  rentalGeometryAnimated = null;

  customDimsGeometriesRegular.forEach(geo => geo.dispose());
  customDimsGeometriesRegular.clear();
  customDimsGeometriesAnimated.forEach(geo => geo.dispose());
  customDimsGeometriesAnimated.clear();
  customDimsRentalGeometriesRegular.forEach(geo => geo.dispose());
  customDimsRentalGeometriesRegular.clear();
  customDimsRentalGeometriesAnimated.forEach(geo => geo.dispose());
  customDimsRentalGeometriesAnimated.clear();

  // GH #51: a runtime medium (or box-art) change invalidates every material
  // whose texture bakes in the medium — per-title rental panels drawn
  // from the medium's box scan, letterbox-cropped poster fronts, and the
  // shared generic scan textures. Dispose/redraw them so the rebuild-scene
  // path regenerates for the new medium instead of showing stale art.
  if (
    caseMediumInitialized &&
    (CASE_MEDIUM !== prevMedium ||
      effectiveArtMedium() !== prevArtMedium ||
      activeCoverVariant(effectiveArtMedium()).url !== prevCoverUrl)
  ) {
    disposeMediumScopedCaches();
    // The shared/global material singletons survive the swap with their
    // compiled shaders — retune their surface finish (paperboard vs polywrap
    // vs shell) for the new medium in place. See refreshCaseFinishes.
    refreshCaseFinishes();
  }
  caseMediumInitialized = true;
}

// Initialize immediately so it has safe default values before main.ts re-initializes it.
initCaseMedium();

// Texture dimensions
export const COVER_WIDTH = 320;
export const COVER_HEIGHT = 480;
// The spine texture maps onto the case's -X face (depth × height), so its
// canvas must match that face's physical aspect per medium or the print
// stretches — one fixed 80×480 canvas is what squished the DVD spine. Keep a
// floor on width so the narrow DVD spine still has enough texels to read.
function spineCanvasDims(): { w: number; h: number } {
  const { d, h } = CASE_DIMS[CASE_MEDIUM];
  const w = Math.round(480 * (d / h));
  return w >= 48 ? { w, h: 480 } : { w: 48, h: Math.round(48 * (h / d)) };
}

// Shared Material Cache to optimize performance
let sharedBlackMaterial: THREE.MeshStandardMaterial | null = null;
let sharedWhiteMaterial: THREE.MeshStandardMaterial | null = null;
let sharedRentalBlackMaterial: THREE.MeshStandardMaterial | null = null;
let sharedRentalWhiteMaterial: THREE.MeshStandardMaterial | null = null;
let sharedRentalFrontMaterial: THREE.MeshStandardMaterial | null = null;
let sharedRentalBackPlaceholderMaterial: THREE.MeshStandardMaterial | null = null;
let sharedJellyfinFrontPlaceholderMaterial: THREE.MeshStandardMaterial | null = null;
let sharedJellyfinBackPlaceholderMaterial: THREE.MeshStandardMaterial | null = null;
let sharedRentalSpinePlaceholderMaterial: THREE.MeshStandardMaterial | null = null;
let sharedJellyfinSpinePlaceholderMaterial: THREE.MeshStandardMaterial | null = null;

// Unique Material and Texture Caches
// GH #97: full-res poster PIXELS for every title (CPU-side). This is the
// source both for the deferred high-res texture-array layer uploads and for
// the on-demand per-title DataTextures below. The 320x480 GPU textures
// themselves are NOT created for the whole library at boot — only the
// handful of titles actually displayed on a dedicated (non-instanced) case
// gets one, lazily, via getOrCreatePosterTexture:
//  - the inspected hero case (transient; bounded by a small LRU),
//  - person-endcap cases (pinned while the endcap is up, released on close),
//  - decor fixtures — browse-bin cases and framed wall posters (pinned for the
//    scene's lifetime; bounded by the fixture count).
//
// The pixel cache reaches ~1.7GB JS heap on the ~1950-title demo catalog
// (614,400 B/title × the whole catalog) — the dominant share of the "~8GB
// RSS" reports from launch week. It's an LruByteCache (LRU: Map insertion
// order, oldest-first, re-inserted on every hit — lru-byte-cache.ts); only
// get()/has()/set()/clear() are used anywhere on it, a Map-compatible
// surface. (Entry sizes: full-res 320x480 RGBA = 614,400 B — COVER_WIDTH ×
// COVER_HEIGHT × 4; low-res 64x96 RGBA = 24,576 B.)
//
// THE CONTRACT (2026-08-05 miss-tolerance rework): presence here is an OPTIMIZATION, never an
// invariant — GH #97's old "permanent" contract is retired: it let a bound blank a picked-up/
// hovered box outright and let every aisle change re-decode already-on-GPU shelves in a churn
// storm (both observed on the owner's store at 256MB). Every consumer is now miss-tolerant
// (per-call-site notes at each get()/has() site below, plus store-stock/inspect/clerk-flow's
// callers): a MISS — never-decoded or evicted, handled identically — must never blank what's on
// screen (keep the instanced copy / pinned texture / placeholder material), fires an async
// re-decode via posterQueue.load (worker decode + IndexedDB raw-bytes cache, never a network
// refetch; deduped per title via its queuedItems map), and on arrival swaps the pixels in +
// wakes the render loop (scene.requestRender(), or wakeTextureStream() with no scene ref handy —
// the same nudge a texture-array loaded-flag flip uses, poster-textures.ts). store-stock.ts's
// loadShelfDetails also checks textureArrayManager's loaded flags first (the GPU array is never
// evicted), so a title already on the GPU never redecodes just to refill an evicted CPU entry.
//
// DEFAULT IS BOUNDED: full-res 256MB, low-res 64MB. Override via `bb_poster_cache_mb`
// localStorage (full-res MB; low-res scales at 1/8th of THAT override, floored at 16MB —
// proportional to entry size would starve mid-size catalogs); a very large override (e.g.
// 999999) is the effectively-unbounded escape hatch memory-scale diagnostics use
// (scratch/lru-mem-probe.mjs clears localStorage, so it measures the default).
//
// A bound must exceed the browse working set with real margin: GC-pause cost from
// keypress-driven eviction/redecode churn, not any one perf span (measured: 100MB vs. the perf
// harness's 123MB catalog → +5.1GB churn, dtMs p90 17→36ms/60-move flip session). Re-measure
// with `tools/shot.mjs --perf 60` before changing the constants.
function readPosterCacheOverrideMB(): number | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem('bb_poster_cache_mb');
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
const POSTER_CACHE_OVERRIDE_MB = readPosterCacheOverrideMB();
const DEFAULT_POSTER_CACHE_MB = 256;
const DEFAULT_LOW_RES_CACHE_MB = 64; // NOT the 1/8th-override formula's 32MB — tuned independently
const POSTER_PIXEL_CACHE_BUDGET_BYTES = (POSTER_CACHE_OVERRIDE_MB ?? DEFAULT_POSTER_CACHE_MB) * 1024 * 1024;
export const posterPixelCache = new LruByteCache(POSTER_PIXEL_CACHE_BUDGET_BYTES);
// Low-res backs the whole-store distant-shelf texture-array layer (tiny entries);
// a manual override scales it gently at 1/8th rather than proportional to entry size.
export const lowResCache = new LruByteCache(
  POSTER_CACHE_OVERRIDE_MB != null
    ? Math.max(16 * 1024 * 1024, (POSTER_CACHE_OVERRIDE_MB * 1024 * 1024) / 8)
    : DEFAULT_LOW_RES_CACHE_MB * 1024 * 1024
);
// LRU (Map insertion order, oldest first) of transient hero poster textures.
const HERO_POSTER_LRU_CAP = 16;
const heroPosterTextureLRU = new Map<string, THREE.Texture>();
// Pinned poster textures, exempt from LRU eviction. `permanent` marks fixture
// consumers (bins/wall decor) whose meshes live as long as the scene; endcap
// pins (permanent=false) are demoted back into the LRU when the endcap closes.
const pinnedPosterTextures = new Map<string, { tex: THREE.Texture; permanent: boolean }>();
const posterMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
export const leftmostColorCache = new Map<string, string>();
export const edgeBusyCache = new Map<string, boolean>();
const jellyfinSpineCache = new Map<string, THREE.MeshStandardMaterial>();
// Per-title case-face materials — retail (jellyfin) back plus rental
// (rental) front/spine/back. Each entry owns a mipmapped CanvasTexture
// (~3.3MB for the 640x960 faces), and the four families used to grow
// unbounded per title ever inspected: the one confirmed multi-day leak
// (texturesDelta +212 per 60-flip session, zero reclaim). One shared LRU
// (Map insertion order, oldest first — same pattern as heroPosterTextureLRU
// above) now bounds them all; eviction disposes texture map + material, and
// the next request for that title rebuilds from scratch (a canvas redraw, no
// network). Keys are namespaced per family (jfback_/bbfront_/...).
//
// Eviction while a material is still bound to a long-lived mesh (carried
// stack copies, back-room tapes, person-endcap cases) is deliberately
// tolerated rather than tracked: disposing a CanvasTexture/material never
// frees its source canvas, so the next frame that actually draws that mesh
// re-initializes and re-uploads both transparently (a one-off upload, no
// visual break). Every getter refreshes recency, so anything on-screen
// recently — including the current hero's four faces — sits at the hot end
// and is never the eviction victim.
const CASE_MATERIAL_LRU_CAP = 64; // ~211MB worst case at 4 faces/title
const caseMaterialLRU = new Map<string, THREE.MeshStandardMaterial>();

function caseMaterialLRUGet(key: string): THREE.MeshStandardMaterial | undefined {
  const mat = caseMaterialLRU.get(key);
  if (mat) {
    caseMaterialLRU.delete(key); // refresh recency (re-insert at the new end)
    caseMaterialLRU.set(key, mat);
  }
  return mat;
}

function caseMaterialLRUSet(key: string, mat: THREE.MeshStandardMaterial) {
  caseMaterialLRU.set(key, mat);
  while (caseMaterialLRU.size > CASE_MATERIAL_LRU_CAP) {
    const oldest = caseMaterialLRU.keys().next().value as string;
    const evicted = caseMaterialLRU.get(oldest)!;
    caseMaterialLRU.delete(oldest);
    evicted.map?.dispose();
    evicted.dispose();
  }
}

let plasticWrinkleNormalTex: THREE.Texture | null = null;
let plasticSmudgeRoughnessTex: THREE.Texture | null = null;

// These caches outlive a scene, so they are the ones whose envMap can be left
// pointing at a disposed probe. See case-env-probes.ts for what goes wrong
// without this (feedback/066: the clamshell and boxset render near-black).
onProbesReplaced((repoint) => {
  heroFaceMaterialCache.forEach(repoint);
  caseMaterialLRU.forEach(repoint);
  posterMaterialCache.forEach(repoint);
  jellyfinSpineCache.forEach(repoint);
  repoint(seriesBackPanel?.mat);
});

// Shrink-wrap crease normal map. This drives the *clearcoat* normal — the glossy
// plastic film on top of the matte printed insert — so highlights ripple across
// the surface the way light catches real cellophane, while the artwork beneath
// stays flat and crisp. Higher-res + finer creases than the old version so the
// wrinkles read at inspect-zoom instead of smearing into mush.
function createPlasticWrinkleNormalMap(): THREE.Texture {
  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8080ff'; // Neutral normal (facing forward)
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Two passes: a few long broad folds, then many fine micro-creases.
  const drawCrease = (count: number, width: number, blur: number, strength: number) => {
    ctx.lineWidth = width;
    ctx.shadowBlur = blur;
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * SIZE, Math.random() * SIZE);
      ctx.bezierCurveTo(
        Math.random() * SIZE, Math.random() * SIZE,
        Math.random() * SIZE, Math.random() * SIZE,
        Math.random() * SIZE, Math.random() * SIZE
      );
      // Tilt the normal sideways along the crease (perpendicular ridges read as folds).
      const rVal = Math.floor(128 + (Math.random() * 2 - 1) * strength);
      const gVal = Math.floor(128 + (Math.random() * 2 - 1) * strength);
      const tilt = `rgba(${rVal}, ${gVal}, 255, 0.5)`;
      ctx.strokeStyle = tilt;
      ctx.shadowColor = tilt;
      ctx.stroke();
    }
  };
  drawCrease(8, 5, 8, 70);    // broad gentle folds
  drawCrease(40, 1.5, 3, 55); // fine surface creases

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Grayscale roughness map for the clearcoat: smudges, fingerprints and dust that
// break up the otherwise mirror-perfect gloss. Dark = slick, light = hazed.
// Without this, every case shares one identical razor-sharp highlight, which is
// the dead giveaway of a CG plastic prop.
function createPlasticSmudgeRoughnessMap(): THREE.Texture {
  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  // Base: mostly slick (low roughness) clear film.
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Soft hazy smudges (handling marks).
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 30 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const haze = 120 + Math.random() * 80;
    g.addColorStop(0, `rgba(${haze},${haze},${haze},0.5)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fine dust speckle.
  for (let i = 0; i < 400; i++) {
    const v = 90 + Math.floor(Math.random() * 120);
    ctx.fillStyle = `rgba(${v},${v},${v},0.4)`;
    ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Fine surface-grain normal map shared by the paperboard and polypropylene
// finishes: per-pixel noise (board tooth / molded stipple) plus a few faint
// vertical fiber streaks. Mipmaps average the noise away at shelf distance;
// up close it kills the dead-flat CG look. Subtlety comes from each material's
// normalScale, not the map.
let fineGrainNormalTex: THREE.Texture | null = null;
function getFineGrainNormalMap(): THREE.Texture {
  if (fineGrainNormalTex) return fineGrainNormalTex;
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 128 + (Math.random() * 2 - 1) * 22;     // x tilt
    img.data[i + 1] = 128 + (Math.random() * 2 - 1) * 22; // y tilt
    img.data[i + 2] = 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Faint vertical fiber streaks (paper grain direction).
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * SIZE;
    const tilt = 128 + (Math.random() * 2 - 1) * 16;
    ctx.strokeStyle = `rgba(${tilt}, 128, 255, 0.25)`;
    ctx.lineWidth = 0.8 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() * 2 - 1) * 10, SIZE);
    ctx.stroke();
  }
  fineGrainNormalTex = new THREE.CanvasTexture(canvas);
  fineGrainNormalTex.wrapS = THREE.RepeatWrapping;
  fineGrainNormalTex.wrapT = THREE.RepeatWrapping;
  return fineGrainNormalTex;
}

// ROADMAP B3: what the retail (non-rental) case surface is made of.
// - 'shrinkwrap'  loose cellophane film over the print — the wrinkle-mapped
//                 clearcoat look. Kept for series season boxsets only.
// - 'polywrap'    DVD keepcase (amaray): the printed insert sits flat and taut
//                 behind the case's clear poly sleeve — full clearcoat with
//                 handling smudges but NO wrinkles.
// - 'paperboard'  VHS slipcase: printed cardstock. No film at all; a satin
//                 gloss-ink sheen and paper-grain normal.
// - 'shell'       molded polypropylene: keepcase body (top/bottom/edge faces)
//                 and the white Animated-Movies clamshell. Matte, textured.
export type CaseFinish = 'shrinkwrap' | 'polywrap' | 'paperboard' | 'shell';

// The finish appropriate to the current medium's retail ART faces
// (front/spine/back): VHS boxes are printed paperboard slipcases; DVD
// keepcases wear a clear poly wrap over the printed insert.
function defaultCaseFinish(): CaseFinish {
  return CASE_MEDIUM === 'vhs' ? 'paperboard' : 'polywrap';
}

// The finish for the retail case BODY (the non-art edge faces).
function caseBodyFinish(): CaseFinish {
  return CASE_MEDIUM === 'vhs' ? 'paperboard' : 'shell';
}

// (Re)apply a finish's surface properties to an existing material. Split from
// makePlasticMaterial so refreshCaseFinishes() can retune the persisted
// shared/global singletons in place on a runtime DVD<->VHS swap — those
// deliberately survive medium swaps (their compiled shaders are reused), so
// creation-time-only finishes would go stale.
function applyCaseFinish(mat: THREE.MeshPhysicalMaterial, finish: CaseFinish) {
  mat.userData.caseFinish = finish;
  mat.metalness = 0.0;
  switch (finish) {
    case 'shrinkwrap':
      mat.roughness = 0.55;
      mat.envMapIntensity = 1.1;
      mat.clearcoat = 1.0;
      mat.clearcoatRoughness = 0.12;
      mat.clearcoatRoughnessMap = (plasticSmudgeRoughnessTex ??= createPlasticSmudgeRoughnessMap());
      mat.clearcoatNormalMap = (plasticWrinkleNormalTex ??= createPlasticWrinkleNormalMap());
      mat.clearcoatNormalScale.set(0.22, 0.22);
      mat.normalMap = null;
      break;
    case 'polywrap':
      // Retail DVD keepcase: polypropylene with a soft, slightly matte sheen —
      // NOT the wet-mirror gloss a full clearcoat produced. Dialed back from the
      // old clearcoat 1.0 / clearcoatRoughness 0.16 (wet look) toward the matte
      // 'shell' body so reflections read as soft plastic, not liquid glass:
      // base roughness up, envMap intensity down (softer reflections), clearcoat
      // reduced to a low, rough sheen coat.
      mat.roughness = 0.58;
      // 0.7 → 0.85: the cases read a touch dim against the IBL-lit room —
      // more of the environment's light on the art without touching the
      // room's own brightness (same bump on paperboard/shell/rental below).
      mat.envMapIntensity = 0.85;
      mat.clearcoat = 0.35;
      mat.clearcoatRoughness = 0.4;
      mat.clearcoatRoughnessMap = (plasticSmudgeRoughnessTex ??= createPlasticSmudgeRoughnessMap());
      mat.clearcoatNormalMap = null; // the sleeve holds the insert taut — no wrinkles
      mat.clearcoatNormalScale.set(0, 0);
      mat.normalMap = null;
      break;
    case 'paperboard':
      mat.roughness = 0.46; // satin gloss-ink sheen, a touch glossier — still not plastic wet-look
      mat.envMapIntensity = 0.95; // 0.8 → 0.95, see polywrap note
      mat.clearcoat = 0.08; // faint ink-varnish sheen over the cardstock
      mat.clearcoatRoughnessMap = null;
      mat.clearcoatNormalMap = null;
      mat.clearcoatNormalScale.set(0, 0);
      mat.normalMap = getFineGrainNormalMap();
      mat.normalScale.set(0.35, 0.35);
      break;
    case 'shell':
      mat.roughness = 0.68;
      mat.envMapIntensity = 0.65; // 0.55 → 0.65, see polywrap note
      mat.clearcoat = 0.0;
      mat.clearcoatRoughnessMap = null;
      mat.clearcoatNormalMap = null;
      mat.clearcoatNormalScale.set(0, 0);
      mat.normalMap = getFineGrainNormalMap();
      mat.normalScale.set(0.2, 0.2);
      break;
  }
  mat.needsUpdate = true; // map/clearcoat presence changes shader defines
}

// Build a retail/rental case material. The artwork/colour is the printed
// layer; the finish decides what covers it (see CaseFinish). This single
// helper replaces the old scattered MeshStandardMaterial({ roughness:0.15,
// emissive }) — note: NO emissive. Black levels are restored to the scene
// lighting.
interface PlasticOpts {
  map?: THREE.Texture | null;
  color?: THREE.ColorRepresentation;
  envMap?: THREE.Texture | null;
  baseRoughness?: number; // rental path only — non-rental roughness is finish-owned
  isRentalCase?: boolean;
  finish?: CaseFinish; // non-rental only; defaults per medium (defaultCaseFinish)
}
export function makePlasticMaterial(opts: PlasticOpts): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    map: opts.map ?? null,
    color: opts.color !== undefined ? new THREE.Color(opts.color) : 0xffffff,
    metalness: 0.0,
    envMap: opts.envMap ?? null,
  });
  if (opts.isRentalCase) {
    // The rental clamshell's scuffed molded plastic — its own thing.
    mat.roughness = opts.baseRoughness ?? 0.6;
    mat.envMapIntensity = 0.8; // 0.7 → 0.8, matching the retail-case bump

    mat.clearcoat = 0.4;
    mat.clearcoatRoughness = 0.75;
    mat.clearcoatNormalScale.set(0, 0);
  } else {
    // Remember whether the finish was pinned by the caller (series shrinkwrap,
    // case-body shell) or derived from the medium — refreshCaseFinishes only
    // retunes the derived ones on a runtime medium swap.
    mat.userData.explicitFinish = opts.finish ?? null;
    applyCaseFinish(mat, opts.finish ?? defaultCaseFinish());
  }
  return mat;
}

// Runtime DVD<->VHS swap: retune every persisted non-rental singleton
// (shared placeholders, case-body materials, the compiled global instanced
// materials, and the colour-keyed spine cache — none of which are disposed by
// disposeMediumScopedCaches) to the new medium's finishes. Per-title caches
// (posterMaterialCache, caseMaterialLRU) ARE disposed on swap and rebuild
// with the right finish on their own. Series panels stay 'shrinkwrap' always.
function refreshCaseFinishes() {
  const artFinish = defaultCaseFinish();
  const bodyFinish = caseBodyFinish();
  for (const m of [
    sharedJellyfinFrontPlaceholderMaterial,
    sharedJellyfinBackPlaceholderMaterial,
    sharedJellyfinSpinePlaceholderMaterial,
    sharedJellyfinFrontPlaceholderMaterialAnimated,
    globalFrontMaterialRegular,
    globalFrontMaterialAnimated,
    globalSpineMaterialRegular,
    globalSpineMaterialAnimated,
  ]) {
    if (m) applyCaseFinish(m as THREE.MeshPhysicalMaterial, artFinish);
  }
  if (sharedBlackMaterial) applyCaseFinish(sharedBlackMaterial as THREE.MeshPhysicalMaterial, bodyFinish);
  // sharedWhiteMaterial is the Animated-Movies clamshell body: molded plastic
  // in both mediums, but reapply anyway in case shell params ever diverge.
  if (sharedWhiteMaterial) applyCaseFinish(sharedWhiteMaterial as THREE.MeshPhysicalMaterial, 'shell');
  jellyfinSpineCache.forEach((m) => {
    const pinned = (m.userData.explicitFinish as CaseFinish | null) ?? null;
    applyCaseFinish(m as THREE.MeshPhysicalMaterial, pinned ?? artFinish);
  });
}

/**
 * Tear down cached GPU resources owned by this module.
 *
 * 'full' (default) — disposes everything, for logout / app teardown where the
 * page (and every module singleton) is about to be thrown away anyway.
 *
 * 'rebuild' — a no-reload StoreScene rebuild (quality / medium / arrangement /
 * theme change). Here we deliberately PRESERVE every expensive or shared
 * singleton: the downloaded poster textures + their CPU pixel data (so the new
 * scene re-populates the texture array with zero network), the leftmost-colour
 * cache, the shared/global case materials (which the persisted global shader
 * materials captured references to at first init — disposing them would leave
 * those globals pointing at freed textures), and the per-title material
 * caches. (When the rebuild is caused by a MEDIUM change, initCaseMedium
 * separately invalidates the medium-scoped subset of those caches — see
 * disposeMediumScopedCaches below.) The only thing cleared here is the
 * pending poster-load queue, so
 * in-flight callbacks can't fire into the now-destroyed scene's meshes. The
 * texture-array reallocation is handled (and old arrays disposed) by
 * TextureArrayManager.init() in the fresh scene.
 */
export function clearVideoCaseCache(mode: 'full' | 'rebuild' = 'full') {
  if (mode === 'rebuild') {
    posterQueue.clear();
    return;
  }
  customDimsGeometriesRegular.forEach(geo => geo.dispose());
  customDimsGeometriesRegular.clear();
  customDimsGeometriesAnimated.forEach(geo => geo.dispose());
  customDimsGeometriesAnimated.clear();
  customDimsRentalGeometriesRegular.forEach(geo => geo.dispose());
  customDimsRentalGeometriesRegular.clear();
  customDimsRentalGeometriesAnimated.forEach(geo => geo.dispose());
  customDimsRentalGeometriesAnimated.clear();
  disposeSeriesPanelResources();

  if (sharedBlackMaterial) { sharedBlackMaterial.dispose(); sharedBlackMaterial = null; }
  if (sharedWhiteMaterial) { sharedWhiteMaterial.dispose(); sharedWhiteMaterial = null; }
  if (sharedRentalBlackMaterial) { sharedRentalBlackMaterial.dispose(); sharedRentalBlackMaterial = null; }
  if (sharedRentalWhiteMaterial) { sharedRentalWhiteMaterial.dispose(); sharedRentalWhiteMaterial = null; }
  if (sharedRentalFrontMaterial) {
    sharedRentalFrontMaterial.map?.dispose();
    sharedRentalFrontMaterial.dispose();
    sharedRentalFrontMaterial = null;
  }
  if (sharedRentalBackPlaceholderMaterial) {
    sharedRentalBackPlaceholderMaterial.map?.dispose();
    sharedRentalBackPlaceholderMaterial.dispose();
    sharedRentalBackPlaceholderMaterial = null;
  }
  if (sharedJellyfinFrontPlaceholderMaterial) {
    sharedJellyfinFrontPlaceholderMaterial.map?.dispose();
    sharedJellyfinFrontPlaceholderMaterial.dispose();
    sharedJellyfinFrontPlaceholderMaterial = null;
  }
  if (sharedJellyfinBackPlaceholderMaterial) {
    sharedJellyfinBackPlaceholderMaterial.dispose();
    sharedJellyfinBackPlaceholderMaterial = null;
  }
  if (sharedRentalSpinePlaceholderMaterial) {
    sharedRentalSpinePlaceholderMaterial.dispose();
    sharedRentalSpinePlaceholderMaterial = null;
  }
  if (sharedJellyfinSpinePlaceholderMaterial) {
    sharedJellyfinSpinePlaceholderMaterial.dispose();
    sharedJellyfinSpinePlaceholderMaterial = null;
  }

  jellyfinSpineCache.forEach(mat => {
    mat.map?.dispose();
    mat.dispose();
  });
  jellyfinSpineCache.clear();

  // One shared LRU holds all four per-title case-face families (jellyfin
  // back + rental front/spine/back); every entry owns its map.
  caseMaterialLRU.forEach(mat => {
    mat.map?.dispose();
    mat.dispose();
  });
  caseMaterialLRU.clear();

  // Hero-face materials share the singleton canvas textures, which are redrawn
  // in place and survive cache clears — dispose the materials here and the
  // slots (canvas + texture) with them, since a full teardown means the next
  // scene's first inspect rebuilds from scratch anyway.
  heroFaceMaterialCache.forEach(mat => mat.dispose());
  heroFaceMaterialCache.clear();
  heroFaceSlots.forEach(slot => slot.tex.dispose());
  heroFaceSlots.clear();

  heroPosterTextureLRU.forEach(tex => tex.dispose());
  heroPosterTextureLRU.clear();
  pinnedPosterTextures.forEach(p => p.tex.dispose());
  pinnedPosterTextures.clear();
  posterPixelCache.clear();
  // Full teardown (logout / server change): the next scene's catalog is
  // unrelated to the layers on hand, so never reuse them.
  invalidatePosterLayers();
  disposeCleanDecorTextures();

  posterMaterialCache.forEach(mat => mat.dispose());
  posterMaterialCache.clear();
  leftmostColorCache.clear();
  edgeBusyCache.clear();
  backCoverTextPlacementCache.clear();
  disposeHeroFrontDetail();
  disposeHeroBackdrop();
  posterQueue.clear();
}

/**
 * GH #51: invalidate everything whose TEXTURE bakes in the medium, called by
 * initCaseMedium when a no-reload rebuild changes CASE_MEDIUM (or the box-art
 * override). Runs between the settings drawer closing and the fresh scene
 * being built, so nothing renders with the disposed resources in between.
 *
 * Two different treatments, both leak-free:
 *  - Per-title caches (rental front/back/spine drawn from the medium's
 *    box scan, jellyfin backs whose white-border shader tracks VHS, poster
 *    front materials whose letterbox crop bakes POSTER_CROP_X, and — since
 *    the worker's decode became mode-aware for GH #93 — the poster
 *    texture/pixel caches themselves) are disposed and cleared, rebuilt
 *    lazily on demand. Poster pixels re-decode from the worker's IndexedDB
 *    raw-bytes cache, so no network is paid.
 *  - The shared generic scan textures (front logo panel, back placeholder)
 *    are REDRAWN IN PLACE on their existing canvases: the persisted global
 *    shader materials and globalBackMaterialRegular hold references to these
 *    exact texture/material objects, so dispose-and-recreate would leave
 *    them pointing at freed GPU textures.
 */
function disposeMediumScopedCaches() {
  // The boxset geometry is derived from CASE_WIDTH/HEIGHT/DEPTH, so a medium
  // change invalidates it (the panel canvases are medium-agnostic and stay).
  seriesBoxsetGeometry?.dispose();
  seriesBoxsetGeometry = null;

  caseMaterialLRU.forEach(mat => {
    mat.map?.dispose();
    mat.dispose();
  });
  caseMaterialLRU.clear();

  const ownedPosterTextures = new Set<THREE.Texture>();
  heroPosterTextureLRU.forEach(tex => ownedPosterTextures.add(tex));
  pinnedPosterTextures.forEach(p => ownedPosterTextures.add(p.tex));
  posterMaterialCache.forEach(mat => {
    if (mat.map && !ownedPosterTextures.has(mat.map)) mat.map.dispose();
    mat.dispose();
  });
  posterMaterialCache.clear();

  // GH #93: the decoded poster PIXELS are medium-dependent now (the worker
  // bakes the VHS-only letterbox in at decode time), so the pixel-level
  // caches a rebuild normally preserves must go too. The fresh scene
  // re-queues the loads and the worker re-decodes from its IndexedDB
  // raw-bytes cache — no network refetch.
  heroPosterTextureLRU.forEach(tex => tex.dispose());
  heroPosterTextureLRU.clear();
  pinnedPosterTextures.forEach(p => p.tex.dispose());
  pinnedPosterTextures.clear();
  posterPixelCache.clear();
  lowResCache.clear();
  disposeLowResFrontMaterials();
  disposeHeroFrontDetail();
  disposeHeroBackdrop();
  // The array layers on the GPU hold art decoded for the OUTGOING medium, so
  // the rebuild fast path must not keep them — force a real reallocation.
  invalidatePosterLayers();
  disposeCleanDecorTextures();

  redrawSharedScanTexture(sharedRentalFrontMaterial, 'front');
  redrawSharedScanTexture(sharedRentalBackPlaceholderMaterial, 'back');
}

/** Redraw a shared box-scan canvas texture for the current medium, in place. */
function redrawSharedScanTexture(
  mat: THREE.MeshStandardMaterial | null,
  panel: 'front' | 'back',
) {
  const tex = mat?.map;
  if (!tex) return;
  const canvas = tex.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  if (panel === 'front') {
    drawRentalFrontArt(ctx, canvas.width, canvas.height, null, () => {
      paintRentalRimBorder(ctx, canvas.width, canvas.height);
      tex.needsUpdate = true;
    });
    paintRentalRimBorder(ctx, canvas.width, canvas.height);
  } else {
    drawRentalBackArt(ctx, canvas.width, canvas.height, 'GENERIC_WARNINGS', () => {
      tex.needsUpdate = true;
    });
  }
  tex.needsUpdate = true;
}


class WorkerPool {
  private workers: Worker[] = [];
  private nextWorkerIndex = 0;
  private callbacks = new Map<number, { resolve: Function, reject: Function }>();
  private messageId = 0;

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./poster-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const { id, highResData, lowResData, leftmostColor, edgeBusy, bandEnergy, success, error } = e.data;
        const cb = this.callbacks.get(id);
        if (cb) {
          if (success) {
            cb.resolve({ 
              highResData: new Uint8Array(highResData), 
              lowResData: new Uint8Array(lowResData), 
              leftmostColor,
              edgeBusy,
              bandEnergy
            });
          } else {
            cb.reject(new Error(error));
          }
          this.callbacks.delete(id);
        }
      };
      this.workers.push(worker);
    }
  }

  // `scale`/`forceLetterbox` (see the worker's decodeImageBytes): the inspected
  // case asks for a HERO_COVER_SCALE decode of the same art, pinning the fit
  // decision the shelf decode already made so the swap on pickup is a sharpen
  // in place rather than a reframe.
  public async decode(url: string, mode: DecodeMode, faceAspect?: number, scale?: number, forceLetterbox?: boolean): Promise<{ highResData: Uint8Array, lowResData: Uint8Array, leftmostColor: string, edgeBusy: boolean, bandEnergy: number }> {
    // In the Tauri app, fetch the image bytes through the same host that proxies
    // metadata so box art loads wherever the catalog does — even when the saved
    // Jellyfin URL points at a host the webview can't reach directly (e.g.
    // localhost while accessing from another Tailscale node).
    const buffer = await fetchPosterBytes(url);

    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      this.callbacks.set(id, { resolve, reject });
      const worker = this.workers[this.nextWorkerIndex];
      this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
      if (buffer) {
        // Always include the URL so the worker can use it as a pixel-cache key.
        worker.postMessage({ buffer, url, id, mode, faceAspect, scale, forceLetterbox }, { transfer: [buffer] });
      } else {
        // Web fallback (no Tauri proxy): the app is served from the same host
        // that runs Jellyfin, so a saved URL pointing at localhost/127.0.0.1
        // won't resolve from a remote browser. Rewrite it to the host the user
        // actually connected to.
        worker.postMessage({ url: rewriteLocalhost(url), id, mode, faceAspect, scale, forceLetterbox });
      }
    });
  }
}

const workerCount = Math.min(Math.max(navigator.hardwareConcurrency || 4, 2), 8);
export const posterWorkerPool = new WorkerPool(workerCount);



// `rental` picks the rental clamshell variant (slightly larger on VHS,
// see getRentalGeometry) — pass true for the shelf BACK meshes that render
// the rental box behind each retail cover box.
// `noPosterCrop` exempts every instance from the global front material's VHS
// poster crop (uPosterCropX): game boxes keep their media-class face (see
// gameCaseDims) in both mediums and their art is decoded to fit that face
// ('fill'/'cart', #93), so the movie-medium crop would cut real art. Front
// meshes only; the attribute defaults to 0 (crop applies) everywhere else.
export function createClonedCaseGeometry(
  count: number,
  isAnimated: boolean = false,
  rental: boolean = false,
  dims?: { w: number; h: number; d: number },
  noPosterCrop: boolean = false
): THREE.BufferGeometry {
  const baseGeo = rental ? getRentalGeometry(isAnimated, dims) : getGeometry(isAnimated, dims);
  const geo = baseGeo.clone();

  // Add aTextureIndex instanced attribute
  const texIndices = new Float32Array(count);
  const texIdxAttr = new THREE.InstancedBufferAttribute(texIndices, 1);
  geo.setAttribute('aTextureIndex', texIdxAttr);

  // Add aSpineColor instanced attribute (default to white/grey)
  const spineColors = new Float32Array(count * 3);
  spineColors.fill(1.0); // start with white
  const spineColorAttr = new THREE.InstancedBufferAttribute(spineColors, 3);
  geo.setAttribute('aSpineColor', spineColorAttr);

  // Add aPosterCropSkip instanced attribute (1 = ignore uPosterCropX)
  const cropSkips = new Float32Array(count);
  if (noPosterCrop) cropSkips.fill(1.0);
  const cropSkipAttr = new THREE.InstancedBufferAttribute(cropSkips, 1);
  geo.setAttribute('aPosterCropSkip', cropSkipAttr);

  return geo;
}

export function getMovieOffsets(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);
  const r1 = ((absHash % 137) / 137) * 2 - 1;
  const r2 = (((absHash >> 4) % 137) / 137) * 2 - 1;
  const r3 = (((absHash >> 8) % 137) / 137) * 2 - 1;
  return { r1, r2, r3 };
}

// The REQUEST/COMING SOON corner label (collection-gap/discovery titles) and
// the WATCH ON <SERVICE> one (GH #86 streaming titles) live in
// case-corner-stickers.ts — extracted so this file stays under its line
// budget (tools/check-file-budget.mjs). restampCollectionGapCase below still
// calls stampCollectionGapSticker (imported at the top of this file).

/**
 * Live restyle for a not-in-stock case (collection gap or inline discovery
 * suggestion) the user just ordered: stamp the
 * requested (gold COMING SOON) label over the cached poster pixels and push
 * them back through every surface that shows them — the shelf texture
 * arrays, the CPU pixel cache future hero/endcap textures build from, and
 * any already-built hero texture on screen right now (the usual case: you
 * order FROM the inspect view). No-op if the poster hasn't decoded yet OR its
 * pixel-cache entry was evicted since — either way the decode path re-checks
 * requested state and stamps gold itself once it (re)runs, so skipping here
 * is a safe defer (the sanctioned degradation for this path), not a dropped
 * update.
 */
export function restampCollectionGapCase(movie: Movie): void {
  // The inspected case's 3x front holds its own copy of the pixels, so it needs
  // the new label painted on too — you order FROM the inspect view, and without
  // this the box in your hands would keep the blue REQUEST while every other
  // surface went gold.
  restampHeroFront(movie);
  const high = posterPixelCache.get(movie.id);
  if (high) {
    const stamped = stampCollectionGapSticker(high, COVER_WIDTH, COVER_HEIGHT, movie.id, true);
    posterPixelCache.set(movie.id, stamped);
    const renderer = getUploadRenderer();
    if (renderer) {
      // update*, not queue* — the queue wrappers dedupe on "already uploaded",
      // which is exactly what a restamp needs to bypass.
      queueTextureUpload(() => {
        textureArrayManager.updateHighRes(renderer, movie.id, stamped);
        textureArrayManager.setHighResLoaded(movie.id, true);
      });
    }
    const heroTex = pinnedPosterTextures.get(movie.id)?.tex ?? heroPosterTextureLRU.get(movie.id);
    if (heroTex) {
      // Always a createPosterDataTexture DataTexture, so image is {data,w,h}.
      (heroTex.image as { data: Uint8Array }).data.set(stamped);
      heroTex.needsUpdate = true;
      // The VHS front material maps a crop CLONE of the base texture: it
      // shares this pixel buffer but owns its GL texture, so flag it too.
      const prefix = `${movie.id}_anim_`;
      posterMaterialCache.forEach((mat, key) => {
        if (key.startsWith(prefix) && mat.map && mat.map !== heroTex) mat.map.needsUpdate = true;
      });
    }
  }
  const low = lowResCache.get(movie.id);
  if (low) {
    const stamped = stampCollectionGapSticker(low, 64, 96, movie.id, true);
    lowResCache.set(movie.id, stamped);
    const renderer = getUploadRenderer();
    if (renderer) {
      queueTextureUpload(() => {
        textureArrayManager.updateLowRes(renderer, movie.id, stamped);
      });
    }
  }
}

// The staff-picks engine's sticker (see staff-picks.ts): a hand-applied gold
// starburst in the bottom-LEFT corner — the classic video-store "our staff
// loved this" shelf cue. Bottom-left on purpose: the collection-gap label owns
// bottom-right, the 4K badge the right side, and the discovery banner the
// poster's bottom edge (the starburst sits just above it), so every
// combination that can co-occur stays readable.
export function stampStaffPickSticker(data: Uint8Array, w: number, h: number, movieId: string): Uint8Array {
  const { r1, r2, r3 } = getMovieOffsets(movieId);
  const spec = wrapLogoSpec();

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(w, h);
  imgData.data.set(data);
  ctx.putImageData(imgData, 0, 0);

  // Same buffer-orientation convention as stampCollectionGapSticker: the
  // poster buffer is bottom-up, so a LOW y here is the poster's bottom.
  const R = w * 0.155;
  const cx = w * 0.185 + r1 * (w * 0.012);
  const cy = h * 0.175 + r2 * (h * 0.010);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(r3 * 0.14);

  const points = 14;
  const inner = R * 0.8;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? R : inner;
    const a = (i / (points * 2)) * Math.PI * 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  // Brand colours off the wrap logo spec so every theme's sticker matches its
  // store: gold body, blue lettering (the requested-gap palette, but a
  // starburst — shape and corner are what tell the two apart at a glance).
  ctx.fillStyle = spec.textColor;
  ctx.fill();
  // Die-cut white edge, same as the other stickers: stuck ON, not printed in.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = Math.max(1.5, w * 0.008);
  ctx.stroke();

  if (w >= 320) {
    // Flip for the buffer orientation, like the gap sticker's emblem.
    ctx.scale(1, -1);
    ctx.fillStyle = spec.bodyColor;
    ctx.font = `bold ${Math.round(R * 0.42)}px ${BB_ARCHIVO_BLACK}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FOR', 0, -R * 0.24);
    ctx.fillText('YOU', 0, R * 0.28);
  }
  // At 64x96 the star is a few pixels across — a plain gold chip, enough to
  // say "a sticker is there" until the high-res layer lands.

  ctx.restore();
  return new Uint8Array(ctx.getImageData(0, 0, w, h).data);
}

class PosterLoadingQueue {
  private queue: Array<{
    movieId: string;
    movie: Movie;
    priority: number;
    callbacks: Array<(pixels: Uint8Array) => void>;
    settledCallbacks: Array<() => void>;
  }> = [];
  private queuedItems = new Map<string, {
    movieId: string;
    movie: Movie;
    priority: number;
    callbacks: Array<(pixels: Uint8Array) => void>;
    settledCallbacks: Array<() => void>;
  }>();
  private sortPending = false;
  private activeCount = 0;
  private maxConcurrent = 100;

  /**
   * `onSettled`, if provided, always fires exactly once — on success AND on
   * failure — so callers waiting on the full catalog to finish loading (e.g.
   * gating the initial scene reveal) never hang on a single bad/unreachable
   * poster URL.
   *
   * GH #97: callbacks receive the decoded full-res PIXELS, not a GPU texture —
   * consumers that actually display a per-title texture obtain one lazily via
   * getPosterMaterial/getDecorPosterTexture.
   */
  public load(movie: Movie, priority: number, callback: (pixels: Uint8Array) => void, onSettled?: () => void) {
    if (!movie.posterUrl) { onSettled?.(); return; }

    if (posterPixelCache.has(movie.id)) {
      callback(posterPixelCache.get(movie.id)!);
      onSettled?.();
      return;
    }

    const existing = this.queuedItems.get(movie.id);
    if (existing) {
      existing.callbacks.push(callback);
      if (onSettled) existing.settledCallbacks.push(onSettled);
      if (priority > existing.priority) {
        existing.priority = priority;
        this.scheduleSort();
      }
      return;
    }

    const item = {
      movieId: movie.id,
      movie,
      priority,
      callbacks: [callback],
      settledCallbacks: onSettled ? [onSettled] : []
    };
    this.queue.push(item);
    this.queuedItems.set(movie.id, item);
    this.scheduleSort();
    this.processNext();
  }

  private scheduleSort() {
    if (!this.sortPending) {
      this.sortPending = true;
      requestAnimationFrame(() => {
        this.sortQueue();
        this.sortPending = false;
      });
    }
  }

  public clear() {
    this.queue = [];
    this.queuedItems.clear();
  }

  private sortQueue() {
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  private async processNext() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift()!;
    this.queuedItems.delete(item.movieId);
    this.activeCount++;
    try {
      const url = item.movie.posterUrl!;
      // GH #93: letterboxing is VHS-only for movies. A game whose real carton
      // is on file gets 'fill': the case face already IS that carton's aspect,
      // so contain-fitting could only add bars — and scan sources normalise art
      // to their own aspect (ScreenScraper hands out square Game Boy fronts),
      // so filling also pulls the art back to the true box proportions. Only a
      // platform with no carton on file still contain-fits onto the generic
      // clamshell ('cart'), where bars beat distorting art onto a wrong shape.
      const mode: DecodeMode = item.movie.game
        ? (hasRealGameBox(item.movie.platform) ? 'fill' : 'cart')
        : POSTER_CROP_X > 0 ? 'vhs' : 'crop';
      // 'cart' still needs the target face aspect for its contain-fit.
      const { highResData, lowResData, leftmostColor, edgeBusy } = await posterWorkerPool.decode(
        url, mode, mode === 'cart' ? gameFaceAspect(item.movie.platform) : undefined);

      // Priority lane: this task caches the decoded pixels and fires the
      // settle callbacks that texturesReadyPromise (the boot overlay) waits on,
      // so it must not sit behind a bulk re-upload backlog.
      queueTextureUpload(() => {
        leftmostColorCache.set(item.movieId, leftmostColor);
        edgeBusyCache.set(item.movieId, edgeBusy);

        // Every badge the case wears — 4K, the not-in-stock corner label, the
        // staff-pick starburst — stamped by fraction of the buffer, so the same
        // pass serves the 320x480 shelf art, the 64x96 distance layer and the
        // inspected case's 960x1440 front (hero-front-detail.ts). Keeping ONE
        // stamping site is what stops a case from gaining or losing a sticker
        // purely by being picked up.
        const finalHighRes = stampPosterBadges(highResData, COVER_WIDTH, COVER_HEIGHT, item.movie);
        const finalLowRes = stampPosterBadges(lowResData, 64, 96, item.movie);

        lowResCache.set(item.movieId, finalLowRes);

        const renderer = getUploadRenderer();
        if (renderer) {
          // Budgeted queue, not synchronous uploads: the 8 decode workers
          // finish in clusters, and one event-loop turn used to flush dozens
          // of completions — perf-trace caught 73 layer uploads (584
          // texSubImage3D calls) in a single frame. The queue tasks flip the
          // shader loaded-flags themselves once the pixels are really up.
          textureArrayManager.queueLowRes(renderer, item.movieId, finalLowRes);
          if (item.priority >= 1) {
            textureArrayManager.queueHighRes(renderer, item.movieId, finalHighRes);
          }
        }

        // GH #97: cache only the CPU pixels — no per-title 320x480 GPU texture
        // is created or uploaded here. Shelves render from the array layers
        // uploaded above; the few dedicated cases (hero/endcap/decor) create
        // their texture lazily from this cache when actually displayed.
        posterPixelCache.set(item.movieId, finalHighRes);
        item.callbacks.forEach(cb => cb(finalHighRes));
        item.settledCallbacks.forEach(cb => cb());
      }, 'priority');
    } catch (err) {
      console.warn("Failed to load poster image:", err);
      item.settledCallbacks.forEach(cb => cb());
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }
}

export const posterQueue = new PosterLoadingQueue();

function getJellyfinSpineMaterial(hexColor: string | null, probeIdx?: number, isAnimated: boolean = false, finish?: CaseFinish): THREE.MeshStandardMaterial {
  const colorStr = hexColor || '#0f172a'; // Default slate blue placeholder
  const cacheKey = `${colorStr}_anim_${isAnimated}_${probeIdx !== undefined ? probeIdx : 'none'}_fin_${finish ?? 'default'}`;
  if (jellyfinSpineCache.has(cacheKey)) {
    return jellyfinSpineCache.get(cacheKey)!;
  }

  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;

  const mat = makePlasticMaterial({ color: colorStr, envMap: env, finish });
  if (isAnimated) {
    applyWhiteBorderShaderColor(mat);
  }

  jellyfinSpineCache.set(cacheKey, mat);
  return mat;
}

// Crop a front-face art texture to the current medium. On DVD this is a no-op;
// on VHS it returns a clone that samples only the central POSTER_CROP_X..(1-crop)
// band horizontally, so 2:3 art fills the narrower VHS face without distortion.
// The clone shares the image but has its own offset/repeat so the original
// (also uploaded into the texture array) is untouched.
export function cropFrontTextureForMedium(texture: THREE.Texture): THREE.Texture {
  if (POSTER_CROP_X <= 0) return texture;
  const cropped = texture.clone();
  cropped.wrapS = THREE.ClampToEdgeWrapping;
  cropped.offset.x = POSTER_CROP_X;
  cropped.repeat.x = 1 - 2 * POSTER_CROP_X;
  cropped.needsUpdate = true;
  return cropped;
}

// GH #97 — lazy per-title poster textures. How strongly a consumer holds one:
//  - 'none'    hero inspect case: transient, kept in a small LRU;
//  - 'endcap'  person-endcap cases: pinned while the endcap mesh is live,
//              demoted back into the LRU via releaseEndcapPosterTexture;
//  - 'fixture' decor bins / framed wall posters: pinned for the scene's life
//              (their meshes hold the material forever, so eviction would
//              leave them black); disposed with the medium/full cache clears.
type PosterPin = 'none' | 'endcap' | 'fixture';

/** Build the full-res poster DataTexture from cached CPU pixels. */
function createPosterDataTexture(pixels: Uint8Array): THREE.DataTexture {
  const tex = new THREE.DataTexture(pixels, COVER_WIDTH, COVER_HEIGHT, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// Drop this title's cached poster materials along with their crop clones (the
// VHS front material maps a clone of the base texture that owns its own GL
// texture — see cropFrontTextureForMedium). Called on LRU eviction so the next
// request rebuilds from the pixel cache instead of sampling a freed texture.
function disposePosterMaterialsFor(movieId: string, baseTex: THREE.Texture) {
  const prefix = `${movieId}_anim_`;
  posterMaterialCache.forEach((mat, key) => {
    if (!key.startsWith(prefix)) return;
    if (mat.map && mat.map !== baseTex) mat.map.dispose();
    mat.dispose();
    posterMaterialCache.delete(key);
  });
}

function evictHeroPosterOverflow() {
  while (heroPosterTextureLRU.size > HERO_POSTER_LRU_CAP) {
    const oldest = heroPosterTextureLRU.keys().next().value as string;
    const tex = heroPosterTextureLRU.get(oldest)!;
    heroPosterTextureLRU.delete(oldest);
    disposePosterMaterialsFor(oldest, tex);
    tex.dispose();
  }
}

// Fetch (or lazily create + upload) the full-res texture for one title,
// honouring the strongest pin requested so far. Returns null only when the
// pixels haven't streamed in yet.
function getOrCreatePosterTexture(movieId: string, pin: PosterPin): THREE.Texture | null {
  const pinned = pinnedPosterTextures.get(movieId);
  if (pinned) {
    if (pin === 'fixture') pinned.permanent = true; // fixture pins are sticky
    return pinned.tex;
  }
  let tex = heroPosterTextureLRU.get(movieId);
  if (tex) {
    heroPosterTextureLRU.delete(movieId);
    if (pin === 'none') heroPosterTextureLRU.set(movieId, tex); // refresh recency
    else pinnedPosterTextures.set(movieId, { tex, permanent: pin === 'fixture' });
    return tex;
  }
  const pixels = posterPixelCache.get(movieId);
  if (!pixels) return null;
  tex = createPosterDataTexture(pixels);
  // Pay the GPU upload now — callers run inside the budgeted upload loop or on
  // a one-off inspect/selection, never per frame.
  uploadTextureNow(tex);
  if (pin === 'none') {
    heroPosterTextureLRU.set(movieId, tex);
    evictHeroPosterOverflow();
  } else {
    pinnedPosterTextures.set(movieId, { tex, permanent: pin === 'fixture' });
  }
  return tex;
}

/** Fixture-lifetime poster texture for decor (framed wall posters). */
export function getDecorPosterTexture(movieId: string): THREE.Texture | null {
  return getOrCreatePosterTexture(movieId, 'fixture');
}

// Decor posters (window glass / framed wall art) are flat 2:3 prints, so
// their pixels must be a pure cover-crop: no rental 4K sticker (that badge
// marks rental stock, not promo art) and no VHS letterbox bars (the 'vhs'
// decode contain-fits busy/landscape art into the sleeve's visible band —
// correct behind a case front's crop window, but hung in a frame the bars
// show, feedback pin 011). The shared posterPixelCache stores the
// stickered, medium-mode pixels on purpose: the shelf high-res array uploads
// (loadShelfDetails) and the hero case front (getPosterMaterial) read from it
// and legitimately want them. So rather than fork that cache, decor titles
// that can't reuse it decode one clean 'crop' copy of their own. Decor
// posters number in the handful and are fixture-pinned for the scene's life,
// so this is a few extra decodes at build time (served from the worker's
// IndexedDB raw-bytes cache, no refetch) — not a per-title cost.
const cleanDecorTextures = new Map<string, THREE.Texture>();
const cleanDecorPending = new Map<string, Array<(tex: THREE.Texture) => void>>();

export function loadDecorPosterTexture(movie: Movie, onReady: (tex: THREE.Texture) => void) {
  // The shared path is reusable only when its pixels are already clean: no 4K
  // sticker to strip AND a DVD-medium ('crop') decode — the VHS decode bakes
  // letterbox bars that must never reach a framed print.
  if (!movie.is4k && POSTER_CROP_X <= 0) {
    const shared = getOrCreatePosterTexture(movie.id, 'fixture');
    if (shared) onReady(shared);
    return;
  }
  const ready = cleanDecorTextures.get(movie.id);
  if (ready) { onReady(ready); return; }
  const waiting = cleanDecorPending.get(movie.id);
  if (waiting) { waiting.push(onReady); return; }
  if (!movie.posterUrl) return;
  cleanDecorPending.set(movie.id, [onReady]);
  const mode: DecodeMode = movie.game
    ? (hasRealGameBox(movie.platform) ? 'fill' : 'cart')
    : 'crop';
  posterWorkerPool.decode(movie.posterUrl, mode, mode === 'cart' ? gameFaceAspect(movie.platform) : undefined)
    .then(({ highResData }) => {
      const tex = createPosterDataTexture(highResData);
      uploadTextureNow(tex);
      cleanDecorTextures.set(movie.id, tex);
      const cbs = cleanDecorPending.get(movie.id) ?? [];
      cleanDecorPending.delete(movie.id);
      cbs.forEach((cb) => cb(tex));
    })
    .catch((err) => {
      cleanDecorPending.delete(movie.id);
      console.warn('Failed to decode clean decor poster:', err);
    });
}

function disposeCleanDecorTextures() {
  cleanDecorTextures.forEach((tex) => tex.dispose());
  cleanDecorTextures.clear();
  cleanDecorPending.clear();
}

/**
 * Demote a closed person-endcap's poster texture back into the hero LRU (as
 * most-recent), where normal eviction bounds it. No-op for titles a permanent
 * fixture also pinned.
 */
export function releaseEndcapPosterTexture(movieId: string) {
  const pinned = pinnedPosterTextures.get(movieId);
  if (!pinned || pinned.permanent) return;
  pinnedPosterTextures.delete(movieId);
  heroPosterTextureLRU.set(movieId, pinned.tex);
  evictHeroPosterOverflow();
}

// `skipCrop` (game boxes): the face keeps its media-class dims (gameCaseDims)
// in both mediums and the art is decoded to fit that face ('fill'/'cart',
// #93), so the VHS poster crop must not apply. A movieId is always the same
// kind, so the material cache key doesn't need the flag.
// GH #97: the texture is now resolved internally from the pixel cache (created
// lazily, LRU/pin managed). Falls back to the shared front placeholder if the
// pixels haven't arrived — callers gate on posterPixelCache so in practice
// this only happens on a degenerate race.
function getPosterMaterial(movieId: string, probeIdx?: number, isAnimated: boolean = false, skipCrop: boolean = false, pin: PosterPin = 'none', finish?: CaseFinish): THREE.MeshStandardMaterial {
  const cacheKey = `${movieId}_anim_${isAnimated}_probe_${probeIdx !== undefined ? probeIdx : 'none'}_fin_${finish ?? 'default'}`;
  const cached = posterMaterialCache.get(cacheKey);
  if (cached) {
    // Still refresh recency / honour a pin upgrade so a long-lived consumer
    // reusing a hero-created material can't have its texture evicted under it.
    getOrCreatePosterTexture(movieId, pin);
    return cached;
  }
  const texture = getOrCreatePosterTexture(movieId, pin);
  if (!texture) {
    return getLowResFrontMaterial(movieId, probeIdx, isAnimated, skipCrop, finish)
      ?? (isAnimated ? getAnimatedJellyfinFrontPlaceholderMaterial() : sharedJellyfinFrontPlaceholderMaterial!);
  }
  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;
  // Animated fronts crop inside applyWhiteBorderShader (it samples raw UVs, so a
  // cropFrontTextureForMedium offset/repeat would be ignored — that's what let
  // the poster's baked-in left/right letterbox bars show on the hero/hover box).
  // Pass the uncropped texture and let the border shader apply POSTER_CROP_X.
  const map = (skipCrop || isAnimated) ? texture : cropFrontTextureForMedium(texture);
  const mat = makePlasticMaterial({ map, envMap: env, finish });
  if (isAnimated) {
    applyWhiteBorderShader(mat, skipCrop ? 0 : POSTER_CROP_X);
  }
  posterMaterialCache.set(cacheKey, mat);
  return mat;
}

function getJellyfinBackMaterial(movie: Movie, probeIdx?: number): THREE.MeshStandardMaterial {
  const cacheKey = `jfback_${movie.id}_probe_${probeIdx !== undefined ? probeIdx : 'none'}`;
  const cached = caseMaterialLRUGet(cacheKey);
  if (cached) return cached;
  perfTrace.count(CT_CANVAS);
  perfTrace.begin(SP_CANVAS);

  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  ctx.scale(COVER_WIDTH / 640, COVER_HEIGHT / 960);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;

  drawJellyfinBack(ctx, 640, 960, movie, undefined, () => {
    // The backdrop landed after the synchronous draw above, which painted the
    // no-backdrop fallback — redraw before re-uploading (flagging needsUpdate
    // alone would just re-upload the same fallback pixels).
    drawJellyfinBack(ctx, 640, 960, movie);
    tex.needsUpdate = true;
  });

  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;

  const mat = makePlasticMaterial({ map: tex, envMap: env, finish: movie.isSeries ? 'shrinkwrap' : undefined });
  const isAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
  if (isAnimated) {
    applyWhiteBorderShader(mat, 0, 'left');
  }

  caseMaterialLRUSet(cacheKey, mat);
  perfTrace.end(SP_CANVAS);
  return mat;
}

// ─── Hero (inspected) case: high-resolution printed faces ────────────────────
// COVER_WIDTH/HEIGHT (320×480) is sized for the hundreds of cases standing on
// the shelves. The case you PICK UP is a different problem: on the 4K kiosk it
// covers ~1100×1950 pixels of the supersampled settle frame, so every printed
// face is magnified ~3.5× and its text — synopsis, cast list, rental warnings,
// title sticker, spine — cannot resolve no matter the font size. The pixels
// simply are not there, and no amount of framebuffer supersampling invents them
// (measured: that settle frame renders a 5429×3054 buffer and the box is STILL
// soft). This was already diagnosed and fixed for exactly one face — the
// highlighted cast-list back, whose singleton the slot helper below generalizes
// — while every other face stayed at shelf resolution.
//
// Only ONE case is ever inspected at a time, so each face kind gets a single
// module-level canvas + CanvasTexture redrawn IN PLACE when the inspected title
// changes (the pattern the series boxset panels already use). Cost is a fixed
// handful of textures rather than per-title, which is exactly what lets the
// hero afford a resolution the shelf / carried / bag / back-room copies (small
// on screen, many at once) cannot.
//
// Gated on mode === 'inspect' by heroDetailKey in store-inspect.ts: browsing
// rebuilds the hero pair on every cursor step, and paying a 3× canvas redraw
// per keypress is precisely the cost issue #117 removed from this path.
//
// What the scale actually buys, per face: the Jellyfin back is 100% vector text
// and scales perfectly; the rental wrap faces are a scanned box (its back
// panel ~473×762 real pixels) with typed metadata composited on, so they stop
// throwing away scan detail AND get sharp typed text, but stay bounded by the
// scan. The retail front is a decoded poster and is bounded by that decode
// (posterPixelCache is COVER_WIDTH×COVER_HEIGHT) — unaffected by this.
export const HERO_COVER_SCALE = 3;

interface HeroFaceSlot {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  // Which draw currently owns the canvas — an async art/backdrop callback from
  // an earlier title must not repaint a canvas since claimed by a newer one.
  seq: number;
}
const heroFaceSlots = new Map<string, HeroFaceSlot>();

function heroFaceSlot(id: string, w: number, h: number): HeroFaceSlot {
  let slot = heroFaceSlots.get(id);
  // Dimensions can change under us: the spine's canvas is sized from
  // spineCanvasDims(), which follows CASE_MEDIUM.
  if (slot && (slot.canvas.width !== w || slot.canvas.height !== h)) {
    slot.tex.dispose();
    slot = undefined;
  }
  if (!slot) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    slot = { canvas, ctx: canvas.getContext('2d')!, tex, seq: 0 };
    heroFaceSlots.set(id, slot);
  }
  return slot;
}

// The wrapping materials are cached too (they used to be minted fresh per call
// and replaced on heroFrontMesh without dispose — one orphaned
// MeshStandardMaterial per flip/region keypress for the life of the renderer).
// Every entry maps a singleton texture above; the key is only the inputs that
// change compiled material state, so the set stays tiny.
const heroFaceMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function heroFaceMaterial(
  key: string,
  build: () => THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  let mat = heroFaceMaterialCache.get(key);
  if (!mat) {
    mat = build();
    heroFaceMaterialCache.set(key, mat);
  }
  return mat;
}

// Uncached BY DESIGN (unlike getJellyfinBackMaterial above): called on every
// up/down keypress while browsing a flipped hero case's cast list plus every
// flip toggle (three-scene.ts updateBackCoverHighlight()), and the highlight
// has to be repainted each time. `highlightedName` is optional — an inspected
// case with no cast row selected wants the same high-resolution back, which is
// what left the plain synopsis soft while the highlighted one was sharp.
function getJellyfinBackMaterialHero(
  movie: Movie,
  highlightedName?: string,
  probeIdx?: number,
): THREE.MeshStandardMaterial {
  const W = COVER_WIDTH * HERO_COVER_SCALE;
  const H = COVER_HEIGHT * HERO_COVER_SCALE;
  const slot = heroFaceSlot('jfback', W, H);
  const ctx = slot.ctx;
  const tex = slot.tex;
  perfTrace.count(CT_CANVAS);
  perfTrace.begin(SP_CANVAS);

  // Reset before scaling — the context (and its transform) persists across calls.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(W / 640, H / 960);

  const drawSeq = ++slot.seq;
  drawJellyfinBack(ctx, 640, 960, movie, highlightedName, () => {
    // Backdrop arrived asynchronously — repaint only if no newer flip has
    // claimed the singleton canvas since, and redraw for real (the canvas
    // still shows the no-backdrop fallback at this point).
    if (drawSeq !== slot.seq) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(W / 640, H / 960);
    drawJellyfinBack(ctx, 640, 960, movie, highlightedName);
    tex.needsUpdate = true;
  });
  // Re-upload after EVERY synchronous redraw. This used to be flagged only by
  // the async backdrop callback, so once backdrops were cached (no callback)
  // the GPU kept the pixels of the first title ever flipped — every box's
  // back showed that one movie.
  tex.needsUpdate = true;

  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;
  const isAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
  const finish = movie.isSeries ? 'shrinkwrap' as const : undefined;

  const mat = heroFaceMaterial(
    `jfback_${probeIdx ?? 'none'}_${finish ?? 'default'}_${isAnimated}`,
    () => {
      const m = makePlasticMaterial({ map: tex, envMap: env, finish });
      if (isAnimated) applyWhiteBorderShader(m, 0, 'left');
      return m;
    },
  );
  perfTrace.end(SP_CANVAS);
  return mat;
}

// rental clamshell, hero resolution. Mirrors
// getRentalBackMaterial below (same draw calls, same rim treatment) onto a
// singleton slot instead of a per-title LRU entry.
function getRentalBackMaterialHero(movie: Movie, probeIdx?: number): THREE.MeshStandardMaterial {
  const W = COVER_WIDTH * HERO_COVER_SCALE;
  const H = COVER_HEIGHT * HERO_COVER_SCALE;
  const slot = heroFaceSlot('bbback', W, H);
  const ctx = slot.ctx;
  const tex = slot.tex;
  perfTrace.count(CT_CANVAS);
  perfTrace.begin(SP_CANVAS);

  const edgeColor = '#0a0a0a';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  paintPlaceholderBase(ctx, W, H);

  const drawSeq = ++slot.seq;
  drawRentalBackArt(ctx, W, H, movie, () => {
    if (drawSeq !== slot.seq) return;
    paintRentalRimBorder(ctx, W, H, edgeColor, 'back');
    tex.needsUpdate = true;
  });
  paintRentalRimBorder(ctx, W, H, edgeColor, 'back');
  tex.needsUpdate = true;

  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;
  const mat = heroFaceMaterial(
    `bbback_${probeIdx ?? 'none'}`,
    () => makePlasticMaterial({ map: tex, envMap: env, isRentalCase: true }),
  );
  perfTrace.end(SP_CANVAS);
  return mat;
}

// Hero-resolution twin of getRentalFrontMaterial (GH #52 title sticker).
function getRentalFrontMaterialHero(movie: Movie, probeIdx?: number): THREE.MeshStandardMaterial {
  const W = COVER_WIDTH * HERO_COVER_SCALE;
  const H = COVER_HEIGHT * HERO_COVER_SCALE;
  const slot = heroFaceSlot('bbfront', W, H);
  const ctx = slot.ctx;
  const tex = slot.tex;
  perfTrace.count(CT_CANVAS);
  perfTrace.begin(SP_CANVAS);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  paintPlaceholderBase(ctx, W, H);

  const drawSeq = ++slot.seq;
  drawRentalFrontArt(ctx, W, H, movie, () => {
    if (drawSeq !== slot.seq) return;
    paintRentalRimBorder(ctx, W, H);
    tex.needsUpdate = true;
  });
  paintRentalRimBorder(ctx, W, H);
  tex.needsUpdate = true;

  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;
  const mat = heroFaceMaterial(
    `bbfront_${probeIdx ?? 'none'}`,
    () => makePlasticMaterial({ map: tex, envMap: env, isRentalCase: true }),
  );
  perfTrace.end(SP_CANVAS);
  return mat;
}

// Hero-resolution twin of getRentalSpineMaterial. Worth having: the flip
// cycle has a dedicated SPINE stop, where that face fills the screen edge-on.
function getRentalSpineMaterialHero(movie: Movie, probeIdx?: number): THREE.MeshStandardMaterial {
  const dims = spineCanvasDims();
  const W = dims.w * HERO_COVER_SCALE;
  const H = dims.h * HERO_COVER_SCALE;
  const slot = heroFaceSlot('bbspine', W, H);
  const ctx = slot.ctx;
  const tex = slot.tex;
  perfTrace.count(CT_CANVAS);
  perfTrace.begin(SP_CANVAS);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  paintPlaceholderBase(ctx, W, H);

  const drawSeq = ++slot.seq;
  drawRentalSpineArt(ctx, W, H, movie, () => {
    if (drawSeq !== slot.seq) return;
    paintRentalRimBorder(ctx, W, H, '#0a0a0a', 'spine');
    tex.needsUpdate = true;
  });
  paintRentalRimBorder(ctx, W, H, '#0a0a0a', 'spine');
  tex.needsUpdate = true;

  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;
  const mat = heroFaceMaterial(
    `bbspine_${probeIdx ?? 'none'}`,
    () => makePlasticMaterial({ map: tex, envMap: env, isRentalCase: true }),
  );
  perfTrace.end(SP_CANVAS);
  return mat;
}

function getRentalBackMaterial(movie: Movie, probeIdx?: number): THREE.MeshStandardMaterial {
  const cacheKey = `bbback_${movie.id}_art_${artCacheTag()}_probe_${probeIdx !== undefined ? probeIdx : 'none'}`;
  const cached = caseMaterialLRUGet(cacheKey);
  if (cached) return cached;
  perfTrace.count(CT_CANVAS);
  perfTrace.begin(SP_CANVAS);

  // The rental clamshell always reads as a normal store VHS: black
  // molded rim, no white curved border. (The white curved border belongs only
  // to the retail Jellyfin box in front — see applyWhiteBorderShader callers in
  // getPosterMaterial / getJellyfinBackMaterial.)
  const edgeColor = '#0a0a0a';

  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  paintPlaceholderBase(ctx, COVER_WIDTH, COVER_HEIGHT);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;

  drawRentalBackArt(ctx, COVER_WIDTH, COVER_HEIGHT, movie, () => {
    paintRentalRimBorder(ctx, COVER_WIDTH, COVER_HEIGHT, edgeColor, 'back');
    tex.needsUpdate = true;
  });
  // GH #139: the front panel already paints a margin matching the case's
  // molded edge (paintRentalRimBorder, GH #42) so a residual viewing angle
  // that reveals a sliver of the case's +X/+Y/-Y edge faces blends in rather
  // than reading as a mismatched border — the back panel never got the same
  // treatment, which is what let a white edge (or black, off-VHS) show up
  // unexplained on the back of the rental clamshell ("white edge on the
  // wrong side of the back of the family vhs box"). That fix put the strip on
  // canvas-right like the front, which the back's mirrored UVs land on the
  // spine instead of the rim — hence the 'back' flag here.
  paintRentalRimBorder(ctx, COVER_WIDTH, COVER_HEIGHT, edgeColor, 'back');

  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;

  const mat = makePlasticMaterial({ map: tex, envMap: env, isRentalCase: true });

  caseMaterialLRUSet(cacheKey, mat);
  perfTrace.end(SP_CANVAS);
  return mat;
}

function getRentalSpineMaterial(movie: Movie, probeIdx?: number): THREE.MeshStandardMaterial {
  const cacheKey = `bbspine_${movie.id}_art_${artCacheTag()}_probe_${probeIdx !== undefined ? probeIdx : 'none'}`;
  const cached = caseMaterialLRUGet(cacheKey);
  if (cached) return cached;
  perfTrace.count(CT_CANVAS);
  perfTrace.begin(SP_CANVAS);

  const spineDims = spineCanvasDims();
  const canvas = document.createElement('canvas');
  canvas.width = spineDims.w;
  canvas.height = spineDims.h;
  const ctx = canvas.getContext('2d')!;
  paintPlaceholderBase(ctx, spineDims.w, spineDims.h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;

  drawRentalSpineArt(ctx, spineDims.w, spineDims.h, movie, () => {
    paintRentalRimBorder(ctx, spineDims.w, spineDims.h, '#0a0a0a', 'spine');
    tex.needsUpdate = true;
  });
  // Continue the front/back black rim across the spine: the top and bottom edges
  // of the spine read black too, matching the wrap that borders the whole box.
  paintRentalRimBorder(ctx, spineDims.w, spineDims.h, '#0a0a0a', 'spine');

  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;

  const mat = makePlasticMaterial({ map: tex, envMap: env, isRentalCase: true });

  caseMaterialLRUSet(cacheKey, mat);
  perfTrace.end(SP_CANVAS);
  return mat;
}

function getGeometry(isAnimated: boolean = false, dims?: { w: number; h: number; d: number }): THREE.BufferGeometry {
  if (dims) {
    const key = `${dims.w.toFixed(4)}_${dims.h.toFixed(4)}_${dims.d.toFixed(4)}`;
    const cache = isAnimated ? customDimsGeometriesAnimated : customDimsGeometriesRegular;
    let geo = cache.get(key);
    if (!geo) {
      // Jewel cases (marker set by gameCaseDims) are pressed polycarbonate
      // with near-sharp corners — the molded d*0.28 round-over of a keep
      // case/clamshell reads soft and wrong on them. Cache-key safe: the
      // marker rides the memoised dims object, so equal dims always carry
      // the same flag.
      const jewel = (dims as any).jewel === true;
      const radius = isAnimated ? dims.d * 0.28
        : jewel ? dims.d * 0.06
        : (CASE_MEDIUM === 'vhs' ? 0.008 : dims.d * 0.28);
      geo = new RoundedBoxGeometry(dims.w, dims.h, dims.d, 2, radius);
      cache.set(key, geo);
    }
    return geo;
  }

  if (CASE_MEDIUM === 'dvd') {
    if (!caseGeometryRegular) {
      const radius = CASE_DEPTH * 0.28;
      caseGeometryRegular = new RoundedBoxGeometry(CASE_WIDTH, CASE_HEIGHT, CASE_DEPTH, 2, radius);
    }
    return caseGeometryRegular;
  } else {
    // VHS mode
    if (isAnimated) {
      if (!caseGeometryAnimated) {
        const radius = CASE_DEPTH * 0.28; // Keep original rounded corners
        caseGeometryAnimated = new RoundedBoxGeometry(CASE_WIDTH, CASE_HEIGHT, CASE_DEPTH, 2, radius);
      }
      return caseGeometryAnimated;
    } else {
      if (!caseGeometryRegular) {
        const radius = 0.008; // tiny bit of roundness, not perfect angles
        caseGeometryRegular = new RoundedBoxGeometry(CASE_WIDTH, CASE_HEIGHT, CASE_DEPTH, 2, radius);
      }
      return caseGeometryRegular;
    }
  }
}

// Rental (rental clamshell) box geometry — GH #42. On DVD it's identical
// to the retail cover box (shared instance, no extra GPU buffers). On VHS the
// clamshell is molded VHS_RIM_RIGHT_FT wider, VHS_RIM_VERTICAL_FT taller AND
// VHS_RENTAL_DEPTH_FT deep (thicker than the sleeve's CASE_DEPTH) — matching the
// real hard case, which was bigger on every axis than a sleeved retail tape. The
// box is built centered like RoundedBoxGeometry always is, then shifted +rim/2
// in X so the left (spine/hinge) face lands exactly where the cover box's left
// face is — all the extra width peeks out on the right. Extra height/depth need
// no shift: they split evenly since the box is centered. The extra depth grows
// symmetrically about the box centre; the tiny forward poke stays hidden behind
// the opaque cover box in front (front cover spans local z [0, CASE_DEPTH], the
// clamshell sits centred at -CASE_DEPTH/2 behind it — see three-scene slot z).
function getRentalGeometry(isAnimated: boolean = false, dims?: { w: number; h: number; d: number }): THREE.BufferGeometry {
  if (dims) {
    // Custom dims come from gameCaseDims(): the class decides the rental
    // shape, NOT the store medium — a cartridge game rents in the VHS
    // clamshell even in a DVD-era store, a disc game in a cover-sized keep
    // case even in a VHS store. The rental box never changes aspect.
    if (dims.w === CASE_DIMS.dvd.w && dims.h === CASE_DIMS.dvd.h) return getGeometry(isAnimated, dims);
    const key = `${dims.w.toFixed(4)}_${dims.h.toFixed(4)}_${dims.d.toFixed(4)}`;
    const cache = isAnimated ? customDimsRentalGeometriesAnimated : customDimsRentalGeometriesRegular;
    let geo = cache.get(key);
    if (!geo) {
      const boxWidth = dims.w + VHS_RIM_RIGHT_FT;
      const boxHeight = dims.h + VHS_RIM_VERTICAL_FT;
      const radius = isAnimated ? VHS_RENTAL_DEPTH_FT * 0.28 : 0.008;
      geo = new RoundedBoxGeometry(boxWidth, boxHeight, VHS_RENTAL_DEPTH_FT, 2, radius);
      geo.translate(VHS_RIM_RIGHT_FT / 2, 0, 0);
      cache.set(key, geo);
    }
    return geo;
  }

  if (CASE_MEDIUM === 'dvd') return getGeometry(isAnimated);

  const boxWidth = CASE_WIDTH + VHS_RIM_RIGHT_FT;
  const boxHeight = CASE_HEIGHT + VHS_RIM_VERTICAL_FT;
  const boxDepth = VHS_RENTAL_DEPTH_FT; // clamshell is THICKER than the sleeve's CASE_DEPTH
  if (isAnimated) {
    if (!rentalGeometryAnimated) {
      const radius = boxDepth * 0.28; // match the retail animated corners, scaled to the clamshell depth
      rentalGeometryAnimated = new RoundedBoxGeometry(boxWidth, boxHeight, boxDepth, 2, radius);
      rentalGeometryAnimated.translate(VHS_RIM_RIGHT_FT / 2, 0, 0);
    }
    return rentalGeometryAnimated;
  }
  if (!rentalGeometryRegular) {
    const radius = 0.008; // match the retail regular corners
    rentalGeometryRegular = new RoundedBoxGeometry(boxWidth, boxHeight, boxDepth, 2, radius);
    rentalGeometryRegular.translate(VHS_RIM_RIGHT_FT / 2, 0, 0);
  }
  return rentalGeometryRegular;
}

// Initialize shared materials once
function initSharedMaterials() {
  if (!plasticWrinkleNormalTex) {
    plasticWrinkleNormalTex = createPlasticWrinkleNormalMap();
  }
  if (!plasticSmudgeRoughnessTex) {
    plasticSmudgeRoughnessTex = createPlasticSmudgeRoughnessMap();
  }
  if (!sharedWhiteMaterial) {
    // The white Animated-Movies clamshell body: molded plastic, not print.
    sharedWhiteMaterial = makePlasticMaterial({
      color: '#ffffff',
      finish: 'shell',
    });
  }
  if (!sharedRentalWhiteMaterial) {
    sharedRentalWhiteMaterial = makePlasticMaterial({
      color: '#ffffff',
      baseRoughness: 0.45,
      isRentalCase: true,
    });
  }
  if (!sharedRentalBlackMaterial) {
    sharedRentalBlackMaterial = makePlasticMaterial({
      color: '#0a0a0a',
      baseRoughness: 0.45,
      isRentalCase: true,
    });
  }
  if (sharedBlackMaterial) return;

  // 1. The retail case body (top, bottom, right faces): matte textured
  // polypropylene on a DVD keepcase, printed black board on a VHS slipcase
  // (ROADMAP B3) — the old universal wet-clearcoat sheen belonged to neither.
  sharedBlackMaterial = makePlasticMaterial({
    color: '#0a0a0a',
    finish: caseBodyFinish(),
  });

  // 2. Rental front cover (house board + brand emblem)
  const frontCanvas = document.createElement('canvas');
  frontCanvas.width = COVER_WIDTH;
  frontCanvas.height = COVER_HEIGHT;
  const frontCtx = frontCanvas.getContext('2d')!;
  paintPlaceholderBase(frontCtx, COVER_WIDTH, COVER_HEIGHT);
  const frontTex = new THREE.CanvasTexture(frontCanvas);
  frontTex.colorSpace = THREE.SRGBColorSpace;
  frontTex.minFilter = THREE.LinearMipmapLinearFilter;
  frontTex.magFilter = THREE.LinearFilter;
  frontTex.generateMipmaps = true;
  drawRentalFrontArt(frontCtx, COVER_WIDTH, COVER_HEIGHT, null, () => {
    paintRentalRimBorder(frontCtx, COVER_WIDTH, COVER_HEIGHT);
    frontTex.needsUpdate = true;
  });
  paintRentalRimBorder(frontCtx, COVER_WIDTH, COVER_HEIGHT);
  sharedRentalFrontMaterial = makePlasticMaterial({ map: frontTex, isRentalCase: true });

  // 3. Rental back cover placeholder (instructions only, swapped to movie info on focus)
  const backCanvas = document.createElement('canvas');
  backCanvas.width = COVER_WIDTH;
  backCanvas.height = COVER_HEIGHT;
  const backCtx = backCanvas.getContext('2d')!;
  paintPlaceholderBase(backCtx, COVER_WIDTH, COVER_HEIGHT);
  const backTex = new THREE.CanvasTexture(backCanvas);
  backTex.colorSpace = THREE.SRGBColorSpace;
  backTex.minFilter = THREE.LinearMipmapLinearFilter;
  backTex.magFilter = THREE.LinearFilter;
  backTex.generateMipmaps = true;
  drawRentalBackArt(backCtx, COVER_WIDTH, COVER_HEIGHT, "GENERIC_WARNINGS", () => {
    backTex.needsUpdate = true;
  });
  sharedRentalBackPlaceholderMaterial = makePlasticMaterial({ map: backTex, isRentalCase: true });

  // 4. Jellyfin Front Cover Placeholder
  const jFrontCanvas = document.createElement('canvas');
  jFrontCanvas.width = COVER_WIDTH;
  jFrontCanvas.height = COVER_HEIGHT;
  const jFrontCtx = jFrontCanvas.getContext('2d')!;
  jFrontCtx.fillStyle = '#0f172a';
  jFrontCtx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
  const jFrontTex = new THREE.CanvasTexture(jFrontCanvas);
  jFrontTex.colorSpace = THREE.SRGBColorSpace;
  sharedJellyfinFrontPlaceholderMaterial = makePlasticMaterial({ map: jFrontTex });

  // 5. Jellyfin Back Cover Placeholder
  sharedJellyfinBackPlaceholderMaterial = makePlasticMaterial({ color: '#0f172a' });

  // 6. Rental spine placeholder
  sharedRentalSpinePlaceholderMaterial = makePlasticMaterial({ color: '#ffffff', isRentalCase: true });

  // 7. Jellyfin Spine Placeholder
  sharedJellyfinSpinePlaceholderMaterial = makePlasticMaterial({ color: '#0f172a' });
}

interface GenreTheme {
  primary: string;
  secondary: string;
  accent: string;
  bgGradStart: string;
  bgGradEnd: string;
  accentGlow: string;
}

function getGenreTheme(genres: string[]): GenreTheme {
  const g = genres.map(x => x.toLowerCase());
  if (g.includes('sci-fi') || g.includes('science fiction') || g.includes('fantasy')) {
    return {
      primary: '#004cff', // electric blue
      secondary: '#ffcc00', // the brand trim color
      accent: '#002288',
      bgGradStart: '#00183b',
      bgGradEnd: '#00050d',
      accentGlow: 'rgba(0, 76, 255, 0.5)'
    };
  } else if (g.includes('horror') || g.includes('thriller') || g.includes('mystery')) {
    return {
      primary: '#ff1133', // blood red
      secondary: '#ffcc00', // yellow
      accent: '#111111',
      bgGradStart: '#1d050a',
      bgGradEnd: '#000000',
      accentGlow: 'rgba(255, 17, 51, 0.4)'
    };
  } else if (g.includes('comedy')) {
    return {
      primary: '#ffea00', // vivid yellow
      secondary: '#004cff', // electric blue
      accent: '#001035',
      bgGradStart: '#002654',
      bgGradEnd: '#000c1e',
      accentGlow: 'rgba(255, 234, 0, 0.4)'
    };
  } else if (g.includes('action') || g.includes('adventure')) {
    return {
      primary: '#ff7700', // orange
      secondary: '#ffcc00', // yellow
      accent: '#001a40',
      bgGradStart: '#2a1100',
      bgGradEnd: '#080400',
      accentGlow: 'rgba(255, 119, 0, 0.4)'
    };
  }
  return {
    primary: '#0066ff', // electric blue
    secondary: '#ffcc00', // the brand trim color
    accent: '#001a4d',
    bgGradStart: '#001633',
    bgGradEnd: '#000714',
    accentGlow: 'rgba(0, 102, 255, 0.4)'
  };
}



// Simple deterministic pseudo-random number generator
function getSeededRandom(seedStr: string) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
  }
  return function() {
    let t = h += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draw generic UPC barcode
function drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, seed?: string) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#000000';
  
  let currentX = x + 5;
  const endX = x + width - 5;
  
  const random = seed ? getSeededRandom(seed) : Math.random;
  
  while (currentX < endX) {
    const barWidth = Math.floor(random() * 3) + 1;
    const spaceWidth = Math.floor(random() * 3) + 1;
    ctx.fillRect(currentX, y + 5, barWidth, height - 20);
    currentX += barWidth + spaceWidth;
  }
  
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("0  79148  18349  2", x + width / 2, y + height - 5);
  ctx.restore();
}


// Draw a grid pattern
function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, theme: GenreTheme) {
  ctx.save();
  ctx.strokeStyle = theme.primary + '22';
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}





// -------------------------------------------------------------
// RENTAL BOX ART — composited from the flat box-wrap print
// -------------------------------------------------------------
// The rental case art (front logo panel, spine, and back panel with
// the store info + care blurb) is a real scanned box wrap. Which scan a medium
// renders from is a user setting (COVER_VARIANTS / bb_cover_<medium> above);
// all of a medium's variants share the BoxLayout geometry below.
// Each scan is a full [BACK | SPINE | FRONT] wrap. For a given movie we draw the
// scan onto a full-resolution canvas, overlay this movie's real metadata where
// the printed placeholder fields are (movie title + genre/rating/year on the
// spine; synopsis + credits in the blank back-panel window), then crop the
// individual face out for each material. The poster art is NOT drawn here — it
// lives on the retail (jellyfin) case; the rental copy is the generic
// rental sleeve, identified only by its spine + back metadata.

export interface BoxLayout {
  imgW: number;
  imgH: number;
  // Panel crops, normalized [x0, y0, x1, y1] of the full scan.
  front: [number, number, number, number];
  back: [number, number, number, number];
  spine: [number, number, number, number];
  // True for the VHS "Standard Version" wrap: metadata is TYPED INTO the
  // printed form (spine CATEGORY:/RATING:/RENT CODE:/DIST: fields, label
  // window, front sticker) by drawStandardVhsOverlays.
  standardVhs?: boolean;
  // True for the 2003 DVD rental wrap: the same printed-form idea as
  // standardVhs (spine CATEGORY:/RATING:/RENT CODE:/DIST: fields, back-window
  // heading, front placeholder line) but a different scan with its own pixel
  // geometry — dispatched to drawDvd2003Overlays instead of
  // drawStandardVhsOverlays. Mutually exclusive with standardVhs.
  dvd2003?: boolean;
  // True for the DVD-only "Blue" wrap: the VHS 'Standard Version' design
  // (cream stock, full-bleed blue panel, gold-rule frame) redrawn on the
  // DVD wrap's own fold geometry — same typed-form idea as dvd2003, on its
  // own coordinate set (drawDvdBlueTemplateWrap in logo-wrap.ts, dispatched
  // here to drawDvdBlueOverlays). Mutually exclusive with standardVhs/dvd2003.
  dvdBlue?: boolean;
  // True for the all-ticket wraps: the print has no window, form fields, or
  // title placeholder anywhere, so the scan renders exactly as printed —
  // drawBoxOverlays is a no-op (every field above except the crops is unused).
  plain?: boolean;
}

const BOX_LAYOUTS: Record<CaseMedium, BoxLayout> = {
  // The VHS wrap is the flat rental template (cream stock, printed brand
  // panels): back panel on the left of the sheet, spine in the middle (big
  // "<BRAND> VIDEO RENTAL" + blank CATEGORY:/RATING:/RENT CODE:/DIST: form
  // fields), front panel on the right (the wordmark reading bottom→top).
  vhs: {
    imgW: 1024,
    imgH: 762,
    // Full-panel crops, fold line to wrap edge (the wrap has no background
    // margin on any side): the face keeps the top address/barcode strip, the
    // the front's right-edge "<BRAND> VIDEO RENTAL" text
    // instead of cropping into the art ("the art is cropped on the box").
    front: [0.575, 0.0, 1.0, 1.0],
    back: [0.0, 0.0, 0.462, 1.0],
    spine: [0.462, 0.0, 0.575, 1.0],
    standardVhs: true,
  },
  // The DVD wrap is the disc-era rental sleeve ("DVD · 1-WEEK RENTAL" banner,
  // checkout-day chart on the back). Same printed-form idea as the VHS
  // template (spine CATEGORY:/RATING:/RENT CODE:/DIST: fields, back-window
  // heading, front placeholder line), typed in by drawDvd2003Overlays. Fold
  // lines on its 1024×683 canvas: x 478/558.
  dvd: {
    imgW: 1024,
    imgH: 683,
    front: [558 / 1024, 0.0, 1.0, 1.0],
    back: [0.0, 0.0, 478 / 1024, 1.0],
    spine: [478 / 1024, 0.0, 558 / 1024, 1.0],
    dvd2003: true,
  },
};

/**
 * The medium's base layout with the active cover variant's overrides merged
 * in — every panel draw must go through this (not BOX_LAYOUTS directly) so
 * e.g. the all-ticket wraps get their own crops + plain flag.
 */
function activeBoxLayout(medium: CaseMedium): BoxLayout {
  const overrides = activeCoverVariant(medium).layout;
  return overrides ? { ...BOX_LAYOUTS[medium], ...overrides } : BOX_LAYOUTS[medium];
}

// Decoded scan cache + waiter list so concurrent panel draws share one decode.
// Keyed by scan URL, so each cover variant decodes once and a runtime variant
// change naturally loads the new scan without evicting the old one.
type BoxScan = HTMLImageElement | HTMLCanvasElement;
const boxImageCache = new Map<string, BoxScan>();
const boxImageWaiters = new Map<string, Array<(img: BoxScan) => void>>();

// ── Print-stock white balance ───────────────────────────────────────────────
// The VHS wraps print on CREAM card stock: the paper itself measures
// #F3EADB (R−B = 24), so the modelled clamshell rendered a warm greige and read
// GRAY rather than the white of a real rental case. Each scan is white-balanced
// ONCE, straight off the decode — find the print stock's own white (median RGB
// of the brightest ~2% of pixels, stride-sampled through 256-bin histograms, no
// per-pixel arrays) and scale each channel so that stock lands on paper white.
// It's a single per-channel gain, so the blue/orange ticket ink keeps its
// relation to the paper instead of being recoloured on its own, and a scan
// already neutral and bright (the 2003 DVD wrap, most user uploads) resolves to
// gains of 1.0 and is handed straight back. Cost is one pass at load — nothing
// per-frame — and the typed-metadata overlays still draw over the corrected
// pixels untouched, since only the source bitmap changes.
const STOCK_GAIN_MAX = 1.35;  // a paper cast, not an exposure fix
const STOCK_GAIN_MIN = 1.015; // below this the stock is already white
const STOCK_MIN_WHITE = 120;  // a scan this dark has no paper to key off

// Gains actually applied, per scan URL: the overlay passes erase printed
// placeholders with fills SAMPLED OFF THE RAW SCAN, so those fills have to ride
// the same correction (see scanColor) or they leave cream patches on the now
// white paper.
const stockGains = new Map<string, [number, number, number]>();

/** A colour sampled off the raw scan, put through that scan's stock white
 *  balance — identity for a scan that needed no correction. */
export function scanColor(medium: CaseMedium, hex: string): string {
  const g = stockGains.get(activeCoverVariant(medium).url);
  if (!g) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number, i: number) => Math.min(255, Math.round(((n >> shift) & 255) * g[i]));
  return `rgb(${ch(16, 0)},${ch(8, 1)},${ch(0, 2)})`;
}

function neutralizeScanStock(img: HTMLImageElement, url: string): BoxScan {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return img;
  try {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d', { alpha: false })!;
    c.drawImage(img, 0, 0);
    const image = c.getImageData(0, 0, w, h);
    const px = image.data;
    const lum = (i: number) => (px[i] * 54 + px[i + 1] * 183 + px[i + 2] * 19) >> 8;
    const stride = Math.max(1, Math.round(Math.sqrt((w * h) / 40000)));
    const lumHist = new Uint32Array(256);
    let samples = 0;
    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) { lumHist[lum((y * w + x) * 4)]++; samples++; }
    }
    let acc = 0, thr = 0;
    for (let v = 255; v >= 0; v--) { acc += lumHist[v]; if (acc >= samples * 0.02) { thr = v; break; } }
    if (thr < STOCK_MIN_WHITE) return img;
    const chan = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    let bright = 0;
    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) {
        const i = (y * w + x) * 4;
        if (lum(i) < thr) continue;
        chan[0][px[i]]++; chan[1][px[i + 1]]++; chan[2][px[i + 2]]++; bright++;
      }
    }
    if (!bright) return img;
    const lut = [new Uint8Array(256), new Uint8Array(256), new Uint8Array(256)];
    const gains: [number, number, number] = [1, 1, 1];
    for (let ch = 0; ch < 3; ch++) {
      let n = 0, med = 255;
      for (let v = 0; v <= 255; v++) { n += chan[ch][v]; if (n >= bright / 2) { med = v; break; } }
      gains[ch] = Math.min(STOCK_GAIN_MAX, 255 / Math.max(1, med));
      for (let v = 0; v <= 255; v++) lut[ch][v] = Math.min(255, Math.round(v * gains[ch]));
    }
    if (Math.max(gains[0], gains[1], gains[2]) < STOCK_GAIN_MIN) return img;
    stockGains.set(url, gains);
    const [l0, l1, l2] = lut;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = l0[px[i]]; px[i + 1] = l1[px[i + 1]]; px[i + 2] = l2[px[i + 2]];
    }
    c.putImageData(image, 0, 0);
    return cv;
  } catch {
    return img; // no 2d context / tainted canvas — the raw scan still renders
  }
}

// Callers only drawImage() the result, so a procedural variant's canvas slots
// in wherever a decoded scan does.
function loadBoxImage(medium: CaseMedium, cb: (img: HTMLImageElement | HTMLCanvasElement) => void) {
  const variant = activeCoverVariant(medium);
  if (variant.procedural) {
    // Procedural wraps resolve synchronously once the brand font is in (drawn
    // at first use and cached in logo-wrap.ts) — no decode, no waiter list.
    // The font gate only defers the very first build on harness boots, where
    // nothing awaits document.fonts before textures draw.
    const build = variant.procedural;
    ensureWrapFontsLoaded(wrapLogoSpec(), () => cb(build(medium)));
    return;
  }
  const url = variant.url;
  const cached = boxImageCache.get(url);
  if (cached && (!(cached instanceof HTMLImageElement) || (cached.complete && cached.naturalWidth))) {
    cb(cached);
    return;
  }
  const waiters = boxImageWaiters.get(url);
  if (waiters) {
    waiters.push(cb);
    return;
  }
  boxImageWaiters.set(url, [cb]);
  const img = new Image();
  img.onload = () => {
    const scan = neutralizeScanStock(img, url);
    boxImageCache.set(url, scan);
    const ws = boxImageWaiters.get(url) || [];
    boxImageWaiters.delete(url);
    ws.forEach(w => w(scan));
  };
  img.onerror = (e) => {
    console.error('Rental box print failed to load:', medium, url, e);
    boxImageWaiters.delete(url);
  };
  img.src = url;
}

// Greedy word-wrap. ctx.font must already be set to the measuring font.
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw text as a vertical column reading top-to-bottom (glyph tops facing
// right), horizontally centred on cx and starting at yTop. Returns the column's
// length (its downward extent) so callers can stack elements.
// xScale compresses the glyphs ALONG the reading direction: the spine crop of
// each scan is printed wider than the modeled case's physical spine, so
// spine-drawn text gets squashed across the spine at render time (cap height
// shrinks, width doesn't — letters read fat). Narrowing the glyphs by the same
// ratio restores true proportions at a slightly smaller effective size.
export function drawVerticalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  yTop: number,
  font: string,
  fill: string,
  xScale: number = 1,
): number {
  ctx.font = font;
  const len = ctx.measureText(text).width * xScale;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.translate(cx, yTop);
  ctx.rotate(Math.PI / 2);
  ctx.scale(xScale, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return len;
}

// Ratio between the case's physical spine aspect (d/h) and the scan crop's
// aspect — the squash factor render applies to anything drawn in the scan's
// spine region, and therefore the xScale that pre-compensates it.
export function spineTextXScale(medium: CaseMedium): number {
  const L = BOX_LAYOUTS[medium];
  const crop = L.spine;
  const cropAspect = ((crop[2] - crop[0]) * L.imgW) / L.imgH;
  const { d, h } = CASE_DIMS[medium];
  return Math.min(1, (d / h) / cropAspect);
}

// ── "Standard Version" VHS wrap fill-in ─────────────────────────────────────
// The scan is a pristine (unused) rental wrap: a printed FORM whose blanks the
// store filled in. So instead of clearing print and drawing our own layout,
// TYPE the movie's real metadata into the printed blanks, matching the print's
// ink, Helvetica-style family, sizes and rotations. All coordinates are
// full-scan pixels (1024×762), measured off the scan:
//   • spine form fields read top→bottom with glyph tops facing right (exactly
//     drawVerticalText's rotation): CATEGORY: column centre x≈519 (label ends
//     y≈114), RATING:/RENT CODE:/DIST: column centre x≈497 (labels end y≈89,
//     y≈266, y≈358), all ~18px regular; the big printed spine line (cx≈541,
//     caps x 532-550, y 26-414) is the spine's title placeholder — erased and
//     retyped as the movie's title, free to run into the blank gap before the
//     barcode (starts y=549).
//   • back-panel label window: interior x≈104-400, printed "<BRAND> VIDEO
//     RENTAL" heading ends y≈140, window frame bottom y≈446.
//   • front blue panel's orange border: x 663-939, y 128-709 (the giant orange
//     the wordmark reads bottom→top; the typed sticker sits horizontally over
//     its bottom, the way stores labelled the real cases).
export const STANDARD_INK = '#211d19'; // sampled print ink (soft black, not #000)

// Largest font size ≤ basePx (min minPx) at which `text` fits maxLen.
export function fitFontPx(
  ctx: CanvasRenderingContext2D,
  text: string,
  basePx: number,
  weight: string,
  maxLen: number,
  minPx: number = 10,
  family: string = 'Arial, sans-serif',
): number {
  ctx.font = `${weight} ${basePx}px ${family}`;
  const m = ctx.measureText(text).width;
  return m <= maxLen ? basePx : Math.max(minPx, Math.floor((basePx * maxLen) / m));
}

// Like drawVerticalText but rotated the other way: the column reads
// bottom-to-top (glyph tops facing LEFT), matching the front panel's printed
// right-edge "<BRAND> VIDEO RENTAL" line and the giant wordmark column.
// Draws upward from yBottom; returns the column's length (its upward extent).
export function drawVerticalTextUp(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  yBottom: number,
  font: string,
  fill: string,
): number {
  ctx.font = font;
  const len = ctx.measureText(text).width;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.translate(cx, yBottom);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return len;
}

// One typed value on the spine form: same 18px regular, same ink, same
// top→bottom orientation as the printed label it follows.
function typeSpineValue(ctx: CanvasRenderingContext2D, text: string, cx: number, yTop: number, maxLen: number) {
  if (!text) return;
  const xs = spineTextXScale('vhs');
  const size = fitFontPx(ctx, text, 18, 'normal', maxLen / xs, 9);
  drawVerticalText(ctx, text, cx, yTop, `${size}px Arial, sans-serif`, STANDARD_INK, xs);
}

function drawStandardVhsOverlays(ctx: CanvasRenderingContext2D, movie: Movie) {
  ctx.save();

  // Deterministic per-title hash for the store-assigned numbers (rent code).
  let h = 0;
  for (let i = 0; i < movie.id.length; i++) h = (h * 31 + movie.id.charCodeAt(i)) >>> 0;

  // --- Spine: type real metadata into the printed form fields ---
  typeSpineValue(ctx, (movie.genres[0] || 'FEATURE').toUpperCase(), 519, 124, 400); // CATEGORY:
  typeSpineValue(ctx, (movie.rating || 'NR').toUpperCase(), 497, 99, 58);           // RATING:
  typeSpineValue(ctx, String(10 + (h % 90)), 497, 276, 36);                         // RENT CODE:
  const distributor = (movie.studios?.[0] || String(10000 + (h % 90000))).toUpperCase();
  typeSpineValue(ctx, distributor, 497, 368, 168);                                  // DIST:

  // The print's big "<BRAND> VIDEO RENTAL" spine line is the spine's
  // title placeholder, same idea as the front's right-edge line — erase it
  // and set the movie's title in its exact spot: same column, same top
  // anchor, print ink and bold weight. Long titles run past the print's
  // y-414 end into the blank gap before the barcode.
  ctx.fillStyle = scanColor('vhs', '#f3eadb'); // spine cream, sampled beside the printed line
  ctx.fillRect(527, 14, 30, 412);
  const sXs = spineTextXScale('vhs');
  const SPINE_TITLE_MAX = 505 / sXs; // y 26 → 531 after xScale, clear of the barcode digits
  let spineTitle = movie.title.toUpperCase();
  const sSize = fitFontPx(ctx, spineTitle, 32, 'bold', SPINE_TITLE_MAX, 12);
  ctx.font = `bold ${sSize}px Arial, sans-serif`;
  if (ctx.measureText(spineTitle).width > SPINE_TITLE_MAX) {
    while (spineTitle.length > 3 && ctx.measureText(spineTitle + '…').width > SPINE_TITLE_MAX) {
      spineTitle = spineTitle.slice(0, -1);
    }
    spineTitle += '…';
  }
  drawVerticalText(ctx, spineTitle, 541, 26, `bold ${sSize}px Arial, sans-serif`, STANDARD_INK, sXs);

  // --- Back-panel label window: typed title card under the printed heading ---
  const wx = 115;
  const wMax = 280; // interior right edge ≈ 395
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = STANDARD_INK;
  const titleSize = 26, overSize = 16, metaSize = 15;
  let y = 152;
  ctx.font = `bold ${titleSize}px Arial, sans-serif`;
  for (const ln of wrapText(ctx, movie.title.toUpperCase(), wMax).slice(0, 3)) {
    ctx.fillText(ln, wx, y);
    y += titleSize + 3;
  }
  y += 8;

  // Credits block is bottom-anchored inside the window; measure it first so
  // the synopsis can fill exactly the space between title and credits.
  ctx.font = `bold ${metaSize}px Arial, sans-serif`;
  const genreList = movie.genres.slice(0, 3).join(', ').toUpperCase() || 'FEATURE';
  const metaRaw = [
    movie.director ? `DIRECTED BY ${movie.director.toUpperCase()}` : '',
    `${genreList}   ·   RATED ${movie.rating || 'NR'}`,
    `RELEASED ${movie.year}${movie.duration ? `   ·   ${movie.duration}` : ''}`,
  ].filter(Boolean);
  const metaLines: string[] = [];
  for (const m of metaRaw) metaLines.push(...wrapText(ctx, m, wMax));
  const metaTop = 440 - metaLines.length * (metaSize + 3);

  ctx.font = `${overSize}px Arial, sans-serif`;
  const maxOverLines = Math.max(0, Math.floor((metaTop - 10 - y) / (overSize + 3)));
  for (const ln of wrapText(ctx, movie.overview || '', wMax).slice(0, maxOverLines)) {
    ctx.fillText(ln, wx, y);
    y += overSize + 3;
  }
  ctx.font = `bold ${metaSize}px Arial, sans-serif`;
  let my = metaTop;
  for (const ln of metaLines) {
    ctx.fillText(ln, wx, my);
    my += metaSize + 3;
  }

  // --- Front right edge: the print's "<BRAND> VIDEO RENTAL" line
  // (x 998-1011, y 210-499) is the wrap's TITLE PLACEHOLDER — erase it and
  // set the movie's title in its exact spot: same column (cx≈1004.5), same
  // vertical centre (y≈354.5), same bottom-to-top orientation, ink, weight
  // and ~19px print size (long titles shrink to the margin's full run).
  // Never over the blue ticket panel — it must not block the logo. ---
  ctx.fillStyle = scanColor('vhs', '#f3eadb'); // local cream, sampled at the right margin
  ctx.fillRect(990, 200, 28, 310);
  const F_TITLE_MAX = 660; // y ~25-715 of the 762-tall face is clear cream
  const fTitle = movie.title.toUpperCase();
  const fSize = fitFontPx(ctx, fTitle, 19, 'bold', F_TITLE_MAX, 11);
  ctx.font = `bold ${fSize}px Arial, sans-serif`;
  const fLen = ctx.measureText(fTitle).width;
  drawVerticalTextUp(ctx, fTitle, 1004.5, 354.5 + fLen / 2, `bold ${fSize}px Arial, sans-serif`, STANDARD_INK);

  ctx.restore();
}


// Overlay a movie's real metadata onto a full-resolution copy of the scan. No-op
// for a null movie (the generic front placeholder / unfocused back), which keeps
// the scan's blank window + brand text untouched.
function drawBoxOverlays(ctx: CanvasRenderingContext2D, L: BoxLayout, movie: Movie | null) {
  if (!movie) return;
  // All-ticket wraps have no place for metadata — render the print as-is.
  if (L.plain) return;
  if (L.standardVhs) {
    drawStandardVhsOverlays(ctx, movie);
    return;
  }
  if (L.dvdBlue) {
    drawDvdBlueOverlays(ctx, movie);
    return;
  }
  if (L.dvd2003) {
    drawDvd2003Overlays(ctx, movie);
  }
}

// Harness-only (bbwrap state): the full flat wrap scan (imgW×imgH) with this
// movie's typed-in metadata composited — lets the screenshot tool audit the
// box art (spine form fields included) flat-on instead of hunting camera
// angles in-scene.
export function composeRentalWrapPreview(movie: Movie | null): Promise<HTMLCanvasElement> {
  const medium = effectiveArtMedium();
  const L = activeBoxLayout(medium);
  return new Promise((resolve) => {
    loadBoxImage(medium, (img) => {
      const full = document.createElement('canvas');
      full.width = L.imgW;
      full.height = L.imgH;
      const fctx = full.getContext('2d')!;
      fctx.drawImage(img, 0, 0, L.imgW, L.imgH);
      drawBoxOverlays(fctx, L, movie);
      resolve(full);
    });
  });
}

// Screensaver (src/screensaver.ts): the bouncing 3D VHS box wears the real
// rental wrap. Pinned to the VHS medium regardless of the store's active
// medium — the screensaver object is specifically the rental VHS box.
// Generic print (no movie metadata typed in), same as the shared in-store
// front. Resolves with per-face images plus the printed panel proportions so
// the CSS box can match them instead of stretching the art.
export function rentalWrapFaceImages(): Promise<{
  front: string;
  back: string;
  spine: string;
  frontAspect: number; // front panel width / height
  spineAspect: number; // spine panel width / height
}> {
  const L = activeBoxLayout('vhs');
  return new Promise((resolve) => {
    loadBoxImage('vhs', (img) => {
      const full = document.createElement('canvas');
      full.width = L.imgW;
      full.height = L.imgH;
      full.getContext('2d')!.drawImage(img, 0, 0, L.imgW, L.imgH);
      const crop = (c: [number, number, number, number]) => {
        const cv = document.createElement('canvas');
        cv.width = Math.round((c[2] - c[0]) * L.imgW);
        cv.height = Math.round((c[3] - c[1]) * L.imgH);
        cv.getContext('2d')!.drawImage(
          full, c[0] * L.imgW, c[1] * L.imgH, cv.width, cv.height,
          0, 0, cv.width, cv.height);
        return cv.toDataURL('image/png');
      };
      const aspect = (c: [number, number, number, number]) =>
        ((c[2] - c[0]) * L.imgW) / ((c[3] - c[1]) * L.imgH);
      resolve({
        front: crop(L.front),
        back: crop(L.back),
        spine: crop(L.spine),
        frontAspect: aspect(L.front),
        spineAspect: aspect(L.spine),
      });
    });
  });
}

// Composite the scan (with this movie's overlays) and crop one face into ctx.
function renderBoxPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  movie: Movie | null,
  panel: 'front' | 'back' | 'spine',
  onUpdate?: () => void,
) {
  const medium = effectiveArtMedium();
  const L = activeBoxLayout(medium);
  loadBoxImage(medium, (img) => {
    const full = document.createElement('canvas');
    full.width = L.imgW;
    full.height = L.imgH;
    const fctx = full.getContext('2d')!;
    fctx.drawImage(img, 0, 0, L.imgW, L.imgH);
    drawBoxOverlays(fctx, L, movie);

    const crop = L[panel];
    const sx = crop[0] * L.imgW;
    const sy = crop[1] * L.imgH;
    const sw = (crop[2] - crop[0]) * L.imgW;
    const sh = (crop[3] - crop[1]) * L.imgH;
    ctx.clearRect(0, 0, w, h);
    // Physical VHS clamshell faces carry a painted molded-edge frame on the
    // top/bottom/right margins (paintRentalRimBorder, applied by the material
    // getters right after this draw). Inset the art inside those margins so
    // the frame borders the wrap instead of covering its edge art.
    let dx = 0, dy = 0, dw = w, dh = h;
    if (CASE_MEDIUM === 'vhs' && panel !== 'spine') {
      const { rimX, rimY } = rentalRimInsets(w, h);
      dy = rimY;
      dw = w - rimX;
      dh = h - 2 * rimY;
      // The rim strip mirrors to canvas-left on the back (see
      // paintRentalRimBorder), so the art has to shift right to clear it —
      // otherwise the border paints straight over the back-cover art.
      if (panel === 'back') dx = rimX;
    }
    ctx.drawImage(full, sx, sy, sw, sh, dx, dy, dw, dh);
    if (onUpdate) onUpdate();
  });
}

// -------------------------------------------------------------
// PANEL RENDERERS (names kept for existing call sites)
// -------------------------------------------------------------
// The SHARED front is the generic brand-emblem panel (drawn with a null
// movie); the focused hero case gets a per-title front with the movie's title
// sticker via getRentalFrontMaterial (GH #52).
// GH #42: the rental clamshell peeks out past the Jellyfin cover box by
// VHS_RIM_RIGHT_FT / VHS_RIM_VERTICAL_FT; from the browse camera that exposed
// strip is this front texture's margin, so it must read as black molded case,
// not white sticker. Margins mirror the rim's share of the rental face.
// Synchronous branded base coat for every rental-case placeholder canvas.
// These canvases used to start fully transparent (RGBA 0,0,0,0), which the
// opaque plastic material renders as PITCH BLACK until the async box-scan
// image decodes — the "black box" flash on boot and on first inspect/flip.
// Paint a simple house blue-and-gold panel with plain 2D fills (no
// image loads) immediately after canvas creation; the real scan overwrites
// it whenever it arrives.
function paintPlaceholderBase(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = '#0d2f7e';
  ctx.fillRect(0, 0, w, h);
  const bandH = Math.round(h * 0.16);
  const bandY = Math.round(h * 0.42);
  ctx.fillStyle = '#f5b400';
  ctx.fillRect(0, bandY, w, bandH);
  if (w >= 160) {
    ctx.fillStyle = '#0d2f7e';
    ctx.font = `900 ${Math.round(bandH * 0.42)}px ${BB_ARCHIVO_BLACK}, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(brandString('brand-wordmark', 'HALCYON'), w / 2, bandY + bandH / 2);
  }
  ctx.restore();
}

// `edgeColor` must match whichever case-edge material (sharedRentalBlackMaterial
// vs sharedRentalWhiteMaterial) the mesh's +X/+Y/-Y faces actually use —
// see the isAnimated branches in getGlobalBackMaterials/createHeroRentalMaterials
// — so the painted margin blends into the real plastic edge instead of
// mismatching it (GH #139 on the white-cased Animated Movies tapes).
// GH #42 originally blacked out the WHOLE exposed rim strip. Per user review
// ("let me see the art fitted to it with a smaller black border") only a thin
// molded-edge frame remains, and the art is drawn INSET inside it (see
// renderBoxPanel) so the frame borders the wrap instead of covering its edge
// — the printed right-edge text sits clear of the frame.
function rentalRimInsets(w: number, h: number): { rimX: number; rimY: number } {
  const RIM_BORDER_SCALE = 0.35;
  return {
    rimX: Math.ceil(w * (VHS_RIM_RIGHT_FT / (CASE_WIDTH + VHS_RIM_RIGHT_FT)) * RIM_BORDER_SCALE),
    rimY: Math.ceil(h * (VHS_RIM_VERTICAL_FT / 2 / (CASE_HEIGHT + VHS_RIM_VERTICAL_FT)) * RIM_BORDER_SCALE),
  };
}

function paintRentalRimBorder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  edgeColor: string = '#0a0a0a',
  panel: 'front' | 'back' | 'spine' = 'front',
) {
  if (CASE_MEDIUM !== 'vhs') return;
  const { rimX, rimY } = rentalRimInsets(w, h);
  ctx.fillStyle = edgeColor;
  ctx.fillRect(0, 0, w, rimY);              // top
  ctx.fillRect(0, h - rimY, w, rimY);       // bottom
  // The spine only carries the top/bottom rim — its left/right canvas edges are
  // the box's front/back corners (already bordered by those panels), so no side
  // strip belongs here.
  if (panel === 'spine') return;
  // The molded rim only exists on world +X (getRentalGeometry adds
  // VHS_RIM_RIGHT_FT on +X alone). BoxGeometry's UVs put u=1 at +X on the
  // front (+Z) face but at -X on the back (-Z) face, so the strip must mirror
  // to canvas-LEFT on the back to stay on that same physical edge — otherwise
  // it paints the spine/hinge and leaves the real rim showing bare edgeMat.
  if (panel === 'back') {
    ctx.fillRect(0, 0, rimX, h);            // canvas left  -> world +X (rim)
  } else {
    ctx.fillRect(w - rimX, 0, rimX, h);     // canvas right -> world +X (rim)
  }
  // GH #141: the opposite edge is the spine/hinge side — getRentalGeometry()
  // keeps it flush with the retail cover (no peeking clamshell plastic there,
  // see VHS_RIM_RIGHT_FT above), so painting a margin there doesn't match any
  // real molded edge. It used to read as a stray black border down the left
  // side of the rental copy in hero/inspect view ("the rental copy
  // should not have a black border on the left from this side").
}

function drawRentalFrontArt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  movie: Movie | null = null,
  onUpdate?: () => void
) {
  // GH #52: with a movie this renders the front panel including its title
  // sticker; with null it stays the generic logo panel (shared/global
  // materials for distant, unfocused boxes).
  renderBoxPanel(ctx, w, h, movie, 'front', onUpdate);
}

function drawRentalBackArt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  type: 'GENERIC_WARNINGS' | Movie,
  onUpdate?: () => void
) {
  const movie = type === 'GENERIC_WARNINGS' ? null : (type as Movie);
  renderBoxPanel(ctx, w, h, movie, 'back', onUpdate);
}

function drawRentalSpineArt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  movie: Movie,
  onUpdate?: () => void
) {
  renderBoxPanel(ctx, w, h, movie, 'spine', onUpdate);
}


// -------------------------------------------------------------
// DRAW JELLYFIN BACK COVER (Optimized)
// -------------------------------------------------------------

export interface BackCoverRegion {
  name: string;
  kind: 'actor' | 'director';
  y0: number;
  y1: number;
}
export const backCoverRegions = new Map<string, BackCoverRegion[]>();

// Fetched cover art, pre-decoded. An HTMLImageElement's pixels are decoded
// LAZILY — synchronously on the main thread at the first drawImage(), and
// again any time the browser has discarded the decoded buffer — which is
// exactly the 20-30ms unattributed flip hitch perf-trace caught (plus the
// ~19MB single-frame allocation bursts). createImageBitmap decodes off the
// main thread and the resize option caps the bitmap at the largest size the
// cover canvases actually sample, so a 1920x1080 backdrop stops costing 8.3MB
// of decode per draw. The HTMLImageElement fallback keeps old engines working.
type CachedArt = ImageBitmap | HTMLImageElement;

// Blob-sourced createImageBitmap decodes on Chrome's background image thread
// pool. An HTMLImageElement source decodes SYNCHRONOUSLY on the main thread —
// the chrome trace showed ~7ms 'Decode Image' blocks inside the load handlers,
// which is the same frame-pacing stall this pipeline exists to avoid (it just
// moved from first-drawImage to onload). So: fetch → blob → decode off-thread,
// then a cheap bitmap→bitmap resize down to the largest size the cover
// canvases sample. Returns null on any failure so callers can fall back to the
// classic <img> path (older engines, opaque-CORS responses).
async function fetchArtBitmap(url: string, maxWidth: number): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const full = await createImageBitmap(blob);
    if (full.width > maxWidth) {
      const scaled = await createImageBitmap(full, {
        resizeWidth: maxWidth,
        resizeHeight: Math.max(1, Math.round((full.height * maxWidth) / full.width)),
        resizeQuality: 'medium',
      });
      full.close();
      return scaled;
    }
    return full;
  } catch {
    return null;
  }
}

// Fallback-path helper (see fetchArtBitmap): element-sourced, so the decode
// lands on the main thread — only used when the blob path failed.
function decodeToBitmap(img: HTMLImageElement, maxWidth: number): Promise<CachedArt> {
  if (typeof createImageBitmap !== 'function' || !img.width || !img.height) {
    return Promise.resolve(img);
  }
  const scale = Math.min(1, maxWidth / img.width);
  const opts: ImageBitmapOptions = scale < 1
    ? { resizeWidth: Math.round(img.width * scale), resizeHeight: Math.round(img.height * scale), resizeQuality: 'medium' }
    : {};
  return createImageBitmap(img, opts).catch(() => img);
}

// Shared loader body: blob-path decode with <img> fallback, then `finish`
// stores the art and flushes waiter callbacks.
function loadArt(url: string, maxWidth: number, finish: (art: CachedArt | null) => void) {
  fetchArtBitmap(url, maxWidth).then((bitmap) => {
    if (bitmap) {
      finish(bitmap);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => { decodeToBitmap(img, maxWidth).then(finish); };
    img.onerror = () => finish(null);
  });
}

// Keyed by URL, not movie id: an HTMLImageElement shared Chrome's decoded-image
// cache across titles with the same art, but ImageBitmaps don't — id-keying
// made every title pay its own decode+resize (the synthetic harness shares ONE
// backdrop across all titles, so flipping along a shelf decoded it 60 times,
// and real libraries dedupe repeated art the same way).
const backdropImageCache = new Map<string, CachedArt>();
const backdropLoadingMap = new Map<string, Array<() => void>>();
const backdropKey = (movie: Movie) => movie.backdropUrl || movie.id;

// The widest region a SHELF back cover paints a backdrop into (COVER_WIDTH's
// top half, with headroom).
const SHELF_BACKDROP_MAX_W = 640;

// HERO BACK BACKDROP — the inspected case's back is COVER_WIDTH * HERO_COVER_SCALE
// wide, so the art spans ~960 logical px there and the shelf cap above upscales
// it 1.5x: the printed text on that face went sharp when it moved to the 3x
// canvas while the photo behind it stayed soft, which reads as a bad scan rather
// than a budget.
//
// One slot, not a second cache. backdropImageCache is unbounded and keyed by URL
// — every title flipped leaves a bitmap in it — so simply raising its cap would
// have tripled the bytes of a cache that already grows with the session. Only
// one case is ever inspected, so the hero copy is a single entry, replaced when
// the inspected title changes.
let heroBackdropKey: string | null = null;
let heroBackdrop: CachedArt | null = null;
let heroBackdropPending: string | null = null;

/**
 * The hero-resolution backdrop for `movie`, or null while it loads (the caller
 * falls back to the shelf copy, so the face is never blank — it sharpens once
 * this lands, exactly like the hero front). Kicks off the load on a miss.
 */
function heroBackdropFor(movie: Movie, onLoaded?: () => void): CachedArt | null {
  const key = backdropKey(movie);
  if (heroBackdropKey === key) return heroBackdrop;
  if (!movie.backdropUrl || heroBackdropPending === key) return null;
  heroBackdropPending = key;
  loadArt(movie.backdropUrl, COVER_WIDTH * HERO_COVER_SCALE, (art) => {
    if (heroBackdropPending !== key) return; // selection moved on mid-load
    heroBackdropPending = null;
    if (!art) return;
    heroBackdropKey = key;
    heroBackdrop = art;
    if (onLoaded) onLoaded();
  });
  return null;
}

function disposeHeroBackdrop() {
  heroBackdropKey = null;
  heroBackdrop = null;
  heroBackdropPending = null;
}

function loadBackdropImage(movie: Movie, onLoaded: () => void) {
  const key = backdropKey(movie);
  if (backdropImageCache.has(key)) {
    onLoaded();
    return;
  }

  if (backdropLoadingMap.has(key)) {
    backdropLoadingMap.get(key)!.push(onLoaded);
    return;
  }

  backdropLoadingMap.set(key, [onLoaded]);

  if (!movie.backdropUrl) {
    const callbacks = backdropLoadingMap.get(key) || [];
    backdropLoadingMap.delete(key);
    callbacks.forEach(cb => cb());
    return;
  }

  // Backdrops paint into a ≤640-logical-px region of a SHELF back cover. The
  // inspected case's back is drawn 3x larger and takes the hero copy below.
  loadArt(movie.backdropUrl, SHELF_BACKDROP_MAX_W, (art) => {
    if (art) {
      backdropImageCache.set(key, art);
      // Pre-pay both pixel analyses (GPU→CPU readbacks) here in the async
      // callback, so the first drawJellyfinBack for this art never stalls on
      // them mid-selection-change — see quietGridCache/contrastCache.
      sampleQuietGrid(art);
      getContrastColor(art);
    }
    const callbacks = backdropLoadingMap.get(key) || [];
    backdropLoadingMap.delete(key);
    callbacks.forEach(cb => cb());
  });
}

// Fetch-or-load a movie's backdrop art through the shared cache above, for
// consumers OUTSIDE the back-cover pipeline (e.g. floor-display collection
// signs). Invokes onArt synchronously when the art is already cached,
// otherwise once the async load lands; never invoked when the movie has no
// backdrop or the load fails.
export function getBackdropArt(movie: Movie, onArt: (art: ImageBitmap | HTMLImageElement) => void): void {
  const cached = backdropImageCache.get(backdropKey(movie));
  if (cached) {
    onArt(cached);
    return;
  }
  if (!movie.backdropUrl) return;
  loadBackdropImage(movie, () => {
    const art = backdropImageCache.get(backdropKey(movie));
    if (art) onArt(art);
  });
}

// Episode-still thumbnails for the series back-cover selector. Keyed by episode
// id; a null entry means "tried and failed" so we stop retrying and draw the
// placeholder. Mirrors the backdrop loader's dedupe-by-in-flight pattern.
// Keyed by thumb URL (same reason as backdropImageCache — ImageBitmaps don't
// share the browser's decoded-image cache, and episodes can share art).
const episodeThumbCache = new Map<string, CachedArt | null>();
const episodeThumbLoading = new Map<string, Array<() => void>>();
const episodeThumbKey = (ep: Episode) => ep.thumbUrl || ep.id;

function loadEpisodeThumb(ep: Episode, onLoaded: () => void) {
  const key = episodeThumbKey(ep);
  if (episodeThumbCache.has(key)) {
    onLoaded();
    return;
  }
  if (episodeThumbLoading.has(key)) {
    episodeThumbLoading.get(key)!.push(onLoaded);
    return;
  }
  episodeThumbLoading.set(key, [onLoaded]);
  const finish = () => {
    const cbs = episodeThumbLoading.get(key) || [];
    episodeThumbLoading.delete(key);
    cbs.forEach((cb) => cb());
  };
  if (!ep.thumbUrl) {
    episodeThumbCache.set(key, null);
    finish();
    return;
  }
  // A series flip paints up to 16 stills in one synchronous redraw — decoded
  // lazily they each cost a main-thread decode inside that draw (see loadArt).
  loadArt(ep.thumbUrl, 320, (art) => { episodeThumbCache.set(key, art); finish(); });
}

// Season POSTER (2:3) images, keyed by their image URL (a season is shared by
// many episodes, so id-keying like the episode still cache doesn't fit). Same
// coalescing contract as loadEpisodeThumb.
const seasonThumbCache = new Map<string, CachedArt | null>();
const seasonThumbLoading = new Map<string, Array<() => void>>();

function loadSeasonThumb(url: string, onLoaded: () => void) {
  if (seasonThumbCache.has(url)) { onLoaded(); return; }
  if (seasonThumbLoading.has(url)) { seasonThumbLoading.get(url)!.push(onLoaded); return; }
  seasonThumbLoading.set(url, [onLoaded]);
  const finish = () => {
    const cbs = seasonThumbLoading.get(url) || [];
    seasonThumbLoading.delete(url);
    cbs.forEach((cb) => cb());
  };
  loadArt(url, 320, (art) => { seasonThumbCache.set(url, art); finish(); });
}

// Cached per art object for the same reason as quietGridCache: the 10x10
// sample forces a readback of a GPU-backed ImageBitmap.
const contrastCache = new WeakMap<object, { text: string; secondaryText: string; isDark: boolean }>();

function getContrastColor(img: CachedArt): { text: string; secondaryText: string; isDark: boolean } {
  const cached = contrastCache.get(img);
  if (cached) return cached;
  const result = computeContrastColor(img);
  contrastCache.set(img, result);
  return result;
}

function computeContrastColor(img: CachedArt): { text: string; secondaryText: string; isDark: boolean } {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0, 10, 10);
      const data = ctx.getImageData(0, 0, 10, 10).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i+1];
        b += data[i+2];
      }
      r = Math.floor(r / 100);
      g = Math.floor(g / 100);
      b = Math.floor(b / 100);
      
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      
      if (luminance > 0.5) {
        return {
          text: '#020617',
          secondaryText: '#334155',
          isDark: false
        };
      }
    }
  } catch (e) {
    // CORS/Security error, fallback
  }
  return {
    text: '#ffffff',
    secondaryText: '#cbd5e1',
    isDark: true
  };
}

function getHexContrastColor(hexColor: string): { text: string; secondaryText: string; isDark: boolean } {
  try {
    const cleanHex = hexColor.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (luminance > 0.5) {
      return {
        text: '#020617',
        secondaryText: '#334155',
        isDark: false
      };
    }
  } catch (e) {
    // ignore
  }
  return {
    text: '#ffffff',
    secondaryText: '#cbd5e1',
    isDark: true
  };
}

function hexToRgb(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `${r}, ${g}, ${b}`;
}

// -------------------------------------------------------------
// SMART SYNOPSIS PLACEMENT (quiet-region finder + scrim fallback)
// -------------------------------------------------------------
// Classic "smart subtitle placement": downsample the visible (cover-cropped)
// backdrop, measure local COLOR variance (full RGB, not just luminance) on a
// coarse grid, then slide a window the size of the synopsis text block across
// the top half looking for the spot with the fewest distinct colors — sky,
// wall, shadow, fog. Luminance alone called two different-hue-same-brightness
// areas "quiet"; the RGB metric only clears near-solid-color regions. If
// nothing is quiet enough we keep the default position but draw a heavy dark
// scrim panel behind the text instead of letting it sit raw on busy art.

const QUIET_ANALYSIS_W = 48;   // offscreen sample size; matches the 640x480 (4:3) top-half aspect
const QUIET_ANALYSIS_H = 36;
const QUIET_GRID_COLS = 12;    // coarse grid used for the variance scan (4px per cell in analysis space)
const QUIET_GRID_ROWS = 9;
const QUIET_EDGE_PADDING = 40; // keep the text window this far from every edge of the top half
const QUIET_GRADIENT_Y = 360;  // the fade-to-bottom-half gradient starts here; text must stay above it
// Threshold for the RGB color-variance score (sum of per-cell RGB variances
// over the window + variance of the cells' mean colors). The old
// luminance-only threshold was 900; RGB sums three channels, so ~2700 is the
// equivalent strictness — and unlike luminance it now also rejects windows
// whose cells differ only in hue. Scores below this land in effectively
// solid-color regions (sky, wall, shadow); above it is textured art.
const QUIET_SCORE_THRESHOLD = 2700;
const QUIET_MIN_WIDTH_FRACTION = 0.55; // never shrink the text column below 55% of the card width
const QUIET_WIDTH_FRACTIONS = [1, 0.85, 0.7, QUIET_MIN_WIDTH_FRACTION];

// Synopsis text metrics in the 640×960 authoring space. 26px/36px (up from
// 20px/32px light-weight) — the description was unreadably small on the
// flipped hero case, doubly so through the 320×480 shelf-back texture.
const DESC_LINE_HEIGHT = 36;
const DESC_MAX_LINES = 6;

interface TextPlacement {
  x: number;
  yStart: number;   // baseline of the first line
  maxY: number;      // baseline may not exceed this
  maxWidth: number;
  useScrim: boolean;
  scrimRect?: { x: number; y: number; width: number; height: number };
  textColor: string;
  isDark: boolean;
  computedWithBackdrop: boolean; // false = temporary placeholder while the backdrop is still loading
}

const backCoverTextPlacementCache = new Map<string, TextPlacement>();

interface QuietWindow {
  rect: { x: number; y: number; width: number; height: number };
  score: number;
  meanLuminance: number; // 0-255
}

// The variance grid is sampled ONCE per decoded art object: drawImage of a
// (typically GPU-backed) ImageBitmap into the willReadFrequently analysis
// canvas + getImageData force a GPU→CPU readback, which stalls the main
// thread for tens of ms whenever the GPU is busy with texture uploads
// (perf-trace: 27-43ms drawJellyfinBack calls inside hero binds on the games
// config). The grid depends only on the art pixels (the crop aspect is the
// fixed 4:3 top-half), so loadBackdropImage precomputes it in its async
// callback — off the selection-change path — and later draws just read it.
const quietGridCache = new WeakMap<object, Uint8ClampedArray | null>();

function sampleQuietGrid(backdrop: CachedArt): Uint8ClampedArray | null {
  const cached = quietGridCache.get(backdrop);
  if (cached !== undefined) return cached;
  // Same cover-crop math used to actually paint the backdrop, so we analyze
  // exactly the pixels that end up on screen (analysis canvas shares the
  // painted region's 4:3 aspect).
  const imgAspect = backdrop.width / backdrop.height;
  const canvasAspect = QUIET_ANALYSIS_W / QUIET_ANALYSIS_H;
  let srcW = backdrop.width;
  let srcH = backdrop.height;
  let srcX = 0;
  let srcY = 0;
  if (imgAspect > canvasAspect) {
    srcW = backdrop.height * canvasAspect;
    srcX = (backdrop.width - srcW) / 2;
  } else {
    srcH = backdrop.width / canvasAspect;
    srcY = (backdrop.height - srcH) / 2;
  }
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = QUIET_ANALYSIS_W;
  analysisCanvas.height = QUIET_ANALYSIS_H;
  const actx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!actx) {
    quietGridCache.set(backdrop, null);
    return null;
  }
  actx.drawImage(backdrop, srcX, srcY, srcW, srcH, 0, 0, QUIET_ANALYSIS_W, QUIET_ANALYSIS_H);
  let data: Uint8ClampedArray | null;
  try {
    data = actx.getImageData(0, 0, QUIET_ANALYSIS_W, QUIET_ANALYSIS_H).data;
  } catch {
    data = null; // CORS-tainted canvas, can't sample pixels
  }
  quietGridCache.set(backdrop, data);
  return data;
}

function findQuietRegion(backdrop: CachedArt, w: number, topH: number, blockHeightPx: number): QuietWindow | null {
  const data = sampleQuietGrid(backdrop);
  if (!data) return null;

  const cellW = QUIET_ANALYSIS_W / QUIET_GRID_COLS;
  const cellH = QUIET_ANALYSIS_H / QUIET_GRID_ROWS;
  // Per-cell mean color (RGB) plus combined color variance: the mean squared
  // distance of each pixel's RGB from the cell's mean color. A cell of one
  // solid color scores 0 no matter the color; a cell mixing hues scores high
  // even when its luminance is flat — "fewest different color pixels".
  const cellMeanR: number[][] = [];
  const cellMeanG: number[][] = [];
  const cellMeanB: number[][] = [];
  const cellVar: number[][] = [];

  for (let cy = 0; cy < QUIET_GRID_ROWS; cy++) {
    cellMeanR[cy] = [];
    cellMeanG[cy] = [];
    cellMeanB[cy] = [];
    cellVar[cy] = [];
    for (let cx = 0; cx < QUIET_GRID_COLS; cx++) {
      const x0 = Math.floor(cx * cellW);
      const x1 = Math.floor((cx + 1) * cellW);
      const y0 = Math.floor(cy * cellH);
      const y1 = Math.floor((cy + 1) * cellH);
      let sumR = 0, sumG = 0, sumB = 0;
      let sumSqR = 0, sumSqG = 0, sumSqB = 0;
      let count = 0;
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const idx = (py * QUIET_ANALYSIS_W + px) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          sumR += r; sumG += g; sumB += b;
          sumSqR += r * r; sumSqG += g * g; sumSqB += b * b;
          count++;
        }
      }
      const mR = count > 0 ? sumR / count : 0;
      const mG = count > 0 ? sumG / count : 0;
      const mB = count > 0 ? sumB / count : 0;
      cellMeanR[cy][cx] = mR;
      cellMeanG[cy][cx] = mG;
      cellMeanB[cy][cx] = mB;
      // E[x²] − E[x]² per channel, summed — the combined RGB variance.
      cellVar[cy][cx] = count > 0
        ? (sumSqR / count - mR * mR) + (sumSqG / count - mG * mG) + (sumSqB / count - mB * mB)
        : 0;
    }
  }

  // Canvas-space size of one grid cell.
  const cellPxW = w / QUIET_GRID_COLS;
  const cellPxH = topH / QUIET_GRID_ROWS;

  // Valid vertical range for the window: clear of the top padding, the
  // transition-gradient strip, and the bottom padding.
  const maxWindowBottomPx = Math.min(topH - QUIET_EDGE_PADDING, QUIET_GRADIENT_Y);
  const windowRows = Math.max(1, Math.round(blockHeightPx / cellPxH));

  // Try progressively narrower windows (widest first). A wider quiet spot is
  // preferred; a narrower column (down to QUIET_MIN_WIDTH_FRACTION of the
  // card) is only used if the full-width search couldn't clear the threshold.
  for (const frac of QUIET_WIDTH_FRACTIONS) {
    const windowCols = Math.max(1, Math.round(QUIET_GRID_COLS * frac));
    let bestAtWidth: { cx: number; cy: number; score: number; meanLum: number } | null = null;

    for (let cy = 0; cy + windowRows <= QUIET_GRID_ROWS; cy++) {
      const winTopPx = cy * cellPxH;
      const winBottomPx = (cy + windowRows) * cellPxH;
      if (winTopPx < QUIET_EDGE_PADDING || winBottomPx > maxWindowBottomPx) continue;

      for (let cx = 0; cx + windowCols <= QUIET_GRID_COLS; cx++) {
        const winLeftPx = cx * cellPxW;
        const winRightPx = (cx + windowCols) * cellPxW;
        if (winLeftPx < QUIET_EDGE_PADDING || winRightPx > w - QUIET_EDGE_PADDING) continue;

        let varSum = 0;
        let sumR = 0, sumG = 0, sumB = 0;
        let sumSqR = 0, sumSqG = 0, sumSqB = 0;
        let n = 0;
        for (let gy = cy; gy < cy + windowRows; gy++) {
          for (let gx = cx; gx < cx + windowCols; gx++) {
            varSum += cellVar[gy][gx];
            const r = cellMeanR[gy][gx], g = cellMeanG[gy][gx], b = cellMeanB[gy][gx];
            sumR += r; sumG += g; sumB += b;
            sumSqR += r * r; sumSqG += g * g; sumSqB += b * b;
            n++;
          }
        }
        const mR = sumR / n, mG = sumG / n, mB = sumB / n;
        // Variance of the cells' mean COLORS across the window (rejects
        // windows that straddle two flat but differently-colored areas,
        // e.g. half blue sky / half beige building — invisible to the old
        // luminance-only version when the two halves were equally bright).
        const meanVar =
          (sumSqR / n - mR * mR) + (sumSqG / n - mG * mG) + (sumSqB / n - mB * mB);

        // Sum of per-cell color variances (local detail) plus the
        // cross-window color drift above: low only where the art is
        // effectively one solid color.
        const score = varSum + meanVar;
        if (!bestAtWidth || score < bestAtWidth.score) {
          bestAtWidth = { cx, cy, score, meanLum: 0.2126 * mR + 0.7152 * mG + 0.0722 * mB };
        }
      }
    }

    if (bestAtWidth && bestAtWidth.score <= QUIET_SCORE_THRESHOLD) {
      return {
        rect: {
          x: bestAtWidth.cx * cellPxW,
          y: bestAtWidth.cy * cellPxH,
          width: windowCols * cellPxW,
          height: windowRows * cellPxH
        },
        score: bestAtWidth.score,
        meanLuminance: bestAtWidth.meanLum
      };
    }
  }

  return null;
}

function getBackCoverCorner(movie: Movie): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
  let hash = 0;
  const id = movie.id || movie.title || '';
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % 4;
  return (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const)[idx];
}

function drawReviewSnippetBadge(
  ctx: CanvasRenderingContext2D,
  w: number,
  _h: number,
  movie: Movie,
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  theme: GenreTheme
) {
  const snippet = getReviewSnippetForMovie(movie);
  const rawText = `“${snippet}”`;

  ctx.save();
  ctx.font = `900 24px ${BB_OUTFIT}, sans-serif`;

  const maxBadgeW = 320;
  const words = rawText.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
    if (ctx.measureText(testLine).width > maxBadgeW - 36 && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const maxLineWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const paddingX = 18;
  const paddingY = 10;
  const lineHeight = 28;
  const badgeWidth = Math.min(maxBadgeW, maxLineWidth + paddingX * 2);
  const badgeHeight = lines.length * lineHeight + paddingY * 2;

  let bx = 45;
  let by = 35;

  if (corner === 'top-left') {
    bx = 45;
    by = 35;
  } else if (corner === 'top-right') {
    bx = w - 45 - badgeWidth;
    by = 35;
  } else if (corner === 'bottom-left') {
    bx = 45;
    by = 390;
  } else if (corner === 'bottom-right') {
    bx = w - 45 - badgeWidth;
    by = 390;
  }

  // Draw semi-transparent dark plate for high contrast
  const radius = 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = theme.primary || '#f59e0b';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(bx + radius, by);
  ctx.arcTo(bx + badgeWidth, by, bx + badgeWidth, by + badgeHeight, radius);
  ctx.arcTo(bx + badgeWidth, by + badgeHeight, bx, by + badgeHeight, radius);
  ctx.arcTo(bx, by + badgeHeight, bx, by, radius);
  ctx.arcTo(bx, by, bx + badgeWidth, by, radius);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw large bold quote text
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#fef08a'; // Bright quote yellow
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const startY = by + paddingY + lineHeight / 2;
  lines.forEach((line, idx) => {
    ctx.fillText(line, bx + badgeWidth / 2, startY + idx * lineHeight);
  });

  ctx.restore();
}

function computeBackCoverTextPlacement(
  backdrop: CachedArt | undefined,
  w: number,
  h: number,
  topContrast: { text: string; secondaryText: string; isDark: boolean },
  movie?: Movie
): TextPlacement {
  const topH = h / 2;
  const corner = movie ? getBackCoverCorner(movie) : 'top-left';
  const descStart = 145; // Below top header elements (Y = 35..135)
  const defaultMaxWidth = w - 100;
  const defaultMaxY = (corner === 'bottom-left' || corner === 'bottom-right')
    ? 380 // Stop above bottom snippet at Y = 390
    : Math.min(descStart + DESC_LINE_HEIGHT * DESC_MAX_LINES, topH - 30);

  if (backdrop) {
    const blockHeightPx = DESC_MAX_LINES * DESC_LINE_HEIGHT;
    const quiet = findQuietRegion(backdrop, w, topH, blockHeightPx);
    if (quiet) {
      const luminance = quiet.meanLuminance / 255;
      const isDark = luminance <= 0.5;
      const yStart = Math.max(descStart, quiet.rect.y + DESC_LINE_HEIGHT * 0.75);
      const maxY = Math.min(defaultMaxY, quiet.rect.y + quiet.rect.height);

      if (maxY > yStart + DESC_LINE_HEIGHT) {
        return {
          x: quiet.rect.x,
          yStart,
          maxY,
          maxWidth: quiet.rect.width,
          useScrim: false,
          textColor: isDark ? '#f1f5f9' : '#0f172a',
          isDark,
          computedWithBackdrop: true
        };
      }
    }
  }

  const scrimPadding = 20;
  const scrimRect = {
    x: 50 - scrimPadding,
    y: descStart - DESC_LINE_HEIGHT - scrimPadding,
    width: defaultMaxWidth + scrimPadding * 2,
    height: (defaultMaxY - descStart) + DESC_LINE_HEIGHT + scrimPadding * 2
  };

  return {
    x: 50,
    yStart: descStart,
    maxY: defaultMaxY,
    maxWidth: defaultMaxWidth,
    useScrim: !!backdrop,
    scrimRect,
    textColor: backdrop ? '#f1f5f9' : topContrast.secondaryText,
    isDark: backdrop ? true : topContrast.isDark,
    computedWithBackdrop: !!backdrop
  };
}

// Perf-trace wrapper: the back cover is also redrawn from ASYNC callbacks
// (backdrop/thumb arrival), outside the material factories' caseCanvasMs
// spans — this attributes those redraws (and the findQuietRegion/contrast
// sampling inside) to their own slot.
export function drawJellyfinBack(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  movie: Movie,
  highlightedName?: string,
  onUpdate?: () => void
) {
  perfTrace.count(CT_BACKDRAW);
  perfTrace.begin(SP_BACKDRAW);
  try {
    drawJellyfinBackImpl(ctx, w, h, movie, highlightedName, onUpdate);
  } finally {
    perfTrace.end(SP_BACKDRAW);
  }
}

function drawJellyfinBackImpl(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  movie: Movie,
  highlightedName?: string,
  onUpdate?: () => void
) {
  const theme = getGenreTheme(movie.genres);
  const regions: BackCoverRegion[] = [];
  const corner = getBackCoverCorner(movie);

  // A face this wide is the inspected case's 3x back (heroFaceSlot 'jfback'),
  // where the shelf backdrop's 640px cap shows — prefer the hero copy, falling
  // back to the shelf one until it lands.
  const wantHeroArt = w > SHELF_BACKDROP_MAX_W && heroDetailArtEnabled();
  const backdrop = (wantHeroArt ? heroBackdropFor(movie, onUpdate) : null)
    ?? backdropImageCache.get(backdropKey(movie));
  if (!backdrop && movie.backdropUrl) {
    loadBackdropImage(movie, () => {
      if (onUpdate) onUpdate();
    });
  }

  // Prevalent color (spine color) fallback to theme bg or slate blue
  const prevalentColor = leftmostColorCache.get(movie.id) || '#0f172a';

  // Draw background - top half is hero image, bottom half is prevalent color
  if (backdrop) {
    const topH = h / 2;
    const imgAspect = backdrop.width / backdrop.height;
    const canvasAspect = w / topH;
    let drawW = backdrop.width;
    let drawH = backdrop.height;
    let drawX = 0;
    let drawY = 0;
    
    if (imgAspect > canvasAspect) {
      drawW = backdrop.height * canvasAspect;
      drawX = (backdrop.width - drawW) / 2;
    } else {
      drawH = backdrop.width / canvasAspect;
      drawY = (backdrop.height - drawH) / 2;
    }
    ctx.drawImage(backdrop, drawX, drawY, drawW, drawH, 0, 0, w, topH);
    
    // Draw fading transition gradient in the middle
    const transGrad = ctx.createLinearGradient(0, 360, 0, topH);
    transGrad.addColorStop(0, `rgba(${hexToRgb(prevalentColor)}, 0)`);
    transGrad.addColorStop(1, prevalentColor);
    ctx.fillStyle = transGrad;
    ctx.fillRect(0, 360, w, 120);
  } else {
    // Fallback: Gradient background on the top half
    const grad = ctx.createLinearGradient(0, 0, 0, h / 2);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, prevalentColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h / 2);
    drawGrid(ctx, w, h / 2, theme);
  }

  // Draw bottom half background (solid prevalent color)
  ctx.fillStyle = prevalentColor;
  ctx.fillRect(0, h / 2, w, h / 2);

  // Get contrast color details independently for top and bottom halves
  const topContrast = backdrop ? getContrastColor(backdrop) : { text: '#ffffff', secondaryText: '#cbd5e1', isDark: true };
  const bottomContrast = getHexContrastColor(prevalentColor);

  ctx.textAlign = 'left';

  // Smart synopsis placement: find the quietest region of the backdrop once
  // per movie (cached — this function re-runs on every hover highlight
  // re-render, and the variance scan is too expensive to repeat every time).
  let placement = backCoverTextPlacementCache.get(movie.id);
  if (!placement || (backdrop && !placement.computedWithBackdrop)) {
    placement = computeBackCoverTextPlacement(backdrop, w, h, topContrast, movie);
    backCoverTextPlacementCache.set(movie.id, placement);
  }

  // Scrim panel goes behind the text, drawn after the backdrop/gradient but
  // before any text — a tinted rounded rect, never a hard black censor bar.
  if (placement.useScrim && placement.scrimRect) {
    const { x: sx, y: sy, width: sw, height: sh } = placement.scrimRect;
    const radius = 16;
    ctx.save();
    const [pr, pg, pb] = hexToRgb(prevalentColor).split(',').map((v) => parseInt(v.trim(), 10) || 0);
    ctx.fillStyle = `rgba(${Math.round(pr * 0.3)}, ${Math.round(pg * 0.3)}, ${Math.round(pb * 0.3)}, 0.88)`;
    ctx.beginPath();
    ctx.moveTo(sx + radius, sy);
    ctx.arcTo(sx + sw, sy, sx + sw, sy + sh, radius);
    ctx.arcTo(sx + sw, sy + sh, sx, sy + sh, radius);
    ctx.arcTo(sx, sy + sh, sx, sy, radius);
    ctx.arcTo(sx, sy, sx + sw, sy, radius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Draw Header Barcode: top-left if snippet is top-right, otherwise top-right
  if (corner === 'top-right') {
    drawBarcode(ctx, 45, 35, 120, 90, movie.id);
  } else {
    drawBarcode(ctx, w - 165, 35, 120, 90, movie.id);
  }

  // Draw Review Snippet Badge in chosen upper-half corner
  drawReviewSnippetBadge(ctx, w, h, movie, corner, theme);

  ctx.font = `400 26px ${BB_OUTFIT}, sans-serif`;
  ctx.fillStyle = placement.textColor;

  // Wrap description into the placed text block
  ctx.save();
  ctx.shadowColor = placement.isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  const descWords = movie.overview.split(' ');
  let descLine = '';
  let dy = placement.yStart;
  const descMaxY = placement.maxY;
  for (let n = 0; n < descWords.length && dy < descMaxY; n++) {
    const testLine = descLine + descWords[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > placement.maxWidth) {
      ctx.fillText(descLine, placement.x, dy);
      descLine = descWords[n] + ' ';
      dy += DESC_LINE_HEIGHT;
    } else {
      descLine = testLine;
    }
  }
  if (dy < descMaxY) {
    ctx.fillText(descLine, placement.x, dy);
  }
  ctx.restore();

  // ----- Bottom Half: Actor and Director selections -----
  // The tech-specs box (drawn last) is anchored to the bottom edge like a real
  // retail back panel, so cap the actor list to what keeps the credits block
  // above it: credits need 79px below their header baseline (genres line +
  // clearance), the actor list costs 14px after its header plus 46 per row
  // plus a 20px gap.
  const specTop = h - 18 - TECH_SPECS_TABLE_H;
  const maxActorRows = Math.floor((specTop - 79 - (h / 2 + 30) - 34) / 46);
  const actors = (movie.actors || []).slice(0, Math.max(0, Math.min(5, maxActorRows)));
  let cy = h / 2 + 30; // Starts at Y = 510
  if (actors.length > 0) {
    ctx.font = `bold 20px ${BB_ORBITRON}, sans-serif`;
    ctx.fillStyle = bottomContrast.isDark ? theme.secondary : theme.primary;
    ctx.fillText('STARRING', 50, cy);
    cy += 14;

    const ROW_H = 46;
    actors.forEach((actor) => {
      const rowTop = cy;
      const isHighlighted = (highlightedName === actor);
      if (isHighlighted) {
        ctx.fillStyle = bottomContrast.isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.18)';
        ctx.fillRect(44, rowTop + 6, w - 88, ROW_H - 8);
        ctx.strokeStyle = bottomContrast.isDark ? theme.secondary : theme.primary;
        ctx.lineWidth = 3;
        ctx.strokeRect(44, rowTop + 6, w - 88, ROW_H - 8);
      } else {
        ctx.fillStyle = bottomContrast.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
        ctx.fillRect(44, rowTop + 6, w - 88, ROW_H - 8);
      }
      ctx.fillStyle = bottomContrast.text;
      ctx.font = `600 24px ${BB_OUTFIT}, sans-serif`;
      ctx.fillText(actor, 60, rowTop + 36);
      ctx.fillStyle = bottomContrast.isDark ? theme.secondary : theme.primary;
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('▸', w - 58, rowTop + 35);
      ctx.textAlign = 'left';
      regions.push({ name: actor, kind: 'actor', y0: (rowTop + 4) / h, y1: (rowTop + ROW_H - 2) / h });
      cy += ROW_H;
    });
    cy += 20;
  }

  ctx.font = `bold 18px ${BB_ORBITRON}, sans-serif`;
  ctx.fillStyle = bottomContrast.isDark ? theme.secondary : theme.primary;
  ctx.fillText('PRODUCTION CREDITS', 50, cy);

  ctx.font = `16px ${BB_OUTFIT}, sans-serif`;
  ctx.fillStyle = bottomContrast.secondaryText;
  const dirY = cy + 35;
  if (movie.director && movie.director !== 'Unknown Director') {
    const isHighlighted = (highlightedName === movie.director);
    if (isHighlighted) {
      ctx.fillStyle = bottomContrast.isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.18)';
      ctx.fillRect(44, dirY - 18, w - 88, 28);
      ctx.strokeStyle = bottomContrast.isDark ? theme.secondary : theme.primary;
      ctx.lineWidth = 2;
      ctx.strokeRect(44, dirY - 18, w - 88, 28);
    }
    regions.push({ name: movie.director, kind: 'director', y0: (dirY - 20) / h, y1: (dirY + 8) / h });
  }
  ctx.fillStyle = bottomContrast.secondaryText;
  ctx.font = `16px ${BB_OUTFIT}, sans-serif`;
  ctx.fillText(`Director: ${movie.director}`, 50, dirY);
  ctx.fillText(`Genres:   ${movie.genres.join(', ')}`, 50, cy + 65);

  // Retail tech-specs box, bottom-anchored — the year/rating/duration line it
  // replaced lives inside the table (RATED / RUNNING TIME / © year), filled
  // from real Jellyfin stream metadata (see tech-specs.ts). Header strip is a
  // darkened cut of the case's prevalent color so the panel reads as part of
  // this cover rather than a generic sticker.
  const [ar, ag, ab] = hexToRgb(prevalentColor).split(',').map((v) => parseInt(v.trim(), 10) || 0);
  drawTechSpecsTable(ctx, 44, specTop, w - 88, movie, {
    accent: `rgb(${Math.round(ar * 0.35)}, ${Math.round(ag * 0.35)}, ${Math.round(ab * 0.35)})`,
  });

  backCoverRegions.set(movie.id, regions);
}

// -------------------------------------------------------------
// 2.6 GENERIC INSTANCED MESH (For LOD / Background Store Filling)
// -------------------------------------------------------------
export function createGenericInstancedMesh(count: number): THREE.InstancedMesh {
  initSharedMaterials();
  // GH #42: these background fillers are rental clamshells too — black
  // top/right/bottom edges on VHS, white on DVD. Shared materials only, so
  // the whole population stays a single instanced draw either way.
  const edgeMat = CASE_MEDIUM === 'vhs' ? sharedRentalBlackMaterial! : sharedRentalWhiteMaterial!;
  const mats = [
    edgeMat,
    sharedRentalSpinePlaceholderMaterial!,
    edgeMat,
    edgeMat,
    sharedRentalFrontMaterial!,
    sharedRentalBackPlaceholderMaterial!,
  ];

  const boxGeo = getRentalGeometry();
  const mesh = new THREE.InstancedMesh(boxGeo, mats, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  return mesh;
}

// -------------------------------------------------------------
// 3. MAIN EXPORT: Create a Group holding both boxes (Repositioned to fix clipping)
// -------------------------------------------------------------
export interface InstancedMovieGroup {
  front: THREE.InstancedMesh;
  back: THREE.InstancedMesh;
  loadShelfDetails: (priority?: number) => void;
  loadFullDetails: () => void;
  movie: Movie;
}

export function createMovieInstancedMeshes(movie: Movie, count: number, probeIdx?: number): InstancedMovieGroup {
  const boxGeo = getGeometry();
  initSharedMaterials();

  // GH #42: the back box is the rental clamshell — on VHS it is
  // molded slightly larger than the retail cover box in front of it (so a rim
  // peeks out on top/right/bottom) and its exposed edges are black plastic.
  // The white-cased "Animated Movies" tapes keep their white clamshell; DVD
  // keeps the original white, cover-sized case.
  const rentalGeo = getRentalGeometry();
  const bbEdgeMat = (CASE_MEDIUM === 'vhs')
    ? sharedRentalBlackMaterial!
    : sharedRentalWhiteMaterial!;

  // Create unique material arrays for this movie so it can have its own textures
  const frontMats = [
    sharedBlackMaterial!,
    sharedRentalSpinePlaceholderMaterial!,
    sharedBlackMaterial!,
    sharedBlackMaterial!,
    sharedRentalFrontMaterial!,
    sharedRentalBackPlaceholderMaterial!,
  ];

  const backMats = [
    bbEdgeMat,
    sharedRentalSpinePlaceholderMaterial!,
    bbEdgeMat,
    bbEdgeMat,
    sharedRentalFrontMaterial!,
    sharedRentalBackPlaceholderMaterial!,
  ];

  const front = new THREE.InstancedMesh(boxGeo, frontMats, count);
  const back = new THREE.InstancedMesh(rentalGeo, backMats, count);
  
  front.castShadow = true;
  front.receiveShadow = true;
  front.frustumCulled = false;
  back.castShadow = true;
  back.receiveShadow = true;
  back.frustumCulled = false;

  let shelfDetailsLoaded = false;
  let fullDetailsLoaded = false;
  let lastLoadedPriority = 0;

  const loadShelfDetails = (priority = 1) => {
    const isFirstLoad = !shelfDetailsLoaded;
    if (isFirstLoad) {
      shelfDetailsLoaded = true;
      frontMats[1] = getJellyfinSpineMaterial(leftmostColorCache.get(movie.id) || null, probeIdx);
      front.material = [...frontMats];
    }

    if (posterPixelCache.has(movie.id)) {
      queueTextureUpload(() => {
        // 'fixture' pin: these decor-bin meshes hold the material for the
        // scene's lifetime, so their texture must not be LRU-evicted (#97).
        frontMats[4] = getPosterMaterial(movie.id, probeIdx, false, !!movie.game, 'fixture');
        const hexColor = leftmostColorCache.get(movie.id) || null;
        frontMats[1] = getJellyfinSpineMaterial(hexColor, probeIdx);
        front.material = [...frontMats];
        wakeTextureStream(); // no `scene` ref here — reuse the texture-stream wake
      });
      return;
    }

    if (!isFirstLoad && priority <= lastLoadedPriority) {
      return;
    }
    lastLoadedPriority = priority;

    if (movie.posterUrl) {
      posterQueue.load(movie, priority, () => { // dedupes in-flight requests itself
        frontMats[4] = getPosterMaterial(movie.id, probeIdx, false, !!movie.game, 'fixture');
        const hexColor = leftmostColorCache.get(movie.id) || null;
        frontMats[1] = getJellyfinSpineMaterial(hexColor, probeIdx);
        front.material = [...frontMats];
        wakeTextureStream();
      });
    }
  };

  const loadFullDetails = () => {
    loadShelfDetails(3);

    if (fullDetailsLoaded) return;
    fullDetailsLoaded = true;

    backMats[5] = getRentalBackMaterial(movie, probeIdx);
    backMats[1] = getRentalSpineMaterial(movie, probeIdx);
    frontMats[5] = getJellyfinBackMaterial(movie, probeIdx);
    
    front.material = [...frontMats];
    back.material = [...backMats];
  };

  return { front, back, loadShelfDetails, loadFullDetails, movie };
}

// cropX: fraction cropped off EACH horizontal side of the sampled art, matching
// POSTER_CROP_X. This shader samples `texture(map, scaledUv)` with a hand-built
// UV, which bypasses three's map offset/repeat transform — so a texture cropped
// via cropFrontTextureForMedium() would NOT be cropped here. Pass the crop in
// explicitly (front poster only; canvas-drawn backs/spines are authored at the
// face aspect and pass 0) so the animated hero front doesn't reveal the poster's
// baked-in left/right letterbox bars that the shelf's instanced shader crops.
// `borderSide` picks which vertical edge carries the white rim. The retail
// (Jellyfin) box wants the rim on the front's RIGHT + top + bottom, but on the
// FLIPPED back the same physical edge reads on the LEFT — pass 'left' there so
// the border tracks the box's real trimmed edge instead of the spine/hinge.
export function applyWhiteBorderShader(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  cropX: number = 0,
  borderSide: 'right' | 'left' = 'right',
) {
  const xEdgeCond = borderSide === 'left' ? 'vUv.x < border' : 'vUv.x > 1.0 - border';
  // Content region is the non-bordered strip: [border, 1] for a left rim,
  // [0, 1-border] for a right rim. Rescale UVs back to [0,1] before cropX.
  const xMap = borderSide === 'left'
    ? '(vUv.x - border) / (1.0 - border)'
    : 'vUv.x / (1.0 - border)';
  mat.defines = mat.defines || {};
  mat.defines.USE_UV = '';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      ${shader.vertexShader}
    `.replace(
      '#include <uv_vertex>',
      `
      vUv = uv;
      `
    );

    shader.fragmentShader = `
      ${shader.fragmentShader}
    `.replace(
      '#include <map_fragment>',
      `
      float border = 0.04;
      if (${xEdgeCond} || vUv.y < border || vUv.y > 1.0 - border) {
        diffuseColor.rgb = vec3(1.0);
      } else {
        float cropX = ${cropX.toFixed(6)};
        vec2 scaledUv = vec2(${xMap}, (vUv.y - border) / (1.0 - 2.0 * border));
        scaledUv.x = cropX + scaledUv.x * (1.0 - 2.0 * cropX);
        vec4 mapTexel = texture(map, scaledUv);
        diffuseColor *= mapTexel;
      }
      `
    );
  };
}

function applyWhiteBorderShaderColor(mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial) {
  mat.defines = mat.defines || {};
  mat.defines.USE_UV = '';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      ${shader.vertexShader}
    `.replace(
      '#include <uv_vertex>',
      `
      vUv = uv;
      `
    );

    shader.fragmentShader = `
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float border = 0.04;
      if (vUv.x > 1.0 - border || vUv.y < border || vUv.y > 1.0 - border) {
        diffuseColor.rgb = vec3(1.0);
      }
      `
    );
  };
}

export let globalFrontMaterialRegular: THREE.MeshPhysicalMaterial | null = null;
export let globalFrontMaterialAnimated: THREE.MeshPhysicalMaterial | null = null;
export let globalSpineMaterialRegular: THREE.MeshPhysicalMaterial | null = null;
export let globalSpineMaterialAnimated: THREE.MeshPhysicalMaterial | null = null;
export let globalBackMaterialRegular: THREE.MeshStandardMaterial | null = null;
export let globalBackMaterialAnimated: THREE.MeshPhysicalMaterial | null = null;

// TextureArrayManager re-points the poster array/LUT uniforms on these two
// fronts whenever it (re)allocates. Injected rather than imported so
// poster-textures.ts stays free of a cycle back into this module.
setCaseMaterialUniformProvider(() => [globalFrontMaterialRegular, globalFrontMaterialAnimated]);

export function isGlobalMaterial(m: THREE.Material): boolean {
  return m === globalFrontMaterialRegular ||
         m === globalFrontMaterialAnimated ||
         m === globalSpineMaterialRegular ||
         m === globalSpineMaterialAnimated ||
         m === globalBackMaterialRegular ||
         m === globalBackMaterialAnimated ||
         m === sharedBlackMaterial ||
         m === sharedWhiteMaterial ||
         m === sharedRentalBlackMaterial ||
         m === sharedRentalWhiteMaterial ||
         m === sharedRentalFrontMaterial ||
         m === sharedRentalBackPlaceholderMaterial ||
         m === sharedJellyfinFrontPlaceholderMaterial ||
         m === sharedJellyfinBackPlaceholderMaterial ||
         m === sharedRentalSpinePlaceholderMaterial ||
         m === sharedJellyfinSpinePlaceholderMaterial;
}

// ── Banked poster sampling ──────────────────────────────────────────────────
// The poster store spans more layers than one array texture may legally hold
// (GL_MAX_ARRAY_TEXTURE_LAYERS — see poster-textures.ts POSTER_BANKS), so a
// global poster index splits into a BANK and a layer within it — served by the
// two samplers already bound, because this shader has no spare texture unit.
// Shared by both front materials so the two poster sampling sites can never
// drift apart.
const POSTER_ARRAY_UNIFORMS = `
      precision highp sampler2DArray;
      uniform sampler2DArray lowResMapArray;
      uniform sampler2DArray highResMapArray;
      uniform float posterLowResBase;
      // The SAME two samplers serve both banks — the case shader has no spare
      // texture unit for a third (see poster-textures.ts POSTER_BANKS). Which
      // array a title lives in is already encoded in its loaded flag, so the
      // caller's hi flag picks the array and posterLowResBase rebases the
      // layer: 0 while the low-res array is every title's preview tier,
      // bankSize once it becomes the second bank.
      //
      // Explicit gradients (never implicit texture()): adjacent instanced quads
      // are different posters and take different branches, and implicit-LOD
      // sampling inside non-uniform control flow is undefined per GLSL ES 3.00.
      vec4 samplePosterBank(bool hi, vec2 uv, float idx, vec2 ddx, vec2 ddy) {
        if (hi) return textureGrad(highResMapArray, vec3(uv, idx), ddx, ddy);
        return textureGrad(lowResMapArray, vec3(uv, idx - posterLowResBase), ddx, ddy);
      }
`;

/** The poster-array uniforms every case front material registers and binds. */
function posterArrayUniforms(shader: THREE.WebGLProgramParametersWithUniforms) {
  const lowResMapArray = shader.uniforms.lowResMapArray = { value: textureArrayManager.lowResArray };
  const highResMapArray = shader.uniforms.highResMapArray = { value: textureArrayManager.highResArray };
  const posterLowResBase = shader.uniforms.posterLowResBase = { value: textureArrayManager.lowResBase };
  const highResLoadedTex = shader.uniforms.highResLoadedTex = { value: textureArrayManager.loadedFlagsTexture };
  const maxMoviesCount = shader.uniforms.maxMoviesCount =
    { value: textureArrayManager.loadedFlagsTexture ? textureArrayManager.loadedFlagsTexture.image.width : 2048 };
  return { lowResMapArray, highResMapArray, posterLowResBase, highResLoadedTex, maxMoviesCount };
}

export function initGlobalMaterials() {
  if (globalFrontMaterialRegular) return;
  initSharedMaterials(); // Ensure base textures like wrinkles/smudges are loaded

  // 1. Regular front material
  globalFrontMaterialRegular = makePlasticMaterial({ map: sharedRentalFrontMaterial ? sharedRentalFrontMaterial.map : null });
  globalFrontMaterialRegular.defines = globalFrontMaterialRegular.defines || {};
  globalFrontMaterialRegular.defines.USE_UV = '';
  globalFrontMaterialRegular.defines.REPR_MAP_ARRAY = '';
  globalFrontMaterialRegular.onBeforeCompile = (shader) => {
    globalFrontMaterialRegular!.userData.compiledUniformsList = globalFrontMaterialRegular!.userData.compiledUniformsList || [];

    const arrays = posterArrayUniforms(shader);
    const uPosterCropX = shader.uniforms.uPosterCropX = { value: POSTER_CROP_X };

    globalFrontMaterialRegular!.userData.compiledUniformsList.push({
      ...arrays,
      uPosterCropX
    });

    shader.vertexShader = `
      attribute float aTextureIndex;
      attribute float aPosterCropSkip;
      varying float vTextureIndex;
      varying float vPosterCropSkip;
      ${shader.vertexShader}
    `.replace(
      '#include <uv_vertex>',
      `
      vUv = uv;
      `
    ).replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vTextureIndex = aTextureIndex;
      vPosterCropSkip = aPosterCropSkip;
      `
    );

    shader.fragmentShader = `
      ${POSTER_ARRAY_UNIFORMS}
      uniform sampler2D highResLoadedTex;
      uniform float maxMoviesCount;
      uniform float uPosterCropX;
      varying float vTextureIndex;
      varying float vPosterCropSkip;
      ${shader.fragmentShader}
    `.replace(
      '#include <map_fragment>',
      `
      #if defined( REPR_MAP_ARRAY )
        // On VHS the face is narrower than the poster, so crop the poster's
        // sides (uPosterCropX per side) rather than squashing it. 0 on DVD,
        // and 0 for crop-exempt instances (game boxes keep their own face
        // dims in both mediums, so their fill-decoded art must not be cut).
        float cropX = uPosterCropX * (1.0 - vPosterCropSkip);
        vec2 posterUv = vec2(cropX + vUv.x * (1.0 - 2.0 * cropX), vUv.y);
        // Gradients computed in uniform control flow, before branching on
        // loadStatus — see samplePosterBank.
        vec2 posterUvDx = dFdx(posterUv);
        vec2 posterUvDy = dFdy(posterUv);
        float loadStatus = texture(highResLoadedTex, vec2((vTextureIndex + 0.5) / maxMoviesCount, 0.5)).r;
        vec4 mapTexel;
        if (loadStatus > 0.8) {
          mapTexel = samplePosterBank(true, posterUv, vTextureIndex, posterUvDx, posterUvDy);
        } else if (loadStatus > 0.3) {
          mapTexel = samplePosterBank(false, posterUv, vTextureIndex, posterUvDx, posterUvDy);
        } else {
          mapTexel = texture(map, posterUv);
        }
        diffuseColor *= mapTexel;
      #else
        #include <map_fragment>
      #endif
      `
    );
  };

  // 2. Animated front material
  globalFrontMaterialAnimated = makePlasticMaterial({ map: sharedRentalFrontMaterial ? sharedRentalFrontMaterial.map : null });
  globalFrontMaterialAnimated.defines = globalFrontMaterialAnimated.defines || {};
  globalFrontMaterialAnimated.defines.USE_UV = '';
  globalFrontMaterialAnimated.defines.REPR_MAP_ARRAY = '';
  globalFrontMaterialAnimated.onBeforeCompile = (shader) => {
    globalFrontMaterialAnimated!.userData.compiledUniformsList = globalFrontMaterialAnimated!.userData.compiledUniformsList || [];

    const arrays = posterArrayUniforms(shader);
    const uPosterCropX = shader.uniforms.uPosterCropX = { value: POSTER_CROP_X };

    globalFrontMaterialAnimated!.userData.compiledUniformsList.push({
      ...arrays,
      uPosterCropX
    });

    shader.vertexShader = `
      attribute float aTextureIndex;
      attribute float aPosterCropSkip;
      varying float vTextureIndex;
      varying float vPosterCropSkip;
      ${shader.vertexShader}
    `.replace(
      '#include <uv_vertex>',
      `
      vUv = uv;
      `
    ).replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vTextureIndex = aTextureIndex;
      vPosterCropSkip = aPosterCropSkip;
      `
    );

    shader.fragmentShader = `
      ${POSTER_ARRAY_UNIFORMS}
      uniform sampler2D highResLoadedTex;
      uniform float maxMoviesCount;
      uniform float uPosterCropX;
      varying float vTextureIndex;
      varying float vPosterCropSkip;
      ${shader.fragmentShader}
    `.replace(
      '#include <map_fragment>',
      `
      #if defined( REPR_MAP_ARRAY )
        float border = 0.04;
        // scaledUv/posterUv and their screen-space derivatives are computed
        // unconditionally (outside the border if/else) so dFdx/dFdy — which,
        // like implicit-LOD texture(), is undefined in non-uniform control
        // flow per the GLSL ES 3.00 spec — always runs in uniform control
        // flow, regardless of whether a given fragment is in the border strip.
        vec2 scaledUv = vec2(vUv.x / (1.0 - border), (vUv.y - border) / (1.0 - 2.0 * border));
        float cropX = uPosterCropX * (1.0 - vPosterCropSkip);
        vec2 posterUv = vec2(cropX + scaledUv.x * (1.0 - 2.0 * cropX), scaledUv.y);
        vec2 posterUvDx = dFdx(posterUv);
        vec2 posterUvDy = dFdy(posterUv);
        if (vUv.x > 1.0 - border || vUv.y < border || vUv.y > 1.0 - border) {
          diffuseColor.rgb = vec3(1.0);
        } else {
          // See samplePosterBank for why this uses an explicit gradient:
          // mip-mapped arrays + a branch that differs between adjacent
          // instanced quads means implicit-LOD texture() calls here would be
          // in non-uniform control flow.
          float loadStatus = texture(highResLoadedTex, vec2((vTextureIndex + 0.5) / maxMoviesCount, 0.5)).r;
          vec4 mapTexel;
          if (loadStatus > 0.8) {
            mapTexel = samplePosterBank(true, posterUv, vTextureIndex, posterUvDx, posterUvDy);
          } else if (loadStatus > 0.3) {
            mapTexel = samplePosterBank(false, posterUv, vTextureIndex, posterUvDx, posterUvDy);
          } else {
            mapTexel = texture(map, posterUv);
          }
          diffuseColor *= mapTexel;
        }
      #else
        #include <map_fragment>
      #endif
      `
    );
  };

  // 3. Regular spine material
  globalSpineMaterialRegular = makePlasticMaterial({});
  globalSpineMaterialRegular.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      attribute vec3 aSpineColor;
      varying vec3 vSpineColor;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vSpineColor = aSpineColor;
      `
    );

    shader.fragmentShader = `
      varying vec3 vSpineColor;
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      diffuseColor.rgb *= vSpineColor;
      `
    );
  };

  // 4. Animated spine material
  globalSpineMaterialAnimated = makePlasticMaterial({});
  globalSpineMaterialAnimated.defines = globalSpineMaterialAnimated.defines || {};
  globalSpineMaterialAnimated.defines.USE_UV = '';
  globalSpineMaterialAnimated.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      attribute vec3 aSpineColor;
      varying vec3 vSpineColor;
      ${shader.vertexShader}
    `.replace(
      '#include <uv_vertex>',
      `
      vUv = uv;
      `
    ).replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vSpineColor = aSpineColor;
      `
    );

    shader.fragmentShader = `
      varying vec3 vSpineColor;
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float border = 0.04;
      if (vUv.x > 1.0 - border || vUv.y < border || vUv.y > 1.0 - border) {
        diffuseColor.rgb = vec3(1.0);
      } else {
        diffuseColor.rgb *= vSpineColor;
      }
      `
    );
  };

  // 5. Regular back placeholder material
  globalBackMaterialRegular = sharedRentalBackPlaceholderMaterial!;

  // 6. Animated back placeholder material (with white border)
  globalBackMaterialAnimated = makePlasticMaterial({ map: sharedRentalBackPlaceholderMaterial ? sharedRentalBackPlaceholderMaterial.map : null, isRentalCase: true });
  globalBackMaterialAnimated.defines = globalBackMaterialAnimated.defines || {};
  globalBackMaterialAnimated.defines.USE_UV = '';
  globalBackMaterialAnimated.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      ${shader.vertexShader}
    `.replace(
      '#include <uv_vertex>',
      `
      vUv = uv;
      `
    );

    shader.fragmentShader = `
      ${shader.fragmentShader}
    `.replace(
      '#include <map_fragment>',
      `
      float border = 0.04;
      if (vUv.x > 1.0 - border || vUv.y < border || vUv.y > 1.0 - border) {
        diffuseColor.rgb = vec3(1.0);
      } else {
        vec2 scaledUv = vec2(vUv.x / (1.0 - border), (vUv.y - border) / (1.0 - 2.0 * border));
        vec4 mapTexel = texture(map, scaledUv);
        diffuseColor *= mapTexel;
      }
      `
    );
  };
}

export function getGlobalFrontMaterials(isAnimated: boolean = false): THREE.Material[] {
  initGlobalMaterials();
  const edgeMat = (CASE_MEDIUM === 'vhs' && isAnimated) ? sharedWhiteMaterial! : sharedBlackMaterial!;
  const spineMat = (CASE_MEDIUM === 'vhs' && isAnimated) ? globalSpineMaterialAnimated! : globalSpineMaterialRegular!;
  const frontMat = (CASE_MEDIUM === 'vhs' && isAnimated) ? globalFrontMaterialAnimated! : globalFrontMaterialRegular!;
  // The TOP face (index 2) also picks up the poster's dominant colour on
  // non-animated VHS so the box top reads as a colour rather than a flat black
  // edge; animated VHS (white edge) and DVD stay as their edgeMat.
  const topMat = (CASE_MEDIUM === 'vhs' && !isAnimated) ? spineMat : edgeMat;
  return [
    // Both wide side faces carry the per-instance aSpineColor (the poster's
    // dominant/prevalent colour) rather than a flat black edge, so a series
    // boxset's chunky sides pick up their cover colour in browse mode instead
    // of reading as black slabs. (Regular thin cases show only a sliver here.)
    spineMat,
    spineMat,
    topMat,
    edgeMat,
    frontMat,
    edgeMat,
  ];
}

export function getGlobalBackMaterials(_isAnimated: boolean = false): THREE.Material[] {
  initGlobalMaterials();
  // GH #42: the back box is the rental clamshell — black molded edges on VHS,
  // white on DVD. Animated Movies tapes are NOT special-cased: their clamshell
  // reads exactly like every other store VHS (the white curved border lives on
  // the retail Jellyfin box in front, never on the rental copy).
  const edgeMat = (CASE_MEDIUM === 'vhs')
    ? sharedRentalBlackMaterial!
    : sharedRentalWhiteMaterial!;
  const spineMat = sharedRentalSpinePlaceholderMaterial!;
  const frontMat = sharedRentalFrontMaterial!;
  const backMat = sharedRentalBackPlaceholderMaterial!;
  return [
    edgeMat,
    spineMat,
    edgeMat,
    edgeMat,
    frontMat,
    backMat,
  ];
}

// -------------------------------------------------------------
// HERO CASE SUPPORT
// The shelves are instanced meshes sharing one placeholder texture set, so every
// rental copy would read "FIGHT CLUB". The scene swaps the SELECTED slot's
// two instances for a pair of ordinary meshes ("hero cases") dressed with that
// movie's real artwork/metadata, built from the helpers below.
// -------------------------------------------------------------

// `dims` overrides the medium's case dimensions (game boxes pass their
// gameCaseDims() so the hero case matches its shelf instances).
export function getCaseGeometry(isAnimated: boolean = false, dims?: { w: number; h: number; d: number }): THREE.BufferGeometry {
  return getGeometry(isAnimated, dims);
}

// GH #42: geometry for the RENTAL clamshell (hero back mesh and
// shelf back meshes) — identical to getCaseGeometry on DVD, slightly wider
// and taller on VHS so the clamshell peeks out around the retail cover box.
export function getRentalCaseGeometry(isAnimated: boolean = false, dims?: { w: number; h: number; d: number }): THREE.BufferGeometry {
  return getRentalGeometry(isAnimated, dims);
}

// Physical thickness of the rental case — the Y footprint of a clamshell lying
// flat. The VHS clamshell is thicker than the sleeve's CASE_DEPTH.
export function getRentalCaseDepth(): number {
  return CASE_MEDIUM === 'vhs' ? VHS_RENTAL_DEPTH_FT : CASE_DEPTH;
}

let sharedJellyfinFrontPlaceholderMaterialAnimated: THREE.MeshStandardMaterial | null = null;
function getAnimatedJellyfinFrontPlaceholderMaterial(): THREE.MeshStandardMaterial {
  if (!sharedJellyfinFrontPlaceholderMaterialAnimated) {
    initSharedMaterials();
    sharedJellyfinFrontPlaceholderMaterialAnimated = makePlasticMaterial({ map: sharedJellyfinFrontPlaceholderMaterial!.map });
    applyWhiteBorderShader(sharedJellyfinFrontPlaceholderMaterialAnimated);
  }
  return sharedJellyfinFrontPlaceholderMaterialAnimated;
}

// GH #52: the per-title front is its own canvas texture — the scan's front
// panel with THIS movie's title sticker composited on (see drawBoxOverlays) —
// not a reuse of the shared generic front map. Each cache entry owns its map.
function getRentalFrontMaterial(movie: Movie, probeIdx?: number, isAnimated: boolean = false): THREE.MeshStandardMaterial {
  const cacheKey = `bbfront_${movie.id}_art_${artCacheTag()}_anim_${isAnimated}_probe_${probeIdx !== undefined ? probeIdx : 'none'}`;
  const cached = caseMaterialLRUGet(cacheKey);
  if (cached) return cached;

  perfTrace.count(CT_CANVAS);
  perfTrace.begin(SP_CANVAS);
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  paintPlaceholderBase(ctx, COVER_WIDTH, COVER_HEIGHT);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;

  drawRentalFrontArt(ctx, COVER_WIDTH, COVER_HEIGHT, movie, () => {
    paintRentalRimBorder(ctx, COVER_WIDTH, COVER_HEIGHT);
    tex.needsUpdate = true;
  });
  paintRentalRimBorder(ctx, COVER_WIDTH, COVER_HEIGHT);

  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;
  const mat = makePlasticMaterial({ map: tex, envMap: env, isRentalCase: true });
  caseMaterialLRUSet(cacheKey, mat);
  perfTrace.end(SP_CANVAS);
  return mat;
}

// Retail (jellyfin) case: poster front, movie-specific back with the tappable
// cast list, spine tinted to the poster's edge colour.
// `pinEndcap` (#97): person-endcap cases keep their meshes (and thus this
// front material) alive for the endcap's whole lifetime, so their poster
// texture is pinned against LRU eviction until closePersonEndcap releases it.
// The hero inspect case omits it — its material is rebuilt on every selection
// change, so the plain LRU bounds it.
// `heroDetail` (store-inspect.ts passes it only for the case actually being
// INSPECTED) swaps the printed faces for the high-resolution singletons — see
// HERO_COVER_SCALE. Every other caller of this factory (checkout bag copies,
// back-room tapes, carried stack, person endcaps) leaves it false: those cases
// are small on screen and several exist at once, so they must keep the
// per-title LRU faces rather than fight over one singleton canvas.
// Material-array indices, which for a BoxGeometry are the face order
// [+X, -X, +Y, -Y, +Z, -Z]: the SPINE is -X, the FRONT +Z, the BACK -Z.
// Named because the game-art swap below addresses them directly and `mats[5]`
// at a call site is unreadable.
const FACE_RIGHT = 0;
const FACE_SPINE = 1;
const FACE_BACK = 5;

// Cached one material per (title, face) — the swap runs on every hero rebuild
// (a browse keypress rebuilds the inspected pair) and minting a fresh
// MeshStandardMaterial each time is exactly the leak issue #117 removed from
// this path.
const gameFaceMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function gameFaceMaterial(key: string, map: THREE.Texture, env: THREE.Texture | null): THREE.MeshStandardMaterial {
  let mat = gameFaceMaterialCache.get(key);
  if (!mat) {
    mat = makePlasticMaterial({ map, envMap: env });
    gameFaceMaterialCache.set(key, mat);
  }
  return mat;
}

/**
 * Swap a game case's real scan art onto the faces that have it — the flat back
 * panel onto the rear face, the spine strip onto the narrow side(s) — mutating
 * `mats` IN PLACE so a mesh already holding the array picks the change up.
 *
 * The art arrives over the network, so this is async and the caller decides
 * whether to await it (asset viewer, which must not shoot early) or fire and
 * forget with a re-render (the store, where the fallback face is fine until it
 * lands). Titles with no art on file are a no-op — resolves false, faces keep
 * the generated spine colour and the drawn Jellyfin back.
 *
 * A jewel case gets the spine on BOTH narrow faces: its printed back inlay
 * folds into side flaps, so a real one reads its title from either edge.
 * Cardboard cartons keep the single -X spine.
 */
export async function applyGameCaseArt(movie: Movie, mats: THREE.Material[], probeIdx?: number): Promise<boolean> {
  if (!movie.game || !movie.gameArt) return false;
  const [back, spine] = await Promise.all([
    loadGameFaceTexture(movie, 'back'),
    loadGameFaceTexture(movie, 'spine'),
  ]);
  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;
  let changed = false;
  if (back) {
    mats[FACE_BACK] = gameFaceMaterial(`gback_${movie.id}_${probeIdx ?? 'n'}`, back, env);
    changed = true;
  }
  if (spine) {
    const key = `${movie.id}_${probeIdx ?? 'n'}`;
    // Only a jewel case reads its spine from both edges (the back inlay's two
    // flaps) — a keep case (PS2/GC/Xbox…) prints ONE spine and its opening
    // edge is bare plastic, so those keep the single -X face.
    const jewel = isJewelCasePlatform(movie.platform) && hasRealGameBox(movie.platform);
    if (jewel) {
      // Jewel spines are COMPOSITED, never stretched: the print at natural
      // width, seated in smoked polycarbonate (jewelSpineComposite). Two-flap
      // detection measures the SCAN against the platform's SINGLE-disc depth —
      // the scans are the standard inlay sheet regardless of how fat the case
      // is (FF IX's 4-disc scan is the same 72x680 as every single-disc PSX).
      const dims = gameCaseDims(movie.platform, movie.discCount);
      const singleDims = gameCaseDims(movie.platform);
      const faceAspect = dims.d / dims.h;
      const twoFlap = isTwoFlapSpine(spine, singleDims.d / singleDims.h, true);
      const fat = (movie.discCount ?? 1) >= 2;
      if (twoFlap && !fat) {
        // Single-depth case: one flap per edge, full bleed (box3d reference).
        // The outward flap (platform logo, title, disc count) takes the -X
        // spine the store treats as primary; the product-code flap takes the
        // opening edge. No hinge teeth at single depth — the front scan's
        // baked hinge strip carries them.
        mats[FACE_SPINE] = gameFaceMaterial(`gspineR_${key}`,
          jewelSpineComposite(spine, { key: `${key}:R`, faceAspect, flap: 'right', teeth: 'none' }), env);
        mats[FACE_RIGHT] = gameFaceMaterial(`gspineL_${key}`,
          jewelSpineComposite(spine, { key: `${key}:L`, faceAspect, flap: 'left', teeth: 'none' }), env);
      } else {
        // Fat case: hinge-teeth column + prints on the -X spine (the FF IX
        // box3d layout), prints without teeth on the opening edge. The teeth
        // canvas side ('left') was verified against the box3d reference in a
        // 3/4 shot — flip it if the -X UV winding ever changes.
        mats[FACE_SPINE] = gameFaceMaterial(`gspineH_${key}`,
          jewelSpineComposite(spine, { key: `${key}:H`, faceAspect, flap: twoFlap ? 'both' : 'single', teeth: 'left' }), env);
        mats[FACE_RIGHT] = gameFaceMaterial(`gspineO_${key}`,
          jewelSpineComposite(spine, { key: `${key}:O`, faceAspect, flap: twoFlap ? 'both' : 'single', teeth: 'none' }), env);
      }
    } else {
      mats[FACE_SPINE] = gameFaceMaterial(`gspine_${key}`, uprightSpine(spine, key), env);
    }
    changed = true;
  }
  return changed;
}

export function createHeroJellyfinMaterials(movie: Movie, highlightedName?: string, pinEndcap: boolean = false, heroDetail: boolean = false, probeIdx?: number): THREE.Material[] {
  initSharedMaterials();
  const isAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
  const spineColor = leftmostColorCache.get(movie.id) || null;

  const edgeMat = isAnimated ? sharedWhiteMaterial! : sharedBlackMaterial!;
  // Series season boxsets keep the loose shrink-wrap film (ROADMAP B3);
  // movie cases get the medium's finish (paperboard / amaray polywrap).
  const finish = movie.isSeries ? 'shrinkwrap' as const : undefined;
  // heroDetail (the case actually being INSPECTED) takes the 3x front if its
  // decode has already landed — the front is the one face that was still stuck
  // at shelf resolution while its siblings below went hero-res. Null until then,
  // which falls through to the shelf material exactly as before; store-inspect's
  // heroFrontMaterials kicks the decode off and swaps it in when it arrives, so
  // picking a box up sharpens rather than flashing a placeholder.
  const front = (heroDetail
    ? getHeroFrontMaterial(movie, probeIdx, isAnimated, !!movie.game, finish)
    : null)
    ?? getPosterMaterial(movie.id, probeIdx, isAnimated, !!movie.game, pinEndcap ? 'endcap' : 'none', finish);

  return [
    edgeMat,
    getJellyfinSpineMaterial(spineColor, probeIdx, isAnimated),
    edgeMat,
    edgeMat,
    front,
    (heroDetail || highlightedName)
      ? getJellyfinBackMaterialHero(movie, highlightedName, probeIdx)
      : getJellyfinBackMaterial(movie, probeIdx),
  ];
}

// rental copy: front, spine and back all carry this movie's real
// title/category/director instead of the generic placeholder (GH #52 for the
// front's title sticker).
// `heroDetail`: see createHeroJellyfinMaterials above — true only for the case
// being inspected, which is the one whose print anyone can actually read.
export function createHeroRentalMaterials(movie: Movie, heroDetail: boolean = false, probeIdx?: number): THREE.Material[] {
  initSharedMaterials();
  const isAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';

  // GH #42: the hero rental copy is a clamshell — black molded edges on VHS
  // (including Animated Movies, which now match every other tape); white on DVD.
  const edgeMat = (CASE_MEDIUM === 'vhs')
    ? sharedRentalBlackMaterial!
    : sharedRentalWhiteMaterial!;
  const front = heroDetail
    ? getRentalFrontMaterialHero(movie, probeIdx)
    : getRentalFrontMaterial(movie, probeIdx, isAnimated);

  return [
    edgeMat,
    heroDetail ? getRentalSpineMaterialHero(movie, probeIdx) : getRentalSpineMaterial(movie, probeIdx),
    edgeMat,
    edgeMat,
    front,
    heroDetail ? getRentalBackMaterialHero(movie, probeIdx) : getRentalBackMaterial(movie, probeIdx),
  ];
}

// ─── TV-series season boxsets ────────────────────────────────────────────────
// A series title sits on the shelf as one chunky DVD-season boxset instead of a
// retail case + rental clamshell pair: same front face, SERIES_DEPTH_MULT times
// the depth. On the shelves that's just a non-uniform Z scale on the shared
// instanced case geometry; the inspected hero gets this dedicated geometry so
// its (now wide) side panels can carry real canvas textures — the episode list
// on +X and a "PLAY SEASON" panel on -X (both drawn below). The panel canvases
// and materials are module singletons redrawn in place (one boxset is ever
// inspected at a time), so episode navigation costs a canvas redraw + texture
// re-upload, never a new GPU allocation; disposeSeriesPanelResources() tears
// them down with the rest of the module caches.

export const SERIES_DEPTH_MULT = 3.5;

let seriesBoxsetGeometry: THREE.BufferGeometry | null = null;
export function getSeriesBoxsetGeometry(): THREE.BufferGeometry {
  if (!seriesBoxsetGeometry) {
    // Keep the ordinary case's corner rounding — dims.d * 0.28 would round a
    // boxset-deep case into a pill.
    const radius = CASE_MEDIUM === 'vhs' ? 0.008 : CASE_DEPTH * 0.28;
    seriesBoxsetGeometry = new RoundedBoxGeometry(CASE_WIDTH, CASE_HEIGHT, CASE_DEPTH * SERIES_DEPTH_MULT, 2, radius);
  }
  return seriesBoxsetGeometry;
}

// Panel canvas resolution. The side panel is physically (boxset depth × height),
// and its texture maps 0..1 across that face — so the canvas MUST share the
// face's aspect ratio or everything drawn on it (notably the 2:3 season-poster
// chips) is stretched horizontally. Depth scales with the case medium (a VHS
// boxset is far chunkier than a DVD one), so derive the width from the live
// dimensions instead of hardcoding it; a fixed 256 only matched a ~0.16ft depth
// and squished the chips toward 4:3 on any thicker box.
const SERIES_PANEL_HEIGHT = 1024;
function seriesPanelWidth(): number {
  const faceAspect = (CASE_DEPTH * SERIES_DEPTH_MULT) / CASE_HEIGHT; // depth / height
  return Math.max(64, Math.round(SERIES_PANEL_HEIGHT * faceAspect));
}

interface SeriesPanel {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mat: THREE.MeshPhysicalMaterial;
}
let seriesEpisodePanel: SeriesPanel | null = null;
let seriesPlayPanel: SeriesPanel | null = null;

function getSeriesPanel(which: 'episodes' | 'play'): SeriesPanel {
  const existing = which === 'episodes' ? seriesEpisodePanel : seriesPlayPanel;
  if (existing) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = seriesPanelWidth();
  canvas.height = SERIES_PANEL_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  const mat = makePlasticMaterial({ map: tex, finish: 'shrinkwrap' }); // boxsets keep the film
  const panel: SeriesPanel = { canvas, ctx, tex, mat };
  if (which === 'episodes') seriesEpisodePanel = panel;
  else seriesPlayPanel = panel;
  return panel;
}

// ─── Series panel colour scheme ─────────────────────────────────────────────
// Every series panel/menu is themed from the box's dominant cover colour (the
// same value movies use for their spine — leftmostColorCache.get(movie.id)),
// mirroring the retail-case spine tint. The base is a darkened shade of that
// colour, the accent is the colour itself (brightened if the cover is near
// black so it stays legible), and text light/dark is chosen for contrast.
interface SeriesTheme {
  base: string;    // panel background (darkened dominant)
  header: string;  // header band / placeholder (darker)
  deep: string;    // thumbnail wells (darkest)
  accent: string;  // headings, selection plates, dividers (the cover colour)
  accentRgb: string; // "r, g, b" for rgba() plates
  text: string;    // primary text
  subText: string; // secondary text
}

function parseHexTriple(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [parseInt(c.substring(0, 2), 16) || 0, parseInt(c.substring(2, 4), 16) || 0, parseInt(c.substring(4, 6), 16) || 0];
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const SERIES_THEME_FALLBACK = '#1c3f9e'; // house emerald when no cover colour

function deriveSeriesTheme(hex: string | null | undefined): SeriesTheme {
  const clean = (hex || '').replace('#', '');
  const src = /^[0-9a-fA-F]{6}$/.test(clean) ? `#${clean}` : SERIES_THEME_FALLBACK;
  const [r, g, b] = parseHexTriple(src);
  // Brighten a very dark cover colour so the accent (headings/plates) reads.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  let ar = r, ag = g, ab = b;
  if (lum < 0.4) {
    const boost = 0.4 / Math.max(lum, 0.05);
    ar = r * boost; ag = g * boost; ab = b * boost;
  }
  const accent = rgbToHex(ar, ag, ab);
  const base = rgbToHex(r * 0.34 + 8, g * 0.34 + 8, b * 0.34 + 12);
  const contrast = getHexContrastColor(base);
  return {
    base,
    header: rgbToHex(r * 0.2 + 4, g * 0.2 + 4, b * 0.2 + 6),
    deep: rgbToHex(r * 0.11, g * 0.11, b * 0.11 + 3),
    accent,
    accentRgb: hexToRgb(accent),
    text: contrast.text,
    subText: contrast.secondaryText,
  };
}

function paintSeriesPanelBase(ctx: CanvasRenderingContext2D, theme: SeriesTheme = deriveSeriesTheme(null)) {
  ctx.fillStyle = theme.base;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

const truncate = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string => {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
};

/**
 * Redraw the boxset's +X side panel in place. This side no longer carries a
 * scrolling episode list (the episode selector now lives solely on the back
 * cover) — but GH #138 found that leaving it as a plain, textless colour
 * field reads as a broken/blank case face when a shopper rotates the boxset
 * around to it ("I shouldn't be able to flip to this blank side"). It's now
 * a proper branded info card (title, genre/rating/year, director) so every
 * face the box can rest on shows real content.
 */
export function drawSeriesBrandPanel(movie: Movie, themeHex?: string | null) {
  const theme = deriveSeriesTheme(themeHex);
  const panel = getSeriesPanel('episodes');
  const ctx = panel.ctx;
  const W = panel.canvas.width;
  const H = panel.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  paintSeriesPanelBase(ctx, theme);

  // Header band, matching the season/episode panels' language.
  ctx.fillStyle = theme.header;
  ctx.fillRect(0, 0, W, 64);
  ctx.fillStyle = theme.accent;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = 'bold 28px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('SERIES', 16, 34);

  ctx.textBaseline = 'top';
  let y = 90;
  ctx.fillStyle = theme.text;
  ctx.font = 'bold 26px "Arial Narrow", Arial, sans-serif';
  for (const ln of wrapText(ctx, movie.title.toUpperCase(), W - 32)) {
    ctx.fillText(ln, 16, y);
    y += 30;
  }
  y += 16;

  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillStyle = theme.accent;
  ctx.fillText((movie.genres[0] || 'DRAMA').toUpperCase(), 16, y);
  y += 28;
  ctx.font = '20px Arial, sans-serif';
  ctx.fillStyle = theme.subText;
  ctx.fillText(`RATED ${movie.rating}    ${movie.year}`, 16, y);
  y += 36;

  ctx.font = 'italic 18px Arial, sans-serif';
  ctx.fillStyle = theme.subText;
  for (const ln of wrapText(ctx, `Directed by ${movie.director}`, W - 32)) {
    ctx.fillText(ln, 16, y);
    y += 24;
  }

  // Bottom tagline, in the store's own branding.
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.accent;
  ctx.font = `bold 20px ${BB_ARCHIVO_BLACK}, Arial, sans-serif`;
  ctx.fillText(brandString('brand-wordmark-video', 'HALCYON VIDEO'), W / 2, H - 40);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  panel.tex.needsUpdate = true;
}

// ─── Series back cover: the episode selector ────────────────────────────────
// For a series boxset the ordinary STARRING/CREDITS back is replaced by a
// scrollable episode picker — one row per episode with a bordered still, the
// SxxExx code + title, and a wrapped synopsis, all sized to read at inspect
// distance. Like the side panels it's a module singleton redrawn in place (one
// boxset inspected at a time); thumbnails stream in and re-trigger a redraw.
const SERIES_BACK_ROWS = 4; // visible episode rows per screen
const SERIES_SEASON_ROWS = 5; // visible season rows per screen (scrolls beyond)

interface SeriesBackPanel {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mat: THREE.MeshPhysicalMaterial;
}
let seriesBackPanel: SeriesBackPanel | null = null;

function getSeriesBackPanel(probeIdx?: number): SeriesBackPanel {
  if (seriesBackPanel) return seriesBackPanel;
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  const env = (probeIdx !== undefined && reflectionProbes[probeIdx]) ? reflectionProbes[probeIdx] : null;
  const mat = makePlasticMaterial({ map: tex, envMap: env, finish: 'shrinkwrap' }); // boxsets keep the film
  seriesBackPanel = { canvas, ctx, tex, mat };
  return seriesBackPanel;
}

/**
 * Redraw the boxset's back-cover episode selector in place. `episodes` null =
 * still loading, [] = none available. A window of SERIES_BACK_ROWS rows scrolls
 * to keep `selectedIdx` visible; the selected row gets the gold plate. onUpdate
 * (if given) fires when a thumbnail streams in so the caller can re-upload.
 */
export function drawSeriesEpisodeBackCover(
  seriesTitle: string,
  episodes: Episode[] | null,
  selectedIdx: number,
  themeHex?: string | null,
  onUpdate?: () => void
) {
  const theme = deriveSeriesTheme(themeHex);
  const panel = getSeriesBackPanel();
  const ctx = panel.ctx;
  const W = 640, H = 960;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(COVER_WIDTH / W, COVER_HEIGHT / H);

  // Cardboard back, themed from the box's dominant cover colour.
  ctx.fillStyle = theme.base;
  ctx.fillRect(0, 0, W, H);

  // Header band.
  ctx.fillStyle = theme.header;
  ctx.fillRect(0, 0, W, 118);
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
  ctx.fillText(truncate(ctx, seriesTitle.toUpperCase(), W - 220), 40, 58);
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillStyle = theme.subText;
  ctx.fillText('SELECT AN EPISODE', 40, 96);
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 24px Arial, sans-serif';
  if (episodes && episodes.length > 0) {
    ctx.fillText(`${selectedIdx + 1} / ${episodes.length}`, W - 40, 96);
  }
  ctx.textAlign = 'left';

  const listTop = 134;
  const listBottom = H - 56;
  const rowGap = 14;
  const rowH = (listBottom - listTop - rowGap * (SERIES_BACK_ROWS - 1)) / SERIES_BACK_ROWS;

  if (!episodes || episodes.length === 0) {
    ctx.fillStyle = theme.subText;
    ctx.font = 'italic 30px Arial, sans-serif';
    ctx.fillText(episodes ? 'Episode list unavailable.' : 'Loading episodes…', 40, listTop + 60);
    panel.tex.needsUpdate = true;
    return;
  }

  // Scroll window centred on the selection.
  const start = Math.max(0, Math.min(selectedIdx - (SERIES_BACK_ROWS >> 1), episodes.length - SERIES_BACK_ROWS));
  for (let row = 0; row < SERIES_BACK_ROWS; row++) {
    const idx = start + row;
    if (idx >= episodes.length) break;
    const ep = episodes[idx];
    const y = listTop + row * (rowH + rowGap);
    const selected = idx === selectedIdx;

    // Row plate + border.
    ctx.fillStyle = selected ? `rgba(${theme.accentRgb}, 0.18)` : 'rgba(255,255,255,0.05)';
    ctx.fillRect(24, y, W - 48, rowH);
    ctx.strokeStyle = selected ? theme.accent : 'rgba(201,212,242,0.35)';
    ctx.lineWidth = selected ? 4 : 2;
    ctx.strokeRect(24, y, W - 48, rowH);

    // Bordered thumbnail (16:9), left side.
    const pad = 16;
    const thumbH = rowH - pad * 2;
    const thumbW = thumbH * (16 / 9);
    const thumbX = 24 + pad;
    const thumbY = y + pad;
    ctx.fillStyle = theme.deep;
    ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
    const img = episodeThumbCache.get(episodeThumbKey(ep));
    if (img === undefined) {
      loadEpisodeThumb(ep, () => { if (onUpdate) onUpdate(); });
    }
    if (img) {
      // cover-fit into the thumb box
      const ia = img.width / img.height;
      const ta = thumbW / thumbH;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ia > ta) { sw = img.height * ta; sx = (img.width - sw) / 2; }
      else { sh = img.width / ta; sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, thumbX, thumbY, thumbW, thumbH);
    } else {
      ctx.fillStyle = theme.accent;
      ctx.font = 'bold 34px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▷', thumbX + thumbW / 2, thumbY + thumbH / 2 + 12);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = selected ? theme.accent : 'rgba(201,212,242,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(thumbX, thumbY, thumbW, thumbH);

    // Text column, right of the thumbnail. The title row gets the full width
    // and shows ONLY the episode name; the SxxExx code drops into the subtitle
    // line below, ahead of the overview.
    const tx = thumbX + thumbW + 20;
    const tw = (W - 48 - pad) - tx;
    const code = `S${ep.seasonNumber} · E${ep.episodeNumber}`;
    ctx.fillStyle = theme.text;
    ctx.font = 'bold 30px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(truncate(ctx, ep.name, tw), tx, thumbY + 28);

    // Subtitle: season/episode code + wrapped synopsis beneath.
    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText(code, tx, thumbY + 58);
    const codeW = ctx.measureText(code).width + 16; // gap after the code
    // Wrapped synopsis: the first line flows to the right of the code, later
    // lines return to the column's left edge.
    ctx.fillStyle = theme.subText;
    ctx.font = '22px Arial, sans-serif';
    const words = (ep.overview || '').split(' ').filter(Boolean);
    let line = '';
    let ly = thumbY + 58;
    let lineX = tx + codeW;
    let lineW = tw - codeW;
    const lineH = 27;
    const maxLy = thumbY + thumbH + 4;
    for (let n = 0; n < words.length && ly <= maxLy; n++) {
      const test = line + words[n] + ' ';
      if (ctx.measureText(test).width > lineW && line) {
        ctx.fillText(line.trim(), lineX, ly);
        line = words[n] + ' ';
        ly += lineH;
        lineX = tx;
        lineW = tw;
      } else {
        line = test;
      }
    }
    if (ly <= maxLy && line.trim()) ctx.fillText(line.trim(), lineX, ly);
  }

  // Scroll affordances + hint.
  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.textAlign = 'center';
  if (start > 0) ctx.fillText('▲', W / 2, listTop - 4);
  ctx.fillStyle = theme.subText;
  ctx.font = '22px Arial, sans-serif';
  ctx.fillText(start + SERIES_BACK_ROWS < episodes.length ? '▼  ▲▼ browse  ·  ENTER play' : '▲▼ browse  ·  ENTER play', W / 2, H - 22);
  ctx.textAlign = 'left';

  panel.tex.needsUpdate = true;
}

/**
 * Redraw the boxset's -X panel in place as a vertical SEASON selector. The
 * distinct season numbers are derived from the fetched episodes and stacked
 * down the spine; the season of the currently-highlighted episode is drawn on
 * the gold plate. `episodes` null = still loading, [] = none available.
 */
export function drawSeriesSeasonPanel(
  _seriesTitle: string,
  episodes: Episode[] | null,
  currentSeason: number | null,
  themeHex?: string | null,
  onUpdate?: () => void
) {
  const theme = deriveSeriesTheme(themeHex);
  const panel = getSeriesPanel('play');
  const ctx = panel.ctx;
  const W = panel.canvas.width;  // horizontal (box depth) — aspect-matched to the face
  const H = panel.canvas.height; // vertical (box height)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  paintSeriesPanelBase(ctx, theme);

  // Header band across the top of the panel.
  ctx.fillStyle = theme.header;
  ctx.fillRect(0, 0, W, 64);
  ctx.fillStyle = theme.accent;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = 'bold 30px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('SEASONS', 16, 34);

  const seasons = episodes && episodes.length
    ? [...new Set(episodes.map((e) => e.seasonNumber))].sort((a, b) => a - b)
    : [];
  if (!seasons.length) {
    ctx.fillStyle = theme.subText;
    ctx.font = 'italic 24px Arial, sans-serif';
    ctx.fillText(episodes ? 'NONE' : 'LOADING…', 16, H / 2);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    panel.tex.needsUpdate = true;
    return;
  }

  // Stack the seasons vertically, each an upright horizontal row: a cover
  // thumbnail on the left, the season number/name to its right. The current
  // season gets the accent plate. The chip prefers the season's own PRIMARY
  // poster (2:3); if none, it falls back to the season's first-episode still
  // (16:9). Rows are tall enough to read at inspect distance; when there are
  // more seasons than fit, a window of SERIES_SEASON_ROWS scrolls to keep the
  // selected season visible, with ▲/▼ affordances when more lies above/below.
  const listTop = 76;
  const listBottom = H - 44; // leave room for the bottom scroll/hint glyph
  const rowGap = 12;
  const visibleRows = Math.min(SERIES_SEASON_ROWS, seasons.length);
  const rowH = (listBottom - listTop - rowGap * (visibleRows - 1)) / visibleRows;

  // Scroll window centred on the selected season.
  const selIdx = Math.max(0, seasons.findIndex((s) => s === currentSeason));
  const start = Math.max(0, Math.min(selIdx - (visibleRows >> 1), seasons.length - visibleRows));
  for (let row = 0; row < visibleRows; row++) {
    const i = start + row;
    if (i >= seasons.length) break;
    const s = seasons[i];
    const y = listTop + row * (rowH + rowGap);
    const selected = s === currentSeason;

    ctx.fillStyle = selected ? `rgba(${theme.accentRgb}, 0.18)` : 'rgba(255,255,255,0.05)';
    ctx.fillRect(8, y, W - 16, rowH);
    ctx.strokeStyle = selected ? theme.accent : 'rgba(201,212,242,0.35)';
    ctx.lineWidth = selected ? 4 : 2;
    ctx.strokeRect(8, y, W - 16, rowH);

    const firstEp = episodes!.find((e) => e.seasonNumber === s);
    const seasonUrl = firstEp?.seasonPrimaryUrl;

    // Prefer the season poster; fall back to the first-episode still. The chip
    // is sized poster (2:3) when a season primary exists, else still (16:9).
    let img: CachedArt | null = null;
    if (seasonUrl) {
      const si = seasonThumbCache.get(seasonUrl);
      if (si === undefined) loadSeasonThumb(seasonUrl, () => { if (onUpdate) onUpdate(); });
      else img = si;
    }
    if (!img && firstEp) {
      const ei = episodeThumbCache.get(episodeThumbKey(firstEp));
      if (ei === undefined) loadEpisodeThumb(firstEp, () => { if (onUpdate) onUpdate(); });
      else img = ei;
    }

    const poster = !!seasonUrl;
    const pad = 12;
    let thumbW = poster ? Math.min(70, W - 16 - pad * 2 - 120) : Math.min(80, W - 16 - pad * 2 - 120);
    let thumbH = poster ? thumbW * (3 / 2) : thumbW * (9 / 16);
    const maxTH = rowH - 8;
    if (thumbH > maxTH) { const k = maxTH / thumbH; thumbH *= k; thumbW *= k; }
    const thumbX = 8 + pad;
    const thumbY = y + (rowH - thumbH) / 2;
    ctx.fillStyle = theme.deep;
    ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
    if (img) {
      const ia = img.width / img.height;
      const ta = thumbW / thumbH;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ia > ta) { sw = img.height * ta; sx = (img.width - sw) / 2; }
      else { sh = img.width / ta; sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, thumbX, thumbY, thumbW, thumbH);
    }
    ctx.strokeStyle = selected ? theme.accent : 'rgba(201,212,242,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(thumbX, thumbY, thumbW, thumbH);

    // Season label to the right of the thumbnail.
    ctx.fillStyle = selected ? theme.text : theme.subText;
    ctx.font = 'bold 22px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tx = thumbX + thumbW + 10;
    ctx.fillText(truncate(ctx, `SEASON ${s}`, W - 16 - tx), tx, y + rowH / 2);
  }

  // Scroll affordances: more seasons above / below the visible window.
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 26px Arial, sans-serif';
  if (start > 0) ctx.fillText('▲', W / 2, listTop - 6);
  if (start + visibleRows < seasons.length) ctx.fillText('▼', W / 2, H - 22);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  panel.tex.needsUpdate = true;
}

/**
 * Hero materials for an inspected series boxset: the retail case's poster
 * front / metadata back / tinted spine edges, with the wide +X / -X side
 * panels swapped for the neutral brand canvas and the vertical season selector.
 */
export function createHeroSeriesBoxsetMaterials(movie: Movie, _highlightedName?: string, probeIdx?: number): THREE.Material[] {
  // highlightedName only ever influenced base[5], which is discarded below —
  // don't pass it through, so no highlight canvas redraw happens per keypress.
  const base = createHeroJellyfinMaterials(movie, undefined, false, false, probeIdx);
  return [
    getSeriesPanel('episodes').mat,
    getSeriesPanel('play').mat,
    base[2],
    base[3],
    base[4],
    // Back face: the episode selector replaces the usual STARRING/CREDITS back.
    // Content is painted by drawSeriesEpisodeBackCover (driven from the scene,
    // which owns the fetched episode list); base[5] is discarded.
    getSeriesBackPanel(probeIdx).mat,
  ];
}

// ─── Boot-time GL program warm-up ────────────────────────────────────────────
// (perf-trace: the first selection move / first flip used to freeze 80-190ms
// while the driver compiled hero-material shader variants at first draw.)
// Builds one material of EVERY flavor the hero/inspect path can produce at
// runtime, so StoreScene can renderer.compileAsync() them behind the loading
// screen. Factory-produced sets are owned by this module's caches (they're the
// exact entries the first real selection will hit); the DataTexture poster
// flavors — which only exist after full-res pixels stream in, hence can't come
// from the factories at boot — are built directly with dummy pixels and MUST
// be disposed by the caller once compiled (via the returned dispose()).
export function createProgramWarmupMaterials(
  regular: Movie,
  animated: Movie | null,
  series: Movie | null,
  probeIdx = 0,
): { materialSets: THREE.Material[][]; dispose(): void } {
  const materialSets: THREE.Material[][] = [];
  const owned: { dispose(): void }[] = [];

  // PASS probeIdx. The reflection probe IS the material's envMap, and envMap
  // presence changes the compiled program (USE_ENVMAP + the cube samplers) —
  // so a probe-less warm-up compiles a variant the store never draws, and the
  // real one still links at first draw. That was worth two ~120ms frozen
  // frames mid-browse (the shrink-wrapped series boxset and the rental
  // clamshell, the two flavors whose programs nothing else on screen shares).
  // Any index warms the right program — the 5 probes differ in content, not in
  // the defines — but 0 is also the cache entry the runtime path asks for
  // first (store-inspect: `Math.min(scene.selectedLibraryIdx, 4)`).
  materialSets.push(createHeroJellyfinMaterials(regular, undefined, false, false, probeIdx));
  materialSets.push(createHeroJellyfinMaterials(regular, 'Warmup Name', false, false, probeIdx)); // flipped-back highlight flavor
  materialSets.push(createHeroRentalMaterials(regular, false, probeIdx));
  // Probe-less rental too: the back room and the carried-tape stack build their
  // clamshells with no probeIdx (back-room.ts, carried-tapes.ts), so the
  // envMap-free program is a real runtime variant, not a warm-up artifact.
  materialSets.push(createHeroRentalMaterials(regular));
  if (animated) {
    materialSets.push(createHeroJellyfinMaterials(animated, undefined, false, false, probeIdx));
    materialSets.push(createHeroRentalMaterials(animated, false, probeIdx));
  }
  if (series) {
    materialSets.push(createHeroSeriesBoxsetMaterials(series, undefined, probeIdx));
  }

  const px = new Uint8Array(COVER_WIDTH * COVER_HEIGHT * 4).fill(128);
  const mkPosterFlavor = (animatedFlavor: boolean, finish?: CaseFinish, skipCrop = false) => {
    const tex = createPosterDataTexture(px);
    owned.push(tex);
    const map = (skipCrop || animatedFlavor) ? tex : cropFrontTextureForMedium(tex);
    if (map !== tex) owned.push(map);
    const mat = makePlasticMaterial({ map, finish });
    if (animatedFlavor) applyWhiteBorderShader(mat, skipCrop ? 0 : POSTER_CROP_X);
    owned.push(mat);
    materialSets.push([mat]);
  };
  mkPosterFlavor(false);                    // movie front
  mkPosterFlavor(false, 'shrinkwrap');      // series boxset front
  mkPosterFlavor(true);                     // Animated Movies front (white-border shader)
  mkPosterFlavor(false, undefined, true);   // game-box front (skipCrop)

  return {
    materialSets,
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}

export function disposeSeriesPanelResources() {
  for (const panel of [seriesEpisodePanel, seriesPlayPanel, seriesBackPanel]) {
    if (panel) {
      panel.tex.dispose();
      panel.mat.dispose();
    }
  }
  seriesEpisodePanel = null;
  seriesPlayPanel = null;
  seriesBackPanel = null;
  seriesBoxsetGeometry?.dispose();
  seriesBoxsetGeometry = null;
}

/**
 * Push the current POSTER_CROP_X into the persisted global front materials'
 * baked shader uniform. The globals are compiled once and reused across
 * no-reload scene rebuilds, so when the media format changes (DVD<->VHS, which
 * changes the case aspect ratio and therefore the horizontal poster crop via
 * initCaseMedium) their uPosterCropX uniform would otherwise stay stale.
 */
export function refreshPosterCrop() {
  const apply = (mat: any) => {
    mat?.userData?.compiledUniformsList?.forEach((u: any) => {
      if (u.uPosterCropX) u.uPosterCropX.value = POSTER_CROP_X;
    });
  };
  apply(globalFrontMaterialRegular);
  apply(globalFrontMaterialAnimated);
}

export function updateGlobalMaterialsEnvMap(envMap: THREE.Texture | null) {
  initGlobalMaterials();
  if (globalFrontMaterialRegular) {
    globalFrontMaterialRegular.envMap = envMap;
    globalFrontMaterialRegular.needsUpdate = true;
  }
  if (globalFrontMaterialAnimated) {
    globalFrontMaterialAnimated.envMap = envMap;
    globalFrontMaterialAnimated.needsUpdate = true;
  }
  if (globalSpineMaterialRegular) {
    globalSpineMaterialRegular.envMap = envMap;
    globalSpineMaterialRegular.needsUpdate = true;
  }
  if (globalSpineMaterialAnimated) {
    globalSpineMaterialAnimated.envMap = envMap;
    globalSpineMaterialAnimated.needsUpdate = true;
  }
  if (globalBackMaterialAnimated) {
    globalBackMaterialAnimated.envMap = envMap;
    globalBackMaterialAnimated.needsUpdate = true;
  }
}
