import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDoorLeafFrame } from '../src/entrance/door-leaf.ts';

test('the moving aluminum leaf surrounds a real glazed opening', () => {
  const geometry = createDoorLeafFrame(3.2, 7);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 3, 1), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(mesh).length, 0, 'the frame must not fill the glass aperture');
  ray.ray.origin.x = 1.45;
  assert(ray.intersectObject(mesh).length > 0, 'the side stile must be solid');
  ray.ray.origin.set(0, .16, 1);
  assert(ray.intersectObject(mesh).length > 0, 'the bottom rail must be solid');
  geometry.dispose(); mesh.material.dispose();
});

test('door frames keep finite normals and fit narrower and wider leaves', () => {
  for (const width of [2.8, 3.2, 4]) {
    const geometry = createDoorLeafFrame(width, 7);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    assert(bounds.min.x > -width/2 && bounds.max.x < width/2);
    assert(bounds.min.y > 0 && bounds.max.y < 7);
    assert(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite));
    geometry.dispose();
  }
});
