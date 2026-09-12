import * as THREE from 'three';
import type { StoreScene } from './three-scene';

const states = new WeakMap<StoreScene, {
  next: number;
  spine: THREE.MeshBasicMaterial;
  materials: Map<THREE.InstancedMesh, THREE.Material | THREE.Material[]>;
}>();
const sphere = new THREE.Sphere();

/** Native per-batch frustum culling plus distance LOD. Runs at 10Hz, not per slot/frame. */
export function tickShelfVisibility(scene: StoreScene, time: number): void {
  let state = states.get(scene);
  if (!state) {
    state = { next: 0, spine: new THREE.MeshBasicMaterial({ color: 0x374151 }), materials: new Map() };
    states.set(scene, state);
  }
  if (time < state.next) return;
  state.next = time + 100;
  let changed = false;
  const active = scene.slotsByPosition.get(scene.getActiveSlotKey());
  for (const [key, front] of scene.unitSideFrontMeshMap) {
    // Wall and display stock is bounded separately and stays face-out.
    if (key.startsWith('fixture_') || key.startsWith('back_wall')) continue;
    if (!state.materials.has(front)) state.materials.set(front, front.material);
    if (!front.boundingSphere) front.computeBoundingSphere();
    sphere.copy(front.boundingSphere!).applyMatrix4(front.matrixWorld);
    const distance = Math.max(0, sphere.center.distanceTo(scene.camera.position) - sphere.radius);
    const selected = active?.frontMesh === front;
    front.frustumCulled = true;
    const visible = selected || distance < 80;
    const material = selected || distance < 28 ? state.materials.get(front)! : state.spine;
    changed ||= front.visible !== visible || front.material !== material;
    front.visible = visible;
    front.material = material;
    const back = scene.unitSideBackMeshMap.get(key);
    if (back) { back.frustumCulled = true; back.visible = selected || distance < 28; }
  }
  // Both mouse-walk and keyboard glides stream only the nearby view.
  scene.updateLOD();
  if (changed) scene.requestRender();
}

export function disposeShelfVisibility(scene: StoreScene): void {
  const state = states.get(scene);
  if (!state) return;
  for (const [mesh, material] of state.materials) mesh.material = material;
  state.spine.dispose();
  states.delete(scene);
}
