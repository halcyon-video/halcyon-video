// THE DESIGN CANVAS — the emblem studio's direct-manipulation surface.
//
// Click a shape to select it, drag it to move, pull a handle to scale, turn the
// stem above it to rotate. Everything here is the MOUSE half of the editor; the
// remote half is the property rows next to it (src/emblem-controls.ts), and the
// two drive the same document through the same session, so a shape dragged with
// a mouse moves the Across / Down readouts and vice versa.
//
// WHY GEOMETRY AND NOT PIXELS. Hit-testing runs against each layer's own SVG
// outline (emblemLayerPathD, the exact path the painter fills), walked top of
// the stack down. That means a 'hole' layer — which by definition paints
// nothing — is still grabbable, an ink layer hidden under a solid one is still
// reachable by clicking where it is, and a ring's middle correctly is not part
// of the ring. Reading the composited alpha instead would lose all three.
//
// THE MAPPING IS UNIFORM, AND THAT IS LOAD-BEARING. The design box is fitted
// into the canvas with `contain` at the document's own aspect, so the design
// box's W:H and the fitted rect's w:h are the same number and one scale factor
// serves both axes. Rotations therefore survive the trip to screen space
// unchanged, which is what lets a rotated layer's handles be computed in the
// layer's own local frame and simply mapped out.
//
// PERFORMANCE: this is not a render loop. Redraws are requested by the studio
// (an edit, a resize, a pointer move during a drag) and coalesced to one per
// frame there. A redraw re-flattens the composition, which is cached on the
// document's JSON, so a drag that changes nothing re-uses the same art.
import { emblemLayerPathD } from './emblem-doc';
import type { EmblemLayer } from './emblem-doc';
import { emblemArtCanvas, emblemColorsFromSpec, emblemSilhouette } from './emblem-render';
import { getActiveLogoSpec } from './logo-spec';
import type { EmblemSession } from './emblem-session';

/** The authored design box's width. Mirrors emblem-render's DESIGN_W. */
const DESIGN_W = 1000;

const CHECKER = 14;          // transparency checkerboard cell, CSS px
const PAD = 26;              // margin around the design box, CSS px
const HANDLE = 9;            // scale-handle square, CSS px (its full side)
const HANDLE_GRAB = 11;      // pointer slack around a handle, CSS px
const ROTATE_ARM = 30;       // how far the rotate stem stands off the box, CSS px

// Drag clamps. These deliberately match the property sliders' ranges
// (emblem-controls.ts POS / SIZE) rather than the document normalizer's wider
// limits: a shape dragged somewhere its own slider cannot express would show a
// readout that disagrees with the canvas, and the next Left press would teleport
// it back into range.
const POS_MIN = -0.5, POS_MAX = 1.5;
const SIZE_MIN = 0.02, SIZE_MAX = 2;

/** Handle identity: which corner/edge, as a sign pair in the layer's local frame. */
interface HandleId { hx: -1 | 0 | 1; hy: -1 | 0 | 1 }

const SCALE_HANDLES: HandleId[] = [
  { hx: -1, hy: -1 }, { hx: 0, hy: -1 }, { hx: 1, hy: -1 },
  { hx: -1, hy: 0 }, { hx: 1, hy: 0 },
  { hx: -1, hy: 1 }, { hx: 0, hy: 1 }, { hx: 1, hy: 1 },
];

interface Pt { x: number; y: number }

/** Snapshot of the box a scale/rotate gesture started from — never drifts. */
interface StartBox { cx: number; cy: number; w: number; h: number; rot: number }

type Drag =
  | { kind: 'move'; grab: Pt; start: StartBox }
  | { kind: 'scale'; handle: HandleId; start: StartBox }
  | { kind: 'rotate'; grabAngle: number; start: StartBox };

/**
 * Viewport (client CSS px) coordinates of the things a POINTER test aims at.
 *
 * Nothing in the app calls this. It exists so the verification rig can drive
 * the real gestures — grab THIS handle, drop it THERE — instead of guessing at
 * pixel offsets, which is the difference between testing the editor and testing
 * some arithmetic copied out of it.
 */
export interface EmblemCanvasProbe {
  /** A point in the design box, given as fractions of it. */
  design(fx: number, fy: number): Pt;
  /** A scale handle of the selected layer, by its local sign pair. */
  handle(hx: -1 | 0 | 1, hy: -1 | 0 | 1): Pt;
  /** The selected layer's rotate knob. */
  rotate(): Pt;
}

export interface EmblemCanvasHandle {
  element: HTMLCanvasElement;
  /** Repaint. Cheap enough to call from the studio's per-frame coalescer. */
  redraw(): void;
  /** True while a pointer gesture is in flight (the studio skips resizes then). */
  isDragging(): boolean;
  /** Verification hook — see EmblemCanvasProbe. Null with nothing selected. */
  probe(): EmblemCanvasProbe | null;
  dispose(): void;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const rotate = (p: Pt, rad: number): Pt => ({
  x: p.x * Math.cos(rad) - p.y * Math.sin(rad),
  y: p.x * Math.sin(rad) + p.y * Math.cos(rad),
});

// One scratch context for isPointInPath. Path2D hit-testing needs a context but
// draws nothing, and allocating a canvas per click would be silly.
let hitCtx: CanvasRenderingContext2D | null = null;
function hitContext(): CanvasRenderingContext2D | null {
  if (!hitCtx) hitCtx = document.createElement('canvas').getContext('2d');
  return hitCtx;
}

/**
 * Build the interactive design canvas for `session`, appended to `host`.
 *
 * The canvas sizes itself to the host box (device-pixel-ratio aware, redrawn on
 * resize) and everything below draws in CSS pixels, so handle sizes are honest
 * on a hidpi screen instead of being halved by the backing-store scale.
 */
export function createEmblemCanvas(session: EmblemSession, host: HTMLElement): EmblemCanvasHandle {
  const canvas = document.createElement('canvas');
  canvas.className = 'emblem-design-canvas';
  canvas.tabIndex = -1;
  host.appendChild(canvas);

  let drag: Drag | null = null;
  let shiftHeld = false;

  // ── Geometry ───────────────────────────────────────────────────────────────

  const designH = () => DESIGN_W / Math.max(0.05, session.doc.aspect);

  /** The design box's rect on the canvas, in CSS px, contain-fitted with a margin. */
  const fit = () => {
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    const availW = Math.max(1, cw - PAD * 2);
    const availH = Math.max(1, ch - PAD * 2);
    const aspect = Math.max(0.05, session.doc.aspect);
    const wide = availW / availH > aspect;
    const w = wide ? availH * aspect : availW;
    const h = wide ? availH : availW / aspect;
    return { x: (cw - w) / 2, y: (ch - h) / 2, w, h, scale: w / DESIGN_W };
  };

  /** Pointer event → design-box coordinates (the units emblemLayerPathD emits). */
  const toDesign = (e: PointerEvent | MouseEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    const f = fit();
    return {
      x: (e.clientX - r.left - f.x) / f.scale,
      y: (e.clientY - r.top - f.y) / f.scale,
    };
  };

  const boxOf = (layer: EmblemLayer): StartBox =>
    ({ cx: layer.cx, cy: layer.cy, w: layer.w, h: layer.h, rot: layer.rot });

  /** A layer's handle positions in DESIGN coordinates, rotation included. */
  const handlePoint = (box: StartBox, h: HandleId): Pt => {
    const H = designH();
    const rad = (box.rot * Math.PI) / 180;
    const local = { x: (h.hx * box.w * DESIGN_W) / 2, y: (h.hy * box.h * H) / 2 };
    const world = rotate(local, rad);
    return { x: box.cx * DESIGN_W + world.x, y: box.cy * H + world.y };
  };

  const rotatePoint = (box: StartBox): Pt => {
    const H = designH();
    const rad = (box.rot * Math.PI) / 180;
    const arm = ROTATE_ARM / Math.max(1e-6, fit().scale);
    const world = rotate({ x: 0, y: -(box.h * H) / 2 - arm }, rad);
    return { x: box.cx * DESIGN_W + world.x, y: box.cy * H + world.y };
  };

  // ── Hit testing ────────────────────────────────────────────────────────────

  /**
   * Is `p` inside this layer? Analytic outline for every kind that has one; a
   * text layer is tested against the box the selection rectangle draws, because
   * that box IS what the studio shows you as the layer's extent (type has no
   * outline until something rasterizes it — see emblem-doc's note).
   */
  const hitsLayer = (layer: EmblemLayer, p: Pt): boolean => {
    const H = designH();
    if (layer.kind === 'text') {
      const rad = (-layer.rot * Math.PI) / 180;
      const local = rotate({ x: p.x - layer.cx * DESIGN_W, y: p.y - layer.cy * H }, rad);
      return Math.abs(local.x) <= (layer.w * DESIGN_W) / 2 && Math.abs(local.y) <= (layer.h * H) / 2;
    }
    const d = emblemLayerPathD(layer, DESIGN_W, H);
    const ctx = hitContext();
    if (!d || !ctx) return false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Nonzero, matching the painter and the extruder: a ring's middle is a hole
    // in the shape, so it must not be a hole you can grab the ring by.
    return ctx.isPointInPath(new Path2D(d), p.x, p.y, 'nonzero');
  };

  /** Topmost layer under `p`, or -1. Walks the stack the way the eye does. */
  const layerAt = (p: Pt): number => {
    for (let i = session.doc.layers.length - 1; i >= 0; i--) {
      if (hitsLayer(session.doc.layers[i], p)) return i;
    }
    return -1;
  };

  /** Which handle of the SELECTED layer `p` is grabbing, if any. */
  const handleAt = (p: Pt): HandleId | 'rotate' | null => {
    const sel = session.layer();
    if (!sel) return null;
    const slack = HANDLE_GRAB / Math.max(1e-6, fit().scale);
    const box = boxOf(sel);
    const near = (q: Pt) => Math.abs(p.x - q.x) <= slack && Math.abs(p.y - q.y) <= slack;
    if (near(rotatePoint(box))) return 'rotate';
    // Corners before edges: they overlap at slack range on a small shape, and
    // the corner is the one a person aiming at a corner meant.
    for (const h of SCALE_HANDLES) {
      if (h.hx !== 0 && h.hy !== 0 && near(handlePoint(box, h))) return h;
    }
    for (const h of SCALE_HANDLES) {
      if ((h.hx === 0 || h.hy === 0) && near(handlePoint(box, h))) return h;
    }
    return null;
  };

  // ── Cursors ────────────────────────────────────────────────────────────────

  const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

  /** Cursor for a handle, chosen by where it actually points ON SCREEN. */
  const handleCursor = (h: HandleId, rotDeg: number): string => {
    const a = Math.atan2(h.hy, h.hx) + (rotDeg * Math.PI) / 180;
    const octant = Math.round((a / Math.PI) * 4);
    return CURSORS[((octant % 4) + 4) % 4];
  };

  const updateCursor = (e: PointerEvent) => {
    if (drag) return;
    const p = toDesign(e);
    const grabbed = handleAt(p);
    if (grabbed === 'rotate') canvas.style.cursor = 'grab';
    else if (grabbed) canvas.style.cursor = handleCursor(grabbed, session.layer()?.rot ?? 0);
    else canvas.style.cursor = layerAt(p) >= 0 ? 'move' : 'default';
  };

  // ── Gestures ───────────────────────────────────────────────────────────────

  const applyMove = (p: Pt, start: StartBox, grab: Pt) => {
    const sel = session.layer();
    if (!sel) return;
    const H = designH();
    sel.cx = clamp(start.cx + (p.x - grab.x) / DESIGN_W, POS_MIN, POS_MAX);
    sel.cy = clamp(start.cy + (p.y - grab.y) / H, POS_MIN, POS_MAX);
  };

  /**
   * Scale about the OPPOSITE corner/edge, in the layer's own rotated frame, so
   * a turned shape resizes along its own axes and the anchor stays put.
   *
   * Recomputed from the gesture's start box every move rather than accumulated:
   * an incremental version drifts, and drift on a scale handle reads as the
   * shape sliding out from under the pointer.
   */
  const applyScale = (p: Pt, start: StartBox, h: HandleId) => {
    const sel = session.layer();
    if (!sel) return;
    const H = designH();
    const rad = (start.rot * Math.PI) / 180;
    const centre = { x: start.cx * DESIGN_W, y: start.cy * H };
    const local = rotate({ x: p.x - centre.x, y: p.y - centre.y }, -rad);
    let halfW = (start.w * DESIGN_W) / 2;
    let halfH = (start.h * H) / 2;
    const minHalfW = (SIZE_MIN * DESIGN_W) / 2;
    const minHalfH = (SIZE_MIN * H) / 2;
    const anchorX = -h.hx * halfW;
    const anchorY = -h.hy * halfH;

    let newHalfW = halfW;
    let newHalfH = halfH;
    // A pointer dragged PAST the anchor doesn't flip the box inside out; the
    // edge simply stops at the minimum, which is what every editor does.
    if (h.hx) newHalfW = clamp(Math.abs(local.x - anchorX) / 2, minHalfW, (SIZE_MAX * DESIGN_W) / 2);
    if (h.hy) newHalfH = clamp(Math.abs(local.y - anchorY) / 2, minHalfH, (SIZE_MAX * H) / 2);
    // Shift on a corner keeps the shape's proportions — the usual contract, and
    // the only way to resize a circle and have it stay a circle.
    if (shiftHeld && h.hx && h.hy && halfW > 0 && halfH > 0) {
      const k = Math.max(newHalfW / halfW, newHalfH / halfH);
      newHalfW = clamp(halfW * k, minHalfW, (SIZE_MAX * DESIGN_W) / 2);
      newHalfH = clamp(halfH * k, minHalfH, (SIZE_MAX * H) / 2);
    }
    halfW = newHalfW;
    halfH = newHalfH;

    const localCentre = { x: h.hx ? anchorX + h.hx * halfW : 0, y: h.hy ? anchorY + h.hy * halfH : 0 };
    const world = rotate(localCentre, rad);
    sel.w = clamp((halfW * 2) / DESIGN_W, SIZE_MIN, SIZE_MAX);
    sel.h = clamp((halfH * 2) / H, SIZE_MIN, SIZE_MAX);
    sel.cx = clamp((centre.x + world.x) / DESIGN_W, POS_MIN, POS_MAX);
    sel.cy = clamp((centre.y + world.y) / H, POS_MIN, POS_MAX);
  };

  const applyRotate = (p: Pt, start: StartBox, grabAngle: number) => {
    const sel = session.layer();
    if (!sel) return;
    const H = designH();
    const angle = Math.atan2(p.y - start.cy * H, p.x - start.cx * DESIGN_W);
    let deg = start.rot + ((angle - grabAngle) * 180) / Math.PI;
    if (shiftHeld) deg = Math.round(deg / 15) * 15;
    // Wrapped into the rotation slider's own range, for the same reason the
    // position clamps exist: the readout must be able to say what the canvas did.
    deg = ((deg + 180) % 360 + 360) % 360 - 180;
    sel.rot = Math.round(deg * 10) / 10;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    shiftHeld = e.shiftKey;
    const p = toDesign(e);
    const grabbed = handleAt(p);
    if (grabbed && session.layer()) {
      const start = boxOf(session.layer()!);
      drag = grabbed === 'rotate'
        ? {
          kind: 'rotate',
          start,
          grabAngle: Math.atan2(p.y - start.cy * designH(), p.x - start.cx * DESIGN_W),
        }
        : { kind: 'scale', handle: grabbed, start };
    } else {
      const hit = layerAt(p);
      // An empty click KEEPS the selection. There is no "nothing selected"
      // state to fall into — the property column always edits some layer, and
      // the remote has no way to express a deselect.
      if (hit < 0) return;
      if (hit !== session.selected) session.select(hit);
      drag = { kind: 'move', grab: p, start: boxOf(session.doc.layers[hit]) };
    }
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = drag.kind === 'rotate' ? 'grabbing' : canvas.style.cursor;
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag) { updateCursor(e); return; }
    shiftHeld = e.shiftKey;
    const p = toDesign(e);
    if (drag.kind === 'move') applyMove(p, drag.start, drag.grab);
    else if (drag.kind === 'scale') applyScale(p, drag.start, drag.handle);
    else applyRotate(p, drag.start, drag.grabAngle);
    // Preview, not commit: persisting and republishing the whole brand on every
    // pointer sample is the one thing that would make this feel like mud. The
    // pointerup below is what lands it.
    session.preview();
    e.preventDefault();
  };

  const endDrag = (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    session.commit();
    updateCursor(e);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (!drag) canvas.style.cursor = 'default'; });

  // ── Painting ───────────────────────────────────────────────────────────────

  const drawSelection = (ctx: CanvasRenderingContext2D, f: ReturnType<typeof fit>, sel: EmblemLayer) => {
    const H = designH();
    const box = boxOf(sel);
    const trim = getActiveLogoSpec().textColor;
    ctx.save();
    ctx.translate(f.x + box.cx * DESIGN_W * f.scale, f.y + box.cy * H * f.scale);
    ctx.rotate((box.rot * Math.PI) / 180);
    const hw = (box.w * DESIGN_W * f.scale) / 2;
    const hh = (box.h * H * f.scale) / 2;

    // A dark under-stroke, so the dashed box reads on pale artwork too.
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);

    // The rotate stem, then the handles.
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.lineTo(0, -hh - ROTATE_ARM);
    ctx.stroke();
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.arc(0, -hh - ROTATE_ARM, HANDLE / 2 + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (const h of SCALE_HANDLES) {
      const x = h.hx * hw;
      const y = h.hy * hh;
      ctx.fillStyle = trim;
      ctx.fillRect(x - HANDLE / 2, y - HANDLE / 2, HANDLE, HANDLE);
      ctx.strokeRect(x - HANDLE / 2, y - HANDLE / 2, HANDLE, HANDLE);
    }
    ctx.restore();
  };

  const redraw = () => {
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(cw * dpr);
    const bh = Math.round(ch * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Everything below is CSS pixels; the backing store scale lives here alone.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, cw, ch);

    const f = fit();
    // Checkerboard: the universal "this is transparent" cue, and the whole
    // point of a composition that flattens with real alpha.
    for (let y = 0; y < f.h; y += CHECKER) {
      for (let x = 0; x < f.w; x += CHECKER) {
        ctx.fillStyle = ((x / CHECKER + y / CHECKER) & 1) ? '#2a3038' : '#20252c';
        ctx.fillRect(f.x + x, f.y + y, Math.min(CHECKER, f.w - x), Math.min(CHECKER, f.h - y));
      }
    }

    const sil = emblemSilhouette(session.doc);
    if (sil) {
      const art = emblemArtCanvas(
        session.doc, emblemColorsFromSpec(getActiveLogoSpec()),
        Math.round(sil.bbox.w * f.w), Math.round(sil.bbox.h * f.h),
      );
      if (art) ctx.drawImage(art, f.x + sil.bbox.x * f.w, f.y + sil.bbox.y * f.h, sil.bbox.w * f.w, sil.bbox.h * f.h);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '17px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add a shape to begin', f.x + f.w / 2, f.y + f.h / 2);
    }

    ctx.strokeStyle = 'rgba(255,204,0,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);

    const sel = session.layer();
    if (sel) drawSelection(ctx, f, sel);
  };

  /** Design coordinates → viewport CSS px. The inverse of toDesign(). */
  const toClient = (p: Pt): Pt => {
    const r = canvas.getBoundingClientRect();
    const f = fit();
    return { x: r.left + f.x + p.x * f.scale, y: r.top + f.y + p.y * f.scale };
  };

  return {
    element: canvas,
    redraw,
    isDragging: () => drag !== null,
    probe: () => {
      const sel = session.layer();
      if (!sel) return null;
      const box = boxOf(sel);
      return {
        design: (fx, fy) => toClient({ x: fx * DESIGN_W, y: fy * designH() }),
        handle: (hx, hy) => toClient(handlePoint(box, { hx, hy })),
        rotate: () => toClient(rotatePoint(box)),
      };
    },
    dispose: () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.remove();
    },
  };
}
