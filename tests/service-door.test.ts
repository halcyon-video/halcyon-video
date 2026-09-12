import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('service doorway export fits the retained wall dressing envelope with UVs', () => {
  const data = readFileSync(new URL('../public/models/service-door.glb', import.meta.url));
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  const gltf = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  assert.deepEqual(gltf.materials.map((m: { name: string }) => m.name).sort(),
    ['ServiceFrame', 'ServiceHardware', 'ServiceLeaf', 'ServiceSeal']);
  let triangles = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    assert.ok(p.attributes.NORMAL !== undefined);
    assert.ok(p.attributes.TEXCOORD_0 !== undefined);
    triangles += gltf.accessors[p.indices].count / 3;
    const a = gltf.accessors[p.attributes.POSITION];
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); }
  }
  assert.ok(triangles < 4000);
  assert.ok(data.length < 250000);
  assert.ok(lo[2] >= -1.701 && hi[2] <= 1.701, 'unchanged 3.4-foot exclusion span');
  assert.ok(lo[1] >= 0 && hi[1] <= 7.201, 'floor and head envelope');
  assert.ok(lo[0] < -.35 && hi[0] >= .99, 'interior hardware and exterior threshold');
  assert.equal(gltf.textures?.length ?? 0, 0);
  assert.equal(gltf.animations?.length ?? 0, 0);
});
