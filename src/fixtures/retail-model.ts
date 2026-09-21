import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** These six original retail studies are static. Keep their editable parts in
 * the source/export, but draw opaque parts sharing a finish in one batch.
 * Glass panes stay independent so transparency sorting remains correct. */
export function prepareRetailModel(model: THREE.Group): void {
  model.updateMatrixWorld(true);
  const inverseRoot = model.matrixWorld.clone().invert();
  const groups = new Map<THREE.Material, Map<number, THREE.Mesh[]>>();
  model.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !o.visible || o instanceof THREE.SkinnedMesh ||
      o instanceof THREE.InstancedMesh || o.morphTargetInfluences?.length ||
      Array.isArray(o.material) || o.material.transparent) return;
    // A finish can be shared by parts with different shadow policies.
    const policies = groups.get(o.material) ?? new Map<number, THREE.Mesh[]>();
    const policy = Number(o.castShadow) | (Number(o.receiveShadow) << 1);
    const meshes = policies.get(policy) ?? [];
    meshes.push(o); policies.set(policy, meshes); groups.set(o.material, policies);
  });
  const retired = new Set<THREE.BufferGeometry>();
  for (const [material, policies] of groups) for (const meshes of policies.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld)));
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    if (!geometry) continue; // Preserve the original valid meshes on incompatibility.
    const batch = new THREE.Mesh(geometry, material);
    batch.name = `retail-${material.name}`;
    batch.castShadow = meshes[0].castShadow;
    batch.receiveShadow = meshes[0].receiveShadow;
    meshes.forEach(mesh => { retired.add(mesh.geometry); mesh.removeFromParent(); });
    model.add(batch);
  }
  // A GLB can share a geometry with an unbatched pane; ownership remains with
  // the loader until its last surviving mesh is gone.
  model.traverse(o => { if (o instanceof THREE.Mesh) retired.delete(o.geometry); });
  retired.forEach(geometry => geometry.dispose());
  // Only these opted-in static studies freeze local transforms. The model root
  // stays live for placement/corrections and parent motion still propagates.
  model.traverse(o => {
    if (o === model) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
}
