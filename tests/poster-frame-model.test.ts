import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

for (const [variant, width, height, depth] of [['window', 3.14, 4.39, .22], ['wall', 4.7 * 2 / 3 + .18, 4.88, .08]] as const) {
  test(`${variant} exported frame: dimensions, UVs, inward face, recessed backing and budget`, async () => {
    const data = readFileSync(new URL(`../public/models/poster-frame-${variant}.glb`, import.meta.url));
    const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
    assert.equal(json.images, undefined);
    assert.equal(json.meshes.length, 3);
    assert.deepEqual(json.materials.map((m: { name: string }) => m.name).sort(), ['Backing', 'FrameFinish', 'GlazingSeat']);
    const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    [width, height, depth].forEach((n, i) => assert.ok(Math.abs(size.getComponent(i) - n) < 1e-5));
    let triangles = 0;
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const g = o.geometry;
      triangles += g.index!.count / 3;
      assert.equal(g.getAttribute('uv').count, g.getAttribute('position').count);
      assert.ok(Array.from(g.getAttribute('normal').array).every(Number.isFinite));
    });
    assert.equal(triangles, 220);
    // No frame or glazing surface covers the existing artwork at z=0.
    const hit = new THREE.Raycaster(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)).intersectObject(root)[0];
    assert.match(hit.object.name, /Backing/);
    assert.ok(hit.point.z < -.01 && hit.point.z > -.02);
    assert.ok(hit.face!.normal.z > .99);
    const moulding = root.getObjectByName(`${variant}_MitredMoulding`)!;
    const front = new THREE.Raycaster(new THREE.Vector3(width / 2 - (variant === 'window' ? .16 : .045), 0, 1), new THREE.Vector3(0, 0, -1)).intersectObject(moulding)[0];
    assert.ok(front && front.point.z > 0, 'moulding must project in front of print');
    assert.ok(data.byteLength < 20000);
  });
}
