import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Parses the shipped ficus kit with the runtime's own loader — catches a
// changed export axis, a part rename that would silently drop out of the
// runtime's kit.get() lookups, or an accidental texture/image dependency.
test('ficus-components kit exposes every named part with UVs, closed pot/soil/limb solids, and a size budget', async () => {
  const bytes = await readFile(new URL('../public/models/ficus-components.glb', import.meta.url));
  assert.ok(bytes.length < 200_000, `kit asset ${bytes.length} bytes exceeded budget`);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(json.images?.length ?? 0, 0, 'the kit needs no image downloads — finishes are runtime materials');

  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const { scene } = await new GLTFLoader().parseAsync(buffer, '');

  const expected = ['Pot', 'Saucer', 'Soil', 'Trunk', 'BranchA', 'BranchB', 'LeafA', 'LeafB'];
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
  assert.ok(triangles < 1200, `${triangles} triangles`);

  // Pot: a real thick-walled lathed planter, not a single-skin cylinder —
  // its footprint has a genuine outer/inner wall gap, not a hairline.
  const pot = parts.get('Pot')!;
  const potBox = new THREE.Box3().setFromObject(pot);
  const potSize = potBox.getSize(new THREE.Vector3());
  assert.ok(Math.abs(potSize.y - 1.40) < 0.01, `pot height ${potSize.y}`);
  assert.ok(potSize.x > 1.2 && potSize.x < 1.5, `pot outer diameter ${potSize.x}`);
  const potPos = pot.geometry.getAttribute('position');
  const radiiNearRim = new Set<number>();
  for (let i = 0; i < potPos.count; i++) {
    const y = potPos.getY(i);
    if (y > 1.30 && y < 1.40) {
      const r = Math.hypot(potPos.getX(i), potPos.getZ(i));
      radiiNearRim.add(Math.round(r * 1000) / 1000);
    }
  }
  const rimRadii = [...radiiNearRim];
  assert.ok(rimRadii.length > 1, 'expected multiple distinct radii near the rim (outer + inner wall)');
  assert.ok(Math.max(...rimRadii) - Math.min(...rimRadii) > 0.03, 'pot wall reads as a hairline shell, not thick-walled');

  // Soil sits on a recessed seat well below the rim, not floating at the top.
  const soil = parts.get('Soil')!;
  const soilBox = new THREE.Box3().setFromObject(soil);
  assert.ok(soilBox.max.y < potSize.y - 0.15, 'soil should sit on a recessed seat, not at the rim');

  // Trunk and branches: tapered (base cross-section meaningfully thicker than
  // the tip). Branches bow outward as they grow, tilting each ring relative
  // to the growth axis, so radius is measured from each band's own centroid
  // rather than the Y axis or a thin same-Y slice (which would only catch a
  // sliver of a tilted ring).
  for (const name of ['Trunk', 'BranchA', 'BranchB']) {
    const part = parts.get(name)!;
    const pos = part.geometry.getAttribute('position');
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) { minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i)); }
    const ySpan = maxY - minY;
    const bandRadius = (loY: number, hiY: number) => {
      const band: [number, number][] = [];
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y >= loY && y <= hiY) band.push([pos.getX(i), pos.getZ(i)]);
      }
      const cx = band.reduce((s, p) => s + p[0], 0) / band.length;
      const cz = band.reduce((s, p) => s + p[1], 0) / band.length;
      return Math.max(...band.map(([x, z]) => Math.hypot(x - cx, z - cz)));
    };
    const baseR = bandRadius(minY, minY + ySpan * 0.2);
    const tipR = bandRadius(maxY - ySpan * 0.2, maxY);
    assert.ok(baseR > tipR * 1.15, `${name} base radius ${baseR} should taper meaningfully past its tip ${tipR}`);
  }
});
