import type { InstancedMesh } from 'three';
import type { StoreScene } from './three-scene';

/** Hide unplaced instances with a valid affine zero-scale transform. */
export function initializeHiddenShelfInstances(mesh: InstancedMesh): void {
  const matrices = mesh.instanceMatrix.array;
  matrices.fill(0);
  // Zero scale still needs w=1 to keep partly populated bounds finite.
  for (let offset = 15; offset < matrices.length; offset += 16) matrices[offset] = 1;
}

type VisibilityState = {
  nextUpdate: number; pending: boolean; valid: boolean;
  world: Float64Array; projection: Float64Array;
  slots: number; library: number; generation: number; scannedGeneration: number;
  residentBatches: number;
};
const states = new WeakMap<StoreScene, VisibilityState>();
function stateFor(scene: StoreScene): VisibilityState {
  let state = states.get(scene);
  if (!state) {
    state = { nextUpdate: 0, pending: true, valid: false,
      world: new Float64Array(16), projection: new Float64Array(16),
      slots: -1, library: -1, generation: 0, scannedGeneration: -1, residentBatches: -1 };
    states.set(scene, state);
  }
  return state;
}

/** Same-size restocks and layout changes also invalidate a completed view. */
export function invalidateShelfVisibility(scene: StoreScene): void {
  const state = stateFor(scene);
  state.generation++;
  state.residentBatches = -1;
}

/** Explicit input/lighting scans remain unconditional and can start a drain. */
export function finishShelfPromotionScan(scene: StoreScene, pending: boolean): void {
  const state = stateFor(scene);
  state.world.set(scene.camera.matrixWorld.elements);
  state.projection.set(scene.camera.projectionMatrix.elements);
  state.slots = scene.slotsByPosition?.size ?? 0;
  state.library = scene.selectedLibraryIdx ?? -1;
  state.scannedGeneration = state.generation;
  state.pending = pending;
  state.valid = true;
}

function sameView(scene: StoreScene, state: VisibilityState): boolean {
  if (!state.valid || state.scannedGeneration !== state.generation ||
      state.residentBatches !== scene.unitSideFrontMeshMap.size ||
      state.slots !== (scene.slotsByPosition?.size ?? 0) ||
      state.library !== (scene.selectedLibraryIdx ?? -1)) return false;
  const world = scene.camera.matrixWorld.elements;
  const projection = scene.camera.projectionMatrix.elements;
  for (let i = 0; i < 16; i++) {
    if (state.world[i] !== world[i] || state.projection[i] !== projection[i]) return false;
  }
  return true;
}

/** Promote nearby covers at 10Hz, then park a fully issued stationary view. */
export function tickShelfVisibility(scene: StoreScene, time: number): void {
  const state = stateFor(scene);
  if (time < state.nextUpdate) return;
  state.nextUpdate = time + 100;
  scene.camera.updateMatrixWorld();
  if (!state.pending && sameView(scene, state)) return;
  let changed = false;
  if (state.residentBatches !== scene.unitSideFrontMeshMap.size) {
    for (const [key, front] of scene.unitSideFrontMeshMap) {
      if (key.startsWith('fixture_') || key.startsWith('back_wall')) continue;
      front.frustumCulled = true;
      changed = !front.visible || changed;
      front.visible = true;
      const back = scene.unitSideBackMeshMap.get(key);
      if (back) {
        back.frustumCulled = true;
        changed = !back.visible || changed;
        back.visible = true;
      }
    }
    state.residentBatches = scene.unitSideFrontMeshMap.size;
  }
  // A full 24-request batch may leave more eligible covers; keep draining it.
  scene.updateLOD(); // the unconditional scan records this view and pending batch
  if (changed) scene.requestRender();
}

export function disposeShelfVisibility(scene: StoreScene): void {
  states.delete(scene);
}
