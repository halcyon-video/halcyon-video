import * as THREE from 'three';

/** Release a newly loaded tree that was never adopted by a live scene. */
export function disposeDetachedModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });
  for (const m of materials) {
    for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
    m.dispose();
  }
  textures.forEach(t => t.dispose());
  geometries.forEach(g => g.dispose());
}
