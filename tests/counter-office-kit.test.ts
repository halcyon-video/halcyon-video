import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('office kit exports feet, supported bounds, shared trays, UVs and separate paper', async () => {
  const bytes = await readFile(new URL('../public/models/counter-office-kit.glb', import.meta.url));
  assert.ok(bytes.length < 500_000);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(json.images?.length ?? 0, 0);
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const bounds = new THREE.Box3().setFromObject(scene);
  assert.ok(bounds.min.y >= -.001 && bounds.max.y < 2.05);
  assert.ok(bounds.min.x > -1.78 && bounds.max.x < 1.72);
  assert.ok(bounds.min.z > -.57 && bounds.max.z < .66);
  for (const name of ['anchor_worktop', 'anchor_bulletin', 'anchor_clipboard']) assert.ok(scene.getObjectByName(name));
  let triangles = 0;
  let displayCenterZ = -Infinity;
  const roles = new Set<string>();
  const trays: THREE.Mesh[] = [];
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.name.startsWith('Letter_tray')) trays.push(o);
    const pos = o.geometry.getAttribute('position');
    for (const name of ['position', 'normal', 'uv']) {
      const attr = o.geometry.getAttribute(name);
      assert.ok(attr, `${o.name} lacks ${name}`);
      assert.ok(Array.from(attr.array).every(Number.isFinite));
      assert.equal(attr.count, pos.count);
    }
    triangles += (o.geometry.index?.count ?? pos.count) / 3;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      roles.add(m.name);
      if (m.name === 'OfficeDisplay') displayCenterZ = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).z;
    }
  });
  assert.ok(displayCenterZ > .05, 'calculator display must sit behind its keys, away from the clerk');
  assert.equal(trays.length, 7);
  assert.equal(new Set(trays.map(t => t.geometry)).size, 1, 'tray geometry must be shared');
  const size = new THREE.Box3().setFromObject(trays[0]).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 10 / 12) < .03 && Math.abs(size.z - 13 / 12) < .03);
  scene.updateMatrixWorld(true);
  const first = trays.sort((a, b) => a.position.y - b.position.y)[0];
  const ray = new THREE.Raycaster(new THREE.Vector3(1.28, .115, -2), new THREE.Vector3(0, 0, 1));
  const hits = ray.intersectObject(first);
  assert.ok(hits.length && hits[0].point.z > .5, 'tray must open toward the clerk and stop at its rear wall');
  assert.ok(triangles < 11_000);
  for (const role of ['OfficePaper', 'OfficeMetal', 'OfficeCork', 'OfficeDisplay', 'OfficeKey', 'OfficeAccent']) assert.ok(roles.has(role));
});
