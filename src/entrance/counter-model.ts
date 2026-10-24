import { finishEquipmentSurfaces } from '../fixtures/equipment-surfaces';
// Optional authored millwork and supports within the counter ground-plan envelope.
import * as THREE from 'three';
import { refreshTelephoneContact } from '../fixtures/telephone-surfaces';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getActiveTheme } from '../themes';
import { brandPackDir } from '../brand-pack';
import { assetUrl, dropInCandidates } from '../asset-url';
import type { FixtureContext } from '../fixtures';
import type { StorefrontSpec } from '../store-layout';

// Candidate model paths, highest priority first (drop-ins lead the bundled file).
function counterModelPaths(shape: StorefrontSpec['counterShape'], rounded: boolean): string[] {
  const themeId = getActiveTheme().id;
  const edition = shape === 'desk' ? '' : themeId === 'bb-1990' ? '-1990' : themeId === 'bb-2010' ? '-2010' : '';
  const filename = `checkout-counter-${shape}-${rounded ? 'rounded' : 'laminate'}${edition}.glb`;
  const rel = `fixtures/checkout-counter/${themeId}-${shape}-${rounded ? 'rounded' : 'laminate'}${edition === '-1990' ? '-solid' : ''}.glb`;
  const pack = brandPackDir();
  return dropInCandidates([...(pack ? [`user-assets/${pack}/${rel}`] : []), `user-assets/${rel}`, `models/${filename}`]);
}

function requestCounterModel(path: string): Promise<ArrayBuffer> {
  const request = fetch(assetUrl(path)).then(response => {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${path}`);
    return response.arrayBuffer();
  });
  request.catch(() => {});
  return request;
}

const prefetched = new Map<string, Promise<ArrayBuffer>>();

/** The startup splash waits for this model, but the entrance is built after
 * the room's decorative fixtures, so its request used to queue behind every
 * one of their downloads. Start it as soon as the storefront is known. The
 * result settles once some candidate's bytes arrive, or every candidate fails. */
export function prefetchCounterModel(spec: StorefrontSpec): Promise<void> {
  const paths = counterModelPaths(spec.counterShape, spec.counterStyle === 'rounded-2000s');
  for (const path of prefetched.keys()) if (!paths.includes(path)) prefetched.delete(path);
  for (const path of paths) if (!prefetched.has(path)) prefetched.set(path, requestCounterModel(path));
  return new Promise(resolve => {
    let failed = 0;
    for (const path of paths) prefetched.get(path)!.then(() => resolve(), () => { if (++failed === paths.length) resolve(); });
  });
}

export function installCounterModel(
  ctx: FixtureContext,
  parent: THREE.Group,
  fallback: THREE.Group,
  shape: StorefrontSpec['counterShape'],
  rounded: boolean,
  placement: { x: number; z: number; yaw: number },
  finishes: { body: THREE.Material; top: THREE.Material; inlay: THREE.Material; worktop: THREE.Material },
): Promise<THREE.Group | null> {
  const materials: Record<string, THREE.Material> = {
    CounterBody: finishes.body, CounterTop: finishes.top,
    CounterInlay: finishes.inlay, CounterWorktop: finishes.worktop,
    CounterInterior: finishes.worktop,
  };
  const paths = counterModelPaths(shape, rounded);
  // Request every candidate together: on a slow first visit, a missing drop-in's
  // 404 queues behind optional model downloads and holds the startup splash.
  // Drop-ins keep their priority; the bundled bytes are merely already arriving.
  const requests = paths.map(path => {
    const early = prefetched.get(path);
    prefetched.delete(path);
    return early ?? requestCounterModel(path);
  });
  const loader = new GLTFLoader();
  return new Promise(resolve => {
    const load = (index: number): void => { requests[index].then(buffer => loader.parse(buffer,
      THREE.LoaderUtils.extractUrlBase(assetUrl(paths[index])), ({ scene: model }) => {
      // A settings rebuild can detach the entrance while this request is in flight.
      let root: THREE.Object3D = parent;
      while (root.parent) root = root.parent;
      const detached = root !== ctx.scene;
      const replacedMaterials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (detached) object.geometry.dispose();
        const replace = (material: THREE.Material) => {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          const finish = materials[material.name];
          if (finish || detached) replacedMaterials.add(material);
          return finish ?? material;
        };
        object.userData.telephoneContactReceiver = (Array.isArray(object.material) ? object.material : [object.material]).some(m => m.name === 'CounterWorktop');
        object.material = Array.isArray(object.material)
          ? object.material.map(replace) : replace(object.material);
        object.castShadow = object.receiveShadow = true;
      });
      if (!detached) finishEquipmentSurfaces(model).forEach(texture => textures.add(texture));
      replacedMaterials.forEach((material) => material.dispose());
      if (detached) { textures.forEach(texture => texture.dispose()); resolve(null); return; }
      model.name = 'checkout-counter-model';
      model.position.set(placement.x, 0, placement.z);
      model.rotation.y = placement.yaw;
      parent.add(model);
      refreshTelephoneContact(parent);
      // Entrance.dispose removes its entire group before the store's scene-wide
      // disposal. Release this loader's resources at that boundary as well.
      const disposeModel = () => {
        parent.removeEventListener('removed', disposeModel);
        // Restore shared finishes before collecting this model's owned materials.
        model.userData.equipmentContactCleanup?.();
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
        textures.forEach(texture => texture.dispose());
        model.removeFromParent();
      };
      parent.addEventListener('removed', disposeModel);
      const reveal = () => {
        parent.removeEventListener('removed', abandon);
        // The entrance can be disposed while the model's programs prepare.
        if (!model.parent) { resolve(null); return; }
        model.visible = true;
        // Keep the established collision meshes registered: their exact footprints
        // also drive clerk navigation. Raycasting does not depend on visibility.
        // The fallback remains owned by the entrance's normal disposal traversal.
        fallback.visible = false;
        fallback.name = 'checkout-counter-collision';
        ctx.requestShadowRefresh();
        ctx.requestRender();
        resolve(model);
      };
      const lifetime = new AbortController();
      const abandon = () => lifetime.abort();
      parent.addEventListener('removed', abandon);
      // Hosted and phone stores link the model's own programs while it is still
      // hidden, not inside the next frame; the startup reveal waits for this.
      if (ctx.prepareDetailModel) {
        model.visible = false;
        ctx.prepareDetailModel(model, lifetime.signal).then(reveal, reveal);
      } else reveal();
    }, failed)).catch(failed); // parse throws synchronously on a non-glTF fallback page
    function failed(error: unknown) {
      let root: THREE.Object3D = parent;
      while (root.parent) root = root.parent;
      if (root !== ctx.scene) { resolve(null); return; }
      if (index + 1 < paths.length) { load(index + 1); return; }
      resolve(null);
      ctx.log(`Counter model unavailable; using built-in counter. ${String(error)}`, 'system');
    }
    };
    load(0);
  });
}
