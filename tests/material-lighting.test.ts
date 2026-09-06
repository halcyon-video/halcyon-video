import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { auditStoreMaterials, selfLit } from '../src/material-lighting.ts';
import { disposeDetachedModel } from '../src/model-resources.ts';

test('ordinary objects cannot silently acquire an unlit, emissive or exposure-bypassing finish', () => {
  const root = new THREE.Group();
  const g = new THREE.BoxGeometry();
  root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ roughness: .7 })));
  assert.deepEqual(auditStoreMaterials(root).problems, []);
  root.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial()));
  root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ emissive: 0xffffff })));
  root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ toneMapped: false })));
  assert.equal(auditStoreMaterials(root).problems.length, 3);
  root.add(new THREE.Mesh(g, selfLit(new THREE.MeshBasicMaterial(), 'window-poster')));
  root.add(new THREE.Mesh(g, selfLit(new THREE.MeshStandardMaterial({ emissive: 0xffffff }), 'light-source')));
  assert.equal(auditStoreMaterials(root).problems.length, 3);
});

test('late abandoned loads release shared geometry, materials and maps once', () => {
  const root = new THREE.Group();
  const g = new THREE.BoxGeometry(), texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture, roughnessMap: texture });
  root.add(new THREE.Mesh(g, material), new THREE.Mesh(g, material));
  const disposed = [0,0,0];
  [g,material,texture].forEach((r,i)=>r.addEventListener('dispose',()=>disposed[i]++));
  disposeDetachedModel(root);
  assert.deepEqual(disposed,[1,1,1]);
});

test('an unlit character billboard is audited alongside physical meshes', () => {
  const root = new THREE.Group();
  root.add(new THREE.Sprite(new THREE.SpriteMaterial()));
  assert.equal(auditStoreMaterials(root).problems.length, 1);
});
