// Real browser + real GLB loader: stock contact, custom dimensions, failure and teardown.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
const port = Number(process.env.CANDY_CHECK_PORT || 4394);
const root = new URL('../', import.meta.url).pathname;
const server = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; ; i++) {
    if (server.exitCode !== null) throw new Error('Isolated Vite server exited');
    try { if ((await fetch(`http://localhost:${port}`)).ok) break; } catch {}
    if (i > 100) throw new Error('Vite startup timeout');
    await delay(100);
  }
  browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('PAGE', error.message));
  await page.setRequestInterception(true);
  let mode = 'success';
  const privateMode = process.env.CANDY_CHECK_PRIVATE === '1';
  let held = [];
  page.on('request', request => {
    if (request.url().endsWith('/__candy_check')) return void request.respond({ status: 200, contentType: 'text/html', body: '<html></html>' });
    if (!privateMode && request.url().includes('/user-assets/fixtures/candy-queue-rack/')) return void request.abort();
    if (/candy-rack-(frame|tray)\.glb/.test(request.url())) {
      if (mode === 'hold') { held.push(request); return; }
      if (mode === 'failure' && request.url().includes('-tray.')) return void request.abort();
    }
    void request.continue();
  });
  await page.goto(`http://localhost:${port}/__candy_check`);
  await page.evaluate(async () => {
    // Vite may resolve a shared/symlinked node_modules outside this worktree.
    const source = await (await fetch('/src/fixtures/candy-rack-model.ts')).text();
    const threeUrl = source.match(/from ["']([^"']*three[^"']*)["']/)[1];
    const THREE = await import(threeUrl);
    const { CandyDisplay } = await import('/src/fixtures/period-fixtures.ts');
    window.check = { THREE, CandyDisplay, deletedGeometry: new Set(), deletedMaterial: new Set(), deletedTexture: new Set() };
    for (const [prototype, set] of [[THREE.BufferGeometry.prototype, window.check.deletedGeometry], [THREE.Material.prototype, window.check.deletedMaterial], [THREE.Texture.prototype, window.check.deletedTexture]]) {
      const original = prototype.dispose;
      prototype.dispose = function () { set.add(this.uuid); original.call(this); };
    }
    window.makeRack = (options = {}) => {
      const scene = new THREE.Scene();
      const state = { scene, renders: 0, logs: [], colliders: 0 };
      const ctx = { scene, addCollider() { state.colliders++; }, requestShadowRefresh() {}, requestRender() { state.renders++; }, log(s) { state.logs.push(s); } };
      state.fixture = new CandyDisplay({ id: 'candy-display-front', kind: 'candy-display', position: { x: 6.09, z: -2.12 }, yaw: .6697, options }, ctx);
      state.fixture.build(); window.rack = state;
    };
  });
  for (const options of [{}, { rows: 3, footprintWidth: 4, footprintDepth: 1 }]) {
    await page.evaluate(options => window.makeRack(options), options);
    await page.waitForFunction(() => window.rack.renders === 1);
    const result = await page.evaluate(() => {
      const { THREE, deletedGeometry, deletedMaterial, deletedTexture } = window.check;
      const { fixture, scene, colliders } = window.rack;
      const group = scene.children[0], model = group.getObjectByName('candy-rack-model');
      const stock = group.children.filter(o => o.isInstancedMesh);
      let maxContactError = 0;
      group.updateMatrixWorld(true);
      stock.forEach((inst, r) => {
        const matrix = new THREE.Matrix4();
        for (let instance = 0; instance < inst.count; instance++) {
        inst.getMatrixAt(instance, matrix);
        const shelf = model.getObjectByName(`candy-rack-tray-${r}`);
        // Transform every bottom corner into tray space: all four rest at y=0.
        shelf.updateMatrix();
        for (const x of [-.16,.16]) for (const z of [-.09,.09]) {
          const point = new THREE.Vector3(x,-.21,z).applyMatrix4(matrix).applyMatrix4(shelf.matrix.clone().invert());
          maxContactError = Math.max(maxContactError, Math.abs(point.y));
          const world = new THREE.Vector3(x,-.21,z).applyMatrix4(matrix).applyMatrix4(inst.matrixWorld);
          const normal = new THREE.Vector3(0,1,0).transformDirection(shelf.matrixWorld);
          const ray = new THREE.Raycaster(world.clone().addScaledVector(normal,.01), normal.clone().negate(),0,.02);
          const hit = ray.intersectObject(shelf,true)[0];
          if (!hit) throw new Error('Stock corner misses exported tray geometry');
          maxContactError = Math.max(maxContactError,Math.abs(hit.distance-.01));
        }
        }
      });
      const geometries = new Set(), materials = new Set(), textures = new Set();
      model.traverse(o => { if (o.isMesh) { geometries.add(o.geometry.uuid); materials.add(o.material.uuid); for (const t of Object.values(o.material)) if (t?.isTexture) textures.add(t.uuid); if (o.material.name === 'RackSteel' && (!o.material.bumpMap || !o.material.roughnessMap)) throw Error('Missing physical grain finish'); } });
      const rows = fixture.rows.map(r => ({ ...r }));
      const footprint = fixture.getFootprint();
      const source = model.userData.source || 'public';
      const bounds = new THREE.Box3().setFromObject(model);
      const hidden = !group.getObjectByName('candy-rack-fallback').visible;
      fixture.dispose();
      return { source, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, rows, footprint, colliders, hidden, stock: stock.map(s => s.count), maxContactError,
        detached: scene.children.length === 0, textures: textures.size, released: [...textures].every(id => deletedTexture.has(id)) && [...geometries].every(id => deletedGeometry.has(id)) && [...materials].every(id => deletedMaterial.has(id)) };
    });
    assert.equal(result.source, privateMode ? 'user-assets' : 'public');
    assert.equal(result.rows.length, options.rows || 5);
    assert.equal(result.rows[0].id, 'candy-display-front_row_0_choco-bars');
    assert.equal(result.rows[0].name, 'Assorted Chocolate Candy Bars');
    assert.equal(result.colliders, 1);
    assert.ok(result.hidden && result.detached && result.released);
    assert.ok(result.maxContactError < 1e-6, JSON.stringify(result));
    assert.equal(result.footprint.w, options.footprintWidth || 3);
    assert.equal(result.footprint.d, options.footprintDepth || 1.6);
    console.log('PASS loaded stock/contact/footprint/cleanup', JSON.stringify(result));
  }
  mode = 'failure';
  await page.evaluate(() => window.makeRack());
  await page.waitForFunction(() => window.rack.logs.length > 0);
  assert.ok(await page.evaluate(() => window.rack.scene.children[0].getObjectByName('candy-rack-fallback').visible && !window.rack.scene.getObjectByName('candy-rack-model')));
  await page.evaluate(() => window.rack.fixture.dispose());
  console.log('PASS partial-load failure retains fallback');
  mode = 'hold';
  await page.setCacheEnabled(false);
  await page.evaluate(() => window.makeRack());
  for (let i = 0; held.length < 2; i++) { if (i > 100) throw new Error('Requests not held'); await delay(50); }
  const before = await page.evaluate(() => { window.rack.fixture.dispose(); return window.check.deletedGeometry.size; });
  for (const request of held) await request.continue();
  await page.waitForFunction(before => window.check.deletedGeometry.size >= before + 3, {}, before);
  assert.ok(await page.evaluate(() => window.rack.scene.children.length === 0 && window.rack.renders === 0));
  console.log('PASS disposal during loading releases all three late geometries');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
