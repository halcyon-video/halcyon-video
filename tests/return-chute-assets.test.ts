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
    const [red, green, blue] = m.pbrMetallicRoughness.baseColorFactor;
    if (m.name === 'ChuteLaminate') assert.ok(blue > red * 3 && blue > green * 3, 'body retains blue laminate');
    if (m.name === 'ChuteSteel') {
      assert.ok(Math.min(red, green, blue) > .8, 'only the slot is white');
      assert.equal(m.pbrMetallicRoughness.metallicFactor, 0);
    }
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
  assert.ok(b.min.distanceTo(new THREE.Vector3(-1.6, 0, -1.49)) < .001);
  assert.ok(b.max.distanceTo(new THREE.Vector3(1.6, 3.85, .340333)) < .001);
  let triangles = 0; const roles = new Set<string>();
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    roles.add((o.material as THREE.Material).name);
    triangles += o.geometry.index!.count / 3;
    for (const key of ['position', 'normal', 'uv']) assert.ok([...o.geometry.attributes[key].array].every(Number.isFinite));
  });
  assert.deepEqual([...roles].sort(), ['ChuteLaminate', 'ChuteReveal', 'ChuteSteel']);
  assert.ok(triangles < 3500); assert.ok(bytes.length < 450000);
  const ray = new THREE.Raycaster(new THREE.Vector3(-.9, 2.55, 1.1), new THREE.Vector3(0, 0, -1));
  for (const x of [-.9,.9]) {
    const mouth = new THREE.Raycaster(new THREE.Vector3(x,2.55,1.1),new THREE.Vector3(0,0,-1));
    assert.equal(mouth.intersectObject(scene.getObjectByName('ChuteLaminate')!,true).length,0,'both shell apertures pass through');
  }
  const face = new THREE.Raycaster(new THREE.Vector3(0,2.1,1),new THREE.Vector3(0,0,-1)).intersectObject(scene.getObjectByName('ChuteLaminate')!,true);
  assert.ok(face.length && Math.abs(face[0].point.z-1/3)<.001,'front shell remains solid outside its two apertures');
  const roof = new THREE.Raycaster(new THREE.Vector3(0, 4.3, -.8), new THREE.Vector3(0, -1, 0), 0, 1).intersectObject(scene, true);
  assert.ok(roof.length > 0, 'continuous top covers the collection cavity');
  assert.ok(Math.abs(roof[0].point.y - 3.85) < .01);
  const rear = new THREE.Raycaster(new THREE.Vector3(.6, 2, -.8), new THREE.Vector3(0, 0, -1), 0, .8);
  assert.equal(rear.intersectObject(scene, true).length, 0, 'hollow receiver remains accessible from the rear');
  const flap = scene.getObjectByName('ChuteFlap')!;
  assert.ok(flap.position.distanceTo(new THREE.Vector3(-.9, 2.665, .309333)) < .0001);
  flap.rotation.x += Math.PI / 2 - .24; scene.updateMatrixWorld(true);
  const hits = ray.intersectObject(scene, true);
  assert.ok(hits.length > 0);
  assert.ok(hits[0].point.z < .1, 'open flap reveals a deep receiver, not a solid cavity');
});


test('outside return ramp descends through the countertop into an enclosed cabinet', async () => {
  const bytes = readFileSync(new URL('../public/models/exit-return-counter.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  const down = new THREE.Raycaster(new THREE.Vector3(5.6,3.9,-1.65),new THREE.Vector3(0,-1,0));
  const hits = down.intersectObject(scene,true);
  assert.ok(hits.length && hits[0].point.y<2.82 && hits[0].point.y>2.2,'ramp outlet reaches below the surrounding worktop');
  const front = new THREE.Raycaster(new THREE.Vector3(5.6,1,-3),new THREE.Vector3(0,0,1));
  assert.ok(front.intersectObject(scene,true).length,'cabinet below the opening remains enclosed');
});
