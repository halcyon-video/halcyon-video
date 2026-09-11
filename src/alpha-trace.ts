// Alpha-field contour tracing: turn what a canvas DREW into the outline of
// what it drew.
//
// This is the bridge between "art" and "geometry" in the brand pipeline. A
// composition — a traced glyph, a user's layered emblem — exists first as
// pixels, and the store needs it as POLYGONS: to extrude the storefront sign,
// to die-cut a signboard, to solve an ink-safe box. Marching squares with
// sub-pixel crossings is what carries it across, and the same routine has to
// serve both callers or the sign and the letters beside it disagree about
// where an edge is.
//
// Written for logo-storefront.ts's freestanding letters (glyph outlines with
// their counters); lifted here unchanged in behaviour when the emblem composer
// (src/emblem-render.ts) needed exactly the same thing for a whole layered
// composition. Pure math over a Float32Array — no DOM, no three.js, so it is
// node-testable and cheap to reason about.
//
// Everything here runs at BUILD time (boot, or a brand edit), never per frame.

export interface TracePoint { x: number; y: number }

/** One outer contour and the counter holes that fall inside it. */
export interface NestedLoop { outer: TracePoint[]; holes: TracePoint[][] }

/** Inside/outside threshold on an 0..255 alpha channel. */
export const ALPHA_THRESHOLD = 127.5;

/**
 * Marching squares over an alpha field, returning every closed contour.
 *
 * Segments are emitted per cell between INTERPOLATED edge crossings and keyed
 * by the grid edge they end on, so chaining is exact (no float matching):
 * every crossed edge is shared by exactly two segments, which makes the
 * segment graph a set of disjoint cycles. The interpolation is what keeps a
 * traced curve smooth instead of stairstepped at the grid pitch.
 *
 * The caller must leave a fully-transparent apron around the art, and clip the
 * art to sit inside it — a contour that runs off the edge of the grid cannot
 * close, and is dropped.
 *
 * ORIENTATION IS NOT MEANINGFUL on the way out. Each loop is chained from an
 * arbitrary end of an arbitrary starting segment, so which way round a contour
 * comes is chance. Callers that hand holes to three.js as explicit THREE.Path
 * objects (nestLoops) never care; anything emitting ONE path and leaning on the
 * nonzero rule must state the winding itself with orientLoop().
 */
export function traceAlphaContours(
  alpha: Float32Array, w: number, h: number, threshold = ALPHA_THRESHOLD,
): TracePoint[][] {
  const at = (x: number, y: number) => alpha[y * w + x];
  const inside = (v: number) => v >= threshold;
  // Crossing points, computed once per grid edge so neighbours agree exactly.
  const crossings = new Map<string, TracePoint>();
  const crossH = (x: number, y: number): string => {
    const key = `h${x},${y}`;
    if (!crossings.has(key)) {
      const a = at(x, y), b = at(x + 1, y);
      crossings.set(key, { x: x + (threshold - a) / (b - a), y });
    }
    return key;
  };
  const crossV = (x: number, y: number): string => {
    const key = `v${x},${y}`;
    if (!crossings.has(key)) {
      const a = at(x, y), b = at(x, y + 1);
      crossings.set(key, { x, y: y + (threshold - a) / (b - a) });
    }
    return key;
  };

  const segs: { a: string; b: string }[] = [];
  const byEdge = new Map<string, number[]>();
  const addSeg = (a: string, b: string) => {
    const idx = segs.length;
    segs.push({ a, b });
    (byEdge.get(a) ?? byEdge.set(a, []).get(a)!).push(idx);
    (byEdge.get(b) ?? byEdge.set(b, []).get(b)!).push(idx);
  };

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const v0 = at(x, y), v1 = at(x + 1, y), v2 = at(x + 1, y + 1), v3 = at(x, y + 1);
      const mask = (inside(v0) ? 1 : 0) | (inside(v1) ? 2 : 0) | (inside(v2) ? 4 : 0) | (inside(v3) ? 8 : 0);
      if (mask === 0 || mask === 15) continue;
      const T = () => crossH(x, y), B = () => crossH(x, y + 1);
      const L = () => crossV(x, y), R = () => crossV(x + 1, y);
      switch (mask) {
        case 1: case 14: addSeg(T(), L()); break;
        case 2: case 13: addSeg(T(), R()); break;
        case 3: case 12: addSeg(L(), R()); break;
        case 4: case 11: addSeg(R(), B()); break;
        case 6: case 9: addSeg(T(), B()); break;
        case 7: case 8: addSeg(B(), L()); break;
        case 5: // TL+BR inside: split by the cell-centre average
          if ((v0 + v1 + v2 + v3) / 4 >= threshold) { addSeg(T(), R()); addSeg(B(), L()); }
          else { addSeg(T(), L()); addSeg(R(), B()); }
          break;
        case 10: // TR+BL inside
          if ((v0 + v1 + v2 + v3) / 4 >= threshold) { addSeg(T(), L()); addSeg(R(), B()); }
          else { addSeg(T(), R()); addSeg(B(), L()); }
          break;
      }
    }
  }

  // Chain the degree-2 edge graph into closed loops.
  //
  // A loop is CLOSED when the walk arrives back at the segment it started
  // from. Anything else is an open polyline — which happens when ink runs off
  // the edge of the grid, so the boundary has nowhere to come back along — and
  // it is DROPPED rather than closed with a chord. That chord is not a
  // harmless approximation: it is a straight line across the middle of the
  // shape, and it cost a storefront sign half its silhouette before this
  // check existed. A caller that finds its outline missing has clipped or
  // padded its raster wrong, which is a fixable mistake; a caller handed a
  // shape sliced in half has a mystery.
  const visited = new Uint8Array(segs.length);
  const loops: TracePoint[][] = [];
  for (let s = 0; s < segs.length; s++) {
    if (visited[s]) continue;
    const pts: TracePoint[] = [];
    let cur = s;
    let edge = segs[s].a;
    let closed = false;
    for (;;) {
      visited[cur] = 1;
      pts.push(crossings.get(edge)!);
      const nextEdge = segs[cur].a === edge ? segs[cur].b : segs[cur].a;
      const cands = byEdge.get(nextEdge) ?? [];
      const next = cands[0] === cur ? cands[1] : cands[0];
      if (next === undefined) break;          // ran off the grid: open
      if (visited[next]) {
        closed = next === s;
        break;
      }
      edge = nextEdge;
      cur = next;
    }
    if (closed && pts.length >= 3) loops.push(pts);
  }
  return loops;
}

/**
 * Douglas-Peucker on a CLOSED loop (split at two far-apart anchors so the
 * closure itself can't be simplified away).
 */
export function simplifyLoop(pts: TracePoint[], eps: number): TracePoint[] {
  if (pts.length <= 4) return pts;
  const dp = (arr: TracePoint[], lo: number, hi: number, out: TracePoint[]) => {
    if (hi - lo < 2) return;
    const A = arr[lo], B = arr[hi];
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    let maxD = -1, maxI = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = Math.abs((arr[i].x - A.x) * dy - (arr[i].y - A.y) * dx) / len;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      dp(arr, lo, maxI, out);
      out.push(arr[maxI]);
      dp(arr, maxI, hi, out);
    }
  };
  const mid = Math.floor(pts.length / 2);
  const half1 = pts.slice(0, mid + 1);
  const half2 = pts.slice(mid).concat([pts[0]]);
  const out: TracePoint[] = [pts[0]];
  dp(half1, 0, half1.length - 1, out);
  out.push(pts[mid]);
  dp(half2, 0, half2.length - 1, out);
  return out.length >= 3 ? out : pts;
}

/** Even-odd point-in-polygon over one loop. */
export function pointInLoop(p: TracePoint, loop: TracePoint[]): boolean {
  let in_ = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      in_ = !in_;
    }
  }
  return in_;
}

/** Unsigned polygon area (shoelace). */
export function loopArea(loop: TracePoint[]): number {
  return Math.abs(signedLoopArea(loop));
}

/**
 * Signed polygon area. The SIGN is the winding, which is the fill rule: under
 * canvas's (and three.js's extruder's) default nonzero winding, a hole only
 * reads as a hole when it is wound against the outline containing it.
 */
export function signedLoopArea(loop: TracePoint[]): number {
  let s = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    s += loop[j].x * loop[i].y - loop[i].x * loop[j].y;
  }
  return s / 2;
}

/**
 * Return the loop wound the requested way (+1 / -1 by signed area), reversing
 * it only when it isn't already.
 *
 * Marching squares does NOT give a consistent orientation: which way a contour
 * comes out depends on which end of an arbitrary starting segment the chaining
 * happened to begin at. Callers that hand holes to three.js as explicit
 * THREE.Path objects never notice, but anything that emits ONE path and relies
 * on the nonzero rule — an SVG `pathD`, a Path2D fill — has to say so.
 */
export function orientLoop(loop: TracePoint[], sign: 1 | -1): TracePoint[] {
  const area = signedLoopArea(loop);
  if (area === 0) return loop;
  return (area > 0 ? 1 : -1) === sign ? loop : loop.slice().reverse();
}

/**
 * Parse an SVG path data string into discrete polygon point loops, preserving
 * multiple subpaths (e.g. multi-contour letters, disjoint elements, and holes).
 */
export function flattenSvgPath(d: string, curveSegs = 16): TracePoint[][] {
  const tokens = d.match(/[a-df-zA-DF-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE]-?\d+)?/g) ?? [];
  const loops: TracePoint[][] = [];
  let pts: TracePoint[] = [];
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
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) i++;
    }
  }
  if (pts.length > 1) loops.push(pts);
  return loops;
}

/**
 * Test whether `inner` loop is contained inside `outer` loop.
 * Samples multiple vertices of `inner` to avoid false negatives from ray-vertex
 * coincidences or precision issues on boundary tests.
 */
export function isLoopInside(inner: TracePoint[], outer: TracePoint[]): boolean {
  if (inner.length === 0 || outer.length === 0) return false;
  const samples = Math.min(5, inner.length);
  const step = Math.max(1, Math.floor(inner.length / samples));
  let inCount = 0;
  let tested = 0;
  for (let k = 0; k < inner.length && tested < samples; k += step) {
    if (pointInLoop(inner[k], outer)) inCount++;
    tested++;
  }
  return inCount > tested / 2;
}

/**
 * Sort traced contours into outers and the holes that belong to each.
 *
 * Containment nesting: even depth = outer outline, odd depth = counter hole,
 * assigned to its SMALLEST containing outer (so a hole inside an island inside
 * a hole lands on the island). Contours from marching squares are disjoint, so
 * testing vertices across the candidate loop is robust.
 *
 * This is what three.js needs — THREE.Shape carries its holes as separate
 * THREE.Path objects, and a hole handed over as a sibling shape extrudes as a
 * solid plug instead of a window.
 */
export function nestLoops(loops: TracePoint[][]): NestedLoop[] {
  const depths = loops.map((loop, i) => {
    let d = 0;
    for (let j = 0; j < loops.length; j++) {
      if (i !== j && isLoopInside(loop, loops[j])) d++;
    }
    return d;
  });
  const outers: NestedLoop[] = [];
  const outerIdx = new Map<number, number>();
  loops.forEach((loop, i) => {
    if (depths[i] % 2 === 0) {
      outerIdx.set(i, outers.length);
      outers.push({ outer: loop, holes: [] });
    }
  });
  loops.forEach((loop, i) => {
    if (depths[i] % 2 !== 1) return;
    let best = -1, bestArea = Infinity;
    loops.forEach((cand, j) => {
      if (depths[j] % 2 === 0 && isLoopInside(loop, cand)) {
        const a = loopArea(cand);
        if (a < bestArea) { bestArea = a; best = j; }
      }
    });
    if (best < 0) {
      // Fallback: check pointInLoop for any vertex if sample test was ambiguous
      loops.forEach((cand, j) => {
        if (depths[j] % 2 === 0 && loop.some((p) => pointInLoop(p, cand))) {
          const a = loopArea(cand);
          if (a < bestArea) { bestArea = a; best = j; }
        }
      });
    }
    if (best >= 0 && outerIdx.has(best)) {
      outers[outerIdx.get(best)!].holes.push(loop);
    }
  });
  return outers;
}

/**
 * Read a canvas's alpha channel into the Float32Array traceAlphaContours
 * wants. Returns null when the canvas is tainted, empty, or has no ink —
 * i.e. when there is honestly no silhouette in it.
 *
 * The DOM touch is deliberately confined to this one function so the tracing
 * math above stays pure.
 */
export function canvasAlphaField(
  canvas: HTMLCanvasElement, threshold = ALPHA_THRESHOLD,
): { alpha: Float32Array; w: number; h: number } | null {
  const w = canvas.width, h = canvas.height;
  if (w < 3 || h < 3) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return null; }
  const alpha = new Float32Array(w * h);
  let ink = 0;
  for (let i = 0; i < alpha.length; i++) {
    const a = data[i * 4 + 3];
    alpha[i] = a;
    if (a >= threshold) ink++;
  }
  return ink > 0 ? { alpha, w, h } : null;
}
