import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url.ts';
import { disposeDetachedModel } from './model-resources.ts';
import { selfLit } from './material-lighting.ts';

export const DOWNLIGHT_APERTURE_RADIUS = 0.32; // feet (7.68 in opening diameter)
export const DOWNLIGHT_TRIM_RADIUS = 0.41; // feet (9.84 in trim outer diameter)
export const DOWNLIGHT_CAN_DEPTH = 0.55; // feet (6.6 in plenum can depth)
export const DOWNLIGHT_TRIM_DROP = 0.015; // feet into room below ceiling plane

export interface DownlightPlacement {
  x: number;
  y: number;
  z: number;
}

/**
 * Loads the original Blender-authored recessed downlight model and instances it
 * at the verified fixture centers. Preserves fallback visibility while loading or on error.
 */
export function installDownlightModels(
  parent: THREE.Group,
  positions: DownlightPlacement[],
  fallbackGroup?: THREE.Group,
  onLoaded?: () => void,
): () => void {
  let disposed = false;
  let hardware: THREE.Group | undefined;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  const release = () => {
    geometries.forEach(g => g.dispose()); geometries.clear();
    materials.forEach(m => m.dispose()); materials.clear();
    hardware?.removeFromParent();
    hardware = undefined;
  };

  const onParentRemoved = () => {
    disposed = true;
    release();
  };
  parent.addEventListener('removed', onParentRemoved);

  if (fallbackGroup && fallbackGroup.children.length > 0) {
    const firstMesh = fallbackGroup.children[0] as THREE.Mesh;
    firstMesh.geometry?.addEventListener('dispose', onParentRemoved);
  }

  const applyModel = (scene: THREE.Group) => {
    if (disposed || !parent.parent) {
      disposeDetachedModel(scene);
      return;
    }

    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      geometries.add(obj.geometry);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        materials.add(m);
        if (m.name === 'DownlightLamp' || (m as THREE.MeshStandardMaterial).emissive?.getHex()) {
          selfLit(m, 'light-source');
        }
      }
      obj.castShadow = true;
      obj.receiveShadow = true;
    });

    hardware = new THREE.Group();
    hardware.name = 'recessed-downlights';

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const instance = scene.clone(true);
      instance.name = `recessed-downlight-${i}`;
      instance.position.set(pos.x, pos.y, pos.z);
      hardware.add(instance);
    }

    parent.add(hardware);
    if (fallbackGroup) {
      fallbackGroup.visible = false;
    }
    onLoaded?.();
  };

  const loader = new GLTFLoader();

  if (typeof window === 'undefined') {
    void (async () => {
      try {
        const fsMod = 'node:fs';
        const fs = await import(/* @vite-ignore */ fsMod);
        const fileUrl = new URL('../public/models/recessed-downlight.glb', import.meta.url);
        const bytes = fs.readFileSync(fileUrl);
        const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
        applyModel(gltf.scene);
      } catch {
        // Retain procedural fallback on error
      }
    })();
  } else {
    loader.load(
      assetUrl('models/recessed-downlight.glb'),
      (gltf) => {
        applyModel(gltf.scene);
      },
      undefined,
      () => {
        // Retain procedural fallback on error
      },
    );
  }

  return () => {
    disposed = true;
    parent.removeEventListener('removed', onParentRemoved);
    release();
  };
}
