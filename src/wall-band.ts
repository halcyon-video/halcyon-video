// The perimeter NEW RELEASES / CHARTBUSTERS wall band — bb-2010 (2008
// generation) store fabric.
//
// WHAT IT IS (public/user-assets/fixtures/chartbusters-newreleases-band/
// NOTES.md, measured off Flickr 3149943076, Dec 2008 "store A"): a PAINTED
// WALL BAND ~34 in tall riding the top of the perimeter wall bays, carrying
// alternating display words in ultra-condensed caps with a tilted emblem
// plaque at the midpoint of every inter-word gap. Module pitch is 2.714
// band-heights ≈ 93 in.
//
// NO PAINTED FIELD (owner F8 pins 027 + 028, 2026-08-03): the reference band
// prints its words on a chain-yellow slab, and the owner's ruling is
// explicit — "this doesn't need to be letters on a yellow slab. needs to just
// be the letters and the store logo". So the strip's canvas is TRANSPARENT
// and the room's own wall reads through it; what is painted is the lettering
// and, in place of the reference's torn-ticket plaque, the ACTIVE STORE LOGO
// (drawLogo over getActiveLogoSpec — the same painter the storefront, the
// signboards and the box wraps use, so the band follows whatever brand pack
// is installed instead of wearing one house forever). Every MEASURED number
// below is unchanged: the geometry survives, only the dress changed.
//
// It is FABRIC, not signage: no seams, no fasteners, no boards. It turns
// inside corners continuously, dies into the ceiling/bulkhead above, and runs
// BEHIND the fixtures in front of it — the run is simply CUT OFF at a column
// or an interruption, never re-laid to fit. So this builds one wall-anchored
// strip per wall run, tucked closer to the wall than the wall shelving, and
// lets the shelving/cornice occlude it. It is deliberately NOT wrapped around
// the vestibule or the back-room openings: it covers exactly the wall spans
// the theme's own band covered (the two flat New Releases runs), and the
// stepped-corner faces stay bare, as they always have.
//
// Theme fabric, NOT a pop-period drop: gated on bb-2010 alone, and it REPLACES
// that theme's old ticket-logo + extruded-lettering topper (fixtures/
// signage.ts defers to wallBandSupersedesTopper() so nothing double-draws).
// Every other theme is untouched.
//
// Performance: one material, one merged BufferGeometry for every run in the
// store (single draw call), one texture, zero per-frame work. The strip paints
// once (and repaints in place when the bundled faces resolve).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getActiveTheme, type StoreTheme } from './themes';
import { markSignMesh } from './sign-builders';
import { ensureVarsityFont } from './fixtures/genre-fascia';
import { BB_ANTON, BB_ARCHIVO_BLACK, bundledFontReady, ensureBundledFont } from './bundled-fonts';
import { DEFAULT_SIGNAGE_CONFIG } from './signage-config';
import { getActiveLogoSpec } from './logo-spec';
import { drawLogo } from './logo-renderer';
import type { SignSlot } from './fixtures/signage';
import type { StoreScene } from './three-scene';

// ── Measured geometry (NOTES.md §"Key numbers (2008 A)"), in band heights H ──
const BAND_H_FT = 34 / 12;        // 34 in — store A's band. NOT a program constant.
const MODULE_PITCH_H = 2.714;     // word→word pitch (≈93 in on the wall)
const MODULES_PER_STRIP = 2;      // 2008 alternates NEW RELEASES / CHARTBUSTERS
const STRIP_ASPECT = MODULE_PITCH_H * MODULES_PER_STRIP; // 5.428 — the measured module aspect
const WORD_W_H = 1.18;            // both words optically fit to one shared measure
const CAP_H = 0.186;
const ABOVE_CAP_H = 0.392;        // clear band above the cap line
// The inter-word emblem, on the plaque's own datum. The reference's torn
// ticket sat at TICKET_CY_H with a 2.5-3:1 footprint and an 18° lean; the
// store logo now stands there. drawLogo insets its emblem inside the rect it
// is handed (0.82 W x 0.52 H), so the box below is back-solved from the ink
// the plaque actually occupied: 0.55 H of painted emblem across, and a cap
// band matching the lettering's own 0.186 H so the lockup and the words read
// at one optical weight. Ratio 2.9:1 — the plaque's own family.
const EMBLEM_INK_W_H = 0.55;
const EMBLEM_INK_H_H = 0.19;
const EMBLEM_W_H = EMBLEM_INK_W_H / 0.82;
const EMBLEM_H_H = EMBLEM_INK_H_H / 0.52;
const EMBLEM_TILT_DEG = 18;       // right-end-up, the plaque's measured lean
const EMBLEM_CY_H = 0.49;         // = the retired TICKET_CY_H
const WORD_X0_H = 0.34;           // phase: where the first word's ink starts

// One strip length on the wall. The whole point of the repeat math below.
const STRIP_LEN_FT = BAND_H_FT * STRIP_ASPECT;      // 15.379 ft
export const MODULE_LEN_FT = STRIP_LEN_FT / MODULES_PER_STRIP; // 7.69 ft = 92.3 in

// Where the band sits. Bottom rides the top of the wall-bay uprights
// (NR_PANEL_H in store-shell.ts's buildShelfRun) exactly as in the reference
// photo — band bottom = bay top, with the fixture's front face standing proud
// of the strip so it occludes the bottom hair of it instead of leaving a gap.
// Top then lands at 10.83 ft, i.e. 0.03 ft INTO the chrome cornice's 10.8 ft
// underside on the standard 13.5 ft deck: the band dies into the bulkhead
// rather than stopping in open wall, which is what the 2008 photos show.
const BAY_TOP_Y = 8.0;
const WALL_STANDOFF = 0.04;       // ft off the wall plane — behind every wall fixture

// Ink. There is no field left to knock out of, so the letters are painted
// straight onto the wall in the HOUSE COLOUR — theme.palette.primary, which a
// brand pack overrides along with everything else it re-skins. (This used to
// be HALCYON_INK, a Halcyon-only literal: correct against the old cream slab,
// but a fixed green would have survived a brand move, and against the room's
// own wall the house colour is both the canon token and the stronger read —
// #1a49c2 on the 2010 theme's #e9e2cf drywall.)
function bandInk(theme: StoreTheme = getActiveTheme()): string {
  return theme.palette.primary;
}

// Generic retail wording — the committed band names no chain's programme.
const BAND_WORDS = ['NEW RELEASES', 'TOP HITS'];

/**
 * True when this theme's wall band is painted by THIS module, so the generic
 * per-theme New Releases topper (fixtures/signage.ts) must stand down for the
 * wall-newrelease slots. Single source of truth for the swap.
 *
 * Still correct after the de-slabbing: the band no longer paints a field, but
 * it still OCCUPIES those slots — it sets the words and the emblem across the
 * whole wall run at the measured pitch, and letting the per-theme topper build
 * on top of that would double-set the same wall. What changed is the dress,
 * not the coverage.
 */
export function wallBandSupersedesTopper(theme: StoreTheme = getActiveTheme()): boolean {
  return theme.id === 'bb-2010';
}

/** Resolve slot→sign the way buildSignage does, so coverage can't drift. */
function signageConfig(): Record<string, string | null> {
  const config = { ...DEFAULT_SIGNAGE_CONFIG };
  if (typeof localStorage !== 'undefined') {
    const custom = localStorage.getItem('bb_signage_config');
    if (custom) {
      try { Object.assign(config, JSON.parse(custom)); } catch { /* buildSignage already reported it */ }
    }
  }
  return config;
}

/**
 * Paint the perimeter band over the wall runs described by `slots` (the same
 * list buildSignage is handed). No-op on every theme but bb-2010.
 */
export function buildWallBand(scene: StoreScene, slots: SignSlot[]): void {
  if (!wallBandSupersedesTopper()) return;

  const config = signageConfig();
  const runs = slots.filter(
    (s) => s.category === 'wall-newrelease' && !!s.length && s.length > 0.5 && config[s.id] !== null
  );
  if (runs.length === 0) return;

  const centerY = BAY_TOP_Y + BAND_H_FT / 2;
  const parts: THREE.BufferGeometry[] = [];
  for (const run of runs) {
    const len = run.length!;
    const geo = new THREE.PlaneGeometry(len, BAND_H_FT);
    // Bake the tiling into the UVs instead of per-run texture clones: that is
    // what lets every run share ONE map and merge into ONE draw call.
    // repeat = how many strips fit; the leftover fraction is split evenly
    // between the two ends so the run reads as a piece cut out of a longer
    // painted run rather than one jammed against a corner.
    const repeat = len / STRIP_LEN_FT;
    const offset = -((repeat % 1) / 2);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeat + offset);
    // The slot's local +Z is the face direction; push the strip that far off
    // the wall so it sits BEHIND the wall shelving standing in front of it.
    geo.rotateY(run.yaw);
    geo.translate(
      run.pos.x + Math.sin(run.yaw) * WALL_STANDOFF,
      centerY,
      run.pos.z + Math.cos(run.yaw) * WALL_STANDOFF,
    );
    parts.push(geo);
  }

  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (parts.length > 1) parts.forEach((g) => g.dispose());

  const strip = createBandStripTexture(() => scene.requestRender());
  const mat = new THREE.MeshStandardMaterial({
    map: strip,
    // Matte paint on drywall, same finish family as the wall material it sits
    // on — the band must take the troffer gradient, never broadcast it.
    roughness: 0.9,
    metalness: 0.0,
    // The field is gone: everything between the letters is bare alpha and the
    // wall behind must read through it. Blended, not alphaTest'd — a hard cut
    // would chew the ultra-condensed stems and the emblem's pinstripe to
    // aliased crumbs across a store-length run. depthWrite STAYS ON: the strip
    // is a wall-hugging quad standing WALL_STANDOFF (0.5 in) proud of an
    // opaque wall, so there is nothing to sort behind it, and writing depth is
    // what keeps the shelving in front of it occluding it correctly.
    transparent: true,
  });
  const mesh = markSignMesh(new THREE.Mesh(merged, mat));
  mesh.name = 'wall-band';
  // Behind every other transparent sign in the room: it is literally the
  // furthest-back surface on that wall (only the wall itself is deeper), and a
  // fixed order keeps it from swapping places with a hanger or a valance as
  // the camera moves.
  mesh.renderOrder = -1;
  scene.scene.add(mesh);
}

// ── Procedural fallback strip ───────────────────────────────────────────────
// One tileable strip = MODULES_PER_STRIP modules, drawn at the measured
// fractions above so the fallback and the real art share a rhythm and can be
// swapped on the same UVs. Non-power-of-two on purpose: the canvas aspect IS
// the measured module aspect, and rounding it to a tidy rectangle would
// discard the one number the whole layout hangs on (NOTES.md §10).

/** Band-height fractions → canvas px. */
function bandPx(canvas: HTMLCanvasElement, f: number): number {
  return f * canvas.height;
}

/**
 * The store logo, standing where the reference's torn-ticket plaque stood.
 *
 * Rule 2: the emblem is NOT drawn here — it is the active LogoSpec painted by
 * drawLogo, the one painter the storefront tower, the signboards, the shelf
 * labels and the box wraps all go through. An installed brand pack's own
 * outline, wordmark vectors, fonts and colours therefore arrive on this wall
 * for free, and nothing about the house lives in this file.
 */
function drawEmblem(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, cx: number): void {
  const w = bandPx(canvas, EMBLEM_W_H);
  const h = bandPx(canvas, EMBLEM_H_H);
  ctx.save();
  ctx.translate(cx, bandPx(canvas, EMBLEM_CY_H));
  ctx.rotate((-EMBLEM_TILT_DEG * Math.PI) / 180); // right end up, as the plaque leaned
  // Painted flat: this is paint on drywall, so the emblem carries no drop
  // shadow (drawLogo's default) — hence the explicit zero-blur transparent
  // shadow rather than the print one the box wraps ask for.
  drawLogo(ctx, getActiveLogoSpec(), {
    x: -w / 2, y: -h / 2, w, h,
    shadow: { color: 'rgba(0,0,0,0)', blur: 0, ox: 0, oy: 0 },
  });
  ctx.restore();
}

function drawWord(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, text: string, cellX0: number,
  family: string, inkColor: string,
): void {
  const capPx = bandPx(canvas, CAP_H);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `100px ${family}`;
  const capPer100 = Math.max(1, ctx.measureText(text).actualBoundingBoxAscent);
  const em = Math.max(8, Math.round((100 * capPx) / capPer100));
  ctx.font = `${em}px ${family}`;
  const m = ctx.measureText(text);
  const ink = Math.max(1, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
  // Both 2008 words are fitted to ONE shared measure, but that only works
  // because they are the same length. The generic stand-in is shorter, so
  // clamp the optical fit instead of inflating it into a different weight —
  // the cap height (what actually reads across a store) is held either way.
  const target = bandPx(canvas, WORD_W_H);
  const scaleX = Math.min(1.18, Math.max(0.82, target / ink));
  const drawnW = ink * scaleX;
  ctx.save();
  // Centre the ink on the module's word cell so a short word keeps the rhythm.
  ctx.translate(cellX0 + (target - drawnW) / 2, bandPx(canvas, ABOVE_CAP_H + CAP_H));
  ctx.scale(scaleX, 1);
  ctx.fillStyle = inkColor;
  ctx.fillText(text, m.actualBoundingBoxLeft, 0);
  ctx.restore();
}

function paintBandStrip(canvas: HTMLCanvasElement, fontReady: boolean): void {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // NO FIELD. Everything that is not ink is bare alpha, and the room's own
  // wall shows through it (owner pins 027/028).
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ink = bandInk();
  // Anton-class ultra-condensed heavy grotesque (NOTES.md §9.1 lands the
  // family for both generations); the bundled Anton registers async, so the
  // first pass may paint the narrow-grotesque fallback and repaint in place.
  // ('Arial Narrow' is the one system name kept here: fontconfig metric-aliases
  // it to Liberation Sans Narrow, so it resolves to a real narrow face rather
  // than substituting silently. Impact does NOT — Anton IS our Impact.)
  const family = fontReady
    ? `${BB_ANTON}, 'Arial Narrow', sans-serif`
    : `'Arial Narrow', sans-serif`;
  for (let m = 0; m < MODULES_PER_STRIP; m++) {
    const x0 = bandPx(canvas, WORD_X0_H + m * MODULE_PITCH_H);
    drawWord(ctx, canvas, BAND_WORDS[m % BAND_WORDS.length], x0, family, ink);
    // The emblem sits at the optical midpoint of the inter-word gap — the
    // single strongest continuity across all three generations.
    drawEmblem(ctx, canvas, x0 + bandPx(canvas, WORD_W_H + (MODULE_PITCH_H - WORD_W_H) / 2));
  }
}

function createBandStripTexture(onRepaint: () => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  // 512 rather than the slab era's 384: with the field gone, the emblem is the
  // finest thing on the strip (its pinstripe is ~1 px at 384) and there is no
  // flat colour left to hide the loss in.
  canvas.height = 512;
  canvas.width = Math.round(canvas.height * STRIP_ASPECT);
  let painted = 0;
  const repaint = () => {
    // Both faces land async and independently: the words set in Anton
    // (ensureVarsityFont) and the emblem in the LogoSpec's own face, which for
    // every built-in spec is bundled Archivo Black. Repaint on each arrival,
    // and only bother the renderer when something actually changed.
    if (painted >= 2) return;
    painted++;
    paintBandStrip(canvas, bundledFontReady(BB_ANTON));
    tex.needsUpdate = true;
    onRepaint(); // render-on-demand: the repaint needs a frame to show
  };
  paintBandStrip(canvas, false);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  ensureVarsityFont(repaint);
  ensureBundledFont(BB_ARCHIVO_BLACK, repaint);
  return tex;
}
