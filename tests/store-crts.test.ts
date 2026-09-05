import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Keep the real binary geometry, stripping only browser image decoding for Node.
async function geometryOnly(file: string) {
  const bytes = await readFile(new URL(`../public/models/${file}.glb`, import.meta.url));
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
  assert.ok(bytes.length < 500_000, `${file} exceeds 500KB`);
  assert.ok(json.images?.every((i: { bufferView: number }) => i.bufferView !== undefined), 'textures must be embedded');
  for (const material of json.materials) {
    assert.ok(!material.extensions?.KHR_materials_unlit, 'cabinet must respond to lighting');
    assert.ok(!material.emissiveFactor?.some((v: number) => v > 0));
    delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
  }
  delete json.images; delete json.textures; delete json.samplers;
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32); encoded.copy(padded);
  const binary = bytes.subarray(20 + length);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const output = Buffer.concat([header, padded, binary]);
  return new GLTFLoader().parseAsync(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength), '');
}

for (const [name, w, h, cy, sw, sh] of [
  ['rental-terminal', 1.48, 1.55, .90, 1.075, .806],
  ['ceiling-television', 2.6, 2.12, 1.19, 2.12, 1.59],
  ['screening-television', 2.2, 1.86, 1.04, 1.78, 1.335],
] as const) test(`${name}: shelf fit, physical surfaces and unobstructed live tube`, async () => {
  const { scene } = await geometryOnly(name);
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(bounds.max.x - bounds.min.x - w) < .001);
  assert.ok(Math.abs(bounds.max.y - h) < .001);
  assert.ok(Math.abs(bounds.min.y) < .001);
  let triangles = 0, meshes = 0;
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    for (const name of ['position', 'normal', 'uv']) {
      const attr = o.geometry.getAttribute(name);
      assert.ok(attr, `${o.name}: missing ${name}`);
      assert.ok(Array.from(attr.array).every(Number.isFinite));
    }
    triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
  });
  assert.equal(meshes, 6);
  assert.ok(triangles < 8000, `triangle cost ${triangles}`);
  const glass = scene.getObjectByName('mat16');
  const tube = scene.getObjectByName('mat17');
  assert.ok(glass && tube);
  const face = new THREE.Box3().setFromObject(glass);
  assert.ok(Math.abs(face.max.x - face.min.x - sw) < .001);
  assert.ok(Math.abs(face.max.y - face.min.y - sh) < .001);
  // A capped cabinet seam previously hid the picture. Probe centre and corners.
  for (const x of [-sw*.35, 0, sw*.35]) for (const y of [cy-sh*.35, cy, cy+sh*.35]) {
    const hits = new THREE.Raycaster(new THREE.Vector3(x,y,-5),new THREE.Vector3(0,0,1)).intersectObject(scene,true);
    assert.ok(hits.length > 0);
    assert.equal(hits[0].object.name,'mat16', `opaque cabinet covers tube at ${x},${y}`);
  }
});
