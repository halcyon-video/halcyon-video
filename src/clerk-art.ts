/**
 * Procedural sprite-art generator for the store clerk billboard.
 *
 * Everything here is generated at runtime on a canvas — no downloaded assets
 * (T14 constraint: "scalable and low-maintenance"). The generator replaces the
 * old stick-figure placeholder with a proper 2D character rig:
 *
 *   - two-segment limbs (thigh/shin, upper-arm/forearm) posed by foot-target
 *     IK (legs) and sagittal-plane angles with per-direction foreshortening
 *     (arms), so walks/squats/reaches read correctly from all five views
 *   - painted shading: per-part gradients, a global light overlay (key light
 *     from the upper-left), far-limb depth darkening
 *   - a stamped silhouette outline around the whole figure (classic sprite
 *     trick — keeps her readable against busy shelf backgrounds)
 *   - a real face (whites/iris/lashes/brows, nose, lips, blush), layered
 *     brunette bob with fringe + shine, and the uniform: house-green polo with
 *     collar/placket/sleeves, nametag, belt with buckle, khaki slacks,
 *     black sneakers with white soles.
 *
 * Atlas layout: 5 rows = directions (front / front-side / side / back-side /
 * back, drawn heading screen-RIGHT; the runtime mirrors for the other three
 * octants) × 14 columns = every animation frame concatenated
 * (idle 2 · walk 4 · stockHigh 2 · stockMid 2 · stockLow 2 · talk 2).
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
  skin: '#f2c49c', skinShade: '#d29a6e', skinLine: '#a96a44',
  hair: '#3b2a1b', hairShade: '#281a0e', hairHi: '#7a5530', hairHi2: '#a3764a',
  polo: '#186049', poloHi: '#2d8467', poloShade: '#0f4030', poloLine: '#0a2e22',
  khaki: '#c8b283', khakiHi: '#e2d2a6', khakiShade: '#a08a58',
  belt: '#4e3722', buckle: '#d9b545',
  shoe: '#26262e', shoeHi: '#50505e', sole: '#d8d5cc',
  tag: '#f6f6f2', tagYellow: '#f2c230',
  iris: '#6b4226', outline: '#241a20',
  mouth: '#8a3a30', mouthOpen: '#571f1c', teeth: '#f4efe8',
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
  // The restock case she carries is a store case: house body, trim-colour spine.
  PAL.caseDk = tintHex(p.primary, -0.45);
  PAL.caseHi = tintHex(p.primary, -0.08);
  PAL.caseLabel = tintHex(p.secondary, 0.15);
}

// ── Joint capture (GH #115) ─────────────────────────────────────────────────
// drawFigure already solves every joint on its way to painting her — shoulder,
// elbow and wrist from the sagittal arm angles, knee from the leg IK. Those
// solved points ARE the ground truth of what each cell depicts, so rather than
// let a pose DETECTOR guess a skeleton back out of the finished art (openpose
// finds nothing in flat cel work and invents a crouch), we tap them here and
// hand them out. A null sink costs one comparison per joint and changes
// nothing about the drawing.

export type JointName =
  | 'head' | 'neck'
  | 'shoulderL' | 'elbowL' | 'wristL' | 'handL'
  | 'shoulderR' | 'elbowR' | 'wristR' | 'handR'
  | 'hipL' | 'kneeL' | 'ankleL'
  | 'hipR' | 'kneeR' | 'ankleR';

export type JointMap = Partial<Record<JointName, { x: number; y: number }>>;

let jointSink: JointMap | null = null;
const joint = (name: JointName, x: number, y: number): void => {
  if (jointSink) jointSink[name] = { x, y };
};

/** Run `fn` with joint capture on, and return everything it solved. */
export function captureJoints(fn: () => void): JointMap {
  const prev = jointSink;
  const out: JointMap = {};
  jointSink = out;
  try { fn(); } finally { jointSink = prev; }
  return out;
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
const ARM_UP = 50, ARM_FORE = 46;

interface Pt { x: number; y: number }

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

/** Tapered capsule between two points (round caps, different end radii). */
function capsule(ctx: Ctx, a: Pt, b: Pt, r0: number, r1: number, fill: string | CanvasGradient) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.arc(a.x, a.y, r0, ang + Math.PI / 2, ang - Math.PI / 2);
  ctx.arc(b.x, b.y, r1, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = fill as string;
  ctx.fill();
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

/** Two-bone IK: joint position between `a` and target `t`, bending toward bendX. */
function ik(a: Pt, t: Pt, l1: number, l2: number, bendX: number): Pt {
  let dx = t.x - a.x, dy = t.y - a.y;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.5, minD = Math.abs(l1 - l2) + 0.5;
  if (d < 1e-4) { dx = 0; dy = 1; d = 1; }
  const cl = Math.min(maxD, Math.max(minD, d));
  const ux = dx / d, uy = dy / d;
  const along = (l1 * l1 - l2 * l2 + cl * cl) / (2 * cl);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
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
  const headCy = 74 + dropY;

  const hipX = cx + p.sway * 3.5 * F.lat;
  const chestX = cx - p.sway * 1.5 * F.lat + leanX * 0.7;
  const shoulderX = chestX + leanX * 0.3;
  const headX = shoulderX + leanX * 0.5 + F.faceShift * 0.4;
  joint('head', headX, headCy);
  joint('neck', shoulderX, shoulderY + 4);

  const shoulderHalf = 43 * F.width;
  const waistHalf = 27 * F.width;
  const hipHalf = 40 * F.width;

  // ── Legs: khaki slacks, foot-target IK ──
  const hipJoint = (s: number): Pt => ({ x: hipX + s * hipHalf * 0.48, y: hipY + 8 });
  const footTarget = (s: number, stride: number, lift: number): Pt => ({
    x: hipX + s * (hipHalf * 0.48 + 4) * F.lat * (side ? 0.4 : 1) + s * 4 * F.lat + stride * F.fwd,
    y: GROUND - 9 - lift,
  });
  const legR = { r0: 13 * (0.72 + 0.28 * F.width), r1: 9.5 * (0.72 + 0.28 * F.width) };

  const drawLeg = (s: number, stride: number, lift: number, dark: number) => {
    const h = hipJoint(s), t = footTarget(s, stride, lift);
    // Knees bend toward the heading in profile-ish views, outward face-on.
    const bendX = F.fwd >= 0.5 ? 1 : (s || 1) * 0.8 + 0.3 * F.fwd;
    const k = ik(h, t, THIGH, SHIN, bendX);
    const legSide = s < 0 ? 'L' : 'R';
    joint(`hip${legSide}` as JointName, h.x, h.y);
    joint(`knee${legSide}` as JointName, k.x, k.y);
    joint(`ankle${legSide}` as JointName, t.x, t.y);
    const kk = tint(PAL.khaki, dark);
    capsule(ctx, h, k, legR.r0, legR.r1, kk);
    capsule(ctx, k, t, legR.r1 * 0.96, legR.r1 * 0.88, kk);
    // crease highlight down the front of the trouser leg
    stroke(ctx, [{ x: h.x + 3, y: h.y + 14 }, { x: k.x + 2, y: k.y }, { x: t.x + 2, y: t.y - 4 }], 2.5, tint(PAL.khakiHi, dark > -0.05 ? 0 : -0.1), 0.5);
    // hem shadow at the ankle
    stroke(ctx, [{ x: t.x - legR.r1 * 0.8, y: t.y - 4 }, { x: t.x + legR.r1 * 0.8, y: t.y - 4 }], 3, tint(PAL.khakiShade, dark), 0.55);
    drawShoe(ctx, t, dir, s, dark);
    return t;
  };

  // Far leg first (darkened) in the profile-ish views; in face-on views draw
  // left then right (no depth difference worth showing).
  const farIsLeft = fs || side || bs; // heading +x: her left side is far... pick screen-left as far
  if (farIsLeft) {
    drawLeg(-1, p.strideL, p.liftL, -0.18);
    drawLeg(1, p.strideR, p.liftR, 0);
  } else {
    drawLeg(-1, p.strideL, p.liftL, 0);
    drawLeg(1, p.strideR, p.liftR, 0);
  }

  // ── Pelvis / hips (khaki) ──
  const hipGrad = ctx.createLinearGradient(hipX - hipHalf, 0, hipX + hipHalf, 0);
  hipGrad.addColorStop(0, tint(PAL.khaki, 0.10));
  hipGrad.addColorStop(0.5, PAL.khaki);
  hipGrad.addColorStop(1, PAL.khakiShade);
  rr(ctx, hipX - hipHalf, beltY + 2, hipHalf * 2, 36, 15, hipGrad);
  if (back) {
    // seat: two soft rounds + center seam + pocket stitching
    ell(ctx, hipX - hipHalf * 0.42, hipY + 12, hipHalf * 0.40, 14, tint(PAL.khaki, -0.06));
    ell(ctx, hipX + hipHalf * 0.42, hipY + 12, hipHalf * 0.40, 14, tint(PAL.khaki, -0.12));
    stroke(ctx, [{ x: hipX, y: hipY + 2 }, { x: hipX, y: hipY + 22 }], 2, PAL.khakiShade, 0.7);
    stroke(ctx, [{ x: hipX - hipHalf * 0.62, y: hipY + 2 }, { x: hipX - hipHalf * 0.2, y: hipY + 4 }], 2, PAL.khakiShade, 0.55);
    stroke(ctx, [{ x: hipX + hipHalf * 0.2, y: hipY + 4 }, { x: hipX + hipHalf * 0.62, y: hipY + 2 }], 2, PAL.khakiShade, 0.55);
  } else if (side || bs) {
    // single rear curve (her behind faces -x, away from heading)
    ell(ctx, hipX - hipHalf * (side ? 0.85 : 0.62), hipY + 10, hipHalf * 0.45, 16, tint(PAL.khaki, -0.08));
  }
  if (front || fs) {
    // fly + hip crease shading
    stroke(ctx, [{ x: hipX + 1, y: beltY + 10 }, { x: hipX + 1, y: hipY + 16 }], 2, PAL.khakiShade, 0.5);
  }

  // ── Belt ──
  rr(ctx, hipX - hipHalf, beltY - 3, hipHalf * 2, 9, 4, PAL.belt);
  stroke(ctx, [{ x: hipX - hipHalf + 2, y: beltY - 1 }, { x: hipX + hipHalf - 2, y: beltY - 1 }], 1.5, tint(PAL.belt, 0.35), 0.6);
  if (faceVis) {
    rr(ctx, hipX + F.faceShift * 0.8 - 5, beltY - 4, 11, 11, 2, PAL.buckle);
    rr(ctx, hipX + F.faceShift * 0.8 - 2.5, beltY - 1.5, 6, 6, 1, tint(PAL.buckle, -0.4));
  }

  // ── Far arm (behind the torso in profile-ish views) ──
  const drawArm = (s: number, ang: number, elb: number, dark: number): Pt => {
    const armF = Math.max(F.fwd, 0.30);
    const sx = shoulderX + s * (shoulderHalf - 4) * (side ? 0.5 : 1);
    const sy = shoulderY + 10;
    const splay = s * 0.10 * F.lat;
    const eX = sx + (Math.sin(ang) * armF + Math.sin(splay)) * ARM_UP;
    const eY = sy + Math.cos(ang) * ARM_UP;
    const wX = eX + (Math.sin(ang + elb) * armF + Math.sin(splay)) * ARM_FORE;
    const wY = eY + Math.cos(ang + elb) * ARM_FORE;
    const sh: Pt = { x: sx, y: sy }, el: Pt = { x: eX, y: eY }, wr: Pt = { x: wX, y: wY };
    const armSide = s < 0 ? 'L' : 'R';
    joint(`shoulder${armSide}` as JointName, sx, sy);
    joint(`elbow${armSide}` as JointName, eX, eY);
    joint(`wrist${armSide}` as JointName, wX, wY);
    // upper arm skin (peeks past the sleeve), then the polo sleeve over it
    capsule(ctx, sh, el, 9, 7.5, tint(PAL.skin, dark));
    const sleeveEnd: Pt = { x: sx + (eX - sx) * 0.72, y: sy + (eY - sy) * 0.72 };
    capsule(ctx, { x: sx - (eX - sx) * 0.08, y: sy - (eY - sy) * 0.08 }, sleeveEnd, 12.5, 10, tint(PAL.polo, dark));
    stroke(ctx, [
      { x: sleeveEnd.x - 7, y: sleeveEnd.y - 3 },
      { x: sleeveEnd.x + 7, y: sleeveEnd.y + 3 },
    ], 2.5, tint(PAL.poloShade, dark), 0.8);
    // forearm + hand
    capsule(ctx, el, wr, 7.5, 6, tint(PAL.skin, dark));
    const hx2 = wX + Math.sin(ang + elb) * armF * 6, hy2 = wY + Math.cos(ang + elb) * 6;
    ell(ctx, hx2, hy2, 6.8, 7.4, tint(PAL.skin, dark - 0.02));
    joint(`hand${armSide}` as JointName, hx2, hy2);
    return { x: hx2, y: hy2 };
  };

  let farHand: Pt | null = null;
  if (fs || side || bs) farHand = drawArm(-1, p.armL, p.elbL, -0.20);
  void farHand;

  // ── Torso: blue polo, tucked at the belt ──
  const chestY = shoulderY + 42;
  const waistY = beltY - 6;
  const poloGrad = ctx.createLinearGradient(chestX - shoulderHalf, 0, chestX + shoulderHalf, 0);
  poloGrad.addColorStop(0, tint(PAL.polo, 0.16));
  poloGrad.addColorStop(0.48, PAL.polo);
  poloGrad.addColorStop(1, PAL.poloShade);
  ctx.beginPath();
  ctx.moveTo(shoulderX - shoulderHalf, shoulderY + 6);
  ctx.quadraticCurveTo(chestX - shoulderHalf - (side ? -4 : 2), chestY, chestX - waistHalf, waistY);
  ctx.lineTo(hipX - hipHalf * 0.92, beltY + 1);
  ctx.lineTo(hipX + hipHalf * 0.92, beltY + 1);
  ctx.lineTo(chestX + waistHalf, waistY);
  ctx.quadraticCurveTo(chestX + shoulderHalf + (side ? 10 : 2), chestY, shoulderX + shoulderHalf, shoulderY + 6);
  ctx.quadraticCurveTo(shoulderX, shoulderY - 8, shoulderX - shoulderHalf, shoulderY + 6);
  ctx.closePath();
  ctx.fillStyle = poloGrad;
  ctx.fill();

  // bust: kept subtle — a forward bulge on the +x silhouette in profile-ish
  // views, soft shading face-on.
  if (side) {
    ell(ctx, chestX + shoulderHalf * 0.72, chestY - 4, shoulderHalf * 0.52, 15, tint(PAL.polo, 0.06));
    ell(ctx, chestX + shoulderHalf * 0.80, chestY - 7, shoulderHalf * 0.22, 6, tint(PAL.polo, 0.22));
  } else if (fs) {
    ell(ctx, chestX + shoulderHalf * 0.42, chestY - 4, shoulderHalf * 0.40, 13, tint(PAL.polo, 0.10));
  } else if (front) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = PAL.poloShade;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(chestX - shoulderHalf * 0.34, chestY - 8, 13, 0.35, Math.PI - 0.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(chestX + shoulderHalf * 0.34, chestY - 8, 13, 0.5 - Math.PI + Math.PI, Math.PI - 0.35); ctx.stroke();
    ctx.restore();
  }
  // untucked-fold shadow just above the belt
  stroke(ctx, [{ x: hipX - hipHalf * 0.8, y: beltY - 2 }, { x: hipX + hipHalf * 0.8, y: beltY - 2 }], 3, PAL.poloShade, 0.4);

  // ── Collar, placket, nametag ──
  if (faceVis) {
    const nx = shoulderX + F.faceShift * 0.6;
    // placket + buttons
    stroke(ctx, [{ x: nx, y: shoulderY + 8 }, { x: nx, y: shoulderY + 34 }], 2.5, PAL.poloLine, 0.85);
    ctx.fillStyle = tint(PAL.polo, 0.35);
    ctx.beginPath(); ctx.arc(nx + 3, shoulderY + 18, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(nx + 3, shoulderY + 28, 1.8, 0, Math.PI * 2); ctx.fill();
    // collar flaps
    ctx.fillStyle = tint(PAL.polo, -0.18);
    ctx.beginPath();
    ctx.moveTo(nx - 16, shoulderY - 2);
    ctx.lineTo(nx - 2, shoulderY + 2);
    ctx.lineTo(nx - 11, shoulderY + 16);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(nx + 16, shoulderY - 2);
    ctx.lineTo(nx + 2, shoulderY + 2);
    ctx.lineTo(nx + 11, shoulderY + 16);
    ctx.closePath(); ctx.fill();
    // nametag on her left chest (screen right), with the yellow ticket corner
    const tx = chestX + shoulderHalf * 0.36, ty = shoulderY + 30;
    rr(ctx, tx - 13, ty - 6, 26, 13, 2, PAL.tag);
    rr(ctx, tx - 13, ty - 6, 6, 13, 2, PAL.tagYellow);
    stroke(ctx, [{ x: tx - 4, y: ty }, { x: tx + 9, y: ty }], 2.2, PAL.polo, 0.9);
  } else if (back) {
    rr(ctx, shoulderX - shoulderHalf * 0.34, shoulderY - 3, shoulderHalf * 0.68, 9, 4, tint(PAL.polo, -0.18));
    // shoulder-yoke seam
    stroke(ctx, [{ x: shoulderX - shoulderHalf * 0.8, y: shoulderY + 16 }, { x: shoulderX + shoulderHalf * 0.8, y: shoulderY + 16 }], 2, PAL.poloShade, 0.45);
  } else if (bs) {
    rr(ctx, shoulderX - shoulderHalf * 0.30, shoulderY - 3, shoulderHalf * 0.62, 9, 4, tint(PAL.polo, -0.18));
  }

  // ── Neck ──
  if (!back) {
    capsule(ctx, { x: headX, y: headCy + 22 }, { x: shoulderX + F.faceShift * 0.4, y: shoulderY + 8 }, 8, 9.5, PAL.skin);
    // chin shadow on the neck
    if (faceVis) ell(ctx, headX, headCy + 27, 7, 3.5, 'rgba(150,90,60,0.30)');
  }

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
  if (p.holdCase && !back && !bs) drawCase(ctx, rightHand.x + 4 * F.fwd, rightHand.y + 2, side ? -0.12 : -0.2);
}

function drawShoe(ctx: Ctx, ankle: Pt, dir: Dir, s: number, dark: number) {
  const body = tint(PAL.shoe, dark), hi = tint(PAL.shoeHi, dark), sole = tint(PAL.sole, dark);
  const ax = ankle.x, ay = ankle.y;
  if (dir === 'side' || dir === 'frontSide' || dir === 'backSide') {
    const len = dir === 'side' ? 38 : 30;
    // heel → toe wedge
    ctx.beginPath();
    ctx.moveTo(ax - 10, ay - 4);
    ctx.quadraticCurveTo(ax - 13, ay + 5, ax - 9, ay + 7);
    ctx.lineTo(ax + len - 12, ay + 7);
    ctx.quadraticCurveTo(ax + len, ay + 6, ax + len - 2, ay + 1);
    ctx.quadraticCurveTo(ax + len - 8, ay - 4, ax + 4, ay - 5);
    ctx.closePath();
    ctx.fillStyle = body; ctx.fill();
    rr(ctx, ax - 12, ay + 6, len + 9, 4, 2, sole);
    stroke(ctx, [{ x: ax - 2, y: ay - 2 }, { x: ax + len * 0.45, y: ay + 1 }], 2, hi, 0.7);
  } else if (dir === 'back') {
    rr(ctx, ax - 11, ay - 5, 22, 12, 4, body);
    rr(ctx, ax - 12, ay + 5, 24, 5, 2, sole);
    stroke(ctx, [{ x: ax - 6, y: ay - 1 }, { x: ax + 6, y: ay - 1 }], 2, hi, 0.6);
  } else {
    // front: toe cap facing the camera
    ell(ctx, ax, ay + 2, 13, 8, body);
    rr(ctx, ax - 13, ay + 5, 26, 5, 2.5, sole);
    ell(ctx, ax, ay - 1, 8, 4, hi);
    void s;
  }
}

function drawCase(ctx: Ctx, x: number, y: number, tilt: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  rr(ctx, -18, -13, 36, 26, 3, PAL.caseDk);
  rr(ctx, -14, -10, 28, 20, 2, PAL.caseHi);
  rr(ctx, -18, -13, 7, 26, 2, PAL.caseLabel);
  rr(ctx, -9, -6, 18, 3, 1, 'rgba(244,244,240,0.85)');
  rr(ctx, -9, 0, 13, 2.5, 1, 'rgba(244,244,240,0.55)');
  ctx.restore();
}

// ── Head + face + brunette bob ───────────────────────────────────────────────

function drawHead(ctx: Ctx, dir: Dir, p: Pose, hx: number, cy: number) {
  const front = dir === 'front', fs = dir === 'frontSide', side = dir === 'side';
  const bs = dir === 'backSide', back = dir === 'back';
  const uy = -4 * p.headUp; // features shift up when she looks up

  // hair mass behind the head (bob reaches the jawline)
  if (!back && !bs) ell(ctx, hx - (side ? 6 : 0), cy + 4, 33, 37, PAL.hairShade);

  if (front || fs) {
    const fshift = fs ? 6 : 0;
    const fx = hx + fshift;
    // skull base under the bangs
    ell(ctx, hx, cy - 4, 30, 31, PAL.hair);
    // face: rounded with a soft chin
    const skinGrad = ctx.createLinearGradient(fx - 25, 0, fx + 25, 0);
    skinGrad.addColorStop(0, tint(PAL.skin, 0.08));
    skinGrad.addColorStop(0.55, PAL.skin);
    skinGrad.addColorStop(1, tint(PAL.skin, -0.10));
    ctx.beginPath();
    ctx.moveTo(fx - 24, cy - 4);
    ctx.quadraticCurveTo(fx - 25, cy + 16, fx - 10, cy + 27);
    ctx.quadraticCurveTo(fx, cy + 33, fx + 10, cy + 27);
    ctx.quadraticCurveTo(fx + 25, cy + 16, fx + 24, cy - 4);
    ctx.quadraticCurveTo(fx + 22, cy - 25, fx, cy - 27);
    ctx.quadraticCurveTo(fx - 22, cy - 25, fx - 24, cy - 4);
    ctx.closePath();
    ctx.fillStyle = skinGrad;
    ctx.fill();

    // features
    const eo = fs ? 4 : 0;               // eyes drift toward the heading
    const eyeY = cy + 4 + uy;
    for (const s of [-1, 1]) {
      const ex = fx + s * 11 + eo;
      const w = fs && s < 0 ? 0.8 : 1;   // far eye slightly narrower in 3/4
      ell(ctx, ex, eyeY, 6.2 * w, 4.3, '#fdf6ee');
      ell(ctx, ex + eo * 0.3, eyeY + 0.4, 3.4 * w, 3.4, PAL.iris);
      ell(ctx, ex + eo * 0.3, eyeY + 0.4, 1.7 * w, 1.7, '#1c120c');
      ell(ctx, ex + eo * 0.3 - 1.1, eyeY - 0.9, 0.9, 0.9, '#ffffff');
      // lash line + outer flick
      ctx.save();
      ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ex, eyeY + 1.5, 6.4 * w, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(ex + s * 6.2 * w, eyeY - 2.2);
      ctx.lineTo(ex + s * 8.4 * w, eyeY - 3.6);
      ctx.stroke();
      // brow
      ctx.lineWidth = 2.6; ctx.strokeStyle = PAL.hair;
      ctx.beginPath(); ctx.arc(ex + 0.5, eyeY - 2, 8 * w, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke();
      ctx.restore();
    }
    // nose: a small shadow tick
    stroke(ctx, [{ x: fx + eo * 0.4, y: cy + 9 + uy }, { x: fx + 1.6 + eo * 0.4, y: cy + 13.5 + uy }], 2, PAL.skinShade, 0.55);
    // mouth
    const my = cy + 20.5 + uy;
    if (p.mouth > 0.4) {
      ell(ctx, fx + eo * 0.4, my + 1, 5.4, 4.6 * p.mouth, PAL.mouthOpen);
      rr(ctx, fx + eo * 0.4 - 3.6, my - 2.4, 7.2, 2.2, 1, PAL.teeth);
    } else {
      ctx.save();
      ctx.strokeStyle = PAL.mouth; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(fx + eo * 0.4, my - 2.5, 6.2, 0.35, Math.PI - 0.35); ctx.stroke();
      ctx.restore();
      if (p.mouth > 0) ell(ctx, fx + eo * 0.4, my + 1.5, 3.4, 1.8 * (p.mouth * 3), PAL.mouthOpen);
    }
    // blush
    ell(ctx, fx - 16 + eo, cy + 13 + uy, 4.6, 2.8, 'rgba(232,120,96,0.22)');
    ell(ctx, fx + 16 + eo, cy + 13 + uy, 4.6, 2.8, 'rgba(232,120,96,0.22)');

    // bangs: crown mass with a scalloped fringe
    ctx.fillStyle = PAL.hair;
    ctx.beginPath();
    ctx.moveTo(hx - 28, cy + 6);
    ctx.quadraticCurveTo(hx - 32, cy - 22, hx - 10, cy - 31);
    ctx.quadraticCurveTo(hx + 12, cy - 36, hx + 28, cy - 12);
    ctx.quadraticCurveTo(hx + 30, cy - 4, hx + 28, cy + 6);
    // fringe sweeps back right→left in three scallops
    ctx.quadraticCurveTo(hx + 24, cy - 8, hx + 17, cy - 7);
    ctx.quadraticCurveTo(hx + 10, cy - 1, hx + 3, cy - 8);
    ctx.quadraticCurveTo(hx - 6, cy - 1, hx - 13, cy - 8);
    ctx.quadraticCurveTo(hx - 22, cy - 2, hx - 28, cy + 6);
    ctx.closePath();
    ctx.fill();
    // side locks framing the face down past the jaw
    capsule(ctx, { x: hx - 28, y: cy - 2 }, { x: hx - 24, y: cy + 28 }, 9, 6.5, PAL.hair);
    ell(ctx, hx - 23, cy + 31, 6.5, 5, PAL.hair);
    capsule(ctx, { x: hx + 28, y: cy - 2 }, { x: hx + 24, y: cy + 28 }, 9, 6.5, PAL.hair);
    ell(ctx, hx + 23, cy + 31, 6.5, 5, PAL.hair);
  } else if (side) {
    // skull + swept-back hair
    ell(ctx, hx - 2, cy - 3, 29, 31, PAL.hair);
    // profile face toward +x
    ctx.fillStyle = PAL.skin;
    ctx.beginPath();
    ctx.moveTo(hx + 2, cy - 24);
    ctx.quadraticCurveTo(hx + 16, cy - 22, hx + 19, cy - 10); // forehead
    ctx.quadraticCurveTo(hx + 20, cy - 4, hx + 25, cy + 4);   // brow → nose bridge
    ctx.lineTo(hx + 27, cy + 8);                              // nose tip
    ctx.quadraticCurveTo(hx + 22, cy + 11, hx + 22, cy + 13); // under nose
    ctx.quadraticCurveTo(hx + 25, cy + 16, hx + 21, cy + 19); // lips
    ctx.quadraticCurveTo(hx + 22, cy + 24, hx + 15, cy + 26); // chin
    ctx.quadraticCurveTo(hx + 4, cy + 30, hx - 6, cy + 24);   // jaw
    ctx.lineTo(hx - 6, cy - 12);
    ctx.closePath();
    ctx.fill();
    // lip tint + eye + brow
    stroke(ctx, [{ x: hx + 21.5, y: cy + 15 }, { x: hx + 24, y: cy + 15.5 }], 2.2, PAL.mouth, 0.85);
    ell(ctx, hx + 12, cy + 2 + uy, 3.6, 3.4, '#fdf6ee');
    ell(ctx, hx + 13, cy + 2.4 + uy, 2.1, 2.6, PAL.iris);
    ell(ctx, hx + 13.4, cy + 2.4 + uy, 1.1, 1.4, '#1c120c');
    ctx.save();
    ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx + 8, cy - 1.5 + uy); ctx.lineTo(hx + 16, cy - 2.5 + uy); ctx.stroke();
    ctx.strokeStyle = PAL.hair; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(hx + 8, cy - 6.5 + uy); ctx.lineTo(hx + 17, cy - 7 + uy); ctx.stroke();
    ctx.restore();
    // hair: crown sweeping down to the nape, bang hooking over the forehead
    ctx.fillStyle = PAL.hair;
    ctx.beginPath();
    ctx.moveTo(hx + 14, cy - 22);
    ctx.quadraticCurveTo(hx - 4, cy - 34, hx - 20, cy - 20);
    ctx.quadraticCurveTo(hx - 34, cy - 2, hx - 26, cy + 24);
    ctx.quadraticCurveTo(hx - 22, cy + 34, hx - 12, cy + 32);
    ctx.quadraticCurveTo(hx - 18, cy + 18, hx - 16, cy + 2);
    ctx.quadraticCurveTo(hx - 8, cy - 12, hx + 6, cy - 14);
    ctx.quadraticCurveTo(hx + 16, cy - 15, hx + 20, cy - 11);
    ctx.quadraticCurveTo(hx + 20, cy - 18, hx + 14, cy - 22);
    ctx.closePath();
    ctx.fill();
    // lock in front of the ear
    capsule(ctx, { x: hx - 2, y: cy + 2 }, { x: hx - 1, y: cy + 24 }, 5.5, 4, PAL.hair);
  } else {
    // back / back-side: hair does all the talking
    ell(ctx, hx, cy - 2, 30, 32, PAL.hair);
    ctx.fillStyle = PAL.hair;
    ctx.beginPath();
    ctx.moveTo(hx - 28, cy + 2);
    ctx.quadraticCurveTo(hx - 30, cy + 30, hx - 20, cy + 36);
    ctx.quadraticCurveTo(hx - 10, cy + 40, hx, cy + 38);
    ctx.quadraticCurveTo(hx + 10, cy + 40, hx + 20, cy + 36);
    ctx.quadraticCurveTo(hx + 30, cy + 30, hx + 28, cy + 2);
    ctx.closePath();
    ctx.fill();
    // centre part + strand lines
    stroke(ctx, [{ x: hx, y: cy - 30 }, { x: hx, y: cy + 6 }], 2.2, PAL.hairShade, 0.8);
    stroke(ctx, [{ x: hx - 12, y: cy - 26 }, { x: hx - 16, y: cy + 20 }], 1.8, PAL.hairShade, 0.35);
    stroke(ctx, [{ x: hx + 12, y: cy - 26 }, { x: hx + 16, y: cy + 20 }], 1.8, PAL.hairShade, 0.35);
    if (bs) {
      // cheek sliver + lash tip past the hair edge, toward the heading (+x is
      // mirrored to -x here because backSide faces away — heading is still +x,
      // we see the back-right of her head, cheek peeks at +x)
      ell(ctx, hx + 26, cy + 10, 5.5, 12, PAL.skin);
      stroke(ctx, [{ x: hx + 27, y: cy + 3 }, { x: hx + 30, y: cy + 2 }], 2, '#2a1a12', 0.8);
    }
  }

  // crown shine (all views)
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = PAL.hairHi;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(hx, cy - 2, 24, Math.PI * 1.2, Math.PI * 1.7);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = PAL.hairHi2;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(hx, cy - 2, 21, Math.PI * 1.28, Math.PI * 1.62);
  ctx.stroke();
  ctx.restore();
}

// ── Global lighting + outline + atlas assembly ───────────────────────────────

/** Key light from the upper-left: warm wash left, cool falloff right/bottom. */
function applyLighting(ctx: Ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const gx = ctx.createLinearGradient(0, 0, CELL_W, 0);
  gx.addColorStop(0, 'rgba(255,244,214,0.10)');
  gx.addColorStop(0.55, 'rgba(255,244,214,0)');
  gx.addColorStop(1, 'rgba(24,28,66,0.16)');
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

const OUTLINE_OFFS: ReadonlyArray<readonly [number, number]> = [
  [2, 0], [-2, 0], [0, 2], [0, -2], [1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5],
];

/** One cell's identity plus every joint drawFigure solved for it. */
export interface CellSkeleton {
  dir: Dir;
  anim: AnimKey;
  frame: number;
  /** Atlas grid position, so a consumer can line these up with the sprite sheet. */
  col: number;
  row: number;
  joints: JointMap;
}

/**
 * Solve every cell's skeleton without painting a sheet anyone keeps.
 *
 * Same three loops as buildClerkAtlasCanvas, deliberately: if a pose or a
 * facing is ever added, both walk it or the two outputs stop lining up. The
 * scratch canvas exists only because drawFigure needs somewhere to draw — the
 * pixels are thrown away and the joints are the product.
 */
export function buildClerkSkeletons(): CellSkeleton[] {
  applyClerkLivery();
  const scratch = document.createElement('canvas');
  scratch.width = CELL_W; scratch.height = CELL_H;
  const sctx = scratch.getContext('2d')!;
  const out: CellSkeleton[] = [];
  DIRS.forEach((dirKey, row) => {
    for (const anim of ANIM_ORDER) {
      for (let f = 0; f < ANIM_DEF[anim].frames; f++) {
        sctx.clearRect(0, 0, CELL_W, CELL_H);
        const joints = captureJoints(() => drawFigure(sctx, dirKey, poseFor(anim, f)));
        out.push({ dir: dirKey, anim, frame: f, col: ANIM_COL[anim] + f, row, joints });
      }
    }
  });
  return out;
}

/**
 * Build the full 5-direction × 14-frame sprite atlas. Pure canvas — the caller
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
