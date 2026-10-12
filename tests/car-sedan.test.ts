import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3, Mesh } from 'three';
import { CUSTOMER_VEHICLES, CustomerParking } from '../src/customer-parking.ts';
import { parkingLayout } from '../src/parking-layout.ts';

test('actual sedan export matches its admission envelope, floor, nose and resource budget', async () => {
  const vehicle = CUSTOMER_VEHICLES.find(v => v.id === 'period-sedan')!;
  const bytes = readFileSync(new URL('../public/models/car_sedan.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const box = new Box3().setFromObject(gltf.scene), size = box.getSize(new Vector3());
  for (const [actual, expected] of [[size.x, vehicle.width], [size.y, vehicle.height], [size.z, vehicle.length]])
    assert.ok(Math.abs(actual - expected) < .0001, `${actual} differs from ${expected}`);
  assert.ok(Math.abs(box.min.y) < .0001);
  let triangles = 0, draws = 0;
  const roles = new Set<string>();
  gltf.scene.traverse(o => {
    if (!(o instanceof Mesh)) return;
    assert.equal(o.geometry.attributes.uv.count, o.geometry.attributes.position.count);
    for (const value of o.geometry.attributes.normal.array) assert.ok(Number.isFinite(value));
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    draws += o.geometry.groups.length || 1;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      roles.add(m.name); assert.equal(m.map, null);
      if (m.name === 'Headlamp') assert.ok(new Box3().setFromObject(o).getCenter(new Vector3()).z > 0);
      if (m.name === 'TailLamp') assert.ok(new Box3().setFromObject(o).getCenter(new Vector3()).z < 0);
    }
  });
  assert.ok(triangles < 5000); assert.equal(draws, 8); assert.ok(bytes.length < 350000);
  assert.deepEqual([...roles].sort(), ['AmberLens', 'BodyPaint', 'Headlamp', 'InteriorCloth', 'RubberTrim', 'TailLamp', 'WheelMetal', 'WindowGlass']);
});

test('vehicle identity remains stable across release and re-entry, filtering era and width before choice', () => {
  const spaces = parkingLayout(68, 4.7, -45).spaces;
  const parking = new CustomerParking(spaces, 1990);
  const identities = new Map<string, string>();
  for (let i = 1; i <= 10; i++) {
    const id = 'customer-' + String(i).padStart(2, '0');
    const assignment = parking.reserve(id)!;
    identities.set(id, assignment.vehicle.id);
    assert.equal(parking.reserve(id), assignment);
  }
  assert.equal(new Set(identities.values()).size, 2);
  const colors = new Map([...parking.assignments].map(([id, a]) => [id, a.color]));
  for (const id of identities.keys()) {
    parking.release(id);
    const restored = parking.reserve(id)!;
    assert.equal(restored.vehicle.id, identities.get(id)); assert.equal(restored.color, colors.get(id));
  }
  const futureFirst = [{ ...CUSTOMER_VEHICLES[0], id: 'future', modelYear: 2001 }, ...CUSTOMER_VEHICLES];
  const period = new CustomerParking(spaces, 1990, 9, 18, futureFirst);
  for (const id of identities.keys()) assert.notEqual(period.reserve(id)?.vehicle.id, 'future');
  const narrow = new CustomerParking(spaces, 1990, 7, 18);
  for (const id of identities.keys()) assert.equal(narrow.reserve(id)?.vehicle.id, 'period-sedan');
  assert.equal(new CustomerParking(spaces, 1986).reserve('customer-01'), null);
});
