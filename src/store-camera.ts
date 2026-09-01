// Browse-camera targeting & selection presentation — extracted from
// StoreScene (three-scene.ts keeps one-line delegating stubs): the big
// per-mode camera retarget (updateCameraTarget), the look-down fixture
// present, the selection arrow, harness jump/teleport helpers and camera
// snapping. Every function takes the StoreScene as its first parameter and
// reads/writes scene state exactly as the original methods did.
import * as THREE from 'three';
import { CASE_WIDTH, CASE_HEIGHT } from './video-case';
import { FIELD_Z_FRONT, BROWSE_WINDOW_SIZE, AISLE_SHELF_HEIGHTS, WALL_SHELF_HEIGHTS, BOX_SPACING, UNIT_FRAME_HEIGHT, unitDepthAtHeight, BACK_WALL_UNIT_IDX, extraCopiesCount, MovieSlot, STORE_CENTER_X } from './store-layout';
import { getActiveTheme } from './themes';
import { activeStoreFormat } from './store-format';
import { OVERVIEW_POS, OVERVIEW_PITCH_MIN, OVERVIEW_PITCH_MAX, INSPECT_FAN_X, INSPECT_CASE_Z, INSPECT_FIT_MARGIN } from './scene-shared';
import { BB_ARCHIVO_BLACK } from './bundled-fonts';
import { getActiveLogoSpec } from './logo-spec';
import { onBrandChange } from './brand-live';
import { parseSharedPlace, type SharedPlace } from './shared-place';
import type { StoreScene } from './three-scene';

export function updateLookDownPresent(scene: StoreScene) {
  const fixture = scene.selectedUnitSource === 'fixture' && scene.selectedFixtureId
    ? scene.slottedFixtures.find(f => f.placement.id === scene.selectedFixtureId)
    : undefined;
  if (!fixture?.placement.options?.browseLookDown) {
    scene.selectedFixtureLookDown = false;
    return;
  }
  scene.selectedFixtureLookDown = true;

  const faceYaw = fixture.placement.yaw;
  const fx = fixture.placement.position.x;
  const fz = fixture.placement.position.z;
  // Same stale-shelf guard as the shelf framing: an out-of-range selectedShelf
  // would put NaN in the camera and blank the frame.
  const shelfY = fixture.shelfHeights[scene.selectedShelf] ?? 2.4;

  // Close enough to lean over the tub, high enough to see down into it. The
  // look-at rides above the rim rather than at it so the presented case (just
  // below frame centre) is the subject and the pile reads as its backdrop.
  const camDist = 3.1;
  scene.lookDownCamera.set(fx + camDist * Math.sin(faceYaw), 5.15, fz + camDist * Math.cos(faceYaw));
  scene.lookDownLookAt.set(fx, shelfY + 0.8, fz);

  // Stood off the tub centre toward the shopper and lifted well clear of the
  // rim. Both numbers are deliberately generous: at a shorter reach the
  // presented case still overlapped the flat jumble behind it and read as
  // just another tape in the pile rather than the one you're looking at.
  const presentDist = 1.25;
  scene.lookDownPresent.set(
    fx + presentDist * Math.sin(faceYaw),
    shelfY + 1.3,
    fz + presentDist * Math.cos(faceYaw),
  );

  const dx = scene.lookDownCamera.x - scene.lookDownPresent.x;
  const dy = scene.lookDownCamera.y - scene.lookDownPresent.y;
  const dz = scene.lookDownCamera.z - scene.lookDownPresent.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  // Case normal under CASE_EULER_ORDER (YXZ) is
  // (cos(rotX)sin(rotY), -sin(rotX), cos(rotX)cos(rotY)) — invert for the
  // rotation that aims it at the eye. The eye sits above, so rotX comes out
  // negative: the same "tipped back, cover up" sign the resting leans use.
  scene.lookDownPresentRotX = Math.asin(THREE.MathUtils.clamp(-dy / len, -1, 1));
  scene.lookDownPresentRotY = Math.atan2(dx / len, dz / len);
}

export function updateCameraTarget(scene: StoreScene) {
  scene.updateLOD();
  // Any retargeting (user navigation, mode change) cuts the return-drop
  // watch short — the player's intent wins over the diegetic beat. The
  // re-entry flows arm the watch AFTER their own updateCameraTarget call.
  scene.returnDropWatch = false;
  // Recomputed on every retarget, before the mode branches: browse reads the
  // camera pose out of it and inspect reads the present point, so it can't
  // live inside either one.
  scene.updateLookDownPresent();

  // T23: back room — the couch view (or the held-tape close-up), riding the
  // same targetCameraPos/targetLookAt lerp as every other mode.
  if (scene.mode === 'backroom') {
    if (scene.backRoom) {
      const pose = scene.backRoom.cameraPose();
      scene.targetCameraPos.copy(pose.pos);
      scene.targetLookAt.copy(pose.look);
    }
    scene.updateSelectionArrow();
    scene.triggerLibrarySelectUpdate(false);
    return;
  }

  // T21: entrance overview — feet planted at the vantage, head-look only.
  // The look target comes from overviewYaw/Pitch and rides the same
  // targetCameraPos/targetLookAt lerp every other mode uses. Those two angles
  // are kept pointing at whatever the jump index has focused (aimOverviewAt
  // below), so re-deriving the pose here always agrees with the index.
  if (scene.mode === 'overview') {
    // …except while the index previews a floor DISPLAY (Row 2), which walks
    // the camera off the vantage to face the fixture — or while Row 1 looks
    // down a mom-and-pop run (subNav.aisleCam). The index owns the targets
    // then; re-deriving them would snap the camera home mid-preview.
    if (scene.subNav && (scene.subNav.row === 1 || scene.subNav.aisleCam)) {
      scene.updateSelectionArrow();
      scene.triggerLibrarySelectUpdate(false);
      return;
    }
    const p = OVERVIEW_POS;
    scene.targetCameraPos.copy(p);
    const cp = Math.cos(scene.overviewPitch);
    scene._ovForward.set(
      -Math.sin(scene.overviewYaw) * cp,
      Math.sin(scene.overviewPitch),
      -Math.cos(scene.overviewYaw) * cp
    );
    scene.targetLookAt.copy(p).addScaledVector(scene._ovForward, 20.0);
    scene.updateSelectionArrow(); // keeps the big cursor on the focused run (feedback/003)
    scene.triggerLibrarySelectUpdate(false);
    return;
  }

  const lib = scene.libraries[scene.selectedLibraryIdx];
  const isNewReleasesSelect = (scene.mode === 'library-select' && scene.selectedLibraryIdx === scene.libraries.length);
  const isDisplaySelect = (scene.mode === 'library-select' && scene.selectedLibraryIdx > scene.libraries.length);
  const isDisplayBrowseOrInspect = (scene.selectedUnitSource === 'fixture');

  if (!lib && !isNewReleasesSelect && !isDisplaySelect && !isDisplayBrowseOrInspect) return;

  const xCenter = isNewReleasesSelect ? STORE_CENTER_X : (isDisplaySelect ? STORE_CENTER_X : scene.getLibraryXCenter(scene.selectedLibraryIdx));
  // This library's primary island; the camera spins about the same centre it does.
  const primaryUnit = scene.shelvingUnits.find(u => u.libraryIdx === scene.selectedLibraryIdx && u.unitIdxInLibrary === 0);

  if (scene.mode === 'library-select') {
    // Security-cam establishing view — the ONLY library-select framing since
    // the legacy first-person end-cap navigation was removed: stand just
    // inside the front entrance at the top-left corner, elevated near the
    // ceiling, looking diagonally across the whole store so every shelving
    // unit is visible at once. The camera stays put while selecting — the
    // floating cursor arrow (updateSelectionArrow) is what moves between
    // units.
    const storeWidth = scene.getStoreWidth();
    const leftX = STORE_CENTER_X - storeWidth / 2;
    const midZ = (scene.scaleZ(FIELD_Z_FRONT) + scene.backWallZ) / 2;
    scene.targetCameraPos.set(leftX + 3.0, scene.ceilingY - 2.0, 13.0);
    scene.targetLookAt.set(STORE_CENTER_X, 2.5, midZ);
  } else if (scene.mode === 'genre-select') {
    // Focus on selected library end cap
    const refZ = primaryUnit ? scene.aisleZCenter(primaryUnit) : scene.aislePivotZ;
    scene.targetCameraPos.set(xCenter + 8.5, 6.0, refZ);
    scene.targetLookAt.set(xCenter, 3.0, refZ - 12.0);
    if (primaryUnit) {
      scene.applyUnitRotation(scene.targetCameraPos, primaryUnit);
      scene.applyUnitRotation(scene.targetLookAt, primaryUnit);
    }
  } else if (scene.mode === 'browse') {
    const activeLibUnits = scene.shelvingUnits.filter(u => u.libraryIdx === scene.selectedLibraryIdx);
    const isBackWall = (scene.selectedUnitIdx === BACK_WALL_UNIT_IDX);
    const isDisplay = (scene.selectedUnitSource === 'fixture');

    if (isDisplay) {
      if (scene.selectedFixtureId?.startsWith('game-section')) {
        const fixture = scene.slottedFixtures.find(f => f.placement.id === scene.selectedFixtureId);
        const angle = fixture?.placement.yaw ?? 0;
        const windowSize = BROWSE_WINDOW_SIZE;
        if (scene.colsCount <= windowSize) {
          scene.cameraWindowMinCol = 0;
        } else {
          if (scene.selectedCol < scene.cameraWindowMinCol) {
            scene.cameraWindowMinCol = scene.selectedCol;
          } else if (scene.selectedCol >= scene.cameraWindowMinCol + windowSize) {
            scene.cameraWindowMinCol = scene.selectedCol - windowSize + 1;
          }
          scene.cameraWindowMinCol = Math.max(0, Math.min(scene.cameraWindowMinCol, scene.colsCount - windowSize));
        }

        const centerCol = scene.cameraWindowMinCol + (Math.min(scene.colsCount, windowSize) - 1) / 2;
        const shelfLength = (scene.colsCount - 1) * BOX_SPACING + 1.0;
        // Column z must follow the same per-side mapping the gondola's slots
        // bake with (game-section.ts getSlots: the two faces run in opposite
        // local-Z directions), or the camera window tracks the mirror-image
        // column when browsing the back side.
        const colZ = scene.selectedSide === 'back'
          ? shelfLength / 2 - 0.5 - centerCol * BOX_SPACING
          : -shelfLength / 2 + 0.5 + centerCol * BOX_SPACING;

        // Fallback guards a stale selectedShelf that outruns this fixture's
        // shelf count (undefined → NaN camera → blank blue frame).
        const shelfY = (fixture && fixture.shelfHeights[scene.selectedShelf]) ?? 3.0;
        const cameraY = shelfY + 0.4;
        const lookAtY = shelfY + 0.4;

        const xCenterVal = fixture?.placement.position.x ?? 17.0;
        const zCenterVal = fixture?.placement.position.z ?? 9.0;

        const isBack = scene.selectedSide === 'back';
        const dir = isBack ? -1 : 1;
        const shelfDepthAtHeight = unitDepthAtHeight(shelfY);
        const cameraX = xCenterVal + dir * (shelfDepthAtHeight / 2 + 3.8);

        scene.targetCameraPos.set(cameraX, cameraY, zCenterVal + colZ);
        scene.targetLookAt.set(xCenterVal + dir * 0.44, lookAtY, zCenterVal + colZ);

        const dx = scene.targetCameraPos.x - xCenterVal;
        const dz = scene.targetCameraPos.z - zCenterVal;
        const c = Math.cos(angle), s = Math.sin(angle);
        scene.targetCameraPos.set(xCenterVal + dx * c + dz * s, cameraY, zCenterVal - dx * s + dz * c);

        const ldx = scene.targetLookAt.x - xCenterVal;
        const ldz = scene.targetLookAt.z - zCenterVal;
        scene.targetLookAt.set(xCenterVal + ldx * c + ldz * s, lookAtY, zCenterVal - ldx * s + ldz * c);
      } else {
        const fixture = scene.slottedFixtures.find(f => f.placement.id === scene.selectedFixtureId);
        const sideNum = scene.selectedSide === 'front' ? 0 : (scene.selectedSide === 'right' ? 1 : (scene.selectedSide === 'back' ? 2 : 3));
        const fixtureYaw = fixture?.placement.yaw ?? 0;
        const sideAngle = sideNum * (Math.PI / 2) + fixtureYaw;

        // Fallback guards a stale selectedShelf that outruns this fixture's
        // shelf count (undefined → NaN camera → blank blue frame).
        const shelfY = (fixture && fixture.shelfHeights[scene.selectedShelf]) ?? 2.4;
        const fx = fixture?.placement.position.x ?? 0;
        const fz = fixture?.placement.position.z ?? 0;

        if (scene.selectedFixtureLookDown) {
          // Dump tub: the eye is pinned to the tub's own front and does NOT
          // follow selectedSide. Stepping through a bin used to teleport the
          // camera 90° around it every three titles, and a camera swinging
          // left makes the whole store sweep right — which is what read as
          // the left/right controls being inverted. See updateLookDownPresent.
          scene.targetCameraPos.copy(scene.lookDownCamera);
          scene.targetLookAt.copy(scene.lookDownLookAt);
        } else {
          const cameraY = shelfY + 0.4;
          const lookAtY = shelfY + 0.4;

          const distance = 1.25 + 2.2; // Backed up by 2.2 feet from active shelf face
          scene.targetCameraPos.set(fx + distance * Math.sin(sideAngle), cameraY, fz + distance * Math.cos(sideAngle));

          const lookAtDistance = 1.25 + 0.44;
          scene.targetLookAt.set(
            fx + lookAtDistance * Math.sin(sideAngle),
            lookAtY,
            fz + lookAtDistance * Math.cos(sideAngle),
          );
        }
      }
    } else if (isBackWall) {
      // Back wall browsing (along X) - Uniform distance & zoom
      const windowSize = BROWSE_WINDOW_SIZE;
      if (scene.colsCount <= windowSize) {
        scene.cameraWindowMinCol = 0;
      } else {
        if (scene.selectedCol < scene.cameraWindowMinCol) {
          scene.cameraWindowMinCol = scene.selectedCol;
        } else if (scene.selectedCol >= scene.cameraWindowMinCol + windowSize) {
          scene.cameraWindowMinCol = scene.selectedCol - windowSize + 1;
        }
        scene.cameraWindowMinCol = Math.max(0, Math.min(scene.cameraWindowMinCol, scene.colsCount - windowSize));
      }

      // Frame the whole SECTION the selection belongs to, not the sliding
      // window. Every column in a New Releases section carries the same
      // title, so stepping between sections moved the selection by a whole
      // section while the window slid by the minimum — leaving the new
      // section parked at the frame edge, often entirely off screen.
      const section = scene.nrSectionRangeForCol(scene.selectedCol);
      const centerCol = section
        ? (section.startCol + section.endCol) / 2
        : scene.cameraWindowMinCol + (Math.min(scene.colsCount, windowSize) - 1) / 2;
      const transform = scene.getNewReleasesSlotTransform(centerCol);

      // Dynamic Y height centered on selected back wall shelf
      const shelfY = WALL_SHELF_HEIGHTS[scene.selectedShelf] || 3.5;
      const cameraY = shelfY + 0.4;
      const lookAtY = shelfY + 0.4;

      // Back up far enough that the section fits the frame horizontally — a
      // double-feature spans twice a normal section, and at the old fixed
      // 3.8ft its outer columns fell outside the view.
      const spanCols = section ? (section.endCol - section.startCol + 1) : 1;
      const sectionHalfW = ((spanCols - 1) * BOX_SPACING + CASE_WIDTH) / 2;
      const vFovRad = (scene.camera.fov * Math.PI) / 180;
      const hHalfAngle = Math.atan(Math.tan(vFovRad / 2) * scene.camera.aspect);
      const fitDist = (sectionHalfW * 1.18) / Math.max(0.001, Math.tan(hHalfAngle));
      const backOff = Math.max(3.8, fitDist);

      // Back up along the run's own facing normal (cases face local +Z
      // rotated by rotationY): +Z for the back-wall runs, -X for the stepped
      // connector, +X for the LEFT-wall unit. The old two-case if/else only
      // knew -X and +Z, so browsing the left wall parked the camera beside
      // the run looking down its length instead of at the wall.
      const nrmX = Math.round(Math.sin(transform.rotationY));
      const nrmZ = Math.round(Math.cos(transform.rotationY));
      scene.targetCameraPos.set(transform.x + nrmX * backOff, cameraY, transform.z + nrmZ * backOff);
      scene.targetLookAt.set(transform.x, lookAtY, transform.z);
    } else {
      // Aisle browsing (along Z) - Uniform distance & zoom
      const activeUnit = activeLibUnits[scene.selectedUnitIdx];
      const unitZ = activeUnit ? activeUnit.zPos : 0;
      const windowSize = BROWSE_WINDOW_SIZE;
      if (scene.colsCount <= windowSize) {
        scene.cameraWindowMinCol = 0;
      } else {
        if (scene.selectedCol < scene.cameraWindowMinCol) {
          scene.cameraWindowMinCol = scene.selectedCol;
        } else if (scene.selectedCol >= scene.cameraWindowMinCol + windowSize) {
          scene.cameraWindowMinCol = scene.selectedCol - windowSize + 1;
        }
        scene.cameraWindowMinCol = Math.max(0, Math.min(scene.cameraWindowMinCol, scene.colsCount - windowSize));
      }

      const centerCol = scene.cameraWindowMinCol + (Math.min(scene.colsCount, windowSize) - 1) / 2;
      const cameraZ = activeUnit
        ? scene.aisleColZ(activeUnit, centerCol, scene.selectedSide === 'back' ? 'back' : 'front')
        : FIELD_Z_FRONT + unitZ - 0.5 - centerCol * BOX_SPACING;

      // Dynamic Y height centered on selected aisle shelf
      const shelfY = AISLE_SHELF_HEIGHTS[scene.selectedShelf] || 3.0;
      const cameraY = shelfY + 0.4;
      const lookAtY = shelfY + 0.4;
      
      const xCenterVal = activeUnit ? activeUnit.xCenter : STORE_CENTER_X;
      
      // Backed off the active shelf face by the FORMAT's browse stand-off (3.8 ft
      // on the corporate box). The browse-front side's local-X direction is the
      // unit's stored browseSign, so the camera approaches from that same side.
      //
      // Format-driven because the stand-off has to fit inside the AISLE: back a
      // camera 3.8 ft off a shelf face in a 4 ft aisle and it ends up standing
      // inside the run opposite. See StoreFormatSpec.browseStandoff, which
      // tests/store-format.test.ts checks against the run pitch.
      const isBack = scene.selectedSide === 'back';
      const dir = (isBack ? -1 : 1) * (activeUnit ? activeUnit.browseSign : 1);
      const shelfDepthAtHeight = unitDepthAtHeight(shelfY);
      const cameraX = xCenterVal + dir * (shelfDepthAtHeight / 2 + activeStoreFormat().browseStandoff);

      // Straight view, no Z offset (computed in layout space, then rotated to
      // follow this unit's arrangement yaw).
      scene.targetCameraPos.set(cameraX, cameraY, cameraZ);
      const activeKey = scene.getActiveSlotKey();
      const activeSlot = scene.slotsByPosition.get(activeKey);
      const offset = activeSlot ? (0.44 + extraCopiesCount(activeSlot.movie) * 0.07) : 0.44;
      scene.targetLookAt.set(xCenterVal + dir * offset, lookAtY, cameraZ);
      if (activeUnit) {
        scene.applyUnitRotation(scene.targetCameraPos, activeUnit);
        scene.applyUnitRotation(scene.targetLookAt, activeUnit);
      }
    }

    // Lazily trigger details and texture download for focused item
    const activeKey = scene.getActiveSlotKey();
    const activeSlot = scene.slotsByPosition.get(activeKey);
    if (activeSlot) {
      activeSlot.loadFullDetails();
    }
  } else if (scene.mode === 'person-endcap' && scene.personEndcap) {
    const pe = scene.personEndcap;
    const leftCap = pe.leftCap;
    if (leftCap) {
      const currentPos = pe.moviePositions[pe.selectedIdx];
      const row = currentPos ? currentPos.row : 0;
      const shelfIdx = (AISLE_SHELF_HEIGHTS.length - 1) - row;
      const shelfY = AISLE_SHELF_HEIGHTS[shelfIdx] ?? 3.2;
      const caseLocalY = shelfY - UNIT_FRAME_HEIGHT / 2;

      // Frame the endcap display, centered horizontally on the endcap face
      // Z distance is fixed at 3.8 feet from the endcap face (local Z = 0.05)
      const localCamPos = new THREE.Vector3(0, caseLocalY + 0.4, 0.05 + 3.8);
      const localLookAt = new THREE.Vector3(0, caseLocalY + 0.4, 0.05);

      // Convert the local coordinates of the endcap to world space
      leftCap.localToWorld(localCamPos);
      leftCap.localToWorld(localLookAt);

      scene.targetCameraPos.copy(localCamPos);
      scene.targetLookAt.copy(localLookAt);
    }
  } else if (scene.mode === 'inspect') {
    const isDisplay = scene.selectedUnitSource === 'fixture';
    const activeLibUnits = scene.shelvingUnits.filter(u => u.libraryIdx === scene.selectedLibraryIdx);
    const isBackWall = (scene.selectedUnitIdx === BACK_WALL_UNIT_IDX);
    
    const fixture = isDisplay ? scene.slottedFixtures.find(f => f.placement.id === scene.selectedFixtureId) : null;
    const shelfY = fixture ? (fixture.shelfHeights[scene.selectedShelf] || 2.4) : (isBackWall ? WALL_SHELF_HEIGHTS[scene.selectedShelf] : AISLE_SHELF_HEIGHTS[scene.selectedShelf]);
    const actualBoxHeight = CASE_HEIGHT;
    const actualBoxWidth = CASE_WIDTH;
    // +0.3 matches the inspect mode animation Y offset. A dump tub is the
    // exception: its case isn't resting on a shelf at all, it's held up at
    // the pinned present point (see updateLookDownPresent), so frame THAT
    // height — using shelfY here left the camera down at rim level, staring
    // over the tub wall with the case cut off at the top of frame.
    const boxCenterY = (scene.selectedFixtureLookDown && fixture)
      ? scene.lookDownPresent.y
      : shelfY + actualBoxHeight / 2 + 0.3;
    
    // Calculate dynamic inspect distance based on screen aspect ratio
    const vFov = (scene.camera.fov * Math.PI) / 180;
    const aspect = scene.camera.aspect;
    
    const totalWidth = 2 * INSPECT_FAN_X + actualBoxWidth; // the pair's full span
    const totalHeight = actualBoxHeight;
    const margin = INSPECT_FIT_MARGIN;

    // Height governs at every ordinary aspect: both distances scale with the
    // same margin, and distH > distW whenever totalHeight * aspect > totalWidth
    // (0.667 * 1.78 = 1.19 against a 0.93 span). So `margin` reads directly as
    // "the pair fills 1/margin of the frame HEIGHT" — 1.8 is about 56%.
    const distH = (totalHeight * margin) / (2 * Math.tan(vFov / 2));
    const distW = (totalWidth * margin) / (2 * Math.tan(vFov / 2) * aspect);
    
    const INSPECT_DISTANCE = Math.max(distH, distW);
 
    // Unified inspection target computation based on the actual target position of the front cover Mesh (hf)
    // getActiveSlotKey() (NOT a hand-built lib_unit_... key): fixture slots are
    // keyed `fixture_<id>_side_...`, so the inline form silently missed every
    // display-stand slot and inspect fell through to the wide fallback framing.
    const activeSlot = scene.slotsByPosition.get(scene.getActiveSlotKey());
    
    if (activeSlot) {
      let targetX = activeSlot.restingX;
      let targetZ = activeSlot.restingZ;
      let targetRotY = activeSlot.restingRotY;
      
      let normalX = 0;
      let normalZ = 0;

      if (isDisplay && scene.selectedFixtureLookDown && fixture) {
        // Dump tub: the case is held up at the pinned present point, not
        // resting in the pile, and its resting yaw is random scatter. Frame
        // the present point and come in level along the tub's own front, so
        // inspect doesn't re-orbit the bin the browse pose just stopped
        // orbiting.
        const faceYaw = fixture.placement.yaw;
        targetX = scene.lookDownPresent.x;
        targetZ = scene.lookDownPresent.z;
        targetRotY = faceYaw;
        normalX = Math.sin(faceYaw);
        normalZ = Math.cos(faceYaw);
      } else if (isDisplay && fixture) {
        // Approach along the case's own facing (restingRotY), not a
        // sideNum*90°+yaw reconstruction: that formula assumes four-sided
        // fixtures whose 'front' faces local +Z, but the game gondola's
        // front/back sides face local ±X, which put the camera 90° off,
        // staring at the spine.
        targetX = activeSlot.restingX + 0.6 * Math.sin(activeSlot.restingRotY);
        targetZ = activeSlot.restingZ + 0.6 * Math.cos(activeSlot.restingRotY);

        normalX = Math.sin(activeSlot.restingRotY);
        normalZ = Math.cos(activeSlot.restingRotY);
      } else if (isBackWall) {
        // Approach along the wall run's own facing: +Z for the back-wall
        // runs, +X for the left-wall unit, -X for the stepped connector.
        normalX = Math.round(Math.sin(activeSlot.restingRotY));
        normalZ = Math.round(Math.cos(activeSlot.restingRotY));
        targetX = activeSlot.restingX + 1.2 * normalX;
        targetZ = activeSlot.restingZ + 1.2 * normalZ;
      } else {
        // Aisle unit
        const activeUnit = activeLibUnits[scene.selectedUnitIdx];
        const isBack = scene.selectedSide === 'back';
        const dir = (isBack ? -1 : 1) * (activeUnit ? activeUnit.browseSign : 1);
        const popDist = 1.2 * dir;
        const slotAngle = activeSlot.aisleAngle ?? 0;
        targetX = activeSlot.restingX + popDist * Math.cos(slotAngle);
        targetZ = activeSlot.restingZ - popDist * Math.sin(slotAngle);
        
        if (activeUnit) {
          normalX = dir * Math.cos(activeUnit.yaw);
          normalZ = -dir * Math.sin(activeUnit.yaw);
        } else {
          normalX = dir;
          normalZ = 0;
        }
      }

      // (#43) Anchor the camera on the MIDPOINT of the two inspected cases
      // (the cover pops to local +0.28, the rental copy to -0.28 — see the
      // inspect targets in animate()), not on the cover case itself:
      // anchoring on the cover left the pair hanging half a case toward
      // screen-left, which read as "camera shifted too far right". Local X
      // here is the face's screen-right axis for every unit orientation, so
      // a 0 lateral offset centers the pair on all of them (the aspect fit
      // above already sizes the distance for the full two-case span).
      // NOTE the pair is NOT the same apparent size even when coplanar: the
      // rental clamshell is physically taller than the sleeve it holds
      // (VHS_RIM_VERTICAL_FT — 0.727ft against 0.667ft), so at equal distance it
      // already stands ~9% taller on screen. That is the baseline any
      // INSPECT_RETAIL_Z_LEAD is judged against, not a coplanar pair.
      const targetFrontX = 0.0;
      const targetFrontZ = INSPECT_CASE_Z;

      const fWorldX = targetX + targetFrontX * Math.cos(targetRotY) + targetFrontZ * Math.sin(targetRotY);
      const fWorldZ = targetZ - targetFrontX * Math.sin(targetRotY) + targetFrontZ * Math.cos(targetRotY);

      const cameraX = fWorldX + normalX * INSPECT_DISTANCE;
      const cameraZ = fWorldZ + normalZ * INSPECT_DISTANCE;

      scene.targetCameraPos.set(cameraX, boxCenterY, cameraZ);
      scene.targetLookAt.set(fWorldX, boxCenterY, fWorldZ);
    }
  }

  // Reposition the floating selection arrow over the newly-selected unit (and
  // toggle its visibility — it only shows in the security-cam library-select
  // view, #62).
  scene.updateSelectionArrow();
  scene.triggerLibrarySelectUpdate(scene.mode === 'library-select');
}

/**
 * Turn the entrance-overview head-look toward a world point — the marker
 * floating over whatever the jump index has focused (store-subnav.ts), or an
 * overview cursor target.
 *
 * overviewYaw/overviewPitch ARE the pose for `mode === 'overview'`: every
 * updateCameraTarget() re-derives the camera from them. So anything that moves
 * the focus has to move these two angles, or the next unrelated retarget
 * (a resize, a settings apply, a mode bounce) snaps the view back to a stale
 * heading. Aims a couple of feet BELOW the marker, at the stock, so a distant
 * run doesn't tilt the horizon up.
 */
export function aimOverviewAt(scene: StoreScene, x: number, y: number, z: number): void {
  const p = OVERVIEW_POS;
  const dx = x - p.x, dz = z - p.z;
  // forward = (-sin yaw, sin pitch, -cos yaw) — see updateCameraTarget().
  scene.overviewYaw = Math.atan2(-dx, -dz);
  scene.overviewPitch = THREE.MathUtils.clamp(
    Math.atan2((y - 2.0) - p.y, Math.hypot(dx, dz)),
    OVERVIEW_PITCH_MIN, OVERVIEW_PITCH_MAX);
  updateCameraTarget(scene);
}

export function createSelectionArrow(scene: StoreScene) {
  const group = new THREE.Group();

  // Downward-pointing marker in the theme's brand gold, hovering over the unit.
  const coneGeo = new THREE.ConeGeometry(0.85, 1.7, 4);
  const arrowPalette = getActiveTheme().palette;
  const coneMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(arrowPalette.secondary),
    emissive: new THREE.Color(arrowPalette.secondary),
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.2,
    // Overlay UI: never occluded by store geometry (shelves, signs, cornice)
    // — drawn last (renderOrder below) with the depth test off.
    depthTest: false,
    depthWrite: false,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.rotation.x = Math.PI;       // apex points down (-Y), at the unit
  cone.rotation.y = Math.PI / 4;   // diamond facing the camera
  cone.position.y = 0.85;          // apex at group y=0, base at y=1.7
  cone.renderOrder = 9998;
  group.add(cone);

  // Name plaque (canvas texture redrawn per selection).
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const labelW = 7.0;
  const labelH = labelW * (canvas.height / canvas.width);
  const labelGeo = new THREE.PlaneGeometry(labelW, labelH);
  const labelMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    depthWrite: false,
    depthTest: false, // overlay UI, same as the cone — never hidden behind geometry
  });
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.position.y = 1.7 + 0.25 + labelH / 2; // sit just above the marker base
  labelMesh.renderOrder = 9999; // after the cone so the plaque wins where they overlap
  group.add(labelMesh);

  group.visible = false;
  group.renderOrder = 999; // (groups don't propagate renderOrder — the meshes above carry it)
  // AO-excluded: the marker bobs while the camera is static (VIDEO tier), and
  // a floating UI element shouldn't stamp a contact halo on the shelves —
  // exclusion also lets the AO view cache stay frozen while it animates.
  group.userData.excludeFromSSAO = true;

  // Set all selection arrow objects to Layer 1 so they don't reflect in mirrors
  group.traverse((child) => {
    child.layers.set(1);
  });

  scene.scene.add(group);
  scene.meshes.push(group);

  scene.selectionArrow = group;
  scene.selectionArrowLabel = { canvas, ctx, tex };

  // Registered ONCE here, not in updateSelectionArrowLabel — that runs on every
  // cursor move and would pile up a subscriber per section. Clearing the cached
  // text is what gets the repaint past that function's own no-op guard.
  onBrandChange(() => {
    const label = scene.selectionArrowLabelText;
    if (!scene.selectionArrowLabel || !label) return;
    scene.selectionArrowLabelText = '';
    updateSelectionArrowLabel(scene, label);
  });
}

export function updateSelectionArrowLabel(scene: StoreScene, text: string) {
  if (!scene.selectionArrowLabel || scene.selectionArrowLabelText === text) return;
  scene.selectionArrowLabelText = text;
  const { canvas, ctx, tex } = scene.selectionArrowLabel;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Brand-blue plaque with a safety-gold border (theme palette).
  const plaquePalette = getActiveTheme().palette;
  const r = 30;
  ctx.beginPath();
  ctx.roundRect(7, 7, W - 14, H - 14, r);
  ctx.fillStyle = plaquePalette.primary;
  ctx.fill();
  ctx.lineWidth = 11;
  ctx.strokeStyle = plaquePalette.secondary;
  ctx.stroke();

  // Lettering in the house KNOCKOUT, shrunk to fit the plaque width. This is
  // the store's most prominent label — the plaque the entrance view puts over
  // whatever section you're on — and it inked from palette.secondary, i.e. the
  // TRIM colour, so it wore the keyline gold instead of the emblem's own ink
  // and no brand change could move it (signage rule 2). The border below stays
  // on secondary: that one really is trim.
  ctx.fillStyle = getActiveLogoSpec().textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = 86;
  ctx.font = `bold ${fontSize}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  while (ctx.measureText(text).width > W - 70 && fontSize > 22) {
    fontSize -= 4;
    ctx.font = `bold ${fontSize}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  }
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.fillText(text, W / 2, H / 2 + 6);

  tex.needsUpdate = true;
}

export function updateSelectionArrow(scene: StoreScene) {
  if (!scene.selectionArrow) return;
  // The ▼ jump index (store-subnav.ts, browse mode) drives this same single
  // big cursor over its focused destination — the owner retired the
  // per-target chevron cloud in feedback/003 and the index follows suit.
  if (scene.subNav) {
    const st = scene.subNav;
    const item = st.rows[st.row][st.sel[st.row]];
    scene.selectionArrow.visible = !!item;
    if (item) {
      scene.selectionArrowBaseY = item.y - 0.3; // apex about where a ticket tip floats
      scene.selectionArrow.position.set(item.x, scene.selectionArrowBaseY, item.z);
      scene.updateSelectionArrowLabel(item.label);
    }
    return;
  }
  // feedback/003: the entrance overview reuses this arrow as its single big
  // cursor — one readable marker over the focused run (stepped with ←/→)
  // instead of the old cloud of small per-run chevron signs.
  if (scene.mode === 'overview') {
    const cursors = scene.overviewCursors;
    const t = cursors && cursors.focusedIdx >= 0 ? cursors.targets[cursors.focusedIdx] : null;
    scene.selectionArrow.visible = !!t;
    if (t) {
      scene.selectionArrowBaseY = t.y - 0.3; // apex about where the chevron tip floated
      scene.selectionArrow.position.set(t.x, scene.selectionArrowBaseY, t.z);
      scene.updateSelectionArrowLabel(t.label);
    }
    return;
  }
  // #62: the floating "you are here" cursor marks the selected section in
  // the (security-cam) library-select view — since the legacy first-person
  // library-select was removed, that view IS library-select mode.
  const show = scene.mode === 'library-select';
  scene.selectionArrow.visible = show;
  if (!show) return;

  const isNewReleases = scene.selectedLibraryIdx === scene.libraries.length;
  const isDisplay = scene.selectedLibraryIdx > scene.libraries.length;
  let wx: number, wz: number;
  if (isDisplay) {
    const standIdx = scene.selectedLibraryIdx - scene.libraries.length - 1;
    const fixture = scene.slottedFixtures[standIdx];
    wx = fixture ? fixture.placement.position.x : STORE_CENTER_X;
    wz = fixture ? fixture.placement.position.z : scene.backWallZ + 5.0;
    scene.selectionArrowBaseY = 6.8;
  } else if (isNewReleases) {
    wx = STORE_CENTER_X;
    wz = scene.backWallZ + 4.0;
    scene.selectionArrowBaseY = 8.4; // New Releases wall shelves are taller
  } else {
    wx = scene.getLibraryXCenter(scene.selectedLibraryIdx);
    const primaryUnit = scene.shelvingUnits.find(
      u => u.libraryIdx === scene.selectedLibraryIdx && u.unitIdxInLibrary === 0
    );
    wz = primaryUnit ? scene.aisleZCenter(primaryUnit) : scene.aislePivotZ;
    scene.selectionArrowBaseY = 6.8; // just above the end caps / aisle signs
  }
  scene.selectionArrow.position.set(wx, scene.selectionArrowBaseY, wz);
  scene.updateSelectionArrowLabel(scene.getActiveAisleName());
}

export function jumpToTitle(scene: StoreScene, query: string, opts: { flip?: boolean } = {}): boolean {
  // T23: no search-warping out of an active rental lockout.
  if (scene.mode === 'backroom' && !scene.rentalUnlocked) return false;
  const q = query.toLowerCase();
  // Rank candidates: exact id/title beats prefix beats substring, and a
  // shelving slot beats a display-stand copy of the same tier (the aisle
  // shelf is the title's canonical home).
  let target: MovieSlot | null = null;
  let bestRank = -1;
  scene.slotsByPosition.forEach((s) => {
    if (s.hidden || s.unitIdx >= BACK_WALL_UNIT_IDX) return;
    const t = s.movie.title.toLowerCase();
    let rank = s.movie.id === query || t === q ? 6 : t.startsWith(q) ? 4 : t.includes(q) ? 2 : -1;
    if (rank < 0) return;
    if (s.source !== 'fixture') rank += 1;
    if (rank > bestRank) { bestRank = rank; target = s; }
  });
  if (!target) return false;
  const slot = target as MovieSlot;

  // Checkpoint chains can arrive here from a walk state (e.g. shot --also
  // "walk:...:a.png" --also "inspect:...:b.png"); walk mode owns the camera,
  // so exit it or the inspect framing below is silently ignored.
  if (scene.isWalkAroundMode) scene.toggleWalkAround();
  // Jumping straight from the entrance overview (search / checkpoint): drop
  // the cursors + crosshair before taking over the selection state.
  if (scene.mode === 'overview') scene.hideOverviewVisuals();

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
  scene.walkReturnPose = null; // search-warp inspect, not a walk click
  scene.mode = 'inspect';
  scene.isFlipped = false; scene.heroSpine = false;
  scene.resetHeroFace();
  scene.updateColsCount();
  if (scene.onModeChange) scene.onModeChange(scene.mode);
  scene.updateCameraTarget();
  scene.loadAllArtworkForActiveLibrary();
  if (opts.flip) scene.toggleFlip();
  if (scene.onSelectionChange) scene.onSelectionChange(slot.movie);
  scene.onConsoleLog(`[System] Checkpoint: inspecting "${slot.movie.title}"${opts.flip ? ' (flipped)' : ''}`, "system");
  return true;
}

export function debugSelectTopShelf(scene: StoreScene): boolean {
  if (scene.mode !== 'browse') return false;
  scene.selectedShelf = scene.browseMaxShelf();
  scene.updateCameraTarget();
  return true;
}

export function debugBrowseSelection(scene: StoreScene): { side: string; shelf: number; col: number; unitIdx: number; glideLerp: number } {
  return {
    side: scene.selectedSide,
    shelf: scene.selectedShelf,
    col: scene.selectedCol,
    unitIdx: scene.selectedUnitIdx,
    glideLerp: scene.cameraGlideLerp,
  };
}

export function snapCamera(scene: StoreScene): void {
  // Walk mode has no glide to skip, and targetCameraPos/targetLookAt are
  // stale browse-mode state there — snapping would yank a teleported walk
  // pose back to wherever browse last pointed (this silently unframed every
  // walk-based harness state that wasn't on the exemption list).
  if (scene.isWalkAroundMode) return;
  scene.currentCameraPos.copy(scene.targetCameraPos);
  scene.currentLookAt.copy(scene.targetLookAt);
  scene.camera.position.copy(scene.currentCameraPos);
  scene.camera.lookAt(scene.currentLookAt);
  scene.requestRender();
}

export function teleportWalk(scene: StoreScene, x: number, z: number, yawDeg = 0, pitchDeg = 0, y = 5.5, free = false): void {
  if (!scene.isWalkAroundMode) scene.toggleWalkAround();
  scene.walkFreecam = free;
  scene.currentCameraPos.set(x, y, z);
  scene.camera.position.copy(scene.currentCameraPos);
  scene.yaw = (yawDeg * Math.PI) / 180;
  scene.pitch = (pitchDeg * Math.PI) / 180;
  scene.camera.rotation.order = 'YXZ';
  scene.camera.rotation.y = scene.yaw;
  scene.camera.rotation.x = scene.pitch;
  scene.camera.rotation.z = 0;
  scene.requestRender();
}

// Shared-place links (issue #137): the public two-parameter subset of the
// harness's jump/teleport contract (see src/shared-place.ts). Captures the
// CURRENT view as whichever shape reproduces it best -- inspecting a title
// is shared by name (jumpToTitle survives a different store layout, e.g. a
// visitor's own library), everything else by camera pose (teleportWalk) the
// same way F8 feedback pins already do (StoreScene.captureFeedbackSnapshot).
export function captureSharedPlace(scene: StoreScene): SharedPlace {
  if (scene.mode === 'inspect') {
    const movie = scene.getSelectedMovie();
    if (movie) return { kind: 'title', title: movie.title, flip: scene.isFlipped };
  }
  const euler = new THREE.Euler().setFromQuaternion(scene.camera.quaternion, 'YXZ');
  const pos = scene.camera.position;
  return {
    kind: 'walk',
    x: pos.x,
    z: pos.z,
    yaw: (euler.y * 180) / Math.PI,
    pitch: (euler.x * 180) / Math.PI,
    y: pos.y,
  };
}

/** Applies a `?title=`/`?walk=` link from the current URL at boot. Returns whether it found a place to go. */
export function applySharedPlaceFromUrl(scene: StoreScene): boolean {
  const place = parseSharedPlace();
  if (!place) return false;
  if (place.kind === 'title') return jumpToTitle(scene, place.title, { flip: place.flip });
  teleportWalk(scene, place.x, place.z, place.yaw, place.pitch, place.y, false);
  return true;
}
