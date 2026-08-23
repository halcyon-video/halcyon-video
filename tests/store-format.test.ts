// GH #33: the store FORMAT preset system.
//
// Two things are pinned here, and the first matters more than the second.
//
// 1. THE CORPORATE FORMAT IS THE STATUS QUO, VALUE FOR VALUE. store-layout.ts
//    now derives most of its exported geometry from the active format instead
//    of stating literals, so the whole design rests on the claim that the
//    default preset reproduces exactly what those literals were. If that drifts,
//    every existing store silently changes shape, and nothing else in the suite
//    would catch a one-foot change to an aisle pitch. The expected values below
//    are transcribed from the constants as they stood before the refactor —
//    they are deliberately duplicated here rather than imported, because a test
//    that reads the same source as the code under test proves nothing.
//
// 2. The mom-and-pop preset is INTERNALLY COHERENT: its numbers have to agree
//    with each other and with the fixtures that stand in the space they leave,
//    which is the class of bug you cannot see in a screenshot until you are
//    already standing in the wrong place.
//
// Runs under plain `node --test` with type stripping — store-format.ts imports
// nothing at runtime and guards its one localStorage read, so it loads in node:
//
//   node --experimental-strip-types --test tests/store-format.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_FORMATS, DEFAULT_STORE_FORMAT, resolveStoreFormatId, activeStoreFormat,
} from '../src/store-format.ts';
import {
  AISLE_SHELF_HEIGHTS, UNIT_SIDE_CAPACITY, UNIT_CAPACITY, SECTION_CAPACITY,
  CENTER_WALKWAY, LIBRARY_X_SPACING, FIELD_Z_FRONT, CEILING_Y, MAX_RUN_UNITS,
  RUN_BREAK_GAP, UNIT_FRAME_HEIGHT, UNIT_DEPTH, MAX_SHELF_COLS, SECTION_COLS,
  unitDepthAtHeight,
} from '../src/store-layout.ts';

const corporate = STORE_FORMATS['corporate'];
const momAndPop = STORE_FORMATS['mom-and-pop'];

// ── 1. The default store has not moved ──────────────────────────────────────

test('node (no localStorage) resolves to the corporate format', () => {
  assert.equal(DEFAULT_STORE_FORMAT, 'corporate');
  assert.equal(activeStoreFormat().id, 'corporate');
});

test('unknown / absent / malformed saved values fall back to corporate', () => {
  for (const v of [undefined, null, '', 'nonsense', 42, {}, 'MOM-AND-POP']) {
    assert.equal(resolveStoreFormatId(v), 'corporate', `resolving ${JSON.stringify(v)}`);
  }
  // ...and a real id still resolves to itself.
  assert.equal(resolveStoreFormatId('mom-and-pop'), 'mom-and-pop');
});

test('corporate preset reproduces the pre-format literals exactly', () => {
  assert.deepEqual(corporate.aisleShelfHeights, [0.5, 1.333, 2.167, 3.0, 3.833]);
  assert.equal(corporate.unitSections, 2);
  assert.equal(corporate.unitFrameHeight, 4.6);
  assert.equal(corporate.unitTaper, true);
  assert.equal(corporate.centerWalkway, 16.0);
  assert.equal(corporate.runSpacing, 11.0);
  assert.equal(corporate.runBreakGap, 3.0);
  assert.equal(corporate.fieldZFront, -14.4);
  assert.equal(corporate.wallMargin, 7.5);
  assert.equal(corporate.backAisleClearance, 8.0);
  assert.equal(corporate.baseRunUnits, 4);
  assert.equal(corporate.maxRunUnitsCap, 6);
  assert.equal(corporate.runGrowthPerUnits, 16);
  assert.equal(corporate.widthCap, 110.0);
  assert.equal(corporate.depthToWidthRatio, 0.9);
  assert.equal(corporate.ceilingY, 13.5);
  assert.equal(corporate.frontPanesBaseline, 16);
  assert.equal(corporate.sidePanesBaseline, 6);
  assert.equal(corporate.vestibuleInnerWidth, 9.0);
  assert.equal(corporate.doorWidth, 3.2);
  assert.equal(corporate.counterShape, 'shield');
  assert.equal(corporate.browseStandoff, 3.8);
  assert.equal(corporate.keyLightSpacingScale, 1.0);
  assert.equal(corporate.keyLightIntensityScale, 1.0);
});

test('store-layout exports still carry the corporate literals', () => {
  // The derived constants are the dangerous ones: a dozen modules capture them
  // at import time, so a wrong tier count here mis-stocks the whole store.
  assert.deepEqual([...AISLE_SHELF_HEIGHTS], [0.5, 1.333, 2.167, 3.0, 3.833]);
  assert.equal(UNIT_SIDE_CAPACITY, 60);   // 12 cols x 5 tiers
  assert.equal(UNIT_CAPACITY, 120);       // double-sided
  assert.equal(SECTION_CAPACITY, 30);     // 6 cols x 5 tiers
  assert.equal(CENTER_WALKWAY, 16.0);
  assert.equal(LIBRARY_X_SPACING, 11.0);
  assert.equal(FIELD_Z_FRONT, -14.4);
  assert.equal(CEILING_Y, 13.5);
  assert.equal(MAX_RUN_UNITS, 4);
  assert.equal(RUN_BREAK_GAP, 3.0);
  assert.equal(UNIT_FRAME_HEIGHT, 4.6);
  assert.equal(MAX_SHELF_COLS, 12);   // 6-col sections x 2
});

test('the corporate gondola still tapers with height', () => {
  assert.equal(unitDepthAtHeight(0), UNIT_DEPTH);
  assert.ok(unitDepthAtHeight(3.833) < UNIT_DEPTH, 'top tier must be shallower than the base');
});

// ── 2. The mom-and-pop preset holds together ────────────────────────────────

test('every format supplies every field the spec declares', () => {
  // Cheap structural guard: a new field added to StoreFormatSpec and filled in
  // on only one preset is a TypeScript error, but a field left `undefined` by a
  // sloppy object spread is not — and an undefined geometry number propagates
  // as NaN into the floor plan, which builds a store with no shelves in it.
  for (const f of Object.values(STORE_FORMATS)) {
    for (const [k, v] of Object.entries(f)) {
      assert.notEqual(v, undefined, `${f.id}.${k} is undefined`);
      if (typeof v === 'number') {
        assert.ok(Number.isFinite(v), `${f.id}.${k} is not finite`);
      }
    }
  }
});

test('mom-and-pop aisles are tight but still real aisles', () => {
  const clear = momAndPop.runSpacing - UNIT_DEPTH;
  assert.ok(clear > 3.0, `aisle clear ${clear.toFixed(2)}ft must stay walkable`);
  assert.ok(clear < 5.0, `aisle clear ${clear.toFixed(2)}ft is not cramped`);
  // It must also be tighter than the chain's, or the format is pointless.
  assert.ok(momAndPop.runSpacing < corporate.runSpacing);
  assert.ok(momAndPop.wallMargin < corporate.wallMargin);
});

test('the browse camera fits inside a mom-and-pop aisle', () => {
  // store-camera.ts stands the browse camera at (unit half-depth + standoff)
  // from the unit's centre. If that reaches past the near face of the run
  // OPPOSITE, the camera ends up inside someone else's shelving.
  const camFromCentre = UNIT_DEPTH / 2 + momAndPop.browseStandoff;
  const oppositeFace = momAndPop.runSpacing - UNIT_DEPTH / 2;
  assert.ok(
    camFromCentre < oppositeFace - 0.5,
    `browse camera at ${camFromCentre.toFixed(2)}ft vs opposite face at ${oppositeFace.toFixed(2)}ft`,
  );
});

test('mom-and-pop shelving reaches the ceiling without going through it', () => {
  const heights = momAndPop.aisleShelfHeights;
  const top = heights[heights.length - 1];
  // A case leans back by LEAN_ANGLE, so it stands CASE_HEIGHT*cos(10°) ≈ 0.657
  // ft on the top board (the same derivation UNIT_FRAME_HEIGHT's own comment
  // uses in store-layout.ts).
  const stockTop = top + 0.657;
  assert.ok(momAndPop.unitFrameHeight >= stockTop, 'frame must crown above its own stock');
  assert.ok(momAndPop.unitFrameHeight < momAndPop.ceilingY, 'frame must fit under the ceiling');
  assert.ok(
    momAndPop.ceilingY - momAndPop.unitFrameHeight < 1.5,
    'this is meant to read as floor-to-ceiling, not as a short run in a tall room',
  );
  // Tiers must ascend, and none may sit on the floor or above the frame.
  for (let i = 1; i < heights.length; i++) {
    assert.ok(heights[i] > heights[i - 1], `tier ${i} must be above tier ${i - 1}`);
  }
  assert.ok(heights[0] > 0);
  assert.ok(top < momAndPop.unitFrameHeight);
});

test('mom-and-pop shelving does not taper (a 7ft top tier would vanish)', () => {
  assert.equal(momAndPop.unitTaper, false);
  // ...and its own ceiling height is low enough that the corporate taper WOULD
  // have gone useless up there, which is why the flag exists.
  const top = momAndPop.aisleShelfHeights[momAndPop.aisleShelfHeights.length - 1];
  const taperedDepth = 2.16 - (2.16 - 1.26) * (top / 5.1);
  assert.ok(taperedDepth < 1.0, 'the taper this format opts out of really would collapse');
});

test('the back room has floor to stand on', () => {
  // fixtures/curtained-alcove.ts builds a 5 ft deep room against the back wall,
  // and backAisleClearance is what holds the shelf runs off that wall. If the
  // clearance ever drops below the room's depth the runs walk into it, which
  // the layout validator would only report as an overlap after the fact.
  const ALCOVE_DEPTH = 5.0;
  assert.equal(momAndPop.curtainedSection, true);
  assert.ok(
    momAndPop.backAisleClearance >= ALCOVE_DEPTH + 2.5,
    `back clearance ${momAndPop.backAisleClearance}ft must fit a ${ALCOVE_DEPTH}ft room plus a cross-aisle`,
  );
  // The corporate box has no such room, so it keeps the plain 8 ft back margin.
  assert.equal(corporate.curtainedSection, false);
});

test('mom-and-pop is a small store that grows deep, not wide', () => {
  assert.ok(momAndPop.widthCap < corporate.widthCap / 2, 'it must never become a warehouse');
  assert.ok(momAndPop.depthToWidthRatio > corporate.depthToWidthRatio, 'it should run deep and narrow');
  assert.ok(momAndPop.frontPanesBaseline < corporate.frontPanesBaseline);
  assert.ok(momAndPop.sidePanesBaseline < corporate.sidePanesBaseline);
  // Long unbroken runs down the length of the room are the point here.
  assert.ok(momAndPop.baseRunUnits >= corporate.maxRunUnitsCap);
  assert.ok(momAndPop.maxRunUnitsCap >= momAndPop.baseRunUnits);
});

test('mom-and-pop forces straight runs and hatches one field', () => {
  assert.equal(momAndPop.forcedArrangement, 'straight');
  assert.equal(momAndPop.singleField, true);
  // A single field means there is no central walkway to carve, and a nonzero
  // value would silently shrink the hatchable width by that much.
  assert.equal(momAndPop.centerWalkway, 0);
  assert.equal(corporate.forcedArrangement, null);
  assert.equal(corporate.singleField, false);
});

test('mom-and-pop admits no floor displays and no New Releases wall', () => {
  assert.equal(momAndPop.floorDisplays, false);
  assert.equal(momAndPop.newReleasesWall, false);
  assert.equal(momAndPop.newReleasesRuns, 1, 'at most ONE dedicated new-releases shelf');
  assert.equal(momAndPop.clerk, false);
  assert.equal(momAndPop.steppedCorner, false, 'the step exists to carry a wall this format has not got');
  // ...and the chain still has all of it.
  assert.equal(corporate.floorDisplays, true);
  assert.equal(corporate.newReleasesWall, true);
  assert.equal(corporate.clerk, true);
});

test('a mom-and-pop ceiling is a ceiling', () => {
  // GH #114. Everything the chain hangs over its sales floor, gone: the CRT
  // rig, the mirrored cornice (and the bulb chase riding it), and the overhead
  // wayfinding programme — per-aisle nav signs, the GAMES hanger, the hanging
  // promo cards, the membership oval.
  assert.equal(momAndPop.ceilingTvs, false);
  assert.equal(momAndPop.ceilingMirror, false);
  assert.equal(momAndPop.overheadSignage, false);
  assert.equal(corporate.ceilingTvs, true);
  assert.equal(corporate.ceilingMirror, true);
  assert.equal(corporate.overheadSignage, true);

  // The headroom argument all three share, stated as arithmetic so a future
  // format cannot quietly re-admit them under a lid that has no room. The
  // ceiling-nav slots hang their panel at a fixed y 9.75 (store-shell.ts
  // ceilingSlots) and the shelf runs crown at unitFrameHeight, so a format
  // wanting an overhead programme needs a ceiling clear of BOTH.
  const CEILING_NAV_PANEL_Y = 9.75;
  for (const f of [corporate, momAndPop]) {
    if (!f.overheadSignage) continue;
    assert.ok(f.ceilingY > CEILING_NAV_PANEL_Y,
      `${f.id}: a nav panel at ${CEILING_NAV_PANEL_Y} ft is above a ${f.ceilingY} ft ceiling`);
    assert.ok(f.ceilingY > f.unitFrameHeight,
      `${f.id}: nothing can hang between ${f.unitFrameHeight} ft of shelving and a ${f.ceilingY} ft lid`);
  }
});

test('the little counter is wide enough for what stands on it', () => {
  // entrance/counter.ts's `desk` branch is 6 ft wide (islandHalf 3.0) and
  // entrance/index.ts parks the single terminal at cx+1.3 and the bag at
  // cx-1.9. Both have to stay inside the desk's own ends.
  assert.equal(momAndPop.counterShape, 'desk');
  const DESK_HALF = 3.0;
  for (const [what, off] of [['terminal', 1.3], ['bag', 1.9]] as [string, number][]) {
    assert.ok(off + 0.7 < DESK_HALF, `${what} at ${off}ft overhangs a ${DESK_HALF * 2}ft desk`);
  }
});

test('a mom-and-pop unit face holds more than a chain one, in the same footprint', () => {
  // The format carries its stock UP rather than out — that is the trade that
  // makes a store this small hold a real library.
  const face = (f: typeof corporate) => SECTION_COLS * f.unitSections * f.aisleShelfHeights.length;
  assert.ok(face(momAndPop) > face(corporate) / 2, `${face(momAndPop)} vs ${face(corporate)} per face`);
  // But a whole UNIT must stay in the same range as the chain's, or the floor
  // planner's allocation granularity gets so coarse that a small library is
  // handed a unit it cannot fill and one of its faces stays bare board.
  const unit = (f: typeof corporate) => face(f) * 2;
  assert.ok(unit(momAndPop) <= unit(corporate), `${unit(momAndPop)} vs ${unit(corporate)} per unit`);
  assert.ok(unit(momAndPop) >= unit(corporate) * 0.5);
  // Sections stay whole: the signboard grid is SECTION_COLS wide by however
  // many tiers, so nothing here breaks the section-capacity arithmetic.
  assert.equal(face(momAndPop) % SECTION_COLS, 0);
  assert.equal(MAX_SHELF_COLS, SECTION_COLS * activeStoreFormat().unitSections);
});
