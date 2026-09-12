import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tickShelfVisibility, disposeShelfVisibility } from '../src/shelf-visibility.ts';

test('distance LOD culls batches, pins selected stock and restores owned materials', () => {
  const material = new THREE.MeshStandardMaterial();
  const front = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 1);
  const back = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 1);
  front.setMatrixAt(0, new THREE.Matrix4());
  let selected = false, requests = 0, loads = 0;
  const scene = {
    camera: new THREE.PerspectiveCamera(),
    unitSideFrontMeshMap: new Map([['0_0_front', front]]),
    unitSideBackMeshMap: new Map([['0_0_front', back]]),
    slotsByPosition: { get: () => selected ? { frontMesh: front } : undefined },
    getActiveSlotKey: () => '', updateLOD: () => loads++, requestRender: () => requests++,
  };
  tickShelfVisibility(scene as any, 0);
  assert.equal(front.material, material);
  scene.camera.position.x = 40;
  tickShelfVisibility(scene as any, 100);
  assert.ok(front.material instanceof THREE.MeshBasicMaterial);
  assert.equal(front.visible, true);
  assert.equal(back.visible, false);
  scene.camera.position.x = 100;
  tickShelfVisibility(scene as any, 200);
  assert.equal(front.visible, false);
  selected = true;
  tickShelfVisibility(scene as any, 300);
  assert.equal(front.visible, true);
  assert.equal(back.visible, true);
  assert.equal(front.material, material);
  tickShelfVisibility(scene as any, 310);
  assert.equal(loads, 4);
  assert.ok(requests >= 3);
  selected = false;
  tickShelfVisibility(scene as any, 400);
  disposeShelfVisibility(scene as any);
  assert.equal(front.material, material);
  front.geometry.dispose(); back.geometry.dispose(); material.dispose();
});
