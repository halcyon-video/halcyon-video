// The EMBLEM DOCUMENT — a store logo composed from layered primitive shapes.
//
// The brand pipeline already had two ways in: hand-write a LogoSpec (a shape
// from a fixed menu plus a wordmark), or bring artwork from outside (a brand
// pack's traced `pathD`, or a PNG dropped in user-assets/brand/). Both ends
// assume you already HAVE a logo. This is the middle: build one, in the store,
// out of rectangles, ovals, wedges, stars, rings and type — the way a
// mid-2000s game emblem editor works — and flatten the result into the brand.
//
// The document is the AUTHORED form and the only thing persisted. Everything
// downstream (the emblem silhouette, the extruded storefront sign, the
// die-cut signboards) is DERIVED from it at resolve time by src/emblem-render.ts,
// so a doc that survives a version bump keeps working even if the derivation
// changes. See src/logo-spec.ts for where it enters the LogoSpec chain.
//
// PURE DATA AND PURE MATH — no DOM, no canvas, no three.js. Layer geometry is
// emitted as SVG path data by emblemLayerPathD() so the same outline serves the
// painter (Path2D), the silhouette tracer and a node unit test. Text is the one
// kind with no analytic outline: it has none here, and the renderer's raster
// pass is what carries it into the silhouette.
//
// COORDINATE SPACE. Layers are normalized: cx/cy/w/h are fractions of the
// design box, which keeps a doc resolution-independent and aspect-editable.
// emblemLayerPathD() maps them onto a concrete W×H authored box — the same box
// the renderer paints into and `pathD` is expressed in.

export type EmblemLayerKind =
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'wedge'
  | 'star'
  | 'polygon'
  | 'ring'
  | 'chevron'
  | 'banner'
  | 'text';

/**
 * Which ink paints a layer. The three named slots track the BRAND (a theme
 * switch or a colour edit moves them), which is what keeps a composed emblem
 * part of the identity rather than a frozen picture of one; 'custom' is the
 * escape hatch for art that needs a colour the three slots don't carry.
 */
export type EmblemInk = 'body' | 'text' | 'border' | 'custom';

/**
 * What a layer does to the OUTLINE — the emblem's silhouette, which is the
 * physical shape of the sign, not just a mask on artwork.
 *
 *   'solid' — part of the sign. Adds to the silhouette.
 *   'hole'  — a window cut clean through it. Erases from the silhouette AND
 *             from the art, so empty stays empty.
 *   'ink'   — printed ON the sign: a pinstripe, a wordmark, a detail. Paints,
 *             but never changes the shape that gets cut or extruded.
 *
 * The default for shapes is 'solid' and for text 'ink' — lettering that
 * ragged-edges the whole storefront sign is almost never what someone means,
 * and 'solid' is one row away when it is.
 */
export type EmblemRole = 'solid' | 'hole' | 'ink';

export interface EmblemLayer {
  /** Stable within a doc; used as the editor's selection key. */
  id: string;
  kind: EmblemLayerKind;
  /** Centre, as a fraction of the design box (0..1, y down). */
  cx: number;
  cy: number;
  /** Size, as a fraction of the design box. For text: em size (h) and max width (w). */
  w: number;
  h: number;
  /** Degrees, clockwise about the layer's own centre. */
  rot: number;
  ink: EmblemInk;
  /** CSS colour, used when `ink` is 'custom'. */
  color: string;
  /** 0..1. Composites over whatever the layer sits on. */
  alpha: number;
  role: EmblemRole;
  /** Kind-specific parameter A — see EMBLEM_KIND_SPECS. */
  detail: number;
  /** Kind-specific parameter B — see EMBLEM_KIND_SPECS. */
  detail2: number;
  /** kind 'text' only. */
  text?: string;
  /** kind 'text' only: a family name from the brand font picker. */
  fontFamily?: string;
}

export interface EmblemDoc {
  version: 1;
  /** Off = the doc is kept but the store wears its normal brand. */
  enabled: boolean;
  /** Design box width : height. 1 = square, 3 = a wide badge. */
  aspect: number;
  /** Whole-emblem lean in degrees, the classic video-store rake. */
  tilt: number;
  /**
   * Print the store's own wordmark (LogoSpec.mainText, auto-fitted to the
   * silhouette's ink-safe box) over the composition. On by default: a shape
   * with no name on it is a symbol, not a store's sign, and adding a text
   * layer is how you take this over yourself.
   */
  wordmark: boolean;
  layers: EmblemLayer[];
}

// ─── Kind table: what each primitive's two detail knobs mean ────────────────
// The editor is generated from this — a new primitive is a row here plus a
// case in emblemLayerPathD(), and it appears in the UI with correct labels,
// ranges and defaults. No UI code changes.

export interface EmblemDetailSpec {
  label: string;
  min: number;
  max: number;
  step: number;
  /** Step size for one remote Left/Right press (sliders are fiddly at range). */
  navStep: number;
  unit?: string;
}

export interface EmblemKindSpec {
  label: string;
  detail?: EmblemDetailSpec;
  detail2?: EmblemDetailSpec;
  defaults: { detail: number; detail2: number };
}

export const EMBLEM_KIND_SPECS: Record<EmblemLayerKind, EmblemKindSpec> = {
  rect: {
    label: 'Rectangle',
    detail: { label: 'Corner Radius', min: 0, max: 0.5, step: 0.01, navStep: 0.05 },
    defaults: { detail: 0, detail2: 0 },
  },
  ellipse: { label: 'Oval', defaults: { detail: 0, detail2: 0 } },
  triangle: {
    label: 'Triangle',
    detail: { label: 'Apex Lean', min: -1, max: 1, step: 0.05, navStep: 0.1 },
    defaults: { detail: 0, detail2: 0 },
  },
  wedge: {
    label: 'Wedge',
    detail: { label: 'Sweep', min: 10, max: 350, step: 5, navStep: 15, unit: '°' },
    detail2: { label: 'Start Angle', min: 0, max: 355, step: 5, navStep: 15, unit: '°' },
    defaults: { detail: 90, detail2: 225 },
  },
  star: {
    label: 'Star',
    detail: { label: 'Points', min: 3, max: 12, step: 1, navStep: 1 },
    detail2: { label: 'Waist', min: 0.15, max: 0.85, step: 0.01, navStep: 0.05 },
    defaults: { detail: 5, detail2: 0.42 },
  },
  polygon: {
    label: 'Polygon',
    detail: { label: 'Sides', min: 3, max: 12, step: 1, navStep: 1 },
    detail2: { label: 'Spin', min: 0, max: 355, step: 5, navStep: 15, unit: '°' },
    defaults: { detail: 6, detail2: 0 },
  },
  ring: {
    label: 'Ring',
    detail: { label: 'Thickness', min: 0.04, max: 0.5, step: 0.01, navStep: 0.04 },
    defaults: { detail: 0.16, detail2: 0 },
  },
  chevron: {
    label: 'Chevron',
    detail: { label: 'Thickness', min: 0.1, max: 0.9, step: 0.02, navStep: 0.05 },
    defaults: { detail: 0.4, detail2: 0 },
  },
  banner: {
    label: 'Banner',
    detail: { label: 'Tail Notch', min: 0, max: 0.4, step: 0.02, navStep: 0.05 },
    detail2: { label: 'Arch', min: -0.4, max: 0.4, step: 0.02, navStep: 0.05 },
    defaults: { detail: 0.16, detail2: 0 },
  },
  text: {
    label: 'Text',
    detail: { label: 'Tracking', min: -10, max: 40, step: 1, navStep: 2, unit: '%' },
    defaults: { detail: 0, detail2: 0 },
  },
};

/** Menu order for the editor's shape pickers. */
export const EMBLEM_KINDS: EmblemLayerKind[] = [
  'rect', 'ellipse', 'triangle', 'wedge', 'star', 'polygon', 'ring', 'chevron', 'banner', 'text',
];

// ─── Construction and normalization ─────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Monotonic within a session; ids only need to be unique inside one doc. */
let layerSeq = 0;
export function newLayerId(): string {
  layerSeq += 1;
  return `L${layerSeq}`;
}

export function defaultEmblemLayer(kind: EmblemLayerKind): EmblemLayer {
  const spec = EMBLEM_KIND_SPECS[kind];
  const isText = kind === 'text';
  return {
    id: newLayerId(),
    kind,
    cx: 0.5,
    cy: 0.5,
    w: isText ? 0.7 : 0.5,
    h: isText ? 0.22 : 0.5,
    rot: 0,
    ink: isText ? 'text' : 'body',
    color: '#ffffff',
    alpha: 1,
    role: isText ? 'ink' : 'solid',
    detail: spec.defaults.detail,
    detail2: spec.defaults.detail2,
    ...(isText ? { text: 'VIDEO', fontFamily: 'Archivo Black' } : {}),
  };
}

export function emptyEmblemDoc(): EmblemDoc {
  return { version: 1, enabled: true, aspect: 2, tilt: 0, wordmark: true, layers: [] };
}

/**
 * Coerce anything (a parsed localStorage string, a brand pack's `logo.emblem`)
 * into a valid doc. Never throws and never returns a partially-typed object:
 * every field is clamped into range, unknown kinds fall back to 'rect', and a
 * layer that isn't an object is dropped. A saved emblem must not be able to
 * take the store's brand pipeline down.
 */
export function normalizeEmblemDoc(raw: unknown): EmblemDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const layersRaw = Array.isArray(r.layers) ? r.layers : [];
  const layers: EmblemLayer[] = [];
  for (const l of layersRaw) {
    if (!l || typeof l !== 'object') continue;
    const o = l as Record<string, unknown>;
    const kind: EmblemLayerKind = EMBLEM_KINDS.includes(o.kind as EmblemLayerKind)
      ? (o.kind as EmblemLayerKind)
      : 'rect';
    const base = defaultEmblemLayer(kind);
    const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    layers.push({
      id: typeof o.id === 'string' && o.id ? o.id : base.id,
      kind,
      // Off-box centres are legal (a shape can hang past the design box and be
      // cropped by it) but a runaway number is not.
      cx: clamp(num(o.cx, base.cx), -2, 3),
      cy: clamp(num(o.cy, base.cy), -2, 3),
      w: clamp(num(o.w, base.w), 0.005, 4),
      h: clamp(num(o.h, base.h), 0.005, 4),
      rot: clamp(num(o.rot, base.rot), -360, 360),
      ink: (['body', 'text', 'border', 'custom'] as const).includes(o.ink as EmblemInk)
        ? (o.ink as EmblemInk) : base.ink,
      color: typeof o.color === 'string' && o.color ? o.color : base.color,
      alpha: clamp(num(o.alpha, base.alpha), 0, 1),
      role: (['solid', 'hole', 'ink'] as const).includes(o.role as EmblemRole)
        ? (o.role as EmblemRole) : base.role,
      detail: num(o.detail, base.detail),
      detail2: num(o.detail2, base.detail2),
      ...(kind === 'text'
        ? {
          text: typeof o.text === 'string' ? o.text : base.text,
          fontFamily: typeof o.fontFamily === 'string' && o.fontFamily ? o.fontFamily : base.fontFamily,
        }
        : {}),
    });
  }
  // Clamp the detail knobs to their kind's declared range, so a doc authored
  // against an older table can't drive a shape generator out of bounds.
  for (const l of layers) {
    const spec = EMBLEM_KIND_SPECS[l.kind];
    if (spec.detail) l.detail = clamp(l.detail, spec.detail.min, spec.detail.max);
    if (spec.detail2) l.detail2 = clamp(l.detail2, spec.detail2.min, spec.detail2.max);
  }
  return {
    version: 1,
    enabled: r.enabled !== false,
    aspect: clamp(typeof r.aspect === 'number' && Number.isFinite(r.aspect) ? r.aspect : 2, 0.25, 6),
    tilt: clamp(typeof r.tilt === 'number' && Number.isFinite(r.tilt) ? r.tilt : 0, -30, 30),
    wordmark: r.wordmark !== false,
    layers,
  };
}

export function cloneEmblemDoc(doc: EmblemDoc): EmblemDoc {
  return { ...doc, layers: doc.layers.map((l) => ({ ...l })) };
}

/**
 * Identity of a doc's RENDERED result — the cache key for every derivation
 * (silhouette, painted canvas, LogoSpec override). `enabled` is deliberately
 * part of it; nothing else about the doc is excluded, because every field
 * changes what gets drawn.
 */
export function emblemDocKey(doc: EmblemDoc): string {
  return JSON.stringify(doc);
}

/**
 * True when the doc would actually dress the store.
 *
 * Deliberately NOT a `doc is EmblemDoc` type guard: callers that already hold
 * a definite EmblemDoc would have its false branch narrowed to `never`, and
 * the compiler would then reject perfectly good code in the "you built
 * something, but it has no solid part yet" branch — which is exactly the state
 * the editor has to describe.
 */
export function emblemDocActive(doc: EmblemDoc | null | undefined): boolean {
  if (!doc || !doc.enabled) return false;
  // An all-'ink' doc has no silhouette to cut a sign to; treat it as inactive
  // rather than hand the pipeline an empty outline it would render as nothing.
  return doc.layers.some((l) => l.role === 'solid');
}

/** Move a layer within the stack. Returns the layer's new index. */
export function moveEmblemLayer(doc: EmblemDoc, index: number, delta: number): number {
  const next = clamp(index + delta, 0, doc.layers.length - 1);
  if (next === index || index < 0 || index >= doc.layers.length) return index;
  const [layer] = doc.layers.splice(index, 1);
  doc.layers.splice(next, 0, layer);
  return next;
}

// ─── Layer geometry: one primitive → SVG path data ──────────────────────────
//
// Absolute M/L/C/Z only — the subset src/logo-renderer.ts's flattenSvgPath
// parses, so a generated outline goes through the same route a brand pack's
// hand-authored `pathD` does. Curves are cubic Béziers (no arcs), which is
// also what Path2D and three.js's extruder want.

/** Circle-to-cubic magic number: control-point offset for a quarter arc. */
const KAPPA = 0.5522847498307936;

const fmt = (n: number) => (Math.abs(n) < 1e-4 ? '0' : n.toFixed(2).replace(/\.?0+$/, ''));

interface Pt { x: number; y: number }

function polyD(pts: Pt[]): string {
  if (pts.length < 3) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`).join('') + 'Z';
}

/** Points of a regular star/polygon on an ellipse of radii rx, ry. */
function radialPoints(n: number, rx: number, ry: number, startRad: number, innerRatio = 1): Pt[] {
  const pts: Pt[] = [];
  const steps = innerRatio < 1 ? n * 2 : n;
  for (let i = 0; i < steps; i++) {
    const a = startRad + (Math.PI * 2 * i) / steps;
    const k = innerRatio < 1 && i % 2 === 1 ? innerRatio : 1;
    pts.push({ x: Math.cos(a) * rx * k, y: Math.sin(a) * ry * k });
  }
  return pts;
}

/** An ellipse (cx, cy, rx, ry) as four cubic segments, wound clockwise. */
function ellipseD(cx: number, cy: number, rx: number, ry: number, ccw = false): string {
  const ox = rx * KAPPA, oy = ry * KAPPA;
  const s = ccw ? -1 : 1;
  return (
    `M${fmt(cx)} ${fmt(cy - ry)}`
    + `C${fmt(cx + s * ox)} ${fmt(cy - ry)} ${fmt(cx + s * rx)} ${fmt(cy - oy)} ${fmt(cx + s * rx)} ${fmt(cy)}`
    + `C${fmt(cx + s * rx)} ${fmt(cy + oy)} ${fmt(cx + s * ox)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)}`
    + `C${fmt(cx - s * ox)} ${fmt(cy + ry)} ${fmt(cx - s * rx)} ${fmt(cy + oy)} ${fmt(cx - s * rx)} ${fmt(cy)}`
    + `C${fmt(cx - s * rx)} ${fmt(cy - oy)} ${fmt(cx - s * ox)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)}`
    + 'Z'
  );
}

/** A rounded rectangle centred on the origin, corners as cubic quarter-arcs. */
function roundRectD(hw: number, hh: number, r: number): string {
  if (r <= 0.001) return polyD([{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }]);
  const k = r * (1 - KAPPA);
  return (
    `M${fmt(-hw + r)} ${fmt(-hh)}`
    + `L${fmt(hw - r)} ${fmt(-hh)}`
    + `C${fmt(hw - k)} ${fmt(-hh)} ${fmt(hw)} ${fmt(-hh + k)} ${fmt(hw)} ${fmt(-hh + r)}`
    + `L${fmt(hw)} ${fmt(hh - r)}`
    + `C${fmt(hw)} ${fmt(hh - k)} ${fmt(hw - k)} ${fmt(hh)} ${fmt(hw - r)} ${fmt(hh)}`
    + `L${fmt(-hw + r)} ${fmt(hh)}`
    + `C${fmt(-hw + k)} ${fmt(hh)} ${fmt(-hw)} ${fmt(hh - k)} ${fmt(-hw)} ${fmt(hh - r)}`
    + `L${fmt(-hw)} ${fmt(-hh + r)}`
    + `C${fmt(-hw)} ${fmt(-hh + k)} ${fmt(-hw + k)} ${fmt(-hh)} ${fmt(-hw + r)} ${fmt(-hh)}`
    + 'Z'
  );
}

/**
 * A layer's outline as SVG path data in the W×H authored box.
 *
 * Returns '' for kinds with no analytic outline ('text') — those exist as ink
 * only until the renderer rasterizes them, which is where their contribution
 * to the silhouette comes from.
 *
 * The returned path is already positioned and rotated: callers fill it as-is.
 */
export function emblemLayerPathD(layer: EmblemLayer, W: number, H: number): string {
  const hw = (layer.w * W) / 2;
  const hh = (layer.h * H) / 2;
  if (hw <= 0 || hh <= 0) return '';
  const rad = (layer.rot * Math.PI) / 180;

  let local = '';
  switch (layer.kind) {
    case 'text':
      return '';
    case 'rect':
      local = roundRectD(hw, hh, clamp(layer.detail, 0, 0.5) * Math.min(hw, hh) * 2);
      break;
    case 'ellipse':
      local = ellipseD(0, 0, hw, hh);
      break;
    case 'triangle': {
      const apex = clamp(layer.detail, -1, 1) * hw;
      local = polyD([{ x: apex, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }]);
      break;
    }
    case 'wedge': {
      // A pie slice from the centre. Sampled rather than arc-fitted: the whole
      // pipeline downstream is polygonal, and 2° of sample pitch is finer than
      // any sign's rule weight.
      const sweep = clamp(layer.detail, 1, 359);
      const start = (layer.detail2 * Math.PI) / 180;
      const steps = Math.max(6, Math.ceil(sweep / 2));
      const pts: Pt[] = [{ x: 0, y: 0 }];
      for (let i = 0; i <= steps; i++) {
        const a = start + ((sweep * Math.PI) / 180) * (i / steps);
        pts.push({ x: Math.cos(a) * hw, y: Math.sin(a) * hh });
      }
      local = polyD(pts);
      break;
    }
    case 'star': {
      const n = Math.max(3, Math.round(layer.detail));
      // Point-up: the first vertex sits at -90°, which is what "a star" means.
      local = polyD(radialPoints(n, hw, hh, -Math.PI / 2, clamp(layer.detail2, 0.05, 0.95)));
      break;
    }
    case 'polygon': {
      const n = Math.max(3, Math.round(layer.detail));
      local = polyD(radialPoints(n, hw, hh, -Math.PI / 2 + (layer.detail2 * Math.PI) / 180));
      break;
    }
    case 'ring': {
      // Outer ring clockwise + inner ellipse counter-clockwise: the opposite
      // winding is what makes the middle a real hole under nonzero fill, in the
      // 2D painter and the extruder alike.
      const t = clamp(layer.detail, 0.02, 0.49);
      local = ellipseD(0, 0, hw, hh) + ellipseD(0, 0, hw * (1 - 2 * t), hh * (1 - 2 * t), true);
      break;
    }
    case 'chevron': {
      const t = clamp(layer.detail, 0.05, 0.95);
      const bar = 2 * hh * t;          // arm thickness
      const dip = 2 * hh - bar;        // how far the V drops, so it fills the box
      local = polyD([
        { x: -hw, y: -hh },
        { x: 0, y: -hh + dip },
        { x: hw, y: -hh },
        { x: hw, y: -hh + bar },
        { x: 0, y: hh },
        { x: -hw, y: -hh + bar },
      ]);
      break;
    }
    case 'banner': {
      // A ribbon: straight top and bottom (optionally arched), with a swallow-
      // tail notch bitten out of each end.
      const notch = clamp(layer.detail, 0, 0.45) * hw;
      const arch = clamp(layer.detail2, -0.5, 0.5) * hh;
      const steps = 12;
      const pts: Pt[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = -hw + 2 * hw * t;
        pts.push({ x, y: -hh - arch * Math.sin(Math.PI * t) });
      }
      if (notch > 0) pts.push({ x: hw - notch, y: 0 });
      for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        const x = -hw + 2 * hw * t;
        pts.push({ x, y: hh - arch * Math.sin(Math.PI * t) });
      }
      if (notch > 0) pts.push({ x: -hw + notch, y: 0 });
      local = polyD(pts);
      break;
    }
  }
  if (!local) return '';
  return transformPathD(local, rad, layer.cx * W, layer.cy * H);
}

/**
 * Rotate a path's coordinates about the origin and translate it. Done on the
 * NUMBERS rather than by a canvas transform so the emitted `pathD` is already
 * in the authored box — the silhouette a brand pack could paste verbatim.
 */
function transformPathD(d: string, rad: number, tx: number, ty: number): string {
  const cos = Math.cos(rad), sin = Math.sin(rad);
  // Every command emitted above is absolute with an even number of coordinate
  // pairs, so a positional walk over the numbers is exact.
  let out = '';
  const re = /([MLCZ])|(-?\d*\.?\d+)/g;
  const nums: number[] = [];
  let pending = '';
  const flush = () => {
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = nums[i], y = nums[i + 1];
      out += `${i === 0 ? pending : ' '}${fmt(x * cos - y * sin + tx)} ${fmt(x * sin + y * cos + ty)}`;
    }
    nums.length = 0;
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      flush();
      if (m[1] === 'Z') { out += 'Z'; pending = ''; } else pending = m[1];
    } else {
      nums.push(parseFloat(m[2]));
    }
  }
  flush();
  return out;
}

// ─── Starter compositions ───────────────────────────────────────────────────
// Openers, not templates to ship: each is a few layers a person can take apart
// to learn what the knobs do. All invented — the committed tree carries no
// recreation of a real chain's mark (that is what a brand pack is for).

function layer(kind: EmblemLayerKind, over: Partial<EmblemLayer>): EmblemLayer {
  return { ...defaultEmblemLayer(kind), ...over };
}

export interface EmblemStarter { label: string; doc: () => EmblemDoc }

export const EMBLEM_STARTERS: EmblemStarter[] = [
  {
    label: 'Blank',
    doc: () => emptyEmblemDoc(),
  },
  {
    label: 'Oval Badge',
    doc: () => ({
      ...emptyEmblemDoc(),
      aspect: 2.2,
      layers: [
        layer('ellipse', { cx: 0.5, cy: 0.5, w: 1, h: 1, ink: 'body' }),
        layer('ellipse', { cx: 0.5, cy: 0.5, w: 0.92, h: 0.86, ink: 'border', role: 'ink' }),
        layer('ellipse', { cx: 0.5, cy: 0.5, w: 0.87, h: 0.79, ink: 'body', role: 'ink' }),
      ],
    }),
  },
  {
    label: 'Star Shield',
    doc: () => ({
      ...emptyEmblemDoc(),
      aspect: 1.35,
      wordmark: false,
      layers: [
        layer('rect', { cx: 0.5, cy: 0.42, w: 0.96, h: 0.7, detail: 0.18, ink: 'body' }),
        layer('triangle', { cx: 0.5, cy: 0.825, w: 0.96, h: 0.33, rot: 180, ink: 'body' }),
        layer('star', { cx: 0.5, cy: 0.4, w: 0.5, h: 0.52, ink: 'border', role: 'ink' }),
        layer('text', { cx: 0.5, cy: 0.78, w: 0.8, h: 0.16, text: 'VIDEO', ink: 'text' }),
      ],
    }),
  },
  {
    label: 'Ticket Plate',
    doc: () => ({
      ...emptyEmblemDoc(),
      aspect: 3,
      tilt: 4,
      layers: [
        layer('rect', { cx: 0.5, cy: 0.5, w: 1, h: 0.86, detail: 0.12, ink: 'body' }),
        layer('ellipse', { cx: 0.06, cy: 0.5, w: 0.09, h: 0.3, role: 'hole' }),
        layer('ellipse', { cx: 0.94, cy: 0.5, w: 0.09, h: 0.3, role: 'hole' }),
        layer('rect', { cx: 0.5, cy: 0.5, w: 0.93, h: 0.72, detail: 0.1, ink: 'border', role: 'ink' }),
        layer('rect', { cx: 0.5, cy: 0.5, w: 0.9, h: 0.66, detail: 0.1, ink: 'body', role: 'ink' }),
      ],
    }),
  },
  {
    label: 'Reel Ring',
    doc: () => ({
      ...emptyEmblemDoc(),
      aspect: 1,
      wordmark: false,
      layers: [
        layer('ring', { cx: 0.5, cy: 0.5, w: 1, h: 1, detail: 0.14, ink: 'body' }),
        layer('ellipse', { cx: 0.5, cy: 0.5, w: 0.22, h: 0.22, ink: 'body' }),
        layer('rect', { cx: 0.5, cy: 0.5, w: 0.08, h: 0.72, ink: 'body' }),
        layer('rect', { cx: 0.5, cy: 0.5, w: 0.08, h: 0.72, rot: 60, ink: 'body' }),
        layer('rect', { cx: 0.5, cy: 0.5, w: 0.08, h: 0.72, rot: 120, ink: 'body' }),
      ],
    }),
  },
  {
    label: 'Marquee Band',
    doc: () => ({
      ...emptyEmblemDoc(),
      aspect: 3.2,
      layers: [
        layer('banner', { cx: 0.5, cy: 0.5, w: 1, h: 0.8, detail: 0.14, detail2: 0.12, ink: 'body' }),
        layer('chevron', { cx: 0.5, cy: 0.9, w: 0.55, h: 0.16, detail: 0.5, ink: 'border', role: 'ink' }),
      ],
    }),
  },
];
