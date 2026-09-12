import * as THREE from 'three';

/** Disposal callbacks may detach model children. Never release during traverse. */
export function disposeSceneMeshes(root: THREE.Object3D): void {
  const objects: THREE.Object3D[] = [];
  root.traverse(object => objects.push(object));
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  for (const object of objects) {
    const reflector = object as THREE.Object3D & { isReflector?: boolean; dispose?: () => void };
    if (object.type === 'Reflector' || reflector.isReflector) reflector.dispose?.();
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  }
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
