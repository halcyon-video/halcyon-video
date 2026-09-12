import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import type { StoreScene } from '../three-scene';

/** One load shared by the exit pair; hidden fallback remains the collision rig. */
export function installEasPedestals(
  scene: StoreScene, parent: THREE.Group, fallback: THREE.Group,
  anchors: readonly { x: number; z: number }[],
): void {
  let retired = false;
  let release: (() => void) | undefined;
  parent.addEventListener('removed', function retire() {
    parent.removeEventListener('removed', retire);
    retired = true;
    release?.();
  });
  new GLTFLoader().load(assetUrl('models/eas-pedestal.glb'), ({ scene: model }) => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      }
      o.castShadow = o.receiveShadow = true;
    });
    const instances: THREE.Group[] = [];
    release = () => {
      instances.forEach(o => o.removeFromParent());
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
    };
    let root: THREE.Object3D = parent;
    while (root.parent) root = root.parent;
    if (retired || root !== scene.scene) { release(); return; }
    for (const anchor of anchors) {
      const instance = model.clone(true);
      instance.name = 'eas-pedestal-model';
      instance.position.set(anchor.x, 0, anchor.z);
      instances.push(instance);
      parent.add(instance);
    }
    fallback.visible = false;
    scene.fixtureContext().requestShadowRefresh();
    scene.requestRender();
  }, undefined, error => {
    if (!retired) scene.fixtureContext().log(`EAS model unavailable; retaining built-in pedestals. ${String(error)}`, 'system');
  });
}
