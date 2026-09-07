// Blender-authored snake plant: a glazed planter and three curved blade
// templates assembled deterministically into three merged draw calls.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url';

const PART_NAMES = ['Pot', 'Saucer', 'Soil', 'BladeA', 'BladeB', 'BladeC'] as const;
type PartName = typeof PART_NAMES[number];
type Kit = Map<PartName, THREE.BufferGeometry>;

let kitPromise: Promise<Kit> | null = null;

function loadKit(): Promise<Kit> {
  if (!kitPromise) {
    kitPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(assetUrl('models/snake-plant-components.glb'), ({ scene }) => {
        const kit: Kit = new Map();
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh && (PART_NAMES as readonly string[]).includes(object.name)) {
            kit.set(object.name as PartName, object.geometry);
          }
        });
        if (PART_NAMES.some((name) => !kit.has(name))) {
          reject(new Error('snake-plant kit missing parts'));
          return;
        }
        resolve(kit);
      }, undefined, reject);
    });
  }
  return kitPromise;
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

function cloneAt(source: THREE.BufferGeometry, object: THREE.Object3D): THREE.BufferGeometry {
  object.updateWorldMatrix(true, false);
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.applyMatrix4(object.matrixWorld);
  return geometry;
}

export interface SnakePlantPieces {
  pot: THREE.BufferGeometry[];
  soil: THREE.BufferGeometry[];
  leaf: THREE.BufferGeometry[];
}

function buildSnakePlantPieces(kit: Kit, seedKey: string): SnakePlantPieces {
  const rnd = mulberry32(hashSeed(seedKey));
  const pot = [kit.get('Pot')!.clone(), kit.get('Saucer')!.clone()];
  const soil = [kit.get('Soil')!.clone()];
  const leaf: THREE.BufferGeometry[] = [];
  const names = ['BladeA', 'BladeB', 'BladeC'] as const;

  // Three loose growth rings, not a radial fence: bases are jittered and the
  // tall young leaves remain toward the crown while older outer blades splay.
  for (let index = 0; index < 15; index++) {
    const ring = index < 5 ? 0.10 : (index < 10 ? 0.22 : 0.33);
    const azimuth = (index * 2.399) % (Math.PI * 2) + (rnd() - 0.5) * 0.22;
    const height = 1.52 + (1 - ring / 0.4) * 1.15 + (rnd() - 0.5) * 0.42;
    const object = new THREE.Object3D();
    object.position.set(
      Math.cos(azimuth) * (ring + (rnd() - 0.5) * 0.035),
      0.86 + (rnd() - 0.5) * 0.035,
      Math.sin(azimuth) * (ring + (rnd() - 0.5) * 0.035),
    );
    object.rotation.order = 'YXZ';
    object.rotation.y = azimuth + (rnd() - 0.5) * 0.55;
    const splay = (ring / 0.33) * (0.045 + rnd() * 0.07);
    object.rotation.z = -Math.cos(azimuth) * splay;
    object.rotation.x = Math.sin(azimuth) * splay;
    object.scale.setScalar(height);
    leaf.push(cloneAt(kit.get(names[index % names.length])!, object));
  }

  return { pot, soil, leaf };
}

export interface SnakePlantInstall {
  cancel: () => void;
}

export function installSnakePlant(
  seedKey: string,
  onReady: (pieces: SnakePlantPieces) => void,
): SnakePlantInstall {
  let cancelled = false;
  loadKit().then((kit) => {
    if (!cancelled) onReady(buildSnakePlantPieces(kit, seedKey));
  }).catch(() => { /* missing or broken kit: the procedural fallback remains */ });
  return { cancel: () => { cancelled = true; } };
}
