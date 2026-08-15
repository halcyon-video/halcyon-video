// LogoSpec emblem painter: every brand surface (storefront sign, shelf/library
// labels, layered wall signage, box wraps) draws its emblem through drawLogo().
// ONE path through here — the procedural painter: shape body (with optional
// seeded torn edge + inner pinstripe), auto-fit main text (greedy
// shrink-to-fit, the same algorithm the library labels always used), subText /
// bandText / taglineText. A brand whose lettering no installable face
// reproduces supplies it as vectors instead (wordmarkPathD / artLayers over a
// shape:'path' outline), which is how a brand pack restores a real chain's
// lockup without any of it living in this file.
//
// Pure 2D canvas: no three.js here (textures are the caller's business), and
// everything is painted once at boot — nothing in this file runs per frame.
import type { LogoArtLayer, LogoSpec } from './logo-spec';
import { BB_ANTON, BB_ARCHIVO_BLACK, BB_BEBAS, BB_OUTFIT } from './bundled-fonts';
import { brandImage, brandPackFontFamily } from './brand-pack';

// ─── Small utilities ─────────────────────────────────────────────────────────

// Deterministic PRNG for the torn-edge jitter: same tornSeed → same tear,
// every boot, every surface.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LogoPoint { x: number; y: number }

// Minimal SVG path-data flattener (M/L/H/V/C/S/Z, abs+rel, repeated arg
// groups) — enough for the traced outlines brands supply as `pathD`. Turns one
// into polygon loops for buildLogoShapePoints (which extrudes them into a
// THREE.Shape for the 3D sign); pure math, no DOM.
export function flattenSvgPath(d: string, curveSegs = 14): LogoPoint[][] {
  const tokens = d.match(/[a-df-zA-DF-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE]-?\d+)?/g) ?? [];
  const loops: LogoPoint[][] = [];
  let pts: LogoPoint[] = [];
  let i = 0;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let pcx: number | null = null, pcy: number | null = null; // previous cubic ctrl2 (for S)
  let cmd = '';
  const num = () => parseFloat(tokens[i++]);
  const cubic = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    for (let k = 1; k <= curveSegs; k++) {
      const t = k / curveSegs, u = 1 - t;
      pts.push({
        x: u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
        y: u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
      });
    }
    pcx = x2; pcy = y2; cx = x; cy = y;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[a-zA-Z]$/.test(t)) { cmd = t; i++; }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toLowerCase()) {
      case 'm': {
        const x = num(), y = num();
        cx = rel ? cx + x : x; cy = rel ? cy + y : y;
        sx = cx; sy = cy;
        if (pts.length > 1) loops.push(pts);
        pts = [{ x: cx, y: cy }];
        cmd = rel ? 'l' : 'L'; // subsequent pairs are implicit linetos
        pcx = pcy = null;
        break;
      }
      case 'l': {
        const x = num(), y = num();
        cx = rel ? cx + x : x; cy = rel ? cy + y : y;
        pts.push({ x: cx, y: cy });
        pcx = pcy = null;
        break;
      }
      case 'h': { const x = num(); cx = rel ? cx + x : x; pts.push({ x: cx, y: cy }); pcx = pcy = null; break; }
      case 'v': { const y = num(); cy = rel ? cy + y : y; pts.push({ x: cx, y: cy }); pcx = pcy = null; break; }
      case 'c': {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
        if (rel) cubic(cx + x1, cy + y1, cx + x2, cy + y2, cx + x, cy + y);
        else cubic(x1, y1, x2, y2, x, y);
        break;
      }
      case 's': {
        const x2 = num(), y2 = num(), x = num(), y = num();
        // Reflect the previous cubic's second control point (or start flat).
        const rx1 = pcx !== null && pcy !== null ? 2 * cx - pcx : cx;
        const ry1 = pcx !== null && pcy !== null ? 2 * cy - pcy : cy;
        if (rel) cubic(rx1, ry1, cx + x2, cy + y2, cx + x, cy + y);
        else cubic(rx1, ry1, x2, y2, x, y);
        break;
      }
      case 'z': {
        cx = sx; cy = sy;
        if (pts.length > 1) loops.push(pts);
        pts = [];
        pcx = pcy = null;
        break;
      }
      default:
        // Unsupported command (Q/T/A don't occur in the ticket path) — skip
        // its args by advancing past non-letter tokens.
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) i++;
    }
  }
  if (pts.length > 1) loops.push(pts);
  return loops;
}

// The straighten-and-normalize transform for one authored outline: rotate
// upright about `pivot` by `rot` radians, then map the rotated bbox onto 0..1.
// Kept as data (not just applied) so OTHER paths from the SAME authored
// document — a wordmark, a pinstripe, a ® mark — can be painted through the
// identical transform and land where the artwork puts them (LogoSpec.artLayers).
interface PathFrame {
  rot: number;
  px: number; py: number;   // rotation pivot, authored units
  minX: number; minY: number; // rotated bbox origin
  w: number; h: number;       // rotated bbox size
}

function computePathFrame(loops: LogoPoint[][], rot: number, pivot?: LogoPoint): PathFrame {
  let px = pivot?.x, py = pivot?.y;
  if (px === undefined || py === undefined) {
    // No pivot given: use the raw bbox centre (which is exactly what the
    // ticket's legacy TICKET_CX/CY anchor is).
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const loop of loops) for (const p of loop) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    px = (x0 + x1) / 2; py = (y0 + y1) / 2;
  }
  const cos = Math.cos(rot), sin = Math.sin(rot);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const loop of loops) for (const p of loop) {
    const dx = p.x - px, dy = p.y - py;
    const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
    if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
  }
  return { rot, px, py, minX, minY, w: maxX - minX || 1, h: maxY - minY || 1 };
}

function applyPathFrame(loops: LogoPoint[][], f: PathFrame): LogoPoint[][] {
  const cos = Math.cos(f.rot), sin = Math.sin(f.rot);
  return loops.map((loop) =>
    loop.map((p) => {
      const dx = p.x - f.px, dy = p.y - f.py;
      return {
        x: (dx * cos - dy * sin - f.minX) / f.w,
        y: (dx * sin + dy * cos - f.minY) / f.h,
      };
    }),
  );
}

// Brand-supplied `pathD` outlines, cached per (path, tilt) — a spec's outline
// is fixed for the boot, and every emblem surface asks for the same one. The
// frame is cached alongside the loops because artLayers needs it.
const customLoopsCache = new Map<string, { loops: LogoPoint[][]; frame: PathFrame }>();
function getCustomPath(d: string, tiltDeg: number): { loops: LogoPoint[][]; frame: PathFrame } {
  const key = `${tiltDeg}|${d}`;
  let entry = customLoopsCache.get(key);
  if (!entry) {
    const flat = flattenSvgPath(d);
    const frame = computePathFrame(flat, (tiltDeg * Math.PI) / 180);
    entry = { loops: applyPathFrame(flat, frame), frame };
    customLoopsCache.set(key, entry);
  }
  return entry;
}
function getCustomPathLoops(d: string, tiltDeg: number): LogoPoint[][] {
  return getCustomPath(d, tiltDeg).loops;
}

/**
 * The matrix that carries a path authored ALONGSIDE `pathD` (same SVG
 * document) into the w×h box the emblem body was fitted into — the whole point
 * of LogoSpec.artLayers.
 */
function pathSourceMatrix(d: string, tiltDeg: number, w: number, h: number): DOMMatrix {
  const f = getCustomPath(d, tiltDeg).frame;
  return new DOMMatrix()
    .scale(w / f.w, h / f.h)
    .translate(-f.minX, -f.minY)
    .rotate((f.rot * 180) / Math.PI)
    .translate(-f.px, -f.py);
}

// Seeded torn right edge: a jagged polyline from (x, yTop) down to (x, yBot),
// biting inward (never past the nominal edge) so the shape reads as ripped
// paper like the classic ticket's ends.
function tornEdgePoints(rand: () => number, xEdge: number, yTop: number, yBot: number, depth: number): LogoPoint[] {
  const pts: LogoPoint[] = [];
  const teeth = 9;
  for (let k = 1; k < teeth; k++) {
    const y = yTop + ((yBot - yTop) * (k + (rand() - 0.5) * 0.55)) / teeth;
    // Alternate between the nominal edge and an inward bite of varying depth.
    const x = k % 2 === 0 ? xEdge - depth * (0.15 + 0.25 * rand()) : xEdge - depth * (0.55 + 0.45 * rand());
    pts.push({ x, y });
  }
  return pts;
}

/**
 * The emblem outline as normalized (0..1, y-down canvas orientation) polygon
 * point loops — the exact same silhouette buildLogoShapePath draws, but as
 * raw data so Phase B1 can lift it into THREE.Shape for the extruded
 * storefront sign. No layout assumptions here: callers scale by their own
 * width/height (aspect is theirs to choose).
 *
 * tornEdge applies to shapes with a vertical right edge (rect, rounded-rect,
 * shield); the ticket is inherently torn, and triangle/half-circle/circle/
 * oval have no right edge a tear reads on (it's ignored gracefully).
 */
export function buildLogoShapePoints(spec: LogoSpec): LogoPoint[][] {
  const rand = mulberry32(spec.tornSeed);
  const TORN_DEPTH = 0.055; // fraction of width, matches the ticket's bite scale
  const torn = spec.tornEdge;
  switch (spec.shape) {
    case 'none':
      return [];
    case 'image':
      // A raster emblem paints itself (drawGeneric draws the art, not a filled
      // body), but it can still carry a SILHOUETTE: the simple-drop tier traces
      // a PNG's alpha into `pathD` so the 3D storefront sign has something to
      // extrude and the signboards have something to die-cut to. Without one
      // this behaves exactly like shape 'none', as it always did.
      return spec.pathD ? getCustomPathLoops(spec.pathD, spec.pathTiltDeg ?? 0) : [];
    case 'path':
      // Brand-supplied outline: same straighten/normalize treatment the ticket
      // gets, so it fills, pinstripes and extrudes through every existing path.
      return spec.pathD ? getCustomPathLoops(spec.pathD, spec.pathTiltDeg ?? 0) : [];
    default: {
      // 'rect' — and the safe landing for a saved spec naming a shape this
      // build no longer has (the retired built-in outline, say).
      const loop: LogoPoint[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
      if (torn) loop.push(...tornEdgePoints(rand, 1, 0, 1, TORN_DEPTH));
      loop.push({ x: 1, y: 1 }, { x: 0, y: 1 });
      return [loop];
    }
    case 'rounded-rect': {
      // Torn variant keeps square right corners — a tear through a radius
      // reads as a rendering bug, not a rip.
      const r = 0.09;
      const corner = (cx: number, cy: number, a0: number, a1: number): LogoPoint[] => {
        const seg = 8, out: LogoPoint[] = [];
        for (let k = 0; k <= seg; k++) {
          const a = a0 + ((a1 - a0) * k) / seg;
          out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
        return out;
      };
      const loop: LogoPoint[] = [];
      loop.push(...corner(r, r, Math.PI, Math.PI * 1.5)); // top-left
      if (torn) {
        loop.push({ x: 1, y: 0 });
        loop.push(...tornEdgePoints(rand, 1, 0, 1, TORN_DEPTH));
        loop.push({ x: 1, y: 1 });
      } else {
        loop.push(...corner(1 - r, r, Math.PI * 1.5, Math.PI * 2)); // top-right
        loop.push(...corner(1 - r, 1 - r, 0, Math.PI * 0.5));       // bottom-right
      }
      loop.push(...corner(r, 1 - r, Math.PI * 0.5, Math.PI)); // bottom-left
      return [loop];
    }
    case 'triangle':
      return [[{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]];
    case 'circle':
    case 'oval': {
      // One unit ellipse loop. 'oval' consumers stretch it into their box;
      // 'circle' consumers must keep the aspect square (buildLogoShapePath and
      // the 3D extrusion both special-case it to min(w,h)). tornEdge N/A.
      const loop: LogoPoint[] = [];
      const seg = 48;
      for (let k = 0; k < seg; k++) {
        const a = (Math.PI * 2 * k) / seg;
        loop.push({ x: 0.5 + 0.5 * Math.cos(a), y: 0.5 + 0.5 * Math.sin(a) });
      }
      return [loop];
    }
    case 'half-circle': {
      // Flat side down: sample the top arc, ellipse-stretched to fill 0..1.
      const loop: LogoPoint[] = [];
      const seg = 28;
      for (let k = 0; k <= seg; k++) {
        const a = Math.PI - (Math.PI * k) / seg;
        loop.push({ x: 0.5 + 0.5 * Math.cos(a), y: 1 - Math.sin(a) });
      }
      return [loop];
    }
    case 'shield': {
      const loop: LogoPoint[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
      if (torn) loop.push(...tornEdgePoints(rand, 1, 0, 0.5, TORN_DEPTH));
      loop.push({ x: 1, y: 0.5 });
      // Two quadratic flanks curving to the bottom point.
      const quad = (x0: number, y0: number, qx: number, qy: number, x1: number, y1: number) => {
        for (let k = 1; k <= 10; k++) {
          const t = k / 10, u = 1 - t;
          loop.push({ x: u * u * x0 + 2 * u * t * qx + t * t * x1, y: u * u * y0 + 2 * u * t * qy + t * t * y1 });
        }
      };
      quad(1, 0.5, 0.92, 0.85, 0.5, 1);
      quad(0.5, 1, 0.08, 0.85, 0, 0.5);
      return [loop];
    }
  }
}

/**
 * The emblem outline as a ready-to-fill Path2D sized w×h (top-left at 0,0).
 * Circle and oval get true curves; every other shape shares the exact polygon
 * loops buildLogoShapePoints produces (one silhouette source of truth for 2D
 * fill and 3D extrusion alike).
 */
/**
 * The authored width:height of a brand-supplied outline (after straightening),
 * or 0 when the spec has none. This is the aspect `pathFit: 'contain'` keeps.
 */
export function logoPathAspect(spec: LogoSpec): number {
  if (!spec.pathD) return 0;
  const f = getCustomPath(spec.pathD, spec.pathTiltDeg ?? 0).frame;
  return f.h > 0 ? f.w / f.h : 0;
}

/**
 * The sub-rect of a w×h emblem box the outline actually occupies. The whole
 * box unless the spec asks to be contained — see LogoSpec.pathFit. Shared by
 * the 2D fill, the signboards' ink-safe box and the 3D extrusion, so all three
 * place the silhouette identically.
 */
export function logoShapeFitRect(spec: LogoSpec, w: number, h: number): LogoBox {
  if (spec.pathFit !== 'contain') return { x: 0, y: 0, w, h };
  const a = logoPathAspect(spec);
  if (!(a > 0)) return { x: 0, y: 0, w, h };
  if (w / h > a) {
    const dw = h * a;
    return { x: (w - dw) / 2, y: 0, w: dw, h };
  }
  const dh = w / a;
  return { x: 0, y: (h - dh) / 2, w, h: dh };
}

export function buildLogoShapePath(spec: LogoSpec, w: number, h: number): Path2D {
  const path = new Path2D();
  if (spec.shape === 'circle') {
    // Always round: inscribed in the w×h box, centred, never stretched.
    path.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
    return path;
  }
  if (spec.shape === 'oval') {
    // True ellipse filling the box (smooth curves beat the sampled loop here;
    // the polygon loop stays the single source for the 3D extrusion).
    path.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    return path;
  }
  const fit = logoShapeFitRect(spec, w, h);
  for (const loop of buildLogoShapePoints(spec)) {
    loop.forEach((p, idx) => {
      const x = fit.x + p.x * fit.w, y = fit.y + p.y * fit.h;
      if (idx === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.closePath();
  }
  return path;
}

// The brand editor's family picker (settings.ts BRAND_FONTS) stores display
// names, and two of them used to arrive only over a Google-Fonts @import in
// styles.css — i.e. never on an offline kiosk boot, where the emblem then
// painted in whatever the system sans is and nothing said so. Both are now
// bundled (and that @import is gone as of 2026-08-06), so the picker's name
// maps onto the shipped file. The stored spec keeps the human name; only the
// canvas font string changes.
// Anton and Bebas Neue were bundled with the others but never listed here, so
// picking either in the editor painted the emblem in the system sans — the
// exact silent substitution this map exists to stop. Every family the picker
// offers now resolves to a shipped file; adding a name to settings.ts's
// BRAND_FONTS without adding it here is the bug to watch for.
const BUNDLED_BRAND_FAMILY: Record<string, string> = {
  Anton: BB_ANTON,
  'Archivo Black': BB_ARCHIVO_BLACK,
  'Bebas Neue': BB_BEBAS,
  Outfit: BB_OUTFIT,
};

/**
 * The CSS font-family list the spec letters in — the family half of
 * getLogoFontString, split out for the sign painters that size their type by
 * CAP HEIGHT (canvas-textures' signboards) and so cannot hand a rounded px
 * size to the string builder.
 */
export function logoFontFamily(spec: LogoSpec): string {
  // A brand pack's own faces resolve the same way: brand-pack.ts registered
  // each under a BBPack-prefixed family, and the spec keeps the human name.
  const bundled = BUNDLED_BRAND_FAMILY[spec.fontFamily] ?? brandPackFontFamily(spec.fontFamily);
  return bundled
    ? `${bundled}, sans-serif`
    : spec.fontFamily.includes(',') ? spec.fontFamily : `"${spec.fontFamily}", sans-serif`;
}

/**
 * Canvas font string for the spec at a pixel size. A bare family name gets
 * quoted with a sans-serif fallback; a list (contains a comma) is used
 * verbatim, so a spec can carry a whole stack.
 */
export function getLogoFontString(spec: LogoSpec, px: number): string {
  return `${spec.fontStyle} ${Math.round(px)}px ${logoFontFamily(spec)}`;
}

// ─── Ink-safe box: where lettering can go on an irregular silhouette ─────────

export interface LogoBox { x: number; y: number; w: number; h: number }

// The whole emblem box — the answer for every shape whose outline already IS
// its bounding rectangle. Frozen: callers treat these boxes as read-only.
const FULL_BOX: LogoBox = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

// Grid resolution for the inscribed-rectangle solve. 96² cells is well under a
// millisecond, runs ONCE per outline (cached below), and resolves a notch or a
// torn end to ~1% of the emblem — finer than any sign's rule weight.
const INNER_BOX_GRID = 96;

/** Largest all-inside axis-aligned rectangle of a binary grid (histogram scan). */
function largestInsideRect(inside: Uint8Array, g: number): LogoBox {
  const heights = new Int32Array(g);
  const stackIdx: number[] = [];
  const stackH: number[] = [];
  let bestArea = 0, bx0 = 0, by0 = 0, bx1 = g, by1 = g;
  for (let gy = 0; gy < g; gy++) {
    for (let gx = 0; gx < g; gx++) heights[gx] = inside[gy * g + gx] ? heights[gx] + 1 : 0;
    stackIdx.length = 0;
    stackH.length = 0;
    for (let gx = 0; gx <= g; gx++) {
      const h = gx < g ? heights[gx] : 0;
      let start = gx;
      while (stackH.length && stackH[stackH.length - 1] >= h) {
        const ph = stackH.pop()!;
        const pi = stackIdx.pop()!;
        const area = ph * (gx - pi);
        if (area > bestArea) { bestArea = area; bx0 = pi; bx1 = gx; by0 = gy + 1 - ph; by1 = gy + 1; }
        start = pi;
      }
      stackIdx.push(start);
      stackH.push(h);
    }
  }
  if (!bestArea) return FULL_BOX;
  return { x: bx0 / g, y: by0 / g, w: (bx1 - bx0) / g, h: (by1 - by0) / g };
}

const innerBoxCache = new Map<string, LogoBox>();

/**
 * The largest axis-aligned rectangle that fits INSIDE the emblem outline,
 * normalized to 0..1 of the emblem box — i.e. where ink can safely go on a
 * silhouette that isn't a rectangle.
 *
 * This is what lets a signboard cut to a BRAND'S OWN outline still centre its
 * lettering properly: a notch bitten out of one end, or a ragged end, moves the
 * usable middle, and text centred on the bounding box would sit off-centre in
 * the shape the eye actually reads. Rect-family shapes short-circuit to the
 * full box, so nothing about the house board changes.
 *
 * Pure math (point-in-polygon over the same normalized loops the 2D fill and
 * the 3D extrusion share), solved once per outline and cached.
 */
export function logoShapeInnerBox(spec: LogoSpec): LogoBox {
  switch (spec.shape) {
    // Their outline is the box (a rounded-rect's corners are the only loss,
    // and they hold no lettering) — and 'none' has no outline at all. 'image'
    // only has one when a drop traced its alpha into pathD.
    case 'rect': case 'rounded-rect': case 'none':
      return FULL_BOX;
    case 'image':
      if (!spec.pathD) return FULL_BOX;
      break;
  }
  const key = `${spec.shape}|${spec.pathTiltDeg ?? 0}|${spec.pathD ?? ''}`;
  let box = innerBoxCache.get(key);
  if (box) return box;
  const loops = buildLogoShapePoints(spec);
  if (!loops.length) return FULL_BOX;
  const g = INNER_BOX_GRID;
  const inside = new Uint8Array(g * g);
  for (let gy = 0; gy < g; gy++) {
    const py = (gy + 0.5) / g;
    for (let gx = 0; gx < g; gx++) {
      const px = (gx + 0.5) / g;
      // Even-odd across every loop, so a shape with holes reads its holes.
      let hit = false;
      for (const loop of loops) {
        for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
          const a = loop[i], b = loop[j];
          if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) hit = !hit;
        }
      }
      if (hit) inside[gy * g + gx] = 1;
    }
  }
  box = largestInsideRect(inside, g);
  innerBoxCache.set(key, box);
  return box;
}

// ─── drawLogo ────────────────────────────────────────────────────────────────

export type LogoLayer = 'all' | 'body' | 'text';

export interface DrawLogoOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 'body' and 'text' exist for the double-layered 3D signs (body board
   *  behind, wordmark board in front); 'all' (default) paints both. */
  layer?: LogoLayer;
  /** Replaces mainText — library labels reuse the emblem with the library's
   *  name, drawn horizontal (no tilt) with sub/band/tagline suppressed. */
  textOverride?: string;
  /** Extra whole-emblem rotation in RADIANS (default 0). */
  rotation?: number;
  /** Pinstripe stroke-width multiplier (5 = nominal): the NR-wall boards use
   *  5, the storefront tower 18. Scales both the inset pinstripe and a traced
   *  emblem's own stroked artLayers. */
  pinstripeWidth?: number;
  /** Text-size multiplier: the storefront tower letters ~11% larger than the
   *  interior boards do. Default 1. */
  fontScale?: number;
  /** Text drop shadow; omitted = none (the vector wordmark never had one). */
  shadow?: { color: string; blur: number; ox: number; oy: number };
}

/**
 * Paint the full brand emblem into rect (x,y,w,h) of a 2D canvas. Stateless:
 * saves and restores the context around everything it touches.
 */
export function drawLogo(ctx: CanvasRenderingContext2D, spec: LogoSpec, opts: DrawLogoOpts): void {
  drawGeneric(ctx, spec, opts);
}

// ─── Generic procedural painter (customized specs) ───────────────────────────

// Greedy shrink-to-fit word wrap for arbitrary specs — same algorithm as the
// legacy label fit, parameterized for any box and font.
function fitWrappedText(
  ctx: CanvasRenderingContext2D,
  spec: LogoSpec,
  text: string,
  maxW: number,
  maxH: number,
  maxPx: number,
): { fontSize: number; lines: string[] } {
  const words = text.split(/\s+/);
  const lineSpacing = 1.05;
  const minPx = 14;
  const step = Math.max(2, Math.round(maxPx / 60));
  let best = { fontSize: minPx, lines: [text] };
  for (let fs = Math.round(maxPx); fs >= minPx; fs -= step) {
    ctx.font = getLogoFontString(spec, fs);
    const lines: string[] = [];
    let current = '';
    let fitOk = true;
    for (const w of words) {
      if (ctx.measureText(w).width > maxW) { fitOk = false; break; }
      const test = current ? current + ' ' + w : w;
      if (ctx.measureText(test).width > maxW) {
        if (current) lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    if (fitOk && lines.length * fs * lineSpacing <= maxH) {
      best = { fontSize: fs, lines };
      break;
    }
  }
  return best;
}

// ─── Brand-supplied vector wordmark ──────────────────────────────────────────
// Same job the built-in BB_WORDMARK_PATH_D does for the stock emblem: carry a
// lettering design no installable face reproduces. Bbox comes from the
// flattener; the Path2D itself is added under a matrix so curves stay curves.

const wordmarkBoxCache = new Map<string, { x: number; y: number; w: number; h: number }>();
function wordmarkBox(d: string): { x: number; y: number; w: number; h: number } {
  let box = wordmarkBoxCache.get(d);
  if (!box) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const loop of flattenSvgPath(d)) for (const p of loop) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    box = Number.isFinite(x0)
      ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
      : { x: 0, y: 0, w: 0, h: 0 };
    wordmarkBoxCache.set(d, box);
  }
  return box;
}

/**
 * The em size a fitted vector wordmark stands in for, so subText / band / line
 * placement below keeps using one number whichever way the wordmark was drawn.
 * (Cap height ≈ 0.72 em for the display faces this store sets.)
 */
function fitWordmarkPx(d: string, maxW: number, maxH: number): number {
  const b = wordmarkBox(d);
  if (!b.w || !b.h) return 0;
  return (b.h * Math.min(maxW / b.w, maxH / b.h)) / 0.72;
}

/** Paint the wordmark contained in maxW×maxH, centred on (0, cy). */
function drawWordmarkPath(
  ctx: CanvasRenderingContext2D, d: string, maxW: number, maxH: number, cy: number,
): void {
  const b = wordmarkBox(d);
  if (!b.w || !b.h) return;
  const s = Math.min(maxW / b.w, maxH / b.h);
  const path = new Path2D();
  path.addPath(
    new Path2D(d),
    new DOMMatrix().translate(-(b.x + b.w / 2) * s, cy - (b.y + b.h / 2) * s).scale(s, s),
  );
  ctx.fill(path);
}

/**
 * Paint a traced emblem's extra vector layers (wordmark / pinstripe / ®) into
 * the ew×eh emblem box, through the SAME transform the body silhouette got —
 * see LogoSpec.artLayers. Called with the context already centred on the
 * emblem, so the box's top-left is (-ew/2, -eh/2).
 */
function drawArtLayers(
  ctx: CanvasRenderingContext2D, spec: LogoSpec, layers: LogoArtLayer[], ew: number, eh: number,
): void {
  // Through the SAME fit the body silhouette got, or a contained mark's
  // lettering would still stretch across the full box while the shape it
  // belongs to sits letterboxed inside it.
  const fit = logoShapeFitRect(spec, ew, eh);
  const m = pathSourceMatrix(spec.pathD!, spec.pathTiltDeg ?? 0, fit.w, fit.h);
  const color = (layer: LogoArtLayer) =>
    layer.color ?? (layer.paint === 'body' ? spec.bodyColor
      : layer.paint === 'border' ? spec.borderColor : spec.textColor);
  ctx.save();
  ctx.translate(-ew / 2 + fit.x, -eh / 2 + fit.y);
  for (const layer of layers) {
    if (!layer.d) continue;
    const path = new Path2D();
    path.addPath(new Path2D(layer.d), m);
    if (layer.stroke) {
      ctx.strokeStyle = color({ ...layer, paint: layer.paint ?? 'border' });
      // Authored units scale with the art; the two axes rarely differ much.
      ctx.lineWidth = (layer.strokeWidth ?? 5) * Math.abs(m.a || m.d || 1);
      ctx.stroke(path);
    } else {
      ctx.fillStyle = color(layer);
      ctx.fill(path);
    }
  }
  ctx.restore();
}

function applyShadow(ctx: CanvasRenderingContext2D, opts: DrawLogoOpts): void {
  const sh = opts.shadow ?? { color: 'rgba(0,0,0,0.5)', blur: 8, ox: 3, oy: 4 };
  ctx.shadowColor = sh.color;
  ctx.shadowBlur = sh.blur;
  ctx.shadowOffsetX = sh.ox;
  ctx.shadowOffsetY = sh.oy;
}

// Procedural emblem for customized specs: shape body (seeded torn edge baked
// into the outline), inset pinstripe, auto-fit main text, right-aligned
// subText, rotated bandText, tagline banner. In emblem mode the WHOLE
// composition tilts by -textTilt (the classic badge lean); with textOverride
// (library labels) it stays upright with plain horizontal text, matching how
// the builtin labels behave.
function drawGeneric(ctx: CanvasRenderingContext2D, spec: LogoSpec, opts: DrawLogoOpts): void {
  const layer = opts.layer ?? 'all';
  const wantBody = layer !== 'text';
  const wantText = layer !== 'body';
  const { x, y, w, h } = opts;
  const isLabel = opts.textOverride !== undefined;
  const hasTagline = !isLabel && spec.taglineText !== '';
  const hasSub = !isLabel && spec.subText !== '';
  const tilt = isLabel ? 0 : (-spec.textTilt * Math.PI) / 180;

  // Emblem box: labels get the tall centred card the legacy labels used;
  // emblem textures get a wide band with headroom for the tilt (and the
  // tagline banner below when present).
  const ew = w * (isLabel ? 0.8 : 0.82);
  const eh = h * (isLabel ? 0.55 : hasTagline ? 0.42 : 0.52);
  const ecx = x + w / 2;
  const ecy = y + h / 2 - (hasTagline ? h * 0.07 : 0);
  // 'image' emblems carry their own artwork instead of a filled silhouette.
  const emblemImg = spec.shape === 'image' && spec.imageSrc ? brandImage(spec.imageSrc) : null;
  const shapePath = spec.shape === 'none' || spec.shape === 'image'
    ? null
    : buildLogoShapePath(spec, ew, eh);

  ctx.save();
  ctx.translate(ecx, ecy);
  ctx.rotate(tilt + (opts.rotation ?? 0));

  if (wantBody && shapePath) {
    ctx.save();
    ctx.translate(-ew / 2, -eh / 2);
    ctx.fillStyle = spec.bodyColor;
    ctx.fill(shapePath);
    ctx.restore();
  }

  if (wantBody && emblemImg && emblemImg.width > 0 && emblemImg.height > 0) {
    // Contain, never stretch: brand art with the wrong aspect reads as a
    // rendering fault. Centred in the emblem box, under the text layer.
    const s = Math.min(ew / emblemImg.width, eh / emblemImg.height);
    const iw = emblemImg.width * s;
    const ih = emblemImg.height * s;
    ctx.drawImage(emblemImg, -iw / 2, -ih / 2, iw, ih);
  }

  // A traced emblem's own lettering/pinstripe vectors, in pathD's coordinate
  // space — they stand in for the type layer entirely (labels excepted: those
  // set the LIBRARY's name, not the brand's).
  const artLayers = !isLabel && spec.shape === 'path' && spec.pathD && spec.artLayers?.length
    ? spec.artLayers
    : null;

  if (wantText) {
    if (artLayers) drawArtLayers(ctx, spec, artLayers, ew, eh);
    // Inner pinstripe rides the text layer (like the builtin ticket's, whose
    // border path lives on the yellow board of the double-layered signs). A
    // same-seed shrunk copy of the outline stays parallel to the body edge.
    if (spec.innerBorder && shapePath && !artLayers) {
      const inset = 0.055;
      const iw = ew * (1 - 2 * inset);
      const ih = eh * (1 - 2 * inset);
      ctx.save();
      ctx.translate(-iw / 2, -ih / 2);
      ctx.strokeStyle = spec.borderColor;
      ctx.lineWidth = Math.max(2.5, eh * 0.018) * ((opts.pinstripeWidth ?? 5) / 5);
      ctx.stroke(buildLogoShapePath(spec, iw, ih));
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = (opts.textOverride ?? spec.mainText).toUpperCase().trim();
    const noEmblem = spec.shape === 'none';
    // Round shapes have no full-width band for the text to ride: fit it into
    // the rectangle inscribed in the circle (diameter min(ew,eh)) / ellipse
    // (~1/√2 of each axis) instead, unless textOverflow spills it anyway.
    const overflow = spec.textOverflow && !isLabel;
    let maxW = noEmblem ? w * 0.92 : overflow ? w * 0.96 : ew * 0.84;
    let maxH = noEmblem ? h * 0.6 : eh * (hasSub ? 0.52 : 0.64);
    if (!noEmblem && spec.shape === 'circle') {
      const d = Math.min(ew, eh);
      if (!overflow) maxW = d * 0.74;
      maxH = d * (hasSub ? 0.4 : 0.5);
    } else if (!noEmblem && spec.shape === 'oval') {
      if (!overflow) maxW = ew * 0.7;
      maxH = eh * (hasSub ? 0.38 : 0.48);
    }
    const startPx = (noEmblem ? h * 0.5 : eh * 0.8) * (opts.fontScale ?? 1);
    // A brand-supplied vector wordmark replaces the type entirely. Library
    // labels never use it — they set the LIBRARY's name, not the brand's.
    const wordmarkD = isLabel ? undefined : spec.wordmarkPathD;
    const fitted = wordmarkD
      ? { fontSize: fitWordmarkPx(wordmarkD, maxW, maxH), lines: [text] }
      : fitWrappedText(ctx, spec, text, maxW, maxH, startPx);
    ctx.save();
    applyShadow(ctx, opts);
    ctx.fillStyle = spec.textColor;
    const lineHeight = fitted.fontSize * 1.05;
    // Nudge the main block up a touch when a subText sits under it.
    const blockShift = hasSub ? -eh * 0.09 : 0;
    const startY = blockShift - ((fitted.lines.length - 1) * lineHeight) / 2;
    if (artLayers) {
      // The art already carries the lettering — nothing to type.
    } else if (wordmarkD) {
      drawWordmarkPath(ctx, wordmarkD, maxW, maxH, blockShift);
    } else {
      ctx.font = getLogoFontString(spec, fitted.fontSize);
      fitted.lines.forEach((line, idx) => ctx.fillText(line, 0, startY + idx * lineHeight));
    }

    if (hasSub) {
      // Right-aligned under the wordmark, the classic "…VIDEO" placement.
      const subPx = Math.max(14, fitted.fontSize * 0.4);
      ctx.font = getLogoFontString(spec, subPx);
      ctx.textAlign = 'right';
      const subY = blockShift + ((fitted.lines.length - 1) * lineHeight) / 2 + lineHeight * 0.52 + subPx * 0.62;
      ctx.fillText(spec.subText.toUpperCase(), maxW / 2, subY);
      ctx.textAlign = 'center';
    }
    if (!isLabel && spec.bandText !== '') {
      // Vertical band hugging the emblem's left inside edge.
      const bandPx = Math.max(12, eh * 0.11);
      ctx.save();
      ctx.translate(-ew / 2 + eh * 0.1, 0);
      ctx.rotate(-Math.PI / 2);
      ctx.font = getLogoFontString(spec, bandPx);
      ctx.fillText(spec.bandText.toUpperCase(), 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();

  if (hasTagline) {
    // Banner bar under the emblem: bar on the body layer, lettering on the
    // text layer, so the double-layered signs keep their depth split.
    const tw = ew * 0.94;
    const th = h * 0.12;
    const ty = ecy + eh / 2 + h * 0.035;
    if (wantBody) {
      ctx.save();
      ctx.fillStyle = spec.bodyColor;
      ctx.fillRect(ecx - tw / 2, ty, tw, th);
      ctx.restore();
    }
    if (wantText) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      applyShadow(ctx, opts);
      ctx.fillStyle = spec.textColor;
      const fitted = fitWrappedText(ctx, spec, spec.taglineText.toUpperCase(), tw * 0.92, th, th * 0.62);
      ctx.font = getLogoFontString(spec, fitted.fontSize);
      ctx.fillText(fitted.lines.join(' '), ecx, ty + th / 2);
      ctx.restore();
    }
  }
}
