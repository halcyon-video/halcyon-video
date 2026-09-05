// Dynamic resolution scaling (issue #27) — extracted from StoreScene, which
// keeps a one-line delegating stub. Every function takes the StoreScene as its
// first parameter and reads/writes scene state exactly as the original methods
// did.
//
// Once per second, using a window that only accumulates ACTIVE-tier frames,
// step resScale down when fps is sagging or up when it's comfortably healthy.
// Uses its own counters on purpose — a shared rendered-frame count would fold
// in VIDEO-tier's throttled ~24fps cadence, which would be misread as a slow
// GPU and permanently pin resScale to the floor. IDLE resets/snaps to 1.0 in
// the caller before this is ever reached.
//
// EVERY STEP COSTS A FULL RENDER-TARGET REALLOCATION. applyRenderResolution()
// resizes the drawing buffer and every pass's targets — measured at 19-20
// texImage2D calls and 30-38ms of main-thread time on the RX 9070 XT at
// --full. So a window that is not really a verdict about PIXEL cost does not
// just soften the store for no reason; it hitches to do it. That is what the
// two window-validity guards below are for.
import { computeScalerTargetFps } from './display-hz';
import { pendingTextureUploads } from './poster-textures';
import type { StoreScene } from './three-scene';

export const RES_SCALE_MAX = 1.0;
export const RES_SCALE_STEP = 0.05;

// A frame RATE cannot be measured from a single interval. Windows keep
// accumulating until they hold at least this many frames, so the guard costs
// a slow machine reaction time rather than the ability to react at all: at 1
// frame/second the window simply closes after ~3s instead of 1s.
const SCALER_MIN_FRAMES = 3;

// ...and any window containing a frame this long is describing a stall, not a
// rate. See updateDynamicResolution.
const SCALER_STALL_FRAME_MS = 250;

// Rounds to 2dp to keep repeated +/- 0.05 steps from drifting off the
// 0.70/0.75/.../1.00 ladder due to binary floating point (e.g. 0.7 + 0.05 !==
// 0.75 bit-for-bit).
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Drop the in-flight measurement window on the floor.
 *
 * Called from every animate() branch that skips a composite (IDLE, VIDEO,
 * static persist, settle refine): those frames aren't paced by the GPU, so
 * folding them into the window would read as a slow GPU. Clears the stall
 * tracker too — without that, the gap ACROSS the skipped stretch would be
 * charged to the next window's worst frame.
 */
export function resetScalerWindow(scene: StoreScene, time: number) {
  scene.resScaleFrames = 0;
  scene.resScaleGoodStreak = 0;
  scene.resScaleWindowStart = time;
  scene.resScaleWorstMs = 0;
  scene.resScalePrevTime = 0;
}

export function updateDynamicResolution(
  scene: StoreScene, time: number, active: boolean, moving: boolean,
) {
  if (!active || !moving) {
    // VIDEO tier or stationary: don't let throttled or resting pacing feed the
    // window; just keep the clock from accumulating stale elapsed time across
    // the gap. (Deliberately keeps resScaleGoodStreak, as the original did —
    // standing still between two healthy seconds shouldn't cost the step up.)
    scene.resScaleFrames = 0;
    scene.resScaleWindowStart = time;
    scene.resScaleWorstMs = 0;
    scene.resScalePrevTime = 0;
    return;
  }
  // Texture uploads are not a GPU verdict. The boot wave (and any streaming
  // burst) hands this window frames pinned at 0.2-30fps by decode + upload
  // work whose cost has nothing to do with how many pixels we are shading —
  // the scaler read that as "slow GPU" and walked resolution down to the 0.70
  // floor on a machine that then held a locked 60. It only climbs back at
  // 0.05 per two good seconds, and cannot climb at all in the VIDEO tier
  // (the early return above), so one boot could soften the store for the rest
  // of the session. Skip the window entirely while the queue is draining.
  if (pendingTextureUploads() > 0) {
    resetScalerWindow(scene, time);
    return;
  }
  // Longest frame in the current window — the stall detector below.
  if (scene.resScalePrevTime === 0) {
    // First measured frame since a reset. Start the clock HERE, not at the
    // reset: the gap in between spans frames this window never measured (a
    // throttled VIDEO stretch, an idle park, the tail of the boot build), and
    // charging it as elapsed inflates the window's duration without adding a
    // sample — which reads back as a low frame rate the stall check can't see,
    // because no measured frame was long.
    scene.resScaleWindowStart = time;
  }
  const gap = scene.resScalePrevTime > 0 ? time - scene.resScalePrevTime : 0;
  scene.resScalePrevTime = time;
  if (gap > scene.resScaleWorstMs) scene.resScaleWorstMs = gap;

  scene.resScaleFrames++;
  const elapsed = time - scene.resScaleWindowStart;
  // Both conditions, not either: a window that has run its second but holds
  // one or two frames is a stall being read as a frame rate, so let it keep
  // accumulating instead of ruling on it.
  if (elapsed < 1000 || scene.resScaleFrames < SCALER_MIN_FRAMES) return;

  // A STALLED FRAME IS NOT A FRAME RATE. The upload guard above catches only
  // the streaming half of the boot problem: the rest of a cold boot — store
  // construction, the environment bake, shadow bakes, first-use compiles —
  // hands this window frames measured in SECONDS, with the upload queue
  // already drained. Measured on the RX 9070 XT, three consecutive windows
  // read 0.2 / 0.9 / 0.7 fps that way and walked resScale 1.0 -> 0.85 on a
  // machine that then held a locked 60fps for the entire session; since it
  // only climbs back at 0.05 per two good seconds, the store rendered
  // needlessly soft for its first several seconds, and each of those steps
  // cost a render-target reallocation (and its hitch) of its own.
  //
  // 250ms is under FOUR fps: no machine the scaler can help renders there, and
  // no resolution step rescues a frame that took a quarter of a second. So a
  // window holding one is reporting a stall, not the cost of shading a pixel.
  // Discard it, in both directions — a stalled window is no evidence of health
  // either. This deliberately freezes the scaler on software GL, where every
  // frame costs seconds: that path starts AT resScaleMin already (see
  // initThree) and its only remaining direction is a step UP it could never
  // earn, so there is nothing there to lose.
  if (scene.resScaleWorstMs >= SCALER_STALL_FRAME_MS) {
    resetScalerWindow(scene, time);
    return;
  }

  const fps = (scene.resScaleFrames * 1000) / elapsed;
  // Thresholds scale with the display: the classic 50/58 pair was 60Hz
  // tuning (0.83×/0.97× of target); a 120Hz display gets 100/116. Measured
  // on the RX 9070 XT: motion-frame cost is mostly pixel-independent (AO
  // recompute + draw-call submission), so a tighter band just parks scale
  // at the floor for no fps — 0.83× is the right down-threshold here too.
  //
  // Bounded by SCALER_TARGET_FPS_CAP: that same pixel-independence means a
  // GPU short of the panel's refresh cannot buy the difference with
  // resolution, so scaling the thresholds all the way up with an uncapped
  // 144/165Hz display parks resScale at the floor permanently. See
  // computeScalerTargetFps.
  const scalerTarget = computeScalerTargetFps(scene.targetFps);
  const downAt = scalerTarget * 0.83;
  const upAt = scalerTarget * 0.97;
  if (fps < downAt && scene.resScale > scene.resScaleMin) {
    scene.resScale = Math.max(scene.resScaleMin, round2(scene.resScale - RES_SCALE_STEP));
    scene.resScaleGoodStreak = 0;
    scene.applyRenderResolution();
    console.log(`[resScale] ${fps.toFixed(1)}fps < ${downAt.toFixed(0)} — down to ${scene.resScale}`);
  } else if (fps > upAt && scene.resScale < RES_SCALE_MAX) {
    scene.resScaleGoodStreak++;
    // Require fps to hold above the up-threshold for 2 consecutive seconds
    // before stepping up, so a single lucky frame doesn't cause up/down
    // oscillation at the edge.
    if (scene.resScaleGoodStreak >= 2) {
      scene.resScale = Math.min(RES_SCALE_MAX, round2(scene.resScale + RES_SCALE_STEP));
      scene.resScaleGoodStreak = 0;
      scene.applyRenderResolution();
      console.log(`[resScale] ${fps.toFixed(1)}fps > ${upAt.toFixed(0)} — up to ${scene.resScale}`);
    }
  } else {
    scene.resScaleGoodStreak = 0;
  }

  scene.resScaleFrames = 0;
  scene.resScaleWindowStart = time;
  scene.resScaleWorstMs = 0;
}
