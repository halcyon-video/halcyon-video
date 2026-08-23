// Flattening an EmblemDoc: layered primitives → one mark the whole store can
// wear.
//
// Two products come out of here, and the pipeline needs both:
//
//   1. THE ART — the composition painted with real alpha, clipped to its own
//      silhouette. Empty space stays empty: this is a die-cut board, not a
//      picture on a rectangle.
//   2. THE SILHOUETTE — that same alpha traced back into polygon outlines and
//      emitted as SVG path data, which becomes LogoSpec.pathD. From there
//      every existing brand surface takes it for free: the 2D emblem fills it,
//      canvas-textures.ts die-cuts its signboards to it, and
//      logo-storefront.ts extrudes it into the physical storefront sign. An
//      oval emblem makes an oval sign because the sign is BUILT from this
//      outline, not because anything special-cased an oval.
//
// The doc is the only thing stored (src/emblem-doc.ts); everything here is
// derived and cached, so an editor keystroke costs one re-flatten of a
// 640-pixel mask rather than anything the user can feel.
//
// WHY RASTER-AND-TRACE rather than a polygon boolean union: text. A wordmark
// layer has no analytic outline a browser will hand you — glyph geometry only
// exists once something has drawn it — and a union that can't include the
// lettering would cut a sign to the wrong shape the moment someone typed on
// it. Rasterizing the whole composition answers unions, overlaps, holes and
// type with one mechanism, and the tracer (src/alpha-trace.ts) is the same one
// the freestanding storefront letters have always used.
//
// PERFORMANCE CONTRACT: nothing here runs per frame. Flattening happens when
// the brand resolves (boot, a brand edit) and the results are cached by the
// doc's own JSON. The art canvas is rendered at the size the caller asks for —
// native resolution, no downscale blur — with a small LRU so a store with a
// dozen brand surfaces keeps at most a few megabytes of them.
import type { LogoSpec } from './logo-spec';
import {
  emblemDocActive, emblemDocKey, emblemLayerPathD, normalizeEmblemDoc,
} from './emblem-doc';
import type { EmblemDoc, EmblemLayer } from './emblem-doc';
import { brandFontFamilyCss } from './brand-fonts';
import {
  canvasAlphaField, loopArea, nestLoops, orientLoop, simplifyLoop, traceAlphaContours,
} from './alpha-trace';

/** localStorage key holding the user's emblem document. */
export const EMBLEM_STORAGE_KEY = 'bb_emblem';

// The authored coordinate box every derived path is expressed in. Arbitrary
// but fixed: `pathD` is normalized by its own bbox downstream, so the number
// only sets the precision of the emitted decimals.
const DESIGN_W = 1000;

// Mask resolution for the silhouette trace. 640 across the long edge puts one
// cell at ~0.15% of the emblem — on a twelve-foot storefront sign, under two
// millimetres, and well inside the tracer's sub-pixel interpolation.
const MASK_LONG_EDGE = 640;
const MASK_PAD = 2;          // transparent apron so edge-touching art still closes
const SIMPLIFY_EPS = 0.45;   // mask pixels: kills stairsteps, keeps curves
const MIN_LOOP_AREA = 1.5;   // mask px²: drop speck contours (anti-alias crumbs)

/** The three brand inks a layer can name, resolved from the active spec. */
export interface EmblemColors { body: string; text: string; border: string }

export function emblemColorsFromSpec(spec: LogoSpec): EmblemColors {
  return { body: spec.bodyColor, text: spec.textColor, border: spec.borderColor };
}

function inkColor(layer: EmblemLayer, colors: EmblemColors): string {
  switch (layer.ink) {
    case 'body': return colors.body;
    case 'text': return colors.text;
    case 'border': return colors.border;
    default: return layer.color;
  }
}

function designBox(doc: EmblemDoc): { W: number; H: number } {
  return { W: DESIGN_W, H: DESIGN_W / Math.max(0.05, doc.aspect) };
}

// ─── Painting one layer ──────────────────────────────────────────────────────

function paintLayer(
  ctx: CanvasRenderingContext2D, layer: EmblemLayer, colors: EmblemColors, W: number, H: number,
): void {
  ctx.save();
  ctx.globalAlpha = layer.alpha;
  ctx.fillStyle = inkColor(layer, colors);
  if (layer.kind === 'text') {
    paintTextLayer(ctx, layer, W, H);
  } else {
    const d = emblemLayerPathD(layer, W, H);
    // Nonzero winding, deliberately: a ring emits its inner ellipse wound the
    // other way, and that is what makes the middle a hole in the fill, in the
    // traced silhouette and in the extrusion alike.
    if (d) ctx.fill(new Path2D(d));
  }
  ctx.restore();
}

function paintTextLayer(ctx: CanvasRenderingContext2D, layer: EmblemLayer, W: number, H: number): void {
  const text = (layer.text ?? '').trim();
  if (!text) return;
  const px = Math.max(1, layer.h * H);
  ctx.font = `${px}px ${brandFontFamilyCss(layer.fontFamily ?? 'Archivo Black')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Tracking is authored as a percentage of the em so it survives a size
  // change. `letterSpacing` is Chromium-era canvas API; where it's missing the
  // type simply sets solid, which is the right degradation for a nicety.
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${((layer.detail / 100) * px).toFixed(2)}px`;
  }
  // The layer's width is a CEILING, not a stretch target: squeezed type reads
  // as a rendering fault (the same reason brand art is contained, never
  // stretched). Overlong text shrinks uniformly until it fits.
  const measured = ctx.measureText(text).width;
  const maxW = Math.max(1, layer.w * W);
  const shrink = measured > maxW ? maxW / measured : 1;
  ctx.translate(layer.cx * W, layer.cy * H);
  ctx.rotate((layer.rot * Math.PI) / 180);
  if (shrink !== 1) ctx.scale(shrink, shrink);
  ctx.fillText(text, 0, 0);
}

// ─── The silhouette ──────────────────────────────────────────────────────────

export interface EmblemSilhouette {
  /** Outline loops as SVG path data, in the doc's authored design box. */
  pathD: string;
  /** The sub-rect of the design box the ink actually occupies, as fractions. */
  bbox: { x: number; y: number; w: number; h: number };
  /** width : height of that ink box — the emblem's true aspect. */
  aspect: number;
}

const silhouetteCache = new Map<string, EmblemSilhouette | null>();

/**
 * Paint the doc's SOLID layers and cut its HOLE layers, under a transform that
 * maps the design box onto (0,0)-(w,h). This is the emblem's alpha, and the
 * single source of truth for both the traced outline and the art's clip.
 */
function paintMask(
  ctx: CanvasRenderingContext2D, doc: EmblemDoc, W: number, H: number,
): void {
  const white: EmblemColors = { body: '#fff', text: '#fff', border: '#fff' };
  for (const layer of doc.layers) {
    if (layer.role === 'ink') continue;
    if (layer.role === 'hole') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      // A hole cuts at full strength regardless of its own opacity — a
      // half-erased window is a rendering artefact, not a shape.
      paintLayer(ctx, { ...layer, alpha: 1 }, white, W, H);
      ctx.restore();
    } else {
      paintLayer(ctx, { ...layer, alpha: 1 }, white, W, H);
    }
  }
}

/**
 * Flatten a doc to its outline. Cached by the doc's own JSON; null when the
 * composition has no ink to cut a sign from (which the caller treats as "no
 * emblem", leaving the store's normal brand alone).
 */
export function emblemSilhouette(doc: EmblemDoc): EmblemSilhouette | null {
  const key = emblemDocKey(doc);
  const hit = silhouetteCache.get(key);
  if (hit !== undefined) return hit;
  const result = computeSilhouette(doc);
  // Bounded: an editor session walks through a doc per keystroke and each one
  // is a distinct key. Oldest-out is enough — the live doc is always the most
  // recent entry.
  if (silhouetteCache.size > 32) silhouetteCache.delete(silhouetteCache.keys().next().value!);
  silhouetteCache.set(key, result);
  return result;
}

function computeSilhouette(doc: EmblemDoc): EmblemSilhouette | null {
  if (typeof document === 'undefined') return null; // node (tests, tooling)
  const { W, H } = designBox(doc);
  const scale = MASK_LONG_EDGE / Math.max(W, H);
  const mw = Math.max(4, Math.round(W * scale)) + MASK_PAD * 2;
  const mh = Math.max(4, Math.round(H * scale)) + MASK_PAD * 2;
  const canvas = document.createElement('canvas');
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, MASK_PAD, MASK_PAD);
  // The design box is a CROP, and it has to be an explicit one. A shape may
  // hang off the edge (the editor lets you place one there deliberately), and
  // without this clip its contour runs into the transparent apron, off the
  // grid, and comes back as an OPEN polyline the tracer then discards.
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  paintMask(ctx, doc, W, H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const field = canvasAlphaField(canvas);
  if (!field) return null;
  const loops = traceAlphaContours(field.alpha, field.w, field.h)
    .map((loop) => simplifyLoop(loop, SIMPLIFY_EPS))
    .filter((loop) => loopArea(loop) > MIN_LOOP_AREA);
  if (!loops.length) return null;

  // Mask pixels → design-box units.
  const toDesign = (p: { x: number; y: number }) => ({
    x: (p.x - MASK_PAD) / scale,
    y: (p.y - MASK_PAD) / scale,
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let d = '';
  const emit = (loop: { x: number; y: number }[]) => {
    loop.forEach((raw, i) => {
      const p = toDesign(raw);
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
      d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    });
    d += 'Z';
  };
  // WINDING IS THE FILL RULE HERE. Everything downstream draws this outline as
  // ONE path under the nonzero rule — the 2D emblem, the die-cut signboards,
  // the extruded sign — so a hole has to be wound against the outline that
  // contains it or it fills in solid. Marching squares gives no consistent
  // orientation of its own (the walk starts at an arbitrary end of an
  // arbitrary segment), so nest the contours and state it explicitly. A film
  // reel whose spoke gaps came back as a plain blue disc on the storefront is
  // what this costs when it's left to chance.
  for (const { outer, holes } of nestLoops(loops)) {
    emit(orientLoop(outer, 1));
    for (const hole of holes) emit(orientLoop(hole, -1));
  }
  const bw = x1 - x0, bh = y1 - y0;
  if (!(bw > 0 && bh > 0)) return null;
  return {
    pathD: d,
    bbox: { x: x0 / W, y: y0 / H, w: bw / W, h: bh / H },
    aspect: bw / bh,
  };
}

// ─── The art ─────────────────────────────────────────────────────────────────

interface ArtEntry { key: string; canvas: HTMLCanvasElement }

// Small LRU, scoped to ONE document. The store paints a dozen-odd brand
// surfaces at different sizes and each asks once at build time, so a dozen
// entries cover a whole boot; and because an edit changes the document, the
// whole cache is dropped rather than aged out, which is what keeps a long
// design session from accumulating a megabyte of canvases per keystroke.
const ART_CACHE_MAX = 12;
let artCacheDoc = '';
const artCache: ArtEntry[] = [];

/**
 * The composition painted at exactly w×h device pixels, with real alpha and
 * clipped to its own silhouette — the flattened emblem.
 *
 * The canvas covers the INK BOX, not the design box: a shape sitting in the
 * middle of a roomy canvas produces art the size of the shape, which is what
 * lets the painter drop it straight onto the same rect the outline fills.
 */
export function emblemArtCanvas(
  doc: EmblemDoc, colors: EmblemColors, w: number, h: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const sil = emblemSilhouette(doc);
  if (!sil) return null;
  const pw = Math.max(2, Math.round(w));
  const ph = Math.max(2, Math.round(h));
  const docKey = emblemDocKey(doc);
  if (docKey !== artCacheDoc) {
    artCache.length = 0;
    artCacheDoc = docKey;
  }
  const key = `${colors.body}|${colors.text}|${colors.border}|${pw}x${ph}`;
  const idx = artCache.findIndex((e) => e.key === key);
  if (idx >= 0) {
    const [entry] = artCache.splice(idx, 1);
    artCache.push(entry);
    return entry.canvas;
  }

  const { W, H } = designBox(doc);
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Map the ink box onto the whole canvas.
  const sx = pw / (sil.bbox.w * W);
  const sy = ph / (sil.bbox.h * H);
  const setFrame = (c: CanvasRenderingContext2D) =>
    c.setTransform(sx, 0, 0, sy, -sil.bbox.x * W * sx, -sil.bbox.y * H * sy);

  setFrame(ctx);
  // Cropped to the same design box the silhouette was traced inside, so the
  // printing never carries ink the outline doesn't.
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  for (const layer of doc.layers) {
    // Holes are cut by the mask below, not here: clipping the finished art to
    // the silhouette makes a hole erase the ink over it too, whatever order
    // the layers are in.
    if (layer.role === 'hole') continue;
    paintLayer(ctx, layer, colors, W, H);
  }

  // Clip to the silhouette. Doing it as a mask (rather than compositing each
  // ink layer against what happens to be under it) means a layer's clip does
  // not depend on where it sits in the stack — an ink layer at the bottom
  // still prints on the board instead of vanishing.
  const mask = document.createElement('canvas');
  mask.width = pw;
  mask.height = ph;
  const mctx = mask.getContext('2d');
  if (mctx) {
    setFrame(mctx);
    mctx.beginPath();
    mctx.rect(0, 0, W, H);
    mctx.clip();
    paintMask(mctx, doc, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  artCache.push({ key, canvas });
  if (artCache.length > ART_CACHE_MAX) artCache.shift();
  return canvas;
}

/**
 * Paint a spec's emblem composition into rect (x,y,w,h) — the hook
 * logo-renderer.ts's painter calls in place of drawing a body shape and a
 * wordmark. The rect must be the one the outline was fitted into, or the art
 * and the die-cut edge would disagree.
 */
export function drawEmblemArt(
  ctx: CanvasRenderingContext2D, doc: EmblemDoc, colors: EmblemColors,
  x: number, y: number, w: number, h: number,
): boolean {
  const art = emblemArtCanvas(doc, colors, w, h);
  if (!art) return false;
  ctx.drawImage(art, x, y, w, h);
  return true;
}

/**
 * The flattened emblem as a transparent PNG — what the editor's export row
 * hands the user. Same art the store wears, at whatever size they asked for,
 * alpha and all.
 *
 * A Blob rather than a data URL on purpose: a megabyte of base64 in an <a
 * href> is at the edge of what a browser will accept as a navigation target,
 * and the failure mode is the page navigating away from the store rather than
 * saving anything.
 */
export function emblemPngBlob(
  doc: EmblemDoc, colors: EmblemColors, longEdge = 1024,
): Promise<Blob | null> {
  const sil = emblemSilhouette(doc);
  if (!sil) return Promise.resolve(null);
  const w = sil.aspect >= 1 ? longEdge : Math.round(longEdge * sil.aspect);
  const h = sil.aspect >= 1 ? Math.round(longEdge / sil.aspect) : longEdge;
  const art = emblemArtCanvas(doc, colors, w, h);
  if (!art) return Promise.resolve(null);
  return new Promise((resolve) => art.toBlob((blob) => resolve(blob), 'image/png'));
}

// ─── Entering the LogoSpec chain ─────────────────────────────────────────────

/**
 * Clamp a document into range before anything derives geometry from it.
 *
 * A doc reaching this module has two possible authors: loadEmblemDoc (already
 * normalized) and a BRAND PACK's `logo.emblem`, which is a file someone
 * dropped in user-assets and has been through no validation at all. Running it
 * through the normalizer means a pack with a mistyped layer degrades to a sane
 * one instead of feeding NaN geometry to the sign extruder.
 *
 * DELIBERATELY NOT MEMOIZED. The obvious cache — keyed on the doc's identity —
 * is wrong: the emblem editor holds ONE document and mutates it in place on
 * every keystroke, so an identity-keyed memo hands back the first snapshot
 * forever and the live preview stops moving. The work itself is a loop over a
 * handful of layers, which is nothing beside the flatten it guards.
 */
function safeEmblemDoc(doc: EmblemDoc | undefined): EmblemDoc | null {
  return doc ? normalizeEmblemDoc(doc) : null;
}

// Memo for the parse below, keyed by the raw stored string.
let storedRaw: string | null = null;
let storedDoc: EmblemDoc | null = null;

/**
 * The user's saved emblem, or null. Never throws on bad JSON: a corrupt
 * emblem must degrade to "no emblem", not to a store that won't boot.
 *
 * TREAT THE RESULT AS IMMUTABLE. This sits on getActiveLogoSpec's path, which
 * every brand surface calls as it paints, so the parse is memoized on the raw
 * string and callers share one object; an editor works on cloneEmblemDoc() of
 * it. Writing through saveEmblemDoc changes the raw string, which is what
 * invalidates the memo.
 */
export function loadEmblemDoc(): EmblemDoc | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(EMBLEM_STORAGE_KEY);
  if (!raw) {
    storedRaw = null;
    storedDoc = null;
    return null;
  }
  if (raw === storedRaw) return storedDoc;
  try {
    storedDoc = normalizeEmblemDoc(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to parse the saved emblem, ignoring it:', e);
    storedDoc = null;
  }
  storedRaw = raw;
  return storedDoc;
}

/** Persist (or clear, with null) the user's emblem. */
export function saveEmblemDoc(doc: EmblemDoc | null): void {
  if (typeof localStorage === 'undefined') return;
  if (doc) localStorage.setItem(EMBLEM_STORAGE_KEY, JSON.stringify(doc));
  else localStorage.removeItem(EMBLEM_STORAGE_KEY);
}

/**
 * Fold a spec's emblem document into the spec's own outline fields, so that
 * everything downstream sees an ordinary brand-supplied outline
 * (shape 'path' + pathD) and needs to know nothing about the composer.
 *
 * `pathFit: 'contain'` because a composed emblem is a MARK: its silhouette is
 * a designed shape, and stretching it into a 4:1 storefront band would read as
 * a rendering fault — the same rule a traced brand pack's mark follows.
 * `textTilt` comes from the doc so the emblem's lean is edited where the
 * emblem is, and a composition authored upright doesn't inherit the house
 * badge's 4° rake.
 *
 * Returns `spec` untouched when there is no active emblem — the hot path.
 */
export function applyEmblemToSpec(spec: LogoSpec): LogoSpec {
  const doc = safeEmblemDoc(spec.emblem);
  if (!doc || !emblemDocActive(doc)) return spec;
  const sil = emblemSilhouette(doc);
  if (!sil) return spec;
  return {
    ...spec,
    // The CLEANED document, not the one that came in: the outline below was
    // traced from this one, and the painter reads `emblem` back off the spec to
    // print the face. Two different documents there would put art on a sign cut
    // to a different shape.
    emblem: doc,
    shape: 'path',
    pathD: sil.pathD,
    pathTiltDeg: 0,
    pathFit: 'contain',
    textTilt: doc.tilt,
    // The composition IS the artwork; a pack's traced vector layers or raster
    // emblem would paint over it.
    artLayers: undefined,
    wordmarkPathD: undefined,
    imageSrc: undefined,
    // The composer's own inner shapes are the pinstripe. A second one drawn by
    // the generic painter would trace the outline of whatever the user built.
    innerBorder: false,
    tornEdge: false,
  };
}
