import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { materialTextureLoad } from '../src/material-texture-load.ts';

test('an image arriving after rebuild cannot revive a material or request a frame', async () => {
  const material = new THREE.MeshStandardMaterial();
  let renders = 0, releases = 0;
  const loaded = materialTextureLoad([material], texture => { material.map = texture; renders++; });
  const texture = new THREE.Texture();
  texture.addEventListener('dispose', () => releases++);
  const completion = Promise.resolve().then(() => loaded(texture));
  material.dispose();
  await completion;
  assert.equal(material.map, null);
  assert.equal(renders, 0);
  assert.equal(releases, 1);
});

test('a shared replacement map lives until its last material retires', () => {
  const shelf = new THREE.MeshStandardMaterial(), backing = new THREE.MeshStandardMaterial();
  const original = new THREE.Texture(), map = new THREE.Texture();
  shelf.normalMap = backing.normalMap = original;
  let freed = 0, originalFreed = 0;
  map.addEventListener('dispose', () => freed++);
  original.addEventListener('dispose', () => originalFreed++);
  const loaded = materialTextureLoad([shelf, backing], texture => { shelf.normalMap = backing.normalMap = texture; });
  loaded(map);
  shelf.dispose();
  assert.equal(freed, 0, 'the live backing still samples the texture');
  backing.dispose();
  assert.equal(freed, 1);
  shelf.dispose(); backing.dispose();
  assert.equal(freed, 1, 'repeated disposal is harmless');
  assert.equal(originalFreed, 0, 'existing cached textures retain their own owner');
});

test('a neutralized carpet map is released, and replacing an owned map frees its predecessor', () => {
  const floor = new THREE.MeshStandardMaterial();
  const first = new THREE.Texture(), second = new THREE.Texture();
  let firstFreed = 0, secondFreed = 0;
  first.addEventListener('dispose', () => firstFreed++);
  second.addEventListener('dispose', () => secondFreed++);
  const loaded = materialTextureLoad([floor], (source, neutral: THREE.Texture) => { source.dispose(); floor.map = neutral; });
  loaded(new THREE.Texture(), first);
  loaded(new THREE.Texture(), second);
  assert.equal(firstFreed, 1);
  assert.equal(secondFreed, 0);
  floor.dispose();
  assert.equal(secondFreed, 1);
});

test('a response cannot mutate any member of a partly retired shared surface', () => {
  const shelf = new THREE.MeshStandardMaterial(), backing = new THREE.MeshStandardMaterial();
  let assigned = 0, freed = 0;
  const loaded = materialTextureLoad([shelf, backing], texture => { assigned++; shelf.roughnessMap = backing.roughnessMap = texture; });
  shelf.dispose();
  const map = new THREE.Texture(); map.addEventListener('dispose', () => freed++);
  loaded(map);
  assert.equal(assigned, 0); assert.equal(freed, 1);
  backing.dispose();
});
