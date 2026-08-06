// "Look up at what's on the store TVs" — opened from the sub-nav jump index's
// Row 1 (store-subnav.ts), not from the shelf itself (2026-08-06, pin 051:
// ▲ past the top shelf row used to fall in here when the build had ambient
// TVs; the owner called that out as the wrong mode to trigger it from, so
// that press now always keeps its pre-peek job — see store-nav.ts moveUp's
// wrapOverShelfTop() call — and the peek only opens via ▲ at the sub-nav's
// Row 1, with the index staying open underneath it the whole time).
//
// The user stays logically in browse: nothing about the cursor changes, only
// the camera targets. Entry doesn't touch scene.subNav at all — it's still
// there, parked on Row 1 — so exiting just hands control back to it (the
// `onExit` callback store-nav.ts's moveDown/navOverlayBack pass to
// exitTvPeek) instead of the generic captured-browse-return restore. While
// the peek is up: ←/→ cycle the TVs, ▼ or Back drop back onto the index, ▲
// does nothing, and Select jumps straight to the box of whatever's playing
// (the one movie streaming to every set — see AmbientTvs.getPlayingMovie)
// via the same jumpToTitle path a search hit uses, landing in inspect (the
// mediator then closes the now-stale sub-nav underneath — see
// navOverlaySelect). With no stream (dead glass / test card) Select is a
// no-op, same as before.
//
// Framing follows the harness's `tvclose` state — sit on the screen's own
// normal so the tube reads square-on — and then backs off along that normal as
// far as the picture can afford, because these sets hang high and tilt ~38°
// down: walking back down the normal is what brings the eye toward standing
// height. So the distance is the one that lands the eye at EYE_Y, clamped
// between the tvclose-ish close fit (TARGET_FILL) and the point where the
// screen would shrink below MIN_FILL of the frame width. Going OFF the normal
// instead (standing on the floor and craning) was tried and rejected: at the
// ~26° that buys, near-field perspective squashes the 4:3 picture to nearly
// 2:1 and the set reads as seen from underneath, which is the opposite of
// "see what's playing". Fast one-shot glide (PEEK_GLIDE_LERP): a peek, not a
// tour. Nothing here runs per frame.
import * as THREE from 'three';
import { captureBrowseReturn, restoreBrowseReturn, BrowseReturn } from './browse-cursor';
import { CAMERA_GLIDE_LERP } from './scene-shared';
import type { StoreScene } from './three-scene';

export interface TvPeekState {
  tvIdx: number;
  ret: BrowseReturn;
}

type ScreenPose = { center: THREE.Vector3; normal: THREE.Vector3; width: number; height: number };

// Nearest / farthest the peek ever sits, as the fraction of the viewport WIDTH
// the screen spans there (tvclose docks at ~0.48). The pull-back toward
// standing height is allowed to spend everything between the two.
const TARGET_FILL = 0.45;
const MIN_FILL = 0.22;
// Where a standing shopper's eye sits (walk mode parks at 5.5 ft).
const EYE_Y = 5.6;
const MIN_EYE_Y = 4.4;
// One-shot glide factor while entering/cycling the peek — snappier than the
// browse default (0.3) and much snappier than the over-the-top wrap (0.2).
const PEEK_GLIDE_LERP = 0.42;

// Scratch — module-level so cycling TVs never allocates.
const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();

function screenPoses(scene: StoreScene): ScreenPose[] {
  return scene.ambientTvs?.getScreenPoses() ?? [];
}

export function tvPeekActive(scene: StoreScene): boolean {
  return scene.tvPeek !== null;
}

/** Index of the screen whose centre is nearest the camera right now. */
function nearestTv(scene: StoreScene, poses: ScreenPose[]): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < poses.length; i++) {
    const d = poses[i].center.distanceToSquared(scene.camera.position);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Point the camera at one screen: on the screen's own normal (square-on, the
 * `tvclose` reference framing), as far back down that normal as the picture
 * can afford — which is what walks the eye down toward standing height on a
 * downward-tilted ceiling set. A wall bank (level normal) simply docks at the
 * close fit and clamps its eye height.
 */
function frameTv(scene: StoreScene, pose: ScreenPose): void {
  const vFov = (scene.camera.fov * Math.PI) / 180;
  const tanH = Math.tan(vFov / 2) * scene.camera.aspect;
  const nearDist = pose.width / (2 * TARGET_FILL * Math.max(0.05, tanH));
  const farDist = pose.width / (2 * MIN_FILL * Math.max(0.05, tanH));
  let dist = nearDist;
  if (pose.normal.y < -0.05) {
    const eyeDist = (pose.center.y - EYE_Y) / -pose.normal.y;
    dist = THREE.MathUtils.clamp(eyeDist, nearDist, farDist);
  }
  _v.copy(pose.center).addScaledVector(pose.normal, dist);
  // Belt and braces on a set angled some way we didn't anticipate.
  _v.y = THREE.MathUtils.clamp(_v.y, MIN_EYE_Y, Math.max(MIN_EYE_Y, scene.ceilingY - 1.0));
  scene.targetCameraPos.copy(_v);
  scene.targetLookAt.copy(pose.center);
  scene.cameraGlideLerp = PEEK_GLIDE_LERP;
  scene.requestRender();
}

/**
 * Enter the peek (from the sub-nav's Row 1 — see store-nav.ts moveUp).
 * Returns false when this build/theme has no ambient TVs at all — the caller
 * then falls back to its own old behavior for that press.
 */
export function enterTvPeek(scene: StoreScene): boolean {
  if (scene.tvPeek) return true;
  const poses = screenPoses(scene);
  if (poses.length === 0) return false;
  const tvIdx = nearestTv(scene, poses);
  // `ret` is a fallback restore target only — the sub-nav is the sole entry
  // point now, so exitTvPeek's caller-supplied `onExit` normally wins.
  scene.tvPeek = { tvIdx, ret: captureBrowseReturn(scene) };
  frameTv(scene, poses[tvIdx]);
  scene.onConsoleLog(
    `[System] Looking up at the store TV${poses.length > 1 ? ' — ←/→ for the other set' : ''}. ▼ or Back returns.`,
    'system');
  return true;
}

/**
 * Select while peeking: jump straight to the box of whatever's playing.
 * Returns true whenever a peek was active (the press is consumed either
 * way — a peek has nothing else to confirm); the jump itself only fires
 * when there's an actual stream to chase.
 */
export function tvPeekSelect(scene: StoreScene): boolean {
  const peek = scene.tvPeek;
  if (!peek) return false;
  const movie = scene.ambientTvs?.getPlayingMovie();
  if (!movie) return true; // dead glass / test card — nothing to jump to
  scene.tvPeek = null; // leaving the peek for real inspect, not a browse return
  scene.jumpToTitle(movie.id);
  return true;
}

/**
 * ▼ or Back while peeking. `onExit` (supplied by store-nav.ts, the mediator
 * between this module and store-subnav.ts) says what to hand control back to
 * — normally "resume the sub-nav's Row 1" now that entry is exclusively from
 * there. Falls back to the captured raw browse-cursor restore when no
 * `onExit` is given, so a future caller that opens the peek some other way
 * still gets a sane default.
 */
export function exitTvPeek(scene: StoreScene, onExit?: () => void): boolean {
  const peek = scene.tvPeek;
  if (!peek) return false;
  scene.tvPeek = null;
  if (onExit) onExit();
  else restoreBrowseReturn(scene, peek.ret, PEEK_GLIDE_LERP);
  scene.onConsoleLog('[System] Back to the shelf.', 'system');
  return true;
}

/** ←/→ while peeking: cycle to the next set (no-op with a single TV). */
export function tvPeekCycle(scene: StoreScene, dir: number): boolean {
  const peek = scene.tvPeek;
  if (!peek) return false;
  const poses = screenPoses(scene);
  if (poses.length === 0) return true;
  peek.tvIdx = (peek.tvIdx + (dir >= 0 ? 1 : -1) + poses.length) % poses.length;
  frameTv(scene, poses[peek.tvIdx]);
  return true;
}

/**
 * Harness probe (`tvpeek` checkpoint): is the camera actually looking at a TV
 * screen, and how big is it in frame? Reads the camera TARGETS, so it answers
 * the same before and after the glide settles.
 */
export function debugTvPeek(scene: StoreScene): {
  active: boolean; tvIdx: number; screens: number;
  offAxisDeg: number; fillFrac: number; dist: number; eyeY: number;
} {
  const poses = screenPoses(scene);
  const peek = scene.tvPeek;
  const out = {
    active: !!peek, tvIdx: peek?.tvIdx ?? -1, screens: poses.length,
    offAxisDeg: 180, fillFrac: 0, dist: 0, eyeY: scene.targetCameraPos.y,
  };
  const pose = peek ? poses[peek.tvIdx] : undefined;
  if (!pose) return out;
  _v.copy(pose.center).sub(scene.targetCameraPos);
  out.dist = _v.length();
  _fwd.copy(scene.targetLookAt).sub(scene.targetCameraPos).normalize();
  out.offAxisDeg = THREE.MathUtils.radToDeg(Math.acos(
    THREE.MathUtils.clamp(_fwd.dot(_v.normalize()), -1, 1)));
  const vFov = (scene.camera.fov * Math.PI) / 180;
  const tanH = Math.tan(vFov / 2) * scene.camera.aspect;
  out.fillFrac = pose.width / (2 * Math.max(0.01, out.dist) * Math.max(0.05, tanH));
  return out;
}

/** Scene teardown / rebuild: drop the peek without touching the dead camera. */
export function forgetTvPeek(scene: StoreScene): void {
  scene.tvPeek = null;
  scene.cameraGlideLerp = CAMERA_GLIDE_LERP;
}
