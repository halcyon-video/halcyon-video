import { FixturePlacement, BOX_SPACING, STORE_CENTER_X } from './store-layout';
import type { CounterShape } from './store-format';
import { registerFixtureKind } from './fixture-registry';
import { StructureFootprint } from './fixtures/period-fixtures';
import { PV_DRAPE_TABLE_POP_KIT } from './fixtures/pv-drape-table';
import { COMING_SOON_LETTERBOARD_THEMES } from './fixtures/coming-soon-letterboard';
import { deskGroundPlan } from './entrance/desk-plan';

// 'structure-footprint' is registered here rather than in fixture-registry.ts
// because it is pure layout data — an invisible marker that only feeds the
// layout validator (see StructureFootprint in period-fixtures.ts) — so it
// lives with the config that declares its rectangles.
registerFixtureKind('structure-footprint', (placement) => new StructureFootprint(placement));

export const DEFAULT_FIXTURE_PLACEMENTS: FixturePlacement[] = [
  // Floor displays are SPREAD down the store's open central corridor (the
  // island-free CENTER_WALKWAY, x roughly 3..19) instead of bunched in the back
  // area. The corridor runs clear from just behind the checkout counter's apex
  // (z ≈ -5.5) all the way to the back wall, so staggering the stands in a
  // zigzag by depth (relativeToBackWall zOffset 15 -> 4) and side-to-side in x
  // spreads them across the front/middle/back of the browsable floor while each
  // keeps a full walk-around footprint (3 ft square) clear of the islands
  // (x kept within ~[6,15]) and of the counter (frontmost stand's front edge
  // stays behind the apex).
  //
  // The stands themselves are computed — see promoStandPlacements(backWallZ)
  // below, which owns both their positions and their campaigns. They used to
  // live here as two static entries facing out four Jellyfin BoxSets apiece.
  //
  // Positions honour the FLOOR_DISPLAY_CLEARANCE rule (floor displays/bins
  // demand 3 ft — double the plain walkway — to EVERYTHING, walls included):
  // the corridor chain runs promo-stand-back (zOff 5) → bargain-bin-1
  // (zOff 11.5) → promo-stand-front (zOff 18) → promo-stand-front-right
  // (zOff 24.5, deep stores only), each hop spaced so the 3 ft gap holds, with
  // x pulled inside ~[8, 14] so the 3 ft also holds against both shelf fields.
  // Verified via the layout validator across 1/2/3/6-library stores in all
  // three arrangements.
  //
  // ── Bargain bin ───────────────────────────────────────────────────────────
  // One 3×3 ft, waist-height (2.7 ft) dump tub of the library's lowest-
  // AUDIENCE-score titles (critic score ignored), a rummage jumble of slanted
  // cases — see fixtures/bargain-bin.ts. SlottedFixture: its titles are
  // browsable/inspectable like shelf stock. It takes the corridor slot
  // between the two permanent promo stands. (bargain-bin-0, which historically
  // sat on the front-right floor and briefly mirrored to the front-left when
  // the game department took that corner, was removed at user direction —
  // the front corners stay open floor. binIndex 1 kept so the pool slice is
  // unchanged.)
  // ── Mirrored structural column ────────────────────────────────────────────
  // A clad four-sided mirror pillar in the open back floor — see
  // fixtures/mirror-column.ts for what it is and why the chains built them.
  //
  // It stands in the BACK CROSS-AISLE — the open floor behind the aisle runs,
  // between their back ends and the New Releases wall — at the left edge of the
  // central walkway. That is where a real column lands: in circulation space, on
  // the building's grid, touching no fixture's working face.
  //
  // Why not the store centreline, which is the obvious first guess: it has no
  // room at any depth. Going back from the front, the corridor chain above
  // (bargain bin at zOffset 11.5, promo stands at 18 and 24.5) leaves gaps of
  // 6.5 ft, and two 3 ft clearances plus the column itself need 8.1; and the
  // one remaining slot, zOffset ~5, is New Releases' own ground. That section
  // anchors at (STORE_CENTER_X, backWallZ + 4) — store-camera.ts parks the
  // browse camera and the overview marker there — so a column on the centreline
  // 5 ft off the back wall does not merely crowd the NR wall, it stands in the
  // spot the camera flies to.
  //
  // (5, backWallZ + 8) clears all of it: 5.9 ft to the bargain bin, 6.9 ft to
  // the back wall, and it sits 4 ft off the NR camera lane and 6 ft off its
  // axis, so the wall it could have blocked is browsed past it, not through it.
  // CENTER_WALKWAY is 16 ft centred on x=11, i.e. x 3..19, so this hugs its
  // left edge and the corridor stays walkable. The mirrored position (x=17) is
  // free if the owner wants the flanking pair the bigger stores had — the two
  // would read as one structural bay.
  {
    id: 'mirror-column-back',
    kind: 'mirror-column',
    position: { x: STORE_CENTER_X - 6, z: 8 },
    yaw: 0,
    options: { relativeToBackWall: true, zOffset: 8 }
  },
  {
    id: 'bargain-bin-1',
    kind: 'bargain-bin',
    position: { x: 13.5, z: 11.5 },
    yaw: 0,
    options: { relativeToBackWall: true, zOffset: 11.5, binIndex: 1, genre: 'Bargain Bin', noRentalCase: true, browseLookDown: true }
  },
  // ── Previously-viewed drape table (2007-2008) ─────────────────────────────
  // The black-draped, wire-racked PV sale table from the reference corpus
  // (fixtures/pv-drape-table.ts). `popKit` arms the era gate — the fixture
  // refuses to build unless popKitVisible(2007, 2008) says this store's POP
  // period hosts the kit — so on the 2008-fabric bb-2010 theme it stands, and
  // a 2012 period (or a theme with no period at all) simply doesn't get one.
  //
  // MOVED 2026-08-06 (feedback/055): used to stand at (7.9, -10.4), mid-store
  // beside the SUMMER SMASH HITS promo stand and the bargain bin — the owner
  // called it out as buried and crowded, and asked for it "closer to the
  // front of the store, say, near the register."
  //
  // FIRST ATTEMPT (superseded, keeping the note as a trap for the next
  // agent): the pocket flanking the entrance vestibule (x~19-30, z 8.6..15)
  // looked free on a pure footprint check, but a SlottedFixture's browse
  // camera backs off `distance = 1.25 + 2.2 = 3.45` ft from whichever face is
  // selected (store-camera.ts updateCameraTarget's isDisplay branch) — and
  // that check never ran against anything but the static footprint rect. At
  // yaw=0 that means the camera needs 3.45 ft clear in front of BOTH the +Z
  // face and the -Z face, i.e. 6.9 ft of straight-line depth centred on the
  // table, and the vestibule pocket only has 6.4 ft of depth end to end
  // (backZ 8.6 to frontZ 15) — there is no z that clears both. Confirmed by
  // shooting `--state subnav --flip 1`: it glides to this fixture (the DISPLAYS
  // row's other "PREVIOUSLY VIEWED" entry) and the front-face camera lands at
  // z ≈ fz+3.45, past the glass — the shot showed the camera standing on the
  // exterior sidewalk looking back in through the storefront window.
  //
  // New spot: (27.0, 3.0), yaw=0, to the RIGHT of the checkout counter
  // entirely — not squeezed into a pocket at all. The shield counter's
  // widest point is x=20.8 (at z=2.26; store-fixtures-config.ts's own
  // counter-band-front-right/-side-right structure-footprints top out
  // there), so x=27 clears the counter in X at EVERY z, which means both
  // camera standoff points (fz±3.45 = -0.45 and 6.45) are automatically
  // clear of the counter too, not just the table's own footprint — no
  // z-budget fight like the vestibule pocket had. It also clears the
  // vestibule (xL/xR 3.3/18.7) by a wide margin in X, so z=3 (deep inside the
  // counter's own -5.5..8.5 span — i.e. genuinely BESIDE the register, not
  // fronting the glass) is safe without going anywhere near the vestibule
  // chamber. Table footprint (w=6.0+2*0.08+0.04=6.2, d=2.5+2*0.08+0.04=2.7)
  // spans x 23.9..30.1 (3.9 ft clear of the store's floor-width minimum of 46
  // ft, i.e. the right wall never sits closer than x=34) and z 1.65..4.35 —
  // both comfortably clear of the counter's max 20.8 reach and short of
  // FIELD_Z_FRONT (world front edge of the shelf field is ~z=-7, so nothing
  // this far forward at any x is ever inside a shelf run, at any catalog
  // scale). corner=wide only reshapes the BACK-right corner (steppedCorner in
  // store-layout.ts), nowhere near z~3, so it doesn't touch this spot either.
  // Verified: the layout validator (no overlap — 'structure' vs 'fixture'
  // pairs aren't walkway-checked, and nothing else is placed out here
  // anyway), the clerk-nav grid (`--state clerkpath`, default + --full sizes,
  // plus --arrangement diagonal --corner wide: 0 footprint intrusions in
  // every run), and the subnav camera glide (`--state subnav --flip 1`
  // lands inside the store, framing the table, not through the glass).
  {
    id: 'pv-drape-table-front',
    kind: 'pv-drape-table',
    position: { x: 27.0, z: 3.0 },
    yaw: 0,
    options: {
      popKit: PV_DRAPE_TABLE_POP_KIT,
      // 2008 recolor of the 2007 purple family; 'purple' and 'red' are the
      // other two attested colorways.
      colorway: 'green',
      // Ex-rental stock is sold in its own retail keepcase — no rental
      // rental clamshell standing behind it (same rule as the bargain bin).
      noRentalCase: true,
    }
  },
  // ── COMING SOON counter letterboard (1990 only) ───────────────────────────
  // The manager's changeable-letter coming-attractions board
  // (fixtures/coming-soon-letterboard.ts). `themes` arms the fabric gate — 1990
  // ONLY, because this is store furniture rather than a mailed POP kit and the
  // 1993 tours attest its absence — and the void viewer, which passes no
  // options, still builds it.
  //
  // MOVED 2026-07-30. This used to stand on a floor post at (0.3, 9.2) in the
  // left front-glass pocket. The owner's 1990 counter frame
  // (/uploads/…828a835c-6482.png) shows there was never a post: the board sits
  // ON the counter's back ledge, leaning against the vestibule glass, with the
  // clerk's head passing in front of its lower half. See the fixture header for
  // the full correction; the fixture now bases itself on the ledge, so the
  // position below is where the board's FOOT lands, at ledge height.
  //
  // Derivation. Shield counter (the default storefront, and the only shape with
  // a back run at all — the fixture skips usquare): back band outer face on
  // z = 8.5, 1.5 ft deep, top at 3.54 ft, clear span x 6.2..15.8 after the
  // mitred ends (entrance/counter.ts; validator mirror `counter-band-back`
  // below). z = 7.75 is that band's centre line — 0.75 ft of ledge either side
  // of the foot, and with the fixture's 11 deg lean the board's top back corner
  // lands on z = 8.475, just shy of the glass face at 8.54. (The lean dropped
  // 13 -> 11 deg on 2026-08-02 when the owner asked for a bigger board: the
  // fixture scaled 7/6 to 28 x 42 in and the taller board needs the shallower
  // lean to keep that same standoff. See the fixture header.)
  //
  // x = 9.0 is BESIDE the clerk, not behind her. The reference frame can't pin
  // an absolute x — it never shows the counter's full width — but it does pin
  // the relationship: the board and the clerk stand side by side, her head
  // crossing the board's lower half from the queue's eye line. Our clerk's
  // register station is (11.0, 0.15), so the ledge's own centre (11.0) is the
  // one x that puts the board directly behind her head, which is the single
  // composition the reference rules out. 9.0 is the midpoint between the left
  // register terminal (x = 7.0) and that centreline: the 2 ft board spans
  // x 8.0..10.0, well inside the run's clear span 6.2..15.8, and it clears the
  // counter's own furniture by a wide margin — the terminals sit on the INNER
  // island at z ~ +0.6 (6.4 ft away in z), the bag rest at (5.6, +1.87), the
  // RETURN chute at (19.0, 5.38) and the tape-cleaner display at (4.20, 5.96),
  // none of them on this band.
  //
  // yaw = PI turns the face — local +Z — to world -Z, i.e. at the queue and the
  // sales floor, which also aims the lean back at the glass. The clerk's work
  // strip is z ~ -1.5..7.0, in FRONT of this band, so she still walks the whole
  // run; the board is 3.54 ft up and carries no floor footprint at all.
  {
    id: 'coming-soon-letterboard-counter-end',
    kind: 'coming-soon-letterboard',
    position: { x: 9.0, z: 7.75 },
    yaw: Math.PI,
    options: { themes: COMING_SOON_LETTERBOARD_THEMES },
  },
  // (The previously-viewed dump bin that used to sit at x 16.5, z 3.0 was
  // removed in #37: that spot is INSIDE the checkout counter's shield outline,
  // so its brown tub read as a stray brown box poking through the counter.)
  //
  // T06 counter-anchored props (candy rack, rewinder, tape-cleaner) moved to
  // counterAnchoredPlacements() below: their positions are derived from the
  // counter band/island geometry, which now varies with counterShape.
];

// ── Promo floor stands ──────────────────────────────────────────────────────
// Four-sided stands down the open central corridor. Each runs ONE campaign
// picked by its `campaigns` fallback chain — the first viable one wins, and a
// stand with no viable campaign builds nothing at all (see promo-campaigns.ts
// and FourSidedDisplay.ensureCampaign). That is what lets a third stand exist
// without risking the half-stocked look the old per-face-collection rule had:
// if the library can't fill it, it simply isn't there.
//
// Campaign assignment follows the floor, not just the data:
//
//  • counter-right — PREVIOUSLY VIEWED, a face per library, most recently
//    watched first. It's a browse-me fixture, not a shout-at-the-door one, so
//    it wants the customer already lingering near checkout rather than a
//    heads-down aisle. (id kept as 'promo-stand-back' — see its own comment
//    below for why; it is no longer at the back of the store.)
//  • front (zOff 18) — the current FAMILY campaign: seasonal in season, a
//    studio spotlight otherwise. Family-forward at the front is the chain's
//    own merchandising rule.
//  • front-right (zOff 24.5) — the adult-rated seasonal band, kept on a
//    SEPARATE fixture from the family one. Jason does not stand beside Hocus
//    Pocus, and faces of one stand are still beside each other.
//
// The third stand is DEPTH-GATED. `relativeToBackWall` clamps z at
// FLOOR_FIXTURE_MAX_Z (-10) so a shallow store's stands don't drift into the
// checkout zone — which means in a shallow store zOff 18 and 24.5 would both
// clamp to the same z and collide. Below the cutoff the store simply gets the
// two permanent stands, exactly as before. The two that always exist carry the
// two most important campaigns, so a shallow store degrades by losing the
// adult seasonal band rather than losing PREVIOUSLY VIEWED.
// backWallZ must be at or below this for zOff 24.5 to clear zOff 18.
//
// Derivation, not a guess: the two stands sit 5.3 ft apart in x with 3.0 ft
// footprints, so their x gap is 2.3 ft and the 3 ft clearance has to come from
// z — sqrt(3.0² - 2.3²) = 1.93 ft of z gap beyond the footprints, i.e. Δz >=
// 4.93. Unclamped they're 6.5 apart and fine. The failure case is the front-
// right stand clamping to FLOOR_FIXTURE_MAX_Z (-10) while the front one
// doesn't: Δz becomes -28 - backWallZ, which holds until backWallZ = -32.93.
// -34.5 keeps ~1.5 ft of margin on that.
//
// The default storefront's baselineStoreDepth() puts backWallZ near -36.3, so
// this normally passes — it's the guard for a shallower storefront spec (fewer
// side window bays), not dead code.
const THIRD_STAND_MIN_DEPTH_Z = -34.5;

export function promoStandPlacements(backWallZ: number): FixturePlacement[] {
  const stands: FixturePlacement[] = [
    // MOVED 2026-08-07 (owner: "the previously viewed display near the back
    // of the store needs to be next to the front counter on the right
    // side"). Used to sit deep in the store (relativeToBackWall, zOffset 5 —
    // see git history), parked against a shelf run far from the register.
    // id kept as 'promo-stand-back' (tests/shot.mjs's `--state promo --yaw 0`
    // and window.__promoStands both address it by array position, not by id
    // string or location) — only the position/options below changed.
    //
    // "Right" = the customer's right walking in the front door: store
    // centreline is x=11, front glass z=15, walking in you face -z, so +x is
    // the customer's right (matches the RETURN chute / RIGHT-side placements
    // elsewhere in this file). This is a FOUR-sided display — unlike
    // pv-drape-table-front (front/back only), the browse camera can dock
    // against any of its 4 faces at `distance = 1.25 + 2.2 = 3.45` ft from
    // its CENTRE (store-camera.ts, isDisplay branch) along all four cardinal
    // directions at yaw 0, which is the binding clearance (bigger than
    // FLOOR_DISPLAY_CLEARANCE's 3.0 ft the validator itself checks).
    //
    // (24.0, -3.0): the shield counter's right band reaches its true widest
    // point at the raw outline vertex (20.8, 2.26) — see
    // counterAnchoredPlacements's derivation comment above and
    // 'counter-band-front-right'/'counter-band-shoulder-right' below. An
    // initial (22.0, -2.0) estimate hand-interpolated off those rects' own
    // corners and looked safe on paper, but the validator's actual SAT gap
    // (oriented-rect vs oriented-rect, not a simple axis distance) came back
    // tighter than the estimate — 1.98 ft where 3.0 is required — so this was
    // tuned against the REAL validator output, not the hand math: pushed to
    // x=24 clears the counter band with no warning at all; the same run also
    // surfaced a second, non-obvious conflict only present when
    // pv-drape-table-front is in its 2007-2008 POP-kit period (bb_pop_period
    // set to that range) — its footprint at (27, 3) came back only 2.15 ft
    // from (22.0, -2.0), also under the 3.0 ft this fixture's
    // FLOOR_DISPLAY_CLEARANCE demands of EVERYTHING (not just other
    // FLOOR_DISPLAY_CLEARANCE fixtures) — which is what pushed z to -3.0 (the
    // z axis is what SAT reported as the separating axis both times).
    // Re-verified at the final (24, -3) across shield/usquare counter shapes,
    // straight/diagonal/herringbone arrangements, corner=wide, --full scale,
    // and with pv-drape-table-front present: zero layout-validator
    // warnings/errors in every combination. Also clear of every
    // counter-anchored prop on this band (candy/rewinder/tip-jar all sit at
    // x<=13.9), of FIELD_Z_FRONT (~-7, the shelf field's own front edge —
    // this fixture's south standoff at z=-6.45 stays short of it), and of the
    // store's right wall (never closer than x=34, same guarantee
    // pv-drape-table-front's own placement comment established). Verified:
    // the layout validator (see above), `--state clerkpath` across the same
    // config sweep (0 footprint intrusions every run), `--state bagexit`/a
    // first-person walk past the counter (clear of both), and `--state promo
    // --yaw 0` (stand still builds all 4 faces, 9/9 each).
    {
      id: 'promo-stand-back',
      kind: 'four-sided-display',
      position: { x: 24.0, z: -3.0 },
      yaw: 0,
      options: {
        // studio-spotlight:2: each stand owns exactly one studio-spotlight
        // index (0/1/2 below), never more than one per chain and never
        // shared with another stand's chain — see the CALLER CONTRACT note
        // on studioSpotlight() in promo-campaigns.ts. Index 2 keeps this
        // stand clear of both of the others' indices even when they're not
        // built (a shallow store drops promo-stand-front-right entirely).
        campaigns: ['recently-played', 'studio-spotlight:2'],
      },
    },
    {
      id: 'promo-stand-front',
      kind: 'four-sided-display',
      position: { x: 8.5, z: 18.0 },
      yaw: 0,
      options: {
        relativeToBackWall: true,
        zOffset: 18.0,
        campaigns: ['seasonal:family', 'studio-spotlight:0'],
      },
    },
  ];
  if (backWallZ <= THIRD_STAND_MIN_DEPTH_Z) {
    stands.push({
      id: 'promo-stand-front-right',
      kind: 'four-sided-display',
      position: { x: 13.8, z: 24.5 },
      yaw: 0,
      options: {
        relativeToBackWall: true,
        zOffset: 24.5,
        // FIXED (issue #26 — "duplicate facings"): this used to fall back
        // to studio-spotlight:0 when :1 wasn't viable, which is promo-stand-
        // front's own index — on a library with only one strong studio, both
        // stands landed on it and showed the identical tower twice. A stand
        // with no viable campaign at all correctly builds nothing (see
        // FourSidedDisplay.ensureCampaign); that is the right degradation,
        // not this collision.
        campaigns: ['seasonal:adult', 'studio-spotlight:1'],
      },
    });
  }
  return stands;
}

// ── Counter-shape-dependent placements ──────────────────────────────────────
// Everything whose position derives from the checkout counter's ground plan:
//
// 1. Structure footprints. The walk-in counter is built by
//    entrance/counter.ts AFTER fixtures are placed and validated (see
//    buildStore() in three-scene.ts), so it never used to register a
//    footprint — which is why the validator missed fixtures clipping it
//    (#36/#37). These oriented rects trace the counter band (outer outline
//    inset by the band depth 1.5 ft), one per segment — static copies of
//    counter.ts's outline points for the active StorefrontSpec.counterShape.
//    kind 'structure', so they only raise hard-overlap errors, not walkway
//    warnings.
//
// 2. Counter-anchored props (T06): the candy queue rack abutting the band's
//    store-side face, the tape rewinder on the inner rental counter's top
//    (surfaceY 2.82 = innerH 2.7 + 0.12 slab, on the island spine), and the
//    tape-cleaner display on the band's blue top (surfaceY 3.54 = band 3.4 +
//    0.14 cap) with clamshell labels facing the store side. Their shield
//    positions are the long-validated #57/#60 spots; the usquare positions
//    are the same relationships re-derived against the straight front band
//    (outer face z=-3.6, inner island spine z=-1.3, band top centre z=-2.85).
// ─── What a store FORMAT admits onto its floor ──────────────────────────────
//
// Fixture kinds that stand on the OPEN SALES FLOOR: they need a walk-around
// footprint (FLOOR_DISPLAY_CLEARANCE demands 3 ft to everything, walls
// included), and they exist because a chain box has acres of floor between its
// aisles to fill. A format with no open floor admits none of them — the owner's
// mom-and-pop spec (GH #33) bans them outright: "less floor space around the
// runs, no big open areas, no floor displays".
const FLOOR_DISPLAY_KINDS = new Set([
  'four-sided-display',      // promo floor stands
  'bargain-bin',             // dump tub
  'pv-drape-table',          // previously-viewed drape table
  'mirror-column',           // clad structural pillar
  'previously-viewed-bin',
  'gold-clamshell',
]);

// Fixture kinds that mount ON the checkout counter's walk-in BAND — its blue
// top at y 3.54, or the queue rail along its outer face. A format whose counter
// is a standalone desk (counterShape 'desk') has no band, so these have nothing
// to sit on and would hang in mid-air over the clerk's strip of floor.
const COUNTER_BAND_KINDS = new Set([
  'coming-soon-letterboard',
  'candy-display',
  'tape-cleaner-display',
]);

/**
 * The back-room alcove, for a format that has one (StoreFormatSpec.curtainedSection).
 *
 * A single placement, and everything about where it lands is derived inside the
 * fixture from the built shell (store width, back wall Z) rather than stated
 * here — the store's size follows the library, so a hand-written x/z would be
 * in the middle of the floor on one library and outside the building on the
 * next. See fixtures/curtained-alcove.ts.
 *
 * The format also has to leave the room ROOM: StoreFormatSpec.backAisleClearance
 * is what holds the shelf runs far enough off the back wall for the alcove to
 * stand in front of it, so the two numbers are read together.
 */
export function curtainedAlcovePlacements(): FixturePlacement[] {
  return [{
    id: 'curtained-alcove',
    kind: 'curtained-alcove',
    position: { x: STORE_CENTER_X, z: 0 }, // derived in the fixture — see above
    yaw: 0,
    options: { cornerSide: 'right' },
  }];
}

/**
 * Drop the fixtures the active store format has no room (or no surface) for.
 *
 * Applied once to the ASSEMBLED placement list in buildStore, rather than at
 * each source, so a fixture added to any of those sources later is covered by
 * the same rule without anyone remembering to gate it. A dropped fixture is
 * never built, never validated and never gets an overview cursor — exactly as
 * if the config had not listed it.
 */
export function admitFixturePlacements(
  placements: FixturePlacement[],
  opts: { floorDisplays: boolean; counterShape: CounterShape },
): FixturePlacement[] {
  const noBand = opts.counterShape === 'desk';
  if (opts.floorDisplays && !noBand) return placements;
  return placements.filter((p) =>
    (opts.floorDisplays || !FLOOR_DISPLAY_KINDS.has(p.kind))
    && (!noBand || !COUNTER_BAND_KINDS.has(p.kind)));
}

export function counterAnchoredPlacements(
  spec: { counterShape: CounterShape; doorWidth: number; entryStyle: 'vestibule' | 'storefront-door' },
  storeWidth: number,
): FixturePlacement[] {
  const counterShape = spec.counterShape;
  if (counterShape === 'desk') {
    // The mom-and-pop format's standalone counter (GH #33): a 6 ft wooden desk
    // with room to stand behind it, running down a side wall since GH #116
    // instead of sitting across the entrance. Where exactly comes from
    // entrance/desk-plan.ts, the same function entrance/counter.ts BUILDS the
    // desk from — this list is assembled before the entrance exists, so it
    // cannot read the built geometry back, and the two hand-derivations
    // drifting apart is precisely how GH #110 left the tip jar and this
    // footprint six feet out on the open floor (fixed in 1af1683).
    const plan = deskGroundPlan({
      storeCenterX: STORE_CENTER_X, storeWidth, frontGlassZ: 15.0,
      entryStyle: spec.entryStyle, doorWidth: spec.doorWidth,
    });
    // Tip jar's spot, −0.95 ft along the counter from its centre — see below.
    const jarX = plan.cx + plan.ux * -0.95;
    const jarZ = plan.cz + plan.uz * -0.95;
    // There is no band and no queue rail, so the props that live ON a band —
    // the candy queue rack, the tape-cleaner clamshell display — have no
    // surface here and are simply not placed. That is the format's whole
    // point: this counter fits a computer, and the computer is already on it.
    return [
      {
        id: 'counter-desk',
        kind: 'structure-footprint',
        position: { x: plan.cx, z: plan.cz },
        yaw: plan.yaw,
        options: { footprintWidth: plan.length, footprintDepth: plan.depth }
      },
      {
        // Tip jar on the desk top (surfaceY 2.82 = innerH 2.7 + the 0.12 slab,
        // the island top — NOT the 3.54 band top, which this format has no
        // band to provide). Parked in the desk's one clear stretch, between
        // the bag's rest spot (−1.9 along the counter) and the terminal
        // (+1.3, whose CRT reaches ~+0.7); the far end is jammed between the
        // counter-TV bracket (+2.2) and the desk's own end. Held as an
        // along-counter offset so it turns with the desk.
        id: 'tip-jar-counter',
        kind: 'tip-jar',
        position: { x: jarX, z: jarZ },
        yaw: plan.facingYaw, // card toward the customer side
        options: { surfaceY: 2.82 }
      },
    ];
  }
  if (counterShape === 'usquare') {
    // counter.ts usquare outline with the default storefront (counter back
    // z 8.4): sides x = 11±6.8 from z 8.4 to z -3.6, flat front across, with
    // the walk-through gap carved MID-way along the left side band (GAP_TRIM
    // 2.2, z 3.3..5.5). Side rects are trimmed 1.5 ft at the front corners
    // so they don't SAT-overlap the front rect; the back edge is the open
    // walk-in (blocked by the vestibule — the side gap is the real entry).
    return [
      {
        id: 'counter-band-side-left-back',
        kind: 'structure-footprint',
        position: { x: 4.95, z: 6.95 },
        yaw: 0,
        options: { footprintWidth: 1.5, footprintDepth: 2.9 }
      },
      {
        id: 'counter-band-side-left-front',
        kind: 'structure-footprint',
        position: { x: 4.95, z: 0.6 },
        yaw: 0,
        options: { footprintWidth: 1.5, footprintDepth: 5.4 }
      },
      {
        // Both ends trimmed 1.5 ft where the side rects own the corners.
        id: 'counter-band-front',
        kind: 'structure-footprint',
        position: { x: 11.0, z: -2.85 },
        yaw: 0,
        options: { footprintWidth: 10.6, footprintDepth: 1.5 }
      },
      {
        id: 'counter-band-side-right',
        kind: 'structure-footprint',
        position: { x: 17.05, z: 3.15 },
        yaw: 0,
        options: { footprintWidth: 1.5, footprintDepth: 10.5 }
      },
      {
        id: 'candy-display-front',
        kind: 'candy-display',
        position: { x: 9.0, z: -4.0 }, // band outer face -3.6 − rackDepth/2 − 0.05
        yaw: 0,
        options: { rows: 5, footprintWidth: 3.0 }
      },
      {
        id: 'tape-rewinder-counter',
        kind: 'tape-rewinder',
        position: { x: 13.5, z: -1.3 }, // inner island spine (front -2.1 + innerD/2)
        yaw: 0
      },
      {
        id: 'tape-cleaner-display-counter',
        kind: 'tape-cleaner-display',
        position: { x: 8.6, z: -2.85 }, // on the front band top, left of centre
        yaw: Math.PI, // labels toward the store side (-z)
        options: { count: 10 }
      },
      {
        // Tip jar: same band top, right of centre — the far side from the
        // cleaner display and clear of the bag's wait stretch at the gap end.
        id: 'tip-jar-counter',
        kind: 'tip-jar',
        position: { x: 13.4, z: -2.85 },
        yaw: Math.PI, // card toward the customer side (-z)
      },
    ];
  }
  // Shield pentagon, derived from counter.ts's points with the default
  // storefront (doorWidth 3.2 => counter back z 8.5): (4.8, 8.5) →
  // (1.2, 2.26) → (11, -5.5) → (20.8, 2.26) → (17.2, 8.5). Segment ends are
  // trimmed 1.4 ft at shared corners so adjacent rects don't SAT-overlap each
  // other at the mitred joints, and the walk-through gap near (1.2, 2.26)
  // (GAP_TRIM 2.2 in counter.ts) is left open.
  return [
    {
      id: 'counter-band-shoulder-left',
      kind: 'structure-footprint',
      position: { x: 3.85, z: 5.35 },
      yaw: 2.0941,
      options: { footprintWidth: 3.6, footprintDepth: 1.5 }
    },
    {
      id: 'counter-band-front-left',
      kind: 'structure-footprint',
      position: { x: 6.88, z: -1.28 },
      yaw: 0.6697,
      options: { footprintWidth: 8.9, footprintDepth: 1.5 }
    },
    {
      id: 'counter-band-front-right',
      kind: 'structure-footprint',
      position: { x: 15.43, z: -1.03 },
      yaw: -0.6697,
      options: { footprintWidth: 9.7, footprintDepth: 1.5 }
    },
    {
      id: 'counter-band-shoulder-right',
      kind: 'structure-footprint',
      position: { x: 18.35, z: 5.01 },
      yaw: -2.0941,
      options: { footprintWidth: 4.4, footprintDepth: 1.5 }
    },
    {
      id: 'counter-band-back',
      kind: 'structure-footprint',
      position: { x: 11.0, z: 7.75 },
      yaw: 0,
      options: { footprintWidth: 9.6, footprintDepth: 1.5 }
    },
    // Candy display (#60): queue-line rack abutting the STORE-side face of
    // the left front band segment (centreline (6.88, -1.28), yaw 0.6697),
    // pushed out along the band's store-side normal by bandD/2 + rackDepth/2
    // + 0.05 ft so its footprint sits just clear of the band footprint.
    {
      id: 'candy-display-front',
      kind: 'candy-display',
      position: { x: 6.09, z: -2.12 },
      yaw: 0.6697,
      options: { rows: 5, footprintWidth: 3.0 }
    },
    // Rewinder on the inner rental counter's top — z matches counter.ts's
    // getInnerCounterSpine(13.9), yaw matches that segment's rotY. See
    // TapeRewinder's build() for why these are constants, not a live anchor.
    {
      id: 'tape-rewinder-counter',
      kind: 'tape-rewinder',
      position: { x: 13.9, z: -0.27 },
      yaw: -0.6697
    },
    // Tape-cleaner display on the band's blue top — moved from the left
    // FRONT segment (old #57 spot (4.61, 0.52)) to the left SHOULDER
    // segment, 2.5 ft down its edge from the back corner (4.8, 8.5), labels
    // facing the exit corridor: the old spot is now the checkout bag's WAIT
    // stretch at the band's gap end (store-checkout.ts exit ritual), and
    // anywhere else on the front segment blocks that ritual's stand-camera
    // sightline. Exiting customers walk right past the labels instead.
    {
      id: 'tape-cleaner-display-counter',
      kind: 'tape-cleaner-display',
      position: { x: 4.20, z: 5.96 },
      yaw: -1.0473,
      options: { count: 10 }
    },
    // Tip jar on the FRONT-RIGHT band top, 3.4 ft up the segment from the
    // apex: the stretch a customer stands at while the clerk works the
    // register, and the opposite end of the counter from the bag's wait spot
    // (store-checkout.ts parks it at the -X gap end) so neither ritual has to
    // step around it. Position = apex (11, -5.5) + 3.4 along the segment
    // direction (0.784, 0.621), then the band's own inward normal
    // (-0.621, 0.784) x bandD/2 — the same construction the footprint above
    // uses. Yaw points the card's print back out along that normal.
    {
      id: 'tip-jar-counter',
      kind: 'tip-jar',
      position: { x: 13.20, z: -2.80 },
      yaw: 2.4719,
    },
  ];
}

export function gameSectionPlacements(storeWidth: number): FixturePlacement[] {
  if (storeWidth >= 50) {
    const rows = [
      { z: 0.96, yaw: -Math.PI / 2 },  // field-side row, stocked face north
      { z: 7.92, yaw: Math.PI / 2 },   // glass-side row, stocked face south
    ];
    // Each 12-col unit's shelf length is (12 - 1) * BOX_SPACING + 1.0 = 7.38 ft.
    const unitLength = (12 - 1) * BOX_SPACING + 1.0;
    // Total run length for 2 units joined end-to-end + 0.1 ft end caps on the two outer ends:
    const runLength = 2 * unitLength + 0.2;
    // Side gap measured from the RIGHT wall
    const rightWall = 11.0 + storeWidth / 2;
    const eastGap = Math.min(6.0, Math.max(2.5, (rightWall - 21.5) - runLength));
    // Center of east unit (wall side) and west unit (vestibule side).
    // Spaced exactly unitLength (7.38 ft) apart so shelves join end-to-end with zero gap.
    const halfUnit = unitLength / 2 + 0.1; // 3.79 ft from outer end cap
    const xOffsets = [
      storeWidth - (eastGap + halfUnit),              // east unit (wall side)
      storeWidth - (eastGap + halfUnit + unitLength), // west unit (vestibule side)
    ];
    const placements: FixturePlacement[] = [];
    let unit = 0;
    for (const row of rows) {
      let colIdx = 0;
      for (const xOff of xOffsets) {
        // For row 0 (yaw = -Math.PI / 2): local -Z is east (outer), +Z is west (interior)
        // For row 1 (yaw = +Math.PI / 2): local +Z is east (outer), -Z is west (interior)
        const hasFrontCap = row.yaw === -Math.PI / 2 ? colIdx === 1 : colIdx === 0;
        const hasBackCap = row.yaw === -Math.PI / 2 ? colIdx === 0 : colIdx === 1;
        placements.push({
          id: `game-section-${unit}`,
          kind: 'game-section',
          position: { x: xOff, z: row.z },
          yaw: row.yaw,
          options: {
            genre: 'Video Games', relativeToLeftWall: true,
            units: 4, unit, faces: 'front',
            hasFrontCap, hasBackCap,
          }
        });
        unit++;
        colIdx++;
      }
    }
    return placements;
  }
  return [
    {
      id: 'game-section-w',
      kind: 'game-section',
      position: { x: 10.5, z: 8.95 },
      yaw: Math.PI / 2,
      options: { genre: 'Video Games', relativeToLeftWall: true, units: 1, unit: 0 }
    }
  ];
}
