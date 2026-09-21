import * as THREE from 'three';

/** First-draw colour materials only. Shadow/depth rendering still owns all casters.
 * Include every stock instance conservatively: its matrices/count can be updated
 * by the first animation tick, so a cached sphere need not describe that draw.
 * References are returned without reparenting anything in the live scene.
 */
export function initialProgramObjects(scene: THREE.Scene, camera: THREE.Camera): THREE.Object3D[] {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const objects: THREE.Object3D[] = [];
  scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) { objects.push(object); return; }
    if (!object.layers.test(camera.layers)) return;
    for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
      if (!parent.visible) return;
    }
    const inView = !object.frustumCulled || ((object as THREE.Sprite).isSprite
      ? frustum.intersectsSprite(object as THREE.Sprite) : frustum.intersectsObject(object));
    if (inView) objects.push(object);
  });
  return objects;
}
