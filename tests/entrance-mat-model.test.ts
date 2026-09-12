import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDoorLeafFrame } from '../src/entrance/door-leaf.ts';

const bytes = readFileSync(new URL('../public/models/entrance-mat.glb', import.meta.url));
const length = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString());
const binary = 28 + length;
function values(index: number): number[] {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView];
  const components = ({ SCALAR: 1, VEC2: 2, VEC3: 3 } as Record<string, number>)[a.type];
  const size = a.componentType === 5126 || a.componentType === 5125 ? 4 : 2;
  const result: number[] = [];
  for (let i = 0; i < a.count; i++) for (let c = 0; c < components; c++) {
    const offset = binary + v.byteOffset + (a.byteOffset ?? 0) + i * (v.byteStride ?? components * size) + c * size;
    result.push(a.componentType === 5126 ? bytes.readFloatLE(offset) : size === 4 ? bytes.readUInt32LE(offset) : bytes.readUInt16LE(offset));
  }
  return result;
}

test('mat export has finite UVs/normals, two baked maps, closed thin solids and a bounded cost', () => {
  assert.ok(bytes.length < 700_000);
  assert.equal(gltf.meshes.length, 2);
  assert.deepEqual(gltf.materials.map((m: {name: string}) => m.name).sort(), ['CompressedPile', 'RubberBacking']);
  assert.equal(gltf.images.length, 2);
  for (const im of gltf.images) {
    assert.equal(im.mimeType, 'image/png');
    const start = binary + gltf.bufferViews[im.bufferView].byteOffset;
    assert.equal(bytes.readUInt32BE(start + 16), 512);
    assert.equal(bytes.readUInt32BE(start + 20), 512);
  }
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    const pos = values(p.attributes.POSITION), norm = values(p.attributes.NORMAL), uv = values(p.attributes.TEXCOORD_0);
    assert.ok([...pos, ...norm, ...uv].every(Number.isFinite));
    const indices = values(p.indices);
    triangles += indices.length / 3;
    for (let i = 0; i < norm.length; i += 3) assert.ok(Math.abs(Math.hypot(...norm.slice(i, i + 3)) - 1) < 1e-5);
    const edges = new Map<string, number>();
    const point = (i: number) => pos.slice(i * 3, i * 3 + 3).map(n => n.toFixed(7)).join(',');
    for (let i = 0; i < indices.length; i += 3) for (let j = 0; j < 3; j++) {
      const key = [point(indices[i+j]), point(indices[i+(j+1)%3])].sort().join('|');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    assert.ok([...edges.values()].every(n => n === 2), 'welded exported topology is closed');
  }
  assert.equal(triangles, 440);
});

test('mat floor datum and maximum height clear real door frames through swing and slide travel', () => {
  const all = gltf.meshes.flatMap((m: any) => m.primitives.flatMap((p: any) => values(p.attributes.POSITION))) as number[];
  const ys = all.filter((_, i) => i % 3 === 1);
  assert.equal(Math.min(...ys), 0);
  assert.ok(Math.max(...ys) <= .024001);
  for (const width of [3, 3.2]) {
    const frame = createDoorLeafFrame(width, 7);
    frame.computeBoundingBox();
    // Swing around Y and horizontal sliding cannot change the leaf's bottom Y.
    assert.ok(frame.boundingBox!.min.y - Math.max(...ys) >= .0249);
    frame.dispose();
  }
  assert.ok(Math.min(...all.filter((_, i) => i % 3 === 0)) >= -.500001);
  assert.ok(Math.max(...all.filter((_, i) => i % 3 === 2)) <= .500001);
});
