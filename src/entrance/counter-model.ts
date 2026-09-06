// Blender-authored millwork. Layout/nav/prop anchors remain owned by counter.ts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import type { FixtureContext } from '../fixtures';
import type { StorefrontSpec } from '../store-layout';

export function installCounterModel(
  ctx: FixtureContext,
  parent: THREE.Group,
  fallback: THREE.Group,
  shape: StorefrontSpec['counterShape'],
  rounded: boolean,
  placement: { x: number; z: number; yaw: number },
  finishes: { body: THREE.Material; top: THREE.Material; inlay: THREE.Material; worktop: THREE.Material },
): void {
  const materials: Record<string, THREE.Material> = {
    CounterBody: finishes.body, CounterTop: finishes.top,
    CounterInlay: finishes.inlay, CounterWorktop: finishes.worktop,
  };
  const filename = `checkout-counter-${shape}-${rounded ? 'rounded' : 'laminate'}.glb`;
  new GLTFLoader().load(assetUrl(`models/${filename}`), ({ scene: model }) => {
    // A settings rebuild can detach the entrance while this request is in flight.
    let root: THREE.Object3D = parent;
    while (root.parent) root = root.parent;
    const detached = root !== ctx.scene;
    const replacedMaterials = new Set<THREE.Material>();
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (detached) object.geometry.dispose();
      const replace = (material: THREE.Material) => {
        const finish = materials[material.name];
        if (finish || detached) replacedMaterials.add(material);
        return finish ?? material;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(replace) : replace(object.material);
      object.castShadow = object.receiveShadow = true;
    });
    replacedMaterials.forEach((material) => material.dispose());
    if (detached) return;
    model.name = 'checkout-counter-model';
    model.position.set(placement.x, 0, placement.z);
    model.rotation.y = placement.yaw;
    parent.add(model);
    // Entrance.dispose removes its entire group before the store's scene-wide
    // disposal. Release this loader's resources at that boundary as well.
    const disposeModel = () => {
      parent.removeEventListener('removed', disposeModel);
      const ownedMaterials = new Set<THREE.Material>();
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          if (!Object.values(materials).includes(material)) ownedMaterials.add(material);
        }
      });
      ownedMaterials.forEach((material) => material.dispose());
      model.removeFromParent();
    };
    parent.addEventListener('removed', disposeModel);
    // Keep the established collision meshes registered: their exact footprints
    // also drive clerk navigation. Raycasting does not depend on visibility.
    // The fallback remains owned by the entrance's normal disposal traversal.
    fallback.visible = false;
    fallback.name = 'checkout-counter-collision';
    ctx.requestShadowRefresh();
    ctx.requestRender();
  }, undefined, (error) => {
    ctx.log(`Counter model unavailable; using built-in counter. ${String(error)}`, 'system');
  });
}
