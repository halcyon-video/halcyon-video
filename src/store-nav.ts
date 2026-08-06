// Browse-cursor navigation — extracted from StoreScene (three-scene.ts keeps
// one-line delegating stubs; moveLeft/moveRight stay there as thin mode
// dispatchers): shelf-to-shelf cursor movement with duplicate skipping,
// library-select directional movement, the over-the-top shelf wrap, and
// series episode/season selection. Every function takes the StoreScene as
// its first parameter and reads/writes scene state exactly as the original
// methods did.
//
// The two ends of the vertical chain hand off to their own modules, both of
// which stay in browse mode and borrow the arrow keys the way the clasp cursor
// does: ▲ past the top row opens the ceiling-TV peek (store-tv-peek.ts, with
// the over-the-top shelf wrap as the no-TV fallback), ▼ at the bottom row
// opens the sub-nav jump index (store-subnav.ts). navOverlay* below is the
// ←/→/OK/Back half of that dispatch, called from three-scene.ts's stubs.
import { backCoverRegions } from './video-case';
import { BROWSE_WINDOW_SIZE, AISLE_SHELF_HEIGHTS, WALL_SHELF_HEIGHTS, UNIT_SIDE_CAPACITY, BACK_WALL_UNIT_IDX, ShelvingUnit } from './store-layout';
import { retailAudio } from './audio';
import { perfTrace } from './perf-trace';
import { SP_INPUT, TOP_WRAP_GLIDE_LERP } from './scene-shared';
import { isEndcapKind } from './fixtures/genre-endcap';
import { enterEndcapCursor } from './browse-cursor';
import { enterTvPeek, exitTvPeek, tvPeekActive, tvPeekCycle, tvPeekSelect, debugTvPeek, forgetTvPeek } from './store-tv-peek';
import {
  openSubNav, subNavActive, subNavArrow, subNavUp, subNavDown, subNavSelect, subNavBack,
  debugSubNav, forgetSubNav,
} from './store-subnav';
import type { StoreScene } from './three-scene';

export function moveSkippingDuplicates(scene: StoreScene, dir: 'left' | 'right') {
  perfTrace.begin(SP_INPUT);
  try {
    scene.moveSkippingDuplicatesImpl(dir);
  } finally {
    perfTrace.end(SP_INPUT);
  }
}

export function moveSkippingDuplicatesImpl(scene: StoreScene, dir: 'left' | 'right') {
  const startMovie = scene.mode === 'browse' ? scene.getSelectedMovie() : null;
  if (dir === 'left') scene.moveLeftInternal(); else scene.moveRightInternal();
  // Only skip while browsing shelves and only past copies of the movie we just
  // left; guard bounds the walk so an all-duplicates edge can never spin forever.
  if (scene.mode !== 'browse' || !startMovie) return;
  let guard = 0;
  while (guard++ < 300) {
    const cur = scene.getSelectedMovie();
    if (!cur || cur.id !== startMovie.id) break; // landed on a different title — done
    const keyBefore = scene.getActiveSlotKey();
    if (dir === 'left') scene.moveLeftInternal(); else scene.moveRightInternal();
    if (scene.getActiveSlotKey() === keyBefore) break; // couldn't move (hit an end)
  }
}

export function lineStartUnit(_scene: StoreScene, libUnits: ShelvingUnit[], lineId: number): ShelvingUnit {
  return libUnits.filter(u => u.lineId === lineId)[0];
}

type SceneFixture = StoreScene['slottedFixtures'][number];

/** The genre endcap standing at this line's entrance end, if one was built. */
function genreEndcapForLine(scene: StoreScene, lineId: number): SceneFixture | null {
  return (
    scene.slottedFixtures.find(
      (f) => isEndcapKind(f.placement.kind) && f.placement.options?.lineId === lineId
    ) ?? null
  );
}

/**
 * Step off a run's entrance-end column onto its genre endcap — the landing
 * itself lives in browse-cursor.ts (enterEndcapCursor), shared with the
 * sub-nav jump index, which enters an endcap by this exact route.
 */
const enterGenreEndcapFromShelf = enterEndcapCursor;

/**
 * Step off a genre endcap's edge column back onto the browse snake, in
 * reading order: Left past column 0 continues to the PREVIOUS line's back
 * face (its reading end); Right past the last column continues to the
 * endcap's own line's front face at column 0. The #45 closed loop stays a
 * loop with a three-column stop — never a per-line island. Returns false
 * (caller clamps) when the requested side has no shelf to land on.
 */
function exitGenreEndcapToShelf(scene: StoreScene, fixture: SceneFixture, exitTo: 'prevBack' | 'lineFront'): boolean {
  const opts = fixture.placement.options ?? {};
  const libraryIdx = typeof opts.libraryIdx === 'number' ? opts.libraryIdx : -1;
  const lineId = typeof opts.lineId === 'number' ? opts.lineId : -1;
  if (libraryIdx < 0 || lineId < 0) return false;
  const libUnits = scene.shelvingUnits.filter((u) => u.libraryIdx === libraryIdx);
  const lineFirst = lineStartUnit(scene, libUnits, lineId);
  if (!lineFirst) return false;

  scene.selectedShelf = AISLE_SHELF_HEIGHTS.length - 1;
  if (exitTo === 'prevBack') {
    const prevLineUnits = libUnits.filter(
      (u) => u.lineId !== lineId && u.unitIdxInLibrary < lineFirst.unitIdxInLibrary
    );
    if (prevLineUnits.length === 0) return false;
    const prevFirst = lineStartUnit(scene, libUnits, prevLineUnits[prevLineUnits.length - 1].lineId);
    scene.selectedUnitSource = 'shelving';
    scene.selectedFixtureId = null;
    scene.selectedLibraryIdx = libraryIdx;
    scene.selectedUnitIdx = prevFirst.unitIdxInLibrary;
    scene.selectedSide = 'back';
    scene.updateColsCount();
    scene.selectedCol = scene.colsCount - 1;
    scene.cameraWindowMinCol = Math.max(0, scene.colsCount - BROWSE_WINDOW_SIZE);
  } else {
    scene.selectedUnitSource = 'shelving';
    scene.selectedFixtureId = null;
    scene.selectedLibraryIdx = libraryIdx;
    scene.selectedUnitIdx = lineFirst.unitIdxInLibrary;
    scene.selectedSide = 'front';
    scene.updateColsCount();
    scene.selectedCol = 0;
    scene.cameraWindowMinCol = 0;
  }
  scene.updateCameraTarget();
  scene.loadAllArtworkForActiveLibrary();
  if (scene.onSelectionChange) scene.onSelectionChange(scene.getSelectedMovie());
  return true;
}

export function getSelectableWorldPos(scene: StoreScene, idx: number): { x: number, z: number } | null {
  const N = scene.libraries.length;
  if (idx < 0) return null;
  if (idx < N) {
    const u = scene.shelvingUnits.find(su => su.libraryIdx === idx && su.unitIdxInLibrary === 0);
    if (!u) return null;
    return { x: scene.getLibraryXCenter(idx), z: scene.aisleZCenter(u) };
  }
  if (idx === N) {
    return { x: 11.0, z: scene.backWallZ + 4.0 };
  }
  const standIdx = idx - N - 1;
  const f = scene.slottedFixtures[standIdx];
  if (!f) return null;
  return { x: f.placement.position.x, z: f.placement.position.z };
}

export function stepLibraryIndex(scene: StoreScene, sign: number) {
  const maxIdx = scene.libraries.length + scene.slottedFixtures.length;
  const next = scene.selectedLibraryIdx + (sign >= 0 ? 1 : -1);
  if (next < 0 || next > maxIdx) return;
  scene.selectedLibraryIdx = next;
  scene.updateCameraTarget();
  scene.onConsoleLog(`[System] Selected library: ${scene.getActiveAisleName()}`, "system");
}

export function findLibrarySelectCandidate(scene: StoreScene, axis: 'x' | 'z', sign: number): number {
  const cur = scene.getSelectableWorldPos(scene.selectedLibraryIdx);
  // Forward = the intended look direction (targetLookAt heads there even while
  // the camera is still gliding), flattened to the ground plane.
  const fx0 = scene.targetLookAt.x - scene.targetCameraPos.x;
  const fz0 = scene.targetLookAt.z - scene.targetCameraPos.z;
  const flen = Math.hypot(fx0, fz0);
  if (!cur || flen < 1e-4) return -1;
  const fwdX = fx0 / flen, fwdZ = fz0 / flen;
  // Viewer's right on the ground plane = cross(forward, up) with up=+Y.
  const rgtX = -fwdZ, rgtZ = fwdX;
  const dirX = axis === 'x' ? rgtX * sign : fwdX * sign;
  const dirZ = axis === 'x' ? rgtZ * sign : fwdZ * sign;

  const maxIdx = scene.libraries.length + scene.slottedFixtures.length;
  let bestIdx = -1, bestCos = -1, bestDist = Infinity;
  for (let idx = 0; idx <= maxIdx; idx++) {
    if (idx === scene.selectedLibraryIdx) continue;
    const p = scene.getSelectableWorldPos(idx);
    if (!p) continue;
    const dx = p.x - cur.x, dz = p.z - cur.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-3) continue;
    const proj = dx * dirX + dz * dirZ;
    if (proj <= 1e-3) continue; // opposite/perpendicular to the press — skip
    const cos = proj / dist;
    if (cos > bestCos + 0.05 || (Math.abs(cos - bestCos) <= 0.05 && dist < bestDist)) {
      bestCos = cos; bestDist = dist; bestIdx = idx;
    }
  }
  return bestIdx;
}

export function canMoveLibrarySelect(scene: StoreScene, axis: 'x' | 'z', sign: number): boolean {
  const cur = scene.getSelectableWorldPos(scene.selectedLibraryIdx);
  const fx0 = scene.targetLookAt.x - scene.targetCameraPos.x;
  const fz0 = scene.targetLookAt.z - scene.targetCameraPos.z;
  if (!cur || Math.hypot(fx0, fz0) < 1e-4) {
    // Fallback matches stepLibraryIndex: only left/right walk the flat list.
    if (axis !== 'x') return false;
    const maxIdx = scene.libraries.length + scene.slottedFixtures.length;
    const next = scene.selectedLibraryIdx + (sign >= 0 ? 1 : -1);
    return next >= 0 && next <= maxIdx;
  }
  return scene.findLibrarySelectCandidate(axis, sign) >= 0;
}

export function moveLibrarySelectDirectional(scene: StoreScene, axis: 'x' | 'z', sign: number) {
  const cur = scene.getSelectableWorldPos(scene.selectedLibraryIdx);
  const fx0 = scene.targetLookAt.x - scene.targetCameraPos.x;
  const fz0 = scene.targetLookAt.z - scene.targetCameraPos.z;
  if (!cur || Math.hypot(fx0, fz0) < 1e-4) {
    scene.stepLibraryIndex(sign);
    scene.triggerLibrarySelectUpdate(scene.mode === 'library-select');
    return;
  }
  const bestIdx = scene.findLibrarySelectCandidate(axis, sign);
  if (bestIdx < 0) {
    scene.triggerLibrarySelectUpdate(scene.mode === 'library-select');
    return; // nothing lies that way — clamp (arrows still refresh)
  }
  scene.selectedLibraryIdx = bestIdx;
  scene.updateCameraTarget(); // re-emits onLibrarySelectUpdate, refreshing arrows
  scene.onConsoleLog(`[System] Selected library: ${scene.getActiveAisleName()}`, "system");
}

export function moveLeftInternal(scene: StoreScene) {
  if (scene.mode === 'library-select') {
    scene.moveLibrarySelectDirectional('x', -1);
  } else if (scene.mode === 'person-endcap') {
    scene.moveEndcapSelection(-1, 0);
  } else if (scene.mode === 'browse') {
    if (scene.selectedUnitSource === 'fixture') {
      // Four-sided fixtures lay their columns out LEFT-to-RIGHT on screen:
      // four-sided-display/bargain-bin all bake
      // `localX = (col - centre) * pitch`, and world +localX is the viewer's
      // right on every face — so stepping LEFT means DECREMENTING col.
      // (This used to be inverted: the comment claimed every fixture ran
      // right-to-left, but four-sided-display was flipped to reading order
      // and the nav was never flipped with it, so left/right came out
      // backwards on the floor collection displays.) game-section keeps its
      // own branch below — its per-face colZ still runs the other way.
      if (scene.selectedFixtureId?.startsWith('game-section')) {
        if (scene.selectedCol < scene.colsCount - 1) {
          scene.selectedCol++;
          scene.updateCameraTarget();
        } else {
          // Walk left around the gondola's end cap: the other face's far
          // column sits at this same end of the run. Single-sided units
          // (faces:'front', the 2×2 department rows) have no stock there —
          // clamp at the end instead of wrapping to an empty face.
          const fixture = scene.slottedFixtures.find(f => f.placement.id === scene.selectedFixtureId);
          const toSide = scene.selectedSide === 'front' ? 'back' : 'front';
          if (fixture?.getSlots().some(sl => sl.side === toSide)) {
            scene.selectedSide = toSide;
            scene.selectedCol = 0;
            scene.updateCameraTarget();
          }
        }
      } else {
        if (scene.selectedCol > 0) {
          scene.selectedCol--;
          scene.updateCameraTarget();
        } else {
          // Genre endcaps have one face; their edge columns step back onto
          // the browse snake instead of rotating to an empty side.
          const fixture = scene.slottedFixtures.find(f => f.placement.id === scene.selectedFixtureId);
          if (isEndcapKind(fixture?.placement.kind)) {
            exitGenreEndcapToShelf(scene, fixture!, 'prevBack');
            return;
          }
          // Step around the corner to the face on the viewer's left; you
          // arrive at that face's screen-RIGHT end, which is its LAST col.
          if (scene.selectedSide === 'front') scene.selectedSide = 'left';
          else if (scene.selectedSide === 'left') scene.selectedSide = 'back';
          else if (scene.selectedSide === 'back') scene.selectedSide = 'right';
          else if (scene.selectedSide === 'right') scene.selectedSide = 'front';
          scene.selectedCol = scene.colsCount - 1;
          scene.updateCameraTarget();
        }
      }
    } else if (scene.selectedUnitIdx === BACK_WALL_UNIT_IDX) {
      // (#44 — simplified by the left-wall flip) The New Releases ribbon
      // now ascends toward the viewer's RIGHT on every run: the left-wall
      // unit runs front -> back (screen-right when facing the left wall) and
      // hands off to the back wall's left -> right runs at the corner. So
      // Left is simply col--, clamped at the ribbon's start — it never
      // wraps into a library (#45).
      if (scene.selectedCol > 0) {
        scene.selectedCol--;
        scene.updateCameraTarget();
      }
    } else if (scene.selectedSide === 'front') {
      if (scene.selectedCol > 0) {
        scene.selectedCol--;
        scene.updateCameraTarget();
      } else {
        const libUnits = scene.shelvingUnits.filter(u => u.libraryIdx === scene.selectedLibraryIdx);
        const currentUnit = libUnits[scene.selectedUnitIdx];
        // Screen-left neighbor: units are numbered in screen order, so it's
        // always the previous unit.
        const prevUnit = libUnits[scene.selectedUnitIdx - 1];

        // Check if there is a previous unit on the same line/run
        if (prevUnit && prevUnit.lineId === currentUnit.lineId) {
          // Transition to the front side of the previous unit in the same line/row
          scene.selectedUnitIdx = prevUnit.unitIdxInLibrary;
          scene.selectedSide = 'front';
          scene.updateColsCount();
          scene.selectedCol = scene.colsCount - 1;
          scene.cameraWindowMinCol = Math.max(0, scene.colsCount - BROWSE_WINDOW_SIZE);
          scene.updateCameraTarget();
        } else {
          // We reached the beginning of the front side of this line/row.
          // A genre endcap at this run's entrance end joins the path here:
          // walking off the shelf end steps onto it, and crossing it
          // continues to where this edge always led (see
          // exitGenreEndcapToShelf).
          const mouthCap = genreEndcapForLine(scene, currentUnit.lineId);
          if (mouthCap) {
            enterGenreEndcapFromShelf(scene, mouthCap, 'left');
            return;
          }
          // If there is a previous line/row in the library:
          // Transition to the end of the back side of the previous line/row.
          // The back face reads its units in REVERSE index order, so the
          // reading end is the line's FIRST unit, at its last (screen-right)
          // column.
          const prevLineUnits = libUnits.filter(u => u.lineId !== currentUnit.lineId && u.unitIdxInLibrary < currentUnit.unitIdxInLibrary);
          if (prevLineUnits.length > 0) {
            const prevLineId = prevLineUnits[prevLineUnits.length - 1].lineId;
            const prevLineFirstUnit = scene.lineStartUnit(libUnits, prevLineId);

            scene.selectedUnitIdx = prevLineFirstUnit.unitIdxInLibrary;
            scene.selectedSide = 'back';
            scene.updateColsCount();
            scene.selectedCol = scene.colsCount - 1;
            scene.cameraWindowMinCol = Math.max(0, scene.colsCount - BROWSE_WINDOW_SIZE);
            scene.updateCameraTarget();
          }
          // If there is no previous line/row, we are at the very beginning of
          // browsing (Unit 0 Front, col 0) -> do nothing. (#45: the library
          // is a closed loop — no wrap into New Releases or other libraries.)
        }
      }
    } else {
      // Back side: col 0 is screen-left here too (aisleColZ mirrors the
      // back face), so Left decrements col exactly like the front side.
      if (scene.selectedCol > 0) {
        scene.selectedCol--;
        scene.updateCameraTarget();
      } else {
        // We are at col 0 of the current unit (its screen-left edge)
        const libUnits = scene.shelvingUnits.filter(u => u.libraryIdx === scene.selectedLibraryIdx);
        const currentUnit = libUnits[scene.selectedUnitIdx];
        // On the back face DEEPER units are screen-left, so the screen-left
        // neighbor is the NEXT unit (entered at its screen-right end).
        const nextUnit = libUnits[scene.selectedUnitIdx + 1];

        // Check if there is a next unit on the same line/run
        if (nextUnit && nextUnit.lineId === currentUnit.lineId) {
          scene.selectedUnitIdx = nextUnit.unitIdxInLibrary;
          scene.selectedSide = 'back';
          scene.updateColsCount();
          scene.selectedCol = scene.colsCount - 1;
          scene.cameraWindowMinCol = Math.max(0, scene.colsCount - BROWSE_WINDOW_SIZE);
          scene.updateCameraTarget();
        } else {
          // Screen-left edge of the line's back face (its deep-end unit):
          // wrap around the end cap to the front side of this same unit.
          scene.selectedSide = 'front';
          scene.updateColsCount();
          scene.selectedCol = scene.colsCount - 1;
          scene.cameraWindowMinCol = Math.max(0, scene.colsCount - BROWSE_WINDOW_SIZE);
          scene.updateCameraTarget();
        }
      }
    }
  } else if (scene.mode === 'inspect') {
    if (scene.getSelectedMovie()?.isSeries) {
      scene.rotateHeroFace(-1);
    } else {
      scene.toggleFlip();
    }
  }
}

export function moveRightInternal(scene: StoreScene) {
  if (scene.mode === 'library-select') {
    scene.moveLibrarySelectDirectional('x', 1);
  } else if (scene.mode === 'person-endcap') {
    scene.moveEndcapSelection(1, 0);
  } else if (scene.mode === 'browse') {
    if (scene.selectedUnitSource === 'fixture') {
      // (#44) Fixture columns are laid out RIGHT-to-LEFT on screen (see
      // moveLeftInternal), so stepping to the viewer's RIGHT means
      // DECREMENTING col.
      if (scene.selectedFixtureId?.startsWith('game-section')) {
        if (scene.selectedCol > 0) {
          scene.selectedCol--;
          scene.updateCameraTarget();
        } else {
          // Walk right around the gondola's end cap: the other face's far
          // column sits at this same end of the run. Single-sided units
          // clamp here instead of wrapping to an empty face (see moveLeft).
          const fixture = scene.slottedFixtures.find(f => f.placement.id === scene.selectedFixtureId);
          const toSide = scene.selectedSide === 'front' ? 'back' : 'front';
          if (fixture?.getSlots().some(sl => sl.side === toSide)) {
            scene.selectedSide = toSide;
            scene.selectedCol = scene.colsCount - 1;
            scene.updateCameraTarget();
          }
        }
      } else {
        if (scene.selectedCol < scene.colsCount - 1) {
          scene.selectedCol++;
          scene.updateCameraTarget();
        } else {
          // Genre endcaps: edge columns exit to the browse snake (see
          // moveLeftInternal's mirror branch).
          const fixture = scene.slottedFixtures.find(f => f.placement.id === scene.selectedFixtureId);
          if (isEndcapKind(fixture?.placement.kind)) {
            exitGenreEndcapToShelf(scene, fixture!, 'lineFront');
            return;
          }
          // Step around the corner to the face on the viewer's right; you
          // arrive at that face's screen-LEFT end, which is col 0.
          if (scene.selectedSide === 'front') scene.selectedSide = 'right';
          else if (scene.selectedSide === 'right') scene.selectedSide = 'back';
          else if (scene.selectedSide === 'back') scene.selectedSide = 'left';
          else if (scene.selectedSide === 'left') scene.selectedSide = 'front';
          scene.selectedCol = 0;
          scene.updateCameraTarget();
        }
      }
    } else if (scene.selectedUnitIdx === BACK_WALL_UNIT_IDX) {
      // (#44/#45 — simplified by the left-wall flip) The ribbon ascends
      // toward the viewer's RIGHT on every run, so Right is simply col++,
      // clamped at the ribbon's end (no library wrap).
      if (scene.selectedCol < scene.colsCount - 1) {
        scene.selectedCol++;
        scene.updateCameraTarget();
      }
    } else if (scene.selectedSide === 'front') {
      if (scene.selectedCol < scene.colsCount - 1) {
        scene.selectedCol++;
        scene.updateCameraTarget();
      } else {
        const libUnits = scene.shelvingUnits.filter(u => u.libraryIdx === scene.selectedLibraryIdx);
        const currentUnit = libUnits[scene.selectedUnitIdx];
        // Screen-right neighbor: units are numbered in screen order, so it's
        // always the next unit.
        const nextUnit = libUnits[scene.selectedUnitIdx + 1];

        // Check if there is a next unit on the same line/run
        if (nextUnit && nextUnit.lineId === currentUnit.lineId) {
          // Transition to the front side of the next unit in the same row/line
          scene.selectedUnitIdx = nextUnit.unitIdxInLibrary;
          scene.selectedSide = 'front';
          scene.selectedCol = 0;
          scene.cameraWindowMinCol = 0;
          scene.updateColsCount();
          scene.updateCameraTarget();
        } else {
          // We reached the end of the front side of this line/row.
          // Wrap to the back side of this same line/row if it holds any
          // movies: content flows in walk order, so this line's back starts
          // at the entry block right after this unit's front block.
          const backBlock = scene.plan.blockIndexOf(scene.selectedLibraryIdx, currentUnit.unitIdxInLibrary, 'back');
          const matching = scene.getLayoutEntries();

          if (matching.slice(backBlock * UNIT_SIDE_CAPACITY, (backBlock + 1) * UNIT_SIDE_CAPACITY).some(Boolean)) {
            // Wrap around the deep end cap to the back side of this same
            // unit. The back face reads left-to-right starting HERE: this
            // deep-end unit is its screen-left-most, at col 0.
            scene.selectedSide = 'back';
            scene.selectedUnitIdx = currentUnit.unitIdxInLibrary;
            scene.updateColsCount();
            scene.selectedCol = 0;
            scene.cameraWindowMinCol = 0;
            scene.updateCameraTarget();
          } else {
            // No movies on this line's back side, transition to the next line/row
            const nextLineUnit = libUnits.find(u => u.lineId !== currentUnit.lineId && u.unitIdxInLibrary > currentUnit.unitIdxInLibrary);
            if (nextLineUnit) {
              // Transition to the front side of the next line's screen-order start unit
              scene.selectedUnitIdx = scene.lineStartUnit(libUnits, nextLineUnit.lineId).unitIdxInLibrary;
              scene.selectedSide = 'front';
              scene.selectedCol = 0;
              scene.cameraWindowMinCol = 0;
              scene.updateColsCount();
              scene.updateCameraTarget();
            }
            // else: end of the library (#45) — clamp; never wrap onto the
            // New Releases wall or into another library.
          }
        }
      }
    } else {
      // Back side: col ascends to screen-right here too (aisleColZ mirrors
      // the back face), so Right increments col exactly like the front side.
      if (scene.selectedCol < scene.colsCount - 1) {
        scene.selectedCol++;
        scene.updateCameraTarget();
      } else {
        // We are at the unit's last col (its screen-right edge)
        const libUnits = scene.shelvingUnits.filter(u => u.libraryIdx === scene.selectedLibraryIdx);
        const currentUnit = libUnits[scene.selectedUnitIdx];
        // On the back face SHALLOWER units are screen-right, so the
        // screen-right neighbor is the PREVIOUS unit (entered at col 0).
        const prevUnit = libUnits[scene.selectedUnitIdx - 1];

        // Check if there is a previous unit on the same line/run
        if (prevUnit && prevUnit.lineId === currentUnit.lineId) {
          scene.selectedUnitIdx = prevUnit.unitIdxInLibrary;
          scene.selectedSide = 'back';
          scene.updateColsCount();
          scene.selectedCol = 0;
          scene.cameraWindowMinCol = 0;
          scene.updateCameraTarget();
        } else {
          // Finished the back face at its screen-right (entrance) end — the
          // end of this line's reading order. Continue on the next line's
          // front side if the library has one — via the NEXT line's genre
          // endcap when it has one (that endcap is inserted in this exact
          // edge; see exitGenreEndcapToShelf).
          const nextLineUnit = libUnits.find(u => u.lineId !== currentUnit.lineId && u.unitIdxInLibrary > currentUnit.unitIdxInLibrary);
          if (nextLineUnit) {
            const mouthCap = genreEndcapForLine(scene, nextLineUnit.lineId);
            if (mouthCap) {
              enterGenreEndcapFromShelf(scene, mouthCap, 'right');
              return;
            }
            // Transition to the front side of the next line's screen-order start unit
            scene.selectedUnitIdx = scene.lineStartUnit(libUnits, nextLineUnit.lineId).unitIdxInLibrary;
            scene.selectedSide = 'front';
            scene.selectedCol = 0;
            scene.cameraWindowMinCol = 0;
            scene.updateColsCount();
            scene.updateCameraTarget();
          }
          // else: end of the library (#45) — clamp; never wrap onto the
          // New Releases wall or into another library.
        }
      }
    }
  } else if (scene.mode === 'inspect') {
    if (scene.getSelectedMovie()?.isSeries) {
      scene.rotateHeroFace(1);
    } else {
      scene.toggleFlip();
    }
  }
}

export function moveUp(scene: StoreScene) {
  scene.requestRender();
  if (tvPeekActive(scene)) return;   // peeking at a TV — ▲ has nowhere left to go
  if (subNavUp(scene)) return;       // jump index: row 2 -> row 1 -> close
  if (scene.mode === 'backroom') return; // couch view — no vertical nav
  if (scene.mode === 'overview') {
    scene.overviewLook(0, 1);
    return;
  }
  if (scene.mode === 'library-select') {
    // Up = deeper into the view along the camera's forward axis.
    scene.moveLibrarySelectDirectional('z', 1);
  } else if (scene.mode === 'person-endcap') {
    scene.moveEndcapSelection(0, -1);
  } else if (scene.mode === 'browse') {
    if (scene.selectedShelf < scene.browseMaxShelf()) {
      scene.selectedShelf++;
      scene.updateCameraTarget();
    } else if (!scene.claspCursorActive && scene.enterClaspCursor()) {
      // One stop above the top row: the recommendation clasp on this run's
      // lip. Reachable from the remote, which is the only input some of this
      // app's users have.
    } else {
      // Already past the top row (after the clasp stop, or straight off the
      // top row where this run has no clasp): look UP at the nearest ceiling
      // TV to see what's playing — see store-tv-peek.ts. Where the build has
      // no ambient TVs at all, this press keeps its old job and continues
      // "over the top" of the aisle to the opposite face.
      scene.exitClaspCursor();
      if (!enterTvPeek(scene)) scene.wrapOverShelfTop();
    }
  } else if (scene.mode === 'inspect') {
    if (scene.moveSeriesSeasonSelection(-1)) return;
    if (scene.moveSeriesEpisodeSelection(-1)) return;
    if (scene.isFlipped) {
      const movie = scene.getSelectedMovie();
      const regions = movie ? (backCoverRegions.get(movie.id) || []) : [];
      if (regions.length > 0) {
        if (scene.selectedBackCoverRegionIdx > 0) {
          scene.selectedBackCoverRegionIdx--;
        } else {
          scene.selectedBackCoverRegionIdx = regions.length - 1;
        }
        scene.updateBackCoverHighlight();
      }
    } else if (!scene.getSelectedMovie()?.isSeries) {
      scene.toggleFlip();
    }
  }
}

export function browseMaxShelf(scene: StoreScene): number {
  if (scene.selectedUnitSource === 'fixture') {
    const f = scene.slottedFixtures.find(fx => fx.placement.id === scene.selectedFixtureId);
    if (f) return f.shelfHeights.length - 1;
  }
  return scene.selectedUnitIdx === BACK_WALL_UNIT_IDX
    ? WALL_SHELF_HEIGHTS.length - 1
    : AISLE_SHELF_HEIGHTS.length - 1;
}

export function wrapOverShelfTop(scene: StoreScene) {
  if (scene.selectedUnitIdx === BACK_WALL_UNIT_IDX) return; // wall ribbon — clamp
  const across = { front: 'back', back: 'front', left: 'right', right: 'left' } as const;
  if (scene.selectedUnitSource === 'fixture') {
    const fixture = scene.slottedFixtures.find(f => f.placement.id === scene.selectedFixtureId);
    if (!fixture) return;
    const toSide = across[scene.selectedSide];
    // Gondola/display fixtures: the far side is straight across. Only wrap
    // onto a face that actually holds cases (game-section gondolas stock
    // front/back only; a sparse display can leave a face empty).
    if (!fixture.getSlots().some(s => s.side === toSide)) return;
    const mirrored = scene.colsCount - 1 - scene.selectedCol;
    scene.selectedSide = toSide;
    scene.updateColsCount();
    scene.selectedCol = Math.max(0, Math.min(scene.colsCount - 1, mirrored));
    scene.cameraGlideLerp = TOP_WRAP_GLIDE_LERP;
    scene.updateCameraTarget();
    return;
  }
  const unit = scene.shelvingUnits.filter(u => u.libraryIdx === scene.selectedLibraryIdx)[scene.selectedUnitIdx];
  if (!unit) return;
  const toSide = scene.selectedSide === 'back' ? 'front' : 'back';
  // Occupancy test copied from the end-of-run wrap: no movies on the far
  // face (wall-lined runs, layout tails) means no wrap.
  const block = scene.plan.blockIndexOf(scene.selectedLibraryIdx, scene.selectedUnitIdx, toSide);
  const sideEntries = scene.getLayoutEntries().slice(block * UNIT_SIDE_CAPACITY, (block + 1) * UNIT_SIDE_CAPACITY);
  if (!sideEntries.some(Boolean)) return;
  // aisleColZ mirrors the two faces across the unit's geometric span (effCol
  // = unit.cols-1-col on exactly one side), so the slot physically behind
  // col c is unit.cols-1-c; clamp when the far face holds fewer columns.
  const mirrored = unit.cols - 1 - scene.selectedCol;
  scene.selectedSide = toSide;
  scene.updateColsCount();
  scene.selectedCol = Math.max(0, Math.min(scene.colsCount - 1, mirrored));
  scene.cameraWindowMinCol = Math.max(0, Math.min(scene.selectedCol, scene.colsCount - BROWSE_WINDOW_SIZE));
  scene.cameraGlideLerp = TOP_WRAP_GLIDE_LERP;
  scene.updateCameraTarget();
}

// ─── Browse-overlay dispatch (TV peek + sub-nav index) ───────────────────────
// The two browse overlays keep scene.mode at 'browse' and instead intercept
// the arrow/select/back path, exactly the way the clasp cursor does. These
// three are what three-scene.ts's moveLeft/moveRight/selectAction/backAction
// call first; ▲/▼ are intercepted inside moveUp/moveDown above.

/** ←/→ while an overlay owns them. Returns true when the press was consumed. */
export function navOverlayArrow(scene: StoreScene, dir: number): boolean {
  scene.requestRender();
  return tvPeekCycle(scene, dir) || subNavArrow(scene, dir);
}

/** Select while an overlay owns it: a TV peek jumps to what's playing. */
export function navOverlaySelect(scene: StoreScene): boolean {
  if (tvPeekActive(scene)) return tvPeekSelect(scene);
  return subNavSelect(scene);
}

/**
 * Back while an overlay owns it. Both overlays close back into browse, so the
 * escape clamp is untouched: browse remains backAction's floor and this only
 * ever swallows the press that closes the overlay.
 */
export function navOverlayBack(scene: StoreScene): boolean {
  return exitTvPeek(scene) || subNavBack(scene);
}

/** Scene teardown/rebuild: forget both overlays (no camera writes). */
export function navOverlayForget(scene: StoreScene): void {
  forgetTvPeek(scene);
  forgetSubNav(scene);
}

/** Harness probe for the tvpeek / subnav checkpoints. */
export function debugNavOverlay(scene: StoreScene) {
  return { peek: debugTvPeek(scene), subnav: debugSubNav(scene) };
}

/** True while the jump index is up (main.ts fades the browse HUD under it). */
export function isSubNavOpen(scene: StoreScene): boolean {
  return subNavActive(scene);
}

export function moveSeriesEpisodeSelection(scene: StoreScene, dir: number): boolean {
  const movie = scene.getSelectedMovie();
  if (scene.mode !== 'inspect' || !movie?.isSeries) return false;
  // Only the back-cover selector (face 2) scrolls episodes with up/down; the
  // side panels no longer carry an episode list.
  if (scene.heroFace !== 2) return false;
  const episodes = scene.heroEpisodes;
  if (episodes && episodes.length > 0) {
    scene.heroEpisodeIdx = (scene.heroEpisodeIdx + dir + episodes.length) % episodes.length;
    scene.refreshSeriesPanels(movie);
    retailAudio.playKeyClick();
  }
  return true;
}

export function moveSeriesSeasonSelection(scene: StoreScene, dir: number): boolean {
  const movie = scene.getSelectedMovie();
  if (scene.mode !== 'inspect' || !movie?.isSeries) return false;
  if (scene.heroFace !== 3) return false;
  const episodes = scene.heroEpisodes;
  if (episodes && episodes.length > 0) {
    const seasons = [...new Set(episodes.map((e) => e.seasonNumber))].sort((a, b) => a - b);
    if (seasons.length > 0) {
      const curSeason = episodes[scene.heroEpisodeIdx]?.seasonNumber;
      const curPos = Math.max(0, seasons.indexOf(curSeason));
      const nextSeason = seasons[(curPos + dir + seasons.length) % seasons.length];
      const firstIdx = episodes.findIndex((e) => e.seasonNumber === nextSeason);
      if (firstIdx >= 0) scene.heroEpisodeIdx = firstIdx;
      scene.refreshSeriesPanels(movie);
      retailAudio.playKeyClick();
    }
  }
  return true;
}

export function moveDown(scene: StoreScene) {
  scene.requestRender();
  if (tvPeekActive(scene)) { exitTvPeek(scene); return; } // ▼ drops back onto the shelf
  if (subNavDown(scene)) return;                          // jump index: row 1 -> row 2
  if (scene.mode === 'backroom') return; // couch view — no vertical nav
  if (scene.mode === 'overview') {
    scene.overviewLook(0, -1);
    return;
  }
  if (scene.mode === 'library-select') {
    // Down = toward the camera along the forward axis.
    scene.moveLibrarySelectDirectional('z', -1);
  } else if (scene.mode === 'person-endcap') {
    scene.moveEndcapSelection(0, 1);
  } else if (scene.mode === 'browse') {
    if (scene.claspCursorActive) {
      scene.exitClaspCursor(); // back down onto the top row of cases
    } else if (scene.selectedShelf > 0) {
      scene.selectedShelf--;
      scene.updateCameraTarget();
    } else {
      // Bottom row: ▼ opens the sub-nav jump index (store-subnav.ts) rather
      // than dying against the floor.
      openSubNav(scene);
    }
  } else if (scene.mode === 'inspect') {
    if (scene.moveSeriesSeasonSelection(1)) return;
    if (scene.moveSeriesEpisodeSelection(1)) return;
    if (scene.isFlipped) {
      const movie = scene.getSelectedMovie();
      const regions = movie ? (backCoverRegions.get(movie.id) || []) : [];
      if (regions.length > 0) {
        if (scene.selectedBackCoverRegionIdx < regions.length - 1) {
          scene.selectedBackCoverRegionIdx++;
        } else {
          scene.selectedBackCoverRegionIdx = 0;
        }
        scene.updateBackCoverHighlight();
      }
    } else if (!scene.getSelectedMovie()?.isSeries) {
      scene.toggleFlip();
    }
  }
}
