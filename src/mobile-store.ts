// Direct manipulation for the hosted touch store. Desktop input stays in its
// existing keyboard/mouse state machine.
import * as THREE from 'three';
import { OVERVIEW_POS } from './scene-shared.ts';
import { BACK_WALL_UNIT_IDX, BROWSE_WINDOW_SIZE, type MovieSlot } from './store-layout.ts';
import { handleStreamingBackTap, cancelStreamingServiceChoice } from './streaming-checkout.ts';
import { subNavSelect } from './store-subnav.ts';
import type { StoreScene } from './three-scene.ts';

let coarse: MediaQueryList | undefined, noHover: MediaQueryList | undefined;
let testOverride: boolean | null = null;
export function _setMobileStoreActiveForTesting(active: boolean | null): void {
  testOverride = active;
}
export function mobileStoreActive(): boolean {
  if (testOverride !== null) return testOverride;
  if (typeof matchMedia !== 'function') return false;
  coarse ??= matchMedia('(pointer: coarse)');
  noHover ??= matchMedia('(hover: none)');
  return coarse.matches && noHover.matches;
}

function selectSlot(scene: StoreScene, slot: MovieSlot): void {
  scene.selectedUnitSource = slot.source === 'fixture' ? 'fixture' : 'shelving';
  scene.selectedFixtureId = slot.fixtureId ?? null;
  if (slot.source === 'fixture') {
    const fixtureIdx = scene.slottedFixtures.findIndex(f => f.placement.id === slot.fixtureId);
    scene.selectedLibraryIdx = fixtureIdx >= 0 ? scene.libraries.length + 1 + fixtureIdx : slot.libraryIdx;
  } else {
    scene.selectedLibraryIdx = slot.libraryIdx;
  }
  scene.selectedUnitIdx = slot.source === 'fixture' ? -1 : slot.unitIdx;
  scene.selectedSide = slot.side;
  scene.selectedShelf = slot.shelfIdx;
  scene.selectedCol = slot.col;
  scene.isBrowsingNewReleasesDirectly = slot.unitIdx === BACK_WALL_UNIT_IDX;
  scene.updateColsCount();
  const windowSize = BROWSE_WINDOW_SIZE;
  if (scene.colsCount <= windowSize) {
    scene.cameraWindowMinCol = 0;
  } else {
    scene.cameraWindowMinCol = Math.max(
      0,
      Math.min(scene.selectedCol - Math.floor(windowSize / 2), scene.colsCount - windowSize),
    );
  }
}

function isOverlayBlocking(): boolean {
  if (typeof window === 'undefined') return false;
  const u = (window as any).__uiState;
  if (u?.isAnyOverlayOpen || u?.isPlaybackActive || u?.isScreensaverActive) return true;
  const overlayIds = [
    'power-menu-overlay', 'settings-drawer-overlay', 'search-overlay',
    'feedback-pin-overlay', 'login-overlay', 'exit-confirm-overlay',
    'version-picker-overlay', 'candy-checkout-overlay', 'screensaver-overlay',
    'genre-menu-overlay', 'demo-playback-overlay', 'emblem-studio-overlay', 'boot-overlay',
  ];
  for (const id of overlayIds) {
    const el = document.getElementById(id);
    if (el && (el.classList.contains('visible') || el.classList.contains('open'))) return true;
  }
  return false;
}

const dragged = new WeakSet<StoreScene>();
export function markMobileDragged(scene: StoreScene): void {
  dragged.add(scene);
}
const ray = new THREE.Raycaster();
const point = new THREE.Vector2();
const world = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const arrowPosBottom = new THREE.Vector3();
const arrowPosTop = new THREE.Vector3();

export function slotWorld(slot: MovieSlot, out: THREE.Vector3): THREE.Vector3 {
  if (typeof slot.currentX === 'number' && Number.isFinite(slot.currentX)) {
    return out.set(slot.currentX, slot.currentY, slot.currentZ);
  }
  if (typeof slot.restingX === 'number' && Number.isFinite(slot.restingX)) {
    return out.set(slot.restingX, slot.restingY, slot.restingZ);
  }
  slot.frontMesh.getMatrixAt(slot.instanceIdx, matrix);
  return out.setFromMatrixPosition(matrix).applyMatrix4(slot.frontMesh.matrixWorld);
}

/** Check if a tap intersects or lands within forgiving range (>= 44px) of the floating cursor. */
export function isCursorTap(scene: StoreScene, clientX: number, clientY: number): boolean {
  if (!scene.selectionArrow || !scene.selectionArrow.visible) return false;

  const rect = scene.renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(point.set((clientX - rect.left) / rect.width * 2 - 1,
    1 - (clientY - rect.top) / rect.height * 2), scene.camera);

  // 1. Exact 3D raycast hit against selectionArrow with Layer 1 enabled
  ray.layers.enable(1);
  const arrowHits = ray.intersectObject(scene.selectionArrow, true);
  ray.layers.disable(1);
  if (arrowHits.length > 0) return true;

  // 2. Projected 2D screen bounding check with forgiving hit radius (>= 44px)
  arrowPosBottom.copy(scene.selectionArrow.position).project(scene.camera);
  arrowPosTop.copy(scene.selectionArrow.position);
  arrowPosTop.y += 2.8;
  arrowPosTop.project(scene.camera);

  // If both are behind camera, ignore
  if (arrowPosBottom.z > 1 && arrowPosTop.z > 1) return false;

  const bx = rect.left + (arrowPosBottom.x * 0.5 + 0.5) * rect.width;
  const by = rect.top + (-arrowPosBottom.y * 0.5 + 0.5) * rect.height;
  const tx = rect.left + (arrowPosTop.x * 0.5 + 0.5) * rect.width;
  const ty = rect.top + (-arrowPosTop.y * 0.5 + 0.5) * rect.height;

  const segDx = tx - bx;
  const segDy = ty - by;
  const segLenSq = segDx * segDx + segDy * segDy;

  let dist = Infinity;
  if (segLenSq === 0) {
    dist = Math.hypot(clientX - bx, clientY - by);
  } else {
    const t = Math.max(0, Math.min(1, ((clientX - bx) * segDx + (clientY - by) * segDy) / segLenSq));
    const projX = bx + t * segDx;
    const projY = by + t * segDy;
    dist = Math.hypot(clientX - projX, clientY - projY);
  }

  // Minimum hit target radius 48px (~96px diameter, forgiving tap)
  return dist <= 48;
}

/** One tap examines a case; a tap from overview flies to that exact section. */
export function mobileStoreTap(scene: StoreScene, e: PointerEvent): boolean {
  if (!mobileStoreActive() || !['overview', 'browse', 'inspect'].includes(scene.mode)) return false;
  if (isOverlayBlocking()) return false;
  if (dragged.has(scene)) {
    dragged.delete(scene);
    if (scene.mode !== 'inspect') return true;
  }

  // Tapping the floating cursor in overview enters that shelf
  if (scene.mode === 'overview') {
    if (isCursorTap(scene, e.clientX, e.clientY)) {
      subNavSelect(scene);
      return true;
    }
  }

  const rect = scene.renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(point.set((e.clientX - rect.left) / rect.width * 2 - 1,
    1 - (e.clientY - rect.top) / rect.height * 2), scene.camera);
  const hits = ray.intersectObjects(scene.scene.children, true);
  let picked: MovieSlot | null = null;
  let caseHit = false;
  for (const hit of hits) {
    if (!hit.object.visible) continue;
    if (scene.mode === 'inspect' && (hit.object === scene.heroFrontMesh || hit.object === scene.heroBackMesh)) {
      if (scene.heroBackMesh && hit.object === scene.heroBackMesh && hit.uv && handleStreamingBackTap(scene, hit.uv)) {
        return true;
      }
      return false;
    }
    picked = scene.getSlotFromIntersection(hit.object, hit.instanceId!);
    if (picked && !picked.hidden) { caseHit = true; break; }
    // Shelf boards/dividers have no title ID. Resolve their physical surface
    // to its nearest stocked cell, never to the overview's current focus.
    let best = 2.25;
    for (const slot of scene.slotsByPosition.values()) {
      if (slot.hidden) continue;
      const sx = slot.currentX ?? slot.restingX;
      const sy = slot.currentY ?? slot.restingY;
      const sz = slot.currentZ ?? slot.restingZ;
      const dx = sx - hit.point.x, dy = sy - hit.point.y, dz = sz - hit.point.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; picked = slot; }
    }
    if (picked) break;
    // The first opaque surface occludes anything behind it.
    if (hit.object instanceof THREE.Mesh && !hit.object.userData.excludeFromSSAO) break;
  }

  if (scene.mode === 'overview') {
    if (!picked) return false;

    // Preserve spatial destination focus when entering shelf directly by tapping
    const row0 = scene.subNav?.rows[0] ?? [];
    const matched = row0.find(i => {
      if (picked!.source === 'fixture') {
        const fix = scene.slottedFixtures[i.fixtureIdx];
        return (i.kind === 'fixture' || i.kind === 'endcap') && fix?.placement?.id === picked!.fixtureId;
      }
      if (picked!.unitIdx === BACK_WALL_UNIT_IDX) {
        return i.kind === 'new-releases';
      }
      if (i.kind === 'genre' && i.libraryIdx === picked!.libraryIdx) {
        return i.unitIdxInLibrary === picked!.unitIdx && i.side === picked!.side;
      }
      return false;
    }) ?? row0.find(i => i.kind === 'library' && i.libraryIdx === picked!.libraryIdx);
    if (matched) {
      scene.subNavRootFocus = { row: 0, label: matched.label };
    }
  }

  if (!picked) return true;
  const wasBrowse = scene.mode === 'browse';
  cancelStreamingServiceChoice(scene);
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
  if (isOverlayBlocking()) return null;
  if (!mobileStoreActive() || !['overview', 'browse'].includes(scene.mode) || scene.tvPeek) return null;
  const overview = scene.mode === 'overview';
  const mode = scene.mode;
  const pos = scene.currentCameraPos.clone();
  const look = scene.currentLookAt.clone();
  const right = new THREE.Vector3().setFromMatrixColumn(scene.camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(scene.camera.matrixWorld, 1);
  const distance = pos.distanceTo(look);
  const domEl = scene.renderer.domElement;
  const clientWidth = domEl.clientWidth || 1;
  const clientHeight = domEl.clientHeight || 1;
  const unitsPerPixel = 2 * distance * Math.tan(scene.camera.fov * Math.PI / 360)
    / clientHeight;
  const colSensitivity = Math.max(0.011, unitsPerPixel * 3.2);
  const rowSensitivity = Math.max(0.012, unitsPerPixel * 3.4);
  const forward = look.clone().sub(pos).normalize();
  const yaw = Math.atan2(-forward.x, -forward.z);
  const pitch = Math.asin(forward.y);
  const isFixture = !!scene.selectedFixtureId || scene.selectedUnitSource === 'fixture';
  const isAisleShelving = !isFixture
    && scene.selectedUnitIdx !== BACK_WALL_UNIT_IDX && scene.selectedUnitIdx >= 0;
  const activeUnit = isAisleShelving
    ? scene.shelvingUnits.find(u => u.libraryIdx === scene.selectedLibraryIdx && u.unitIdxInLibrary === scene.selectedUnitIdx)
    : null;
  const runUnitIndices = activeUnit && activeUnit.rowGroupId !== undefined
    ? new Set(
        scene.shelvingUnits
          .filter(u => u.libraryIdx === scene.selectedLibraryIdx && u.rowGroupId === activeUnit.rowGroupId)
          .map(u => u.unitIdxInLibrary)
      )
    : null;
  const face = isFixture
    ? [...scene.slotsByPosition.values()].filter(s => !s.hidden
        && s.fixtureId === scene.selectedFixtureId
        && s.side === scene.selectedSide)
    : [...scene.slotsByPosition.values()].filter(s => !s.hidden
        && s.libraryIdx === scene.selectedLibraryIdx
        && (runUnitIndices ? runUnitIndices.has(s.unitIdx) : s.unitIdx === scene.selectedUnitIdx)
        && s.side === scene.selectedSide && !s.fixtureId);
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

  // Velocity tracking for bounded settling momentum
  let lastMoveTime = performance.now();
  let prevPx = x, prevPy = y;
  let velX = 0, velY = 0;

  return {
    move(px: number, py: number) {
      if (scene.mode !== mode || isOverlayBlocking()) return;
      dragged.add(scene);

      const now = performance.now();
      const dt = now - lastMoveTime;
      if (dt > 8) {
        const instVx = (px - prevPx) / dt;
        const instVy = (py - prevPy) / dt;
        velX = velX * 0.4 + instVx * 0.6;
        velY = velY * 0.4 + instVy * 0.6;
        prevPx = px;
        prevPy = py;
        lastMoveTime = now;
      }

      const totalDx = px - x;
      const totalDy = py - y;
      const absDx = Math.abs(totalDx);
      const absDy = Math.abs(totalDy);

      // Clear axis dominance: damp cross-axis jitter while browsing columns or rows
      let effDx = totalDx;
      let effDy = totalDy;
      if (absDx > absDy * 1.4) {
        effDy = totalDy * 0.15;
      } else if (absDy > absDx * 1.4) {
        effDx = totalDx * 0.15;
      }

      if (overview) {
        const sensitivity = Math.PI / clientWidth * 0.85;
        const raw = THREE.MathUtils.clamp(yaw + totalDx * sensitivity,
          Math.min(...angles, yaw) - 0.15, Math.max(...angles, yaw) + 0.15);
        let nearest = 0, gap = Infinity;
        angles.forEach((a, i) => { const d = Math.abs(a - raw); if (d < gap) { gap = d; nearest = i; } });
        // Shallow magnetic well provides guidance across destinations
        const a = angles[nearest] ?? raw;
        scene.overviewYaw = raw + (a - raw) * 0.24 * Math.exp(-gap * gap / 0.003);
        scene.overviewPitch = THREE.MathUtils.clamp(pitch - effDy * 0.001, -0.35, 0.4);
        if (scene.subNav && items.length) {
          const prevNearest = scene.subNav.sel[0];
          scene.subNav.row = 0;
          scene.subNav.sel[0] = nearest;
          scene.subNavRootFocus = { row: 0, label: items[nearest].label };
          if (prevNearest !== nearest) {
            scene.updateSelectionArrow();
          }
        }
        const cp = Math.cos(scene.overviewPitch);
        scene.targetCameraPos.copy(OVERVIEW_POS);
        scene.targetLookAt.copy(OVERVIEW_POS).add(world.set(-Math.sin(scene.overviewYaw) * cp,
          Math.sin(scene.overviewPitch), -Math.cos(scene.overviewYaw) * cp).multiplyScalar(20));
      } else {
        const dx = THREE.MathUtils.clamp(effDx * colSensitivity, minX - 0.5, maxX + 0.5);
        const dy = THREE.MathUtils.clamp(-effDy * rowSensitivity, minY - 0.5, maxY + 0.5);
        scene.targetCameraPos.copy(pos).addScaledVector(right, dx).addScaledVector(up, dy);
        scene.targetLookAt.copy(look).addScaledVector(right, dx).addScaledVector(up, dy);
        let nearest: MovieSlot | undefined, best = Infinity;
        for (const slot of face) {
          const d = slotWorld(slot, world).distanceToSquared(scene.targetLookAt);
          if (d < best) { best = d; nearest = slot; }
        }
        if (nearest) {
          const targetUnitIdx = nearest.source === 'fixture' ? -1 : nearest.unitIdx;
          const slotChanged = scene.selectedCol !== nearest.col
            || scene.selectedShelf !== nearest.shelfIdx
            || scene.selectedUnitIdx !== targetUnitIdx
            || scene.selectedSide !== nearest.side
            || scene.selectedLibraryIdx !== nearest.libraryIdx
            || (scene.selectedFixtureId ?? null) !== (nearest.fixtureId ?? null);
          const movieChanged = scene.getSelectedMovie()?.id !== nearest.movie.id;
          if (slotChanged || movieChanged) {
            selectSlot(scene, nearest);
            if (movieChanged) scene.onSelectionChange?.(nearest.movie);
          }
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
      if (scene.mode !== mode || isOverlayBlocking()) return;

      // Finger held still before lift dissipates flick velocity
      if (performance.now() - lastMoveTime > 80) {
        velX = 0;
        velY = 0;
      }

      if (overview && scene.subNav && items.length) {
        let selIdx = scene.subNav.sel[0];
        // Bounded settling on horizontal flick in overview
        if (Math.abs(velX) > 0.35) {
          const step = Math.sign(velX) * (Math.abs(velX) > 0.9 ? 2 : 1);
          selIdx = THREE.MathUtils.clamp(selIdx - step, 0, items.length - 1);
          scene.subNav.sel[0] = selIdx;
          scene.subNavRootFocus = { row: 0, label: items[selIdx].label };
          scene.updateSelectionArrow();
        }
        const item = items[selIdx];
        if (item) {
          scene.overviewYaw = angles[selIdx];
          scene.overviewPitch = 0;
          scene.updateCameraTarget();
          scene.cameraGlideLerp = 0.16;
          scene.updateSelectionArrow();
        }
      } else if (!overview) {
        // Bounded settling on flick across columns or rows
        const absVx = Math.abs(velX);
        const absVy = Math.abs(velY);
        if (absVx > 0.35 && absVx > absVy) {
          // Column flick: advance 1 to 3 columns
          const colStep = Math.sign(velX) * Math.min(3, Math.max(1, Math.round(absVx * 1.6)));
          const targetCol = scene.selectedCol + colStep;
          const candidate = face.find(s => s.col === targetCol && s.shelfIdx === scene.selectedShelf)
            || face.find(s => s.col === targetCol);
          if (candidate) {
            selectSlot(scene, candidate);
            scene.onSelectionChange?.(candidate.movie);
          }
        } else if (absVy > 0.35 && absVy > absVx) {
          // Row flick: advance 1 or 2 shelves
          const shelfStep = -Math.sign(velY) * (absVy > 0.8 ? 2 : 1);
          const targetShelf = scene.selectedShelf + shelfStep;
          const candidate = face.find(s => s.shelfIdx === targetShelf && s.col === scene.selectedCol)
            || face.find(s => s.shelfIdx === targetShelf);
          if (candidate) {
            selectSlot(scene, candidate);
            scene.onSelectionChange?.(candidate.movie);
          }
        }
        scene.updateCameraTarget();
        scene.cameraGlideLerp = 0.16;
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
