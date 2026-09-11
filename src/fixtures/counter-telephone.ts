// Static, owned GLB at the existing phone anchor; original geometry remains
// available during loading and on failure. Optional local equipment wins.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { counterMount, placeOnCounterMount } from '../entrance/counter-mounts';
import { brandPackDir } from '../brand-pack';
import { finishTelephone, refreshTelephoneContact } from './telephone-surfaces';
import type { StoreScene } from '../three-scene';

export function installCounterTelephone(
  scene: StoreScene, parent: THREE.Group, fallback: THREE.Group,
  origin: THREE.Vector3, yaw: number,
): void {
  const rel = 'fixtures/late-era-fixtures-2012/telephone/model.glb';
  const pack = brandPackDir();
  const candidates = [
    ...(pack ? [`user-assets/${pack}/${rel}`] : []),
    `user-assets/${rel}`, 'models/counter-telephone.glb',
  ];
  const attached = () => {
    let root: THREE.Object3D = parent;
    while (root.parent) root = root.parent;
    return root === scene.scene;
  };
  const load = (i: number) => {
    if (!attached() || i === candidates.length) return;
    new GLTFLoader().load(assetUrl(candidates[i]), ({ scene: model }) => {
      const contact = finishTelephone(model);
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
        geometries.forEach(g => g.dispose());
        materials.forEach(m => m.dispose());
        textures.forEach(t => t.dispose());
        return;
      }
      const releaseTextures = () => {
        parent.removeEventListener('removed', releaseTextures);
        model.userData.contactCleanup?.();
        textures.forEach(t => t.dispose());
      };
      parent.addEventListener('removed', releaseTextures);
      model.name = 'counter-telephone-model';
      model.position.copy(origin);
      model.rotation.y = yaw;
      parent.add(model);
      void scene.entrance?.whenCounterModelReady().then(counter => {
        const mount = counter && counterMount(counter, 'mount_telephone');
        if (!mount || !attached()) return;
        model.userData.contactCleanup?.();
        placeOnCounterMount(model, mount);
        refreshTelephoneContact(parent);
        scene.fixtureContext().requestShadowRefresh();
        scene.requestRender();
      });
      model.userData.contactTexture = contact;
      refreshTelephoneContact(parent);
      fallback.visible = false;
      // clearActiveSignage owns both sets of geometry/materials.
      scene.fixtureContext().requestShadowRefresh();
      scene.requestRender();
    }, undefined, () => load(i + 1));
  };
  load(0);
}
