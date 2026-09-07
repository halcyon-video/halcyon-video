// Blender-authored tall ficus: loads the tools/models/potted-plant.py kit
// (public/models/ficus-components.glb) and stamps it into a branching plant
// with credible attachment, curvature and per-instance growth variety,
// replacing the procedural placeholder built by PottedPlant.buildTallFicusFallback.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url';

const PART_NAMES = ['Pot', 'Saucer', 'Soil', 'Trunk', 'BranchA', 'BranchB', 'LeafA', 'LeafB'] as const;
type PartName = typeof PART_NAMES[number];
type Kit = Map<PartName, THREE.BufferGeometry>;

// Loaded once and cached forever (like this file's sibling canvas textures in
// potted-plant.ts) — a ~1000-triangle kit is cheap to keep, and every ficus
// placement across every store rebuild clones from the same templates.
let kitPromise: Promise<Kit> | null = null;

function loadKit(): Promise<Kit> {
  if (!kitPromise) {
    kitPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(assetUrl('models/ficus-components.glb'), ({ scene }) => {
        const kit: Kit = new Map();
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh && (PART_NAMES as readonly string[]).includes(o.name)) {
            kit.set(o.name as PartName, o.geometry);
          }
        });
        if (PART_NAMES.some((n) => !kit.has(n))) { reject(new Error('ficus kit missing parts')); return; }
        resolve(kit);
      }, undefined, reject);
    });
  }
  return kitPromise;
}

// Matches the authored profile in tools/models/potted-plant.py exactly —
// change one, change the other.
const POT_H = 1.40;
const TRUNK_BASE_Y = POT_H - 0.02;

// Local (bow, growth-fraction) control points for each branch template,
// mirroring the Python tube() centerlines — used only to find where along a
// placed branch's own curve a leaf cluster attaches.
const BRANCH_CURVES: Record<'A' | 'B', [number, number][]> = {
  A: [[0.00, 0.00], [0.12, 0.35], [0.22, 0.70], [0.30, 1.00]],
  B: [[0.00, 0.00], [0.18, 0.30], [0.24, 0.65], [0.26, 1.00]],
};

function sampleBranchBow(kind: 'A' | 'B', t: number): number {
  const pts = BRANCH_CURVES[kind];
  const segT = t * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(segT));
  const f = segT - i;
  return pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f;
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

export interface FicusPieces {
  pot: THREE.BufferGeometry[];
  soil: THREE.BufferGeometry[];
  bark: THREE.BufferGeometry[];
  leaf: THREE.BufferGeometry[];
}

/** Builds one full ficus's transformed geometry pieces, grouped by material
 * role, ready to merge into (at most) four draw calls by the caller.
 */
function buildFicusPieces(kit: Kit, seedKey: string): FicusPieces {
  const rnd = mulberry32(hashSeed(seedKey));
  const pot: THREE.BufferGeometry[] = [kit.get('Pot')!.clone(), kit.get('Saucer')!.clone()];
  const soil: THREE.BufferGeometry[] = [kit.get('Soil')!.clone()];
  const bark: THREE.BufferGeometry[] = [];
  const leaf: THREE.BufferGeometry[] = [];

  // Three-stem trunk cluster, each spun to its own azimuth with a slightly
  // different base offset and scale — a believable clump, not one repeated
  // shape stamped three times at perfect symmetry.
  const trunkGeo = kit.get('Trunk')!;
  for (let i = 0; i < 3; i++) {
    const az = (i / 3) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
    const baseR = 0.07 + rnd() * 0.04;
    const s = 0.9 + rnd() * 0.22;
    const { geometry } = placeCloned(
      trunkGeo,
      (o) => { o.position.set(Math.cos(az) * baseR, TRUNK_BASE_Y, Math.sin(az) * baseR); o.rotation.y = az; },
      (o) => { o.scale.setScalar(s); },
    );
    bark.push(geometry);
  }

  // Seven major limbs arching outward and up, alternating between the two
  // branch templates so the canopy reads as grown, not stamped.
  const branchCount = 7;
  const branchInsts: { kind: 'A' | 'B'; matrix: THREE.Matrix4 }[] = [];
  for (let b = 0; b < branchCount; b++) {
    const kind: 'A' | 'B' = b % 2 === 0 ? 'A' : 'B';
    const branchGeo = kit.get(kind === 'A' ? 'BranchA' : 'BranchB')!;
    const az = (b / branchCount) * Math.PI * 2 + 0.15 + (rnd() - 0.5) * 0.35;
    const branchLen = 1.9 + (b % 3) * 0.3 + (rnd() - 0.5) * 0.25;
    const tilt = (0.55 + (b % 2) * 0.15 + (rnd() - 0.5) * 0.12) * (rnd() < 0.5 ? 1 : -1);
    const startY = POT_H + 1.8 + (b % 3) * 0.2;
    const { geometry, matrix } = placeCloned(
      branchGeo,
      (o) => { o.position.set(0, startY, 0); o.rotation.y = az; },
      (o) => { o.rotation.z = tilt; o.scale.set(1, branchLen, 1); },
    );
    bark.push(geometry);
    branchInsts.push({ kind, matrix });

    // Leaf clusters along this branch's own curve, in world space via the
    // exact matrix the branch mesh itself was placed with.
    const clusterCount = 14;
    for (let c = 0; c < clusterCount; c++) {
      const t = 0.28 + (c / (clusterCount - 1)) * 0.7;
      const bow = sampleBranchBow(kind, t);
      const attach = new THREE.Vector3(bow, t, 0).applyMatrix4(matrix);
      const leafAz = az + c * 1.35 + (rnd() - 0.5) * 0.8;
      const leafGeo = rnd() < 0.5 ? kit.get('LeafA')! : kit.get('LeafB')!;
      const s = 0.82 + rnd() * 0.36;
      const { geometry: leafG } = placeCloned(
        leafGeo,
        (o) => { o.position.copy(attach); o.rotation.y = leafAz; },
        (o) => {
          o.rotation.x = 0.35 + rnd() * 0.7;
          o.rotation.z = (rnd() - 0.5) * 0.6;
          o.scale.setScalar(s);
        },
      );
      leaf.push(leafG);
    }
  }

  // Central crown cluster filling the canopy core above the trunk top.
  const crownCount = 18;
  const crownY = TRUNK_BASE_Y + 2.05;
  for (let c = 0; c < crownCount; c++) {
    const az = (c / crownCount) * Math.PI * 2 + rnd() * 0.5;
    const r = 0.12 + rnd() * 0.22;
    const y = crownY + rnd() * 0.5 - 0.1;
    const leafGeo = c % 2 === 0 ? kit.get('LeafA')! : kit.get('LeafB')!;
    const s = 0.8 + rnd() * 0.3;
    const { geometry: leafG } = placeCloned(
      leafGeo,
      (o) => { o.position.set(Math.cos(az) * r, y, Math.sin(az) * r); o.rotation.y = az; },
      (o) => { o.rotation.x = 0.3 + rnd() * 0.5; o.scale.setScalar(s); },
    );
    leaf.push(leafG);
  }

  return { pot, soil, bark, leaf };
}

export interface FicusInstall {
  cancel: () => void;
}

/** Loads the kit (once, shared) and, on success, builds one plant's merged
 * pieces and hands them to `onReady`. A load failure (or a scene torn down
 * before it resolves) leaves the caller's fallback exactly as it is.
 */
export function installFicus(
  seedKey: string,
  onReady: (pieces: FicusPieces) => void,
): FicusInstall {
  let cancelled = false;
  loadKit().then((kit) => {
    if (cancelled) return;
    onReady(buildFicusPieces(kit, seedKey));
  }).catch(() => { /* missing/broken kit: the procedural fallback stands in */ });
  return { cancel: () => { cancelled = true; } };
}
