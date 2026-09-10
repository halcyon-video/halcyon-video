// Optional local reference-derived equipment. The public/failed-load fallback
// remains the existing undecorated desk; this adds no interaction target.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { brandPackDir } from '../brand-pack';
import { extractHousingContact, refreshEquipmentContact } from './counter-equipment-contact';
import type { StoreScene } from '../three-scene';

export function installCounterCashHousing(scene: StoreScene, parent: THREE.Group): void {
  if (scene.activeTheme.id !== 'bb-2010' || scene.storefrontSpec.counterShape === 'desk') return;
  // The clear stretch between the membership frame and rewinder.
  const offset = 1.7;
  const anchor = scene.entrance?.getCounterTopAnchorAt(offset);
  if (!anchor) return;
  const rel = 'fixtures/late-era-fixtures-2012/checkout-hardware/model.glb';
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
      const contact = extractHousingContact(model);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      if (contact) textures.add(contact);
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
      const release = () => {
        parent.removeEventListener('removed', release);
        model.userData.contactCleanup?.();
        textures.forEach(t => t.dispose());
      };
      parent.addEventListener('removed', release);
      model.name = 'counter-cash-housing-model';
      model.position.set(anchor.x, anchor.y, anchor.z);
      model.rotation.y = anchor.rotY;
      model.userData.contactTexture = contact;
      parent.add(model);
      refreshEquipmentContact(parent);
      // clearActiveSignage owns geometry/material disposal after attachment.
      scene.fixtureContext().requestShadowRefresh();
      scene.requestRender();
    }, undefined, () => load(i + 1));
  };
  load(0);
}
