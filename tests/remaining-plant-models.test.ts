import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type GeometryKit = Map<string, THREE.BufferGeometry>;

async function readKit(file: string, expected: string[], maxBytes: number): Promise<GeometryKit> {
  const bytes = await readFile(new URL(`../public/models/${file}`, import.meta.url));
  assert.ok(bytes.length < maxBytes, `${file}: ${bytes.length} bytes exceeds ${maxBytes}`);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${file}: not a GLB`);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(json.images?.length ?? 0, 0, `${file}: kit should not embed images`);

  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const { scene } = await new GLTFLoader().parseAsync(buffer, '');
  const kit: GeometryKit = new Map();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    assert.ok(position && normal && uv, `${file}/${object.name}: missing position, normal or UV`);
    assert.equal(normal.count, position.count, `${file}/${object.name}: normal count`);
    assert.equal(uv.count, position.count, `${file}/${object.name}: UV count`);
    for (const attribute of [position, normal, uv]) {
      assert.ok(Array.from(attribute.array).every(Number.isFinite), `${file}/${object.name}: invalid attribute`);
    }
    kit.set(object.name, geometry);
  });
  assert.deepEqual([...kit.keys()].sort(), [...expected].sort(), `${file}: named-part contract`);
  return kit;
}

function bounds(geometries: THREE.BufferGeometry[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  }
  return box;
}

function triangles(geometries: THREE.BufferGeometry[]): number {
  return geometries.reduce((sum, geometry) => {
    const position = geometry.getAttribute('position');
    return sum + (geometry.index?.count ?? position.count) / 3;
  }, 0);
}

function assertThickRim(pot: THREE.BufferGeometry, minGap: number, minY: number): void {
  const position = pot.getAttribute('position');
  const radii = new Set<number>();
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) < minY) continue;
    radii.add(Math.round(Math.hypot(position.getX(i), position.getZ(i)) * 1000) / 1000);
  }
  assert.ok(radii.size > 1, 'rim needs separate outer and inner radii');
  assert.ok(Math.max(...radii) - Math.min(...radii) > minGap, 'rim is a hairline shell');
}

test('floor-palm kit has authored construction inside its source-asset contract', async () => {
  const expected = ['Pot', 'Saucer', 'Soil', 'Cane', 'RachisA', 'RachisB', 'PinnaA', 'PinnaB'];
  const kit = await readKit('floor-palm-components.glb', expected, 120_000);
  assert.ok(triangles([...kit.values()]) < 1_200, 'floor-palm source kit exceeded triangle budget');
  assertThickRim(kit.get('Pot')!, 0.04, 1.18);

  const soilBox = bounds([kit.get('Soil')!]);
  assert.ok(soilBox.min.y > 1.05 && soilBox.max.y < 1.20,
    `floor-palm soil must occupy the recessed seat, got ${soilBox.min.y}..${soilBox.max.y}`);
  for (const name of ['RachisA', 'RachisB']) {
    const box = bounds([kit.get(name)!]);
    assert.ok(box.max.x > 0.5, `${name}: authored arch is missing`);
    assert.ok(box.max.y > 0.99, `${name}: growth axis changed`);
  }
  for (const name of ['PinnaA', 'PinnaB']) {
    const box = bounds([kit.get(name)!]);
    assert.ok(box.max.x - box.min.x > 0.10, `${name}: too narrow to read`);
    assert.ok(box.max.y > 0.33, `${name}: growth axis changed`);
    assert.ok(box.max.z - box.min.z > 0.04, `${name}: missing droop/crease depth`);
  }

});

test('snake-plant kit has curved blade variants inside its source-asset contract', async () => {
  const expected = ['Pot', 'Saucer', 'Soil', 'BladeA', 'BladeB', 'BladeC'];
  const kit = await readKit('snake-plant-components.glb', expected, 100_000);
  assert.ok(triangles([...kit.values()]) < 1_200, 'snake-plant source kit exceeded triangle budget');
  assertThickRim(kit.get('Pot')!, 0.035, 0.90);

  const soilBox = bounds([kit.get('Soil')!]);
  assert.ok(soilBox.min.y > 0.80 && soilBox.max.y < 0.91,
    `snake-plant soil must occupy the recessed seat, got ${soilBox.min.y}..${soilBox.max.y}`);
  for (const name of ['BladeA', 'BladeB', 'BladeC']) {
    const geometry = kit.get(name)!;
    const box = bounds([geometry]);
    assert.ok(box.max.y > 0.99, `${name}: growth axis changed`);
    assert.ok(box.max.x - box.min.x > 0.08, `${name}: blade has no width`);
    assert.ok(box.max.z - box.min.z > 0.018, `${name}: flat blade lost channel/twist`);
  }

});
