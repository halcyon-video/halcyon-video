// Genre fascia blades — the colored sign bands that ride on top of shelving
// runs, white varsity block letters on a saturated field, straight out of the
// 1993 store footage: orange for the funny shelves, blue for the dramatic
// ones, purple for the scary ones, red for the specialist wall.
//
// In the bb-90s theme these ARE the aisle section toppers: shelving.ts calls
// the factory below once per divider section instead of building its old
// ticket signboard, so the blade over your head always prints the label that
// section actually carries in the library layout (the same sectionLabels the
// clasps and endcaps read). Double-sided units get the front face's label on
// one side and the back face's on the other.
//
// Performance: one canvas texture per unique label (module-cached, survives
// scene rebuilds), one material per label and one BoxGeometry per distinct
// blade length per factory (per store build). A full store adds ~60
// twelve-triangle boxes. Nothing animates; nothing is emissive.
import * as THREE from 'three';
import { markSignMesh } from '../sign-builders';
import { bb93GenreColor } from '../genre-colors';
import { BB_ANTON, BB_ARCHIVO_BLACK, bundledFontReady, ensureBundledFont } from '../bundled-fonts';

// Sized by the user's own count against the footage: the board covers THREE
// displayed boxes (see shelving.ts BOARD_LEN_MAX), and the height holds the
// real board's ~4.5:1 proportions at that length. (Depth-corrected absolute
// reads kept landing bigger — 10-14in — but the perceived in-store scale is
// the acceptance test, and it says small marker, not marquee.)
export const FASCIA_BLADE_H = 0.4; // ft (~4.8in)
const BLADE_T = 0.055;              // ft — panel thickness
const END_GAP = 0.12;               // ft shaved off each span so adjacent blades read apart

// Color families live in genre-colors.ts, shared with the ceiling panels.
const fasciaColor = bb93GenreColor;

/**
 * A blade's colorway. Omitted entirely, a blade is a 1993 GENRE blade and takes
 * its field from the genre-color system above (orange/blue/purple/red) — a
 * merchandising convention, not livery, and correct in the era it came from.
 *
 * A caller that hangs a blade OUTSIDE that system passes a colorway instead:
 * the promo floor stands wear the blade in every theme (see promo-topper.ts),
 * so theirs is the HOUSE colorway and has to move when the house does. Before
 * this existed the stands printed the genre-blue field into an emerald room and
 * read as an unconverted leftover.
 */
export interface FasciaColorway {
  /**
   * Set by promo-topper's houseBladeColorway(). Marks this entry as wearing the
   * HOUSE livery rather than a fixed genre colour, which is what lets a live
   * brand edit know which cached blades to repaint (repaintHouseBlades below).
   * Genre blades take their field from the era's merchandising convention and
   * must NOT follow the brand.
   */
  house?: boolean;
  /** Field (and edge trim) — a brand's `palette.primary`. */
  field: string;
  /** Letter fill — the emblem's own knockout (`LogoSpec.textColor`). */
  ink: string;
  /** Thin letter outline — the trim near-black (`themeTrimDarkHex`). */
  outline: string;
}

const GENRE_OUTLINE = '#132a4d'; // the footage's own thin navy letter outline
const GENRE_INK = '#ffffff';

// The footage letterforms are a squared athletic block, not a squeezed
// grotesque —
// Anton (OFL, bundled) is the closest license-safe face: heavy, condensed,
// flat-sided, no synthetic squeeze needed for typical genre words. The face
// registers async; blades paint immediately with the fallback and repaint
// in place when the font lands.
const FASCIA_FONT = BB_ANTON;
let repaintArmed = false;
/**
 * Register the bundled Anton face ('BBAnton', src/bundled-fonts.ts) and run
 * `onReady` once it's loaded (immediately if it already is). Shared by every
 * 93-dressing painter that sets collegiate type (fascia blades, the NR case
 * header, the wall band). The in-place repaint of already-painted blades is
 * armed once, not once per caller.
 */
export function ensureVarsityFont(onReady?: () => void): void {
  if (!repaintArmed) {
    repaintArmed = true;
    ensureBundledFont(FASCIA_FONT, () => {
      textureCache.forEach((entry) => {
        paintFascia(entry.tex.image as HTMLCanvasElement, entry.label, entry.way);
        entry.tex.needsUpdate = true;
      });
    });
  }
  ensureBundledFont(FASCIA_FONT, onReady);
}

// One texture per unique label + blade-length bucket + colorway (the canvas
// aspect must match the mesh face it lands on, or the letterforms stretch),
// kept across rebuilds — rebuild teardown disposes materials, not their maps,
// so a persistent cache is the no-leak shape here. The label and colorway ride
// with the entry so the font-ready repaint doesn't have to parse them back out
// of the key.
interface FasciaEntry {
  tex: THREE.CanvasTexture;
  label: string;
  way: FasciaColorway | null;
}
const textureCache = new Map<string, FasciaEntry>();
const PX_PER_FT = 300;

function paintFascia(canvas: HTMLCanvasElement, key: string, way: FasciaColorway | null): void {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = way ? way.field : fasciaColor(key);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // White block letters, thin navy outline, cap height at ~65% of the band
  // with even margins above and below. Sizing and centering use MEASURED
  // glyph metrics (actualBoundingBox*), not an assumed cap/em ratio —
  // Anton's tall ascent made ratio-based sizing clip the caps at the top
  // (user-flagged).
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Both faces are bundled, so neither name can silently substitute: Anton
  // when it has landed, otherwise the heavy grotesque as the stand-in the
  // first paint uses until the repaint above catches it.
  const family = bundledFontReady(FASCIA_FONT)
    ? `${FASCIA_FONT}, ${BB_ARCHIVO_BLACK}, sans-serif`
    : `${BB_ARCHIVO_BLACK}, sans-serif`;
  const capTarget = canvas.height * 0.65;
  ctx.font = `100px ${family}`;
  const capPer100 = Math.max(1, ctx.measureText(key).actualBoundingBoxAscent);
  let em = Math.round(capTarget / capPer100 * 100);
  const setFont = () => { ctx.font = `${em}px ${family}`; };
  setFont();
  const maxW = Math.round(canvas.width * 0.84);
  let squeeze = Math.min(1, maxW / ctx.measureText(key).width);
  if (squeeze < 0.55) {
    em = Math.max(24, Math.floor(em * (squeeze / 0.55)));
    setFont();
    squeeze = Math.min(1, maxW / ctx.measureText(key).width);
  }
  const m = ctx.measureText(key);
  ctx.save();
  // Baseline placed so the measured glyph box sits dead-center vertically.
  ctx.translate(canvas.width / 2, (canvas.height + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  ctx.scale(squeeze, 1);
  ctx.lineWidth = Math.max(3, em * 0.04);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = way ? way.outline : GENRE_OUTLINE;
  ctx.strokeText(key, 0, 0);
  ctx.fillStyle = way ? way.ink : GENRE_INK;
  ctx.fillText(key, 0, 0);
  ctx.restore();
}

/** Colorway identity for the texture/material caches (null = genre system). */
function wayKey(way: FasciaColorway | null): string {
  return way ? `${way.field}${way.ink}${way.outline}` : 'genre';
}

/**
 * Repaint every cached blade wearing the HOUSE colorway, in place, with a fresh
 * one. Blade textures are module-cached and outlive scene rebuilds by design
 * (see the cache comment above) — which also meant a brand change could never
 * reach them, rebuild or not. promo-topper wires this to brand-live.
 */
export function repaintHouseBlades(fresh: FasciaColorway): void {
  textureCache.forEach((entry) => {
    if (!entry.way?.house) return;
    entry.way = { ...fresh, house: true };
    paintFascia(entry.tex.image as HTMLCanvasElement, entry.label, entry.way);
    entry.tex.needsUpdate = true;
  });
}

function fasciaTexture(label: string, lengthFt: number, way: FasciaColorway | null): THREE.CanvasTexture {
  const key = label.toUpperCase();
  const cacheKey = `${key}|${lengthFt.toFixed(1)}|${wayKey(way)}`;
  const hit = textureCache.get(cacheKey);
  if (hit) return hit.tex;

  ensureVarsityFont();
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(2560, Math.max(512, Math.round(lengthFt * PX_PER_FT)));
  canvas.height = Math.round(FASCIA_BLADE_H * PX_PER_FT);
  paintFascia(canvas, key, way);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(cacheKey, { tex, label: key, way });
  return tex;
}

export interface FasciaBladeFactory {
  /**
   * A blade for one divider section. `plusXLabel`/`minusXLabel` are the
   * labels facing local +X / -X (BoxGeometry material order); `spanFt` is the
   * section's full span along local Z. The caller positions/rotates the mesh
   * (its origin is the blade's center) and parents it; its base is meant to
   * sit flush on the 5.1 ft frame top, i.e. position y = 5.1 + FASCIA_BLADE_H/2.
   */
  blade(plusXLabel: string, minusXLabel: string, spanFt: number): THREE.Mesh;
}

/**
 * Per-store-build factory: materials and geometries are cached inside it (and
 * torn down with the aisle meshes they end up on); textures persist in the
 * module cache across rebuilds (keyed by colorway too, so a theme switch paints
 * a new field rather than reusing the old house's).
 *
 * `way` omitted = the 1993 genre-color system (aisle blades). Pass a colorway
 * to hang the blade in the house's own livery instead.
 */
export function createFasciaBladeFactory(way: FasciaColorway | null = null): FasciaBladeFactory {
  const faceMats = new Map<string, THREE.MeshStandardMaterial>();
  const edgeMats = new Map<string, THREE.MeshStandardMaterial>();
  const geos = new Map<string, THREE.BoxGeometry>();

  const faceMat = (label: string, lengthFt: number): THREE.MeshStandardMaterial => {
    const key = `${label.toUpperCase()}|${lengthFt.toFixed(1)}`;
    let m = faceMats.get(key);
    if (!m) {
      // Matte print — glossier settings read as self-lit under the env bake
      // (see the ceilingHangingSign note in sign-fixtures.ts).
      m = new THREE.MeshStandardMaterial({ map: fasciaTexture(label, lengthFt, way), roughness: 0.6, metalness: 0.0 });
      faceMats.set(key, m);
    }
    return m;
  };
  const edgeMat = (label: string): THREE.MeshStandardMaterial => {
    const color = way ? way.field : fasciaColor(label);
    let m = edgeMats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.0 });
      edgeMats.set(color, m);
    }
    return m;
  };

  return {
    blade(plusXLabel: string, minusXLabel: string, spanFt: number): THREE.Mesh {
      const length = Math.max(0.8, spanFt - END_GAP);
      const geoKey = length.toFixed(2);
      let geo = geos.get(geoKey);
      if (!geo) {
        geo = new THREE.BoxGeometry(BLADE_T, FASCIA_BLADE_H, length);
        geos.set(geoKey, geo);
      }
      const trim = edgeMat(plusXLabel);
      const mesh = new THREE.Mesh(geo, [
        faceMat(plusXLabel, length),  // +X
        faceMat(minusXLabel, length), // -X
        trim, trim, trim, trim,
      ]);
      // Free-standing band on the run top: it does throw a real shadow line.
      markSignMesh(mesh, { casts: true });
      return mesh;
    },
  };
}
