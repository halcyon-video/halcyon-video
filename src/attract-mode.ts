// Attract mode (#273): a slow on-rails camera dolly over the finished store
// that starts after a few idle seconds and breaks on any input. It turns the
// hosted demo's landing page into a showreel and doubles as the release-clip
// source: `?attract=1` starts the tour right after boot, `?attract=0` keeps it
// off regardless of the setting.
//
// Not a cutscene system. No new geometry, no scripted events: the tour rides
// walk mode's freecam — teleportWalk(..., free), the same lift of the walk
// clamps the shot tool uses — and drives camera.position / yaw / pitch along
// a handful of Catmull-Rom legs built from the LIVE layout (vestibule info,
// counter frame, back wall, store width), so every storefront format and
// store size gets a path that fits it instead of a baked-in one.
//
// The T23 back room is deliberately not visited. It is a rental STATE, not a
// place: entering writes a record and arms the lockout timer, leaving clears
// the ledger and runs the return-chute ritual. A screensaver must not touch
// any of that, so the tour's finale is a raised look back over the whole
// floor from the front corner instead.
//
// Break: InputManager stamps the shared input clock on every REAL control
// input (user-activity.ts). The tour subscribes to that clock and restores
// the pre-tour view synchronously, before the key's own handler runs, so the
// key that woke the store lands in the mode the visitor left.
import * as THREE from 'three';
import type { StoreScene } from './three-scene';
import { getSetting } from './settings';
import { getLastUserActivity, onUserActivity } from './user-activity';
import { counterFrame } from './counter-anchors';
import { activeStoreFormat } from './store-format';
import { STORE_CENTER_X, FRONT_GLASS_Z, FLOOR_FIXTURE_MAX_Z } from './store-layout';
import { fadeToBlack, fadeFromBlack } from './back-room';
import { isWelcomeActive, dismissWelcome } from './store-welcome';

export const ATTRACT_SETTING_KEY = 'bb_attract_mode';
/** Idle time before the tour starts — long enough to read the welcome card. */
export const ATTRACT_IDLE_MS = 12_000;
/** `?attract=1` (release-clip source): start almost immediately after boot. */
const FORCED_IDLE_MS = 1_000;
const POLL_MS = 500;
const EYE_Y = 5.5;

type Ease = 'in' | 'out' | 'inout' | 'none';

interface Leg {
  name: string;
  pos: THREE.CatmullRomCurve3;
  look: THREE.CatmullRomCurve3;
  /** Travel time along the leg. */
  ms: number;
  /** Dwell at the leg's end before the next leg starts. */
  holdMs: number;
  ease: Ease;
}

interface Pose { pos: THREE.Vector3; look: THREE.Vector3; leg: string }

let scene: StoreScene | null = null;
let blocked: () => boolean = () => false;
/** `?attract=1|0` overrides the setting for this page load. */
let forced: boolean | null = null;
let legs: Leg[] = [];
let totalMs = 0;
let active = false;
let pinned = false;
let fading = false;
let raf = 0;
let poll = 0;
let startedAt = 0;
let unsubscribe: (() => void) | null = null;
let saved: { walk: boolean; x: number; y: number; z: number; yaw: number; pitch: number } | null = null;

const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function curve(points: THREE.Vector3[]): THREE.CatmullRomCurve3 {
  // Catmull-Rom wants two points minimum; a held gaze is a duplicated point.
  const pts = points.length === 1 ? [points[0], points[0].clone()] : points;
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

function leg(name: string, pos: THREE.Vector3[], look: THREE.Vector3[], ms: number, ease: Ease, holdMs = 0): Leg {
  return { name, pos: curve(pos), look: curve(look), ms, holdMs, ease };
}

function ease(u: number, kind: Ease): number {
  switch (kind) {
    case 'in': return u * u;
    case 'out': return 1 - (1 - u) * (1 - u);
    case 'inout': return u * u * (3 - 2 * u);
    default: return u;
  }
}

/**
 * The path, read off the live layout. Feet, store coordinates: +X is the
 * shopper's right when facing the shelves, −Z is deeper into the store.
 *   1. facade → front door (outside, looking at the sign, then the doors)
 *   2. vestibule → side door → shop floor (or straight in without a chamber)
 *   3. down the central walkway, gaze drifting shelf to shelf, to the back wall
 *   4. turn and come back to the customer side of the counter
 *   5. rise into a front-corner overview of the whole floor, fade, loop
 */
function buildTour(s: StoreScene): Leg[] {
  const v = s.entrance?.getVestibuleInfo() ?? null;
  const chamber = !!v?.hasChamber;
  const frontZ = v?.frontZ ?? FRONT_GLASS_Z;
  const backZ = v?.backZ ?? 8.6;
  const sideZ = v?.sideDoorZ ?? (frontZ + backZ) / 2;
  const xR = v?.xR ?? 18.7;
  // Entrance leaf: the +X half of a chambered door pair, the middle of a single leaf.
  const xE = v ? (chamber ? v.cx + v.doorW / 2 : v.cx) : 13.0;
  const cx = STORE_CENTER_X;
  const fmt = activeStoreFormat();
  // Formats without a central walkway land a shelving run ON the centreline
  // (store-plan.ts); the free lane is half a run spacing over.
  const lane = fmt.centerWalkway > 0 ? cx : cx + fmt.runSpacing / 2;
  const zb = s.backWallZ;
  const zField = FLOOR_FIXTURE_MAX_Z;
  const zMid = (zField + zb) / 2;
  const zDeep = zb + 10;
  const f = counterFrame(s);
  // +n is into the counter; the customer stands 7ft out on the −n side,
  // a couple of feet along it so the register isn't dead centre.
  const atCounter = P(f.fx - f.nx * 7 + f.ux * 2, EYE_Y, f.fz - f.nz * 7 + f.uz * 2);
  const counterTop = P(f.fx, 3.6, f.fz);
  const half = s.getStoreWidth() / 2;
  const xCorner = cx - Math.min(16, Math.max(6, half - 5));

  const out: Leg[] = [];
  const doorstep = P(xE, EYE_Y, frontZ + 1.2);
  out.push(leg('facade',
    [P(xE + 6, 6.2, frontZ + 36), P(xE + 1.5, 5.7, frontZ + 14), doorstep],
    [P(cx, 8.5, frontZ - 1), P(xE, 5.4, frontZ - 6), P(xE, 5.2, backZ - 8)],
    14_000, 'in'));

  let floorEntry: THREE.Vector3;
  let floorGaze: THREE.Vector3;
  if (chamber) {
    floorEntry = P(xR + 6.5, EYE_Y, sideZ - 7);
    floorGaze = P(lane + 4, 4.6, zField - 10);
    out.push(leg('vestibule',
      [doorstep, P(xE, EYE_Y, sideZ + 0.6), P(xR + 2.5, EYE_Y, sideZ), floorEntry],
      [P(xE, 5.2, backZ - 8), P(xR + 6, 5.2, sideZ - 1), P(xR + 8, 5.0, -8), floorGaze],
      11_000, 'none'));
  } else {
    floorEntry = P(lane, EYE_Y, -3);
    floorGaze = P(lane, 4.8, zMid);
    out.push(leg('vestibule',
      [doorstep, P(xE, EYE_Y, 4), floorEntry],
      [P(xE, 5.2, -12), floorGaze],
      8_000, 'none'));
  }

  const backWallGaze = P(lane, 5.0, zb - 3);
  out.push(leg('aisles',
    [floorEntry, P(lane, EYE_Y, zField - 2), P(lane, EYE_Y, zMid), P(lane, EYE_Y, zDeep)],
    [floorGaze, P(lane - 8, 4.4, zMid - 2), P(lane + 8, 4.4, zDeep - 4), backWallGaze],
    26_000, 'out', 2_500));

  out.push(leg('counter',
    [P(lane, EYE_Y, zDeep), P(lane, EYE_Y, zMid + 2), atCounter],
    [backWallGaze, P(lane - 10, 4.8, zMid), counterTop],
    20_000, 'inout', 3_500));

  out.push(leg('overview',
    [atCounter, P(xCorner + 4, 6.5, zField + 6), P(xCorner, 7.5, -2)],
    [counterTop, P(cx, 4.5, zMid), P(cx + 2, 4.0, zb + 12)],
    14_000, 'inout', 3_000));
  return out;
}

function poseAt(ms: number): Pose | null {
  let t = ms;
  for (const l of legs) {
    if (t < l.ms + l.holdMs) {
      const u = ease(Math.min(1, t / l.ms), l.ease);
      return { pos: l.pos.getPointAt(u), look: l.look.getPointAt(u), leg: l.name };
    }
    t -= l.ms + l.holdMs;
  }
  return null;
}

// three.js: rotation.order 'YXZ' with rotation.y = yaw, rotation.x = pitch
// gives forward = (−sin yaw · cos pitch, sin pitch, −cos yaw · cos pitch).
function apply(s: StoreScene, pose: Pose): void {
  const { pos, look } = pose;
  s.camera.position.copy(pos);
  s.currentCameraPos.copy(pos);
  s.currentLookAt.copy(look);
  const dx = look.x - pos.x, dy = look.y - pos.y, dz = look.z - pos.z;
  s.yaw = Math.atan2(-dx, -dz);
  s.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  s.camera.rotation.order = 'YXZ';
  s.camera.rotation.set(s.pitch, s.yaw, 0);
  s.requestRender();
}

async function loopSeam(s: StoreScene): Promise<void> {
  fading = true;
  await fadeToBlack();
  if (!active || !fading) return;
  startedAt = performance.now();
  const first = poseAt(0);
  if (first) apply(s, first);
  fadeFromBlack();
  fading = false;
}

function tick(now: number): void {
  const s = scene;
  if (!active || !s) return;
  raf = requestAnimationFrame(tick);
  if (pinned) return;
  // Someone left walk mode under us (remote, F key, back room) or an overlay
  // came up: give the store back rather than fighting for the camera.
  if (s.mode !== 'walk-around' || document.visibilityState === 'hidden' || blocked()) {
    stopAttractTour();
    return;
  }
  if (fading) return;
  const pose = poseAt(now - startedAt);
  if (!pose) {
    void loopSeam(s);
    return;
  }
  apply(s, pose);
}

export function isAttractActive(): boolean {
  return active;
}

export function attractTourLength(): number {
  return totalMs;
}

/** Start the tour now. False when it is already running or the scene is in a state it must not hijack. */
export function startAttractTour(): boolean {
  const s = scene;
  if (active || !s) return false;
  if (s.mode === 'backroom' || s.mode === 'checkout' || s.mode === 'person-endcap') return false;
  legs = buildTour(s);
  totalMs = legs.reduce((sum, l) => sum + l.ms + l.holdMs, 0);
  const first = poseAt(0);
  if (!first) return false;
  const cam = s.camera;
  saved = s.isWalkAroundMode
    ? { walk: true, x: cam.position.x, y: cam.position.y, z: cam.position.z, yaw: s.yaw, pitch: s.pitch }
    : { walk: false, x: 0, y: EYE_Y, z: 0, yaw: 0, pitch: 0 };
  active = true;
  pinned = false;
  s.attractTour = true; // walk HUD stays down, camera counts as moving (three-scene.ts)
  s.teleportWalk(first.pos.x, first.pos.z, 0, 0, first.pos.y, true);
  // A programmatic walk toggle may still win the pointer lock on a page with
  // earlier activation; a showreel must never capture the mouse.
  if (document.pointerLockElement) document.exitPointerLock();
  s.updateWalkHUD();
  if (forced === true && isWelcomeActive()) dismissWelcome(); // clean frame for the clip
  apply(s, first);
  startedAt = performance.now();
  unsubscribe = onUserActivity(() => stopAttractTour());
  raf = requestAnimationFrame(tick);
  s.onConsoleLog?.('[Attract] Tour started — any key returns to the store.', 'system');
  return true;
}

/** Stop and put the pre-tour view back (a cut, like an arcade attract loop breaking). */
export function stopAttractTour(): void {
  const s = scene;
  if (!active || !s) return;
  active = false;
  pinned = false;
  cancelAnimationFrame(raf);
  unsubscribe?.();
  unsubscribe = null;
  if (fading) {
    fading = false;
    fadeFromBlack();
  }
  s.attractTour = false;
  if (s.isWalkAroundMode && s.mode === 'walk-around') {
    if (saved?.walk) {
      s.teleportWalk(saved.x, saved.z, (saved.yaw * 180) / Math.PI, (saved.pitch * 180) / Math.PI, saved.y, false);
    } else {
      s.toggleWalkAround(); // restores savedModeBeforeWalk, fires onModeChange, re-targets the camera
      s.snapCamera();
    }
  } else {
    s.walkFreecam = false;
  }
  s.updateWalkHUD();
  s.requestRender();
  saved = null;
  s.onConsoleLog?.('[Attract] Tour ended.', 'system');
}

/**
 * Harness / shot hook: park the tour at `ms` into its loop and hold there so
 * a screenshot can catch one beat (facade ≈ 4s, aisles ≈ 35s, counter ≈ 60s).
 * Returns the leg name the frame belongs to.
 */
export function pinAttractTour(s: StoreScene, ms: number): string {
  if (!active) {
    scene = s;
    if (!startAttractTour()) return '';
  }
  pinned = true;
  const pose = poseAt(Math.max(0, Math.min(ms, totalMs - 1))) ?? poseAt(0);
  if (!pose) return '';
  apply(s, pose);
  return pose.leg;
}

function enabled(): boolean {
  return forced ?? !!getSetting<boolean>(ATTRACT_SETTING_KEY);
}

/**
 * Arm the idle trigger. `isBlocked` is main.ts's word on overlays, playback
 * and the screensaver (shortcutsAllowed()); the tour neither starts under
 * them nor survives one coming up.
 */
export function installAttractMode(s: StoreScene, isBlocked: () => boolean): void {
  scene = s;
  blocked = isBlocked;
  const q = new URLSearchParams(location.search).get('attract');
  if (q === '1') forced = true;
  else if (q === '0') forced = false;
  (window as unknown as Record<string, unknown>).__attract = {
    start: startAttractTour,
    stop: stopAttractTour,
    pin: (ms: number) => pinAttractTour(s, ms),
    active: isAttractActive,
    length: attractTourLength,
  };
  if (poll) window.clearInterval(poll);
  poll = window.setInterval(() => {
    if (active || !scene || !enabled()) return;
    const idleFor = performance.now() - getLastUserActivity();
    if (idleFor < (forced === true ? FORCED_IDLE_MS : ATTRACT_IDLE_MS)) return;
    if (document.visibilityState === 'hidden' || blocked()) return;
    startAttractTour();
  }, POLL_MS);
}
