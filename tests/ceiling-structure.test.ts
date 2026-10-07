import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { planCeilingStructure, exposedStructureBottom } from '../src/ceiling-structure.ts';

async function kit() {
  const b = readFileSync(new URL('../public/models/ceiling-structure.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  scene.updateMatrixWorld(true); return { scene, bytes: b.length };
}
test('ceiling kit preserves feet, open chords, visible duct fittings and bounded resources', async () => {
  const { scene, bytes } = await kit(); let triangles = 0; const roles = new Set<string>();
  for (const name of ['TrussChord', 'TrussWeb', 'DuctSpan', 'DuctCollar', 'DuctElbow', 'DuctStrap', 'DuctOutlet']) assert.ok(scene.getObjectByName(name), name);
  scene.traverse(o => { if (!(o instanceof THREE.Mesh)) return;
    for (const name of ['position', 'normal', 'uv']) assert.ok(Array.from(o.geometry.getAttribute(name).array).every(Number.isFinite));
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => roles.add(m.name));
  });
  assert.ok(bytes < 100_000 && triangles < 1500); assert.equal(roles.size, 3);
  const chord = new THREE.Box3().setFromObject(scene.getObjectByName('TrussChord')!);
  assert.ok(Math.abs(chord.max.x - chord.min.x - 1) < 1e-6);
  assert.ok(Math.abs(chord.max.y - .085) < 1e-6 && Math.abs(chord.max.z - .12) < 1e-6);
  const centre = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
  assert.equal(centre.intersectObject(scene.getObjectByName('TrussChord')!, true).length, 0, 'paired angles leave the web seat open');
});
test('short/full/high and stepped ceilings meet room edges, roof and light anchors', async () => {
  const { scene } = await kit();
  for (const [width, depth, ceiling] of [[24, 30, 13.5], [80, 120, 18]]) {
    const left = 11 - width / 2, right = 11 + width / 2, back = 15 - depth;
    const anchors = [{ x: 11, z: back + 7 }, { x: 11, z: 4 }], step = { x: right - 8, depth: 9 };
    const p = planCeilingStructure(left, right, back, 15, ceiling, anchors, [], step);
    assert.equal(p.bottom, exposedStructureBottom(ceiling));
    anchors.forEach(a => assert.ok(p.rows.includes(a.z), 'every pendant seats on a lower chord'));
    for (const [name, matrices] of p.parts) {
      const bounds = new THREE.Box3().setFromObject(scene.getObjectByName(name)!);
      for (const matrix of matrices) {
        const box = bounds.clone().applyMatrix4(matrix);
        assert.ok(box.min.y > 10 && box.max.y <= ceiling + .351, `${name} vertical clearance`);
        assert.ok(box.min.x >= left - .04 && box.max.x <= right + .04, `${name} inside side walls`);
        if (box.max.z < back + step.depth - .2) assert.ok(box.max.x <= step.x + .04, `${name} avoids the stepped corner`);
      }
    }
    assert.equal(p.ductRuns.length, 2);
    const rightDuct = p.ductRuns.find(d => d.side === -1)!;
    assert.ok(rightDuct.start > back + step.depth, 'right duct starts inside the occupied room');
  }
});
test('actual cabinet bounds leave clear service openings through lower chords and webs', async () => {
  const { scene } = await kit();
  const cabinet = new THREE.Box3(new THREE.Vector3(7, 10, -5), new THREE.Vector3(14, 12.8, -1));
  const plan = planCeilingStructure(-5, 28, -25, 15, 13.5, [{ x: 0, z: -3 }], [cabinet.clone().expandByScalar(.18)]);
  for (const name of ['TrussChord', 'TrussWeb'] as const) {
    const node = scene.getObjectByName(name)!;
    const positions: THREE.Vector3[] = [];
    node.traverse(o => { if (o instanceof THREE.Mesh) {
      const a = o.geometry.getAttribute('position'); for (let i = 0; i < a.count; i++) positions.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld));
    } });
    for (const matrix of plan.parts.get(name)!) for (const point of positions) assert.equal(cabinet.containsPoint(point.clone().applyMatrix4(matrix)), false, name + ' stays outside television body');
  }
});
test('installed pendant rims retain headroom at both supported ceiling heights', async () => {
  for (const variant of ['dome', 'directional']) {
    const b = readFileSync(new URL(`../public/models/ceiling-luminaire-${variant}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
    for (const height of [13.5, 18]) {
      scene.position.y = exposedStructureBottom(height); scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(scene);
      assert.ok(bounds.min.y > 10.2, 'clear of customer, shelving and signs');
      assert.ok(Math.abs(bounds.max.y - exposedStructureBottom(height)) < 1e-6, 'contact plate seats on the chord');
    }
  }
});
