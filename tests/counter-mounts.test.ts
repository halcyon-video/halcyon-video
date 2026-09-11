import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { counterMount, placeOnCounterMount } from '../src/entrance/counter-mounts.ts';

test('support mount follows a rotated installation and a differently transformed equipment parent', () => {
  const root = new THREE.Scene();
  const model = new THREE.Group(); model.position.set(8, 0, 3); model.rotation.y = .7; root.add(model);
  const node = new THREE.Object3D(); node.position.set(2, 2.42, -.4); node.rotation.y = -.3;
  node.userData.counterMount = 'mount_terminal_0'; model.add(node);
  const parent = new THREE.Group(); parent.position.set(-2, 1, 4); parent.rotation.y = -.8; root.add(parent);
  const equipment = new THREE.Group(); parent.add(equipment);
  const mount = counterMount(model, 'mount_terminal_0')!;
  placeOnCounterMount(equipment, mount, .35);
  root.updateMatrixWorld(true);
  const expected = node.getWorldPosition(new THREE.Vector3()); expected.y += .35;
  assert.ok(equipment.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-10);
  assert.ok(equipment.getWorldQuaternion(new THREE.Quaternion()).angleTo(node.getWorldQuaternion(new THREE.Quaternion())) < 1e-7);
  assert.equal(counterMount(model, 'missing'), null);
});
