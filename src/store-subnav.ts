// The JUMP INDEX — the store's ONE navigation layer, and what you are in the
// moment the doors close behind you.
//
// It opened from the BOTTOM SHELF ROW until 2026-08-06, when the owner moved it
// onto the pulled-back "choose where to go" views (a jump menu belongs where
// you are already choosing a destination, not one press off the floor in the
// middle of a run). It became the ROOT itself on 2026-08-09: the entrance
// overview used to boot with its own arrow-stepped cursor ring, so you landed
// in one navigation mode and had to press ▼ to reach the real one — two layers
// answering the same question, with ▲ (look up at the store TVs) live in only
// one of them. The cursor ring is gone; store-overview.ts's showOverviewVisuals
// opens this index as the overview's nav layer, and it stays open for as long
// as that view is up. `root: true` marks that instance: Back does not close it
// (there is nothing underneath), and its focus is remembered across a trip into
// an aisle so backing out returns the marker to where you left it.
//
// Two rows, both driven by ←/→ with ▲/▼ switching between them. There is no
// DOM for this (owner call: the indexes are logical, not chrome) — the
// feedback is the store itself plus the SAME single big floating cursor the
// entrance overview and seccam views use (the gold cone + plaque of
// store-camera.ts updateSelectionArrow, which owns the while-index-open
// branch). One marker over the focused destination, exactly as feedback/003
// settled it — never a cloud of per-target signs.
//
//   Row 1  LIBRARIES & GENRES — the checkout counter, every library, the New
//          Releases wall, and the genre sections that PHYSICALLY exist as
//          shelf sections, all in ONE left-to-right run across the store as
//          seen from the vantage (sortByScreenOrder). ◄ and ► move the marker
//          left and right through the room, never through a list order the
//          room can't show you. Genre → location is resolved through the same
//          StorePlan data the overview's genre cursors use
//          (StoreScene.genreCursorTargets → layout.sectionLabels +
//          entryBlockOrder), so a section is listed only when the plan can
//          name the unit/side/column it starts at. An uncategorized store
//          (no genre placards) simply yields none and the row degrades to
//          libraries — no separate code path. This row is viewed from the
//          entrance overview's vantage; stepping it pans ticket-to-ticket.
//   Row 2  DISPLAYS — every slotted floor fixture: genre endcaps, collection
//          endcaps, promo floor stands, bargain bins, drape tables, game
//          gondolas. Moving the highlight GLIDES the camera to face that
//          fixture, so stepping the row is literally walking the displays.
//
// Opened from browse (not the case today, but the open/close contract is
// unchanged): the cursor is untouched while the index is up, the full return
// state is snapshotted on open, and Back restores it exactly. At the ROOT
// there is no such return — Back declines here and store-nav.ts's
// navOverlayBack hands the press to backAction's own floor clamp.
//
// ▲ from Row 1 no longer closes the index (2026-08-06, pin 051): it opens the
// ceiling-TV peek instead (store-tv-peek.ts) — subNavUp here just declines
// (returns false) at row 0, and store-nav.ts's moveUp, the mediator between
// the two overlay modules, is what actually calls enterTvPeek and falls back
// to the old close-on-▲ only when the build has no ambient TVs to peek at.
// The index itself stays open (untouched) the whole time the peek is up;
// subNavRefresh below is what the peek's exit hands control back to.
//
// Everything here is keypress-driven; nothing runs per frame (the arrow's
// bob is the selection arrow's own animate handling, shared with every other
// mode that shows it).
import {
  BrowseReturn, captureBrowseReturn, restoreBrowseReturn,
  enterEndcapCursor, enterFixtureCursor, enterShelfCursor,
} from './browse-cursor';
import { OVERVIEW_POS } from './scene-shared';
import { aimOverviewAt } from './store-camera';
import { isEndcapKind } from './fixtures/genre-endcap';
import { slottedFixtureLabel, qualifyDuplicateLabels } from './fixture-labels';
import { retailAudio } from './audio';
import type { StoreScene } from './three-scene';
import { counterFrame } from './counter-anchors';

export type SubNavKind = 'library' | 'new-releases' | 'genre' | 'fixture' | 'endcap' | 'checkout'
  | 'flat-mode';

export interface SubNavItem {
  label: string;
  kind: SubNavKind;
  /** Shelf landing (library / new-releases / genre). */
  libraryIdx: number;
  unitIdxInLibrary: number;
  side: 'front' | 'back';
  col: number;
  /** Row 2 only: index into scene.slottedFixtures. */
  fixtureIdx: number;
  /** World anchor: selection-arrow position (both rows) + facing pose (Row 2). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  lookY: number;
}

export interface SubNavState {
  rows: SubNavItem[][];
  row: number;
  sel: number[];
  ret: BrowseReturn;
  /** The store's root nav layer (opened with the entrance overview itself). */
  root: boolean;
}

/** Where the ROOT index's marker was when you last left it (label, per row). */
export interface SubNavFocusMemory { row: number; label: string; }

// Shelf-row markers float at the overview cursor's height (just above the
// signboards); fixture markers hover over their own topper instead — a
// waist-height bin with a gondola-height marker reads as belonging to the
// run behind it.
const SHELF_CURSOR_Y = 6.9;
const FIXTURE_CURSOR_LIFT = 1.7;
const FIXTURE_CURSOR_MIN_Y = 5.1;
// Camera preview while stepping Row 2 (feet). Far enough back to take in a
// whole endcap PLUS the selection arrow + plaque floating over it (at the
// old 7.5 the plaque cropped off the top of the frame), at standing eye
// height. The preview aims above the stock, between fixture top and marker.
const PREVIEW_DIST = 10.5;
const PREVIEW_EYE_Y = 5.6;
const PREVIEW_LOOK_LIFT = 0.9;
// Select on a target with no browsable stock walks in to this distance.
const WALKUP_DIST = 3.4;
const WALKUP_EYE_Y = 5.2;
const SUBNAV_GLIDE_LERP = 0.35;

export function subNavActive(scene: StoreScene): boolean {
  const state = scene.subNav;
  if (!state) return false;
  // The root index belongs to the entrance view and comes down with it
  // (store-overview.ts hideOverviewVisuals). If the mode moved on some other
  // way, it is stale — drop it here rather than let a dead index keep eating
  // the arrow keys in a mode that has its own use for them.
  if (state.root && scene.mode !== 'overview') { forgetSubNav(scene); return false; }
  return true;
}

// ─── Row contents ────────────────────────────────────────────────────────────

function shelfItem(
  label: string, kind: SubNavKind, libraryIdx: number, unitIdxInLibrary: number,
  side: 'front' | 'back', col: number, x: number, y: number, z: number,
): SubNavItem {
  return { label: label.toUpperCase(), kind, libraryIdx, unitIdxInLibrary, side, col, fixtureIdx: -1, x, y, z, yaw: 0, lookY: 3 };
}

/**
 * Put a row in the order the player SEES it: left to right across the store
 * from the entrance vantage.
 *
 * ◄ / ► are a direction in the room, not a step through a list — an index
 * whose rows ran in build order (all the libraries, then the New Releases
 * wall, then every genre section) sent the marker leaping from the far right
 * of the store back to an aisle you already walked past. Ordering by bearing
 * from the vantage is what the entrance overview's own cursor ring did before
 * the index replaced it, and it is the property that makes the marker's travel
 * match the key you pressed. Positive yaw is further LEFT, so left→right is
 * yaw DESCENDING.
 */
function sortByScreenOrder(items: SubNavItem[]): void {
  const p = OVERVIEW_POS;
  const yawOf = (i: SubNavItem) => Math.atan2(-(i.x - p.x), -(i.z - p.z));
  items.sort((a, b) => yawOf(b) - yawOf(a));
}

/**
 * Near-coincident destinations (a library's centre point can sit on one of
 * its own section starts) get a second-tier bump, exactly as the overview's
 * target builder does — stepping between them then visibly hops the arrow
 * instead of only re-lettering its plaque. Mutates y only; order untouched.
 */
function declutter(items: SubNavItem[]): void {
  const byPos = items.slice().sort((a, b) => (a.x - b.x) || (a.z - b.z));
  for (let i = 1; i < byPos.length; i++) {
    const p = byPos[i - 1], c = byPos[i];
    const d2 = (c.x - p.x) * (c.x - p.x) + (c.z - p.z) * (c.z - p.z);
    if (d2 < 22.0 && Math.abs(c.y - p.y) < 0.1) {
      c.y = p.y >= SHELF_CURSOR_Y + 1.5 ? SHELF_CURSOR_Y : p.y + 0.95;
    }
  }
}

/**
 * Row 1: the checkout counter, every library, the New Releases wall and the
 * genre sections — sorted into one left-to-right sweep of the room.
 *
 * The counter is here because it is the one destination that is not stock: it
 * is where you pay, where the clerk stands, and — through Left at the counter —
 * the ONLY way into the manager terminal, i.e. every setting the app has. The
 * index listed every library, genre and display but not the counter, so a
 * player navigating by the index (the whole point of the index) could reach
 * every shelf in the building and never the register or the settings behind
 * it. It used to LEAD the row for that reason; now it simply sits where it
 * stands in the store, which is easier to find, not harder — you point at the
 * counter by looking at the counter.
 */
function buildLibraryRow(scene: StoreScene): SubNavItem[] {
  const out: SubNavItem[] = [];
  const genres: SubNavItem[] = [];
  // Same anchors the overview's CHECKOUT / 2D MODE cursors float on, in the
  // counter's own frame: 0.6 ft in from its customer-facing face, and 3.5 ft
  // along it for the peer entry. Frame-held because the mom-and-pop desk runs
  // down a side wall (GH #116) — `x = 11` names open floor there.
  const cf = counterFrame(scene);
  out.push({
    label: 'CHECKOUT COUNTER',
    kind: 'checkout',
    libraryIdx: -1, unitIdxInLibrary: -1, side: 'front', col: 0, fixtureIdx: -1,
    x: cf.fx + cf.nx * 0.6, y: 5.4, z: cf.fz + cf.nz * 0.6, yaw: 0, lookY: 3.0,
  });
  // 2D MODE rides beside the counter for exactly the reason the counter itself
  // is here: it was reachable ONLY from the entrance overview's arrow layer, so
  // a player navigating by the index could never leave 3D — and on a store
  // rooted at library-select (bb_overview_start=0) that layer is not built at
  // all, leaving the power menu as the sole route. Offered only when a host has
  // wired the handler; the harness and the asset viewer have not, and a dead
  // row entry is worse than no entry.
  if (scene.onEnterFlatMode) {
    out.push({
      label: '2D MODE',
      kind: 'flat-mode',
      libraryIdx: -1, unitIdxInLibrary: -1, side: 'front', col: 0, fixtureIdx: -1,
      // The overview parks its own 2D MODE cursor here, one counter-length
      // step along from CHECKOUT.
      x: cf.fx + cf.nx * 0.6 + cf.ux * 3.5, y: 5.4,
      z: cf.fz + cf.nz * 0.6 + cf.uz * 3.5, yaw: 0, lookY: 3.0,
    });
  }
  for (let libIdx = 0; libIdx < scene.libraries.length; libIdx++) {
    const units = scene.shelvingUnits.filter((u) => u.libraryIdx === libIdx);
    if (units.length === 0) continue;
    // The library ticket floats over the run's averaged centre (the overview's
    // uncategorized-library placement) whether or not genre tickets join it.
    let sumX = 0, sumZ = 0;
    units.forEach((u) => { sumX += u.xCenter; sumZ += scene.aisleZCenter(u); });
    out.push(shelfItem(
      scene.libraries[libIdx].name || 'AISLE', 'library', libIdx, 0, 'front', 0,
      sumX / units.length, SHELF_CURSOR_Y, sumZ / units.length));
    // Genre → shelf location comes from the store plan itself; an
    // uncategorized layout has no section labels and contributes nothing.
    if (!scene.plan.layoutFor(libIdx).categorized) continue;
    for (const t of scene.genreCursorTargets(libIdx, units, SHELF_CURSOR_Y)) {
      genres.push(shelfItem(t.label, 'genre', libIdx, t.unitIdxInLibrary, t.side, t.col, t.x, t.y, t.z));
    }
  }
  // The back wall is a first-class browse destination (same as the overview's
  // NEW RELEASES cursor); it enters through the library-select confirm path.
  if (scene.shelvingUnits.length > 0) {
    out.push(shelfItem(
      'New Releases', 'new-releases', scene.libraries.length, 0, 'front', 0,
      11.0, 8.6, scene.backWallZ + 3.0)); // wall shelving is taller than gondolas
  }
  const row = out.concat(genres);
  sortByScreenOrder(row);
  declutter(row);
  return row;
}

/** Row 2: every slotted floor fixture, in the same left-to-right sweep. */
function buildDisplayRow(scene: StoreScene): SubNavItem[] {
  const out: SubNavItem[] = [];
  scene.slottedFixtures.forEach((f, fixtureIdx) => {
    const p = f.placement;
    const heights = f.shelfHeights;
    // A fixture that declined to build is still in the list but is not on the
    // floor: an era-gated POP kit outside its period, a promo stand whose
    // campaign chain came up empty. Both report no slots AND no footprint —
    // never index a destination that isn't physically there.
    if (f.getSlots().length === 0 && !f.getFootprint?.()) return;
    out.push({
      label: slottedFixtureLabel(f),
      kind: isEndcapKind(p.kind) ? 'endcap' : 'fixture',
      libraryIdx: -1, unitIdxInLibrary: -1, side: 'front', col: 0,
      fixtureIdx,
      x: p.position.x,
      y: Math.max(FIXTURE_CURSOR_MIN_Y, (heights.length > 0 ? heights[heights.length - 1] : 3.4) + FIXTURE_CURSOR_LIFT),
      z: p.position.z,
      yaw: p.yaw,
      lookY: heights.length > 0 ? (heights[0] + heights[heights.length - 1]) / 2 + 0.4 : 3.0,
    });
  });
  // Left to right, like Row 1 (it used to run front-of-store → back, so ►
  // walked you deeper in rather than sideways) — then number any repeated
  // titles in that same stepping order.
  sortByScreenOrder(out);
  qualifyDuplicateLabels(out, (it) => scene.slottedFixtures[it.fixtureIdx]);
  declutter(out);
  return out;
}

// ─── Cursor & camera ─────────────────────────────────────────────────────────

/** Stand off a fixture's front face and look at it. */
function faceFixture(scene: StoreScene, item: SubNavItem, dist: number, eyeY: number): void {
  scene.targetCameraPos.set(item.x + dist * Math.sin(item.yaw), eyeY, item.z + dist * Math.cos(item.yaw));
  scene.targetLookAt.set(item.x, item.lookY, item.z);
  scene.cameraGlideLerp = SUBNAV_GLIDE_LERP;
  scene.requestRender();
}

function previewCurrent(scene: StoreScene, state: SubNavState): void {
  const item = state.rows[state.row][state.sel[state.row]];
  if (!item) return;
  if (state.row === 1) {
    faceFixture(scene, item, PREVIEW_DIST, PREVIEW_EYE_Y);
    scene.targetLookAt.y = item.y + PREVIEW_LOOK_LIFT; // frame marker AND stock
  } else if (scene.mode === 'overview') {
    // At the overview the head-look angles ARE the camera pose, so pan by
    // aiming them (store-camera.ts aimOverviewAt) rather than by writing the
    // targets directly — anything that retargets the camera later then still
    // finds the view pointing at the focused destination.
    aimOverviewAt(scene, item.x, item.y, item.z);
    scene.cameraGlideLerp = SUBNAV_GLIDE_LERP;
    scene.requestRender();
  } else {
    // Opened over some other view (the seccam library-select root): read Row 1
    // from the entrance vantage anyway — that is the viewpoint the
    // arrow-over-the-run framing is designed for (from a browse pose two feet
    // off the shelf the far destinations are unreadable).
    scene.targetCameraPos.copy(OVERVIEW_POS);
    scene.targetLookAt.set(item.x, item.y, item.z);
    scene.cameraGlideLerp = SUBNAV_GLIDE_LERP;
    scene.requestRender();
  }
}

/** Park the arrow on the focused destination and aim the camera at it. */
function applyRow(scene: StoreScene, state: SubNavState): void {
  scene.updateSelectionArrow(); // reads scene.subNav — the while-open branch
  previewCurrent(scene, state);
  // The root index outlives any one trip into an aisle: remember where its
  // marker was so backing out of a shelf puts it back, instead of resetting to
  // the far end of the store every time.
  const item = state.rows[state.row][state.sel[state.row]];
  if (state.root && item) scene.subNavRootFocus = { row: state.row, label: item.label };
}

// ─── Open / close ────────────────────────────────────────────────────────────

/**
 * Open the index. `root` marks the store's own nav layer — the one
 * store-overview.ts raises with the entrance view and never takes down (see
 * the module header). Always handled: the index always has Row 1.
 */
export function openSubNav(scene: StoreScene, root = false): boolean {
  if (scene.subNav) return true;
  const rows = [buildLibraryRow(scene), buildDisplayRow(scene)];
  // Land on the player's FIRST LIBRARY. This is where they are standing when
  // the store finishes loading, so it has to be a place they meant to go — a
  // library of their own, named on the marker, and the same one every time.
  // Not "the first entry in the row", which after the spatial sort is whatever
  // happens to stand at the left edge of the room (a genre placard, the
  // counter), and not the old overview cursor ring's pick, which was whichever
  // marker landed nearest the middle of the frame — routinely a bargain bin.
  const libraryItems = rows[0].filter((i) => i.kind === 'library');
  const firstLibrary = libraryItems.length
    ? rows[0].indexOf(libraryItems.reduce((a, b) => (b.libraryIdx < a.libraryIdx ? b : a)))
    : -1;
  const firstStock = rows[0].findIndex((i) => i.kind !== 'checkout' && i.kind !== 'flat-mode');
  const landing = firstLibrary >= 0 ? firstLibrary : firstStock;
  const state: SubNavState = {
    rows, row: 0, sel: [Math.max(0, landing), 0], ret: captureBrowseReturn(scene), root,
  };
  // Coming back out of an aisle: pick up where the marker was left.
  const mem = root ? scene.subNavRootFocus : null;
  if (mem) {
    const i = rows[mem.row]?.findIndex((it) => it.label === mem.label) ?? -1;
    if (i >= 0) { state.row = mem.row; state.sel[mem.row] = i; }
  }
  scene.subNav = state;
  applyRow(scene, state);
  retailAudio.playKeyClick();
  scene.onConsoleLog(
    `[System] Jump index — ${rows[0].length} counter/libraries/genres, ${rows[1].length} displays.`, 'system');
  scene.requestRender();
  return true;
}

/** Close the index. `restore` puts the browse cursor + camera back exactly. */
export function closeSubNav(scene: StoreScene, restore: boolean): boolean {
  const state = scene.subNav;
  if (!state) return false;
  scene.subNav = null;
  scene.updateSelectionArrow(); // re-derive from mode — hides it in browse
  if (restore) restoreBrowseReturn(scene, state.ret, SUBNAV_GLIDE_LERP);
  scene.requestRender();
  return true;
}

/** Scene teardown / rebuild: drop the index without touching the dead camera. */
export function forgetSubNav(scene: StoreScene): void {
  scene.subNav = null;
  scene.updateSelectionArrow(); // no-op if the arrow is already torn down
}

// ─── Input ───────────────────────────────────────────────────────────────────

/** ←/→ inside the active row (wraps — a remote has no way to "scroll faster"). */
export function subNavArrow(scene: StoreScene, dir: number): boolean {
  const state = subNavActive(scene) ? scene.subNav! : null;
  if (!state) return false;
  const items = state.rows[state.row];
  if (items.length > 0) {
    const n = items.length;
    state.sel[state.row] = (state.sel[state.row] + (dir >= 0 ? 1 : -1) + n) % n;
    applyRow(scene, state);
    retailAudio.playKeyClick();
  }
  scene.requestRender();
  return true;
}

/**
 * ▲: Row 2 → Row 1. Declines (returns false) from Row 1 — store-nav.ts's
 * moveUp then opens the ceiling-TV peek, falling back to the old close-on-▲
 * only where the build has no ambient TVs to peek at.
 */
export function subNavUp(scene: StoreScene): boolean {
  const state = subNavActive(scene) ? scene.subNav! : null;
  if (!state || state.row === 0) return false;
  state.row = 0;
  applyRow(scene, state); // back to the overview vantage, arrow on the row-1 focus
  retailAudio.playKeyClick();
  scene.requestRender();
  return true;
}

/**
 * Re-park the arrow + camera on the current row/selection without changing
 * it — what the ceiling-TV peek (opened from Row 1's own ▲) hands control
 * back to on ▼/Back, since the index stays open (untouched) the whole time
 * the peek is up.
 */
export function subNavRefresh(scene: StoreScene): boolean {
  const state = subNavActive(scene) ? scene.subNav! : null;
  if (!state) return false;
  applyRow(scene, state);
  return true;
}

/** ▼: Row 1 → Row 2 (and swallowed on Row 2 — there is no third row). */
export function subNavDown(scene: StoreScene): boolean {
  const state = subNavActive(scene) ? scene.subNav! : null;
  if (!state) return false;
  // An empty display row (bare test store) is unreachable rather than a
  // cursor-less dead zone the arrows silently rattle around in.
  if (state.row === 0 && state.rows[1].length > 0) {
    state.row = 1;
    applyRow(scene, state);
    retailAudio.playKeyClick();
  }
  scene.requestRender();
  return true;
}

/**
 * Select: jump to the highlighted destination and close.
 *   library / genre / new-releases → browse that shelf run at its first unit
 *                                    (genre: that section's first column)
 *   endcap                         → browse it through its hosting run's
 *                                    entrance column, exactly as walking off
 *                                    the shelf end does (the endcapbrowse flow)
 *   fixture with stock             → browse it (selectedUnitSource 'fixture')
 *   fixture with no stock          → no cursor to give it: walk the camera up
 *                                    close and leave the cursor where it was
 */
export function subNavSelect(scene: StoreScene): boolean {
  const state = subNavActive(scene) ? scene.subNav! : null;
  if (!state) return false;
  const item = state.rows[state.row][state.sel[state.row]];
  if (!item) return subNavBack(scene) || true; // empty row: nothing to confirm
  closeSubNav(scene, false);
  retailAudio.playKeyClick();

  if (item.kind === 'flat-mode') {
    // Hands off to the same power-menu action the overview cursor confirms
    // into; the store is about to be torn down for the flat shell, so there is
    // no camera move to make here.
    scene.onConsoleLog('[System] Switching to 2D mode.', 'system');
    scene.onEnterFlatMode?.();
    return true;
  }

  if (item.kind === 'checkout') {
    // Straight to the register — the same waypoint the overview's CHECKOUT
    // cursor confirms into, and from there Left opens the manager terminal.
    scene.enterCheckout();
    scene.onConsoleLog(`[System] Jumping to "${item.label}".`, 'system');
    scene.requestRender();
    return true;
  }

  if (item.kind === 'new-releases') {
    // Reuse the New Releases entry logic wholesale (the same hop the overview
    // cursor takes). Guarded: library-select must never be left reachable.
    scene.mode = 'library-select';
    scene.selectedLibraryIdx = scene.libraries.length;
    scene.selectAction();
    if ((scene.mode as string) !== 'browse') restoreBrowseReturn(scene, state.ret, SUBNAV_GLIDE_LERP);
  } else if (item.kind === 'endcap') {
    const fixture = scene.slottedFixtures[item.fixtureIdx];
    const opts = fixture?.placement.options ?? {};
    const libIdx = typeof opts.libraryIdx === 'number' ? opts.libraryIdx : -1;
    const lineId = typeof opts.lineId === 'number' ? opts.lineId : -1;
    const host = libIdx >= 0
      ? scene.shelvingUnits.filter((u) => u.libraryIdx === libIdx).find((u) => u.lineId === lineId)
      : undefined;
    if (fixture && host) {
      // Stand at the hosting run's entrance column first, then step onto the
      // cap — the endcap has no standalone cursor of its own.
      enterShelfCursor(scene, libIdx, host.unitIdxInLibrary, 'front', 0);
      enterEndcapCursor(scene, fixture, 'left');
    } else if (fixture) {
      faceFixture(scene, item, WALKUP_DIST, WALKUP_EYE_Y);
    }
  } else if (item.kind === 'fixture') {
    if (!enterFixtureCursor(scene, item.fixtureIdx)) {
      // Nothing browsable on it (a promo stand's faces are signage, an empty
      // fixture has no slots): walk up to it and leave the cursor alone.
      faceFixture(scene, item, WALKUP_DIST, WALKUP_EYE_Y);
      scene.onConsoleLog(`[System] Walked up to "${item.label}".`, 'system');
      return true;
    }
  } else {
    enterShelfCursor(scene, item.libraryIdx, item.unitIdxInLibrary, item.side, item.col);
  }
  scene.cameraGlideLerp = SUBNAV_GLIDE_LERP;
  scene.onConsoleLog(`[System] Jumping to "${item.label}".`, 'system');
  scene.requestRender();
  return true;
}

/**
 * Back closes (and restores) an index opened over something.
 *
 * The ROOT index has nothing under it to restore, and closing it would strand
 * the player in a view with no navigation at all — so there Back means "up one
 * level": from the DISPLAYS row back to the sections row, and at the sections
 * row it declines, leaving backAction's own root clamp to answer the press.
 */
export function subNavBack(scene: StoreScene): boolean {
  const state = subNavActive(scene) ? scene.subNav! : null;
  if (state?.root) {
    if (state.row === 0) return false;
    state.row = 0;
    applyRow(scene, state);
    retailAudio.playKeyClick();
    scene.requestRender();
    return true;
  }
  return closeSubNav(scene, true);
}

/** Harness probe (`subnav` checkpoint). */
export function debugSubNav(scene: StoreScene): {
  open: boolean; root: boolean; row: number; sel: number[];
  rows: string[][]; selected: string; kind: string;
} {
  const state = scene.subNav;
  const item = state ? state.rows[state.row][state.sel[state.row]] : undefined;
  return {
    open: !!state,
    root: !!state?.root,
    row: state?.row ?? -1,
    sel: state ? state.sel.slice() : [],
    rows: state ? state.rows.map((r) => r.map((i) => i.label)) : [],
    selected: item?.label ?? '',
    kind: item?.kind ?? '',
  };
}
