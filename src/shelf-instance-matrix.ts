import { InterleavedBufferAttribute, type BufferAttribute, type BufferGeometry, type InstancedMesh, type Matrix4 } from 'three';

type BoundsSource = { geometry: BufferGeometry; position: BufferAttribute | InterleavedBufferAttribute | undefined; version: number; count: number };
const boundsSources = new WeakMap<InstancedMesh, BoundsSource>();

/** A hero can turn while its collapsed shelf copies stay still. Only queue
 * their batch when the stored transform changes or geometry needs new bounds.
 * Compare at the buffer's precision so rounded values do not force uploads. */
export function setChangedShelfMatrix(mesh: InstancedMesh, index: number, matrix: Matrix4): boolean {
  const position = mesh.geometry.getAttribute('position');
  const version = position instanceof InterleavedBufferAttribute ? position.data.version : position?.version ?? 0;
  const source = boundsSources.get(mesh);
  const changedGeometry = !source || source.geometry !== mesh.geometry || source.position !== position ||
    source.version !== version || source.count !== mesh.count;
  let changed = changedGeometry || mesh.boundingSphere === null;
  const values = mesh.instanceMatrix.array;
  const float32 = values instanceof Float32Array;
  for (let i = 0; !changed && i < 16; i++) {
    changed = values[index * 16 + i] !== (float32 ? Math.fround(matrix.elements[i]) : matrix.elements[i]);
  }
  if (!changed) return false;
  mesh.setMatrixAt(index, matrix);
  if (changedGeometry) boundsSources.set(mesh, { geometry: mesh.geometry, position, version, count: mesh.count });
  return true;
}
