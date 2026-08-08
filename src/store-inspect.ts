// Inspect / flip / hero cases / launch flourish — extracted from StoreScene
// (three-scene.ts keeps one-line delegating stubs): the Enter-key
// selectAction dispatcher, the play-flourish launch animation, the
// front/back/spine flip cycle, hero-case mesh swaps for the selected slot,
// and series episode panels. Every function takes the StoreScene as its
// first parameter and reads/writes scene state exactly as the original
// methods did.
import * as THREE from 'three';
import { Movie, Episode } from './jellyfin';
import { posterQueue, CASE_MEDIUM, leftmostColorCache, posterPixelCache, getCaseGeometry, getRentalCaseGeometry, createHeroJellyfinMaterials, createHeroRentalMaterials, applyGameCaseArt, backCoverRegions, getSeriesBoxsetGeometry, createHeroSeriesBoxsetMaterials, drawSeriesBrandPanel, drawSeriesEpisodeBackCover, drawSeriesSeasonPanel, gameCaseDims, gameRentalDims } from './video-case';
import { syncJewelDressing } from './jewel-case';
import { AISLE_SHELF_HEIGHTS, WALL_SHELF_HEIGHTS, BACK_WALL_UNIT_IDX, MovieSlot } from './store-layout';
import { tempPosition, tempRotation, tempQuaternion, tempScale, tempMatrix, _bagFallback, _bagBaseFallback } from './scene-shared';
import { recordInspect } from './clerk-recommend';
import { retailAudio } from './audio';
import { showClerkToast } from './carried-tapes';
import { perfTrace } from './perf-trace';
import { isDiscoveryRequested } from './jellyseerr';
import { SP_HERO, CT_HERO, updatedMeshes } from './scene-shared';
import { getGoldCaseMaterials } from './fixtures/gold-clamshell';
import type { StoreScene } from './three-scene';

// Whether the current hero back materials are the NR gold case — part of the
// ensureHeroCases rebuild key alongside heroMovieId, so stepping between an
// NR slot and an aisle slot holding the same title still swaps materials.
let heroWasNRCase = false;

// Which title's HIGH-RESOLUTION printed faces are currently on the hero pair
// (see HERO_COVER_SCALE in video-case.ts), or null when the cheap shelf-
// resolution faces are on. Browsing rebuilds the hero pair on every cursor
// step, so the 3× redraw is reserved for the case actually being INSPECTED:
// one redraw when the box is picked up, never one per keypress.
let heroDetailKey: string | null = null;

export function selectAction(scene: StoreScene): 'inspect' | 'play' | 'request' | 'launch' | 'genre-menu' | 'start-browsing' | 'take' | 'checkout' | null {
  // Browse cursor parked on a recommendation clasp: Enter calls the clerk
  // over. Handled before anything else, since the cursor is not on a movie
  // slot and every branch below assumes it is.
  if (scene.claspCursorActive) {
    scene.activateFocusedClasp();
    return null;
  }
  scene.requestRender();
  // T23: back-room confirms — Enter inspects the focused rented tape; a
  // second Enter runs the insert beat and (via onBackRoomPlay) plays it on
  // the CRT. Only the rented tapes exist here, so only they are playable.
  if (scene.mode === 'backroom') {
    const room = scene.backRoom;
    if (!room) return null;
    if (room.state === 'view') {
      if (room.inspectFocused()) {
        scene.updateCameraTarget();
        retailAudio.playBoxPickup();
        return 'inspect';
      }
      return null;
    }
    if (room.state === 'inspect') {
      const movie = room.focusedMovie();
      if (!movie) return null;
      const started = room.beginInsert(() => {
        scene.updateCameraTarget(); // settle back on the couch view
        if (scene.onBackRoomPlay) {
          scene.onBackRoomPlay(movie);
        } else {
          // Harness / no player wired: nothing streams, put the tape back.
          scene.onConsoleLog(`[System] (No player attached) "${movie.title}" would play on the CRT now.`, 'system');
          room.detachVideo();
        }
      });
      if (started) {
        scene.updateCameraTarget();
        retailAudio.playBoxPickup();
      }
      return null;
    }
    return null;
  }
  // T21: confirm on the focused shelf cursor — fly to that run.
  if (scene.mode === 'overview') {
    return scene.overviewEnterBrowse() ? 'start-browsing' : null;
  }
  // T22: Enter at the counter confirms the checkout.
  if (scene.mode === 'checkout') {
    return scene.confirmCheckout() ? 'checkout' : null;
  }
  if (scene.mode === 'library-select') {
    if (scene.selectedLibraryIdx === scene.libraries.length) {
      scene.isBrowsingNewReleasesDirectly = true;
      scene.selectedLibraryIdx = 0; // Default to first library for slot lookup
      scene.mode = 'browse';
      if (scene.onModeChange) scene.onModeChange(scene.mode);
      if (scene.onGenreMenuUpdate) {
        scene.onGenreMenuUpdate("", [], 0, false);
      }
      
      // Go to back wall shelves directly
      scene.selectedUnitSource = 'shelving'; // clear any stale fixture selection
      scene.selectedFixtureId = null;        // (else updateCameraTarget takes the
                                            // fixture path and reads a NaN camera Y)
      scene.selectedUnitIdx = BACK_WALL_UNIT_IDX;
      scene.selectedSide = 'front';
      scene.selectedShelf = WALL_SHELF_HEIGHTS.length - 1;
      scene.updateColsCount();
      
      // (#46) Always start on the ribbon's visually FIRST title. Since the
      // left-wall flip the ribbon ascends screen-right on every run (left
      // wall front -> back, then back wall left -> right), so on-screen
      // order IS ribbon order: take the first column that actually holds a
      // case on the top shelf.
      let startCol = 0;
      for (let col = 0; col < scene.colsCount; col++) {
        if (scene.slotsByPosition.has(`0_${BACK_WALL_UNIT_IDX}_front_${scene.selectedShelf}_${col}`)) {
          startCol = col;
          break;
        }
      }
      scene.selectedCol = startCol;
      scene.cameraWindowMinCol = scene.selectedCol; // Automatically bounded in updateCameraTarget
      
      scene.updateCameraTarget();
      scene.loadAllArtworkForActiveLibrary();
      scene.onConsoleLog(`[System] Browsing "NEW RELEASES" on the back wall`, "system");
      return 'start-browsing';
    } else if (scene.selectedLibraryIdx > scene.libraries.length) {
      // Display stand selection!
      const standIdx = scene.selectedLibraryIdx - scene.libraries.length - 1;
      scene.mode = 'browse';
      if (scene.onModeChange) scene.onModeChange(scene.mode);
      if (scene.onGenreMenuUpdate) {
        scene.onGenreMenuUpdate("", [], 0, false);
      }

      // Set browse position to the display stand
      const fixture = scene.slottedFixtures[standIdx];
      scene.selectedUnitSource = 'fixture';
      scene.selectedFixtureId = fixture ? fixture.placement.id : null;
      scene.selectedUnitIdx = -1;
      scene.selectedSide = 'front';
      // Top-ish shelf row, clamped to the fixture's actual rows (the bargain
      // bin has only 2 — a bare `2` would start the selection on a slot key
      // that doesn't exist).
      scene.selectedShelf = Math.min(2, fixture ? fixture.shelfHeights.length - 1 : 2);
      scene.selectedCol = 0;
      scene.cameraWindowMinCol = 0;
      scene.updateColsCount();

      scene.updateCameraTarget();
      scene.loadAllArtworkForActiveLibrary();
      
      const fixtureName = fixture ? (fixture.placement.options?.genre as string || 'display').toUpperCase() : 'DISPLAY';
      scene.onConsoleLog(`[System] Browsing display stand "${fixtureName}"`, "system");
      return 'start-browsing';
    } else {
      // T21: with the entrance-overview start enabled, picking a library
      // lands at the overview (cursors for every shelf run) instead of
      // dropping straight into the first aisle.
      if (scene.overviewStart) {
        scene.enterOverview();
        return 'start-browsing';
      }
      // Straight into the aisles: the shelves are already physically sorted
      // into the classic wall categories, so there is no genre menu.
      scene.mode = 'browse';
      if (scene.onModeChange) scene.onModeChange(scene.mode);
      if (scene.onGenreMenuUpdate) {
        scene.onGenreMenuUpdate("", [], 0, false);
      }

      // Reset position to the top shelf's visually TOP-LEFT column. StorePlan
      // numbers units in reading order from the entrance (front row first,
      // screen-left first — mirrored runs included), so unit 0 IS the
      // library's front-left unit and col 0 its screen-left column.
      scene.selectedUnitSource = 'shelving'; // clear any stale fixture selection
      scene.selectedFixtureId = null;        // (else updateCameraTarget takes the
                                            // fixture path and reads a NaN camera Y)
      scene.selectedUnitIdx = 0;
      scene.selectedSide = 'front';
      scene.selectedShelf = AISLE_SHELF_HEIGHTS.length - 1;
      scene.selectedCol = 0;
      scene.cameraWindowMinCol = 0;
      scene.updateColsCount();

      scene.updateCameraTarget();
      scene.loadAllArtworkForActiveLibrary();
      scene.onConsoleLog(`[System] Browsing library "${scene.getActiveAisleName()}"`, "system");
      return 'start-browsing';
    }
  } else if (scene.mode === 'browse') {
    // Zoom into inspection view (empty section-padding cells have no case)
    if (!scene.getSelectedMovie()) return null;
    scene.walkReturnPose = null; // this inspect came from browsing, not a walk click
    scene.mode = 'inspect';
    if (scene.onModeChange) scene.onModeChange(scene.mode);
    scene.isFlipped = false; scene.heroSpine = false;
    scene.selectedBackCoverRegionIdx = -1;
    scene.highlightedBackRegionName = '';
    scene.resetHeroFace();
    scene.updateCameraTarget();
    retailAudio.playBoxPickup();
    const inspected = scene.getSelectedMovie();
    recordInspect(inspected); // feed the clerk's recommendation affinity (T14)
    scene.onConsoleLog(`[System] Inspecting cover: ${inspected?.title}`, "system");
    return 'inspect';
  } else if (scene.mode === 'person-endcap') {
    // Jump from the endcap display to the selected movie's real shelf slot
    return scene.jumpFromEndcapToMovie();
  } else if (scene.mode === 'inspect') {
    // Series backs carry the episode selector, not a cast list — skip the
    // person-endcap path so Enter falls through to playing the episode.
    if (scene.isFlipped && scene.selectedBackCoverRegionIdx >= 0 && !scene.getSelectedMovie()?.isSeries) {
      const movie = scene.getSelectedMovie();
      const regions = movie ? (backCoverRegions.get(movie.id) || []) : [];
      const region = regions[scene.selectedBackCoverRegionIdx];
      if (region) {
        scene.showPersonEndcap(region.name, region.kind);
        return null;
      }
    }
    // A Jellyseerr coming-soon title has a display case (poster art) but no
    // rental copy behind it yet -- there's nothing to play.
    const inspectedMovie = scene.getSelectedMovie();
    if (inspectedMovie?.comingSoon) {
      showClerkToast(`"${inspectedMovie.title}" is already on order, hon — it should be in soon.`);
      scene.onConsoleLog(`[System] "${inspectedMovie.title}" is coming soon and isn't available to rent yet.`, "system");
      return null;
    }
    // An inline discovery suggestion has no rental copy either -- the same
    // deliberate "confirm in inspect mode" press instead sends a Jellyseerr
    // request for it (see main.ts's request handling).
    if (inspectedMovie?.discovery) {
      if (inspectedMovie.discoveryRequested || isDiscoveryRequested(inspectedMovie.tmdbId)) {
        showClerkToast(`"${inspectedMovie.title}" is already on order, hon — it should be in soon.`);
        scene.onConsoleLog(`[System] "${inspectedMovie.title}" has already been requested.`, "system");
        return null;
      }
      return 'request';
    }
    // A collection-gap case is a stand-in for an entry you don't own —
    // there is no copy to take or play, in carry mode or otherwise. The
    // same confirm press instead asks the clerk to order it through
    // Jellyseerr (main.ts's request handling), and once it's on order the
    // press just gets you the "already on its way" line.
    if (inspectedMovie?.collectionGap) {
      if (inspectedMovie.discoveryRequested || isDiscoveryRequested(inspectedMovie.tmdbId)) {
        showClerkToast(`"${inspectedMovie.title}" is already on order, hon — it should be in soon.`);
        scene.onConsoleLog(`[System] "${inspectedMovie.title}" has already been requested.`, "system");
        return null;
      }
      return 'request';
    }
    // T18: a game title has no video to play -- renting it launches the
    // configured emulator (Tauri) or shows a counter toast (browser). See
    // main.ts's handleGameLaunch.
    if (inspectedMovie?.game) {
      return 'launch';
    }
    if (inspectedMovie?.isSeries) {
      // The front (face 0) and neutral +X panel (face 1) turn to the episode
      // selector on the back (the deliberate "pick something" gesture). The
      // back-cover selector (face 2) plays the highlighted episode; the
      // season panel (face 3) plays the highlighted SEASON's first episode.
      // main.ts resolves which via getSelectedEpisode().
      if (scene.heroFace === 0) {
        scene.rotateHeroFace(2);
        return null;
      }
      if (scene.heroFace === 1) {
        scene.rotateHeroFace(1);
        return null;
      }
      if (scene.heroFace === 2 && !(scene.heroEpisodes && scene.heroEpisodes.length > 0)) {
        scene.onConsoleLog(scene.heroEpisodes
          ? `[System] No episodes available for "${inspectedMovie.title}".`
          : `[System] Still loading episodes for "${inspectedMovie.title}"...`, "system");
        return null;
      }
      return 'play';
    }
    // T22 play-flow guard: with carry mode on, the confirm in inspect view
    // TAKES the tape (adds it to the carried stack) instead of playing it.
    // Series boxsets keep their episode-driven instant-play flow.
    if (scene.carryMode) {
      scene.takeSelectedTape();
      return 'take';
    }
    // Trigger media playback
    return 'play';
  }
  return null;
}

export function startPlayAnimation(scene: StoreScene, onComplete: () => void): boolean {
  scene.requestRender();
  if (scene.launchAnim) return false; // already launching — ignore re-trigger

  const activeKey = scene.getActiveSlotKey();
  const slot = scene.slotsByPosition.get(activeKey);
  if (!slot) {
    onComplete();
    return false;
  }

  // Capture the rental back-box's current world transform as the spin's
  // starting pose, mirroring the matrix math used in the animate() loop.
  const theta = slot.currentRotY;
  const baseX = slot.currentX + slot.backX * Math.cos(theta) + slot.backZ * Math.sin(theta);
  const baseY = slot.currentY;
  const baseZ = slot.currentZ - slot.backX * Math.sin(theta) + slot.backZ * Math.cos(theta);
  const baseRotY = slot.backRotY + theta;

  scene.launchAnim = {
    slot,
    startTime: performance.now(),
    baseX, baseY, baseZ, baseRotY,
    onComplete,
  };
  // This tape goes home with you tonight — it comes back through the
  // entrance's RETURN TAPES HERE chute on the post-playback re-entry.
  scene.pendingReturnDrop = [slot.movie];
  // The checkout bag only exists on screen during this flourish + the exit
  // walk (one bag, ever) — reveal it now and let its soft-body solver run.
  scene.entrance?.showBag();
  return true;
}

// Where the flourish hands the shot to the shared checkout-exit ritual:
// FLY 1300 + SLIDE 1300 + SETTLE 1700. From there store-checkout.ts's phase
// map (0..7600) applies, so the pinnable range is 0..11900.
export const LAUNCH_HANDOFF_MS = 4300;

export function updateLaunchAnimation(scene: StoreScene, now: number): boolean {
  const anim = scene.launchAnim;
  if (!anim) return false;
  // Past the settle beat the shared checkout-exit walk owns choreography and
  // camera (same ritual as the carry checkout: the bag is shoved to the
  // counter's right end and WAITS there — it never floats to the customer).
  if (anim.exitHandoff) {
    scene.updateCheckoutExit(now);
    return true;
  }
  const slot = anim.slot;
  const elapsed = scene.debugLaunchFreeze ?? (now - anim.startTime);

  const FLY_MS = 1300;
  const SLIDE_MS = 1300;
  const SETTLE_MS = 1700;                     // SLIDE+SETTLE ≈ 3s into the bag
  const SPINS = 3;
  const RISE = 0.5;                           // feet the case lifts off the shelf

  const T_FLY = FLY_MS;
  const T_SLIDE = T_FLY + SLIDE_MS;
  const T_SETTLE = T_SLIDE + SETTLE_MS;       // == LAUNCH_HANDOFF_MS

  // Bag mouth (the drop target) + the bag's rest spot on the counter top (the
  // drag origin). Fallbacks run through reused scratch vectors — this whole
  // method runs per frame during the flourish, so no fresh Vector3 per call.
  const bag = scene.entrance?.bagMouthWorld ??
    _bagFallback.set(11.0, 3.9, scene.deskApexZ() + 3.0);
  const bagBase = scene.entrance?.bagBaseWorld ??
    _bagBaseFallback.set(bag.x, bag.y - 1.1, bag.z);

  // The customer (and camera) watch from the store side, i.e. -Z of the bag;
  // the "front of the counter" is a spot a short way out on that side, at
  // counter-top height, where a movie gets set down before it's bagged.
  const FRONT_GAP = 1.5;
  const frontX = bagBase.x;
  const frontZ = bagBase.z - FRONT_GAP;
  const standY = bagBase.y + 0.75;            // a case standing on the counter

  // Collapse this slot's two instanced shelf copies so nothing is left
  // standing on the shelf while its case is in flight / in the bag.
  const collapseSlot = () => {
    tempPosition.set(anim.baseX, anim.baseY, anim.baseZ);
    tempRotation.set(0, anim.baseRotY, 0);
    tempQuaternion.setFromEuler(tempRotation);
    tempScale.set(0, 0, 0);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    slot.backMesh.setMatrixAt(slot.instanceIdx, tempMatrix);
    slot.frontMesh.setMatrixAt(slot.instanceIdx, tempMatrix);
    updatedMeshes.add(slot.backMesh);
    updatedMeshes.add(slot.frontMesh);
  };

  // Hand the visible case to the bag's soft-body sim once (at the end of the
  // slide): dropIntoBag() finishes the fall to a leaning rest pose while the
  // plastic collides with and wraps around it — no clipping through the walls.
  const handOffToBag = () => {
    if (anim.caseDropped) return;
    anim.caseDropped = true;
    if (scene.heroSlotKey === slot.key && scene.heroBackMesh && scene.entrance) {
      const droppedCase = new THREE.Mesh(scene.heroBackMesh.geometry, scene.heroBackMesh.material);
      droppedCase.castShadow = true;
      droppedCase.receiveShadow = true;
      scene.entrance.dropIntoBag(droppedCase);
    }
    if (scene.heroBackMesh) scene.heroBackMesh.visible = false;
    if (scene.heroFrontMesh) scene.heroFrontMesh.visible = false;
  };

  // ----- FLY: whirl up off the shelf and arc to the front of the counter -----
  if (elapsed < T_FLY) {
    const ft = elapsed / FLY_MS;
    const fe = ft * ft * (3 - 2 * ft);                    // smoothstep glide
    const rotY = anim.baseRotY + fe * Math.PI * 2 * SPINS; // whole turns → lands aligned
    const posX = THREE.MathUtils.lerp(anim.baseX, frontX, fe);
    const posZ = THREE.MathUtils.lerp(anim.baseZ, frontZ, fe);
    const arc = Math.sin(ft * Math.PI) * 2.6;             // lob up over the shelves
    const posY = THREE.MathUtils.lerp(anim.baseY + RISE, standY, fe) + arc;
    scene.targetCameraPos.set(11.0, 5.2, scene.deskApexZ() - 2.5);
    scene.targetLookAt.set(bagBase.x, bagBase.y + 0.2, bagBase.z);
    scene.driveLaunchCase(slot, posX, posY, posZ, 0, rotY, 1);
    return true;
  }

  // ----- SLIDE: from the counter front back into the bag's mouth -----
  if (elapsed < T_SLIDE) {
    const st = (elapsed - T_FLY) / SLIDE_MS;
    const se = st * st * (3 - 2 * st);
    const posX = THREE.MathUtils.lerp(frontX, bag.x, se);
    const posZ = THREE.MathUtils.lerp(frontZ, bag.z, se);
    const posY = THREE.MathUtils.lerp(standY, bag.y + 0.15, se);
    const rotX = -se * 0.5;                                // tips back as it slides in
    scene.targetCameraPos.set(bag.x, bag.y + 0.7, bag.z - 1.6);
    scene.targetLookAt.set(bag.x, bag.y - 0.15, bag.z);
    scene.driveLaunchCase(slot, posX, posY, posZ, rotX, anim.baseRotY, 1);
    return true;
  }

  // The case has reached the mouth — hand it to the bag and let it wrap.
  handOffToBag();
  collapseSlot();

  // ----- SETTLE: the plastic wraps around the case (rental confirmed) -----
  if (elapsed < T_SETTLE) {
    if (!anim.chimed) {
      anim.chimed = true;
      retailAudio.playCheckoutChime();                    // scanner beep + happy tone
    }
    scene.targetCameraPos.set(bag.x, bag.y + 0.7, bag.z - 1.6);
    scene.targetLookAt.set(bag.x, bag.y - 0.15, bag.z);
    return true;
  }

  // Freeze the settled cloth so the whole bag carries as one rigid piece.
  if (!anim.bagFrozen) {
    anim.bagFrozen = true;
    scene.entrance?.freezeBag();
  }

  // ----- HANDOFF: the shared checkout-exit ritual takes it from here -----
  // The clerk shoves the bag to the counter's right end where it WAITS on the
  // band top, the customer rounds the counter first-person, grabs it beside
  // the band edge, and carries it out under the rising whiteout (user
  // direction: the bag never floats off the counter toward the camera).
  // Completion routes to the flourish's onComplete instead of finishCheckout
  // — this is a play, not a carry checkout.
  anim.exitHandoff = true;
  scene.checkoutRunning = true;
  scene.checkoutExit = {
    start: now,
    ids: null,
    onDone: () => {
      const cb = anim.onComplete;
      scene.launchAnim = null;
      scene.entrance?.hideBag(); // ritual over — stash the bag until next checkout
      cb();
    },
  };
  scene.updateCheckoutExit(now);
  return true;
}

export function driveLaunchCase(
scene: StoreScene,
  slot: MovieSlot, x: number, y: number, z: number, rotX: number, rotY: number, scale: number,
): void {
  if (scene.heroSlotKey === slot.key && scene.heroBackMesh) {
    scene.heroBackMesh.visible = true;
    scene.heroBackMesh.position.set(x, y, z);
    scene.heroBackMesh.rotation.set(rotX, rotY, 0);
    scene.heroBackMesh.scale.setScalar(scale);
    if (scene.heroFrontMesh) scene.heroFrontMesh.visible = false;

    // Keep the instanced copies collapsed underneath.
    tempPosition.set(x, y, z);
    tempRotation.set(rotX, rotY, 0);
    tempQuaternion.setFromEuler(tempRotation);
    tempScale.set(0, 0, 0);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    slot.backMesh.setMatrixAt(slot.instanceIdx, tempMatrix);
    slot.frontMesh.setMatrixAt(slot.instanceIdx, tempMatrix);
    updatedMeshes.add(slot.backMesh);
    updatedMeshes.add(slot.frontMesh);
    return;
  }

  // Fallback (no hero bound): drive the instanced rental back box, and
  // collapse the jellyfin front box so only the rental copy is in flight.
  tempPosition.set(x, y, z);
  tempRotation.set(rotX, rotY, 0);
  tempQuaternion.setFromEuler(tempRotation);
  tempScale.set(scale, scale, scale);
  tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
  slot.backMesh.setMatrixAt(slot.instanceIdx, tempMatrix);
  updatedMeshes.add(slot.backMesh);

  tempScale.set(0, 0, 0);
  tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
  slot.frontMesh.setMatrixAt(slot.instanceIdx, tempMatrix);
  updatedMeshes.add(slot.frontMesh);
}

export function toggleFlip(scene: StoreScene) {
  scene.requestRender();
  // T23: flipping the tape held up from the couch (back-of-box details).
  if (scene.mode === 'backroom') {
    if (scene.backRoom?.toggleFlip()) retailAudio.playBoxFlip();
    return;
  }
  if (scene.mode === 'inspect') {
    // A series boxset has four faces — "flip" jumps front <-> back through
    // the shortest turn so jumpToTitle(..., {flip}) and existing callers work.
    if (scene.getSelectedMovie()?.isSeries) {
      scene.rotateHeroFace(scene.heroFace === 2 ? -2 : 2 - scene.heroFace);
      return;
    }
    // No rental copy beside it (bargain-bin stock) — nothing to turn to
    // its spine, so it's a plain two-stop front <-> back cycle on the retail
    // case, same as a boxset.
    if (scene.slotsByPosition.get(scene.getActiveSlotKey())?.noRentalCase) {
      scene.isFlipped = !scene.isFlipped;
      scene.heroSpine = false;
      scene.selectedBackCoverRegionIdx = scene.isFlipped ? 0 : -1;
      scene.updateBackCoverHighlight();
      retailAudio.playBoxFlip();
      scene.onConsoleLog(`[System] Flipped case: ${scene.isFlipped ? 'Back' : 'Front'}`, "system");
      return;
    }
    // Three-stop cycle: Front -> Back -> Spine -> Front. One flip still
    // lands on the back (the jumpToTitle {flip} / harness &flip=1 contract);
    // the extra press turns the rental copy halfway home to read its
    // spine before returning to the front.
    if (scene.isFlipped) {
      scene.isFlipped = false;
      scene.heroSpine = true;
      scene.selectedBackCoverRegionIdx = -1;
    } else if (scene.heroSpine) {
      scene.heroSpine = false;
    } else {
      scene.isFlipped = true;
      scene.selectedBackCoverRegionIdx = 0;
    }
    scene.updateBackCoverHighlight();
    retailAudio.playBoxFlip();
    scene.onConsoleLog(`[System] Flipped case: ${scene.isFlipped ? 'Back' : scene.heroSpine ? 'Spine' : 'Front'}`, "system");
  }
}

export function updateBackCoverHighlight(scene: StoreScene) {
  const movie = scene.getSelectedMovie();
  if (!movie || !scene.heroFrontMesh) return;

  if (scene.isFlipped && scene.selectedBackCoverRegionIdx >= 0) {
    const regions = backCoverRegions.get(movie.id) || [];
    const region = regions[scene.selectedBackCoverRegionIdx];
    scene.highlightedBackRegionName = region ? region.name : '';
  } else {
    scene.highlightedBackRegionName = '';
  }

  scene.heroFrontMesh.material = scene.heroFrontMaterials(movie);

  // GH #139: the rental clamshell's VHS_RIM widening (getRentalCaseGeometry)
  // exists so the case peeks out asymmetrically from BEHIND the retail
  // cover in the unflipped hero view (matching the nested browse-mode
  // meshes). Flipped, the two hero cases fan fully apart with nothing
  // occluding the rental copy, so that extra width just reads as a stray
  // white/black edge strip stuck on one side of an otherwise normal-looking
  // case — most visible on the white-cased Animated Movies tapes. Swap to
  // the plain (un-widened) case geometry while flipped; swap back on the
  // way to front so the peeking edge returns for the unflipped view.
  if (scene.heroBackMesh) {
    // The spine view gets the plain geometry too: edge-on, the rim widening
    // reads as the same stray strip the flipped view had.
    // Both branches are the RENTAL copy, so both take the shell's media-class
    // dims — never the game's retail carton (see gameRentalDims).
    const shellDims = movie.game ? gameRentalDims(movie.platform) : undefined;
    scene.heroBackMesh.geometry = (scene.isFlipped || scene.heroSpine)
      ? getCaseGeometry(false, shellDims)
      : getRentalCaseGeometry(false, shellDims);
  }
}

export function ensureHeroCases(scene: StoreScene, movie: Movie, nrCase = false) {
  const isAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
  // The hero pair must match the shelf instances, which batch retail and rental
  // separately (store-stock's gameDimsForShape): the FRONT box is the platform's
  // real carton, the shell behind it is the media-class rental case. Using
  // one set of dims for both is what squashed the clamshell to each game's
  // aspect, so the rental copy appeared to change size per title.
  const gameDims = movie.game ? gameCaseDims(movie.platform, movie.discCount) : undefined;
  const shellDims = movie.game ? gameRentalDims(movie.platform) : undefined;
  // Same probe the shelf path resolves off the browsed library (store-stock's
  // updateLOD) — the hero/inspect case sits closer to the camera than any
  // shelf copy, so it should carry the same environment reflections, not none.
  const probeIdx = Math.min(scene.selectedLibraryIdx, 4);
  if (!scene.heroFrontMesh || !scene.heroBackMesh) {
    const geoFront = getCaseGeometry(isAnimated, gameDims);
    const geoBack = getRentalCaseGeometry(false, shellDims);
    const front = new THREE.Mesh(geoFront, createHeroJellyfinMaterials(movie, undefined, false, false, probeIdx));
    const back = new THREE.Mesh(geoBack, createHeroRentalMaterials(movie, false, probeIdx));
    [front, back].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      m.visible = false;
      m.rotation.order = 'YXZ';
      scene.scene.add(m);
    });
    scene.heroFrontMesh = front;
    scene.heroBackMesh = back;
    // Leave heroMovieId unset so the block below runs and registers the
    // poster-refresh callback even on this first creation.
    scene.heroMovieId = null;
  }
  // Picking a box up (or putting it back) swaps the printed faces between the
  // per-title shelf-resolution materials and the high-resolution singletons.
  // Folded into the rebuild key rather than hooked at each of the four sites
  // that set mode = 'inspect': this runs on every frame the hero is active, so
  // one comparison here covers every entry and exit path.
  const wantDetail = scene.mode === 'inspect' ? `${movie.id}_${nrCase}` : null;
  if (scene.heroMovieId !== movie.id || heroWasNRCase !== nrCase || wantDetail !== heroDetailKey) {
    perfTrace.count(CT_HERO);
    perfTrace.begin(SP_HERO);
    scene.heroMovieId = movie.id;
    heroWasNRCase = nrCase;
    heroDetailKey = wantDetail;
    scene.heroFrontMesh.geometry = movie.isSeries ? getSeriesBoxsetGeometry() : getCaseGeometry(isAnimated, gameDims);
    scene.heroBackMesh.geometry = getRentalCaseGeometry(false, shellDims);
    scene.heroFrontMesh.material = scene.heroFrontMaterials(movie);
    // Jewel-case platforms carry their clear-lid dressing on the hero mesh;
    // keyed internally, so a movie/cartridge title strips it right back off.
    syncJewelDressing(scene.heroFrontMesh, movie, gameDims);
    // NR wall slots: the rental copy is the red-sleeve/gold-ticket NEW
    // RELEASE RENTAL case, matching the wall's instanced back boxes.
    scene.heroBackMesh.material = nrCase
      ? getGoldCaseMaterials()
      : createHeroRentalMaterials(movie, wantDetail !== null, probeIdx);
    perfTrace.end(SP_HERO);
    if (movie.isSeries) scene.ensureSeriesEpisodes(movie);
    // Poster may still be streaming in — either never decoded yet, or its
    // posterPixelCache entry was evicted since (miss-tolerant: the hero mesh
    // above already built with a placeholder front via createHeroJellyfinMaterials
    // in that case, never left blank) — refresh the front once real pixels land.
    // posterQueue.load() dedupes in-flight requests for the same title itself.
    if (!posterPixelCache.has(movie.id) && movie.posterUrl) {
      posterQueue.load(movie, 3, () => {
        if (scene.heroMovieId === movie.id && scene.heroFrontMesh) {
          scene.heroFrontMesh.material = scene.heroFrontMaterials(movie);
          // This callback can land after the scene idled (render-on-demand) —
          // wake it, same as any other post-decode material swap.
          scene.requestRender();
        }
      });
    }
  }
}

export function heroFrontMaterials(scene: StoreScene, movie: Movie): THREE.Material[] {
  // Same probe index the shelf path resolves off the browsed library
  // (store-stock's updateLOD) — see ensureHeroCases above.
  const probeIdx = Math.min(scene.selectedLibraryIdx, 4);
  // The retail box's back carries the synopsis + cast list — the text the
  // shopper is actually reading — so an inspected case gets the high-resolution
  // face here too, not just via ensureHeroCases (this is the path flip and
  // cast-row navigation come back through).
  if (movie.isSeries) return createHeroSeriesBoxsetMaterials(movie, scene.highlightedBackRegionName, probeIdx);
  const mats = createHeroJellyfinMaterials(movie, scene.highlightedBackRegionName, false, scene.mode === 'inspect', probeIdx);
  // A game's real back/spine scans arrive over the network. Fire and forget,
  // UNLIKE the asset viewer, which awaits: this runs on every browse keypress
  // and blocking the hero rebuild on a fetch would stall the cursor. The swap
  // mutates `mats` in place, so the mesh already holding the array picks it up
  // — it just needs a frame, and the loop is render-on-demand.
  applyGameCaseArt(movie, mats, probeIdx).then((changed) => { if (changed) scene.requestRender(); });
  return mats;
}

export function ensureSeriesEpisodes(scene: StoreScene, movie: Movie) {
  if (scene.heroEpisodesMovieId === movie.id) {
    scene.refreshSeriesPanels(movie);
    return;
  }
  scene.heroEpisodesMovieId = movie.id;
  scene.heroEpisodes = null;
  scene.heroEpisodeIdx = 0;
  scene.refreshSeriesPanels(movie); // paints the "LOADING EPISODES…" state
  if (!scene.onFetchEpisodes) {
    scene.heroEpisodes = [];
    scene.refreshSeriesPanels(movie);
    return;
  }
  scene.onFetchEpisodes(movie).then((episodes) => {
    if (scene.heroEpisodesMovieId !== movie.id) return; // stale — user moved on
    scene.heroEpisodes = episodes;
    scene.heroEpisodeIdx = 0;
    scene.refreshSeriesPanels(movie);
    scene.requestRender();
  }).catch(() => {
    if (scene.heroEpisodesMovieId !== movie.id) return;
    scene.heroEpisodes = [];
    scene.refreshSeriesPanels(movie);
    scene.requestRender();
  });
}

export function refreshSeriesPanels(scene: StoreScene, movie: Movie) {
  // Theme every series panel from the box's dominant cover colour — the same
  // per-movie value the retail spine uses (leftmostColorCache), so a boxset's
  // menus match its poster. Null falls back to a house blue inside the
  // panel drawers.
  const themeHex = leftmostColorCache.get(movie.id) ?? null;
  drawSeriesBrandPanel(movie, themeHex);
  const currentSeason = scene.heroEpisodes?.[scene.heroEpisodeIdx]?.seasonNumber ?? null;
  drawSeriesSeasonPanel(movie.title, scene.heroEpisodes, currentSeason, themeHex, () => {
    if (scene.heroEpisodesMovieId !== movie.id) return;
    drawSeriesSeasonPanel(movie.title, scene.heroEpisodes, currentSeason, themeHex);
    scene.requestRender();
  });
  // The back cover carries the full episode selector; a thumbnail streaming
  // in re-triggers this redraw (guarded against a stale series selection).
  drawSeriesEpisodeBackCover(movie.title, scene.heroEpisodes, scene.heroEpisodeIdx, themeHex, () => {
    if (scene.heroEpisodesMovieId !== movie.id) return;
    drawSeriesEpisodeBackCover(movie.title, scene.heroEpisodes, scene.heroEpisodeIdx, themeHex);
    scene.requestRender();
  });
}

export function getSelectedEpisode(scene: StoreScene): Episode | null {
  const movie = scene.getSelectedMovie();
  if (scene.mode !== 'inspect' || !movie?.isSeries) return null;
  if (scene.heroFace !== 2 && scene.heroFace !== 3) return null;
  return scene.heroEpisodes?.[scene.heroEpisodeIdx] ?? null;
}

export function getSeriesEpisodes(scene: StoreScene, movieId: string): Episode[] | null {
  return scene.heroEpisodesMovieId === movieId ? scene.heroEpisodes : null;
}

export function rotateHeroFace(scene: StoreScene, dir: number) {
  const movie = scene.getSelectedMovie();
  if (scene.mode !== 'inspect' || !movie?.isSeries) return;
  scene.requestRender();
  scene.heroFace = (scene.heroFace + dir + 4) % 4;
  scene.heroFaceRot -= dir * (Math.PI / 2);
  scene.isFlipped = scene.heroFace === 2;
  scene.selectedBackCoverRegionIdx = scene.isFlipped ? 0 : -1;
  scene.updateBackCoverHighlight();
  scene.refreshSeriesPanels(movie);
  retailAudio.playBoxFlip();
  const faceName = ['Front', 'Episodes', 'Back', 'Play Season'][scene.heroFace];
  scene.onConsoleLog(`[System] Rotated boxset: ${faceName}`, "system");
}

export function resetHeroFace(scene: StoreScene) {
  scene.heroFace = 0;
  scene.heroFaceRot = 0;
  scene.heroEpisodeIdx = 0;
}

export function hideHeroCases(scene: StoreScene) {
  scene.heroSlotKey = null;
  if (scene.heroFrontMesh) scene.heroFrontMesh.visible = false;
  if (scene.heroBackMesh) scene.heroBackMesh.visible = false;
}

// ── Depth-of-field focal distance for inspect ────────────────────────────────
// Where the BokehPass focal plane must sit so the case the shopper is HOLDING
// is the sharp thing (see the DOF block in animate()). Two things were wrong
// with steering it to `camera.position.distanceTo(currentLookAt)`:
//
//  1. The measured inspect pose puts the case at 0.90-1.35 world units out
//     (centre ~1.08), and that distance was clamped to a FLOOR of 1.5 — so the
//     focal plane sat ~0.45 units BEHIND the case and the back-cover synopsis
//     and the tiny rental-warning print, the whole reason to pick a box up,
//     rendered permanently soft. The clamp only ever existed to stop a mid-lerp
//     look target throwing the plane onto the far wall, so the floor drops to a
//     value well under the real band and keeps doing exactly that job.
//  2. currentLookAt is the case CENTRE, so even unclamped it focuses half a
//     case-depth behind the artwork. Focus on the printed face instead.
//
// So: the centre of whichever box face is turned toward the camera — front
// cover, back cover or spine, whatever the flip cycle has facing out. Taking the
// nearest of the six face centres (rather than the near plane of a world AABB)
// matters because the inspect pose holds the case ANGLED: an AABB's near plane
// sits at the nearest corner, roughly half a case-depth in front of the artwork,
// which just moves the mis-focus to the other side of zero.
//
// Depths are AXIAL (along the camera's forward vector), not radial: BokehShader
// compares `focus` against the fragment's view-space depth, so a radial
// distanceTo() is the wrong kind of number — harmless for a target dead centre in
// frame, wrong the moment the case sits off-axis.
//
// Scratch objects are module-level: this runs on every composited inspect frame.
const _focusCentre = new THREE.Vector3();
const _focusHalf = new THREE.Vector3();
const _focusFwd = new THREE.Vector3();
const _focusFace = new THREE.Vector3();

export function heroFocusDistance(scene: StoreScene): number {
  const cam = scene.camera;
  cam.getWorldDirection(_focusFwd);
  const hero = (scene.heroFrontMesh && scene.heroFrontMesh.visible) ? scene.heroFrontMesh
    : (scene.heroBackMesh && scene.heroBackMesh.visible) ? scene.heroBackMesh
    : null;
  // No hero bound (the instanced-box fallback path in updateHeroCase): the look
  // target is the best estimate of the case position available.
  if (!hero) return _focusCentre.copy(scene.currentLookAt).sub(cam.position).dot(_focusFwd);
  const geo = hero.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  // The hero pose is written this frame (updateHeroCase) but matrixWorld is only
  // refreshed inside renderer.render(), which runs after this — so bring this one
  // mesh up to date rather than focusing on where the case was last frame.
  hero.updateWorldMatrix(true, false);
  const bb = geo.boundingBox!;
  bb.getCenter(_focusCentre);                    // both in the mesh's LOCAL space,
  bb.getSize(_focusHalf).multiplyScalar(0.5);    // so the case's own tilt is carried
                                                 // by matrixWorld below, not lost to
                                                 // an axis-aligned world box.
  let nearest = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    for (let side = -1; side <= 1; side += 2) {
      _focusFace.copy(_focusCentre);
      if (axis === 0) _focusFace.x += side * _focusHalf.x;
      else if (axis === 1) _focusFace.y += side * _focusHalf.y;
      else _focusFace.z += side * _focusHalf.z;
      const depth = _focusFace.applyMatrix4(hero.matrixWorld).sub(cam.position).dot(_focusFwd);
      if (depth < nearest) nearest = depth;
    }
  }
  return nearest;
}
