import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { prepareRetailModel } from '../src/fixtures/retail-model.ts';

test('retail batches preserve world bounds, shadow policies and independently sorted glass', () => {
  const root = new THREE.Group();root.position.set(9, 2, -4);
  const finish = new THREE.MeshStandardMaterial();
  const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: .3 });
  const parts: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(), i === 5 ? glass : finish);
    part.position.x = i * 2;part.castShadow = i < 2;part.receiveShadow = true;
    parts.push(part);root.add(part);
  }
  const before = new THREE.Box3().setFromObject(root);
  prepareRetailModel(root);
  const after = new THREE.Box3().setFromObject(root);
  assert.ok(before.min.distanceTo(after.min) < 1e-6);
  assert.ok(before.max.distanceTo(after.max) < 1e-6);
  const batches = root.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
  assert.equal(batches.length, 3);
  assert.equal(batches.filter(o => o.castShadow).length, 1);
  assert.ok(batches.includes(parts[5]), 'glass keeps its own sortable mesh');
  assert.ok(batches.every(o => o.receiveShadow));
  root.position.x += 3;
  const moved = new THREE.Box3().setFromObject(root);
  assert.equal(moved.min.x, after.min.x + 3, 'parent motion reaches frozen local transforms');
});

test('retail batching retains hidden parts and geometry shared with an unbatched mesh', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const finish = new THREE.MeshStandardMaterial();
  let disposed = 0;geometry.addEventListener('dispose', () => disposed++);
  for (let i = 0; i < 3; i++) {
    const part = new THREE.Mesh(geometry, finish);part.visible = i !== 2;root.add(part);
  }
  const hidden = root.children[2];
  prepareRetailModel(root);
  assert.equal(disposed, 0);
  assert.ok(root.children.includes(hidden));
  assert.equal(hidden.visible, false);
  assert.equal(root.children.length, 2);
});
