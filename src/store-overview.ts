// The entrance overview — the vantage you stand at when the store is not
// showing you a shelf. Extracted from StoreScene (three-scene.ts keeps
// one-line delegating stubs): the target list (sections, genre placards,
// fixtures, checkout) and entering browse from one of those targets.
//
// NAVIGATION LIVES IN THE JUMP INDEX (store-subnav.ts), not here. Until
// 2026-08-09 this module also ran an arrow-stepped cursor ring with its own
// free-look, so the store booted into one navigation layer and the index —
// the layer that owns ▲ "look up at the store TVs", ▼ "the displays", and a
// named list of every destination — was a press away underneath it. Two
// answers to the same question, and the boot one landed on whichever cursor
// happened to sit nearest the middle of the frame. The ring is gone: entering
// the overview raises the index (showOverviewVisuals), leaving it takes the
// index down (hideOverviewVisuals), and every arrow in this view belongs to
// the index. What survives here is the TARGET list, which is still how a
// query ("browse HORROR", a harness checkpoint, the search box) resolves a
// name to a shelf.
import { OverviewCursors, OverviewCursorTarget, NEW_RELEASES_CURSOR_LIB, CHECKOUT_CURSOR_LIB, FIXTURE_CURSOR_LIB, FLAT_MODE_CURSOR_LIB } from './overview-cursors';
import { BROWSE_WINDOW_SIZE, AISLE_SHELF_HEIGHTS, SECTION_COLS, UNIT_SIDE_CAPACITY, BACK_WALL_UNIT_IDX, SECTION_CAPACITY, sideEntrySlot, ShelvingUnit } from './store-layout';
import { OVERVIEW_POS } from './scene-shared';
import { openSubNav, closeSubNav, forgetSubNav, subNavSelect } from './store-subnav';
import { aimOverviewAt } from './store-camera';
import { isEndcapKind } from './fixtures/genre-endcap';
import { slottedFixtureLabel, qualifyDuplicateLabels } from './fixture-labels';
import type { StoreScene } from './three-scene';

export function buildOverviewCursorTargets(scene: StoreScene): OverviewCursorTarget[] {
  const targets: OverviewCursorTarget[] = [];
  const CURSOR_Y = 6.9; // just above the end caps / section signboards
  for (let libIdx = 0; libIdx < scene.libraries.length; libIdx++) {
    const units = scene.shelvingUnits.filter(u => u.libraryIdx === libIdx);
    if (units.length === 0) continue;
    const layout = scene.plan.layoutFor(libIdx);
    const genreTargets = layout.categorized ? scene.genreCursorTargets(libIdx, units, CURSOR_Y) : [];
    if (genreTargets.length > 0) {
      targets.push(...genreTargets);
      continue;
    }
    let sumX = 0, sumZ = 0;
    units.forEach((u) => {
      sumX += u.xCenter;
      sumZ += scene.aisleZCenter(u);
    });
    targets.push({
      label: (scene.libraries[libIdx].name || 'AISLE').toUpperCase(),
      x: sumX / units.length,
      y: CURSOR_Y,
      z: sumZ / units.length,
      libraryIdx: libIdx,
      unitIdxInLibrary: 0,
      side: 'front',
      col: 0,
    });
  }
  // De-clutter: neighbouring library cursors can overlap when they share a
  // height — step near-coincident ones onto a second tier so both tickets
  // stay readable.
  targets.sort((a, b) => (a.x - b.x) || (a.z - b.z));
  for (let i = 1; i < targets.length; i++) {
    const p = targets[i - 1], c = targets[i];
    const d2 = (c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z);
    if (d2 < 22.0 && Math.abs(c.y - p.y) < 0.1) {
      c.y = p.y >= CURSOR_Y + 1.5 ? CURSOR_Y : p.y + 0.95;
    }
  }
  // The New Releases back wall is a first-class browse destination too.
  // Confirming lands on the first BACK-wall column (the cursor floats over
  // the back wall; the ribbon's cols 0..nrLeftWallCols-1 are on the left
  // wall around the corner).
  targets.push({
    label: 'NEW RELEASES',
    x: 11.0,
    y: 8.6, // the wall shelving is taller than the gondolas
    z: scene.backWallZ + 3.0,
    libraryIdx: NEW_RELEASES_CURSOR_LIB,
    unitIdxInLibrary: BACK_WALL_UNIT_IDX,
    side: 'front',
    col: scene.nrLeftWallCols,
  });
  // Floor fixtures (four-sided collection displays, bargain bins) get a
  // cursor each. They were browsable only from the library-select flat index,
  // which nothing routes to while overviewStart is on — so in the default
  // configuration they had no reachable entry point at all. Cursors float
  // lower than the shelf ones: these fixtures are waist-height islands, so a
  // gondola-height ticket would read as belonging to the run behind them.
  const fixtureTargets: OverviewCursorTarget[] = [];
  scene.slottedFixtures.forEach((f, standIdx) => {
    // Endcaps (genre AND collection) get no standalone cursor (user request):
    // they're browsed by walking off their run's entrance-end column
    // (store-nav flow-through).
    if (isEndcapKind(f.placement.kind)) return;
    fixtureTargets.push({
      label: slottedFixtureLabel(f),
      x: f.placement.position.x,
      y: 5.1,
      z: f.placement.position.z,
      libraryIdx: FIXTURE_CURSOR_LIB,
      unitIdxInLibrary: standIdx,
      side: 'front',
      col: 0,
    });
  });
  // Number the repeats (four game gondolas all call themselves VIDEO GAMES) in
  // left-to-right order, the order the cursor ring steps them in.
  fixtureTargets.sort((a, b) => (a.x - b.x) || (a.z - b.z));
  qualifyDuplicateLabels(fixtureTargets, (t) => scene.slottedFixtures[t.unitIdxInLibrary]);
  targets.push(...fixtureTargets);
  // T22: the front-counter checkout waypoint. Always present (not just in
  // carry mode): the clerk's desk terminal — Left at the counter — is the
  // diegetic settings/power menu, so the counter must stay reachable by
  // arrow keys even empty-handed. Floats just above the counter band's
  // store-facing apex.
  targets.push({
    label: 'CHECKOUT',
    x: 11.0,
    y: 5.4,
    z: scene.deskApexZ() + 0.6,
    libraryIdx: CHECKOUT_CURSOR_LIB,
    unitIdxInLibrary: 0,
    side: 'front',
    col: 0,
  });
  // A top-level browse item mirrored on the CHECKOUT cursor target the user
  // pointed to ("like the checkout itself"): a peer waypoint parked just right
  // of CHECKOUT over the counter, stepped to in the overview and selected to
  // drop into flat/2D mode. Kept angularly distinct from the deep-store fixture
  // cursors so it never fights their focus. (The overview shows only the focused
  // target's label via the shared selection arrow, so it reads on landing.)
  targets.push({
    label: '2D MODE',
    x: 14.5,
    y: 5.4,
    z: scene.deskApexZ() + 0.6,
    libraryIdx: FLAT_MODE_CURSOR_LIB,
    unitIdxInLibrary: 0, side: 'front', col: 0,
  });
  return targets;
}

export function genreCursorTargets(
scene: StoreScene,
  libIdx: number,
  units: ShelvingUnit[],
  cursorY: number,
): OverviewCursorTarget[] {
  const layout = scene.plan.layoutFor(libIdx);
  const blockOrder = scene.plan.entryBlockOrder(libIdx);
  const out: OverviewCursorTarget[] = [];
  const seen = new Set<string>();

  // Walk sections in shelf order so the cursors read left-to-right along the
  // run, and keep only each category's FIRST section (the rest are the same
  // department continuing down the aisle).
  const sectionCount = Math.ceil(layout.entries.length / SECTION_CAPACITY);
  for (let section = 0; section < sectionCount; section++) {
    const cat = layout.sectionLabels.get(String(section));
    if (!cat || seen.has(cat)) continue;
    seen.add(cat);

    const entryIdx = section * SECTION_CAPACITY;
    const blockIdx = Math.floor(entryIdx / UNIT_SIDE_CAPACITY);
    const bo = blockOrder[blockIdx];
    if (!bo) continue;
    const unit = units[bo.unit];
    if (!unit) continue;

    const startIdx = blockIdx * UNIT_SIDE_CAPACITY;
    const entriesForSide = layout.entries.slice(startIdx, startIdx + UNIT_SIDE_CAPACITY);
    const { col } = sideEntrySlot(entriesForSide.length, entryIdx % UNIT_SIDE_CAPACITY);

    // Float the ticket off the browsed face (not the unit's centre) so the
    // front and back runs of one gondola get distinguishable cursors.
    const faceSign = (bo.side === 'front' ? 1 : -1) * unit.browseSign;
    const localX = unit.xCenter + faceSign * 1.35;
    const localZ = scene.aisleColZ(unit, col, bo.side);
    const world = scene.plan.unitToWorld(unit, localX, localZ);

    out.push({
      label: cat,
      x: world.x,
      y: cursorY,
      z: world.z,
      libraryIdx: libIdx,
      unitIdxInLibrary: bo.unit,
      side: bo.side,
      col,
    });
  }
  // Shelf order, not the wall-category display order, so stepping the cursors
  // walks the store rather than teleporting around it.
  return out;
}

export function ensureOverviewCursors(scene: StoreScene): OverviewCursors {
  if (!scene.overviewCursors) {
    scene.overviewCursors = new OverviewCursors(scene.scene, scene.buildOverviewCursorTargets());
    // Cursors are flagged excludeFromSSAO — refresh the AO exclusion scan.
    scene.rebuildSSAOExclusionList();
  }
  return scene.overviewCursors;
}

export function setOverviewCrosshairVisible(scene: StoreScene, v: boolean): void {
  if (v && !scene.overviewCrosshair) {
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:18px;height:18px;border:2px solid rgba(255,255,255,0.45);border-radius:50%;' +
      'box-shadow:0 0 10px rgba(0,0,0,0.35);pointer-events:none;z-index:5;display:none;';
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.8);';
    el.appendChild(dot);
    scene.container.appendChild(el);
    scene.overviewCrosshair = el;
  }
  if (scene.overviewCrosshair) scene.overviewCrosshair.style.display = v ? 'block' : 'none';
}

export function showOverviewVisuals(scene: StoreScene): void {
  // feedback/003: the per-run chevron cloud stays hidden — the single big
  // selection arrow (shared with the seccam view) marks the focused
  // destination. The cursor set is still built: it remains the target list and
  // the confirm path for a QUERY (overviewEnterBrowse('HORROR')).
  scene.ensureOverviewCursors();
  // The jump index IS this view's navigation (see the module header). Raising
  // it here rather than in enterOverview() covers every way the overview comes
  // back up — walking out of walk mode, undocking the search CRT, a settings
  // apply — with one rule instead of one call site each.
  if (scene.mode === 'overview') openSubNav(scene, true);
  scene.updateSelectionArrow();
}

export function hideOverviewVisuals(scene: StoreScene): void {
  // Called on the way OUT of the overview (or while something else takes the
  // camera): drop the index with it, or it would keep owning the arrow keys
  // from under walk mode / the desk CRT / the back room.
  forgetSubNav(scene);
  scene.overviewCursors?.setVisible(false);
  scene.setOverviewCrosshairVisible(false);
  // Called before scene.mode changes on the way out of the overview, so hide
  // the arrow directly rather than re-deriving visibility from the mode.
  if (scene.mode === 'overview' && scene.selectionArrow) scene.selectionArrow.visible = false;
}

/**
 * Point the cursor set at whatever is nearest the current head-look. Only the
 * QUERY path cares about this now (the index owns the focus the player sees),
 * so it declines while the index is up rather than fighting it for the camera.
 */
export function updateOverviewFocus(scene: StoreScene): void {
  if (!scene.overviewCursors || scene.subNav) return;
  const cp = Math.cos(scene.overviewPitch);
  scene._ovForward.set(
    -Math.sin(scene.overviewYaw) * cp,
    Math.sin(scene.overviewPitch),
    -Math.cos(scene.overviewYaw) * cp
  );
  const idx = scene.overviewCursors.pickFocused(OVERVIEW_POS, scene._ovForward);
  scene.applyOverviewFocus(idx);
}

export function applyOverviewFocus(scene: StoreScene, idx: number): void {
  const cursors = scene.ensureOverviewCursors();
  const t = cursors.targets[idx];
  if (!t) return;
  cursors.setFocused(idx);
  aimOverviewAt(scene, t.x, t.y, t.z); // also retargets the camera
  scene.updateSelectionArrow();
  scene.triggerLibrarySelectUpdate(false); // keeps the HUD locator label fresh
}

export function enterOverview(scene: StoreScene): void {
  scene.requestRender();
  if (scene.isWalkAroundMode) scene.toggleWalkAround(); // walk mode owns the camera
  scene.hideHeroCases();
  scene.mode = 'overview';
  scene.isFlipped = false; scene.heroSpine = false;
  scene.isBrowsingNewReleasesDirectly = false;
  scene.overviewYaw = 0;
  scene.overviewPitch = 0;
  scene.showOverviewVisuals(); // raises the jump index and aims the view at it
  scene.updateOverviewFocus(); // no-op while the index is up (see above)
  if (scene.onModeChange) scene.onModeChange(scene.mode);
  if (scene.onGenreMenuUpdate) scene.onGenreMenuUpdate('', [], 0, false);
  scene.updateCameraTarget();
  scene.onConsoleLog(
    '[System] Inside the store — ◄ ► pick a section, ▼ the displays, ▲ the TVs, OK to go.', 'system');
}

export function overviewEnterBrowse(scene: StoreScene, query?: string): boolean {
  if (scene.mode !== 'overview') return false;
  // No name given: "go where the player is pointing" — which is the jump
  // index's focus, the only focus this view shows.
  if (!query && scene.subNav) return subNavSelect(scene);
  if (scene.subNav) closeSubNav(scene, false); // a query overrides it
  const cursors = scene.ensureOverviewCursors();
  let idx = cursors.focusedIdx;
  if (query) {
    const q = query.toLowerCase();
    // Exact label/library-name match first: substring matching alone sent
    // "Movies" to whichever ticket happened to sort first, which after the
    // targets' left-to-right de-clutter sort was "ANIMATED MOVIES".
    idx = cursors.targets.findIndex(t =>
      t.label.toLowerCase() === q ||
      (t.libraryIdx >= 0 && (scene.libraries[t.libraryIdx]?.name || '').toLowerCase() === q));
    if (idx < 0) {
      idx = cursors.targets.findIndex(t =>
        t.label.toLowerCase().includes(q) ||
        (t.libraryIdx >= 0 && (scene.libraries[t.libraryIdx]?.name || '').toLowerCase().includes(q)));
    }
    if (idx < 0) return false;
  }
  if (idx < 0) idx = 0;
  const t = cursors.targets[idx];
  if (!t) return false;
  scene.requestRender();
  scene.hideOverviewVisuals();

  if (t.libraryIdx === FLAT_MODE_CURSOR_LIB) {
    scene.onEnterFlatMode?.();
    return true;
  }

  // T22: the CHECKOUT cursor routes to the counter waypoint, not a shelf.
  if (t.libraryIdx === CHECKOUT_CURSOR_LIB) {
    scene.enterCheckout();
    return true;
  }

  if (t.libraryIdx === NEW_RELEASES_CURSOR_LIB) {
    // Reuse the existing New Releases entry logic wholesale.
    scene.mode = 'library-select';
    scene.selectedLibraryIdx = scene.libraries.length;
    scene.selectAction();
    return true;
  }

  // Floor fixture (collection display / bargain bin): same landing state the
  // library-select confirm builds, minus the trip through library-select.
  if (t.libraryIdx === FIXTURE_CURSOR_LIB) {
    const fixture = scene.slottedFixtures[t.unitIdxInLibrary];
    if (!fixture) return false;
    scene.mode = 'browse';
    scene.selectedUnitSource = 'fixture';
    scene.selectedFixtureId = fixture.placement.id;
    scene.selectedLibraryIdx = scene.libraries.length + 1 + t.unitIdxInLibrary;
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
    scene.onConsoleLog(`[System] Flying to "${t.label}".`, 'system');
    return true;
  }

  scene.mode = 'browse';
  scene.selectedLibraryIdx = t.libraryIdx;
  scene.selectedUnitSource = 'shelving';
  scene.selectedFixtureId = null;
  scene.selectedUnitIdx = t.unitIdxInLibrary;
  scene.selectedSide = t.side;
  scene.selectedShelf = AISLE_SHELF_HEIGHTS.length - 1;
  scene.selectedCol = t.col;
  scene.updateColsCount();
  // Land on a stocked case: category sections are padded to whole signboard
  // sections, so the section-start cell itself can be an empty padding slot.
  for (let c = t.col; c < Math.min(t.col + SECTION_COLS, scene.colsCount); c++) {
    if (scene.slotsByPosition.has(`${t.libraryIdx}_${t.unitIdxInLibrary}_${t.side}_${scene.selectedShelf}_${c}`)) {
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
  scene.onConsoleLog(`[System] Flying to "${t.label}".`, 'system');
  return true;
}

export function setOverviewStart(scene: StoreScene, enabled: boolean): void {
  scene.overviewStart = enabled;
  if (typeof localStorage !== 'undefined') localStorage.setItem('bb_overview_start', enabled ? '1' : '0');
  if (!enabled && scene.mode === 'overview') {
    scene.hideOverviewVisuals();
    scene.mode = 'library-select';
    if (scene.onModeChange) scene.onModeChange(scene.mode);
    scene.updateCameraTarget();
  } else if (enabled && scene.mode === 'library-select') {
    scene.enterOverview();
  }
}
