// Blender-authored floor palm: loads reusable pot/cane/rachis/pinna templates
// and assembles the existing deterministic plant in four merged draw calls.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url';

const PART_NAMES = ['Pot', 'Saucer', 'Soil', 'Cane', 'RachisA', 'RachisB', 'PinnaA', 'PinnaB'] as const;
type PartName = typeof PART_NAMES[number];
type Kit = Map<PartName, THREE.BufferGeometry>;

let kitPromise: Promise<Kit> | null = null;

function loadKit(): Promise<Kit> {
  if (!kitPromise) {
    kitPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(assetUrl('models/floor-palm-components.glb'), ({ scene }) => {
        const kit: Kit = new Map();
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh && (PART_NAMES as readonly string[]).includes(object.name)) {
            kit.set(object.name as PartName, object.geometry);
          }
        });
        if (PART_NAMES.some((name) => !kit.has(name))) {
          reject(new Error('floor-palm kit missing parts'));
          return;
        }
        resolve(kit);
      }, undefined, reject);
    });
  }
  return kitPromise;
}

const POT_H = 1.30;
const SOIL_TOP = 1.155;
const RACHIS_CURVES = {
  A: [[0.0, 0.0], [0.08, 0.22], [0.20, 0.48], [0.40, 0.74], [0.68, 1.0]],
  B: [[0.0, 0.0], [0.04, 0.20], [0.14, 0.46], [0.34, 0.76], [0.58, 1.0]],
} as const;

function sampleBow(curve: readonly (readonly [number, number])[], t: number): number {
  for (let i = 0; i < curve.length - 1; i++) {
    const [x0, t0] = curve[i];
    const [x1, t1] = curve[i + 1];
    if (t <= t1) return x0 + (x1 - x0) * ((t - t0) / (t1 - t0));
  }
  return curve[curve.length - 1][0];
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cloneAt(source: THREE.BufferGeometry, object: THREE.Object3D): {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
} {
  object.updateWorldMatrix(true, false);
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.applyMatrix4(object.matrixWorld);
  return { geometry, matrix: object.matrixWorld.clone() };
}

function orientedLeaf(
  source: THREE.BufferGeometry,
  at: THREE.Vector3,
  direction: THREE.Vector3,
  faceHint: THREE.Vector3,
  size: number,
): THREE.BufferGeometry {
  const yAxis = direction.clone().normalize();
  let zAxis = faceHint.clone().addScaledVector(yAxis, -faceHint.dot(yAxis));
  if (zAxis.lengthSq() < 0.01) zAxis = new THREE.Vector3(0, 0, 1);
  zAxis.normalize();
  const xAxis = yAxis.clone().cross(zAxis).normalize();
  zAxis = xAxis.clone().cross(yAxis).normalize();
  const rotation = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  const object = new THREE.Object3D();
  object.position.copy(at);
  object.quaternion.setFromRotationMatrix(rotation);
  object.scale.setScalar(size);
  return cloneAt(source, object).geometry;
}

export interface FloorPalmOptions {
  frondScale: number;
  fanSpan: number;
}

export interface FloorPalmPieces {
  pot: THREE.BufferGeometry[];
  soil: THREE.BufferGeometry[];
  stem: THREE.BufferGeometry[];
  leaf: THREE.BufferGeometry[];
}

function buildFloorPalmPieces(kit: Kit, seedKey: string, options: FloorPalmOptions): FloorPalmPieces {
  const rnd = mulberry32(hashSeed(seedKey));
  const pot = [kit.get('Pot')!.clone(), kit.get('Saucer')!.clone()];
  const soil = [kit.get('Soil')!.clone()];
  const stem: THREE.BufferGeometry[] = [];
  const leaf: THREE.BufferGeometry[] = [];

  // A clustered parlour-palm base: every cane emerges from the soil instead
  // of the old fourteen unrelated curves sharing one mathematical point.
  for (let i = 0; i < 5; i++) {
    const azimuth = (i / 5) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const radius = 0.06 + rnd() * 0.18;
    const parent = new THREE.Object3D();
    parent.position.set(Math.cos(azimuth) * radius, SOIL_TOP - 0.02, Math.sin(azimuth) * radius);
    parent.rotation.y = -azimuth;
    const cane = new THREE.Object3D();
    cane.rotation.z = -(rnd() - 0.5) * 0.13;
    cane.scale.set(1, (0.74 + rnd() * 0.46) * options.frondScale, 1);
    parent.add(cane);
    stem.push(cloneAt(kit.get('Cane')!, cane).geometry);
  }

  const frondCount = 14;
  const fullCircle = options.fanSpan >= Math.PI * 2 - 0.01;
  for (let index = 0; index < frondCount; index++) {
    const kind: 'A' | 'B' = index % 2 === 0 ? 'A' : 'B';
    const azimuth = fullCircle
      ? index / frondCount * Math.PI * 2 + (rnd() - 0.5) * 0.28
      : (index / (frondCount - 1) - 0.5) * options.fanSpan + (rnd() - 0.5) * 0.16;
    const crownSpear = index % 7 === 0;
    const length = (crownSpear ? 4.25 : 3.35 + (index % 3) * 0.42 + (rnd() - 0.5) * 0.18)
      * options.frondScale;
    const tilt = crownSpear ? -0.08 : 0.28 + (index % 4) * 0.115 + rnd() * 0.08;
    const parent = new THREE.Object3D();
    parent.position.set(0, POT_H - 0.10 + (index % 3) * 0.035, 0);
    parent.rotation.y = -azimuth;
    const rachis = new THREE.Object3D();
    rachis.rotation.z = -tilt;
    // Stretch only the growth axis. Uniform scaling made a four-foot frond's
    // rachis four times too thick, visually swallowing its leaflets.
    rachis.scale.set(1, length, 1);
    parent.add(rachis);
    const placed = cloneAt(kit.get(kind === 'A' ? 'RachisA' : 'RachisB')!, rachis);
    stem.push(placed.geometry);

    // Opposed pinnae attach to points sampled on the exact authored rachis.
    // Their faces are kept broadly upward while their tips fan sideways and
    // increasingly downward, producing a compound palm frond rather than one
    // oversized spear-shaped card.
    const curve = RACHIS_CURVES[kind];
    const pairs = 9;
    for (let pair = 0; pair < pairs; pair++) {
      const t = 0.20 + pair / (pairs - 1) * 0.64;
      const at = new THREE.Vector3(sampleBow(curve, t), t, 0).applyMatrix4(placed.matrix);
      const radial = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
      const tangent = new THREE.Vector3(-Math.sin(azimuth), 0, Math.cos(azimuth));
      for (const side of [-1, 1]) {
        const direction = tangent.clone().multiplyScalar(side * (0.96 - t * 0.2))
          .addScaledVector(radial, 0.18 + t * 0.32)
          .add(new THREE.Vector3(0, 0.16 - t * 0.42 + (rnd() - 0.5) * 0.07, 0));
        const source = (pair + (side > 0 ? 1 : 0)) % 3 === 0
          ? kit.get('PinnaB')!
          : kit.get('PinnaA')!;
        const size = (0.78 + Math.sin(Math.PI * t) * 0.34 + (rnd() - 0.5) * 0.08)
          * options.frondScale;
        const faceHint = new THREE.Vector3(0, 0.58, 0)
          .addScaledVector(radial, 0.82)
          .addScaledVector(tangent, side * 0.12);
        leaf.push(orientedLeaf(source, at, direction, faceHint, size));
      }
    }

    const tip = new THREE.Vector3(sampleBow(curve, 0.91), 0.91, 0).applyMatrix4(placed.matrix);
    const tipDirection = new THREE.Vector3(Math.cos(azimuth), -0.08, Math.sin(azimuth));
    const tipFace = new THREE.Vector3(Math.cos(azimuth), 0.7, Math.sin(azimuth));
    leaf.push(orientedLeaf(kit.get('PinnaB')!, tip, tipDirection, tipFace, 0.82 * options.frondScale));
  }

  return { pot, soil, stem, leaf };
}

export interface FloorPalmInstall {
  cancel: () => void;
}

export function installFloorPalm(
  seedKey: string,
  options: FloorPalmOptions,
  onReady: (pieces: FloorPalmPieces) => void,
): FloorPalmInstall {
  let cancelled = false;
  loadKit().then((kit) => {
    if (!cancelled) onReady(buildFloorPalmPieces(kit, seedKey, options));
  }).catch(() => { /* missing or broken kit: the procedural fallback remains */ });
  return { cancel: () => { cancelled = true; } };
}
