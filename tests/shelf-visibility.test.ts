import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tickShelfVisibility, disposeShelfVisibility, initializeHiddenShelfInstances, invalidateShelfVisibility, finishShelfPromotionScan } from '../src/shelf-visibility.ts';

test('visible shelf artwork survives old distance cutoffs and camera zoom', () => {
  const material = new THREE.MeshStandardMaterial();
  const front = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 1);
  const back = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 1);
  front.setMatrixAt(0, new THREE.Matrix4());
  back.setMatrixAt(0, new THREE.Matrix4());
  front.computeBoundingSphere();
  let loads = 0;
  const camera = new THREE.PerspectiveCamera(25, 16 / 9, .1, 300);
  const scene = {
    camera,
    unitSideFrontMeshMap: new Map([['0_0_front', front]]),
    unitSideBackMeshMap: new Map([['0_0_front', back]]),
    updateLOD: () => loads++, requestRender: () => {},
  };
  let time = 0;
  for (const distance of [12, 27, 29, 40, 79, 81, 100, 40, 12]) {
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    assert.equal(frustum.intersectsObject(front), true);
    tickShelfVisibility(scene as any, time);
    assert.equal(front.material, material, 'visible covers must retain artwork');
    assert.equal(front.visible, true);
    assert.equal(back.visible, true);
    assert.equal(front.frustumCulled, true);
    assert.equal(back.frustumCulled, true);
    time += 100;
  }
  tickShelfVisibility(scene as any, time - 90);
  assert.equal(loads, 9, 'nearby artwork requests remain limited to 10Hz');
  camera.lookAt(0, 0, 200); camera.updateMatrixWorld();
  const offscreen = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  assert.equal(offscreen.intersectsObject(front), false, 'offscreen batches still use renderer culling');
  disposeShelfVisibility(scene as any);
  tickShelfVisibility(scene as any, 0);
  assert.equal(loads, 10, 'rebuilding resets the update timer');
  front.geometry.dispose(); back.geometry.dispose(); material.dispose();
});

test('unplaced stock does not poison the bounds of partly populated shelves', () => {
  const geometry = new THREE.BoxGeometry(.6, 1, .2);
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 3);
  initializeHiddenShelfInstances(mesh);
  mesh.computeBoundingSphere();
  assert.deepEqual(mesh.boundingSphere!.center.toArray(), [0, 0, 0]);
  assert.equal(mesh.boundingSphere!.radius, 0);
  // A real placement alongside still-unused capacity must remain finite.
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(4, 3, -40));
  mesh.computeBoundingSphere();
  const sphere = mesh.boundingSphere!;
  assert.ok([...sphere.center.toArray(), sphere.radius].every(Number.isFinite));
  assert.ok(sphere.containsPoint(new THREE.Vector3(4, 3, -40)));
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, .1, 150);
  camera.position.set(4, 3, 0); camera.lookAt(4, 3, -40); camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  assert.equal(frustum.intersectsObject(mesh), true);
  geometry.dispose(); material.dispose();
});


test('a completed stationary view parks scans and invalidates on movement, zoom and stock', () => {
  let loads = 0;
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 100);
  const scene = { camera, selectedLibraryIdx: 0, slotsByPosition: new Map([['a', {}]]),
    unitSideFrontMeshMap: new Map(), unitSideBackMeshMap: new Map(),
    updateLOD: () => { loads++; finishShelfPromotionScan(scene as any, false); return false; }, requestRender: () => {} };
  tickShelfVisibility(scene as any, 0);
  for (let time = 100; time <= 10_000; time += 100) tickShelfVisibility(scene as any, time);
  assert.equal(loads, 1, '100 idle ticks must not rescan the catalog');
  let time = 10_100;
  const rescan = () => { tickShelfVisibility(scene as any, time); time += 100; };
  camera.position.x = 1; rescan(); assert.equal(loads, 2);
  camera.rotation.y = .25; rescan(); assert.equal(loads, 3);
  camera.fov = 40; camera.updateProjectionMatrix(); rescan(); assert.equal(loads, 4);
  scene.slotsByPosition.set('b', {}); rescan(); assert.equal(loads, 5);
  scene.selectedLibraryIdx = 1; rescan(); assert.equal(loads, 6);
  invalidateShelfVisibility(scene as any); rescan(); assert.equal(loads, 7, 'same-count restocks invalidate');
  rescan(); assert.equal(loads, 7);
  disposeShelfVisibility(scene as any);
});

test('bounded promotion batches drain without camera motion and explicit scans resume draining', () => {
  let remaining = 70, loads = 0;
  const camera = new THREE.PerspectiveCamera();
  const scene = { camera, selectedLibraryIdx: 0, slotsByPosition: new Map(),
    unitSideFrontMeshMap: new Map(), unitSideBackMeshMap: new Map(),
    updateLOD: () => { loads++; const batch = Math.min(24, remaining); remaining -= batch;
      finishShelfPromotionScan(scene as any, batch === 24); return batch === 24; },
    requestRender: () => {} };
  for (let time = 0; time <= 1000; time += 100) tickShelfVisibility(scene as any, time);
  assert.equal(remaining, 0); assert.equal(loads, 3);
  remaining = 50;
  camera.updateMatrixWorld();
  scene.updateLOD();
  for (let time = 1100; time <= 2000; time += 100) tickShelfVisibility(scene as any, time);
  assert.equal(remaining, 0); assert.equal(loads, 6, 'explicit scans remain effective and hand pending batches to the scheduler');
  disposeShelfVisibility(scene as any);
});
