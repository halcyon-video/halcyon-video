import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** These six original retail studies are static. Keep their editable parts in
 * the source/export, but draw opaque parts sharing a finish in one batch.
 * Glass panes stay independent so transparency sorting remains correct. */
export function prepareRetailModel(model: THREE.Group): void {
  model.updateMatrixWorld(true);
  const inverseRoot = model.matrixWorld.clone().invert();
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  model.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || o.material.transparent) return;
    const meshes = groups.get(o.material) ?? [];
    meshes.push(o); groups.set(o.material, meshes);
  });
  const retired = new Set<THREE.BufferGeometry>();
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld)));
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    if (!geometry) continue; // Preserve the original valid meshes on incompatibility.
    const batch = new THREE.Mesh(geometry, material);
    batch.name = `retail-${material.name}`;
    batch.castShadow = batch.receiveShadow = true;
    meshes.forEach(mesh => { retired.add(mesh.geometry); mesh.removeFromParent(); });
    model.add(batch);
  }
  // A GLB can share a geometry with an unbatched pane; ownership remains with
  // the loader until its last surviving mesh is gone.
  model.traverse(o => { if (o instanceof THREE.Mesh) retired.delete(o.geometry); });
  retired.forEach(geometry => geometry.dispose());
}
