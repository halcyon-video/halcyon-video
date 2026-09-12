import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { disposeDetachedModel } from '../model-resources';
import type { FixtureContext } from '../fixtures';

/** Fitted visual replacement; caller retains collision, label and rental ownership. */
export function installReturnSlotModel(
  ctx: FixtureContext, parent: THREE.Group, fallback: THREE.Object3D[], blue: string,
) {
  let disposed = false;
  let installed: THREE.Group | null = null;
  let flap: THREE.Object3D | undefined;
  let restRotation = 0;
  let isOpen = false;
  new GLTFLoader().load(assetUrl('models/interior-return-chute.glb'), ({ scene: model }) => {
    let root: THREE.Object3D = parent;
    while (root.parent) root = root.parent;
    if (disposed || root !== ctx.scene) { disposeDetachedModel(model); return; }
    const roles = new Set<string>();
    let valid = true;
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      valid &&= !!o.geometry.getAttribute('uv') && !!o.geometry.getAttribute('normal');
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        roles.add(m.name);
        valid &&= m instanceof THREE.MeshStandardMaterial && !!m.normalMap && !!m.roughnessMap;
        if (m instanceof THREE.MeshStandardMaterial) {
          if (m.name === 'ChuteLaminate') m.color.set(blue);
          m.envMapIntensity = .2 / Math.max(.2, ctx.scene.environmentIntensity);
        }
      }
      o.castShadow = o.receiveShadow = true;
    });
    const b = new THREE.Box3().setFromObject(model);
    flap = model.getObjectByName('ChuteFlap');
    if (!valid || !flap || !['ChuteLaminate', 'ChuteSteel', 'ChuteReveal'].every(r => roles.has(r))
      || Math.abs(b.min.x + 1.2) > .01 || Math.abs(b.max.x - 1.2) > .01
      || Math.abs(b.min.y) > .01 || Math.abs(b.max.y - 3.85) > .01
      || Math.abs(b.min.z + 1.49) > .01 || Math.abs(b.max.z - .907) > .01) {
      flap = undefined; disposeDetachedModel(model); return;
    }
    restRotation = flap.rotation.x;
    model.name = 'interior-return-chute-model';
    installed = model; parent.add(model);
    fallback.forEach(o => { o.visible = false; });
    ctx.requestShadowRefresh(); ctx.requestRender();
  }, undefined, () => { /* Offline installation keeps the procedural chute. */ });
  return {
    setOpen(open: boolean) {
      // The existing toss phase opens the flap before the first case reaches it.
      if (flap && open !== isOpen) {
        isOpen = open;
        flap.rotation.x = restRotation + (open ? Math.PI / 2 - .24 : 0);
        ctx.requestShadowRefresh(); ctx.requestRender();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; flap = undefined;
      if (installed) { installed.removeFromParent(); disposeDetachedModel(installed); installed = null; }
    },
  };
}
