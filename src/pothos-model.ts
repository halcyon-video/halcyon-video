// Blender-authored countertop pothos: loads the tools/models/pothos.py kit
// (public/models/pothos-components.glb) and stamps it into a trailing plant
// with real vines, petiole attachment and per-instance growth variety,
// replacing the procedural placeholder built by PottedPlant.buildPothosFallback.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url';

const PART_NAMES = ['Pot', 'Saucer', 'Soil', 'VineA', 'VineB', 'Petiole', 'LeafA', 'LeafB'] as const;
type PartName = typeof PART_NAMES[number];
type Kit = Map<PartName, THREE.BufferGeometry>;

// Loaded once and cached forever, like the ficus kit next door — an ~860
// triangle kit is cheap to keep, and every pothos placement across every
// store rebuild clones from the same templates.
let kitPromise: Promise<Kit> | null = null;

function loadKit(): Promise<Kit> {
  if (!kitPromise) {
    kitPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(assetUrl('models/pothos-components.glb'), ({ scene }) => {
        const kit: Kit = new Map();
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh && (PART_NAMES as readonly string[]).includes(o.name)) {
            kit.set(o.name as PartName, o.geometry);
          }
        });
        if (PART_NAMES.some((n) => !kit.has(n))) { reject(new Error('pothos kit missing parts')); return; }
        resolve(kit);
      }, undefined, reject);
    });
  }
  return kitPromise;
}

// Matches the authored profile in tools/models/pothos.py exactly — change one,
// change the other.
const POT_H = 0.48;
const RIM_R = 0.32;
const SOIL_TOP = 0.36;

// Local (bow, growth-fraction) control points for each swept template,
// mirroring the Python tube() centrelines. Used only to find where along a
// placed stem's OWN curve the next thing attaches, so a leaf sits on the vine
// instead of hovering near it.
type Curve = readonly (readonly [number, number])[];
const VINE_A: Curve = [[0, 0], [0.09, 0.30], [0.30, 0.60], [0.64, 0.84], [1.05, 1.00]];
const VINE_B: Curve = [[0, 0], [0.14, 0.28], [0.44, 0.56], [0.86, 0.80], [1.35, 0.96]];
const PETIOLE: Curve = [[0, 0], [0.03, 0.50], [0.09, 1.00]];

/** Bow (local +X) at growth fraction `t` along a template's authored curve. */
function sampleBow(curve: Curve, t: number): number {
  const last = curve.length - 1;
  if (t <= curve[0][1]) return curve[0][0];
  for (let i = 0; i < last; i++) {
    const [b0, t0] = curve[i];
    const [b1, t1] = curve[i + 1];
    if (t <= t1) return b0 + (b1 - b0) * (t1 === t0 ? 0 : (t - t0) / (t1 - t0));
  }
  // Past the authored tip (a vine template stops just short of 1.0): keep
  // extending along the last segment's slope rather than clamping, so a node
  // asked for near the very end still lands ON the curve.
  const [b0, t0] = curve[last - 1];
  const [b1, t1] = curve[last];
  return b1 + (b1 - b0) * (t - t1) / (t1 - t0);
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Clones `source`, applies a rigid outer placement then an inner tilt/scale
 * (mirroring a two-level THREE scene graph), and returns the transformed copy
 * plus the matrix used — never mutates the shared cached template geometry.
 *
 * The outer yaw is set to `-azimuth` throughout this module so a template's
 * local +X points radially OUTWARD from the pot's axis and local +Z runs
 * tangentially. Every caller then passes a POSITIVE `tilt` meaning "lean this
 * far out over the rim", applied as `rotation.z = -tilt`: a positive Z Euler
 * would swing +Y toward -X, i.e. back over the pot's middle, which is how a
 * trailing vine ends up standing on end. With the sign flipped, the growth
 * axis runs from straight up (0) to straight out (pi/2) and the authored bow
 * — which lives in local +X — falls downward as the hang.
 */
function placeCloned(
  source: THREE.BufferGeometry,
  outer: (o: THREE.Object3D) => void,
  inner: (o: THREE.Object3D) => void,
): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 } {
  const parent = new THREE.Object3D();
  outer(parent);
  const child = new THREE.Object3D();
  inner(child);
  parent.add(child);
  parent.updateMatrixWorld(true);
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.applyMatrix4(child.matrixWorld);
  return { geometry, matrix: child.matrixWorld.clone() };
}

export interface PothosPieces {
  pot: THREE.BufferGeometry[];
  soil: THREE.BufferGeometry[];
  stem: THREE.BufferGeometry[];
  leaf: THREE.BufferGeometry[];
}

/** Builds one full pothos's transformed geometry pieces, grouped by material
 * role, ready to merge into (at most) four draw calls by the caller.
 */
function buildPothosPieces(kit: Kit, seedKey: string): PothosPieces {
  const rnd = mulberry32(hashSeed(seedKey));
  const pot: THREE.BufferGeometry[] = [kit.get('Pot')!.clone(), kit.get('Saucer')!.clone()];
  const soil: THREE.BufferGeometry[] = [kit.get('Soil')!.clone()];
  const stem: THREE.BufferGeometry[] = [];
  const leaf: THREE.BufferGeometry[] = [];
  const petioleGeo = kit.get('Petiole')!;

  /** One leaf on its own stalk: the stalk is placed first, then the blade is
   * pinned to the stalk's authored TIP, so the join is a real attachment
   * rather than two shapes that happen to overlap. The blade carries on past
   * the stalk's tilt (`hinge`) — a leaf hangs a little further over than the
   * petiole that holds it.
   */
  const sprout = (at: THREE.Vector3, az: number, tilt: number, stalk: number, hinge: number, size: number) => {
    const { geometry: stalkGeo, matrix } = placeCloned(
      petioleGeo,
      (o) => { o.position.copy(at); o.rotation.y = -az; },
      (o) => { o.rotation.z = -tilt; o.scale.setScalar(stalk); },
    );
    stem.push(stalkGeo);
    const tip = new THREE.Vector3(sampleBow(PETIOLE, 1), 1, 0).applyMatrix4(matrix);
    const blade = rnd() < 0.5 ? kit.get('LeafA')! : kit.get('LeafB')!;
    const { geometry: leafGeo } = placeCloned(
      blade,
      (o) => { o.position.copy(tip); o.rotation.y = -(az + (rnd() - 0.5) * 0.5); },
      (o) => {
        // 'ZXY' so the Y term is a ROLL about the blade's own length axis,
        // applied before the outward tilt. Without it every blade stands on
        // edge — the authored face normal is local +Z, which the outer yaw
        // aims tangentially, and a Z-only tilt never moves it. Rolled a
        // quarter turn back, the blade presents its face upward, which is
        // what a leaf does and what makes the plant read as foliage instead
        // of a fan of green slivers.
        o.rotation.order = 'ZXY';
        o.rotation.y = -Math.PI / 2 + (rnd() - 0.5) * 1.2;
        o.rotation.x = (rnd() - 0.5) * 0.35;
        o.rotation.z = -(tilt + hinge);
        o.scale.setScalar(size);
      },
    );
    leaf.push(leafGeo);
  };

  // Crown: leaves on short stalks rising out of the soil, splaying outward.
  // These are the leaves you read first looking down at a desk plant.
  const crown = 11;
  for (let i = 0; i < crown; i++) {
    const az = (i / crown) * Math.PI * 2 + (rnd() - 0.5) * 0.55;
    const r = 0.05 + rnd() * 0.09;
    const at = new THREE.Vector3(Math.cos(az) * r, SOIL_TOP - 0.015, Math.sin(az) * r);
    sprout(at, az, 0.34 + rnd() * 0.48, 0.15 + rnd() * 0.09, 0.32 + rnd() * 0.45, 0.86 + rnd() * 0.3);
  }

  // Rim skirt: a few blades spilling straight over the lip. Without them the
  // crown floats above a bare band of terracotta and the vines look bolted on
  // rather than grown out of the same plant.
  const skirt = 5;
  for (let i = 0; i < skirt; i++) {
    const az = (i / skirt) * Math.PI * 2 + 0.7 + (rnd() - 0.5) * 0.5;
    const at = new THREE.Vector3(Math.cos(az) * (RIM_R - 0.09), POT_H - 0.10, Math.sin(az) * (RIM_R - 0.09));
    sprout(at, az, 1.05 + rnd() * 0.3, 0.09 + rnd() * 0.05, 0.5 + rnd() * 0.4, 0.78 + rnd() * 0.26);
  }

  // Trailing vines: each leaves the pot just under the rim, swings out over
  // it, and drapes down onto the counter. Span and drop scale separately so a
  // vine can sprawl across the surface without diving through it.
  const vines = 5;
  for (let v = 0; v < vines; v++) {
    const kind = v % 2 === 0 ? 'A' : 'B';
    const curve = kind === 'A' ? VINE_A : VINE_B;
    const az = (v / vines) * Math.PI * 2 + 0.35 + (rnd() - 0.5) * 0.5;
    // Span reaches OUT, drop falls away — kept apart so a vine can sprawl
    // the width of a desk pot without the drop scaling up with it. A pothos
    // on a counter cascades; it does not hold its vines out like arms.
    const span = 0.20 + rnd() * 0.12;
    const drop = 0.23 + rnd() * 0.12;
    const tilt = 1.00 + rnd() * 0.46;
    const at = new THREE.Vector3(Math.cos(az) * (RIM_R - 0.05), POT_H - 0.06, Math.sin(az) * (RIM_R - 0.05));
    const { geometry: vineGeo, matrix } = placeCloned(
      kit.get(kind === 'A' ? 'VineA' : 'VineB')!,
      (o) => { o.position.copy(at); o.rotation.y = -az; },
      (o) => { o.rotation.z = -tilt; o.scale.set(drop, span, drop); },
    );
    stem.push(vineGeo);

    // Leaf nodes along this vine's own curve, alternating sides the way a
    // pothos actually alternates its nodes. The stalk reaches out (tilt just
    // under a right angle) and the blade hinges PAST vertical-out, so it
    // hangs tip-down with its face turned up and outward — the only way a
    // trailing leaf is legible from standing height at a counter. Nodes stop
    // short of the vine's tip so the lowest blade still clears the surface.
    const nodes = 3 + (v % 3);
    for (let n = 0; n < nodes; n++) {
      const t = 0.20 + (n / Math.max(1, nodes - 1)) * 0.62;
      const world = new THREE.Vector3(sampleBow(curve, t), t, 0).applyMatrix4(matrix);
      const side = n % 2 === 0 ? 0.55 : -0.55;
      sprout(
        world,
        az + side + (rnd() - 0.5) * 0.45,
        1.15 + t * 0.25 + (rnd() - 0.5) * 0.2,
        0.07 + rnd() * 0.05,
        0.45 + rnd() * 0.40,
        0.72 + rnd() * 0.26,
      );
    }
  }

  return { pot, soil, stem, leaf };
}

export interface PothosInstall {
  cancel: () => void;
}

/** Loads the kit (once, shared) and, on success, builds one plant's pieces and
 * hands them to `onReady`. A load failure (or a scene torn down before it
 * resolves) leaves the caller's fallback exactly as it is.
 */
export function installPothos(
  seedKey: string,
  onReady: (pieces: PothosPieces) => void,
): PothosInstall {
  let cancelled = false;
  loadKit().then((kit) => {
    if (cancelled) return;
    onReady(buildPothosPieces(kit, seedKey));
  }).catch(() => { /* missing/broken kit: the procedural fallback stands in */ });
  return { cancel: () => { cancelled = true; } };
}
