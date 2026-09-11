import { finishEquipmentSurfaces } from './equipment-surfaces';
// Optional local reference-derived equipment. The public/failed-load fallback
// remains the existing undecorated desk; this adds no interaction target.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { brandPackDir } from '../brand-pack';
import type { StoreScene } from '../three-scene';

export function installCounterScanner(scene: StoreScene, parent: THREE.Group): void {
  if (scene.activeTheme.id !== 'bb-2010') return;
  const offset = scene.storefrontSpec.counterShape === 'usquare' ? -2.35 : -2.85;
  const anchor = scene.entrance?.getCounterTopAnchorAt(offset);
  if (!anchor) return;
  const rel = 'fixtures/late-era-fixtures-2012/scanner/model.glb';
  const pack = brandPackDir();
  const candidates = [...(pack ? [`user-assets/${pack}/${rel}`] : []), `user-assets/${rel}`];
  const attached = () => {
    let root: THREE.Object3D = parent;
    while (root.parent) root = root.parent;
    return root === scene.scene;
  };
  const load = (i: number) => {
    if (!attached() || i === candidates.length) return;
    new GLTFLoader().load(assetUrl(candidates[i]), ({ scene: model }) => {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>(finishEquipmentSurfaces(model));
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
        object.castShadow = object.receiveShadow = true;
      });
      if (!attached()) {
        geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
        return;
      }
      const release = () => { parent.removeEventListener('removed', release); textures.forEach(t => t.dispose()); };
      parent.addEventListener('removed', release);
      model.name = 'counter-scanner-model';
      model.position.set(anchor.x + Math.sin(anchor.rotY) * .24, anchor.y, anchor.z + Math.cos(anchor.rotY) * .24);
      model.rotation.y = anchor.rotY;
      parent.add(model);
      // clearActiveSignage owns geometry/material disposal after attachment.
      scene.fixtureContext().requestShadowRefresh();
      scene.requestRender();
    }, undefined, () => load(i + 1));
  };
  load(0);
}
