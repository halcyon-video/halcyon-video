// Shared scene-module declarations: the no-per-frame-allocation scratch
// registers and case-transform constants used by StoreScene (three-scene.ts)
// and the extracted scene modules (store-stock.ts, ...). Single-threaded
// use only — every consumer fully writes a temp before reading it back.
import * as THREE from 'three';
import { Movie } from './jellyfin';
import { SECTION_COLS } from './store-layout';
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
export const SP_HERO = perfSlot('heroMs');   // hero-case rebind (real artwork materials)
export const CT_HERO = perfSlot('heroBind'); // selection moved onto a new title

// Inspect-cycle spine stop: the rental copy's yaw when showing its spine.
// A quarter turn (+π/2) would face the spine dead-on; backing off ~16° keeps a
// sliver of the front cover visible so the box still reads as a 3D object.
export const HERO_SPINE_YAW = Math.PI / 2 - 0.28;

// Instanced meshes touched by the current slot-pose pass; cleared per frame.
export const updatedMeshes = new Set<THREE.InstancedMesh>();

// Clerk sleep: after 5 minutes without real user input the clerk fades out
// and her roaming sim pauses entirely (see the pre-tier clerk block in
// animate() and the clasp walk watch in store-clerk-flow.ts).
export const CLERK_SLEEP_INPUT_MS = 300_000;

// Overview ("security cam") camera pose and free-look limits.
export const OVERVIEW_POS = new THREE.Vector3(24.0, 5.5, 9.5);
export const OVERVIEW_LOOK_STEP = 0.085; // rad per arrow press/repeat
export const OVERVIEW_YAW_CLAMP = 1.95;  // ±112°: the store, not the doors
export const OVERVIEW_PITCH_MIN = -0.55; // can't stare at the floor…
export const OVERVIEW_PITCH_MAX = 0.35;  // …or the ceiling
