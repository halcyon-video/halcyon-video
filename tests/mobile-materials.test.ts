import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { simplifyMobileSceneMaterials } from '../src/mobile-materials.ts';

test('mobile material pass collapses PBR while preserving texture and transparency', () => {
  const root = new THREE.Group();
  const map = new THREE.Texture();
  const pbr = new THREE.MeshStandardMaterial({
    color: 0x8090a0,
    map,
    transparent: true,
    opacity: 0.6,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), pbr);
  const alreadyBasic = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const basicMesh = new THREE.Mesh(new THREE.BoxGeometry(), alreadyBasic);
  root.add(mesh, basicMesh);

  simplifyMobileSceneMaterials(root, 'overview');

  assert.ok(mesh.material instanceof THREE.MeshBasicMaterial);
  assert.equal((mesh.material as THREE.MeshBasicMaterial).map, map);
  assert.equal(mesh.material.transparent, true);
  assert.equal(mesh.material.opacity, 0.6);
  assert.equal(basicMesh.material, alreadyBasic);
});
