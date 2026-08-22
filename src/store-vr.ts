// WebXR VR walk mode (issue #79, v1) — everything VR lives here; three-scene.ts
// only calls setupVRAffordance() once from initThree(). Feature-detects
// navigator.xr and, if immersive-vr is supported, unhides the standalone
// "Enter VR" button (the vr-entry-overlay in index.html — outside the walk
// HUD, because a headset browser has no F key to reach walk mode, so the
// button must be clickable from any flat view; enterVR() enters walk mode
// itself first). Every function here takes the StoreScene as its first
// parameter, matching the store-*.ts extraction pattern; nothing is ever
// bolted onto the class.
//
// Design invariant: a VR session never outlives walk-around mode. Every
// other screen (inspect, browse, playback, checkout, the CRT terminals...) is
// a flat camera-glide view with no head-tracking story yet, and
// store-walk.ts's walkInspectSlot() already calls toggleWalkAround() the
// instant a case is picked up. So "end the session before starting
// playback" (the issue's requirement) falls out of ONE check in onXRFrame —
// nothing reachable from walk mode can start playback without leaving walk
// mode first, and leaving walk mode for any reason ends the session.
//
// CONTROLLER MAPPING (either hand — handedness only matters for the sticks):
//   Trigger (select)    -> OK: raycasts from that controller and resolves it
//                          through resolveWalkRaycastHit(), the exact same
//                          tail the mouse-look reticle's click uses.
//   Grip (squeeze)       -> Back: toggleWalkAround() + end the session — the
//                          same call main.ts's onBack makes for the keyboard/
//                          gamepad Back binding while isWalkAroundMode.
//   Left thumbstick      -> locomotion, through constrainWalkPosition() (the
//                          same clamp WASD/gamepad movement uses).
//   Right thumbstick X   -> snap-turn, 45 degrees, comfort default.
//   Unused in v1: A/B/X/Y, thumbstick clicks, right-stick Y. There's no VR
//   browse-cursor state yet (walk mode is the only VR surface), so the
//   issue's "arrows for browse cursor where sensible" has nothing to bind to
//   until a VR browse mode exists.
//
// Render path: VR always renders at the low tier, structurally — every VR
// frame calls renderer.render(scene, camera) directly instead of going
// through three-scene.ts's EffectComposer chain (SSAO/bloom/FXAA/film-grain/
// vignette), which is a 2D screen-space pipeline built around one mono
// render target and isn't stereo/XR aware. The resolution knob is the WebXR-
// native equivalent of the flat loop's resScale: setFramebufferScaleFactor(),
// backed by localStorage bb_vr_render_scale (default 1.0).
import * as THREE from 'three';
import type { StoreScene } from './three-scene';
import { resolveWalkRaycastHit } from './store-walk';

const VR_RENDER_SCALE_KEY = 'bb_vr_render_scale';

const VR_WALK_SPEED = 8.0;             // ft/s — matches the flat walk loop's WALK_SPEED
const VR_DEADZONE = 0.15;              // matches the flat loop's gamepad stick deadzone
const VR_SNAP_TURN_RAD = Math.PI / 4;  // 45 degrees, comfort default
const VR_SNAP_ENGAGE = 0.7;            // stick deflection that fires a snap-turn
const VR_SNAP_RESET = 0.3;             // must fall back below this before it can fire again
const VR_EYE_HEIGHT_FT = 5.5;          // matches the flat walk mode's forced eye height
const VR_PITCH_PAD = 0.05;             // matches the flat loop's pitch clamp pole padding

interface VRState {
  rig: THREE.Group;
  raycaster: THREE.Raycaster;
  session: XRSession | null;
  pending: boolean;    // requestSession() in flight — guards a double-click racing the promise
  snapReady: boolean;
  lastTime: number;
}

const vrStates = new WeakMap<StoreScene, VRState>();

// Scratch registers reused every VR frame — no per-frame allocations (see
// CLAUDE.md's performance directive; three-scene.ts's own walk loop follows
// the same pattern with _walkFwd/_walkRight/_walkMove).
const _vrFwd = new THREE.Vector3();
const _vrRight = new THREE.Vector3();
const _vrMove = new THREE.Vector3();
const _vrEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _tmpMatrix = new THREE.Matrix4();

function readRenderScale(): number {
  const raw = localStorage.getItem(VR_RENDER_SCALE_KEY);
  const parsed = raw !== null ? parseFloat(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 1.0;
  return THREE.MathUtils.clamp(parsed, 0.5, 1.5);
}

function setVRButtonEnabled(enabled: boolean): void {
  const btn = document.getElementById('walk-vr-enter') as HTMLButtonElement | null;
  if (btn) btn.disabled = !enabled;
}

function getOrCreateState(scene: StoreScene): VRState {
  const existing = vrStates.get(scene);
  if (existing) return existing;

  const rig = new THREE.Group();
  scene.scene.add(rig);
  const state: VRState = { rig, raycaster: new THREE.Raycaster(), session: null, pending: false, snapReady: true, lastTime: 0 };
  vrStates.set(scene, state);

  // Both controllers get the SAME two bindings — handedness only matters for
  // the thumbstick reads in onXRFrame (those go straight to
  // frame.session.inputSources[i].handedness, not through these groups).
  for (let i = 0; i < 2; i++) {
    const controller = scene.renderer.xr.getController(i);
    controller.addEventListener('selectstart', () => onSelectStart(scene, state, controller));
    controller.addEventListener('squeezestart', () => onSqueezeStart(scene, state));
    rig.add(controller);
  }

  // The single teardown path, regardless of who ended the session (our own
  // requestExitVR, or the headset/OS side) — see cleanupAfterSession.
  scene.renderer.xr.addEventListener('sessionend', () => cleanupAfterSession(scene, state));

  return state;
}

// Called once from StoreScene.initThree(). Feature-detects navigator.xr +
// immersive-vr support and, if present, unhides the standalone Enter VR
// button (vr-entry-overlay, index.html) — no-ops cleanly on Tauri desktop or
// any non-XR browser, where navigator.xr is undefined.
export function setupVRAffordance(scene: StoreScene): void {
  const btn = document.getElementById('walk-vr-enter') as HTMLButtonElement | null;
  if (!btn || !navigator.xr) return;

  navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) return;
    btn.hidden = false;
    btn.onclick = () => {
      btn.disabled = true;
      void enterVR(scene);
    };
  }).catch(() => { /* isSessionSupported itself can reject on some UAs — stay hidden */ });
}

export async function enterVR(scene: StoreScene): Promise<void> {
  if (!navigator.xr) return;

  const state = getOrCreateState(scene);
  if (state.session || state.pending) return; // already presenting or mid-request

  // VR only runs over walk mode (see the module header invariant), but the
  // player can't be required to already BE there: a headset browser has no F
  // key, so from any flat view entering VR enters walk mode itself first.
  // toggleWalkAround() can refuse (backroom lockout) — bail rather than start
  // a session over a view the rig can't drive. Track whether WE walked, so a
  // failed session request can toggle back out instead of stranding a
  // keyboardless player in walk mode with no way to leave it.
  let walkedForVR = false;
  if (!scene.isWalkAroundMode) {
    scene.toggleWalkAround();
    if (!scene.isWalkAroundMode) { setVRButtonEnabled(true); return; }
    walkedForVR = true;
  }
  state.pending = true;

  let session: XRSession;
  try {
    session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
  } catch {
    state.pending = false;
    setVRButtonEnabled(true);
    if (walkedForVR && scene.isWalkAroundMode) scene.toggleWalkAround();
    scene.onConsoleLog('[System] VR session request was denied or failed.', 'system');
    return;
  }

  scene.renderer.xr.enabled = true;
  scene.renderer.xr.setFramebufferScaleFactor(readRenderScale());

  try {
    scene.renderer.xr.setReferenceSpaceType('local-floor');
    await scene.renderer.xr.setSession(session);
  } catch {
    // Not every runtime grants local-floor; 'local' is the universal
    // fallback (WebXR's only other mandatory-support space besides
    // 'viewer'). The rig still starts at floor level either way — v1 has no
    // seated/recentre handling, so a 'local' session's floor is wherever
    // tracking booted.
    try {
      scene.renderer.xr.setReferenceSpaceType('local');
      await scene.renderer.xr.setSession(session);
    } catch {
      state.pending = false;
      setVRButtonEnabled(true);
      scene.renderer.xr.enabled = false;
      if (walkedForVR && scene.isWalkAroundMode) scene.toggleWalkAround();
      scene.onConsoleLog('[System] VR session failed to start.', 'system');
      await session.end().catch(() => { /* already dead — nothing to clean up */ });
      return;
    }
  }

  state.pending = false;
  state.session = session;
  state.snapReady = true;
  state.lastTime = performance.now();

  // Seed the rig at exactly the pose the flat loop was tracking, so entering
  // VR never teleports the player. The camera becomes a rig-relative head:
  // WebXRManager composes the tracked head pose on top of camera.parent's
  // matrixWorld (see updateCamera() in three's WebXRManager.js) — that's why
  // this must be a parent, not a second position write on the camera itself.
  state.rig.position.set(scene.camera.position.x, 0, scene.camera.position.z);
  state.rig.rotation.set(0, scene.yaw, 0);
  scene.camera.position.set(0, 0, 0);
  scene.camera.rotation.set(0, 0, 0);
  state.rig.add(scene.camera);

  // three-scene.ts's animate() is the flat render-on-demand loop (its own
  // manual requestAnimationFrame chain); an XR session needs continuous
  // frames instead, driven by the session's own rAF under
  // renderer.setAnimationLoop. pauseRendering()/resumeRendering() (already
  // used for playback and the screensaver) is the exact pause/resume seam
  // this needs — reused as-is, not forked.
  scene.pauseRendering();
  scene.renderer.setAnimationLoop((time, frame) => onXRFrame(scene, state, time, frame));
  scene.onConsoleLog('[System] Entered VR.', 'system');
}

function requestExitVR(scene: StoreScene): void {
  const state = vrStates.get(scene);
  if (!state?.session) return;
  void state.session.end().catch(() => { /* already ending — cleanupAfterSession handles the rest */ });
}

function onSelectStart(scene: StoreScene, state: VRState, controller: THREE.Object3D): void {
  if (!state.session) return;
  _tmpMatrix.identity().extractRotation(controller.matrixWorld);
  state.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  state.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_tmpMatrix);
  resolveWalkRaycastHit(scene, state.raycaster.intersectObjects(scene.scene.children, true));
  // A hit that picked up a case already called toggleWalkAround() inside
  // walkInspectSlot() (store-walk.ts) — end the session to match.
  if (!scene.isWalkAroundMode) requestExitVR(scene);
}

function onSqueezeStart(scene: StoreScene, state: VRState): void {
  if (!state.session) return;
  scene.toggleWalkAround();
  requestExitVR(scene);
}

function onXRFrame(scene: StoreScene, state: VRState, time: number, frame: XRFrame): void {
  if (!state.session) return;
  if (!scene.isWalkAroundMode) { requestExitVR(scene); return; }

  const dt = Math.min(0.1, (time - state.lastTime) / 1000);
  state.lastTime = time;

  let moveX = 0, moveY = 0, turnX = 0;
  for (const src of frame.session.inputSources) {
    const gp = src.gamepad;
    if (!gp || gp.axes.length < 2) continue;
    // 'xr-standard' gamepad mapping: axes[2]/[3] are the thumbstick on any
    // controller that also has a touchpad at axes[0]/[1]; two-axis
    // controllers (stick only, no touchpad) put it at axes[0]/[1] instead.
    const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0];
    const ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1];
    if (src.handedness === 'left') {
      if (Math.abs(ax) > VR_DEADZONE) moveX = ax;
      if (Math.abs(ay) > VR_DEADZONE) moveY = ay;
    } else if (src.handedness === 'right') {
      turnX = ax;
    }
  }

  // Snap-turn: fires once per push past VR_SNAP_ENGAGE, then waits for the
  // stick to fall back under VR_SNAP_RESET before it can fire again — the
  // hysteresis gap is what stops a held-over stick from spinning
  // continuously instead of stepping once.
  if (Math.abs(turnX) > VR_SNAP_ENGAGE) {
    if (state.snapReady) {
      state.rig.rotation.y -= Math.sign(turnX) * VR_SNAP_TURN_RAD;
      state.snapReady = false;
    }
  } else if (Math.abs(turnX) < VR_SNAP_RESET) {
    state.snapReady = true;
  }

  // Locomotion: constrainWalkPosition() is the exact clamp the flat WASD/
  // gamepad walk uses (store-walk.ts / three-scene.ts animate()) — reused,
  // not forked. Direction follows the RIG's heading (the snap-turned
  // facing), not the headset's momentary look direction, so glancing
  // sideways mid-walk doesn't curve the path — the standard VR comfort
  // convention.
  if (moveX !== 0 || moveY !== 0) {
    const forward = _vrFwd.set(0, 0, -1).applyQuaternion(state.rig.quaternion);
    const right = _vrRight.set(1, 0, 0).applyQuaternion(state.rig.quaternion);
    const move = _vrMove.set(0, 0, 0).addScaledVector(right, moveX).addScaledVector(forward, -moveY);
    if (move.lengthSq() > 1) move.normalize();
    const stepDist = VR_WALK_SPEED * dt;
    const oldX = state.rig.position.x;
    const oldZ = state.rig.position.z;
    const constrained = scene.constrainWalkPosition(
      oldX, oldZ,
      oldX + move.x * stepDist, oldZ + move.z * stepDist,
      scene.getStoreWidth(),
      scene.backWallZ + 1.5,
    );
    state.rig.position.x = constrained.x;
    state.rig.position.z = constrained.z;
  }

  // renderer.render() detects renderer.xr.isPresenting itself and draws both
  // eyes once scene.camera is carrying the XR pose (WebXRManager.updateCamera,
  // called inside this render() call) — see the module header for why this
  // deliberately bypasses three-scene.ts's EffectComposer chain.
  scene.renderer.render(scene.scene, scene.camera);

  // Keep the flat walk state live for anything that reads it off-loop — e.g.
  // store-walk.ts's walkInspectSlot() snapshots currentCameraPos/yaw/pitch
  // into walkReturnPose the instant a case is picked up, so backing out of
  // the resulting flat inspect view resumes exactly where VR left off rather
  // than wherever the player was standing when the headset went on. This
  // must run AFTER render(): camera.quaternion only carries this frame's
  // real head pose once WebXRManager has applied it during that call.
  scene.currentCameraPos.set(state.rig.position.x, VR_EYE_HEIGHT_FT, state.rig.position.z);
  scene.yaw = state.rig.rotation.y;
  _vrEuler.setFromQuaternion(scene.camera.quaternion, 'YXZ');
  scene.pitch = THREE.MathUtils.clamp(_vrEuler.x, -Math.PI / 2 + VR_PITCH_PAD, Math.PI / 2 - VR_PITCH_PAD);
}

function cleanupAfterSession(scene: StoreScene, state: VRState): void {
  if (!state.session) return; // stray sessionend with nothing of ours active
  state.session = null;

  scene.renderer.setAnimationLoop(null);
  scene.renderer.xr.enabled = false;

  const x = state.rig.position.x;
  const z = state.rig.position.z;
  state.rig.remove(scene.camera);
  scene.camera.position.set(x, VR_EYE_HEIGHT_FT, z);
  // WebXRManager overwrote fov/zoom from the eye projection for the
  // session's duration (see updateUserCamera in three's WebXRManager.js) —
  // restore initThree()'s PerspectiveCamera(60, ...) baseline.
  scene.camera.fov = 60;
  scene.camera.zoom = 1;
  scene.camera.rotation.order = 'YXZ';
  scene.yaw = state.rig.rotation.y;
  scene.camera.rotation.set(scene.pitch, scene.yaw, 0);
  scene.camera.updateProjectionMatrix();
  scene.currentCameraPos.copy(scene.camera.position);
  const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(scene.camera.quaternion);
  scene.currentLookAt.copy(scene.camera.position).add(lookDir);

  // Resumes the render-on-demand rAF chain exactly like coming back from
  // playback or the screensaver — the same seam, not a VR-specific fork.
  scene.resumeRendering();
  setVRButtonEnabled(true);
  scene.onConsoleLog('[System] Exited VR.', 'system');
}

/**
 * Tear down any active VR session and release DOM affordances on StoreScene disposal.
 * Called from StoreScene.destroy().
 */
export function disposeVR(scene: StoreScene): void {
  const state = vrStates.get(scene);
  if (state) {
    if (state.session) {
      void state.session.end().catch(() => { /* already dead — nothing to clean up */ });
      state.session = null;
    }
    vrStates.delete(scene);
  }
  const btn = document.getElementById('walk-vr-enter') as HTMLButtonElement | null;
  if (btn && btn.onclick) {
    btn.onclick = null;
  }
}
