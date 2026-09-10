import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

for (const part of ['frame','tray']) test(`candy rack ${part}: exported bounds, UVs, normals and resource budget`, async () => {
  const bytes = readFileSync(new URL(`../public/models/candy-rack-${part}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const dimensions = box.getSize(new THREE.Vector3());
  assert.ok(dimensions.x <= 3 && dimensions.z <= .7);
  if (part === 'frame') { assert.ok(box.min.y >= -1e-6 && box.max.y > 4 && box.max.y < 4.04); }
  else { assert.ok(Math.abs(box.min.y + .026) < 1e-6 && box.max.y < .12); }
  let triangles = 0, meshes = 0;
  gltf.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    const geometry = object.geometry;
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    for (const name of ['position','normal','uv']) {
      assert.ok(geometry.attributes[name], `${part} missing ${name}`);
      assert.ok([...geometry.attributes[name].array].every(Number.isFinite));
    }
    assert.ok(['RackSteel','RackFeet'].includes(object.material.name));
    assert.equal(object.material.map, null);
  });
  assert.equal(meshes, part === 'frame' ? 2 : 1);
  assert.ok(triangles <= (part === 'frame' ? 650 : 500));
  assert.ok(bytes.length < 32000);
});
