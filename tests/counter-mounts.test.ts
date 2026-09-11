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

test('equipment bay mounts resolve all standard millwork support anchors', () => {
  const model = new THREE.Group();
  const bayNames = [
    'mount_terminal_0',
    'mount_terminal_1',
    'mount_housing_0',
    'mount_housing_1',
    'mount_printer',
    'mount_telephone',
    'mount_bag',
  ];

  for (let i = 0; i < bayNames.length; i++) {
    const node = new THREE.Object3D();
    node.name = bayNames[i];
    node.userData.counterMount = bayNames[i];
    node.position.set(i * 1.5 - 4.5, 2.82, -1.0);
    node.rotation.y = (i % 2 === 0 ? 0 : Math.PI);
    model.add(node);
  }

  for (const bay of bayNames) {
    const mount = counterMount(model, bay);
    assert.ok(mount !== null, `Expected mount ${bay} to be found`);
    assert.equal(mount.y, 2.82);
  }

  // Verify terminal resting directly on shelf vs elevated on cash-housing mount
  const stationDirect = new THREE.Group();
  const stationElevated = new THREE.Group();
  const termMount = counterMount(model, 'mount_terminal_0')!;

  placeOnCounterMount(stationDirect, termMount, 0);
  const housingDeckHeight = 0.54; // typical cash-housing deck lift
  placeOnCounterMount(stationElevated, termMount, housingDeckHeight);

  assert.equal(stationDirect.position.y, 2.82);
  assert.equal(stationElevated.position.y, 2.82 + housingDeckHeight);
  assert.equal(stationDirect.position.x, stationElevated.position.x);
  assert.equal(stationDirect.position.z, stationElevated.position.z);
});
