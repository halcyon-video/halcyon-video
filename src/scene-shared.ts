// Shared scene-module declarations: the no-per-frame-allocation scratch
// registers and case-transform constants used by StoreScene (three-scene.ts)
// and the extracted scene modules (store-stock.ts, ...). Single-threaded
// use only — every consumer fully writes a temp before reading it back.
import * as THREE from 'three';
import { Movie } from './jellyfin';
import { SECTION_COLS, STORE_CENTER_X } from './store-layout';
import { perfSlot } from './perf-trace';

// Euler order for every movie-case transform (slot instances, hero cases, the
// stacked extra copies). YXZ, not three.js's default XYZ, because a slot's
// restingRotX always means "tip the case back away from the shopper looking at
// this FACE" — it has to be applied about the case's own X axis, after the yaw.
// Under XYZ the pitch was applied about world X instead, so it only came out
// right on a fixture's front face; on the left/right/back faces a case meant to
// lie face-up in a bin tipped sideways instead. Harmless while every fixture's
// pitch was a few degrees, very visible once the bargain bin started laying its
// stock nearly flat at ±90° of yaw scatter.
export const CASE_EULER_ORDER = 'YXZ' as const;

export interface NewReleasesSection {
  type: 'super-feature' | 'double-feature' | 'regular';
  movie?: Movie;
  movies?: Movie[];
}

// Column span of a New Releases wall section: a double-feature (critics AND
// audience both love it) spans two adjacent 6-column sections as one display;
// everything else spans one.
export function sectionColSpan(s: NewReleasesSection): number {
  return s.type === 'double-feature' ? SECTION_COLS * 2 : SECTION_COLS;
}

export interface SlotPos {
  col: number;
  shelfIdx: number;
}

export const tempPosition = new THREE.Vector3();
export const tempRotation = new THREE.Euler(0, 0, 0, 'YXZ');
export const tempQuaternion = new THREE.Quaternion();
export const tempScale = new THREE.Vector3();
export const tempMatrix = new THREE.Matrix4();

// The AO-mask layer: meshes that render into the N8AO mask pass (see
// rebuildSSAOExclusionList / the AO compute in three-scene.ts).
export const AO_MASK_LAYER = 27;

// The TV-patch layer: the ambient sets' screen stack (picture / scanlines /
// glass), re-drawn ON ITS OWN over the cached beauty buffer on partial
// composites — see src/partial-composite.ts. Additive (layers.enable), so bit 0
// stays set and the normal render, mirrors and AO are untouched.
export const TV_PATCH_LAYER = 26;

// Scratch fallbacks for the launch flourish / checkout-exit camera paths —
// all run per frame, so no allocations. Underscore names kept from their
// former life as StoreScene statics to keep the extraction diff mechanical.
export const _bagFallback = new THREE.Vector3();
export const _launchCarry = new THREE.Vector3();
export const _bagBaseFallback = new THREE.Vector3();
// Scratch for the bag-phase camera follow (no per-frame allocations).
export const _checkoutBagFallback = new THREE.Vector3();
export const _checkoutCarry = new THREE.Vector3();
export const _checkoutStand = new THREE.Vector3();
export const _checkoutWalkPos = new THREE.Vector3();
export const _checkoutWalkAhead = new THREE.Vector3();

// Hitch-tracer slot for the selection-move handlers (event side, outside
// animate) — see perf-trace.ts.
export const SP_INPUT = perfSlot('inputMs');

// Per-rAF lerp factors for the camera glide toward targetCameraPos/targetLookAt
// (see animate() in three-scene.ts). Every camera move uses the default; the
// over-the-top shelf wrap (Up on the top row, wrapOverShelfTop) glides at the
// slower factor — ~1.6x the settle time — so the longer swing around the
// aisle is easy to track. animate() restores the default once settled.
export const CAMERA_GLIDE_LERP = 0.3;
export const TOP_WRAP_GLIDE_LERP = 0.2;

// Hitch-tracer slots for the hero-case rebind (see perf-trace.ts).
export const SP_MIRROR = perfSlot('mirrorMs');   // Reflector re-render inside the composite
export const CT_MIRROR = perfSlot('mirrorDraw');
// Live planar reflection refresh target, Hz — deliberately well under any
// display rate; store-mirrors.ts explains what that buys.
export const MIRROR_REFRESH_HZ = 20;
export const SP_HERO = perfSlot('heroMs');   // hero-case rebind (real artwork materials)
export const CT_HERO = perfSlot('heroBind'); // selection moved onto a new title

// Inspect-cycle spine stop: the rental copy's yaw when showing its spine.
// A quarter turn (+π/2) would face the spine dead-on; backing off ~16° keeps a
// sliver of the front cover visible so the box still reads as a 3D object.
export const HERO_SPINE_YAW = Math.PI / 2 - 0.28;

// ─── INSPECT POSE ────────────────────────────────────────────────────────────
// Where the two cases stand when one is picked up, in the SLOT's local frame:
// local +X is the shopper's screen-right for every unit orientation, local +Z is
// the outward normal (toward the shopper). The retail cover box fans to +X, the
// rental clamshell to -X.
//
// Named here because store-camera.ts has to agree with the poses store-scene's
// updateHeroCase writes — it solves the camera distance from the pair's total
// span and anchors the look target on their midpoint, so a bare 0.28 edited in
// one file and not the other silently decentres the framing (which is the bug
// GH #43 fixed by hand).
export const INSPECT_FAN_X = 0.28;   // lateral half-separation of the pair
export const INSPECT_CASE_Z = 0.10;  // how far the pair stands out toward the shopper

// Extra forward offset for the RETAIL cover box only, on top of INSPECT_CASE_Z —
// i.e. presenting the cover art nearer the lens than the rental copy beside it.
//
// ZERO, after measuring it (2026-08-17). Worth writing down, because "push the
// cover box forward a little" is an obvious-sounding idea that does not survive
// contact with the flip cycle:
//
//  - The pair is NOT the same apparent size to begin with. The clamshell is
//    physically taller than the sleeve it holds (VHS_RIM_VERTICAL_FT: 0.727ft vs
//    0.667ft), so unflipped the cover box measures ~8% shorter on screen
//    (measured 0.922). A ~0.09ft lead cancels that exactly (measured 1.014).
//  - But the clamshell DROPS to the plain, un-widened case geometry the moment
//    the pair flips or turns to its spine (see updateBackCoverHighlight — the rim
//    widening reads as a stray edge strip once nothing occludes it). At those
//    stops the two are naturally the SAME height, so the same lead makes the
//    retail box ~11% TALLER instead. The lead does not remove the mismatch, it
//    moves it from the front stop to the back stop and slightly enlarges it.
//  - And the 8% it "fixes" is not a defect: a real store's clamshell genuinely
//    is bigger than the box art inside it.
//
// Legibility — the actual goal — came from decoding the front at 3x instead
// (hero-front-detail.ts), which is worth far more than 9% of linear size. If this
// is ever revived, it has to become stop-dependent (no lead while isFlipped ||
// heroSpine) or it just relocates the problem. DOF is not the obstacle: the focal
// plane follows the front mesh (heroFocusDistance) and 0.09ft measured no visible
// softening on the clamshell print.
export const INSPECT_RETAIL_Z_LEAD = 0;

// Camera framing: the pair's span is fitted to this fraction of the frame's
// smaller extent, so LOWER means the cases sit larger/closer. Height governs at
// every ordinary aspect (see the arithmetic in store-camera.ts).
// 1.80 -> 1.55 on owner direction, 2026-08-17: the pair reads ~16% larger, which
// buys real legibility now that the front carries the pixels to earn it.
export const INSPECT_FIT_MARGIN = 1.55;

// Instanced meshes touched by the current slot-pose pass; cleared per frame.
export const updatedMeshes = new Set<THREE.InstancedMesh>();

// Clerk sleep: after 5 minutes without real user input the clerk fades out
// and her roaming sim pauses entirely (see the pre-tier clerk block in
// animate() and the clasp walk watch in store-clerk-flow.ts).
export const CLERK_SLEEP_INPUT_MS = 300_000;

// Overview ("security cam") camera pose and free-look limits.
//
// The vantage is AUTHORED for the corporate box — high in the front-right
// corner, looking back down the floor. x = 24 sits comfortably inside that
// store's right wall (a baseline chain store is ~78 ft wide, so the wall is out
// at x = 50), but it is an absolute world coordinate, and a mom-and-pop store
// is 23.5 ft wide with its right wall at x = 22.75. Left alone, the store's own
// boot view — and the jump index that shares it — stood in the car park looking
// in through the glass.
//
// So the authored x is a CEILING, not a fixed position: resolveOverviewVantage()
// pulls it inside whatever store actually got built. Mutating the vector in
// place (rather than handing out a resolved copy) is deliberate — five call
// sites read this, including two that never see a store width
// (sortByScreenOrder in store-subnav.ts, aimOverviewAt in store-camera.ts), and
// all five read it without mutating. See buildStore, which resolves it before
// anything reads it.
export const OVERVIEW_POS = new THREE.Vector3(24.0, 5.5, 9.5);
const OVERVIEW_AUTHORED_X = OVERVIEW_POS.x;
/** Clear floor (ft) kept between the overview vantage and the right wall. */
const OVERVIEW_WALL_CLEAR = 2.4;

/**
 * Pin the overview vantage inside THIS store's right wall. Idempotent, and a
 * no-op on any store wide enough for the authored position — which is every
 * corporate one.
 */
export function resolveOverviewVantage(storeWidth: number): void {
  const rightWall = STORE_CENTER_X + storeWidth / 2;
  OVERVIEW_POS.x = Math.min(OVERVIEW_AUTHORED_X, rightWall - OVERVIEW_WALL_CLEAR);
}
export const OVERVIEW_LOOK_STEP = 0.085; // rad per arrow press/repeat
export const OVERVIEW_YAW_CLAMP = 1.95;  // ±112°: the store, not the doors
export const OVERVIEW_PITCH_MIN = -0.55; // can't stare at the floor…
export const OVERVIEW_PITCH_MAX = 0.35;  // …or the ceiling
