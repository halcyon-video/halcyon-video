import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('gutter/downspout GLB has the authored parts, three finish roles and bounded cost', async () => {
  const bytes = readFileSync(new URL('../public/models/gutter-downspout.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const parts = ['Head', 'FlangeScrews', 'Offset', 'Foot', 'RunPipe', 'Sleeve', 'Strap', 'SplashBlock'].map(n => `Downspout${n}`);
  let triangles = 0;
  const roles = new Set<string>();
  for (const name of parts) assert.ok(scene.getObjectByName(name) instanceof THREE.Mesh, name);
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    for (const name of ['position', 'normal', 'uv']) {
      assert.ok(o.geometry.attributes[name], `${o.name}: ${name}`);
      assert.ok([...o.geometry.attributes[name].array].every(Number.isFinite));
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      roles.add(m.name);
      assert.equal((m as THREE.MeshStandardMaterial).map, null);
    }
  });
  assert.deepEqual(roles, new Set(['DownspoutSheet', 'DownspoutHardware', 'DownspoutSplash']));
  assert.ok(triangles < 1200, String(triangles));
  assert.ok(bytes.length < 100000);
  // The run tube is exactly one foot tall so the runtime can scale it to any wall height.
  const run = new THREE.Box3().setFromObject(scene.getObjectByName('DownspoutRunPipe')!);
  assert.ok(Math.abs(run.min.y + 1) < 1e-5 && Math.abs(run.max.y) < 1e-5);
  // Discharge sits above the splash block, which rests 1.5 ft below the foot's top.
  const splash = new THREE.Box3().setFromObject(scene.getObjectByName('DownspoutSplashBlock')!);
  assert.ok(Math.abs(splash.min.y + 1.5) < 1e-5);
  const foot = new THREE.Box3().setFromObject(scene.getObjectByName('DownspoutFoot')!);
  assert.ok(foot.min.y > splash.max.y, 'Outlet must clear the block');
  assert.ok(foot.max.x > splash.min.x && foot.max.x < splash.max.x, 'Outlet over the block');
  for (const name of ['Scupper_invert', 'Head_outlet', 'Offset_top', 'Discharge', 'Splash_top']) assert.ok(scene.getObjectByName(name), name);
});
