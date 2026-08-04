// REAL reflections for every sheet of glass in the store — the in-scene CRT
// tubes (ceiling sets, the bb-2000 wall bank, the front-counter terminals, the
// back-room hero TV) and the architectural glazing (storefront window bays,
// vestibule walls and door leaves, the store side walls).
//
// What this replaces, and why. Every glass surface in the app was some flavour
// of
//   MeshPhysicalMaterial({ transparent: true, opacity: 0.06, clearcoat: … })
// which is a reflection that can never be seen. Three multiplies the whole
// fragment — env reflection and clearcoat included — by diffuseColor.a, and
// normal blending is (SRC_ALPHA, ONE_MINUS_SRC_ALPHA), so the store's
// reflection landed on the glass at SIX PERCENT of its strength: about 0.2% of
// the environment head-on, rising to 6% at a full grazing angle. The panes'
// own comments say what was wanted — "at grazing angles the panes mirror the
// lit interior, the lit-store-at-dusk look", "its presence should come from
// the fresnel reflections, not a fog of opacity" — and alpha was quietly
// cancelling it. On the CRTs a white arc painted into the tube texture stood
// in for the missing reflection, which is what read as a smudge: a bitmap
// cannot slide across the glass as you walk past it.
//
// The recipe here is the physically-correct one:
//   * BLACK base colour + ADDITIVE blending at opacity 1. A room reflected in
//     glass is light ADDED on top, not a tint mixed in — so nothing is
//     attenuated, and whatever is behind the pane (phosphor, or the street
//     through a window) keeps its exact brightness. That last part is what the
//     0.06 opacity was really protecting, and it costs nothing here.
//   * The reflection is three's own specular IBL off scene.environment (the
//     store's PMREM bake — troffer rows, the front glazing, the shelf field),
//     so it is VIEW-DEPENDENT: it sweeps across the glass as the camera moves.
//   * Fresnel comes free from the physical BRDF (F0 = 0.04): dim head-on,
//     approaching a mirror at grazing angles. On a CRT the tube's convex bulge
//     turns that into the bright rim every real set has; on a window it is the
//     whole effect.
//
// ARCHITECTURAL GLAZING KEEPS ITS EXISTING PANE. The transparent material is
// what transmits the exterior, and it must stay — you cannot get transmission
// and an un-attenuated reflection out of one blend mode, and three's physically
// correct answer (`transmission`) costs a full extra scene render per frame,
// which this app cannot spend. So addGlassReflectionPane() floats a second
// mesh on the SAME geometry. See its notes for the cost.
//
// Perf doctrine (the app idles for days): no probes, no render targets, no
// per-frame work anywhere in here. The reflection updates only because the
// scene re-renders when the camera moves, which it was going to do anyway.
import * as THREE from 'three';
import { useCheapMaterials } from './canvas-textures';
import { DAY_ENV_DISPLAY_GAIN } from './outdoor-lighting';

export interface GlassReflectionOptions {
  /**
   * Absolute strength of the reflected environment. 1 = physically plain
   * glass; the CRT preset below runs hotter on purpose.
   */
  envMapIntensity?: number;
  /**
   * Scales the clearcoat + specular LAYERS (clamped to 0..1), as opposed to
   * the environment feeding them. Both knobs exist because envMapIntensity
   * only touches the image of the room (IBL). In a space lit by actual lights
   * rather than by the store's emissive troffers — the back room, which runs
   * on distance-capped point lights — most of what lands on the glass is
   * DIRECT specular, and turning envMapIntensity down there changes nothing
   * visible at all.
   */
  layerGain?: number;
  /** Higher = softer/dustier reflection. Distant screens can afford more. */
  roughness?: number;
  /** Tints the reflection only; whatever is behind the pane is untouched. */
  tint?: number;
  side?: THREE.Side;
  /**
   * Hold the reflection at its DAY strength in every outside mode, via
   * StoreScene.applyExteriorEnvClamp (default true — see the userData below).
   *
   * Off for surfaces read HEAD-ON, where it does more harm than good. The
   * night gain of 3.0 is not free brightness: it compensates for a night bake
   * that has no daylight in it, and the two very nearly cancel. Measured on
   * the counter CRT, screen-region mean luma: day 43.4, night 42.0 — already
   * stable. Dividing the gain back out on top of the darker bake would leave
   * such a surface visibly DIMMER after dark than the look it was tuned to.
   * The clamp earns its keep at GRAZING angles, where fresnel approaches 1 and
   * the same gain blows a pane out white.
   */
  holdAtDayGain?: boolean;
}

/**
 * The additive reflection material itself. Pair it with a mesh floated just
 * proud of the surface it reflects for, `renderOrder` above that surface
 * (reflections sit on top, the way they do on real glass) and castShadow off —
 * transparent glass must not shadow as an opaque slab.
 *
 * Always build one per surface rather than sharing a module singleton: the
 * generic scene-teardown traverse disposes mesh materials on every store
 * rebuild, so a cached one would come back dead.
 */
export function makeGlassReflectionMaterial(opts: GlassReflectionOptions = {}): THREE.MeshPhysicalMaterial {
  const envMapIntensity = opts.envMapIntensity ?? 1;
  const layerGain = THREE.MathUtils.clamp(opts.layerGain ?? 1, 0, 1);
  const mat = new THREE.MeshPhysicalMaterial({
    // Black + additive = the material contributes ONLY reflected light. There
    // is no diffuse term to darken what sits behind the glass.
    color: 0x000000,
    // opacity MUST stay 1: AdditiveBlending is (SRC_ALPHA, ONE), so any value
    // below 1 scales the reflection right back down — the original bug.
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    metalness: 0,
    roughness: opts.roughness ?? 0.05,
    // The second, harder specular layer: a polished front surface over the
    // substrate. Its own Fresnel is what puts the bright rim at grazing angles.
    clearcoat: layerGain,
    clearcoatRoughness: 0.05,
    specularIntensity: layerGain,
    envMapIntensity,
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.tint !== undefined) mat.specularColor = new THREE.Color(opts.tint);
  // The per-mode display gain exists to scale the room's DIFFUSE light (night
  // runs it at 3.0 so the troffers can carry the store), but on a near-mirror
  // it multiplies the whole reflection: the existing glazing already guards
  // against this, having blown out white overhead in the vestibule at night.
  // Declaring the day-strength target opts this pane into the same retarget.
  // See StoreScene.applyExteriorEnvClamp, and holdAtDayGain for when NOT to.
  if (opts.holdAtDayGain ?? true) {
    mat.userData.envGainTarget = envMapIntensity * DAY_ENV_DISPLAY_GAIN;
  }
  return mat;
}

// ── CRT tubes ────────────────────────────────────────────────────────────────

// Reflection strength for tube glass, tuned against the 1993 POS reference
// photo (a 1993 rental POS terminal): the tube reads as glass
// under the store's troffers without washing the phosphor out. Deliberately
// hotter than plain glass — a CRT face is a much better mirror than a window,
// and these are small surfaces read at a distance.
const CRT_ENV_INTENSITY = 2.6;

// Slightly cool, slightly green — leaded CRT face glass, never a neutral
// mirror.
const CRT_SPECULAR_TINT = 0xd8e4e2;

export interface CrtGlassOptions {
  /**
   * How reflective this tube is overall. 1 = the tuned default; below 1 dims
   * the glass (and its direct-specular half with it — see layerGain), above 1
   * boosts what the environment contributes.
   */
  intensity?: number;
  /** Higher = softer/dustier reflection. */
  roughness?: number;
}

export function makeCrtGlassMaterial(opts: CrtGlassOptions = {}): THREE.MeshPhysicalMaterial {
  const gain = opts.intensity ?? 1;
  return makeGlassReflectionMaterial({
    envMapIntensity: CRT_ENV_INTENSITY * gain,
    // Above 1 there is nothing left to open up on the reflective layers (both
    // cap at fully-glassy), so the extra gain goes to the environment alone.
    layerGain: gain,
    roughness: opts.roughness ?? 0.10,
    tint: CRT_SPECULAR_TINT,
    // Tubes are read head-on, where the night gain and the darker night bake
    // already cancel out — see holdAtDayGain. Clamping here would make the
    // sets dimmer after dark than the daytime look they were tuned against.
    holdAtDayGain: false,
  });
}

// ── Architectural glazing ────────────────────────────────────────────────────

/**
 * Float an additive reflection pane on an existing sheet of window glass,
 * sharing its geometry and transform. `glass` keeps its transparent material
 * and goes on transmitting the exterior exactly as before; this pane adds the
 * reflection that alpha was cancelling.
 *
 * Returns null on the low-quality tier. The glazing already drops its
 * clearcoat ripple there for a stated reason — "a second specular lobe on
 * DoubleSide transparent panes this large is real per-fragment cost" — and
 * this would be a third pass over the same very large panes.
 *
 * Cost when it does build: one extra transparent draw per pane, no new
 * geometry (shared by reference; the teardown traverse disposing it twice is a
 * documented no-op, and this file's neighbours already share frame geometry
 * across meshes the same way).
 */
export function addGlassReflectionPane(
  glass: THREE.Mesh,
  parent: THREE.Object3D,
  opts: GlassReflectionOptions = {},
): THREE.Mesh | null {
  if (useCheapMaterials()) return null;
  const pane = new THREE.Mesh(glass.geometry, makeGlassReflectionMaterial({
    // Window glass is plain glass: F0 = 0.04 head-on rising to a mirror at
    // grazing, and no gain on top. That IS the "lit store at dusk" read the
    // panes were always meant to have.
    envMapIntensity: 1,
    side: THREE.DoubleSide,
    ...opts,
  }));
  pane.position.copy(glass.position);
  pane.quaternion.copy(glass.quaternion);
  pane.scale.copy(glass.scale);
  // Above the glass it sits on, so the reflection composites over the
  // transmitted image rather than under it.
  pane.renderOrder = glass.renderOrder + 1;
  // Never shadowed: an additive reflection darkened by a shadow map would be
  // light subtracted from a surface the light never landed on.
  pane.castShadow = false;
  pane.receiveShadow = false;
  parent.add(pane);
  return pane;
}
