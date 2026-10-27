import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
    if (m.name === 'ChuteSteel' || m.name === 'ChuteRearRim') {
      assert.ok(Math.min(red, green, blue) > .8, 'slot and approved rear rim are white');
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
  const approvedPoints = new Set<string>();
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    roles.add((o.material as THREE.Material).name);
    const positions=o.geometry.attributes.position;
    for(let i=0;i<positions.count;i++) {
      const point=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);
      approvedPoints.add(point.toArray().map(n=>n.toFixed(5)).join(','));
    }
    triangles += o.geometry.index!.count / 3;
    for (const key of ['position', 'normal', 'uv']) assert.ok([...o.geometry.attributes[key].array].every(Number.isFinite));
  });
  assert.deepEqual([...roles].sort(), ['ChuteLaminate', 'ChuteRearRim', 'ChuteReveal', 'ChuteSteel']);
  // Owner pin 246 approved this exact physical shape. Material-only changes
  // may split primitives, but must retain every authored position and triangle.
  assert.equal(triangles,3112);
  assert.equal(createHash('sha256').update([...approvedPoints].sort().join('\n')).digest('hex'),
    '42c537dcfa2541976e867d1b277775366acbb67eb1ab22bcdbcc34624b221a5c');
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
  // The crown must keep its full roll, not regress to a small edge fillet.
  const roll = .38, diagonal = roll / Math.sqrt(2);
  const crown = new THREE.Raycaster(new THREE.Vector3(0, 4.3, 1/3 - roll + diagonal), new THREE.Vector3(0, -1, 0))
    .intersectObject(scene.getObjectByName('ChuteLaminate')!, true);
  assert.ok(crown.length && Math.abs(crown[0].point.y - (3.85 - roll + diagonal)) < .002, 'pronounced quarter-round crown reaches the established profile');
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
  const down = new THREE.Raycaster(new THREE.Vector3(5.6,2.75,-1.65),new THREE.Vector3(0,-1,0));
  const hits = down.intersectObject(scene,true);
  assert.ok(hits.length && hits[0].point.y<2.82 && hits[0].point.y>2.2,'covered ramp outlet reaches below the uninterrupted white worktop');
  const hood = new THREE.Raycaster(new THREE.Vector3(5.6,4.5,-.6),new THREE.Vector3(0,-1,0));
  const hoodHits=hood.intersectObject(scene,true);
  assert.ok(hoodHits.length && hoodHits[0].point.y<=3.55,'short sloping hood does not form an oversized box');
  const front = new THREE.Raycaster(new THREE.Vector3(5.6,1,-3),new THREE.Vector3(0,0,1));
  assert.ok(front.intersectObject(scene,true).length,'cabinet below the opening remains enclosed');
});

test('single-slot housing: fitted saddle, one open throat, baffle depth and no lower plate', async () => {
  const bytes = readFileSync(new URL('../public/models/single-slot-return.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  assert.equal(gltf.images.length, 2);
  for (const m of gltf.materials) {
    assert.ok(m.normalTexture);
    assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);
    const [red, green, blue] = m.pbrMetallicRoughness.baseColorFactor;
    if (m.name === 'ChuteLaminate') assert.ok(blue > red * 3 && blue > green * 3, 'housing retains blue laminate');
    if (m.name === 'ChuteSteel') assert.ok(Math.min(red, green, blue) > .8, 'throat is pale metal');
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
  assert.ok(b.min.distanceTo(new THREE.Vector3(-1.35, .35, -1.49)) < .001);
  assert.ok(b.max.distanceTo(new THREE.Vector3(1.35, 3.9, .337333)) < .001);
  let triangles = 0; const roles = new Set<string>();
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    roles.add((o.material as THREE.Material).name);
    triangles += o.geometry.index!.count / 3;
    for (const key of ['position', 'normal', 'uv']) assert.ok([...o.geometry.attributes[key].array].every(Number.isFinite));
  });
  assert.deepEqual([...roles].sort(), ['ChuteLaminate', 'ChuteReveal', 'ChuteSteel']);
  assert.ok(triangles < 2000); assert.ok(bytes.length < 300000);
  const shell = scene.getObjectByName('ChuteLaminate')!;
  const mouth = new THREE.Raycaster(new THREE.Vector3(0, 2.41, 1.1), new THREE.Vector3(0, 0, -1));
  assert.equal(mouth.intersectObject(shell, true).length, 0, 'the one opening passes through the shell');
  const deep = mouth.intersectObject(scene, true);
  assert.ok(deep.length && deep[0].object.name === 'ChuteReveal' && Math.abs(deep[0].point.z - .05) < .001, 'the throat ends on the dark baffle, 0.28 ft in');
  for (const [x, y] of [[-.9, 2.55], [.9, 2.55], [0, 3.1], [0, 1.0]]) {
    const face = new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1)).intersectObject(shell, true);
    assert.ok(face.length && Math.abs(face[0].point.z - 1 / 3) < .001, `front panel is solid at (${x}, ${y})`);
  }
  const throat = new THREE.Raycaster(new THREE.Vector3(0, 2.41, .2), new THREE.Vector3(0, -1, 0)).intersectObject(scene, true);
  assert.ok(throat.length && throat[0].object.name === 'ChuteSteel' && throat[0].point.y > 2.10, 'tapered steel floor rises into the recess');
  const below = new THREE.Raycaster(new THREE.Vector3(0, 1.58, 1), new THREE.Vector3(0, 0, -1)).intersectObject(scene, true);
  assert.ok(below.length && below[0].object.name === 'ChuteLaminate' && Math.abs(below[0].point.z - 1 / 3) < .001, 'nothing pale stands proud of the face below the opening');
  const roof = new THREE.Raycaster(new THREE.Vector3(0, 4.3, -.8), new THREE.Vector3(0, -1, 0), 0, 1).intersectObject(scene, true);
  assert.ok(roof.length && Math.abs(roof[0].point.y - 3.9) < .01, 'crown covers the counter top');
  const roll = .33, diagonal = roll / Math.sqrt(2);
  const crown = new THREE.Raycaster(new THREE.Vector3(0, 4.3, 1 / 3 - roll + diagonal), new THREE.Vector3(0, -1, 0)).intersectObject(shell, true);
  assert.ok(crown.length && Math.abs(crown[0].point.y - (3.9 - roll + diagonal)) < .002, 'quarter-round crown along the top-front edge');
  const hollow = new THREE.Raycaster(new THREE.Vector3(1.0, 3.0, -.8), new THREE.Vector3(0, -1, 0)).intersectObject(scene, true);
  assert.equal(hollow.length, 0, 'saddle is open underneath for the counter band');
  const clip = new THREE.Raycaster(new THREE.Vector3(0, 3.0, -2.5), new THREE.Vector3(0, 0, 1)).intersectObject(shell, true);
  assert.ok(clip.length && Math.abs(clip[0].point.z + 1.49) < .001, 'staff-side clip closes the rear above the band top');
  const low = new THREE.Raycaster(new THREE.Vector3(0, 1.5, -2.5), new THREE.Vector3(0, 0, 1)).intersectObject(shell, true);
  assert.ok(low.length && low[0].point.z > 0, 'rear stays open below the clip so nothing reaches into the staff well');
  assert.equal(scene.getObjectByName('ChuteFlap'), undefined, 'no hinged flap: the throat is open');
});
