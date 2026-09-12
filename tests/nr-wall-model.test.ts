import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NrWallModelBatch } from '../src/nr-wall-model.ts';
import { NR_WALL_SHELF_DEPTH, NR_WALL_SLOPE, WALL_SHELF_HEIGHTS } from '../src/store-layout.ts';

async function asset() {
  const bytes = await readFile(new URL('../public/models/new-release-wall.glb', import.meta.url));
  assert.ok(bytes.length < 100_000, 'untextured fixture budget');
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

test('NR asset: eight sloped tiers, eight-foot width, complete UV/materials and Amray reserve', async () => {
  const { scene } = await asset();
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  assert.ok(Math.abs(box.max.x - box.min.x - 8) < 1e-5);
  assert.equal(WALL_SHELF_HEIGHTS.length, 8);
  assert.ok(NR_WALL_SHELF_DEPTH - .0625 > 4 * (1.25 / 12) + 1.10 / 12 + .10,
    'four rental cases plus coverbox, backing thickness and lean allowance');
  let meshes = 0;
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    for (const key of ['position', 'normal', 'uv']) {
      const a = o.geometry.getAttribute(key);
      assert.ok(a && Array.from(a.array).every(Number.isFinite));
      assert.equal(a.count, o.geometry.getAttribute('position').count);
    }
    assert.ok(['BeigeVinylLaminate', 'BeigeVinylEdgeBand', 'SatinPriceChannel'].includes((o.material as THREE.Material).name));
  });
  assert.equal(meshes, 28, 'capacity study and signage must not enter runtime export');
  for (let i = 0; i < 8; i++) {
    const deck = scene.getObjectByName(`Deck_${i}`) as THREE.Mesh;
    const back = new THREE.Box3().setFromObject(scene.getObjectByName(`HighBack_${i}`)!);
    assert.ok(back.max.y - back.min.y > .60);
    const pos = deck.geometry.getAttribute('position');
    let front = -Infinity, rear = -Infinity;
    for (let j = 0; j < pos.count; j++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, j).applyMatrix4(deck.matrixWorld);
      if (p.z > .77) front = Math.max(front, p.y);
      if (p.z < .11) rear = Math.max(rear, p.y);
    }
    assert.ok(Math.abs(front - (WALL_SHELF_HEIGHTS[i] + .02)) < .001);
    assert.ok(Math.abs((front - rear) / (.78 - .102) - NR_WALL_SLOPE) < .002);
  }
});

test('NR loading: fitted sections, failed/malformed assets and teardown during request', async t => {
  let success: (g: any) => void = () => {};
  let failure: (e: Error) => void = () => {};
  t.mock.method(GLTFLoader.prototype, 'load', (_url: string, done: typeof success, _progress: unknown, fail: typeof failure) => {
    success = done; failure = fail;
  });
  const makeRun = () => {
    const scene = new THREE.Scene(), parent = new THREE.Group(); scene.add(parent);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(17, 8, .7), new THREE.MeshStandardMaterial()); parent.add(proxy);
    let wakes = 0;
    const batch = new NrWallModelBatch(); batch.add(parent, 17, [proxy], [-8.52, 0, 8.52]); batch.finish(() => wakes++);
    return { parent, proxy, wakes: () => wakes };
  };
  const good = makeRun(); success(await asset());
  assert.equal(good.proxy.visible, false);
  const model = good.parent.getObjectByName('modeled-new-release-wall')!;
  assert.ok(model); assert.equal(model.children.length, 2, 'two carcass material draws; shelf kit owns the price channels');
  const bounds = new THREE.Box3().setFromObject(model);
  assert.ok(bounds.min.x < -8.5 && bounds.max.x > 8.5 && bounds.max.x < 8.56);
  assert.equal(good.wakes(), 1);
  const missing = makeRun(); failure(new Error('404'));
  assert.equal(missing.proxy.visible, true); assert.equal(missing.wakes(), 0);
  const malformed = makeRun(); success({ scene: new THREE.Group() });
  assert.equal(malformed.proxy.visible, true); assert.equal(malformed.wakes(), 0);
  const retired = makeRun(); retired.proxy.geometry.dispose();
  const late = await asset(); let released = 0;
  late.scene.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.addEventListener('dispose', () => released++); });
  success(late);
  assert.equal(retired.parent.getObjectByName('modeled-new-release-wall'), undefined);
  assert.equal(retired.wakes(), 0); assert.equal(released, 28);
});
