import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Thin retail packaging needs gloss and transparency, not a second full-room
 * refraction render. A tiny blister used to activate that pass for the whole
 * viewport, including cube captures, even with cubemap mirrors selected. */
export function configureRetailBlister(material: THREE.Material): boolean {
  if (!(material instanceof THREE.MeshPhysicalMaterial) ||
      material.name !== 'MerchandiserClearBlister' || material.transmission <= 0) return false;
  material.userData.thinRetailGlass = true;
  material.transmission = 0;
  material.transparent = true;
  material.opacity = .16;
  material.depthWrite = false;
  material.needsUpdate = true;
  return true;
}

/** These six original retail studies are static. Keep their editable parts in
 * the source/export, but draw opaque parts sharing a finish in one batch.
 * Glass panes stay independent so transparency sorting remains correct. */
export function prepareRetailModel(model: THREE.Group): void {
  const thinGroups = new Map<THREE.Material, THREE.Mesh[]>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    let changed = false;
    for (const material of materials) changed = configureRetailBlister(material) || changed;
    if (changed || materials.some(material => material.userData.thinRetailGlass)) {
      object.castShadow = materials.some(material => !material.transparent || material.alphaTest > 0);
      object.receiveShadow = materials.some(material => !material.transparent);
      if (!Array.isArray(object.material) && object.material.userData.thinRetailGlass) {
        const meshes = thinGroups.get(object.material) ?? [];
        meshes.push(object); thinGroups.set(object.material, meshes);
      }
    }
  });
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
  // Three's BatchedMesh retains per-package depth sorting while submitting
  // the thin wrappers together. A static merge would lose that ordering.
  for (const [material, meshes] of thinGroups) {
    if (meshes.length < 2) continue;
    const vertices = meshes.reduce((n, mesh) => n + mesh.geometry.attributes.position.count, 0);
    const indices = meshes.reduce((n, mesh) => n + (mesh.geometry.index?.count ?? 0), 0);
    const batch = new THREE.BatchedMesh(meshes.length, vertices, indices, material);
    batch.name = 'retail-sorted-blisters'; batch.sortObjects = true;
    for (const mesh of meshes) {
      const geometryId = batch.addGeometry(mesh.geometry);
      const instanceId = batch.addInstance(geometryId);
      batch.setMatrixAt(instanceId, new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld));
      retired.add(mesh.geometry); mesh.removeFromParent();
    }
    batch.computeBoundingBox(); batch.computeBoundingSphere();
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
