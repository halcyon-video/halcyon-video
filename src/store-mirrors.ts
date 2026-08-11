// Live planar-mirror throttling — extracted from StoreScene (three-scene.ts
// keeps one-line delegating stubs). The cornice band and the front soffit ring
// are three.js Reflectors: each one re-renders the whole scene from its own
// viewpoint, which is the single most expensive thing in the frame at catalog
// scale. Everything here exists to make them cost almost nothing when nothing
// about the reflection has actually changed.
//
// Both functions take the StoreScene as their first parameter and read/write
// scene state exactly as the original methods did.
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { perfTrace } from './perf-trace';
import { SP_MIRROR, CT_MIRROR, MIRROR_REFRESH_HZ } from './scene-shared';
import type { StoreScene } from './three-scene';

// Recursion guard, module-scoped: the pillars face each other and the cornice
// faces the room, so an unguarded reflector renders inside another reflector's
// render, cascading into hundreds of nested scene draws.
let reflectorRendering = false;

/**
 * A naive setup re-renders every mirror's reflection every frame. Each
 * Reflector renders the whole scene from its viewpoint, and because the
 * pillars face each other + the cornice faces the room, those renders
 * cascade into each other — hundreds of nested renders that crash the GPU,
 * and even guarded against recursion they cost ~12 full scene renders/frame
 * (~26 fps).
 *
 * But a planar reflection of a static scene only changes when the *viewer*
 * moves. So we wrap each mirror's onBeforeRender to render only when:
 *   - no other mirror is mid-render (kills the recursion cascade), AND
 *   - this mirror is "dirty" (the camera moved since it last rendered), AND
 *   - we're under the per-frame budget (≤1 mirror render/frame).
 * When you're parked at a shelf the mirrors are free (they reuse their last
 * reflection texture, which is still correct), so browsing runs at full
 * frame-rate. Reflections are frozen while the camera moves and refreshed once
 * it settles (see updateMirrorThrottle) — the reflection is a real render, so
 * shelves are the right size and perspective from wherever you come to rest.
 */
export function installMirrorThrottle(scene: StoreScene) {
  scene.scene.traverse((obj) => {
    if (obj instanceof Reflector) {
      const entry = { r: obj, dirty: true };
      scene.mirrors.push(entry);
      const original = obj.onBeforeRender.bind(obj);
      obj.onBeforeRender = (...args: any[]) => {
        if (reflectorRendering) return;                 // no mirror-in-mirror nesting
        if (!entry.dirty || scene.mirrorRenderBudget <= 0) return;  // static view → reuse last reflection
        entry.dirty = false;
        scene.mirrorRenderBudget--;
        reflectorRendering = true;

        // Temporarily hide the selection arrow during mirror renders so it doesn't reflect
        const arrowWasVisible = scene.selectionArrow ? scene.selectionArrow.visible : false;
        if (scene.selectionArrow) {
          scene.selectionArrow.visible = false;
        }

        perfTrace.count(CT_MIRROR);
        perfTrace.begin(SP_MIRROR);
        try { (original as any)(...args); }
        finally {
          perfTrace.end(SP_MIRROR);
          if (scene.selectionArrow) {
            scene.selectionArrow.visible = arrowWasVisible;
          }
          reflectorRendering = false;
        }
      };
    }
  });
}

/**
 * Called once per frame before rendering. Decides whether any mirror needs
 * a fresh reflection this frame and, if so, admits at most one into the
 * render budget that installMirrorThrottle's onBeforeRender wrapper consumes.
 *
 * - Camera fully still and nothing structural changed: budget = 0, every
 *   mirror reuses its last reflection texture (0 reflector renders/frame).
 * - Camera moving: one mirror is round-robined into the dirty queue per
 *   frame (mirrorRefreshIdx), budget = 1, so reflections track the camera
 *   at ~1 render/frame instead of 4.
 * - Structural change (forceAll — scene rebuild, shelf pop, end-cap/clerk
 *   motion): every mirror is marked dirty, but the budget is still capped
 *   at 1/frame; mirrors that don't get the budget this frame stay dirty
 *   and drain over the next few frames.
 */
export function updateMirrorThrottle(scene: StoreScene, forceAll: boolean) {
  const moved =
    scene.camera.position.distanceToSquared(scene.lastMirrorCamPos) > 1e-6 ||
    Math.abs(1 - Math.abs(scene.camera.quaternion.dot(scene.lastMirrorCamQuat))) > 1e-7;

  if (moved || forceAll) {
    scene.lastMirrorCamPos.copy(scene.camera.position);
    scene.lastMirrorCamQuat.copy(scene.camera.quaternion);
  }

  if (forceAll) {
    for (const m of scene.mirrors) m.dirty = true;
  } else if (moved && scene.mirrors.length > 0) {
    scene.mirrors[scene.mirrorRefreshIdx % scene.mirrors.length].dirty = true;
    scene.mirrorRefreshIdx = (scene.mirrorRefreshIdx + 1) % scene.mirrors.length;
  }

  // A fresh reflection is a full extra scene render. "One per frame fits a
  // 60Hz budget" held on the small store; at catalog scale on the 4K kiosk
  // it does not — a --full perf session there attributes 7.2ms/frame to the
  // Reflectors, half of all render time, and they dominate ~80% of every
  // hitch (p90 26.0ms -> 20.2ms with them frozen). So refresh on a STRIDE:
  // these are tilted chrome bands high on the cornice and soffit, grazing
  // and foreshortened, and nobody resolves a case spine in one, so ~20Hz
  // under a 60Hz camera is invisible while the skipped draw-call replay is
  // not. Dirty flags stay sticky, so nothing is lost — a refresh just lands
  // a frame or two later, forceAll (clerk/end-cap motion) included. Deriving
  // the stride from targetFps keeps that cadence put as the display changes;
  // the old >90fps alternate-frame gate was this with a hardcoded 2.
  const stride = Math.max(1, Math.round(scene.targetFps / MIRROR_REFRESH_HZ));
  scene.mirrorMotionParity = (scene.mirrorMotionParity + 1) % stride;
  const admit = !scene.mirrorsFrozen && scene.mirrorMotionParity === 0;

  scene.mirrorRenderBudget = 0;
  if (admit) {
    for (const m of scene.mirrors) {
      if (m.dirty) { scene.mirrorRenderBudget = 1; break; }
    }
  }
}

