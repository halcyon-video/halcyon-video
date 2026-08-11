// Live planar mirrors — extracted from StoreScene (three-scene.ts keeps
// one-line delegating stubs). The cornice band and the front soffit ring are
// three.js Reflectors: each renders the whole scene again from its own
// viewpoint, which is the single most expensive thing in the frame at catalog
// scale. This module decides which machines get them at all, how often a stale
// reflection is allowed to redraw, and which mirror that redraw is spent on.
//
// Every function takes the StoreScene as its first parameter and reads/writes
// scene state exactly as the original methods did.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { perfTrace } from './perf-trace';
import { SP_MIRROR, CT_MIRROR, MIRROR_REFRESH_HZ } from './scene-shared';
import type { StoreScene } from './three-scene';

// Recursion guard, module-scoped: the pillars face each other and the cornice
// faces the room, so an unguarded reflector renders inside another reflector's
// render, cascading into hundreds of nested scene draws.
let reflectorRendering = false;

// Reflections redrawn per admitted frame. A second one does not amortise — it
// costs ~5ms of its own and drops p50 below 60fps.
const MIRRORS_PER_FRAME = 1;

export type MirrorEntry = {
  r: any; dirty: boolean; original: (...a: any[]) => void;
  /** False until this reflector has rendered once — its target is still blank. */
  rendered: boolean;
};

// Scratch, module-scoped so the per-frame pass allocates nothing.
const frustumScratch = new THREE.Frustum();
const projScreenScratch = new THREE.Matrix4();
const sphereScratch = new THREE.Sphere();
const normalScratch = new THREE.Vector3();
const centreScratch = new THREE.Vector3();

/**
 * Can the main camera see this mirror's reflective side?
 *
 * Frustum test, then a facing test. The facing half matters because mirrors
 * come in sets that point away from each other — the four faces of a mirrored
 * column, the cornice bands on opposite walls — and a Reflector's back is
 * blank. Without it the two faces of a column behind you sit in the frustum's
 * bounding-sphere test and take turns eating the refresh budget that the face
 * you are looking at should have had.
 */
function onScreen(m: MirrorEntry, cameraPos: THREE.Vector3): boolean {
  const geo = m.r.geometry;
  if (!geo) return false;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  sphereScratch.copy(geo.boundingSphere).applyMatrix4(m.r.matrixWorld);
  if (!frustumScratch.intersectsSphere(sphereScratch)) return false;
  // PlaneGeometry faces +Z locally; a Reflector only reflects on that side.
  normalScratch.set(0, 0, 1).transformDirection(m.r.matrixWorld);
  centreScratch.setFromMatrixPosition(m.r.matrixWorld);
  return normalScratch.dot(centreScratch.sub(cameraPos)) < 0;
}

/**
 * Does this machine get live planar reflections at all? (Owner product call,
 * 2026-08-11: "underpowered machines can't have the mirror.")
 *
 * Machines that don't get them fall back to the env-mapped chrome the
 * softwareGL and WebKitGTK paths already used — free, and it can never go
 * stale, because an environment map is evaluated per fragment every frame.
 *
 * The tier is the calibrated one (src/quality-calibrate.ts measures the GPU),
 * so 'low' and 'medium' are exactly what "underpowered" already means
 * everywhere else in the app.
 */
export function liveMirrorsAllowed(scene: StoreScene): boolean {
  return !scene.softwareGL && !scene.webkitGL && scene.effectiveQuality === 'high';
}

/**
 * Render-target size for a Reflector, derived from the REAL drawing buffer and
 * capped by quality tier.
 *
 * A Reflector samples its texture with SCREEN-space projective coords, so the
 * target has to track the drawing buffer's shape and size, not a magic square.
 * A fixed 512x512 (what shipped once) is a ~7x upscale of a non-mipmapped
 * target squashed to 1:1 and stretched back over a 20:1 band — the blocky smear
 * in the feedback pin. Fill cost is the only thing that grows with this; the
 * reflected scene's draw calls, which are what a refresh actually costs, do not.
 */
export function reflectorTargetSize(renderer: THREE.WebGLRenderer): { w: number; h: number } {
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  const quality = localStorage.getItem('bb_quality') || 'high';
  const cap = quality === 'low' ? 256 : quality === 'medium' ? 512 : 1024;
  const w = Math.max(64, Math.min(cap, Math.round(buf.x)));
  return { w, h: Math.max(64, Math.round(w * (buf.y / Math.max(1, buf.x)))) };
}

/**
 * Render stale reflections as their own phase at the top of the frame: at most
 * one per admitted frame, admitted at MIRROR_REFRESH_HZ rather than frame rate,
 * and always spent on a mirror the player can actually see.
 *
 * WHAT DOES NOT MAKE A REFRESH CHEAPER, all measured on the 4K --full profile,
 * so nobody repeats them: a refresh costs ~5-8ms and that number will not move.
 * Dropping the reflector target from 1024px to 256px changes it by nothing.
 * Hiding every movie box AND every shelf carcass in the store changes it by
 * nothing either (7.08 -> 7.02ms). It is neither fill nor the scene's draw
 * calls, which rules out proxy geometry and baked shelf textures — there is
 * nothing cheaper to reflect.
 *
 * Beware one seductive measurement: hoisting these renders out of
 * onBeforeRender appears to take a refresh to 0.25ms. It does not. That average
 * is collected while the round-robin is mostly refreshing OFF-SCREEN mirrors,
 * whose virtual camera faces a wall and renders almost nothing. A mirror you
 * can see costs the full ~8ms wherever the render is issued from — so the
 * refresh RATE is the only real lever, which is why the stride below stays.
 *
 * Since the cost is fixed, the game is spending the budget well, and that is
 * what driving the renders from here buys over the stock onBeforeRender hook:
 * inside the hook a mirror can only refresh itself in scene draw order, so the
 * budget lands on whichever mirror happens to be drawn first — usually one
 * behind the camera. Here we can pick. Off-screen mirrors are skipped entirely
 * and stay sticky-dirty until seen, so every admitted refresh lands on a
 * reflection someone is looking at. Same cost as the old round-robin, ~8x the
 * useful freshness in the common one-mirror-in-frame view.
 *
 * (Hoisting also keeps the mirror's full scene pass out of the middle of the
 * composite, where it used to pile onto the shadow rebake and the AO recompute
 * in one ~37ms frame.)
 */
export function renderMirrorsAhead(scene: StoreScene) {
  if (scene.mirrorsFrozen || reflectorRendering) return;
  let any = false;
  for (const m of scene.mirrors) if (m.dirty) { any = true; break; }
  if (!any) return;

  // Refresh on a STRIDE. These are tilted chrome bands high on the cornice and
  // soffit, grazing and foreshortened, and nobody resolves a case spine in one,
  // so ~20Hz under a 60Hz camera is invisible while the skipped full scene
  // render is very much not: refreshing every frame instead triples total
  // mirror time (1414ms -> 4254ms over one --full perf session), adds 43% to
  // the session's draw calls and pushes p99 from 23.8ms to 27.9ms. Dirty flags
  // are sticky, so nothing is ever lost — a refresh just lands a frame or two
  // later. Deriving the stride from targetFps keeps that cadence put as the
  // display changes.
  const stride = Math.max(1, Math.round(scene.targetFps / MIRROR_REFRESH_HZ));
  scene.mirrorMotionParity = (scene.mirrorMotionParity + 1) % stride;
  if (scene.mirrorMotionParity !== 0) return;

  let budget = MIRRORS_PER_FRAME;
  reflectorRendering = true;
  // The selection arrow must not appear in a reflection.
  const arrowWasVisible = scene.selectionArrow ? scene.selectionArrow.visible : false;
  if (scene.selectionArrow) scene.selectionArrow.visible = false;
  try {
    projScreenScratch.multiplyMatrices(
      scene.camera.projectionMatrix, scene.camera.matrixWorldInverse);
    frustumScratch.setFromProjectionMatrix(projScreenScratch);

    const draw = (m: MirrorEntry) => {
      m.dirty = false;
      m.rendered = true;
      budget--;
      perfTrace.count(CT_MIRROR);
      perfTrace.begin(SP_MIRROR);
      try { m.original(scene.renderer, scene.scene, scene.camera); }
      finally { perfTrace.end(SP_MIRROR); }
    };

    // Round-robin over the mirrors in frame, so several sharing the view share
    // the budget fairly, but let one that has NEVER rendered jump the queue:
    // its target is still blank, and a black band in the ceiling is not a
    // cosmetic problem the way a slightly stale reflection is.
    const n = scene.mirrors.length;
    const camPos = scene.camera.position;
    let fallback = -1;
    for (let k = 0; k < n && budget > 0; k++) {
      const idx = (scene.mirrorCursor + k) % n;
      const m = scene.mirrors[idx];
      if (!m.dirty || !onScreen(m, camPos)) continue;
      if (!m.rendered) { scene.mirrorCursor = (idx + 1) % n; draw(m); break; }
      if (fallback < 0) fallback = idx;
    }
    if (budget > 0 && fallback >= 0) {
      scene.mirrorCursor = (fallback + 1) % n;
      draw(scene.mirrors[fallback]);
    }
  } finally {
    if (scene.selectionArrow) scene.selectionArrow.visible = arrowWasVisible;
    reflectorRendering = false;
  }
}

/**
 * Collect the scene's Reflectors and neuter their built-in render hook.
 *
 * A stock Reflector re-renders itself from onBeforeRender every time it is
 * drawn, and because the pillars face each other and the cornice faces the
 * room, those renders nest into each other — hundreds of nested scene draws
 * that overrun the GPU. We keep a reference to that original render function
 * and call it ourselves, at most once per admitted frame, from
 * renderMirrorsAhead(); the hook itself becomes a no-op.
 *
 * Called once per build, so it resets the list first — a rebuild otherwise
 * leaves entries pointing at the previous store's destroyed Reflectors, and
 * the refresh budget gets spent redrawing them.
 */
export function installMirrorThrottle(scene: StoreScene) {
  scene.mirrors.length = 0;
  scene.mirrorCursor = 0;
  scene.scene.traverse((obj) => {
    if (obj instanceof Reflector) {
      scene.mirrors.push({
        r: obj, dirty: true, rendered: false, original: obj.onBeforeRender.bind(obj),
      });
      obj.onBeforeRender = () => {};  // see renderMirrorsAhead()
    }
  });
}

/**
 * Called once per frame, before renderMirrorsAhead(). Marks reflections stale.
 *
 * A planar reflection of a static scene only changes when the VIEWER moves, so
 * a parked camera marks nothing and every mirror reuses its last texture — a
 * still store still costs zero. `forceAll` covers the cases where the scene
 * changed under a stationary camera instead: rebuilds, shelf pops, end-cap
 * motion, and the clerk coming to rest.
 */
export function updateMirrorThrottle(scene: StoreScene, forceAll: boolean) {
  const moved =
    scene.camera.position.distanceToSquared(scene.lastMirrorCamPos) > 1e-6 ||
    Math.abs(1 - Math.abs(scene.camera.quaternion.dot(scene.lastMirrorCamQuat))) > 1e-7;

  if (moved || forceAll) {
    scene.lastMirrorCamPos.copy(scene.camera.position);
    scene.lastMirrorCamQuat.copy(scene.camera.quaternion);
    for (const m of scene.mirrors) m.dirty = true;
  }
}
