import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url';
import { disposeDetachedModel } from './model-resources';

/** Decorative exterior anchor: no new stock, navigation or interaction target. */
export function installExteriorReturnKiosk(
  scene: THREE.Scene, parent: THREE.Group, fallback: THREE.Object3D[],
  x: number, z: number, refresh: () => void,
) {
  let disposed = false;
  let installed: THREE.Group | null = null;
  new GLTFLoader().load(assetUrl('models/exterior-return-kiosk.glb'), ({ scene: model }) => {
    if (disposed || !parent.parent) { disposeDetachedModel(model); return; }
    const roles = new Set<string>();
    let valid = true;
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      valid &&= !!o.geometry.getAttribute('uv') && !!o.geometry.getAttribute('normal');
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        roles.add(m.name);
        if (m instanceof THREE.MeshStandardMaterial) {
          m.envMapIntensity = 0.2 / Math.max(0.2, scene.environmentIntensity);
        }
      }
      o.castShadow = o.receiveShadow = true;
    });
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    if (!valid || !['KioskEnamel', 'KioskTrim', 'KioskHardware', 'KioskRecess'].every(r => roles.has(r))
      || Math.abs(size.x - 1.3) > .01 || Math.abs(size.y - 3.2) > .01 || Math.abs(size.z - 1.3) > .01) {
      disposeDetachedModel(model);
      console.warn('[exterior] Invalid return kiosk; retaining fallback.');
      return;
    }
    model.name = 'exterior-return-kiosk-model';
    model.position.set(x, 0, z);
    parent.add(model);
    installed = model;
    fallback.forEach(o => { o.visible = false; });
    refresh();
  }, undefined, () => { /* Missing/offline asset retains the original prop. */ });
  return { dispose() {
    if (disposed) return;
    disposed = true;
    if (installed) { installed.removeFromParent(); disposeDetachedModel(installed); installed = null; }
  } };
}
