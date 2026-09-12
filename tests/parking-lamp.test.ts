import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { installParkingLampModels } from '../src/parking-lamp-model.ts';

async function loadAsset() {
  const bytes = await readFile(new URL('../public/models/parking-lamp.glb', import.meta.url));
  assert.ok(bytes.length < 200_000);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

test('parking lamp export fits the feet anchor, has UVs/normals and four compact material roles', async () => {
  const { scene } = await loadAsset();
  const b = new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(b.min.y) < 1e-6);
  assert.ok(b.max.y > 13 && b.max.y < 13.35);
  assert.ok(b.min.x > -.4 && b.max.x < .4);
  assert.ok(b.min.z > -1.73 && b.max.z < .33, 'arm points toward store (-Z)');
  const roles = new Set<string>();
  let triangles = 0, meshes = 0;
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    for (const name of ['position', 'normal', 'uv']) {
      const a = o.geometry.getAttribute(name);
      assert.ok(a && Array.from(a.array).every(Number.isFinite), `${o.name}: ${name}`);
      assert.equal(a.count, o.geometry.getAttribute('position').count);
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      roles.add(m.name);
      assert.ok(!Object.values(m).some(v => v instanceof THREE.Texture));
    }
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  assert.equal(meshes, 4);
  assert.deepEqual([...roles].sort(), ['FastenerMetal', 'LampLens', 'PoleFinish', 'SealRubber']);
  assert.ok(triangles < 2800);
  const lens = scene.getObjectByName('ParkingLamp_LampLens')!;
  const lensBounds = new THREE.Box3().setFromObject(lens);
  assert.ok(lensBounds.min.y > 12.85 && lensBounds.max.y < 12.91);
});

test('parking lamps retain fallback, share resources/live lens, and release once including late loads', async () => {
  const original = GLTFLoader.prototype.load;
  let success: Parameters<GLTFLoader['load']>[1];
  let failure: Parameters<GLTFLoader['load']>[3];
  GLTFLoader.prototype.load = function (_url, onLoad, _progress, onError) { success = onLoad; failure = onError; };
  try {
    const scene = new THREE.Scene();
    const anchors = [-13.5, 13.5].map(x => {
      const root = new THREE.Group(), fallback = new THREE.Group();
      root.position.set(x, 0, 62);root.add(fallback);scene.add(root);
      return { root, fallback };
    });
    const pole = new THREE.MeshStandardMaterial(), lens = new THREE.MeshStandardMaterial();
    let refreshes = 0, sharedDisposals = 0;
    pole.addEventListener('dispose', () => sharedDisposals++);lens.addEventListener('dispose', () => sharedDisposals++);
    const install = () => installParkingLampModels(scene, anchors, '/models/parking-lamp.glb', pole, lens, () => refreshes++);
    const model = await loadAsset();
    const counts = new Map<THREE.BufferGeometry | THREE.Material, number>();
    model.scene.traverse(o => { if (o instanceof THREE.Mesh) for (const r of [o.geometry, ...[o.material].flat()]) {
      counts.set(r, 0);r.addEventListener('dispose', () => counts.set(r, counts.get(r)! + 1));
    } });
    const installed = install();
    assert.ok(anchors.every(a => a.fallback.visible));
    lens.emissiveIntensity = 3.2; // Mode changed while load was pending.
    success!(model);
    assert.equal(refreshes, 1);
    assert.ok(anchors.every(a => !a.fallback.visible));
    const lenses = anchors.map(a => a.root.getObjectByName('ParkingLamp_LampLens') as THREE.Mesh);
    assert.equal(lenses[0].material, lens);assert.equal(lenses[1].material, lens);
    assert.equal(lenses[0].geometry, lenses[1].geometry);
    lens.emissiveIntensity = .05;
    assert.equal((lenses[1].material as THREE.MeshStandardMaterial).emissiveIntensity, .05);
    installed.dispose();installed.dispose();
    assert.ok([...counts.values()].every(n => n === 1));assert.equal(sharedDisposals, 0);
    assert.ok(anchors.every(a => a.root.children.length === 1 && a.fallback.visible));
    const lateModel = await loadAsset();
    let lateResources = 0, lateDisposed = 0;
    lateModel.scene.traverse(o => { if (o instanceof THREE.Mesh) for (const r of [o.geometry, ...[o.material].flat()]) {
      lateResources++;r.addEventListener('dispose', () => lateDisposed++);
    } });
    const late = install();late.dispose();late.dispose();
    success!(lateModel);
    assert.equal(lateDisposed, lateResources);assert.equal(refreshes, 1);
    const failed = install();failure!(new Error('Intentional test failure'));
    assert.ok(anchors.every(a => a.fallback.visible));failed.dispose();
    assert.equal(sharedDisposals, 0);
  } finally { GLTFLoader.prototype.load = original; }
});
