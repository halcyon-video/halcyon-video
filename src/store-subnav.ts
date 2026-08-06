// The SUB-NAV JUMP INDEX — ▼ from the bottom shelf row (see store-nav.ts
// moveDown: exit clasp → shelf row-- → THIS instead of the old dead stop).
//
// Two rows, both driven by ←/→ with ▲/▼ switching between them. There is no
// DOM for this (owner call: the indexes are logical, not chrome) — the
// feedback is the store itself plus the SAME single big floating cursor the
// entrance overview and seccam views use (the gold cone + plaque of
// store-camera.ts updateSelectionArrow, which owns the while-index-open
// branch). One marker over the focused destination, exactly as feedback/003
// settled it — never a cloud of per-target signs.
//
//   Row 1  LIBRARIES & GENRES — every library in store order, then the New
//          Releases wall, then the genre sections that PHYSICALLY exist as
//          shelf sections. Genre → location is resolved through the same
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
// The user never leaves browse mode: the cursor is untouched while the index
// is open, the full return state is snapshotted on open, and Back restores it
// exactly (browse stays the escape floor — backAction's clamp is unaffected
// because closing the index swallows that one press).
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
import { isEndcapKind } from './fixtures/genre-endcap';
import { retailAudio } from './audio';
import type { StoreScene } from './three-scene';

export type SubNavKind = 'library' | 'new-releases' | 'genre' | 'fixture' | 'endcap';

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
}

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
  return scene.subNav !== null;
}

// ─── Row contents ────────────────────────────────────────────────────────────

function shelfItem(
  label: string, kind: SubNavKind, libraryIdx: number, unitIdxInLibrary: number,
  side: 'front' | 'back', col: number, x: number, y: number, z: number,
): SubNavItem {
  return { label: label.toUpperCase(), kind, libraryIdx, unitIdxInLibrary, side, col, fixtureIdx: -1, x, y, z, yaw: 0, lookY: 3 };
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

/** Row 1: libraries in store order, the New Releases wall, then genre sections. */
function buildLibraryRow(scene: StoreScene): SubNavItem[] {
  const out: SubNavItem[] = [];
  const genres: SubNavItem[] = [];
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
  declutter(row);
  return row;
}

/** Row 2: every slotted floor fixture, ordered front of store → back. */
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
    // `genre` is the fixture's own live identity string (a promo stand's
    // campaign topper, a bin's name, an endcap's title) — the same one the
    // browse HUD names it by; the placement option and the id are fallbacks.
    const label = (f.genre || (p.options?.genre as string) || p.id || 'display').toUpperCase();
    out.push({
      label,
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
  // Front of the store first, so stepping right walks deeper in.
  out.sort((a, b) => (b.z - a.z) || (a.x - b.x));
  // Several endcaps share a title in an uncategorized store (they all fall
  // back to "Related Movies"), and a row of identical tickets is unusable —
  // qualify the repeats with the aisle they stand at the end of.
  const counts = new Map<string, number>();
  for (const it of out) counts.set(it.label, (counts.get(it.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const it of out) {
    if ((counts.get(it.label) ?? 0) < 2) continue;
    const base = it.label;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const lib = scene.slottedFixtures[it.fixtureIdx]?.placement.options?.libraryName as string | undefined;
    // A qualifier that repeats the title ("MOVIES · MOVIES") disambiguates
    // nothing — number those instead.
    const qual = lib && lib.toUpperCase() !== base ? lib.toUpperCase() : null;
    it.label = qual ? `${base} · ${qual}` : `${base} ${n}`;
  }
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
  } else {
    // Row 1 reads from the entrance overview's vantage — the viewpoint the
    // arrow-over-the-run framing is designed for (from a browse pose two feet
    // off the shelf the far destinations are unreadable). Stepping the row
    // pans the look marker-to-marker while the camera holds that vantage.
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
}

// ─── Open / close ────────────────────────────────────────────────────────────

/** ▼ at the bottom shelf row. Always handled (the index always has Row 1). */
export function openSubNav(scene: StoreScene): boolean {
  if (scene.subNav) return true;
  const rows = [buildLibraryRow(scene), buildDisplayRow(scene)];
  scene.subNav = { rows, row: 0, sel: [0, 0], ret: captureBrowseReturn(scene) };
  applyRow(scene, scene.subNav);
  retailAudio.playKeyClick();
  scene.onConsoleLog(
    `[System] Jump index — ${rows[0].length} libraries/genres, ${rows[1].length} displays.`, 'system');
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
  const state = scene.subNav;
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
  const state = scene.subNav;
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
  const state = scene.subNav;
  if (!state) return false;
  applyRow(scene, state);
  return true;
}

/** ▼: Row 1 → Row 2 (and swallowed on Row 2 — there is no third row). */
export function subNavDown(scene: StoreScene): boolean {
  const state = scene.subNav;
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
  const state = scene.subNav;
  if (!state) return false;
  const item = state.rows[state.row][state.sel[state.row]];
  if (!item) return closeSubNav(scene, true);
  closeSubNav(scene, false);
  retailAudio.playKeyClick();

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

/** Back always closes (and restores) — never falls through to backAction. */
export function subNavBack(scene: StoreScene): boolean {
  return closeSubNav(scene, true);
}

/** Harness probe (`subnav` checkpoint). */
export function debugSubNav(scene: StoreScene): {
  open: boolean; row: number; sel: number[];
  rows: string[][]; selected: string; kind: string;
} {
  const state = scene.subNav;
  const item = state ? state.rows[state.row][state.sel[state.row]] : undefined;
  return {
    open: !!state,
    row: state?.row ?? -1,
    sel: state ? state.sel.slice() : [],
    rows: state ? state.rows.map((r) => r.map((i) => i.label)) : [],
    selected: item?.label ?? '',
    kind: item?.kind ?? '',
  };
}
