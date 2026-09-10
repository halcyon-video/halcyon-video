// Direct manipulation for the hosted touch store. Desktop input stays in its
// existing keyboard/mouse state machine.
import * as THREE from 'three';
import { isPublicDemo } from './demo-mode';
import { OVERVIEW_POS } from './scene-shared';
import { BACK_WALL_UNIT_IDX, type MovieSlot } from './store-layout';
import type { StoreScene } from './three-scene';

let coarse: MediaQueryList | undefined, noHover: MediaQueryList | undefined;
export function mobileStoreActive(): boolean {
  if (!isPublicDemo || typeof matchMedia !== 'function') return false;
  coarse ??= matchMedia('(pointer: coarse)');
  noHover ??= matchMedia('(hover: none)');
  return coarse.matches && noHover.matches;
}

function selectSlot(scene: StoreScene, slot: MovieSlot): void {
  scene.selectedLibraryIdx = slot.libraryIdx;
  scene.selectedUnitSource = slot.source === 'fixture' ? 'fixture' : 'shelving';
  scene.selectedFixtureId = slot.fixtureId ?? null;
  scene.selectedUnitIdx = slot.source === 'fixture' ? -1 : slot.unitIdx;
  scene.selectedSide = slot.side;
  scene.selectedShelf = slot.shelfIdx;
  scene.selectedCol = slot.col;
  scene.isBrowsingNewReleasesDirectly = slot.unitIdx === BACK_WALL_UNIT_IDX;
  scene.updateColsCount();
}

const dragged = new WeakSet<StoreScene>();
const ray = new THREE.Raycaster();
const point = new THREE.Vector2();
const world = new THREE.Vector3();
const matrix = new THREE.Matrix4();
export function slotWorld(slot: MovieSlot, out: THREE.Vector3): THREE.Vector3 {
  slot.frontMesh.getMatrixAt(slot.instanceIdx, matrix);
  return out.setFromMatrixPosition(matrix).applyMatrix4(slot.frontMesh.matrixWorld);
}

/** One tap examines a case; a tap from overview flies to that exact section. */
export function mobileStoreTap(scene: StoreScene, e: PointerEvent): boolean {
  if (!mobileStoreActive() || !['overview', 'browse', 'inspect'].includes(scene.mode)) return false;
  if (dragged.has(scene)) {
    dragged.delete(scene);
    if (scene.mode !== 'inspect') return true;
  }
  const rect = scene.renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(point.set((e.clientX - rect.left) / rect.width * 2 - 1,
    1 - (e.clientY - rect.top) / rect.height * 2), scene.camera);
  const hits = ray.intersectObjects(scene.scene.children, true);
  let picked: MovieSlot | null = null;
  let caseHit = false;
  for (const hit of hits) {
    if (!hit.object.visible) continue;
    if (scene.mode === 'inspect' && (hit.object === scene.heroFrontMesh || hit.object === scene.heroBackMesh)) return false;
    picked = scene.getSlotFromIntersection(hit.object, hit.instanceId!);
    if (picked && !picked.hidden) { caseHit = true; break; }
    // Shelf boards/dividers have no title ID. Resolve their physical surface
    // to its nearest stocked cell, never to the overview's current focus.
    let best = 2.25;
    for (const slot of scene.slotsByPosition.values()) {
      if (slot.hidden) continue;
      const d = slotWorld(slot, world).distanceToSquared(hit.point);
      if (d < best) { best = d; picked = slot; }
    }
    if (picked) break;
    // The first opaque surface occludes anything behind it.
    if (hit.object instanceof THREE.Mesh && !hit.object.userData.excludeFromSSAO) break;
  }
  if (!picked) return true;
  const wasBrowse = scene.mode === 'browse';
  scene.hideOverviewVisuals();
  scene.hideHeroCases();
  selectSlot(scene, picked);
  scene.mode = 'browse';
  scene.cameraWindowMinCol = Math.max(0, picked.col - 2);
  scene.onModeChange?.(scene.mode);
  scene.updateCameraTarget();
  scene.onSelectionChange?.(picked.movie);
  scene.requestRender();
  // Use the host's overlay-aware confirmation path for inspection.
  if (wasBrowse && caseHit) scene.onBrowseConfirm?.();
  return true;
}

/** A gesture holds its own continuous camera pose; no arrow callbacks. */
export function beginMobileDrag(scene: StoreScene, x: number, y: number) {
  dragged.delete(scene);
  if (!mobileStoreActive() || !['overview', 'browse'].includes(scene.mode) || scene.tvPeek) return null;
  const overview = scene.mode === 'overview';
  const mode = scene.mode;
  const pos = scene.currentCameraPos.clone();
  const look = scene.currentLookAt.clone();
  const right = new THREE.Vector3().setFromMatrixColumn(scene.camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(scene.camera.matrixWorld, 1);
  const distance = pos.distanceTo(look);
  const unitsPerPixel = 2 * distance * Math.tan(scene.camera.fov * Math.PI / 360)
    / scene.renderer.domElement.clientHeight;
  const forward = look.clone().sub(pos).normalize();
  const yaw = Math.atan2(-forward.x, -forward.z);
  const pitch = Math.asin(forward.y);
  const face = [...scene.slotsByPosition.values()].filter(s => !s.hidden
    && s.libraryIdx === scene.selectedLibraryIdx && s.unitIdx === scene.selectedUnitIdx
    && s.side === scene.selectedSide && (s.fixtureId ?? null) === scene.selectedFixtureId);
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const slot of face) {
    const delta = slotWorld(slot, world).sub(look);
    const sx = delta.dot(right), sy = delta.dot(up);
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  const items = overview ? scene.subNav?.rows[0] ?? [] : [];
  const angles = items.map(i => Math.atan2(OVERVIEW_POS.x - i.x, OVERVIEW_POS.z - i.z));
  let lastPriority = 0;
  return {
    move(px: number, py: number) {
      if (scene.mode !== mode) return;
      dragged.add(scene);
      if (overview) {
        const raw = THREE.MathUtils.clamp(yaw + (px - x) * Math.PI / scene.renderer.domElement.clientWidth * 0.65,
          Math.min(...angles, yaw) - 0.12, Math.max(...angles, yaw) + 0.12);
        let nearest = 0, gap = Infinity;
        angles.forEach((a, i) => { const d = Math.abs(a - raw); if (d < gap) { gap = d; nearest = i; } });
        // A shallow magnetic well gives resistance followed by release, while
        // retaining continuous movement on either side of every destination.
        const a = angles[nearest] ?? raw;
        scene.overviewYaw = raw + (a - raw) * 0.24 * Math.exp(-gap * gap / 0.003);
        scene.overviewPitch = THREE.MathUtils.clamp(pitch - (py - y) * 0.001, -0.35, 0.4);
        if (scene.subNav && items.length) {
          scene.subNav.row = 0; scene.subNav.sel[0] = nearest;
          scene.subNavRootFocus = { row: 0, label: items[nearest].label };
        }
        const cp = Math.cos(scene.overviewPitch);
        scene.targetCameraPos.copy(OVERVIEW_POS);
        scene.targetLookAt.copy(OVERVIEW_POS).add(world.set(-Math.sin(scene.overviewYaw) * cp,
          Math.sin(scene.overviewPitch), -Math.cos(scene.overviewYaw) * cp).multiplyScalar(20));
      } else {
        const dx = THREE.MathUtils.clamp(-(px - x) * unitsPerPixel, minX, maxX);
        const dy = THREE.MathUtils.clamp((py - y) * unitsPerPixel, minY, maxY);
        scene.targetCameraPos.copy(pos).addScaledVector(right, dx).addScaledVector(up, dy);
        scene.targetLookAt.copy(look).addScaledVector(right, dx).addScaledVector(up, dy);
        let nearest: MovieSlot | undefined, best = Infinity;
        for (const slot of face) {
          const d = slotWorld(slot, world).distanceToSquared(scene.targetLookAt);
          if (d < best) { best = d; nearest = slot; }
        }
        if (nearest && scene.getSelectedMovie()?.id !== nearest.movie.id) {
          selectSlot(scene, nearest); scene.onSelectionChange?.(nearest.movie);
        }
      }
      scene.currentCameraPos.copy(scene.targetCameraPos);
      scene.currentLookAt.copy(scene.targetLookAt);
      scene.camera.position.copy(scene.currentCameraPos);
      scene.camera.lookAt(scene.currentLookAt);
      scene.camera.updateMatrixWorld();
      if (performance.now() - lastPriority > 100) { scene.updateLOD(); lastPriority = performance.now(); }
      scene.requestRender();
    },
    end() {
      if (scene.mode !== mode) return;
      if (overview && scene.subNav) {
        const item = items[scene.subNav.sel[0]];
        if (item) {
          scene.overviewYaw = angles[scene.subNav.sel[0]];
          scene.updateCameraTarget();
          scene.cameraGlideLerp = 0.16;
        }
      }
      scene.updateLOD(); scene.requestRender();
    },
  };
}

// Follow a flight into a shelf as well as active drags, at a bounded cadence.
// No new vectors or catalog arrays in the render loop.
const artworkTime = new WeakMap<StoreScene, number>();
export function mobileArtworkTick(scene: StoreScene, time: number): void {
  if (!mobileStoreActive() || time - (artworkTime.get(scene) ?? -Infinity) < 180) return;
  artworkTime.set(scene, time);
  scene.updateLOD();
}
