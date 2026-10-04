import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setChangedShelfMatrix } from '../src/shelf-instance-matrix.ts';

function shelf() {
  return new THREE.InstancedMesh(new THREE.BoxGeometry(.6, 1, .2), new THREE.MeshStandardMaterial(), 3);
}
function write(mesh: THREE.InstancedMesh, index: number, matrix: THREE.Matrix4) {
  const changed = setChangedShelfMatrix(mesh, index, matrix);
  if (changed) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  return changed;
}

test('settled shelf poses retain the exact buffer and avoid repeated uploads', () => {
  const mesh = shelf(), pose = new THREE.Matrix4().makeTranslation(4.123456789, 3, -40);
  assert.equal(write(mesh, 1, pose), true);
  const pixels = Array.from(mesh.instanceMatrix.array), version = mesh.instanceMatrix.version;
  for (let i = 0; i < 100; i++) assert.equal(write(mesh, 1, pose), false);
  assert.deepEqual(Array.from(mesh.instanceMatrix.array), pixels);
  assert.equal(mesh.instanceMatrix.version, version);
  // Different doubles that encode to the same float must also stay settled.
  pose.elements[12] += 1e-9;
  assert.equal(write(mesh, 1, pose), false);
});

test('placement, selection, rotation, collapse and return all update culling bounds', () => {
  const mesh = shelf(), pose = new THREE.Matrix4(), point = new THREE.Vector3();
  for (const scale of [1, 1.1, 0, 1]) {
    pose.compose(point.set(4, 3, -40), new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, .3, -.1)), new THREE.Vector3(scale, scale, scale * 2));
    assert.equal(write(mesh, 2, pose), true);
    const stored = new THREE.Matrix4(); mesh.getMatrixAt(2, stored);
    assert.deepEqual(stored.elements, pose.elements.map(Math.fround));
    assert.ok(mesh.boundingSphere!.distanceToPoint(point) <= 1e-6);
  }
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, .1, 150);
  camera.position.set(4, 3, 0); camera.lookAt(point); camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  assert.ok(frustum.intersectsObject(mesh));
});

test('late model geometry refreshes bounds even when its shelf pose is unchanged', () => {
  const mesh = shelf(), pose = new THREE.Matrix4().makeTranslation(4, 3, -40);
  write(mesh, 1, pose);
  const oldRadius = mesh.boundingSphere!.radius;
  const bigger = new THREE.BoxGeometry(20, 20, 20);
  mesh.geometry.setAttribute('position', bigger.getAttribute('position'));
  mesh.geometry.computeBoundingSphere();
  assert.equal(write(mesh, 1, pose), true);
  assert.ok(mesh.boundingSphere!.radius > oldRadius);
  assert.equal(write(mesh, 1, pose), false);
  mesh.geometry.getAttribute('position').needsUpdate = true;
  assert.equal(write(mesh, 1, pose), true, 'in-place position changes also refresh bounds');
  mesh.boundingSphere = null;
  assert.equal(write(mesh, 1, pose), true, 'an explicitly invalidated bound is restored');
});

test('growing a batch refreshes its bounds without forcing every settled pose dirty', () => {
  const mesh = shelf(), pose = new THREE.Matrix4().makeTranslation(4, 3, -40);
  mesh.count = 1;
  write(mesh, 0, pose);
  mesh.setMatrixAt(2, new THREE.Matrix4().makeTranslation(100, 3, -40));
  mesh.count = 3;
  assert.equal(write(mesh, 0, pose), true);
  assert.ok(mesh.boundingSphere!.containsPoint(new THREE.Vector3(100, 3, -40)));
  assert.equal(write(mesh, 0, pose), false);
});
