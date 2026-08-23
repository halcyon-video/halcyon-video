// First-person walk-around mode — extracted from StoreScene (three-scene.ts
// keeps one-line delegating stubs): pointer-lock acquisition, walk clicks
// (shelf case pick-up + inspect), slot raycast resolution, the collision
// clamp against the store footprints, the walk HUD and mode toggle. Every
// function takes the StoreScene as its first parameter and reads/writes
// scene state exactly as the original methods did.
import * as THREE from 'three';
import { MovieSlot } from './store-layout';
import { recordInspect } from './clerk-recommend';
import { retailAudio } from './audio';
import { takeTapeIntoCarry } from './store-checkout';
import type { StoreScene } from './three-scene';

// Max reach (ft) for walk-mode click interactions — beyond this a raycast
// hit is out of arm's-plus-a-step range and the click is ignored.
export const WALK_INTERACT_RANGE = 14;

export function requestWalkPointerLock(scene: StoreScene) {
  try {
    const p = scene.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.catch?.(() => { /* lock denied — movement-delta fallback covers it */ });
  } catch { /* pointer lock unsupported — movement-delta fallback covers it */ }
}

export function handleWalkClick(scene: StoreScene) {
  if (scene.walkPressStartedLocked && scene.isPointerLocked) {
    scene._mouse.set(0, 0);
  } else {
    // Unlocked press: under a mid-press lock engage, clientX/Y freeze at
    // the pre-lock cursor position, so the pointerdown coords are the
    // reliable "what the user clicked" point in both cases.
    const rect = scene.renderer.domElement.getBoundingClientRect();
    scene._mouse.set(
      ((scene.pointerStartX - rect.left) / rect.width) * 2 - 1,
      -((scene.pointerStartY - rect.top) / rect.height) * 2 + 1,
    );
  }
  scene._raycaster.setFromCamera(scene._mouse, scene.camera);
  resolveWalkRaycastHit(scene, scene._raycaster.intersectObjects(scene.scene.children, true));
}

// Shared tail of a walk-mode raycast pick, regardless of where the ray came
// from: the mouse-look reticle above, or (src/store-vr.ts) a VR headset's
// gaze ray fired from the trigger button. Do not fork this — a new input
// source should build its own THREE.Raycaster and hand the sorted
// intersections here rather than re-implementing the clasp/tip-jar/slot
// resolution order. Returns whether anything was actually resolved, so a
// caller can fall back to some OTHER action (store-vr.ts's counter-proximity
// checkout confirm) only when the ray hit nothing.
//
// onSlotHit defaults to the flat mouse-look click's walkInspectSlot (drop
// into the 2D inspect view); store-vr.ts passes walkTakeSlot instead, so a
// VR trigger pull puts the case straight into the carried stack and never
// leaves walk mode (issue #97 — picking up a movie in VR must not warp the
// camera to a flat view).
export function resolveWalkRaycastHit(
  scene: StoreScene,
  intersects: THREE.Intersection[],
  onSlotHit: (scene: StoreScene, slot: MovieSlot) => void = (s, slot) => s.walkInspectSlot(slot),
): boolean {
  for (const hit of intersects) {
    if (hit.distance > WALK_INTERACT_RANGE) break; // sorted by distance — nothing reachable left
    // Recommendation clasps are plain meshes, so they'd be skipped by the
    // instanceId guard below — check them first. This is the main way the
    // clasps get used: you're walking the aisles when you want one.
    const claspTarget = scene.shelfClasps.targetFor(hit.object);
    if (claspTarget) {
      scene.callClerkToClasp(claspTarget);
      return true;
    }
    // The tip card and its cup are plain meshes too — same reason as the
    // clasps, they'd be skipped by the instanceId guard below. Clicking either
    // opens the overlay (src/tip-jar.ts); walking on ignores it entirely.
    if (scene.tipJars.some((jar) => jar.hitTest(hit.object))) {
      scene.openTipJar();
      return true;
    }
    if (hit.instanceId === undefined) continue;
    const slot = scene.getSlotFromIntersection(hit.object, hit.instanceId);
    if (slot && !slot.hidden) {
      onSlotHit(scene, slot);
      return true;
    }
  }
  return false;
}

export function walkInspectSlot(scene: StoreScene, slot: MovieSlot) {
  scene.walkReturnPose = {
    x: scene.currentCameraPos.x,
    z: scene.currentCameraPos.z,
    yaw: scene.yaw,
    pitch: scene.pitch,
    savedMode: scene.savedModeBeforeWalk,
  };
  scene.toggleWalkAround(); // exit walk (restores savedModeBeforeWalk, releases pointer lock)

  scene.selectedLibraryIdx = slot.libraryIdx;
  if (slot.source === 'fixture') {
    scene.selectedUnitSource = 'fixture';
    scene.selectedFixtureId = slot.fixtureId!;
    scene.selectedUnitIdx = -1;
  } else {
    scene.selectedUnitSource = 'shelving';
    scene.selectedFixtureId = null;
    scene.selectedUnitIdx = slot.unitIdx;
  }
  scene.selectedSide = slot.side;
  scene.selectedShelf = slot.shelfIdx;
  scene.selectedCol = slot.col;
  scene.isBrowsingNewReleasesDirectly = false;
  scene.mode = 'inspect';
  scene.isFlipped = false; scene.heroSpine = false;
  scene.resetHeroFace();
  scene.updateColsCount();
  if (scene.onModeChange) scene.onModeChange(scene.mode);
  scene.updateCameraTarget();
  scene.loadAllArtworkForActiveLibrary();
  retailAudio.playBoxPickup();
  recordInspect(slot.movie);
  if (scene.onSelectionChange) scene.onSelectionChange(slot.movie);
  scene.onConsoleLog(`[System] Picked up "${slot.movie.title}" — Back returns to where you stood.`, "system");
}

// VR carry pickup (issue #97): a headset trigger pull on a shelf case goes
// straight into the carried stack instead of walkInspectSlot's flat inspect
// view — no mode change, so walk-around (and the VR session running over it,
// see store-vr.ts) never ends here. The player physically carries the case
// to the checkout counter and confirms there.
export function walkTakeSlot(scene: StoreScene, slot: MovieSlot): void {
  if (!takeTapeIntoCarry(scene, slot.movie, slot)) return;
  recordInspect(slot.movie);
  scene.onConsoleLog(`[System] Took "${slot.movie.title}" — carry it to the counter to check out.`, "system");
}

export function getSlotFromIntersection(scene: StoreScene, object: THREE.Object3D, instanceId: number): MovieSlot | null {
  if (instanceId === undefined) return null;
  for (const slot of scene.slotsByPosition.values()) {
    if (
      ((slot.frontMesh === object || slot.backMesh === object) && slot.instanceIdx === instanceId) ||
      (scene.genericMovieMesh === object && slot.genericInstanceIdx === instanceId)
    ) {
      return slot;
    }
  }
  return null;
}

export function constrainWalkPosition(scene: StoreScene, oldX: number, oldZ: number, newX: number, newZ: number, storeWidth: number, minZ: number): { x: number; z: number } {
  const r = 1.5;
  const r_door = 0.5;
  const minX = 11.0 - storeWidth / 2 + r;
  const maxX = 11.0 + storeWidth / 2 - r;
  const maxLotZ = 43.0; // walkable up to the far edge of the drive lane (stall row + parked cars beyond)

  let x = newX;
  let z = newZ;

  // Overall bounds
  x = Math.max(minX, Math.min(maxX, x));
  z = Math.max(minZ, Math.min(maxLotZ, z));

  // Real vestibule door geometry (entrance/index.ts): the side-wall gaps and
  // the front-wall gaps below used to be hand-copied magic numbers that only
  // matched the DEFAULT doorWidth preset by coincidence, and the front-wall
  // pair were flat-out wrong (feedback/034 — "the door here is on the left
  // but I can only enter through the right window, same for the exit"): the
  // walkable X-ranges were each shifted a full door-width outward from the
  // visible door leaves, onto the SOLID glass sidelight beside each door, so
  // the modelled door leaf you'd walk up to always blocked you and the
  // adjacent plain window let you through instead. Reading the real numbers
  // from EntranceCheckout.getVestibuleInfo() keeps this clamp locked to
  // whatever actually got built (any doorWidth/storefront preset), the way
  // the EAS pedestals (storefront-dressing-93.ts) and this same file's
  // spawn-point code already do.
  const vest = scene.entrance?.getVestibuleInfo();
  // A storefront-door format (GH #110) has no chamber at all — see below,
  // clamps 1-4 (the airlock's back/side/divider walls) don't apply, and
  // clamp 5's door gap is the single leaf instead of the paired exit/entrance.
  const hasChamber = vest ? vest.hasChamber : true;

  if (hasChamber) {
    // 1. Vestibule back wall (Z = 8.6, X between 3.3 and 18.7)
    if (x > 3.3 - r && x < 18.7 + r) {
      if (oldZ < 8.6) {
        z = Math.min(8.6 - r, z);
      } else if (oldZ >= 8.6) {
        z = Math.max(8.6 + r, z);
      }
    }

    // 2. Vestibule central divider (X = 11.0, Z between 8.6 and 15.0)
    if (z > 8.6 - r && z < 15.0 + r) {
      if (oldX < 11.0) {
        x = Math.min(11.0 - r, x);
      } else if (oldX >= 11.0) {
        x = Math.max(11.0 + r, x);
      }
    }
  }

  const sideDoorZ0 = vest ? vest.sideDoorZ - vest.doorW / 2 : 9.0;
  const sideDoorZ1 = vest ? vest.sideDoorZ + vest.doorW / 2 : 12.2;
  // Single-leaf entrance: one gap centred on the door, no separate exit leaf.
  const exitFrontX0 = vest && !hasChamber ? vest.cx : (vest ? vest.cx - vest.doorW : 7.8);
  const exitFrontX1 = vest && !hasChamber ? vest.cx : (vest ? vest.cx : 11.0);
  const entrFrontX0 = vest && !hasChamber ? vest.cx - vest.doorW / 2 : (vest ? vest.cx : 11.0);
  const entrFrontX1 = vest && !hasChamber ? vest.cx + vest.doorW / 2 : (vest ? vest.cx + vest.doorW : 14.2);

  if (hasChamber) {
    // 3. Vestibule left wall (X = 3.3, Z between 8.6 and 15.0), side door at sideDoorZ
    const isAtLeftSideDoor = z >= sideDoorZ0 + r_door && z <= sideDoorZ1 - r_door;
    if (z > 8.6 - r && z < 15.0 + r && !isAtLeftSideDoor) {
      if (oldX < 3.3) {
        x = Math.min(3.3 - r, x);
      } else if (oldX >= 3.3) {
        x = Math.max(3.3 + r, x);
      }
    }

    // 4. Vestibule right wall (X = 18.7, Z between 8.6 and 15.0), side door at sideDoorZ
    const isAtRightSideDoor = z >= sideDoorZ0 + r_door && z <= sideDoorZ1 - r_door;
    if (z > 8.6 - r && z < 15.0 + r && !isAtRightSideDoor) {
      if (oldX > 18.7) {
        x = Math.max(18.7 + r, x);
      } else if (oldX <= 18.7) {
        x = Math.min(18.7 - r, x);
      }
    }
  }

  // 4.5 Stepped back-right corner: the right section's wall is pulled forward
  // to stepWallZ, so the deep notch behind it (X past stepX) is walled off and
  // the player can't step into it.
  const stepWallZ = scene.backWallZ + scene.stepDepth;
  if (x > scene.stepX - r) {
    z = Math.max(stepWallZ + r, z);
  }

  // 5. Storefront wall and vestibule front wall (Z = 15.0) — exit leaf gap
  // centred on cx - doorW/2, entrance leaf gap on cx + doorW/2 (see the
  // comment above the side-door gaps: these two ranges were previously
  // hardcoded a whole door-width off from the real leaves).
  const isAtExitFrontDoor = x >= exitFrontX0 + r_door && x <= exitFrontX1 - r_door;
  const isAtEntranceFrontDoor = x >= entrFrontX0 + r_door && x <= entrFrontX1 - r_door;
  const isAtFrontDoor = isAtExitFrontDoor || isAtEntranceFrontDoor;
  if (!isAtFrontDoor) {
    if (oldZ < 15.0) {
      z = Math.min(15.0 - r, z);
    } else if (oldZ >= 15.0) {
      z = Math.max(15.0 + r, z);
    }
  }

  // Reused out-param: this runs every frame in walk mode, so avoid a fresh
  // object literal per call. Callers must consume it before the next call.
  scene._constrainedWalk.x = x;
  scene._constrainedWalk.z = z;
  return scene._constrainedWalk;
}

export function updateWalkHUD(scene: StoreScene) {
  const hud = document.getElementById('walk-hud');
  if (hud) {
    if (scene.isWalkAroundMode) {
      hud.classList.add('visible');
    } else {
      hud.classList.remove('visible');
    }
  }
  // Aim dot for click-to-pick-up (the pointer-locked cursor is invisible).
  document.getElementById('walk-crosshair')
    ?.classList.toggle('visible', scene.isWalkAroundMode);
}

export function toggleWalkAround(scene: StoreScene) {
  // T23: no wandering the pocket room (its walls are set dressing, and the
  // store must stay unreachable during a lockout).
  if (scene.mode === 'backroom' && !scene.isWalkAroundMode) return;
  scene.walkFreecam = false; // freecam is teleportWalk(free)-only; any manual toggle re-clamps
  scene.requestRender();
  if (scene.isWalkAroundMode) {
    // Exit walk around mode
    scene.isWalkAroundMode = false;
    scene.mode = scene.savedModeBeforeWalk as any;
    // T21: walking started from the overview — bring its cursors back.
    if (scene.mode === 'overview') {
      scene.showOverviewVisuals();
      scene.updateOverviewFocus();
    }
    if (scene.onModeChange) scene.onModeChange(scene.mode);

    // Release pointer lock if active
    if (document.pointerLockElement === scene.renderer.domElement) {
      document.exitPointerLock();
    }

    scene.updateWalkHUD();
    scene.updateCameraTarget();
    scene.onConsoleLog("[System] Walk Mode deactivated. Returned to standard browsing.", "system");
  } else {
    // Enter walk around mode
    scene.savedModeBeforeWalk = scene.mode;
    // Let go of any counter-CRT camera dock first (search / manager terminal /
    // NEW STORE SETUP). A stash left behind makes the next enterSearchMode()
    // think it is still docked and quietly do nothing.
    scene.releaseSearchDock();
    // T21: the overview's cursors/crosshair are mode dressing — hide them
    // while walking (restored on exit above).
    if (scene.mode === 'overview') scene.hideOverviewVisuals();
    scene.isWalkAroundMode = true;
    scene.mode = 'walk-around';
    if (scene.onModeChange) scene.onModeChange(scene.mode);

    // Always spawn at the store entrance (inside the entrance chamber), looking
    // in toward the shop floor.
    scene.currentCameraPos.set(13.0, 5.5, 12.5);
    scene.currentLookAt.set(11.0, 5.3, 0.0);
    scene.camera.position.copy(scene.currentCameraPos);

    // Force height to walking height (5.5 ft)
    scene.camera.position.y = 5.5;
    scene.currentCameraPos.y = 5.5;

    // Extract starting yaw and pitch from camera orientation
    const dir = new THREE.Vector3().subVectors(scene.currentLookAt, scene.currentCameraPos).normalize();
    scene.yaw = Math.atan2(dir.x, -dir.z);
    scene.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -0.9, 0.9));

    // Set camera rotation order to YXZ and apply initial rotation
    scene.camera.rotation.order = 'YXZ';
    scene.camera.rotation.y = scene.yaw;
    scene.camera.rotation.x = scene.pitch;
    scene.camera.rotation.z = 0;

    // Reset keys
    Object.keys(scene.walkKeys).forEach((key) => {
      scene.walkKeys[key as keyof typeof scene.walkKeys] = false;
    });

    // Capture the mouse right away — the F keypress (or gamepad button)
    // that toggled walk mode counts as user activation, so the lock can
    // engage without waiting for a click. If the browser refuses (e.g. a
    // programmatic toggle from the harness), mouse-look still works off
    // movement deltas and the first click re-requests the lock.
    scene.requestWalkPointerLock();

    scene.lastUpdateTime = performance.now();
    scene.updateWalkHUD();
    scene.onConsoleLog("[System] Walk Mode activated. Press WASD to walk, Arrows/Mouse to look.", "system");
  }
}
