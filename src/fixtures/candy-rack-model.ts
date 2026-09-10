// Original Blender hardware, with stock/selection owned by CandyDisplay.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import type { FixtureContext } from '../fixtures';

export const CANDY_TRAY_ANGLE = -Math.PI / 15;

/** Every request owns its geometry/materials; repeated trays share within this rack. */
export function installCandyRackModel(
  ctx: FixtureContext, parent: THREE.Group, fallback: THREE.Group,
  width: number, depth: number, rows: number, steel: THREE.Material,
): () => void {
  let disposed = false;
  let hardware: THREE.Group | undefined;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const release = () => {
    geometries.forEach(g => g.dispose()); geometries.clear();
    materials.forEach(m => m.dispose()); materials.clear();
    hardware?.removeFromParent();
  };
  const loader = new GLTFLoader();
  void Promise.allSettled(['frame', 'tray'].map(part =>
    loader.loadAsync(assetUrl(`models/candy-rack-${part}.glb`)),
  )).then(results => {
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      result.value.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
    }
    if (disposed || parent.parent !== ctx.scene || results.some(r => r.status === 'rejected')) {
      release();
      if (!disposed && results.some(r => r.status === 'rejected')) ctx.log('Candy rack model unavailable; using built-in rack.', 'system');
      return;
    }
    const [frame, tray] = results.map(r => r.status === 'fulfilled' ? r.value.scene : new THREE.Group());
    hardware = new THREE.Group(); hardware.name = 'candy-rack-model';
    frame.scale.set(width / 3, Math.max(4, .6 + (rows - 1) * .7 + .6) / 4, depth / .7);
    hardware.add(frame);
    for (let r = 0; r < rows; r++) {
      const shelf = tray.clone(true);
      shelf.name = `candy-rack-tray-${r}`;
      shelf.scale.set(width / 3, 1, depth / .7);
      shelf.rotation.x = CANDY_TRAY_ANGLE;
      shelf.position.y = .6 + r * .7 + .015;
      hardware.add(shelf);
    }
    hardware.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const replace = (m: THREE.Material) => m.name === 'RackSteel' ? steel : m;
      object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
      object.castShadow = object.receiveShadow = true;
    });
    // Replaced glTF steel is no longer used. The fixture owns its live finish.
    for (const material of materials) if (material.name === 'RackSteel') { material.dispose(); materials.delete(material); }
    parent.add(hardware);
    fallback.visible = false;
    ctx.requestShadowRefresh(); ctx.requestRender();
  });
  return () => { disposed = true; release(); };
}
