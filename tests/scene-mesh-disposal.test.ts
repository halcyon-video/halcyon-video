import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeSceneMeshes } from '../src/scene-mesh-disposal.ts';

test('model disposal may remove siblings without breaking era teardown', () => {
  const scene = new THREE.Scene();
  const group = new THREE.Group(); scene.add(group);
  const first = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const second = new THREE.Mesh(new THREE.BoxGeometry(), first.material);
  const last = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  group.add(first, second, last);
  let freed = 0, shared = 0;
  first.geometry.addEventListener('dispose', () => { second.removeFromParent(); });
  for (const mesh of [first, second, last]) mesh.geometry.addEventListener('dispose', () => freed++);
  first.material.addEventListener('dispose', () => shared++);
  assert.doesNotThrow(() => disposeSceneMeshes(scene));
  assert.equal(freed, 3); assert.equal(shared, 1);
});
