import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3, Mesh } from 'three';
import { CustomerParking, CUSTOMER_PAINTS, CUSTOMER_VEHICLES } from '../src/customer-parking.ts';

const ROLES = ['AmberLens', 'BodyPaint', 'Headlamp', 'InteriorCloth', 'RubberTrim', 'TailLamp', 'WheelMetal', 'WindowGlass'];
async function inspect(asset: string) {
  const bytes = readFileSync(new URL('../public/models/' + asset, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const box = new Box3().setFromObject(gltf.scene), size = box.getSize(new Vector3());
  let triangles = 0, draws = 0;
  const roles = new Set<string>();
  gltf.scene.traverse(o => {
    if (!(o instanceof Mesh)) return;
    const g = o.geometry;
    assert.equal(g.attributes.uv.count, g.attributes.position.count);
    for (const value of g.attributes.normal.array) assert.ok(Number.isFinite(value));
    triangles += (g.index?.count ?? g.attributes.position.count) / 3;
    draws += g.groups.length || 1;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) { roles.add(m.name); assert.equal(m.map, null); }
  });
  return { bytes: bytes.length, box, size, triangles, draws, roles };
}

test('every customer body style ships a grounded full and lighter mesh at its declared size', async () => {
  assert.ok(CUSTOMER_VEHICLES.length >= 4);
  for (const v of CUSTOMER_VEHICLES) {
    const full = await inspect(v.asset), lite = await inspect(v.liteAsset);
    for (const m of [full, lite]) {
      assert.ok(Math.abs(m.box.min.y) < 1e-3, v.id);
      assert.ok(Math.abs(m.size.z - v.length) < .05 && Math.abs(m.size.x - v.width) < .02 && Math.abs(m.size.y - v.height) < .02, v.id);
      assert.ok([...m.roles].every(r => ROLES.includes(r)) && m.roles.has('BodyPaint') && m.roles.has('WindowGlass'), v.id);
      assert.ok(m.draws <= 8 && m.bytes < 450000, v.id);
    }
    assert.deepEqual([...full.roles].sort(), ROLES);
    assert.ok(full.triangles < 9000 && lite.triangles < full.triangles * .6, v.id);
    // Size, not the runtime scale, sets the lot footprint.
    assert.ok(v.length + .6 <= 18 && v.width + .6 <= 9, v.id);
  }
});

test('each regular owns one distinguishable car; paint never implies style; era-gated styles', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `customer-${String(i + 1).padStart(2, '0')}`);
  const space = [{ x: 0, z: 0, yaw: 0 }];
  const parking = new CustomerParking(space, 1990, 9, 18, undefined, ids);
  const cars = ids.map(id => parking.carFor(id)!);
  // Persistent: a fresh store (new visit, new session) gives every regular the same car.
  const again = new CustomerParking(space, 1990, 9, 18, undefined, ids);
  ids.forEach((id, i) => assert.deepEqual(again.carFor(id), cars[i]));
  assert.equal(new Set(cars.map(c => c.color)).size, ids.length);
  assert.ok(cars.every(c => CUSTOMER_PAINTS.includes(c.color)));
  const styles = new Set(cars.map(c => c.vehicle.id));
  assert.equal(styles.size, CUSTOMER_VEHICLES.length);
  for (const style of styles) assert.ok(cars.filter(c => c.vehicle.id === style).length >= 2, style);
  const reserved = parking.reserve('customer-04')!;
  assert.equal(reserved.vehicle, cars[3].vehicle); assert.equal(reserved.color, cars[3].color);
  // A store set before a style existed never shows it, and keeps every other regular's style.
  const early = new CustomerParking(space, 1988, 9, 18, undefined, ids);
  ids.forEach((id, i) => {
    const car = early.carFor(id)!;
    assert.ok(car.vehicle.modelYear <= 1988);
    if (cars[i].vehicle.modelYear <= 1988) assert.equal(car.vehicle, cars[i].vehicle);
  });
});
