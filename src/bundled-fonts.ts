// Bundled display faces — the ONLY faces canvas painters are allowed to name.
//
// Every sign in this store is measured against the face it declares: cap
// heights, ink widths and letter gaps all come out of measureText. Naming a
// family the host does not have does not fail — the browser silently
// substitutes another face and every one of those measurements is quietly
// wrong (that is how blue-diamond-special-2-sticker shipped copy through its
// keyline; see tools/font-resolution.mjs). So the rule is: name a face we
// SHIP, never a face we hope is installed.
//
// The proprietary faces this store's signage kept asking for are not
// installable here, so the owner ruled on free stand-ins of the same class
// (2026-08-02):
//   Impact       -> Anton         (ultra-condensed heavy grotesque, Impact class)
//   Arial Black  -> Archivo Black (heavy grotesque, Arial-Black class)
//   Segoe Script /
//   Brush Script -> Yellowtail    (retro connected brush script)
// plus Outfit and Orbitron, which the tech-spec panels already named but which
// used to arrive only over a Google-Fonts @import in styles.css — i.e. never at
// all on a boot with no network, which is the normal state of an HTPC kiosk.
// That @import is gone (2026-08-06): styles.css now declares @font-face against
// these same bundled files, so the DOM and the canvas load from one source.
//
// Loading follows the shape ensureBrandFont (canvas-textures.ts) and
// ensureVarsityFont (fixtures/genre-fascia.ts) already use: register the
// bundled file as a FontFace under a BB-prefixed family name, so nothing can
// collide with a same-named system family or with the stylesheet's webfont
// copy, and repaint in place when it lands. No network fetch: Vite inlines
// these as bundle assets.
import antonUrl from './assets/anton.ttf';
import archivoBlackUrl from './assets/archivo-black.ttf';
import outfitUrl from './assets/outfit.ttf';
import orbitronUrl from './assets/orbitron.ttf';
import yellowtailUrl from './assets/yellowtail.ttf';

/** Anton — the Impact-class ultra-condensed black. Also the varsity/fascia face. */
export const BB_ANTON = 'BBAnton';
/** Archivo Black — the Arial-Black-class heavy grotesque. */
export const BB_ARCHIVO_BLACK = 'BBArchivoBlack';
/** Outfit (variable 100–900) — the tech-spec panel's body/display sans. */
export const BB_OUTFIT = 'BBOutfit';
/** Orbitron (variable 400–900) — the tech-spec panel's label/technical face. */
export const BB_ORBITRON = 'BBOrbitron';
/** Yellowtail — the brush script the 1990 collection header card sets. */
export const BB_BRUSH = 'BBBrush';

interface FaceSpec {
  url: string;
  descriptors?: FontFaceDescriptors;
}

// Every face declares a WEIGHT RANGE, and that is load-bearing twice over:
//   • the variable faces (Outfit, Orbitron) would otherwise be pinned to their
//     default instance — Outfit's is Thin — and every weight would paint the
//     same hairline;
//   • the single-weight display faces all report usWeightClass 400 even though
//     they ARE blacks, so a `900 ...px` request would match a 400 face and
//     Chrome would SYNTHESIZE bold on top of an already-black design: smeared
//     stems, clogged counters, and ~4% of extra ink width that every fit loop
//     then measures as real.
const FACES: Record<string, FaceSpec> = {
  [BB_ANTON]: { url: antonUrl, descriptors: { weight: '100 900' } },
  [BB_ARCHIVO_BLACK]: { url: archivoBlackUrl, descriptors: { weight: '100 900' } },
  [BB_OUTFIT]: { url: outfitUrl, descriptors: { weight: '100 900' } },
  [BB_ORBITRON]: { url: orbitronUrl, descriptors: { weight: '400 900' } },
  [BB_BRUSH]: { url: yellowtailUrl, descriptors: { weight: '100 900' } },
};

/**
 * Add a face that isn't in the bundle — the seam a brand pack's own display
 * font arrives through (src/brand-pack.ts registers each `fonts[]` entry).
 * Everything the bundled faces get, it gets: one FontFace per family, the same
 * ready/waiting bookkeeping, and a place in bundledFontsReady()'s gate, so a
 * pack face is settled before the store bakes it into a texture.
 *
 * `family` must already be the prefixed runtime name the caller will PAINT
 * with — this registrar does not rename anything, and naming a family the host
 * might also have is the substitution bug this module exists to prevent.
 * First registration of a family wins (re-registering is a no-op).
 */
export function registerRuntimeFace(
  family: string,
  url: string,
  descriptors?: FontFaceDescriptors,
): void {
  if (FACES[family]) return;
  FACES[family] = { url, descriptors };
  // Re-arm the aggregate gate so a face registered AFTER the module-eval kick
  // still joins it (boot awaits bundledFontsReady() well after this runs).
  allPromise = null;
  ensureBundledFont(family);
}

const ready = new Set<string>();
const requested = new Set<string>();
const waiting = new Map<string, (() => void)[]>();

/** Has this bundled face finished loading (i.e. is it safe to measure with)? */
export function bundledFontReady(family: string): boolean {
  return ready.has(family);
}

/**
 * Register one bundled face and run `onReady` when it has loaded (immediately
 * if it already has, and also on failure — a painter must never hang on a
 * font). Idempotent: the FontFace is created at most once per family.
 */
export function ensureBundledFont(family: string, onReady?: () => void): void {
  if (onReady) {
    if (ready.has(family)) { onReady(); return; }
    const q = waiting.get(family);
    if (q) q.push(onReady);
    else waiting.set(family, [onReady]);
  }
  const spec = FACES[family];
  if (!spec || requested.has(family)) return;
  requested.add(family);
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') {
    settle(family);
    return;
  }
  const face = new FontFace(family, `url(${spec.url})`, spec.descriptors);
  face.load().then(
    (f) => { document.fonts.add(f); settle(family); },
    () => { settle(family); },
  );
}

function settle(family: string): void {
  ready.add(family);
  (waiting.get(family) ?? []).splice(0).forEach((cb) => cb());
}

let allPromise: Promise<void> | null = null;
/**
 * Register every known face and resolve once they have all settled. Boot
 * paths await this BEFORE building the store, which is what stops the first
 * paint of every cached texture from baking a fallback face into a canvas
 * nothing will ever repaint.
 *
 * "Known" is not fixed at module eval: registerRuntimeFace clears the memo, so
 * a brand pack's faces (registered mid-boot, after its manifest lands) are in
 * the gate the boot funnel awaits.
 */
export function bundledFontsReady(): Promise<void> {
  if (!allPromise) {
    allPromise = Promise.all(
      Object.keys(FACES).map((family) => new Promise<void>((res) => ensureBundledFont(family, res))),
    ).then(() => { /* void */ });
  }
  return allPromise;
}

// Kick every load at module eval — the earliest this module can — so the
// fetches overlap the library sync rather than the store build.
bundledFontsReady();
