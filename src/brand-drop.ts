// The SIMPLE DROP tier — "put your logo in a folder and the store wears it".
//
// public/user-assets/brand/ (SINGULAR — the multi-pack tier is brands/<id>/)
// is a well-known folder that needs no setting and no manifest. Drop one file
// in it and the store rebrands on the next boot:
//
//   brand/logo.svg   → the outline becomes the emblem silhouette: it fills the
//                      2D emblem, extrudes into the 3D storefront sign, and
//                      die-cuts every signboard. Any lettering/detail paths in
//                      the same file ride along as artLayers, in the file's own
//                      coordinates, so the lockup lands the way it was drawn.
//   brand/logo.png   → the art itself becomes the emblem, and its ALPHA is
//                      traced (marching squares) into the same silhouette, so
//                      the sign and the extrusion still have a shape to cut to.
//   brand/brand.txt  → optional. First line is the store's name.
//   brand/brand.json → optional. Present = this folder is a full brand pack
//                      (same manifest as brands/<id>/), and nothing here is
//                      synthesized.
//
// WHAT A DROP DOES NOT DO. Colours are sampled from the art for the BRAND
// surfaces — the emblem body/lettering and the livery the signs key off — and
// stop there. The ROOM (walls, carpet, counter tops) keeps the store's own
// palette: a logo is evidence about a logo, not about what colour someone
// painted their walls, and a store repainted from the dominant channel of a
// PNG is how "automatic" becomes "unusable". A brand.json is how you say the
// room changes too.
//
// NO three.js: this runs inside brand-pack.ts's boot load, before the store
// builds. It DOES use the DOM — deliberately, for the SVG route: rather than
// re-implementing path parsing, transform chains and arc flattening, it hands
// the file to the browser's own SVG engine and reads the geometry back through
// getPointAtLength/getCTM. That is the one implementation guaranteed to agree
// with what the user saw in their editor.
import type { LogoArtLayer, LogoSpec } from './logo-spec';
import type { BrandPackManifest } from './brand-pack';

/** The folder, relative to public/user-assets/. */
export const BRAND_DROP_DIR = 'brand';

/** Emblem files probed, in order. First one that loads wins. */
const DROP_LOGO_FILES = ['logo.svg', 'logo.png', 'logo.webp', 'logo.jpg', 'logo.jpeg'];

/** What the detector found, for the settings/service diagnostics. */
export interface BrandDropReport {
  /** The file the identity was synthesized from, e.g. 'logo.svg'. */
  file: string;
  kind: 'svg' | 'image' | 'manifest';
  /** Store name and where it came from. */
  name: string;
  nameFrom: 'brand.txt' | 'bb_logo' | 'filename' | 'default';
  /** Sampled colours, or null when the art gave nothing usable. */
  bodyColor: string | null;
  textColor: string | null;
  /** Silhouette outcome — the honest answer to "did the shape come through?". */
  silhouette: 'outline' | 'alpha-contour' | 'carrier';
  /** Extra vector layers lifted out of an SVG (0 for a raster drop). */
  artLayers: number;
  /** Anything the user should know: 'no alpha to trace', 'no paths found'. */
  notes: string[];
}

let report: BrandDropReport | null = null;

/** The last detection's report, or null when no drop was found. */
export function brandDropReport(): BrandDropReport | null {
  return report;
}

// ─── Small colour helpers ────────────────────────────────────────────────────

function toHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Parse '#rgb' / '#rrggbb' / 'rgb(r,g,b)' into [r,g,b], or null. */
function parseColor(css: string | null): [number, number, number] | null {
  if (!css) return null;
  const s = css.trim().toLowerCase();
  if (s === 'none' || s === 'transparent' || s === 'currentcolor') return null;
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [a, b, c] = m[1];
    return [parseInt(a + a, 16), parseInt(b + b, 16), parseInt(c + c, 16)];
  }
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  return null;
}

/** Relative luminance (sRGB, 0..1) — the contrast axis we rank on. */
function luma(c: [number, number, number]): number {
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ─── Fetch helpers (a miss is the normal case and must stay silent) ──────────

async function fetchDropText(assetUrlFor: (p: string) => string, file: string): Promise<string | null> {
  try {
    const res = await fetch(assetUrlFor(`${BRAND_DROP_DIR}/${file}`));
    if (!res.ok) return null;
    const text = await res.text();
    // A dev/preview server with an SPA fallback answers a missing file with
    // index.html and a 200 — same trap brand-pack.ts documents.
    if (/^\s*<(?:!doctype\s+html|html)\b/i.test(text.trim())) return null;
    return text;
  } catch {
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ─── SVG route: let the browser's own path engine do the geometry ───────────

interface SampledShape {
  d: string;                       // polyline path data, in the SVG's viewport units
  area: number;                    // bbox area, for picking the silhouette
  fill: [number, number, number] | null;
}

/**
 * Every drawable in the SVG, flattened to polylines in the ROOT viewport's
 * coordinates (element transforms applied via getCTM). Uses
 * getTotalLength/getPointAtLength, which SVGGeometryElement implements for
 * path/rect/circle/ellipse/polygon/polyline/line alike — so arcs, quadratics
 * and nested transform chains all come out correct without a parser here.
 */
function sampleSvgShapes(svgText: string): SampledShape[] {
  if (typeof document === 'undefined') return [];
  const host = document.createElement('div');
  // Off-screen but LAID OUT: getCTM/getTotalLength need a rendered tree.
  host.setAttribute('style', 'position:absolute;left:-99999px;top:0;width:1024px;height:1024px;opacity:0;pointer-events:none');
  host.innerHTML = svgText;
  const svg = host.querySelector('svg');
  if (!svg) return [];
  svg.setAttribute('width', '1024');
  svg.setAttribute('height', '1024');
  document.body.appendChild(host);
  const out: SampledShape[] = [];
  try {
    const els = svg.querySelectorAll<SVGGeometryElement>('path,rect,circle,ellipse,polygon,polyline,line');
    for (const el of Array.from(els)) {
      let len = 0;
      try { len = el.getTotalLength(); } catch { continue; }
      if (!(len > 0)) continue;
      const box = el.getBBox();
      if (!(box.width > 0) && !(box.height > 0)) continue;
      const ctm = el.getCTM();
      // Sample density: enough that a 1024-unit circle stays smooth, capped so
      // a hairy trace can't balloon the manifest.
      const steps = Math.max(24, Math.min(320, Math.round(len / 3)));
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const p = el.getPointAtLength((len * i) / steps);
        const x = ctm ? ctm.a * p.x + ctm.c * p.y + ctm.e : p.x;
        const y = ctm ? ctm.b * p.x + ctm.d * p.y + ctm.f : p.y;
        d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      }
      d += 'Z';
      const style = getComputedStyle(el);
      const fill = parseColor(el.getAttribute('fill') ?? style.fill);
      // Transformed bbox area: what the shape covers on the page, which is the
      // right ranking for "which of these is the body".
      const sx = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
      const sy = ctm ? Math.hypot(ctm.c, ctm.d) : 1;
      out.push({ d, area: box.width * sx * box.height * sy, fill });
    }
  } finally {
    host.remove();
  }
  return out;
}

// ─── Raster route: trace the alpha channel ──────────────────────────────────

/**
 * The outer contour of an image's opaque region as SVG path data in pixel
 * coordinates, or null when there is nothing to trace (a fully opaque photo,
 * or art too sparse to read). Marching squares over a downsampled alpha grid,
 * then Douglas-Peucker to a manageable point count.
 */
function traceAlphaContour(img: HTMLImageElement): { d: string; w: number; h: number } | null {
  const long = Math.max(img.width, img.height);
  if (!long) return null;
  const s = Math.min(1, 160 / long);
  const w = Math.max(2, Math.round(img.width * s));
  const h = Math.max(2, Math.round(img.height * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return null; }

  // 1-cell transparent apron so a shape touching the edge still closes.
  const gw = w + 2, gh = h + 2;
  const on = new Uint8Array(gw * gh);
  let opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 128) { on[(y + 1) * gw + (x + 1)] = 1; opaque++; }
    }
  }
  const cover = opaque / (w * h);
  // Effectively opaque = no silhouette in the file (it's a rectangle), and
  // near-empty = nothing we could honestly cut a sign to.
  if (cover > 0.97 || cover < 0.01) return null;

  // Marching squares on the cell corners: walk the boundary of the largest
  // opaque blob. Start at the topmost-leftmost boundary cell.
  let sx = -1, sy = -1;
  outer: for (let y = 1; y < gh && sy < 0; y++) {
    for (let x = 1; x < gw; x++) {
      if (on[y * gw + x]) { sx = x; sy = y; break outer; }
    }
  }
  if (sx < 0) return null;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= gw || y >= gh ? 0 : on[y * gw + x]);
  const pts: { x: number; y: number }[] = [];
  let cx = sx, cy = sy;
  let dx = 0, dy = 0;
  const MAX_STEPS = gw * gh * 4;
  let closed = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    // Case index from the 2x2 cell square whose bottom-right cell is (cx,cy).
    const idx = at(cx - 1, cy - 1) | (at(cx, cy - 1) << 1) | (at(cx - 1, cy) << 2) | (at(cx, cy) << 3);
    const pdx = dx, pdy = dy;
    switch (idx) {
      case 1: case 5: case 13: dx = 0; dy = -1; break;   // up
      case 2: case 3: case 7: dx = 1; dy = 0; break;     // right
      case 4: case 12: case 14: dx = -1; dy = 0; break;  // left
      case 8: case 10: case 11: dx = 0; dy = 1; break;   // down
      // Saddles: resolve by where we came from, so the walk stays on one loop
      // instead of hopping to the diagonal neighbour's boundary.
      case 6: dx = pdy === -1 ? -1 : 1; dy = 0; break;
      case 9: dy = pdx === 1 ? -1 : 1; dx = 0; break;
      default: return null; // 0 or 15: not on a boundary — bad start
    }
    pts.push({ x: cx - 1, y: cy - 1 });
    cx += dx; cy += dy;
    if (cx === sx && cy === sy) { closed = true; break; }
  }
  if (!closed || pts.length < 8) return null;

  // Douglas-Peucker down to a workable outline (the flattener and the 3D
  // extruder both prefer a few hundred points to a few thousand).
  const simplified = simplify(pts, Math.max(0.6, long * 0.0015 * s));
  if (simplified.length < 6) return null;
  const scale = 1 / s; // back to the source image's own pixel coordinates
  let d = '';
  simplified.forEach((p, i) => {
    d += `${i === 0 ? 'M' : 'L'}${(p.x * scale).toFixed(1)} ${(p.y * scale).toFixed(1)}`;
  });
  return { d: d + 'Z', w: img.width, h: img.height };
}

function simplify(pts: { x: number; y: number }[], tol: number): { x: number; y: number }[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const a = pts[i0], b = pts[i1];
    const ax = b.x - a.x, ay = b.y - a.y;
    const len = Math.hypot(ax, ay) || 1;
    let far = -1, farD = tol;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((pts[i].x - a.x) * ay - (pts[i].y - a.y) * ax) / len;
      if (d > farD) { farD = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([i0, far], [far, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Dominant + highest-contrast colours of an image's opaque pixels. */
function sampleImageColors(img: HTMLImageElement): { body: string | null; text: string | null } {
  const long = Math.max(img.width, img.height);
  const s = Math.min(1, 96 / (long || 1));
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { body: null, text: null };
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return { body: null, text: null }; }
  // Coarse 4-bit-per-channel histogram: enough to find the two inks a logo
  // actually uses without chasing antialiasing noise.
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key);
    if (e) { e.n++; e.r += r; e.g += g; e.b += b; }
    else bins.set(key, { n: 1, r, g, b });
  }
  return pickInks([...bins.values()].map((e) => ({
    n: e.n, c: [e.r / e.n, e.g / e.n, e.b / e.n] as [number, number, number],
  })));
}

/**
 * From weighted colour clusters: the heaviest is the body; the lettering is
 * the heaviest cluster that is far enough away in colour AND clearly separated
 * in luminance. Conservative on purpose — a logo with one ink gets one ink,
 * and the store keeps its own for the other slot rather than inventing a
 * contrast partner out of an antialiasing fringe.
 */
function pickInks(clusters: { n: number; c: [number, number, number] }[]): { body: string | null; text: string | null } {
  if (!clusters.length) return { body: null, text: null };
  clusters.sort((a, b) => b.n - a.n);
  const total = clusters.reduce((s, c) => s + c.n, 0);
  const body = clusters[0];
  let text: typeof body | null = null;
  for (const cand of clusters) {
    if (cand === body) continue;
    if (cand.n < total * 0.02) break;                 // below 2% it's a fringe
    if (colorDistance(cand.c, body.c) < 90) continue; // too close to be the other ink
    if (Math.abs(luma(cand.c) - luma(body.c)) < 0.18) continue;
    text = cand;
    break;
  }
  return {
    body: toHex(body.c[0], body.c[1], body.c[2]),
    text: text ? toHex(text.c[0], text.c[1], text.c[2]) : null,
  };
}

// ─── Name ────────────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Look for a simple drop and synthesize a manifest from it, or return null.
 * `assetUrlFor` maps a user-assets-relative path to a fetchable URL (the
 * caller owns Vite's base-URL rule).
 *
 * Never throws and never rejects: no folder is the overwhelmingly common case
 * and must cost exactly one 404.
 */
export async function detectBrandDrop(
  assetUrlFor: (p: string) => string,
): Promise<{ manifest: BrandPackManifest; report: BrandDropReport } | null> {
  report = null;
  if (typeof fetch === 'undefined') return null;

  // A brand.json in the drop folder means "this IS a pack" — hand it back
  // whole and synthesize nothing.
  const manifestText = await fetchDropText(assetUrlFor, 'brand.json');
  if (manifestText) {
    try {
      const parsed = JSON.parse(manifestText) as BrandPackManifest;
      const rep: BrandDropReport = {
        file: 'brand.json', kind: 'manifest',
        name: parsed.displayName ?? parsed.name ?? 'brand',
        nameFrom: 'default', bodyColor: null, textColor: null,
        silhouette: parsed.logo?.pathD ? 'outline' : 'carrier',
        artLayers: parsed.logo?.artLayers?.length ?? 0,
        notes: ['full manifest — nothing synthesized'],
      };
      report = rep;
      return { manifest: parsed, report: rep };
    } catch {
      // Fall through to the art probe: a broken brand.json shouldn't hide a
      // perfectly good logo.svg sitting beside it.
    }
  }

  // Which art file is in there? Every candidate is probed AT ONCE — the common
  // case is that none of them exist, and paying five sequential round trips on
  // every boot to learn that is not a thing to do to a store that opens in
  // under a second. brand.txt rides along in the same batch.
  const probes = DROP_LOGO_FILES.map((cand) => (cand.endsWith('.svg')
    ? fetchDropText(assetUrlFor, cand).then((t) => (t && /<svg[\s>]/i.test(t) ? { cand, svg: t } : null))
    : loadImage(assetUrlFor(`${BRAND_DROP_DIR}/${cand}`)).then((i) => (i && i.width > 0 ? { cand, img: i } : null))));
  const nameProbe = fetchDropText(assetUrlFor, 'brand.txt');
  const found = (await Promise.all(probes)).find((r) => r !== null) as
    { cand: string; svg?: string; img?: HTMLImageElement } | undefined;
  if (!found) return null;
  const file: string = found.cand;
  const svgText: string | null = found.svg ?? null;
  const img: HTMLImageElement | null = found.img ?? null;

  const notes: string[] = [];
  const nameText = await nameProbe;
  const savedMain = readSavedMainText();
  const base = file.replace(/\.[^.]+$/, '');
  let name: string;
  let nameFrom: BrandDropReport['nameFrom'];
  const txtLine = nameText?.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? null;
  if (txtLine) { name = txtLine; nameFrom = 'brand.txt'; }
  else if (savedMain) { name = savedMain; nameFrom = 'bb_logo'; }
  else if (base.toLowerCase() !== 'logo') { name = titleCase(base); nameFrom = 'filename'; }
  else {
    // 'logo.svg' says nothing about the store's name, so the committed one
    // stands. brand.txt is the one-line fix, and the diagnostic says so.
    name = '';
    nameFrom = 'default';
    notes.push("no brand.txt — the store keeps its own name (one line in brand/brand.txt renames it)");
  }

  const logo: Partial<LogoSpec> = {};
  let silhouette: BrandDropReport['silhouette'] = 'carrier';
  let bodyColor: string | null = null;
  let textColor: string | null = null;
  let artLayers = 0;

  if (svgText) {
    const shapes = sampleSvgShapes(svgText);
    if (!shapes.length) {
      notes.push('no drawable geometry in the SVG — using a plain board');
    } else {
      // The biggest drawable is the body; everything else is lettering/detail
      // riding in the SAME coordinate space (LogoSpec.artLayers), which is how
      // a lockup keeps its own proportions instead of being re-fitted.
      shapes.sort((a, b) => b.area - a.area);
      const bodyShape = shapes[0];
      logo.shape = 'path';
      logo.pathD = bodyShape.d;
      logo.pathTiltDeg = 0;
      // A dropped file is a MARK, not a sign blank: keep the proportions the
      // user drew rather than stretching them onto each surface's box.
      logo.pathFit = 'contain';
      silhouette = 'outline';
      const inks = pickInks(shapes.map((s) => ({
        n: Math.max(1, Math.round(s.area)), c: s.fill ?? [0, 0, 0],
      })).filter((s) => s.c));
      bodyColor = bodyShape.fill ? toHex(...bodyShape.fill) : inks.body;
      const rest = shapes.slice(1);
      // Lettering colour: the biggest non-body fill that actually contrasts.
      const bodyRgb = bodyShape.fill ?? parseColor(bodyColor);
      for (const s of rest) {
        if (!s.fill || !bodyRgb) continue;
        if (colorDistance(s.fill, bodyRgb) < 60) continue;
        textColor = toHex(...s.fill);
        break;
      }
      if (rest.length) {
        // Each layer keeps its OWN ink. A dropped logo routinely has more
        // colours than the spec's three slots, and re-tinting a beak or a
        // highlight to "the lettering colour" is how a faithful trace turns
        // into a wrong drawing.
        const layers: LogoArtLayer[] = rest.slice(0, 64).map((s) => ({
          d: s.d,
          ...(s.fill ? { color: toHex(...s.fill) } : {}),
          paint: s.fill && bodyRgb && colorDistance(s.fill, bodyRgb) < 60 ? 'body' as const : 'text' as const,
        }));
        logo.artLayers = layers;
        artLayers = layers.length;
      }
    }
  } else if (img) {
    logo.shape = 'image';
    logo.imageSrc = file;
    // The art carries its own lettering; typing the store's name over it would
    // print the name twice.
    logo.mainText = '';
    logo.subText = '';
    const contour = traceAlphaContour(img);
    if (contour) {
      logo.pathD = contour.d;
      logo.pathTiltDeg = 0;
      logo.pathFit = 'contain';
      silhouette = 'alpha-contour';
    } else {
      notes.push('no alpha to trace — signs and the 3D sign use a plain board carrier');
    }
    const inks = sampleImageColors(img);
    bodyColor = inks.body;
    textColor = inks.text;
  }

  if (bodyColor) logo.bodyColor = bodyColor;
  if (textColor) { logo.textColor = textColor; logo.borderColor = textColor; }
  if (name && logo.mainText !== '') logo.mainText = name.toUpperCase();

  const manifest: BrandPackManifest = {
    version: 1,
    id: BRAND_DROP_DIR,
    ...(name ? { name, displayName: name } : {}),
    logo,
    // The LIVERY the signs key off follows the drop; the ROOM does not. See
    // the module header — this split is the whole design.
    ...(bodyColor || textColor
      ? {
        palette: {
          ...(bodyColor ? { primary: bodyColor } : {}),
          ...(textColor ? { secondary: textColor, accent: textColor } : {}),
        },
      }
      : {}),
    ...(name ? { strings: nameStrings(name) } : {}),
  };

  const rep: BrandDropReport = {
    file, kind: svgText ? 'svg' : 'image', name: name || '(store default)', nameFrom,
    bodyColor, textColor, silhouette, artLayers, notes,
  };
  report = rep;
  return { manifest, report: rep };
}

/**
 * The rendered strings a NAME alone can honestly fill in. Only the ones where
 * the store's name is the entire variable — the POS header, the titlebar, the
 * clerk's hello, the exit prompt. Anything with real copy in it (taglines,
 * house rules, the wrap's address block) keeps the committed wording: a drop
 * knows what the store is called, not what it says.
 */
function nameStrings(name: string): Record<string, string> {
  const caps = name.toUpperCase();
  return {
    'brand-wordmark': caps,
    'brand-wordmark-video': caps,
    'app-titlebar-brand': caps,
    'pos-system-title': `${caps} RENTAL SYSTEM`,
    'exit-confirm-prompt': `CLOSE ${caps} AND RETURN TO THE SYSTEM?`,
    'app-closing-log': `Closing ${name} app...`,
    'clerk-greeting': `Hey there! Welcome to ${name}. What can I help you find?`,
    'flat-title': `${caps}  STREAMING`,
  };
}

function readSavedMainText(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem('bb_logo');
  if (!raw) return null;
  try {
    const spec = JSON.parse(raw) as Partial<LogoSpec>;
    return typeof spec.mainText === 'string' && spec.mainText.trim() ? spec.mainText.trim() : null;
  } catch {
    return null;
  }
}
