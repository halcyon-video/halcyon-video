// Shared browse-cursor plumbing: snapshot/restore of the exact cursor+camera
// state, and the "land the cursor HERE" primitives.
//
// Two callers need the same landings, so they live here rather than being
// duplicated or reached through a circular import: store-nav.ts (walking off a
// run's entrance column onto its endcap) and store-subnav.ts (the ▼ jump index
// firing the same landings from a menu). Nothing in this module runs per
// frame — every function is a keypress-time state write.
import * as THREE from 'three';
import { BROWSE_WINDOW_SIZE, AISLE_SHELF_HEIGHTS, SECTION_COLS } from './store-layout';
import type { StoreScene } from './three-scene';

type SceneFixture = StoreScene['slottedFixtures'][number];

export interface BrowseReturn {
  mode: StoreScene['mode'];
  libraryIdx: number;
  unitSource: StoreScene['selectedUnitSource'];
  fixtureId: string | null;
  unitIdx: number;
  side: StoreScene['selectedSide'];
  shelf: number;
  col: number;
  windowMinCol: number;
  camPos: THREE.Vector3;
  lookAt: THREE.Vector3;
}

/** Snapshot the live browse cursor + camera targets (2 vectors, on open only). */
export function captureBrowseReturn(scene: StoreScene): BrowseReturn {
  return {
    mode: scene.mode,
    libraryIdx: scene.selectedLibraryIdx,
    unitSource: scene.selectedUnitSource,
    fixtureId: scene.selectedFixtureId,
    unitIdx: scene.selectedUnitIdx,
    side: scene.selectedSide,
    shelf: scene.selectedShelf,
    col: scene.selectedCol,
    windowMinCol: scene.cameraWindowMinCol,
    camPos: scene.targetCameraPos.clone(),
    lookAt: scene.targetLookAt.clone(),
  };
}

/**
 * Put the cursor back exactly where it was and glide the camera home.
 * updateCameraTarget() re-derives the framing from the restored indices; the
 * saved vectors are then copied over the result so the pose is identical even
 * where the framing depends on state we didn't capture.
 */
export function restoreBrowseReturn(scene: StoreScene, r: BrowseReturn, glideLerp?: number): void {
  scene.mode = r.mode;
  scene.selectedLibraryIdx = r.libraryIdx;
  scene.selectedUnitSource = r.unitSource;
  scene.selectedFixtureId = r.fixtureId;
  scene.selectedUnitIdx = r.unitIdx;
  scene.selectedSide = r.side;
  scene.selectedShelf = r.shelf;
  scene.selectedCol = r.col;
  scene.updateColsCount();
  scene.updateCameraTarget();
  scene.cameraWindowMinCol = r.windowMinCol; // updateCameraTarget re-slides the window
  scene.targetCameraPos.copy(r.camPos);
  scene.targetLookAt.copy(r.lookAt);
  if (glideLerp !== undefined) scene.cameraGlideLerp = glideLerp;
  if (scene.onSelectionChange) scene.onSelectionChange(scene.getSelectedMovie());
  scene.requestRender();
}

/**
 * Step onto a genre/collection endcap (user request: endcaps are browsed by
 * walking off the shelf end, not selected on their own). The endcap is spliced
 * into the reading order as three extra columns between the previous line's
 * back face and this line's front face, so a Left entry lands on its last
 * (screen-right) column and a Right entry on column 0 — the same key keeps
 * walking across it. State mirrors the overview's fixture entry (pseudo
 * library index — artwork loading keys off it).
 */
export function enterEndcapCursor(scene: StoreScene, fixture: SceneFixture, entryDir: 'left' | 'right'): void {
  const fixtureIdx = scene.slottedFixtures.indexOf(fixture);
  if (fixtureIdx < 0) return;
  scene.selectedUnitSource = 'fixture';
  scene.selectedFixtureId = fixture.placement.id;
  scene.selectedLibraryIdx = scene.libraries.length + 1 + fixtureIdx;
  scene.selectedUnitIdx = -1;
  scene.selectedSide = 'front';
  scene.selectedShelf = Math.min(2, fixture.shelfHeights.length - 1);
  scene.updateColsCount();
  scene.selectedCol = entryDir === 'left' ? scene.colsCount - 1 : 0;
  scene.cameraWindowMinCol = 0;
  if (scene.onGenreMenuUpdate) scene.onGenreMenuUpdate('', [], 0, false);
  scene.updateCameraTarget();
  scene.loadAllArtworkForActiveLibrary();
  if (scene.onSelectionChange) scene.onSelectionChange(scene.getSelectedMovie());
}

/**
 * Browse a floor fixture (collection display, bargain bin, promo stand …) —
 * the same landing state the overview's fixture cursor builds, minus the trip
 * through library-select. Returns false when the fixture holds no stock.
 */
export function enterFixtureCursor(scene: StoreScene, fixtureIdx: number): boolean {
  const fixture = scene.slottedFixtures[fixtureIdx];
  if (!fixture || fixture.getSlots().length === 0) return false;
  scene.mode = 'browse';
  scene.selectedUnitSource = 'fixture';
  scene.selectedFixtureId = fixture.placement.id;
  scene.selectedLibraryIdx = scene.libraries.length + 1 + fixtureIdx;
  scene.selectedUnitIdx = -1;
  scene.selectedSide = 'front';
  // Top-ish row, clamped to what this fixture actually has (the bargain bin
  // has only 2 — a bare `2` would select a slot key that doesn't exist).
  scene.selectedShelf = Math.min(2, fixture.shelfHeights.length - 1);
  scene.selectedCol = 0;
  scene.cameraWindowMinCol = 0;
  scene.updateColsCount();
  if (scene.onModeChange) scene.onModeChange(scene.mode);
  if (scene.onGenreMenuUpdate) scene.onGenreMenuUpdate('', [], 0, false);
  scene.updateCameraTarget();
  scene.loadAllArtworkForActiveLibrary();
  if (scene.onSelectionChange) scene.onSelectionChange(scene.getSelectedMovie());
  return true;
}

/**
 * Browse an aisle run at a given unit/side/column — the shelf landing the
 * overview's section cursors use. Category sections are padded to whole
 * signboard sections, so the section-start cell can be an empty padding slot:
 * hunt forward within the section for a stocked one.
 */
export function enterShelfCursor(
  scene: StoreScene,
  libraryIdx: number,
  unitIdxInLibrary: number,
  side: 'front' | 'back',
  col: number,
): void {
  scene.mode = 'browse';
  scene.selectedLibraryIdx = libraryIdx;
  scene.selectedUnitSource = 'shelving';
  scene.selectedFixtureId = null;
  scene.selectedUnitIdx = unitIdxInLibrary;
  scene.selectedSide = side;
  scene.selectedShelf = AISLE_SHELF_HEIGHTS.length - 1;
  scene.selectedCol = col;
  scene.updateColsCount();
  for (let c = col; c < Math.min(col + SECTION_COLS, scene.colsCount); c++) {
    if (scene.slotsByPosition.has(`${libraryIdx}_${unitIdxInLibrary}_${side}_${scene.selectedShelf}_${c}`)) {
      scene.selectedCol = c;
      break;
    }
  }
  scene.cameraWindowMinCol = Math.max(0, Math.min(scene.selectedCol, scene.colsCount - BROWSE_WINDOW_SIZE));
  if (scene.onModeChange) scene.onModeChange(scene.mode);
  if (scene.onGenreMenuUpdate) scene.onGenreMenuUpdate('', [], 0, false);
  scene.updateCameraTarget();
  scene.loadAllArtworkForActiveLibrary();
  if (scene.onSelectionChange) scene.onSelectionChange(scene.getSelectedMovie());
}
