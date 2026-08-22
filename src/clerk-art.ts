/**
 * Procedural sprite-art generator for the store clerk billboard.
 *
 * Everything here is generated at runtime on a canvas — no downloaded assets
 * (T14 constraint: "scalable and low-maintenance"). This is the third
 * generation of the art: the launch-thread "wagon" placeholder (#46) was a
 * flat-vector clip-art figure; this pass repaints her as a proper painted
 * sprite in the classic pre-rendered/Doom-billboard tradition:
 *
 *   - adult proportions (~6.5 heads) — the old art's oversized head and
 *     too-short arms are what read as a toddler from across the store
 *   - volumetric painting: every limb is a cylinder-shaded capsule (light
 *     from the upper-left) with a core shadow and a rim-light edge, the
 *     torso and pelvis carry cross-body gradients, and cast shadows land
 *     where they belong (fringe onto forehead, chin onto neck, collar onto
 *     chest, hem onto ankle)
 *   - fabric that behaves like fabric: armpit tension folds, tuck wrinkles
 *     above the belt, trouser creases, knee-break folds on a bent leg, belt
 *     loops, slant pockets, cuffed sleeves
 *   - a real face at sprite scale — lash lines, lid creases, a nose that is
 *     shadow rather than outline, two-tone lips — and a layered bob cut from
 *     overlapping locks with strand lines and a broken specular band
 *   - a film-grain pass so nothing reads as flat vector fill
 *   - a stamped silhouette outline (classic sprite trick — keeps her legible
 *     against busy shelf backgrounds)
 *
 * The two-segment limb rig is unchanged: foot-target IK (legs, with a
 * face-on knee-splay clamp so a squat doesn't spider) and sagittal-plane
 * angles with per-direction foreshortening (arms).
 *
 * Atlas layout: 5 rows = directions (front / front-side / side / back-side /
 * back, drawn heading screen-RIGHT; the runtime mirrors for the other three
 * octants) × 16 columns = every animation frame concatenated
 * (idle 2 · walk 4 · stockHigh 2 · stockMid 2 · stockLow 2 · talk 2 · type 2).
 * Kept wide-not-tall so the texture stays under conservative GPU size caps.
 */
import { getActiveTheme } from './themes';

// ── Atlas layout (shared with clerk.ts) ─────────────────────────────────────
export const DIRS = ['front', 'frontSide', 'side', 'backSide', 'back'] as const;
export type Dir = typeof DIRS[number];

export const ANIM_ORDER = ['idle', 'walk', 'stockHigh', 'stockMid', 'stockLow', 'talk', 'type'] as const;
export type AnimKey = typeof ANIM_ORDER[number];

export const ANIM_DEF: Record<AnimKey, { frames: number; dur: number }> = {
  idle:      { frames: 2, dur: 0.6 },
  walk:      { frames: 4, dur: 0.14 },
  stockHigh: { frames: 2, dur: 0.45 },
  stockMid:  { frames: 2, dur: 0.45 },
  stockLow:  { frames: 2, dur: 0.55 },
  talk:      { frames: 2, dur: 0.35 },
  type:      { frames: 2, dur: 0.28 },
};

/** First atlas column of each animation (frames are packed left to right). */
export const ANIM_COL: Record<AnimKey, number> = (() => {
  const m = {} as Record<AnimKey, number>;
  let c = 0;
  for (const a of ANIM_ORDER) { m[a] = c; c += ANIM_DEF[a].frames; }
  return m;
})();

export const ATLAS_COLS = ANIM_ORDER.reduce((s, a) => s + ANIM_DEF[a].frames, 0); // 16
export const ATLAS_ROWS = DIRS.length; // 5
export const CELL_W = 256;
export const CELL_H = 384;

// ── Palette ─────────────────────────────────────────────────────────────────
// Skin, hair, khakis, shoes and the face are HERS. The polo and the case in
// her hand are the STORE's — the uniform is house livery, so they are derived
// from the active brand's palette (applyClerkLivery below) rather than being
// literals. The defaults here are the house green, which is what a store with
// no theme loaded would paint.
const PAL = {
  skin: '#f0c09a', skinShade: '#cf966c', skinLine: '#a96a44',
  hair: '#46311e', hairShade: '#2b1c0f', hairDeep: '#1f1409',
  hairHi: '#7a5530', hairHi2: '#a87c4e',
  polo: '#186049', poloHi: '#2d8467', poloShade: '#0f4030', poloLine: '#0a2e22',
  khaki: '#c4ae80', khakiHi: '#e0d0a4', khakiShade: '#9c8656',
  belt: '#4a3320', buckle: '#c9ab58',
  shoe: '#26262e', shoeHi: '#50505e', sole: '#dcd9d0',
  tag: '#f6f6f2', tagAccent: '#f2c230',
  iris: '#5d3a20', outline: '#241a20',
  mouth: '#9c4a3c', mouthOpen: '#571f1c', teeth: '#f4efe8',
  caseDk: '#0b3327', caseHi: '#155b45', caseLabel: '#f2e8c9',
};

/** Lighten (f > 0) / darken (f < 0) a #rrggbb color. */
function tint(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Same ramp, as #rrggbb — PAL entries have to stay hex, tint() re-parses them. */
function tintHex(hex: string, f: number): string {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(tint(hex, f))!;
  const h = (v: string) => (+v).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

/**
 * Repaint the uniform in the house colours. Called once before the atlas is
 * drawn, so a theme — or an installed brand pack — puts its own staff on the
 * floor instead of leaving the one chain's polo behind on every other brand.
 * The ramps are the shading the hand-picked palette had; only the hue moves.
 */
function applyClerkLivery(): void {
  const p = getActiveTheme().palette;
  PAL.polo = tintHex(p.primary, 0.10);
  PAL.poloHi = tintHex(p.primary, 0.28);
  PAL.poloShade = tintHex(p.primary, -0.30);
  PAL.poloLine = tintHex(p.primary, -0.48);
  // Nametag ticket-stripe wears the house accent, not a hardcoded yellow.
  PAL.tagAccent = tintHex(p.secondary, 0.05);
  // The restock case she carries is a store case: house body, trim-colour spine.
  PAL.caseDk = tintHex(p.primary, -0.45);
  PAL.caseHi = tintHex(p.primary, -0.08);
  PAL.caseLabel = tintHex(p.secondary, 0.15);
}

// ── Pose model ──────────────────────────────────────────────────────────────
interface Pose {
  strideL: number; liftL: number;   // foot forward offset (px along heading) + height off ground
  strideR: number; liftR: number;
  armL: number; elbL: number;       // sagittal shoulder angle (0 = hang down, + = forward) + relative elbow
  armR: number; elbR: number;
  squat: number;                    // 0..1 lowers the body; leg IK bends the knees
  bob: number;                      // raises the whole body (walk bounce, tip-toe)
  lean: number;                     // forward torso lean (heading direction)
  sway: number;                     // lateral weight shift (front views)
  mouth: number;                    // 0 = smile, 1 = open (talking)
  headUp: number;                   // 0..1 looking up (stocking a high shelf)
  holdCase: boolean;                // restock case in the working (right) hand
}

function poseFor(anim: AnimKey, f: number): Pose {
  const P = (o: Partial<Pose>): Pose => ({
    strideL: -2, liftL: 0, strideR: 2, liftR: 0,
    armL: 0.06, elbL: 0.14, armR: 0.06, elbR: 0.14,
    squat: 0, bob: 0, lean: 0, sway: 0, mouth: 0, headUp: 0, holdCase: false,
    ...o,
  });
  switch (anim) {
    case 'idle':
      return f === 0
        ? P({ sway: 1 })
        : P({ sway: -0.6, bob: 3, armL: 0.10, elbL: 0.20, armR: 0.03, elbR: 0.10 });
    case 'walk':
      switch (f) {
        case 0:  return P({ strideL: 30, liftL: 0, strideR: -26, liftR: 8, armL: -0.5, elbL: 0.15, armR: 0.55, elbR: 0.55, bob: 2, lean: 0.08 });
        case 1:  return P({ strideL: 8, liftL: 0, strideR: -2, liftR: 18, armL: -0.15, elbL: 0.2, armR: 0.2, elbR: 0.4, bob: 8, lean: 0.06 });
        case 2:  return P({ strideL: -26, liftL: 8, strideR: 30, liftR: 0, armL: 0.55, elbL: 0.55, armR: -0.5, elbR: 0.15, bob: 2, lean: 0.08 });
        default: return P({ strideL: -2, liftL: 18, strideR: 8, liftR: 0, armL: 0.2, elbL: 0.4, armR: -0.15, elbR: 0.2, bob: 8, lean: 0.06 });
      }
    case 'stockHigh':
      return f === 0
        ? P({ armL: 2.45, elbL: 0.20, armR: 2.60, elbR: 0.12, headUp: 1, holdCase: true, strideL: -6, strideR: 10 })
        : P({ armL: 2.55, elbL: 0.12, armR: 2.75, elbR: 0.06, headUp: 1, holdCase: true, bob: 6, liftL: 5, liftR: 5, strideL: -6, strideR: 10 });
    case 'stockMid':
      return f === 0
        ? P({ armL: 1.15, elbL: 0.5, armR: 1.35, elbR: 0.30, holdCase: true, lean: 0.08 })
        : P({ armL: 0.95, elbL: 0.55, armR: 1.55, elbR: 0.20, holdCase: true, lean: 0.10 });
    case 'stockLow':
      return f === 0
        ? P({ squat: 1, lean: 0.30, armL: 0.75, elbL: 0.55, armR: 0.95, elbR: 0.40, holdCase: true, strideL: -10, strideR: 14 })
        : P({ squat: 1, lean: 0.34, armL: 0.90, elbL: 0.50, armR: 0.70, elbR: 0.55, holdCase: true, strideL: -10, strideR: 14 });
    case 'talk':
      return f === 0
        ? P({ armR: 1.5, elbR: 1.6, armL: 0.10, elbL: 0.16, mouth: 1, headUp: 0.15, bob: 1 })
        : P({ armR: 1.3, elbR: 1.2, armL: 0.14, elbL: 0.18, mouth: 0.25 });
    case 'type':
      // Working a register terminal: both hands forward at counter height,
      // elbows bent, a slight forward lean toward the screen; the two frames
      // alternate which hand pecks so the pose reads as typing, not a freeze.
      return f === 0
        ? P({ armL: 0.72, elbL: 0.82, armR: 0.62, elbR: 0.95, lean: 0.09, sway: 0.3, strideL: -4, strideR: 4 })
        : P({ armL: 0.62, elbL: 0.95, armR: 0.72, elbR: 0.82, lean: 0.09, sway: -0.3, bob: 1, strideL: -4, strideR: 4 });
  }
}

// ── Per-direction projection factors ────────────────────────────────────────
// lat: how much of the character's left/right axis shows on screen-x.
// fwd: how much of her forward (heading, screen +x) axis shows on screen-x.
const DIRF: Record<Dir, { lat: number; fwd: number; width: number; faceShift: number }> = {
  front:     { lat: 1.00, fwd: 0.18, width: 1.00, faceShift: 0 },
  frontSide: { lat: 0.80, fwd: 0.62, width: 0.90, faceShift: 7 },
  side:      { lat: 0.18, fwd: 1.00, width: 0.56, faceShift: 10 },
  backSide:  { lat: 0.80, fwd: 0.62, width: 0.90, faceShift: -7 },
  back:      { lat: 1.00, fwd: 0.18, width: 1.00, faceShift: 0 },
};

const GROUND = 372;
// Total leg (150) sits just under the standing hip→ground gap so a relaxed
// stance keeps the knees nearly straight (only a few px of outward bend) rather
// than bowing into a wide "A"; a dropped hip during squats reintroduces plenty
// of bend for the crouch.
const THIGH = 80, SHIN = 70;
// Hanging wrists land mid-thigh (~0.44 of stature below the shoulder) — the
// old 50/46 arms stopped at the hip and read T-rex.
const ARM_UP = 60, ARM_FORE = 52;

interface Pt { x: number; y: number }

// Screen-space key light (matches applyLighting): from the upper-left.
const LIGHT_X = -0.6, LIGHT_Y = -0.8;

// ── Small canvas helpers ─────────────────────────────────────────────────────
type Ctx = CanvasRenderingContext2D;

function ell(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill as string;
  ctx.fill();
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
  ctx.fillStyle = fill as string;
  ctx.fill();
}

/** Tapered capsule path between two points (round caps, different end radii). */
function capsulePath(ctx: Ctx, a: Pt, b: Pt, r0: number, r1: number) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.arc(a.x, a.y, r0, ang + Math.PI / 2, ang - Math.PI / 2);
  ctx.arc(b.x, b.y, r1, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}

/** Flat-filled capsule (kept for hair locks and other non-volume shapes). */
function capsule(ctx: Ctx, a: Pt, b: Pt, r0: number, r1: number, fill: string | CanvasGradient) {
  capsulePath(ctx, a, b, r0, r1);
  ctx.fillStyle = fill as string;
  ctx.fill();
}

/**
 * Cylinder-shaded capsule: gradient runs perpendicular to the limb axis from
 * the lit side to the shadow side, with an optional painted core shadow and a
 * rim-light edge. This one helper is most of what separates the painted look
 * from the old flat fills.
 */
function shadeCapsule(
  ctx: Ctx, a: Pt, b: Pt, r0: number, r1: number, base: string,
  o?: { dark?: number; core?: boolean; rim?: boolean },
) {
  const dark = o?.dark ?? 0;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let px = -dy / len, py = dx / len;
  // p points toward the key light
  if (px * LIGHT_X + py * LIGHT_Y < 0) { px = -px; py = -py; }
  const R = Math.max(r0, r1);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const g = ctx.createLinearGradient(mx + px * R, my + py * R, mx - px * R, my - py * R);
  g.addColorStop(0, tint(base, dark + 0.16));
  g.addColorStop(0.38, tint(base, dark + 0.02));
  g.addColorStop(0.74, tint(base, dark - 0.14));
  g.addColorStop(1, tint(base, dark - 0.28));
  capsulePath(ctx, a, b, r0, r1);
  ctx.fillStyle = g;
  ctx.fill();
  if (o?.core !== false) {
    // core shadow: a soft dark stroke just inside the shadow edge
    ctx.save();
    capsulePath(ctx, a, b, r0, r1);
    ctx.clip();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = tint(base, dark - 0.34);
    ctx.lineWidth = R * 0.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x - px * R * 0.62, a.y - py * R * 0.62);
    ctx.lineTo(b.x - px * R * 0.62, b.y - py * R * 0.62);
    ctx.stroke();
    ctx.restore();
  }
  if (o?.rim) {
    ctx.save();
    capsulePath(ctx, a, b, r0, r1);
    ctx.clip();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = tint(base, dark + 0.34);
    ctx.lineWidth = R * 0.26;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x + px * R * 0.82, a.y + py * R * 0.82);
    ctx.lineTo(b.x + px * R * 0.82, b.y + py * R * 0.82);
    ctx.stroke();
    ctx.restore();
  }
}

function stroke(ctx: Ctx, pts: Pt[], w: number, color: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

/** Quadratic-curve stroke through a/cp/b — fabric folds, strand lines. */
function curve(ctx: Ctx, a: Pt, cp: Pt, b: Pt, w: number, color: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(cp.x, cp.y, b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Two-bone IK: joint position between `a` and target `t`, bending toward
 * bendX. `maxOut` clamps the perpendicular knee offset — a deep squat seen
 * face-on otherwise throws the knees ~60px sideways (the spider-leg bug).
 */
function ik(a: Pt, t: Pt, l1: number, l2: number, bendX: number, maxOut = 1e9): Pt {
  let dx = t.x - a.x, dy = t.y - a.y;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.5, minD = Math.abs(l1 - l2) + 0.5;
  if (d < 1e-4) { dx = 0; dy = 1; d = 1; }
  const cl = Math.min(maxD, Math.max(minD, d));
  const ux = dx / d, uy = dy / d;
  const along = (l1 * l1 - l2 * l2 + cl * cl) / (2 * cl);
  const h = Math.min(Math.sqrt(Math.max(0, l1 * l1 - along * along)), maxOut);
  // Two candidates on either side of the a→t axis; pick the one toward bendX.
  const px = -uy, py = ux;
  const k1 = { x: a.x + ux * along + px * h, y: a.y + uy * along + py * h };
  const k2 = { x: a.x + ux * along - px * h, y: a.y + uy * along - py * h };
  return (k1.x - a.x) * bendX >= (k2.x - a.x) * bendX ? k1 : k2;
}

// ── The figure ───────────────────────────────────────────────────────────────

function drawFigure(ctx: Ctx, dir: Dir, p: Pose) {
  const F = DIRF[dir];
  const front = dir === 'front', fs = dir === 'frontSide', side = dir === 'side';
  const bs = dir === 'backSide', back = dir === 'back';
  const faceVis = front || fs;

  const cx = CELL_W / 2;
  const dropY = 58 * p.squat - p.bob;
  const leanX = p.lean * 36 * F.fwd;

  const hipY = 206 + dropY;
  const beltY = hipY - 13;
  const shoulderY = 118 + dropY;
  const headCy = 85 + dropY;

  const hipX = cx + p.sway * 3.5 * F.lat;
  const chestX = cx - p.sway * 1.5 * F.lat + leanX * 0.7;
  const shoulderX = chestX + leanX * 0.3;
  const headX = shoulderX + leanX * 0.5 + F.faceShift * 0.4;

  const shoulderHalf = 38 * F.width;
  const waistHalf = 25 * F.width;
  const hipHalf = 37 * F.width;

  // ── Legs: khaki slacks, foot-target IK ──
  const hipJoint = (s: number): Pt => ({ x: hipX + s * hipHalf * 0.48, y: hipY + 8 });
  const footTarget = (s: number, stride: number, lift: number): Pt => ({
    // squat widens the stance a touch so a face-on crouch reads planted
    x: hipX + s * (hipHalf * 0.48 + 4 + 8 * p.squat) * F.lat * (side ? 0.4 : 1) + s * 4 * F.lat + stride * F.fwd,
    y: GROUND - 9 - lift,
  });
  const wScale = 0.72 + 0.28 * F.width;
  const legR = { r0: 14 * wScale, r1: 9.6 * wScale };

  const drawLeg = (s: number, stride: number, lift: number, dark: number) => {
    const h = hipJoint(s), t = footTarget(s, stride, lift);
    // Knees bend toward the heading in profile-ish views, outward face-on —
    // but only a little outward: face-on squats clamp the splay.
    const bendX = F.fwd >= 0.5 ? 1 : (s || 1) * 0.8 + 0.3 * F.fwd;
    const k = ik(h, t, THIGH, SHIN, bendX, F.fwd >= 0.5 ? 1e9 : 24);
    shadeCapsule(ctx, h, k, legR.r0, legR.r1, PAL.khaki, { dark });
    shadeCapsule(ctx, k, t, legR.r1 * 0.94, legR.r1 * 0.80, PAL.khaki, { dark });
    // pressed center crease down the front of the trouser leg
    curve(ctx, { x: h.x + 3, y: h.y + 16 }, { x: k.x + 2, y: k.y }, { x: t.x + 2, y: t.y - 6 },
      2, tint(PAL.khakiHi, dark + 0.06), 0.45);
    // knee-break folds when the leg is meaningfully bent
    const bend = Math.abs((k.x - h.x) * (t.y - k.y) - (k.y - h.y) * (t.x - k.x)) /
      (Math.hypot(k.x - h.x, k.y - h.y) * Math.hypot(t.x - k.x, t.y - k.y) + 1e-6);
    if (bend > 0.25) {
      curve(ctx, { x: k.x - legR.r1 * 0.7, y: k.y - 2 }, { x: k.x, y: k.y + 3 }, { x: k.x + legR.r1 * 0.7, y: k.y - 1 },
        1.8, tint(PAL.khakiShade, dark), 0.5);
      curve(ctx, { x: k.x - legR.r1 * 0.55, y: k.y + 5 }, { x: k.x, y: k.y + 9 }, { x: k.x + legR.r1 * 0.55, y: k.y + 6 },
        1.5, tint(PAL.khakiShade, dark), 0.35);
    }
    // hem break: fabric stacking on the shoe
    stroke(ctx, [{ x: t.x - legR.r1 * 0.82, y: t.y - 5 }, { x: t.x + legR.r1 * 0.82, y: t.y - 5 }], 3,
      tint(PAL.khakiShade, dark), 0.5);
    stroke(ctx, [{ x: t.x - legR.r1 * 0.6, y: t.y - 9 }, { x: t.x + legR.r1 * 0.5, y: t.y - 10 }], 1.6,
      tint(PAL.khakiShade, dark), 0.3);
    drawShoe(ctx, t, dir, s, dark);
    return t;
  };

  // Far leg first (darkened) in the profile-ish views; in face-on views draw
  // left then right (no depth difference worth showing).
  const farIsLeft = fs || side || bs;
  if (farIsLeft) {
    drawLeg(-1, p.strideL, p.liftL, -0.18);
    drawLeg(1, p.strideR, p.liftR, 0);
  } else {
    drawLeg(-1, p.strideL, p.liftL, 0);
    drawLeg(1, p.strideR, p.liftR, 0);
  }

  // ── Pelvis / hips (khaki) ──
  const hipGrad = ctx.createLinearGradient(hipX - hipHalf, 0, hipX + hipHalf, 0);
  hipGrad.addColorStop(0, tint(PAL.khaki, 0.12));
  hipGrad.addColorStop(0.45, PAL.khaki);
  hipGrad.addColorStop(1, tint(PAL.khaki, -0.22));
  if (side) {
    // profile pelvis: flat-ish front, seat curve at the back
    ctx.beginPath();
    ctx.moveTo(hipX - hipHalf * 0.9, beltY + 2);
    ctx.quadraticCurveTo(hipX - hipHalf * 1.55, hipY + 8, hipX - hipHalf * 0.85, hipY + 32);
    ctx.lineTo(hipX + hipHalf * 0.85, hipY + 32);
    ctx.quadraticCurveTo(hipX + hipHalf * 1.12, hipY + 6, hipX + hipHalf * 0.95, beltY + 2);
    ctx.closePath();
    ctx.fillStyle = hipGrad;
    ctx.fill();
    // under-seat core shadow
    curve(ctx, { x: hipX - hipHalf * 1.2, y: hipY + 16 }, { x: hipX - hipHalf * 0.9, y: hipY + 26 },
      { x: hipX - hipHalf * 0.3, y: hipY + 28 }, 3, PAL.khakiShade, 0.4);
    // front pocket slant
    curve(ctx, { x: hipX + hipHalf * 0.75, y: beltY + 6 }, { x: hipX + hipHalf * 0.55, y: hipY },
      { x: hipX + hipHalf * 0.28, y: hipY + 8 }, 1.6, PAL.khakiShade, 0.5);
  } else {
    rr(ctx, hipX - hipHalf, beltY + 2, hipHalf * 2, 36, 14, hipGrad);
    if (back) {
      // seat: two soft rounds under a yoke seam, patch pockets on top
      ell(ctx, hipX - hipHalf * 0.44, hipY + 14, hipHalf * 0.42, 13, tint(PAL.khaki, -0.05));
      ell(ctx, hipX + hipHalf * 0.44, hipY + 14, hipHalf * 0.42, 13, tint(PAL.khaki, -0.14));
      curve(ctx, { x: hipX - hipHalf * 0.85, y: beltY + 9 }, { x: hipX, y: beltY + 13 },
        { x: hipX + hipHalf * 0.85, y: beltY + 9 }, 1.6, PAL.khakiShade, 0.5);
      stroke(ctx, [{ x: hipX, y: hipY + 4 }, { x: hipX, y: hipY + 26 }], 2, PAL.khakiShade, 0.6);
      for (const s of [-1, 1]) {
        const px0 = hipX + s * hipHalf * 0.44;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = PAL.khakiShade;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(px0 - 8, hipY - 1, 16, 12);
        ctx.restore();
      }
    } else if (bs) {
      ell(ctx, hipX - hipHalf * 0.6, hipY + 12, hipHalf * 0.46, 15, tint(PAL.khaki, -0.10));
      curve(ctx, { x: hipX - hipHalf * 0.8, y: beltY + 9 }, { x: hipX, y: beltY + 12 },
        { x: hipX + hipHalf * 0.7, y: beltY + 8 }, 1.6, PAL.khakiShade, 0.45);
    }
    if (front || fs) {
      // fly stitch + crotch shade + slant pockets
      stroke(ctx, [{ x: hipX + 1, y: beltY + 10 }, { x: hipX + 1, y: hipY + 14 }], 1.8, PAL.khakiShade, 0.55);
      curve(ctx, { x: hipX - 4, y: hipY + 18 }, { x: hipX + 1, y: hipY + 24 }, { x: hipX + 6, y: hipY + 18 },
        2.5, PAL.khakiShade, 0.35);
      for (const s of [-1, 1]) {
        curve(ctx, { x: hipX + s * hipHalf * 0.92, y: beltY + 7 }, { x: hipX + s * hipHalf * 0.66, y: hipY - 2 },
          { x: hipX + s * hipHalf * 0.5, y: hipY + 8 }, 1.6, PAL.khakiShade, 0.5);
      }
    }
  }

  // ── Belt + loops ──
  const beltHalf = side ? hipHalf * 0.95 : hipHalf;
  rr(ctx, hipX - beltHalf, beltY - 3, beltHalf * 2, 9, 4, PAL.belt);
  stroke(ctx, [{ x: hipX - beltHalf + 2, y: beltY - 1.4 }, { x: hipX + beltHalf - 2, y: beltY - 1.4 }],
    1.2, tint(PAL.belt, 0.4), 0.55);
  if (faceVis) {
    const bx = hipX + F.faceShift * 0.8;
    rr(ctx, bx - 5.5, beltY - 4.5, 11, 11, 2, PAL.buckle);
    rr(ctx, bx - 3, beltY - 2, 6, 6, 1, tint(PAL.buckle, -0.45));
    ell(ctx, bx - 3, beltY - 2.4, 1.4, 1.4, tint(PAL.buckle, 0.5));
  }
  // belt loops (khaki tabs over the strap)
  const loopXs = back || front ? [-0.72, 0, 0.72] : side ? [-0.5, 0.45] : [-0.72, 0.1, 0.8];
  for (const lx of loopXs) {
    if (faceVis && Math.abs(lx * hipHalf - F.faceShift * 0.8) < 9) continue; // not through the buckle
    rr(ctx, hipX + lx * beltHalf - 2, beltY - 4.5, 4.5, 12, 1.5, tint(PAL.khaki, -0.06));
  }

  // ── Arms ──
  const armF = Math.max(F.fwd, 0.30) * (side ? 0.86 : 1);
  const drawArm = (s: number, ang: number, elb: number, dark: number): Pt => {
    const sx = shoulderX + s * (shoulderHalf - 4) * (side ? 0.5 : 1);
    const sy = shoulderY + 10;
    const splay = s * 0.10 * F.lat;
    const eX = sx + (Math.sin(ang) * armF + Math.sin(splay)) * ARM_UP;
    const eY = sy + Math.cos(ang) * ARM_UP;
    const wX = eX + (Math.sin(ang + elb) * armF + Math.sin(splay)) * ARM_FORE;
    const wY = eY + Math.cos(ang + elb) * ARM_FORE;
    const sh: Pt = { x: sx, y: sy }, el: Pt = { x: eX, y: eY }, wr: Pt = { x: wX, y: wY };
    // upper arm skin (peeks past the sleeve), then the polo sleeve over it
    shadeCapsule(ctx, sh, el, 9.2, 7.6, PAL.skin, { dark });
    const sleeveEnd: Pt = { x: sx + (eX - sx) * 0.62, y: sy + (eY - sy) * 0.62 };
    shadeCapsule(ctx, { x: sx + (eX - sx) * 0.04, y: sy + (eY - sy) * 0.04 }, sleeveEnd, 9.8, 9.2, PAL.polo, { dark });
    // cuff band + opening shadow where the arm exits the sleeve
    const cuffT = { x: sleeveEnd.x, y: sleeveEnd.y };
    const ca = Math.atan2(eY - sy, eX - sx);
    stroke(ctx, [
      { x: cuffT.x - Math.sin(ca) * 9, y: cuffT.y + Math.cos(ca) * 9 },
      { x: cuffT.x + Math.sin(ca) * 9, y: cuffT.y - Math.cos(ca) * 9 },
    ], 3.4, tint(PAL.poloShade, dark), 0.75);
    stroke(ctx, [
      { x: cuffT.x - Math.sin(ca) * 7 + Math.cos(ca) * 3, y: cuffT.y + Math.cos(ca) * 7 + Math.sin(ca) * 3 },
      { x: cuffT.x + Math.sin(ca) * 7 + Math.cos(ca) * 3, y: cuffT.y - Math.cos(ca) * 7 + Math.sin(ca) * 3 },
    ], 2, tint(PAL.skinShade, dark), 0.4);
    // forearm, wrist taper, hand with a thumb
    shadeCapsule(ctx, el, wr, 7.6, 5.8, PAL.skin, { dark });
    const ha = ang + elb;
    const hx2 = wX + (Math.sin(ha) * armF) * 7, hy2 = wY + Math.cos(ha) * 7;
    ell(ctx, hx2, hy2, 6, 7, tint(PAL.skin, dark - 0.02));
    ell(ctx, hx2 - Math.cos(ha) * 3.8 * (faceVis || side ? 1 : -1), hy2 + Math.sin(ha) * 2.5, 2.8, 3.6,
      tint(PAL.skin, dark + 0.04));
    // finger crease hint + soft palm shade
    ell(ctx, hx2 + 1.6, hy2 + 2.2, 3, 2.2, tint(PAL.skinShade, dark + 0.28));
    ell(ctx, hx2 - 0.6, hy2 - 0.6, 4, 4.8, tint(PAL.skin, dark + 0.03));
    return { x: hx2, y: hy2 };
  };

  if (fs || side || bs) drawArm(-1, p.armL, p.elbL, -0.20);

  // ── Torso: polo, tucked at the belt ──
  const chestY = shoulderY + 40;
  const waistY = beltY - 6;
  const poloGrad = ctx.createLinearGradient(chestX - shoulderHalf, 0, chestX + shoulderHalf, 0);
  poloGrad.addColorStop(0, tint(PAL.polo, 0.18));
  poloGrad.addColorStop(0.42, tint(PAL.polo, 0.02));
  poloGrad.addColorStop(0.78, tint(PAL.polo, -0.14));
  poloGrad.addColorStop(1, tint(PAL.polo, -0.26));
  if (side) {
    // profile torso: bust integrated into the front silhouette, shoulder
    // blade + lumbar curve at the back — no pasted-on blob.
    ctx.beginPath();
    ctx.moveTo(shoulderX - shoulderHalf * 0.9, shoulderY + 4);
    ctx.quadraticCurveTo(chestX - shoulderHalf - 4, chestY - 8, chestX - shoulderHalf * 0.8, chestY + 12);
    ctx.quadraticCurveTo(chestX - waistHalf - 3, waistY - 4, hipX - hipHalf * 0.9, beltY + 1);
    ctx.lineTo(hipX + hipHalf * 0.92, beltY + 1);
    ctx.quadraticCurveTo(chestX + waistHalf + 2, waistY - 2, chestX + waistHalf + 4, chestY + 14);
    ctx.quadraticCurveTo(chestX + shoulderHalf + 12, chestY + 2, chestX + shoulderHalf + 6, chestY - 12);
    ctx.quadraticCurveTo(chestX + shoulderHalf - 2, shoulderY + 8, shoulderX + shoulderHalf * 0.75, shoulderY + 2);
    ctx.quadraticCurveTo(shoulderX, shoulderY - 8, shoulderX - shoulderHalf * 0.9, shoulderY + 4);
    ctx.closePath();
    ctx.fillStyle = poloGrad;
    ctx.fill();
    // under-bust shadow + a fold running back toward the waist
    curve(ctx, { x: chestX + shoulderHalf + 2, y: chestY + 10 }, { x: chestX + shoulderHalf * 0.5, y: chestY + 16 },
      { x: chestX + 2, y: chestY + 12 }, 2.6, PAL.poloShade, 0.45);
    curve(ctx, { x: chestX + waistHalf, y: waistY - 14 }, { x: chestX, y: waistY - 10 },
      { x: chestX - waistHalf * 0.8, y: waistY - 16 }, 1.8, PAL.poloShade, 0.3);
  } else {
    ctx.beginPath();
    ctx.moveTo(shoulderX - shoulderHalf, shoulderY + 6);
    ctx.quadraticCurveTo(chestX - shoulderHalf - 2, chestY, chestX - waistHalf, waistY);
    ctx.lineTo(hipX - hipHalf * 0.92, beltY + 1);
    ctx.lineTo(hipX + hipHalf * 0.92, beltY + 1);
    ctx.lineTo(chestX + waistHalf, waistY);
    ctx.quadraticCurveTo(chestX + shoulderHalf + 2, chestY, shoulderX + shoulderHalf, shoulderY + 6);
    ctx.quadraticCurveTo(shoulderX, shoulderY - 9, shoulderX - shoulderHalf, shoulderY + 6);
    ctx.closePath();
    ctx.fillStyle = poloGrad;
    ctx.fill();
  }

  // fabric behavior: armpit tension folds (front-ish only — on the back they
  // crossed into a trussed X) + tuck wrinkles above the belt
  if (faceVis) {
    for (const s of [-1, 1]) {
      curve(ctx, { x: chestX + s * (shoulderHalf - 6), y: shoulderY + 24 },
        { x: chestX + s * shoulderHalf * 0.45, y: chestY + 6 },
        { x: chestX + s * waistHalf * 0.4, y: chestY + 18 }, 1.8, PAL.poloShade, s > 0 ? 0.26 : 0.18);
    }
  }
  if (!side) {
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const wx = hipX + i * waistHalf * 0.34;
      stroke(ctx, [{ x: wx, y: waistY + 2 }, { x: wx + i, y: beltY - 1 }], 1.5, PAL.poloShade, 0.3);
    }
  }
  // blouse-over shadow where the polo tucks
  stroke(ctx, [{ x: hipX - hipHalf * 0.8, y: beltY - 1.5 }, { x: hipX + hipHalf * 0.8, y: beltY - 1.5 }],
    3, PAL.poloShade, 0.4);

  // bust shading (front-ish views; profile is in the silhouette)
  if (fs) {
    ell(ctx, chestX + shoulderHalf * 0.34, chestY - 4, shoulderHalf * 0.42, 13, tint(PAL.polo, 0.09));
    curve(ctx, { x: chestX - shoulderHalf * 0.2, y: chestY + 8 }, { x: chestX + shoulderHalf * 0.3, y: chestY + 13 },
      { x: chestX + shoulderHalf * 0.72, y: chestY + 6 }, 2.4, PAL.poloShade, 0.25);
  } else if (front) {
    ell(ctx, chestX - shoulderHalf * 0.33, chestY - 6, shoulderHalf * 0.34, 11, tint(PAL.polo, 0.08));
    ell(ctx, chestX + shoulderHalf * 0.33, chestY - 6, shoulderHalf * 0.34, 11, tint(PAL.polo, 0.05));
    for (const s of [-1, 1]) {
      curve(ctx, { x: chestX + s * shoulderHalf * 0.62, y: chestY + 4 }, { x: chestX + s * shoulderHalf * 0.33, y: chestY + 10 },
        { x: chestX + s * shoulderHalf * 0.06, y: chestY + 5 }, 2.2, PAL.poloShade, 0.2);
    }
  }

  // ── Neck (before the collar, so the shirt dresses the neck base) ──
  if (!back) {
    shadeCapsule(ctx, { x: headX, y: headCy + 16 }, { x: shoulderX + F.faceShift * 0.4, y: shoulderY + 6 },
      7, 9, PAL.skin, { core: false });
    if (faceVis) ell(ctx, headX, headCy + 23, 6.6, 3.2, 'rgba(150,90,60,0.35)');
  } else {
    capsule(ctx, { x: headX, y: headCy + 14 }, { x: shoulderX, y: shoulderY - 2 }, 7, 8, tint(PAL.skin, -0.08));
  }

  // ── Collar, placket, nametag ──
  if (faceVis) {
    const nx = shoulderX + F.faceShift * 0.6;
    // folded collar: a crescent ribbon wrapping the neck base under the flaps
    ctx.fillStyle = tint(PAL.polo, -0.15);
    ctx.beginPath();
    ctx.moveTo(nx - 15, shoulderY - 1);
    ctx.quadraticCurveTo(nx, shoulderY + 7, nx + 15, shoulderY - 1);
    ctx.quadraticCurveTo(nx + 10, shoulderY + 12, nx, shoulderY + 13);
    ctx.quadraticCurveTo(nx - 10, shoulderY + 12, nx - 15, shoulderY - 1);
    ctx.closePath();
    ctx.fill();
    // cast shadow under the collar
    curve(ctx, { x: nx - 14, y: shoulderY + 14 }, { x: nx, y: shoulderY + 18 }, { x: nx + 14, y: shoulderY + 14 },
      3, PAL.poloShade, 0.3);
    // placket + buttons
    stroke(ctx, [{ x: nx, y: shoulderY + 8 }, { x: nx, y: shoulderY + 32 }], 2.2, PAL.poloLine, 0.8);
    for (const by of [shoulderY + 17, shoulderY + 26]) {
      ctx.fillStyle = tint(PAL.polo, 0.4);
      ctx.beginPath(); ctx.arc(nx + 2.6, by, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tint(PAL.polo, -0.3);
      ctx.beginPath(); ctx.arc(nx + 3.1, by + 0.6, 0.8, 0, Math.PI * 2); ctx.fill();
    }
    // collar flaps with a lit top edge
    for (const s of [-1, 1]) {
      ctx.fillStyle = tint(PAL.polo, s < 0 ? -0.10 : -0.20);
      ctx.beginPath();
      ctx.moveTo(nx + s * 15, shoulderY - 3);
      ctx.lineTo(nx + s * 2, shoulderY + 2);
      ctx.lineTo(nx + s * 10, shoulderY + 15);
      ctx.closePath(); ctx.fill();
      stroke(ctx, [{ x: nx + s * 15, y: shoulderY - 3 }, { x: nx + s * 2, y: shoulderY + 2 }],
        1.4, tint(PAL.polo, 0.18), 0.7);
    }
    // nametag on her left chest (screen right), house accent ticket-stripe
    const tx = chestX + shoulderHalf * 0.4, ty = shoulderY + 28;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(-0.035);
    rr(ctx, -12, -5.5, 24, 12, 2, PAL.tag);
    rr(ctx, -12, -5.5, 5.5, 12, 2, PAL.tagAccent);
    stroke(ctx, [{ x: -3.5, y: -1 }, { x: 9, y: -1 }], 1.8, PAL.polo, 0.85);
    stroke(ctx, [{ x: -3.5, y: 2.6 }, { x: 6, y: 2.6 }], 1.2, PAL.polo, 0.5);
    ctx.restore();
  } else if (back || bs) {
    // back collar band + shoulder-yoke seam + a center back fold
    const bw = back ? 0.42 : 0.36;
    rr(ctx, shoulderX - shoulderHalf * bw, shoulderY - 5, shoulderHalf * bw * 2, 11, 5, tint(PAL.polo, -0.18));
    stroke(ctx, [{ x: shoulderX - shoulderHalf * bw + 2, y: shoulderY - 3 },
      { x: shoulderX + shoulderHalf * bw - 2, y: shoulderY - 3 }], 1.2, tint(PAL.polo, 0.1), 0.6);
    curve(ctx, { x: shoulderX - shoulderHalf * 0.8, y: shoulderY + 15 }, { x: shoulderX, y: shoulderY + 18 },
      { x: shoulderX + shoulderHalf * 0.8, y: shoulderY + 15 }, 1.8, PAL.poloShade, 0.4);
    if (back) {
      stroke(ctx, [{ x: shoulderX + 3, y: chestY + 6 }, { x: shoulderX + 1, y: waistY - 2 }], 1.8, PAL.poloShade, 0.28);
    }
  }

  // nape shadow right under the bob's fall
  if (back) ell(ctx, headX, headCy + 29, 6.5, 2.6, 'rgba(120,70,40,0.28)');

  // ── Head ──
  drawHead(ctx, dir, p, headX, headCy);

  // ── Near arm(s) ──
  let rightHand: Pt;
  if (fs || side || bs) {
    rightHand = drawArm(1, p.armR, p.elbR, 0);
  } else {
    drawArm(-1, p.armL, p.elbL, 0);
    rightHand = drawArm(1, p.armR, p.elbR, 0);
  }

  // ── Restock case in the working hand ──
  if (p.holdCase && !back && !bs) drawCase(ctx, rightHand.x + 2 * F.fwd - (side ? 4 : 0), rightHand.y + 2, side ? -0.12 : -0.2);
}

function drawShoe(ctx: Ctx, ankle: Pt, dir: Dir, s: number, dark: number) {
  const body = tint(PAL.shoe, dark), hi = tint(PAL.shoeHi, dark), sole = tint(PAL.sole, dark);
  const ax = ankle.x, ay = ankle.y;
  if (dir === 'side' || dir === 'frontSide' || dir === 'backSide') {
    const len = dir === 'side' ? 36 : 29;
    // upper: heel counter → toe box
    ctx.beginPath();
    ctx.moveTo(ax - 10, ay - 5);
    ctx.quadraticCurveTo(ax - 13, ay + 3, ax - 11, ay + 6);
    ctx.lineTo(ax + len - 12, ay + 6);
    ctx.quadraticCurveTo(ax + len, ay + 5, ax + len - 2, ay);
    ctx.quadraticCurveTo(ax + len - 7, ay - 5, ax + 5, ay - 6);
    ctx.quadraticCurveTo(ax - 3, ay - 7, ax - 10, ay - 5);
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill();
    // midsole with a toe-spring curve + colored heel stripe
    ctx.beginPath();
    ctx.moveTo(ax - 12, ay + 5);
    ctx.lineTo(ax + len - 6, ay + 5);
    ctx.quadraticCurveTo(ax + len + 1, ay + 4.5, ax + len - 1, ay + 1.5);
    ctx.lineTo(ax + len + 1, ay + 6);
    ctx.quadraticCurveTo(ax + len - 4, ay + 9.5, ax + len - 14, ay + 9.5);
    ctx.lineTo(ax - 10, ay + 9.5);
    ctx.quadraticCurveTo(ax - 13, ay + 8, ax - 12, ay + 5);
    ctx.closePath();
    ctx.fillStyle = sole; ctx.fill();
    stroke(ctx, [{ x: ax - 11, y: ay + 7.4 }, { x: ax + len - 8, y: ay + 7.4 }], 1.2, tint(PAL.sole, -0.25), 0.6);
    // laces: three crossing ticks over the instep
    for (let i = 0; i < 3; i++) {
      const lx = ax + 2 + i * 6 * (len / 36);
      stroke(ctx, [{ x: lx, y: ay - 4 + i * 0.6 }, { x: lx + 4, y: ay - 1 + i * 0.6 }], 1.4, hi, 0.8);
    }
    // toe-cap seam + heel tab
    curve(ctx, { x: ax + len - 12, y: ay - 3.5 }, { x: ax + len - 8, y: ay + 1 }, { x: ax + len - 11, y: ay + 5 },
      1.3, hi, 0.5);
    stroke(ctx, [{ x: ax - 9, y: ay - 5 }, { x: ax - 9, y: ay + 1 }], 2, hi, 0.4);
  } else if (dir === 'back') {
    rr(ctx, ax - 10, ay - 5, 20, 12, 4, body);
    rr(ctx, ax - 11, ay + 4, 22, 6, 2.5, sole);
    stroke(ctx, [{ x: ax - 11, y: ay + 7.6 }, { x: ax + 11, y: ay + 7.6 }], 1.2, tint(PAL.sole, -0.25), 0.6);
    // heel-counter tab
    rr(ctx, ax - 2, ay - 5, 4, 7, 1.5, hi);
  } else {
    // front: toe box facing the camera, lace throat above it
    ell(ctx, ax, ay + 1, 12, 7.5, body);
    ell(ctx, ax, ay - 3.5, 8, 4, tint(PAL.shoe, dark + 0.1));
    for (let i = 0; i < 2; i++) {
      stroke(ctx, [{ x: ax - 4, y: ay - 4.5 + i * 2.4 }, { x: ax + 4, y: ay - 4.5 + i * 2.4 }], 1.2, hi, 0.7);
    }
    rr(ctx, ax - 12, ay + 4, 24, 5.5, 2.5, sole);
    ell(ctx, ax - 3, ay + 1, 4.5, 2.5, hi);
    void s;
  }
}

function drawCase(ctx: Ctx, x: number, y: number, tilt: number) {
  ctx.save();
  // never let the case (or its stamped outline) run off the cell edge
  ctx.translate(Math.min(x, CELL_W - 20), y);
  ctx.rotate(tilt);
  const g = ctx.createLinearGradient(-16, -12, 16, 12);
  g.addColorStop(0, PAL.caseHi);
  g.addColorStop(1, PAL.caseDk);
  rr(ctx, -16, -12, 32, 24, 3, g);
  rr(ctx, -12.5, -9, 25, 18, 2, tint(PAL.caseHi, 0.08));
  rr(ctx, -16, -12, 6, 24, 2, PAL.caseLabel);
  rr(ctx, -8, -5.5, 16, 3, 1, 'rgba(244,244,240,0.85)');
  rr(ctx, -8, 0.5, 12, 2.5, 1, 'rgba(244,244,240,0.55)');
  stroke(ctx, [{ x: -15, y: -11 }, { x: 14, y: -11 }], 1.4, tint(PAL.caseHi, 0.35), 0.7);
  ctx.restore();
}

// ── Head + face + layered bob ───────────────────────────────────────────────

function drawHead(ctx: Ctx, dir: Dir, p: Pose, hx: number, cy: number) {
  const front = dir === 'front', fs = dir === 'frontSide', side = dir === 'side';
  const bs = dir === 'backSide', back = dir === 'back';
  const uy = -3.5 * p.headUp; // features shift up when she looks up

  if (front || fs) {
    const fshift = fs ? 5 : 0;
    const fx = hx + fshift;

    // hair behind the head: crown mass + side curtains that stop AT the jaw
    // (the old full ellipse spilled below the chin and read as a beard in 3/4)
    ell(ctx, hx, cy - 8, 22, 17, PAL.hairShade);
    capsule(ctx, { x: hx - 18, y: cy - 8 }, { x: hx - 19.5, y: cy + 17 }, 7.5, 6, PAL.hairShade);
    capsule(ctx, { x: hx + 18, y: cy - 8 }, { x: hx + 19.5, y: cy + 17 }, 7.5, 6, PAL.hairShade);

    // face: soft oval, cheeks, tapered chin
    const skinGrad = ctx.createLinearGradient(fx - 14, cy - 16, fx + 14, cy + 18);
    skinGrad.addColorStop(0, tint(PAL.skin, 0.10));
    skinGrad.addColorStop(0.55, PAL.skin);
    skinGrad.addColorStop(1, tint(PAL.skin, -0.10));
    ctx.beginPath();
    ctx.moveTo(fx - 15, cy - 8);
    ctx.quadraticCurveTo(fx - 16, cy + 8, fx - 8, cy + 17);
    ctx.quadraticCurveTo(fx - 3, cy + 21.5, fx, cy + 21.5);
    ctx.quadraticCurveTo(fx + 3, cy + 21.5, fx + 8, cy + 17);
    ctx.quadraticCurveTo(fx + 16, cy + 8, fx + 15, cy - 8);
    ctx.quadraticCurveTo(fx + 13, cy - 19, fx, cy - 20);
    ctx.quadraticCurveTo(fx - 13, cy - 19, fx - 15, cy - 8);
    ctx.closePath();
    ctx.fillStyle = skinGrad;
    ctx.fill();
    // jaw core shadow (screen-right) + chin dab
    curve(ctx, { x: fx + 13, y: cy + 2 }, { x: fx + 12, y: cy + 13 }, { x: fx + 4, y: cy + 19.5 },
      2.4, PAL.skinShade, 0.30);
    ell(ctx, fx, cy + 18.6, 3.2, 1.4, 'rgba(150,90,60,0.18)');

    // features
    const eo = fs ? 3.5 : 0;             // eyes drift toward the heading
    const eyeY = cy + 2.5 + uy;
    for (const s of [-1, 1]) {
      const ex = fx + s * 7.2 + eo;
      const w = fs && s < 0 ? 0.78 : 1;  // far eye narrower in 3/4
      // socket shading + lid crease
      ell(ctx, ex, eyeY - 1, 5.6 * w, 3.6, 'rgba(160,100,70,0.14)');
      // white + iris + pupil + catchlight
      ell(ctx, ex, eyeY, 4.4 * w, 2.9, '#fbf3ea');
      ell(ctx, ex + eo * 0.35, eyeY + 0.3, 2.5 * w, 2.5, PAL.iris);
      ell(ctx, ex + eo * 0.35, eyeY + 0.4, 1.3 * w, 1.3, '#170e08');
      ell(ctx, ex + eo * 0.35 - 0.8, eyeY - 0.6, 0.7, 0.7, '#ffffff');
      ctx.save();
      ctx.strokeStyle = '#2a1a12'; ctx.lineCap = 'round';
      // heavy upper lash line + outer flick
      ctx.lineWidth = 2.0;
      ctx.beginPath(); ctx.arc(ex, eyeY + 1.4, 4.6 * w, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ex + s * 4.4 * w, eyeY - 1.6);
      ctx.lineTo(ex + s * 6.2 * w, eyeY - 2.8);
      ctx.stroke();
      // faint lower lash at the outer corner
      ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ex + s * 1, eyeY - 0.6, 4.2 * w, s > 0 ? 0.15 : Math.PI * 0.6, s > 0 ? Math.PI * 0.4 : Math.PI * 0.85); ctx.stroke();
      ctx.globalAlpha = 1;
      // lid crease
      ctx.globalAlpha = 0.3; ctx.lineWidth = 1.1; ctx.strokeStyle = PAL.skinLine;
      ctx.beginPath(); ctx.arc(ex, eyeY + 2.2, 5.4 * w, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      ctx.restore();
      // brow: tapered, slightly angled
      ctx.save();
      ctx.strokeStyle = tintHex(PAL.hair, -0.15); ctx.lineCap = 'round';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ex - s * 4.6 * w, eyeY - 5.2);
      ctx.quadraticCurveTo(ex + s * 1 * w, eyeY - 7.4, ex + s * 5 * w, eyeY - 5.8);
      ctx.stroke();
      ctx.restore();
    }
    // nose: shadow, not outline — bridge tick, alar shadow, tip light
    stroke(ctx, [{ x: fx + 1 + eo * 0.4, y: cy + 6 + uy }, { x: fx + 1.8 + eo * 0.4, y: cy + 9.5 + uy }],
      1.6, PAL.skinShade, 0.45);
    ell(ctx, fx + eo * 0.4, cy + 10.8 + uy, 2.8, 1.3, 'rgba(150,90,60,0.30)');
    ell(ctx, fx - 0.6 + eo * 0.4, cy + 8.6 + uy, 1, 1.6, tint(PAL.skin, 0.18));
    // mouth: two-tone lips
    const my = cy + 15.5 + uy;
    if (p.mouth > 0.4) {
      ell(ctx, fx + eo * 0.4, my + 0.6, 4.4, 3.8 * p.mouth, PAL.mouthOpen);
      rr(ctx, fx + eo * 0.4 - 3, my - 2.2, 6, 1.9, 0.8, PAL.teeth);
      ell(ctx, fx + eo * 0.4, my + 2.6, 2.6, 1.1, tint(PAL.mouth, 0.25));
    } else {
      ctx.save();
      ctx.strokeStyle = tintHex(PAL.mouth, -0.2); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(fx + eo * 0.4, my - 2.6, 4.8, 0.4, Math.PI - 0.4); ctx.stroke();
      ctx.restore();
      // lower lip with a highlight
      ell(ctx, fx + eo * 0.4, my + 0.8, 3.2, 1.6 + p.mouth * 2, tint(PAL.mouth, 0.15));
      ell(ctx, fx + eo * 0.4 - 0.8, my + 0.6, 1.4, 0.7, tint(PAL.mouth, 0.5));
    }
    // blush: low, wide, subtle
    ell(ctx, fx - 10.5 + eo, cy + 10 + uy, 3.6, 2, 'rgba(232,120,96,0.16)');
    ell(ctx, fx + 10.5 + eo, cy + 10 + uy, 3.6, 2, 'rgba(232,120,96,0.16)');

    // under-fringe cast shadow on the forehead
    curve(ctx, { x: fx - 12, y: cy - 8.5 }, { x: fx, y: cy - 3.5 }, { x: fx + 12, y: cy - 8.5 },
      3.6, 'rgba(120,70,40,0.22)', 1);

    // fringe + crown: scalloped clumps
    ctx.fillStyle = PAL.hair;
    ctx.beginPath();
    ctx.moveTo(hx - 19, cy + 2);
    ctx.quadraticCurveTo(hx - 23, cy - 16, hx - 8, cy - 23);
    ctx.quadraticCurveTo(hx + 8, cy - 27, hx + 20, cy - 9);
    ctx.quadraticCurveTo(hx + 21.5, cy - 3, hx + 19, cy + 2);
    ctx.quadraticCurveTo(hx + 16.5, cy - 6, hx + 11, cy - 5.5);
    ctx.quadraticCurveTo(hx + 7, cy - 1.5, hx + 2, cy - 6.5);
    ctx.quadraticCurveTo(hx - 4, cy - 1.5, hx - 9, cy - 6);
    ctx.quadraticCurveTo(hx - 15, cy - 1, hx - 19, cy + 2);
    ctx.closePath();
    ctx.fill();
    // side locks framing the face to the jaw, tips curling in
    for (const s of [-1, 1]) {
      capsule(ctx, { x: hx + s * 19, y: cy - 5 }, { x: hx + s * 16.5, y: cy + 18 }, 6.5, 4.5, PAL.hair);
      ell(ctx, hx + s * 15, cy + 20.5, 4.5, 3.5, PAL.hair);
      // inner edge shadow against the face
      stroke(ctx, [{ x: hx + s * 13.5, y: cy + 2 }, { x: hx + s * 12.5, y: cy + 14 }], 1.6, PAL.hairDeep, 0.4);
    }
    // strand lines in the fringe
    curve(ctx, { x: hx - 6, y: cy - 21 }, { x: hx - 9, y: cy - 12 }, { x: hx - 11, y: cy - 4 }, 1.2, PAL.hairShade, 0.4);
    curve(ctx, { x: hx + 4, y: cy - 22 }, { x: hx + 6, y: cy - 13 }, { x: hx + 6, y: cy - 5 }, 1.2, PAL.hairShade, 0.4);
    curve(ctx, { x: hx + 12, y: cy - 18 }, { x: hx + 15, y: cy - 11 }, { x: hx + 16, y: cy - 4 }, 1.2, PAL.hairShade, 0.35);
  } else if (side) {
    // skull + swept-back hair base (bob carries real volume behind the skull)
    ell(ctx, hx - 5, cy - 3, 22, 22, PAL.hairShade);
    // profile face toward +x: brow ridge, bridge dip, small nose, lips, chin
    const skinGrad = ctx.createLinearGradient(hx - 4, cy - 10, hx + 18, cy + 14);
    skinGrad.addColorStop(0, PAL.skin);
    skinGrad.addColorStop(1, tint(PAL.skin, -0.06));
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.moveTo(hx + 1, cy - 17);
    ctx.quadraticCurveTo(hx + 11, cy - 15, hx + 13, cy - 7);   // forehead
    ctx.quadraticCurveTo(hx + 14, cy - 3.5, hx + 13.2, cy - 1.5); // brow → bridge dip
    ctx.quadraticCurveTo(hx + 15.5, cy + 1.5, hx + 17.5, cy + 4.5); // bridge → nose
    ctx.lineTo(hx + 18.3, cy + 6.3);                           // nose tip
    ctx.quadraticCurveTo(hx + 15.5, cy + 8, hx + 15.2, cy + 9.2); // under nose
    ctx.quadraticCurveTo(hx + 17, cy + 10.6, hx + 15.8, cy + 12.4); // upper lip
    ctx.quadraticCurveTo(hx + 16.8, cy + 14.4, hx + 14.6, cy + 16); // lower lip
    ctx.quadraticCurveTo(hx + 16, cy + 19.5, hx + 13, cy + 21);  // chin
    ctx.quadraticCurveTo(hx + 4, cy + 24, hx - 4, cy + 19);    // jaw
    ctx.lineTo(hx - 4, cy - 10);
    ctx.closePath();
    ctx.fill();
    // lip tint + jaw shadow
    stroke(ctx, [{ x: hx + 14.6, y: cy + 11.6 }, { x: hx + 16.2, y: cy + 12.2 }], 1.8, PAL.mouth, 0.85);
    curve(ctx, { x: hx + 10, y: cy + 18 }, { x: hx + 4, y: cy + 21 }, { x: hx - 2, y: cy + 18.5 },
      2, PAL.skinShade, 0.3);
    // eye recessed behind the brow
    ell(ctx, hx + 8.5, cy + 1 + uy, 2.8, 2.4, '#fbf3ea');
    ell(ctx, hx + 9.5, cy + 1.3 + uy, 1.7, 2, PAL.iris);
    ell(ctx, hx + 9.9, cy + 1.3 + uy, 0.9, 1.1, '#170e08');
    ctx.save();
    ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx + 5.5, cy - 1.2 + uy); ctx.lineTo(hx + 11.8, cy - 1.8 + uy); ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(hx + 11.5, cy - 1.8 + uy); ctx.lineTo(hx + 13, cy - 2.6 + uy); ctx.stroke();
    ctx.strokeStyle = tintHex(PAL.hair, -0.15); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hx + 5, cy - 4.6 + uy); ctx.quadraticCurveTo(hx + 9.5, cy - 6.2 + uy, hx + 12.5, cy - 4.8 + uy); ctx.stroke();
    ctx.restore();
    // nostril + nose-base shadow
    ell(ctx, hx + 15.6, cy + 8.2, 1, 0.8, 'rgba(120,70,40,0.5)');
    // hair: crown sweep over to the nape, fringe hooking the forehead,
    // curtain covering the ear down to the jaw
    ctx.fillStyle = PAL.hair;
    ctx.beginPath();
    ctx.moveTo(hx + 11, cy - 16);
    ctx.quadraticCurveTo(hx - 2, cy - 27, hx - 15, cy - 19);
    ctx.quadraticCurveTo(hx - 29, cy - 5, hx - 24, cy + 14);
    ctx.quadraticCurveTo(hx - 21, cy + 25, hx - 9, cy + 23.5);
    ctx.quadraticCurveTo(hx - 14, cy + 12, hx - 13.5, cy + 2);
    // fringe edge: hugs the hairline, dipping to just above the brow in front
    ctx.quadraticCurveTo(hx - 8, cy - 5.5, hx + 1, cy - 7);
    ctx.quadraticCurveTo(hx + 9, cy - 8.5, hx + 13.8, cy - 6);
    ctx.quadraticCurveTo(hx + 15, cy - 12, hx + 11, cy - 16);
    ctx.closePath();
    ctx.fill();
    // curtain lock over the ear, tucked under the fringe edge
    capsule(ctx, { x: hx - 4, y: cy - 4 }, { x: hx - 1.5, y: cy + 18 }, 7, 3.8, PAL.hair);
    ell(ctx, hx - 2.5, cy + 19.5, 3.8, 2.8, PAL.hair);
    // strand lines following the sweep to the nape
    curve(ctx, { x: hx - 6, y: cy - 18 }, { x: hx - 14, y: cy - 7 }, { x: hx - 15, y: cy + 9 }, 1.2, PAL.hairShade, 0.4);
    curve(ctx, { x: hx - 13, y: cy - 13 }, { x: hx - 20, y: cy - 1 }, { x: hx - 19, y: cy + 14 }, 1.1, PAL.hairDeep, 0.3);
    curve(ctx, { x: hx + 4, y: cy - 19 }, { x: hx - 4, y: cy - 12 }, { x: hx - 7, y: cy - 4 }, 1.1, PAL.hairShade, 0.28);
  } else {
    // back / back-side: the bob silhouette does the talking — dome, volume at
    // the ears, taper to the nape
    ctx.fillStyle = PAL.hair;
    ctx.beginPath();
    ctx.moveTo(hx - 20, cy - 2);
    ctx.quadraticCurveTo(hx - 22, cy - 20, hx, cy - 24);
    ctx.quadraticCurveTo(hx + 22, cy - 20, hx + 20, cy - 2);
    ctx.quadraticCurveTo(hx + 22, cy + 12, hx + 15, cy + 22);
    ctx.quadraticCurveTo(hx + 8, cy + 27.5, hx, cy + 28);
    ctx.quadraticCurveTo(hx - 8, cy + 27.5, hx - 15, cy + 22);
    ctx.quadraticCurveTo(hx - 22, cy + 12, hx - 20, cy - 2);
    ctx.closePath();
    ctx.fill();
    // inner shadow at the nape + layered under-curve
    curve(ctx, { x: hx - 13, y: cy + 23 }, { x: hx, y: cy + 29 }, { x: hx + 13, y: cy + 23 },
      3, PAL.hairDeep, 0.5);
    curve(ctx, { x: hx - 15, y: cy + 16 }, { x: hx, y: cy + 22 }, { x: hx + 15, y: cy + 16 },
      2, PAL.hairShade, 0.4);
    // soft strand streaks following the fall of the hair
    curve(ctx, { x: hx - 9, y: cy - 19 }, { x: hx - 13, y: cy - 1 }, { x: hx - 11, y: cy + 16 }, 1.2, PAL.hairShade, 0.22);
    curve(ctx, { x: hx + 9, y: cy - 19 }, { x: hx + 13, y: cy - 1 }, { x: hx + 11, y: cy + 16 }, 1.2, PAL.hairShade, 0.22);
    curve(ctx, { x: hx - 2, y: cy - 22 }, { x: hx - 3.5, y: cy - 5 }, { x: hx - 3, y: cy + 13 }, 1, PAL.hairShade, 0.18);
    curve(ctx, { x: hx + 4, y: cy - 21 }, { x: hx + 6, y: cy - 4 }, { x: hx + 5.5, y: cy + 14 }, 1, PAL.hairShade, 0.15);
    if (bs) {
      // cheek sliver + lash tip past the hair edge, toward the heading
      ell(ctx, hx + 18.5, cy + 8, 4, 9, PAL.skin);
      ell(ctx, hx + 19.5, cy + 12.5, 2.4, 1.4, 'rgba(232,120,96,0.2)');
      stroke(ctx, [{ x: hx + 19.5, y: cy + 2.5 }, { x: hx + 22, y: cy + 1.8 }], 1.6, '#2a1a12', 0.8);
    }
  }

  // crown specular: broken band of glints, two tones (all views)
  ctx.save();
  ctx.lineCap = 'round';
  const specR = 16, sy0 = cy - (back || bs ? 6 : 4);
  ctx.strokeStyle = PAL.hairHi;
  ctx.lineWidth = 3.2;
  ctx.globalAlpha = 0.5;
  for (const [a0, a1] of [[1.18, 1.34], [1.42, 1.58], [1.64, 1.72]]) {
    ctx.beginPath(); ctx.arc(hx, sy0, specR, Math.PI * a0, Math.PI * a1); ctx.stroke();
  }
  ctx.strokeStyle = PAL.hairHi2;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.4;
  for (const [a0, a1] of [[1.22, 1.32], [1.46, 1.56]]) {
    ctx.beginPath(); ctx.arc(hx, sy0, specR - 2.5, Math.PI * a0, Math.PI * a1); ctx.stroke();
  }
  ctx.restore();
}

// ── Global lighting + grain + outline + atlas assembly ───────────────────────

/** Key light from the upper-left: warm wash left, cool falloff right/bottom. */
function applyLighting(ctx: Ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const gx = ctx.createLinearGradient(0, 0, CELL_W, 0);
  gx.addColorStop(0, 'rgba(255,244,214,0.10)');
  gx.addColorStop(0.55, 'rgba(255,244,214,0)');
  gx.addColorStop(1, 'rgba(24,28,66,0.18)');
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, CELL_W, CELL_H);
  const gy = ctx.createLinearGradient(0, 0, 0, CELL_H);
  gy.addColorStop(0, 'rgba(255,250,235,0.06)');
  gy.addColorStop(0.6, 'rgba(0,0,0,0)');
  gy.addColorStop(1, 'rgba(18,14,36,0.12)');
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, CELL_W, CELL_H);
  ctx.restore();
}

/**
 * Deterministic film-grain pattern, masked to the figure (source-atop). Kills
 * the flat-vector read without touching the silhouette. Seeded LCG so every
 * boot paints the identical atlas.
 */
let grainPattern: CanvasPattern | null = null;
function applyGrain(ctx: Ctx) {
  if (!grainPattern) {
    const g = document.createElement('canvas');
    g.width = 96; g.height = 96;
    const gctx = g.getContext('2d')!;
    const img = gctx.createImageData(96, 96);
    let seed = 0x9e3779b9;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = rand() * 26 | 0;
    }
    gctx.putImageData(img, 0, 0);
    grainPattern = ctx.createPattern(g, 'repeat');
  }
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = grainPattern!;
  ctx.fillRect(0, 0, CELL_W, CELL_H);
  ctx.restore();
}

const OUTLINE_OFFS: ReadonlyArray<readonly [number, number]> = [
  [2, 0], [-2, 0], [0, 2], [0, -2], [1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5],
];

/**
 * Build the full 5-direction × 16-frame sprite atlas. Pure canvas — the caller
 * wraps it in a THREE.CanvasTexture.
 */
export function buildClerkAtlasCanvas(): HTMLCanvasElement {
  applyClerkLivery();
  const atlas = document.createElement('canvas');
  atlas.width = CELL_W * ATLAS_COLS;
  atlas.height = CELL_H * ATLAS_ROWS;
  const actx = atlas.getContext('2d')!;

  const cell = document.createElement('canvas');
  cell.width = CELL_W; cell.height = CELL_H;
  const cctx = cell.getContext('2d')!;
  const sil = document.createElement('canvas');
  sil.width = CELL_W; sil.height = CELL_H;
  const sctx = sil.getContext('2d')!;

  DIRS.forEach((dirKey, row) => {
    for (const anim of ANIM_ORDER) {
      for (let f = 0; f < ANIM_DEF[anim].frames; f++) {
        cctx.clearRect(0, 0, CELL_W, CELL_H);
        drawFigure(cctx, dirKey, poseFor(anim, f));
        applyLighting(cctx);
        applyGrain(cctx);

        // silhouette → dark outline stamped under the figure
        sctx.globalCompositeOperation = 'source-over';
        sctx.clearRect(0, 0, CELL_W, CELL_H);
        sctx.drawImage(cell, 0, 0);
        sctx.globalCompositeOperation = 'source-in';
        sctx.fillStyle = PAL.outline;
        sctx.fillRect(0, 0, CELL_W, CELL_H);

        const ox = (ANIM_COL[anim] + f) * CELL_W, oy = row * CELL_H;
        for (const [dx, dy] of OUTLINE_OFFS) actx.drawImage(sil, ox + dx, oy + dy);
        actx.drawImage(cell, ox, oy);
      }
    }
  });

  return atlas;
}
