import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** One asset load; both fixtures share geometry and material ownership. */
export function installParkingLampModels(
  scene: THREE.Scene,
  anchors: { root: THREE.Group; fallback: THREE.Group }[],
  url: string,
  poleMaterial: THREE.MeshStandardMaterial,
  lensMaterial: THREE.MeshStandardMaterial,
  requestRender: () => void,
): { dispose(): void } {
  let disposed = false;
  const resources = new Set<{ dispose(): void }>();
  const installed: THREE.Object3D[] = [];
  new GLTFLoader().load(url, ({ scene: model }) => {
    const loaded = new Set<{ dispose(): void }>();
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      loaded.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        loaded.add(m);
        Object.values(m).forEach(v => { if (v instanceof THREE.Texture) loaded.add(v); });
      }
    });
    if (disposed) {
      loaded.forEach(r => r.dispose());
      return;
    }
    loaded.forEach(r => resources.add(r));
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const remap = (m: THREE.Material) => {
        if (m.name === 'LampLens') return lensMaterial;
        if (m.name === 'PoleFinish') return poleMaterial;
        if (m instanceof THREE.MeshStandardMaterial) {
          m.envMapIntensity = 0.2 / Math.max(0.2, scene.environmentIntensity);
        }
        return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(remap) : remap(o.material);
      o.castShadow = o.material !== lensMaterial;
      o.receiveShadow = true;
    });
    anchors.forEach(({ root, fallback }) => {
      const instance = model.clone(true);
      instance.name = 'parking-lamp-model';
      root.add(instance);
      installed.push(instance);
      fallback.visible = false;
    });
    // The exterior callback also queues the structural shadow refresh.
    requestRender();
  }, undefined, err => {
    if (!disposed) console.warn('[exterior] parking lamp failed to load; keeping fallback:', err);
  });
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      installed.forEach(o => o.removeFromParent());
      anchors.forEach(({ fallback }) => { fallback.visible = true; });
      resources.forEach(r => r.dispose());
      resources.clear();
    },
  };
}
