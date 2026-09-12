import * as THREE from 'three';

/** Map upright canvas artwork across a named set of model faces, once.
 * glTF hardware often has packed UV islands; each strip must instead sample
 * its own height within the complete board, using CanvasTexture's flipY.
 */
export function mapDisplayFaceUVs(root: THREE.Object3D, materialNames: string[]): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const point = new THREE.Vector3();
  for (const name of materialNames) {
    const faces: { mesh: THREE.Mesh; matrix: THREE.Matrix4 }[] = [];
    const bounds = new THREE.Box3();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object.material.name !== name) return;
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld);
      faces.push({ mesh: object, matrix });
      const positions = object.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) bounds.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(matrix));
    });
    if (bounds.isEmpty()) continue;
    const width = bounds.max.x - bounds.min.x, height = bounds.max.y - bounds.min.y;
    if (width <= 0 || height <= 0) continue;
    for (const { mesh, matrix } of faces) {
      const positions = mesh.geometry.getAttribute('position');
      const uv = new THREE.Float32BufferAttribute(new Float32Array(positions.count * 2), 2);
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
        uv.setXY(i, (point.x - bounds.min.x) / width, (point.y - bounds.min.y) / height);
      }
      mesh.geometry.setAttribute('uv', uv);
    }
  }
}
