import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { finishEquipmentSurfaces } from '../src/fixtures/equipment-surfaces.ts';

test('equipment finish preserves authored colour and normal maps and uses a separate UV channel', () => {
  const group = new THREE.Group();
  const map = new THREE.Texture(), normal = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map, normalMap: normal, roughness: .42 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  const uv = mesh.geometry.getAttribute('uv').array.slice();
  group.add(mesh);
  const owned = finishEquipmentSurfaces(group, true);
  assert.equal(material.map, map);
  assert.equal(material.normalMap, normal);
  assert.deepEqual(mesh.geometry.getAttribute('uv').array, uv);
  assert.equal(material.roughnessMap?.channel, 1);
  assert.equal(material.roughnessMap?.colorSpace, THREE.NoColorSpace);
  assert.ok(mesh.geometry.getAttribute('uv1'));
  assert.ok(owned.includes(material.roughnessMap!));
  assert.equal(finishEquipmentSurfaces(group, true).length, 0);
  owned.forEach(texture => texture.dispose());
  mesh.geometry.dispose(); material.dispose(); map.dispose(); normal.dispose();
});

test('bare molded surfaces gain detail while glass, lit screens and printed art keep their finishes', () => {
  const group = new THREE.Group();
  const plastic = new THREE.MeshStandardMaterial({ roughness: .55 });
  const glass = new THREE.MeshPhysicalMaterial({ transparent: true, roughness: .4 });
  const screen = new THREE.MeshStandardMaterial({ emissive: 0x00ff00, roughness: .5 });
  const art = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), roughness: .6 });
  for (const material of [plastic, glass, screen, art]) group.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const owned = finishEquipmentSurfaces(group);
  assert.ok(plastic.bumpMap && plastic.roughnessMap);
  for (const material of [glass, screen, art]) {
    assert.equal(material.bumpMap, null);
    assert.equal(material.roughnessMap, null);
  }
  owned.forEach(texture => texture.dispose());
  group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); object.material.dispose(); } });
  art.map!.dispose();
});
