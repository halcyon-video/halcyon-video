import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('price labeler has bounded geometry, UVs, portable physical surfaces and contact origin', async () => {
  const bytes = await readFile(new URL('../public/models/price-label-gun.glb', import.meta.url));
  assert.ok(bytes.length < 600_000);
  const length = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString());
  assert.equal(gltf.images.length, 7);
  for (const image of gltf.images) {
    const view = gltf.bufferViews[image.bufferView];
    const png = bytes.subarray(28 + length + view.byteOffset, 28 + length + view.byteOffset + view.byteLength);
    assert.equal(png.readUInt32BE(16), 128); assert.equal(png.readUInt32BE(20), 128);
  }
  assert.equal(gltf.materials.length, 5);
  for (const m of gltf.materials) {
    assert.ok(m.normalTexture && m.pbrMetallicRoughness.baseColorTexture && m.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.ok(m.pbrMetallicRoughness.roughnessFactor >= .3);
    assert.ok(!m.doubleSided);
  }
  // Node has no DOM image decoder. Validate surface bindings above; parse the
  // exact exported vertex/index data without texture loading for mesh checks.
  for (const m of gltf.materials) {
    delete m.normalTexture; delete m.pbrMetallicRoughness.baseColorTexture;
    delete m.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  const jsonBytes = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20); jsonBytes.copy(padded);
  const binChunk = bytes.subarray(20 + length);
  const rebuilt = Buffer.alloc(20 + padded.length + binChunk.length);
  bytes.copy(rebuilt, 0, 0, 20); rebuilt.writeUInt32LE(rebuilt.length, 8);
  rebuilt.writeUInt32LE(padded.length, 12); padded.copy(rebuilt, 20); binChunk.copy(rebuilt, 20 + padded.length);
  const { scene } = await new GLTFLoader().parseAsync(rebuilt.buffer, '');
  const bounds = new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(bounds.min.y) < .00001);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x > .7 && size.x < .76 && size.y < .30 && size.z > .58 && size.z < .63);
  for (const name of ['anchor_worktop','anchor_trigger_pivot','anchor_label_exit']) assert.ok(scene.getObjectByName(name));
  let triangles=0, meshes=0;
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    for (const name of ['position','normal','uv']) {
      const attr=o.geometry.getAttribute(name); assert.ok(attr);
      assert.ok(Array.from(attr.array).every(Number.isFinite));
      assert.equal(attr.count,o.geometry.getAttribute('position').count);
    }
    triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count)/3;
  });
  assert.equal(meshes,5);assert.ok(triangles<6500);
});

test('both shield finishes support the entire labeler footprint at the agreed datum', async () => {
  for (const finish of ['laminate','rounded']) {
    const bytes = await readFile(new URL(`../public/models/checkout-counter-shield-${finish}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    scene.updateMatrixWorld(true);
    // Counter model origin is cx=0, backZ=0. Probe all four bounding corners
    // and the center, not just the invisible navigation rectangle.
    for (const x of [-4.24,-3.9,-3.49806]) for (const z of [-1.06367,-.75,-.45518]) {
      const ray=new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0));
      const hits=ray.intersectObject(scene,true);
      assert.ok(hits.length,`${finish}: unsupported footprint at ${x},${z}`);
      assert.ok(Math.abs(hits[0].point.y-3.54)<.001,`${finish}: wrong support height ${hits[0].point.y}`);
    }
  }
});
