import * as THREE from 'three';

export interface CounterMount { x: number; y: number; z: number; rotY: number }

/** Optional GLB empties specify physical support surfaces in the model's frame. */
export function counterMount(model: THREE.Object3D, id: string): CounterMount | null {
  let node: THREE.Object3D | undefined;
  model.traverse(object => { if (object.userData.counterMount === id) node = object; });
  if (!node) return null;
  model.updateWorldMatrix(true, true);
  const p = node.getWorldPosition(new THREE.Vector3());
  const q = node.getWorldQuaternion(new THREE.Quaternion());
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return { x: p.x, y: p.y, z: p.z, rotY: Math.atan2(forward.x, forward.z) };
}

export function placeOnCounterMount(object: THREE.Object3D, mount: CounterMount, lift = 0): void {
  const p = new THREE.Vector3(mount.x, mount.y + lift, mount.z);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mount.rotY);
  if (object.parent) {
    object.parent.updateWorldMatrix(true, false);
    object.parent.worldToLocal(p);
    q.premultiply(object.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  }
  object.position.copy(p); object.quaternion.copy(q);
}
