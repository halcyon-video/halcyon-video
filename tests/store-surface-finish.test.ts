import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installStoreSurfaceFinishes, needsSurfaceFinish } from '../src/store-surface-finish.ts';

test('bare physical finishes preserve authored artwork, optical surfaces and brand colour', () => {
  const scene = new THREE.Scene();
  const bare = new THREE.MeshStandardMaterial({ color: '#ae3268', roughness: .6 });
  const printed = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  const glass = new THREE.MeshPhysicalMaterial({ transmission: 1 });
  const wrapped = new THREE.MeshPhysicalMaterial({ clearcoat: .35, clearcoatRoughnessMap: new THREE.Texture() });
  const light = new THREE.MeshStandardMaterial({ emissive: '#ffffff' });
  const hidden = new THREE.MeshStandardMaterial({ visible: false });
  for (const material of [bare, printed, glass, wrapped, light, hidden]) scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const colour = bare.color.clone(), original = printed.map;
  const dispose = installStoreSurfaceFinishes(scene);
  assert.ok(bare.bumpMap && bare.roughnessMap);
  assert.ok(bare.color.equals(colour));
  assert.equal(printed.map, original);
  for (const m of [printed, glass, wrapped, light, hidden]) assert.equal(m.bumpMap, null);
  assert.equal(needsSurfaceFinish(bare), false);
  dispose();
});

test('later model arrivals and shared materials receive UVs without replacing authored UVs', () => {
  const scene = new THREE.Scene(), parent = new THREE.Group(); scene.add(parent);
  const dispose = installStoreSurfaceFinishes(scene);
  const material = new THREE.MeshStandardMaterial();
  const model = new THREE.Group();
  const first = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const second = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  const uv = first.geometry.getAttribute('uv');
  model.add(first, second); parent.add(model);
  assert.equal(first.geometry.getAttribute('uv'), uv);
  assert.ok(first.geometry.hasAttribute('uv3'));
  assert.ok(second.geometry.hasAttribute('uv3'));
  assert.equal(material.bumpMap!.channel, 3);
  parent.remove(model); parent.add(model);
  assert.ok(first.geometry.hasAttribute('uv3'));
  dispose();
});

test('one texture per finish stays alive until its final material is disposed', () => {
  const scene = new THREE.Scene();
  const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), a), new THREE.Mesh(new THREE.BoxGeometry(), b));
  const cleanup = installStoreSurfaceFinishes(scene);
  assert.equal(a.bumpMap, b.bumpMap);
  let disposed = 0; a.bumpMap!.addEventListener('dispose', () => disposed++);
  a.dispose(); assert.equal(disposed, 0);
  b.dispose(); assert.equal(disposed, 1);
  cleanup(); cleanup(); assert.equal(disposed, 1);
  const later = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), later));
  assert.equal(later.bumpMap, null);
});
