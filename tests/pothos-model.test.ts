import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Parses the shipped pothos kit with the runtime's own loader — catches a
// changed export axis, a part rename that would silently drop out of
// src/pothos-model.ts's kit.get() lookups, or an accidental texture
// dependency. Sibling of potted-plant.test.ts (the tall-ficus kit).
test('pothos-components kit exposes every named part with UVs, a thick-walled pot, tapered stems and cordate blades', async () => {
  const bytes = await readFile(new URL('../public/models/pothos-components.glb', import.meta.url));
  assert.ok(bytes.length < 120_000, `kit asset ${bytes.length} bytes exceeded budget`);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(json.images?.length ?? 0, 0, 'the kit needs no image downloads — finishes are runtime materials');

  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const { scene } = await new GLTFLoader().parseAsync(buffer, '');

  const expected = ['Pot', 'Saucer', 'Soil', 'VineA', 'VineB', 'Petiole', 'LeafA', 'LeafB'];
  const parts = new Map<string, THREE.Mesh>();
  let triangles = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    parts.set(object.name, object);
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    assert.ok(normal && uv, `${object.name} is missing normals or UVs`);
    assert.equal(uv.count, position.count);
    for (const attribute of [position, normal, uv]) {
      assert.ok(Array.from(attribute.array).every(Number.isFinite), `${object.name} has invalid attributes`);
    }
    triangles += (geometry.index?.count ?? position.count) / 3;
  });
  for (const name of expected) assert.ok(parts.has(name), `kit is missing part '${name}'`);
  assert.equal(parts.size, expected.length, 'unexpected extra part in the kit');
  assert.ok(triangles < 1100, `${triangles} triangles`);

  // Pot: a real thick-walled lathed desk planter, not a single-skin cylinder —
  // near the rim its section shows a genuine outer/inner wall gap.
  const pot = parts.get('Pot')!;
  const potSize = new THREE.Box3().setFromObject(pot).getSize(new THREE.Vector3());
  assert.ok(Math.abs(potSize.y - 0.48) < 0.01, `pot height ${potSize.y}`);
  assert.ok(potSize.x > 0.6 && potSize.x < 0.72, `pot outer diameter ${potSize.x}`);
  const potPos = pot.geometry.getAttribute('position');
  const rimRadii = new Set<number>();
  for (let i = 0; i < potPos.count; i++) {
    const y = potPos.getY(i);
    if (y > 0.40 && y <= 0.48) rimRadii.add(Math.round(Math.hypot(potPos.getX(i), potPos.getZ(i)) * 1000) / 1000);
  }
  const radii = [...rimRadii];
  assert.ok(radii.length > 1, 'expected multiple distinct radii near the rim (outer + inner wall)');
  assert.ok(Math.max(...radii) - Math.min(...radii) > 0.02, 'pot wall reads as a hairline shell, not thick-walled');

  // Soil sits on the recessed interior seat, a watering gap below the rim.
  const soilTop = new THREE.Box3().setFromObject(parts.get('Soil')!).max.y;
  assert.ok(soilTop < potSize.y - 0.08, `soil top ${soilTop} should sit well below the rim`);

  // Vines and petioles taper from a fleshy base node to a soft growing tip.
  // A cascade vine bows so far that its tip rings barely differ in Y, so the
  // rings are separated by DISTANCE FROM THE CURVE START (the template's own
  // origin) rather than by height band, and each ring's radius is measured
  // from its own centroid.
  const ringRadius = (pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
                      keep: (d: number) => boolean) => {
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (keep(v.length())) ring.push(v);
    }
    const c = ring.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / ring.length);
    return Math.max(...ring.map((v) => v.distanceTo(c)));
  };
  for (const name of ['VineA', 'VineB', 'Petiole']) {
    const pos = parts.get(name)!.geometry.getAttribute('position');
    let far = 0;
    for (let i = 0; i < pos.count; i++) {
      far = Math.max(far, Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    const baseR = ringRadius(pos, (d) => d < 0.1);
    const tipR = ringRadius(pos, (d) => d > far * 0.92);
    assert.ok(baseR > tipR * 1.15, `${name} base radius ${baseR} should taper past its tip ${tipR}`);
  }

  // The blades are CORDATE: the base row's outer lobes reach back BEHIND the
  // petiole attachment, leaving the notch (basal sinus) that distinguishes a
  // pothos leaf from a generic spearhead card. Growth runs along +Y, width
  // along X, and the fold/droop depth along Z.
  for (const name of ['LeafA', 'LeafB']) {
    const pos = parts.get(name)!.geometry.getAttribute('position');
    let minY = Infinity, midribBaseY = Infinity, widest = 0, widestY = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      minY = Math.min(minY, y);
      if (Math.abs(x) < 0.005) midribBaseY = Math.min(midribBaseY, y);
      if (Math.abs(x) > widest) { widest = Math.abs(x); widestY = y; }
    }
    assert.ok(minY < -0.03, `${name} has no basal sinus (min Y ${minY})`);
    assert.ok(midribBaseY > minY + 0.02,
      `${name}'s midrib base ${midribBaseY} should sit ahead of the lobe tips ${minY}`);
    let tipY = 0;
    for (let i = 0; i < pos.count; i++) tipY = Math.max(tipY, pos.getY(i));
    assert.ok(widestY > 0.02 && widestY < tipY * 0.45,
      `${name} should be widest near the shoulder, not at the base or the tip (widest at y ${widestY} of ${tipY})`);

    // Midrib lifted above the shoulders: a real V-crease, not a flat card.
    // Rows are not level in Y (the sinus pulls the outer columns back), so
    // the crease is checked globally: the single most-lifted vertex has to be
    // ON the midrib. Blender's fold axis is +Y, which export_yup lands on -Z.
    let liftZ = Infinity, liftX = Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) < liftZ) { liftZ = pos.getZ(i); liftX = Math.abs(pos.getX(i)); }
    }
    assert.ok(liftZ < -0.008, `${name} is a flat card (no midrib lift, min Z ${liftZ})`);
    assert.ok(liftX < 0.02, `${name}'s crease is off the midrib (peak lift at |x| ${liftX})`);
  }
});
