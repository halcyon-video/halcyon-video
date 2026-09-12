import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Matrix4, Vector3, Quaternion } from 'three';

for (const [variant, height, depth] of [['header', 1.2, .07], ['floor', 3, .85]] as const) {
  test(`standee ${variant}: UVs, material roles, real slots and bounded resource cost`, () => {
    const bytes = readFileSync(new URL(`../public/models/standee-support-${variant}.glb`, import.meta.url));
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.equal(gltf.images, undefined);
    assert.deepEqual(gltf.materials.map((m: any) => m.name).sort(), ['CompressedFold', 'CorrugatedCutEdge', 'KraftLiner']);
    let triangles = 0, draws = 0;
    for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
      assert.notEqual(p.attributes.TEXCOORD_0, undefined);
      assert.notEqual(p.attributes.NORMAL, undefined);
      triangles += gltf.accessors[p.indices].count / 3; draws++;
    }
    assert.ok(triangles < 1000);
    assert.ok(draws <= 18);
    assert.ok(bytes.length < 55_000);
    assert.ok(gltf.nodes.some((n: any) => n.name.endsWith('ShoulderedLockingBridge')));
    assert.equal(gltf.nodes.filter((n: any) => n.name.includes('ScoredFoot')).length, 2);
    const bounds = new Box3();
    function visit(i: number, parent = new Matrix4()) {
      const n = gltf.nodes[i];
      const local = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(
        new Vector3(...(n.translation || [0, 0, 0])),
        new Quaternion(...(n.rotation || [0, 0, 0, 1])),
        new Vector3(...(n.scale || [1, 1, 1])),
      );
      const transform = parent.clone().multiply(local);
      if (n.mesh !== undefined) for (const p of gltf.meshes[n.mesh].primitives) {
        const a = gltf.accessors[p.attributes.POSITION];
        bounds.union(new Box3(new Vector3(...a.min), new Vector3(...a.max)).applyMatrix4(transform));
      }
      for (const child of n.children || []) visit(child, transform);
    }
    for (const i of gltf.scenes[gltf.scene].nodes) visit(i);
    assert.ok(Math.abs(bounds.min.y) < 1e-6, 'feet contact the anchor plane');
    assert.ok(Math.abs(bounds.max.y - height) < 1e-6);
    assert.ok(Math.abs(bounds.min.z + depth + .008) < 1e-6);
    assert.ok(bounds.max.z <= -.0059, 'construction behind print plane');
    assert.ok(bounds.max.x <= .581 && bounds.min.x >= -.581);
  });
}
