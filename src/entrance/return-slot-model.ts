import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { disposeDetachedModel } from '../model-resources';
import type { FixtureContext } from '../fixtures';

/**
 * What a fitted return-station model must be before the runtime adopts it:
 * the exact envelope the procedural fallback and the drop ritual were built
 * to, the material roles the recolour below knows, and whether a hinged
 * `ChuteFlap` is part of the contract. Two styles ship (GH #219, #403).
 */
export interface ReturnSlotModelSpec {
  url: string;
  /** Object name the installed model carries in the scene graph. */
  name: string;
  min: [number, number, number];
  max: [number, number, number];
  roles: string[];
  flap: boolean;
}

/** The two-mouth "RETURN TAPES HERE" chute (GH #219). */
export const INTERIOR_CHUTE_MODEL: ReturnSlotModelSpec = {
  url: 'models/interior-return-chute.glb', name: 'interior-return-chute-model',
  min: [-1.6, 0, -1.49], max: [1.6, 3.85, .340333],
  roles: ['ChuteLaminate', 'ChuteSteel', 'ChuteReveal'], flap: true,
};

/** Fitted visual replacement; caller retains collision, label and rental ownership. */
export function installReturnSlotModel(
  ctx: FixtureContext, parent: THREE.Group, fallback: THREE.Object3D[], blue: string,
  spec: ReturnSlotModelSpec = INTERIOR_CHUTE_MODEL,
) {
  let disposed = false;
  let installed: THREE.Group | null = null;
  let flap: THREE.Object3D | undefined;
  let restRotation = 0;
  let isOpen = false;
  new GLTFLoader().load(assetUrl(spec.url), ({ scene: model }) => {
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
          if (m.name === 'ChuteRearRim') m.color.set(ctx.activeTheme?.palette.counterBody ?? '#f4f4f0');
          if (m.name === 'ChuteSteel') { m.color.set(0xf4f4f0); m.metalness = 0; m.roughness = .45; }
          m.envMapIntensity = .2 / Math.max(.2, ctx.scene.environmentIntensity);
        }
      }
      o.castShadow = o.receiveShadow = true;
    });
    const b = new THREE.Box3().setFromObject(model);
    flap = model.getObjectByName('ChuteFlap');
    const fits = (v: THREE.Vector3, want: [number, number, number]) =>
      Math.abs(v.x - want[0]) <= .01 && Math.abs(v.y - want[1]) <= .01 && Math.abs(v.z - want[2]) <= .01;
    if (!valid || (spec.flap && !flap) || !spec.roles.every(r => roles.has(r))
      || !fits(b.min, spec.min) || !fits(b.max, spec.max)) {
      flap = undefined; disposeDetachedModel(model); return;
    }
    if (flap) restRotation = flap.rotation.x;
    model.name = spec.name;
    installed = model; parent.add(model);
    fallback.forEach(o => { o.visible = false; });
    ctx.requestShadowRefresh(); ctx.requestRender();
  }, undefined, () => { /* Offline installation keeps the procedural fallback. */ });
  return {
    setOpen(open: boolean) {
      // The existing toss phase opens the flap before the first case reaches it.
      // A style without a flap (the single slot's open throat) has nothing to move.
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
