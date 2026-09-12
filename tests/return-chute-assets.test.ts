import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('interior chute: fitted bounds, textured roles, open throat and hinged clearance', async () => {
  const bytes = readFileSync(new URL('../public/models/interior-return-chute.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  assert.equal(gltf.images.length, 2);
  for (const m of gltf.materials) {
    assert.ok(m.normalTexture);
    assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.ok(m.pbrMetallicRoughness.baseColorFactor.slice(0, 3).every((v: number) => v >= .079));
    // Node has no image decoder. Validate texture records above; parse geometry below.
    delete m.normalTexture;
    delete m.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  delete gltf.images; delete gltf.textures;
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const bin = bytes.subarray(20 + jsonLength);
  const container = Buffer.alloc(20 + padded.length + bin.length);
  bytes.copy(container, 0, 0, 20); container.writeUInt32LE(container.length, 8);
  container.writeUInt32LE(padded.length, 12); padded.copy(container, 20); bin.copy(container, 20 + padded.length);
  const { scene } = await new GLTFLoader().parseAsync(container.buffer.slice(container.byteOffset, container.byteOffset + container.length), '');
  scene.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(scene);
  assert.ok(b.min.distanceTo(new THREE.Vector3(-1.2, 0, -1.49)) < .001);
  assert.ok(b.max.distanceTo(new THREE.Vector3(1.2, 3.85, .907)) < .001);
  let triangles = 0; const roles = new Set<string>();
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    roles.add((o.material as THREE.Material).name);
    triangles += o.geometry.index!.count / 3;
    for (const key of ['position', 'normal', 'uv']) assert.ok([...o.geometry.attributes[key].array].every(Number.isFinite));
  });
  assert.deepEqual([...roles].sort(), ['ChuteLaminate', 'ChuteReveal', 'ChuteSteel']);
  assert.ok(triangles < 2500); assert.ok(bytes.length < 400000);
  const ray = new THREE.Raycaster(new THREE.Vector3(-.5, 2.55, 1.1), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(scene.getObjectByName('ChuteLaminate')!, true).length, 0, 'shell aperture passes through');
  const flap = scene.getObjectByName('ChuteFlap')!;
  assert.ok(flap.position.distanceTo(new THREE.Vector3(-.5, 2.665, .743)) < .0001);
  flap.rotation.x += Math.PI / 2 - .24; scene.updateMatrixWorld(true);
  const hits = ray.intersectObject(scene, true);
  assert.ok(hits.length > 0);
  assert.ok(hits[0].point.z < .1, 'open flap reveals a deep receiver, not a solid cavity');
});
