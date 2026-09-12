// Real GLB, lifecycle and installed public StoreScene evidence. No private assets.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, unlinkSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root = new URL('../', import.meta.url).pathname;
const out = resolve(process.argv[2] || '/tmp/candy-dispenser-evidence'); mkdirSync(out, { recursive: true });
assert.deepEqual(readdirSync(resolve(root, 'public/user-assets')), ['README.md'], 'Evidence tree must contain no private assets');
const port = 4398, html = resolve(root, 'tools/verify-candy-dispenser.html');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore', env: { ...process.env, VITE_DEMO: '1' } });
let browser;
const evidencePath = resolve(out, 'evidence.json');
const evidence = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, 'utf8')) : {};
const save = () => writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
try {
  writeFileSync(html, `<body style="margin:0"><div id="store" style="width:1100px;height:850px"></div><script type="module">
  import * as T from 'three';
  import { CandyDisplay } from '/src/fixtures/period-fixtures.ts';
  window.T=T;window.CandyDisplay=CandyDisplay;
  window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2006,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};
  </script>`);
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${port}`)).ok) break; } catch {}
    if (i > 100 || server.exitCode !== null) throw Error('Vite failed'); await delay(100);
  }
  browser = await puppeteer.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1100, height: 850 });
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  let mode = 'success', held;
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (r.url().includes('candy-dispenser-pack.glb')) {
      if (mode === 'failure') return void r.abort();
      if (mode === 'hold') { held = r; return; }
    }
    void r.continue();
  });
  const storePhoto = async name => {
    const png = await page.evaluate(() => { window.debugResetResScale(); return window.store.captureFeedbackSnapshot().png; });
    writeFileSync(resolve(out, name + '.png'), Buffer.from(png.split(',')[1], 'base64'));
  };
  const open = async () => { await page.goto(`http://localhost:${port}/tools/verify-candy-dispenser.html`); await page.waitForFunction(() => !!window.CandyDisplay); };
  if (!process.argv.includes('--store-only')) {
  await open();
  await page.evaluate(() => {
    const T = window.T; window.deleted = new Set();
    for (const proto of [T.BufferGeometry.prototype, T.Material.prototype, T.Texture.prototype, T.InstancedMesh.prototype]) {
      const original = proto.dispose; proto.dispose = function () { window.deleted.add(this.uuid); original.call(this); };
    }
    window.make = (options = {}) => {
      const scene = new T.Scene(); const state = { scene, logs: [], renders: 0 };
      const ctx = { scene, addCollider() {}, requestShadowRefresh() {}, requestRender() { state.renders++; }, log(s) { state.logs.push(s); } };
      state.fixture = new window.CandyDisplay({ id: 'candy-display-front', kind: 'candy-display', position: { x: 0, z: 0 }, yaw: 0, options: { dispenserPacks: true, ...options } }, ctx);
      state.fixture.build(); window.rack = state;
    };
  });
  for (const options of [{}, { footprintWidth: 4, footprintDepth: 1 }]) {
    await page.evaluate(options => window.make(options), options);
    await page.waitForFunction(() => !!window.rack.scene.getObjectByName('candy-dispenser-model'));
    const result = await page.evaluate(() => {
      const T = window.T, state = window.rack, panel = state.scene.getObjectByName('candy-dispenser-supplier-panel');
      const box = new T.Box3().setFromObject(panel); const footprint = state.fixture.getFootprint();
      const ids = new Set(); let draws = 0, triangles = 0;
      panel.traverse(o => {
        if (!o.isMesh) return; ids.add(o.uuid); ids.add(o.geometry.uuid); ids.add(o.material.uuid); if (o.material.map) ids.add(o.material.map.uuid);
        if (o.parent.visible) { draws++; triangles += o.count * (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; }
      });
      const backing = panel.getObjectByName('Supplier backing board');
      const boardBox = new T.Box3().setFromObject(backing);
      const stockMaxX = Math.max(...state.scene.children[0].children.filter(o => o.name.startsWith('candy-stock-')).map(o => new T.Box3().setFromObject(o).max.x));
      const fallbackTrayMaxX = (footprint.w - .17) / 2;
      const authoredTrayMaxX = 1.42 * footprint.w / 3;
      const trayGap = boardBox.min.x - Math.max(fallbackTrayMaxX, authoredTrayMaxX, stockMaxX);
      const rows = state.fixture.rows.length; state.fixture.dispose();
      return { bounds: { min: box.min.toArray(), max: box.max.toArray() }, footprint, rows, draws, triangles, trayGap,
        detached: state.scene.children.length === 0, disposed: [...ids].every(id => window.deleted.has(id)) };
    });
    assert.ok(result.detached && result.disposed, JSON.stringify(result)); assert.equal(result.rows, 5); assert.ok(result.trayGap > .001, JSON.stringify(result)); assert.equal(result.draws, 10);
    assert.ok(result.bounds.max[0] <= result.footprint.w / 2 + 1e-6);
    assert.ok(result.bounds.min[2] >= -result.footprint.d / 2 && result.bounds.max[2] <= result.footprint.d / 2);
    assert.ok(result.bounds.min[1] >= .8 && result.bounds.max[1] < 4);
    evidence[`lifecycle-${result.footprint.w}x${result.footprint.d}`] = result;
  }
  mode = 'failure'; await page.evaluate(() => window.make());
  await page.waitForFunction(() => window.rack.logs.some(s => s.includes('dispenser')));
  assert.ok(await page.evaluate(() => window.rack.scene.getObjectByName('candy-dispenser-fallback').visible));
  await page.evaluate(() => window.rack.fixture.dispose()); evidence.failureFallback = true;
  mode = 'hold'; await page.setCacheEnabled(false); await page.evaluate(() => window.make());
  for (let i = 0; !held; i++) { if (i > 100) throw Error('Request not held'); await delay(50); }
  const count = await page.evaluate(() => { window.rack.fixture.dispose(); return window.deleted.size; });
  await held.continue();
  await page.waitForFunction(count => window.deleted.size >= count + 10, {}, count);
  assert.ok(await page.evaluate(() => window.rack.scene.children.length === 0)); evidence.lateLoadReleased = true;
  mode = 'success';
  save();
  // Product photographs use the exact runtime materials and exported geometry.
  await page.evaluate(() => window.make());
  await page.waitForFunction(() => !!window.rack.scene.getObjectByName('candy-dispenser-model'));
  await page.waitForFunction(() => !!window.rack.scene.getObjectByName('candy-rack-model'));
  await page.evaluate(() => {
    const T=window.T, scene=window.rack.scene;
    scene.background=new T.Color('#647182');scene.add(new T.HemisphereLight(0xffffff,0x757575,2));
    const light=new T.DirectionalLight(0xffffff,3);light.position.set(-3,6,5);scene.add(light);
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,850);
    document.getElementById('store').replaceChildren(renderer.domElement);
    const camera=new T.PerspectiveCamera(36,1100/850,.01,100);camera.position.set(5,4.5,5);camera.lookAt(.6,2.3,0);
    renderer.render(scene,camera);window.supportRenderer=renderer;
    window.drawSupportRear=()=>{scene.children[0].children.filter(o=>o.name.startsWith('candy-stock-')).forEach(o=>o.visible=false);camera.position.set(-3.5,3.5,3.5);camera.lookAt(1.4,2.4,0);renderer.render(scene,camera);};
  });
  await page.screenshot({path:resolve(out,'supplier-support.png')});
  await page.evaluate(()=>window.drawSupportRear());
  await page.screenshot({path:resolve(out,'supplier-rear-support.png')});
  await page.evaluate(()=>window.supportRenderer.dispose());
  await page.evaluate(() => {
    const T = window.T, scene = new T.Scene(); scene.background = new T.Color('#647182');
    scene.add(new T.HemisphereLight(0xffffff, 0x757575, 2));
    for (const pos of [[1,2,3],[-2,1,-1]]) { const l = new T.DirectionalLight(0xffffff, 3); l.position.fromArray(pos); scene.add(l); }
    const model = window.rack.scene.getObjectByName('candy-dispenser-model');
    const anchor = new T.Matrix4().makeRotationY(Math.PI / 2).setPosition(1.435, .92, -.448).invert();
    model.children.forEach(o => { const m = new T.Matrix4(); o.getMatrixAt(0,m); o.count = 1; o.setMatrixAt(0,anchor.clone().multiply(m)); o.instanceMatrix.needsUpdate=true; o.computeBoundingSphere(); });
    scene.add(model);
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(1100,850); renderer.toneMapping = T.ACESFilmicToneMapping;
    document.getElementById('store').replaceChildren(renderer.domElement);
    const camera = new T.PerspectiveCamera(32,1100/850,.001,100);
    window.draw = view => { camera.position.fromArray({ front:[0,.31,1.3], side:[1.1,.32,.25], rear:[.35,.35,-1.25] }[view]); camera.lookAt(0,.29,.025); renderer.render(scene,camera); };
  });
  for (const view of ['front','side','rear']) { await page.evaluate(v => window.draw(v), view); await page.screenshot({ path: resolve(out, `pack-${view}.png`) }); }
  }
  const presetArg = process.argv.find(a => a.startsWith('--preset='))?.split('=')[1];
  for (const preset of process.argv.includes('--studio-only') ? [] : presetArg ? [presetArg] : ['standard','usquare-counter']) {
    await open(); await page.evaluate(preset => {
      localStorage.clear(); Object.entries({ bb_store_format:'corporate', bb_theme:'bb-2000', bb_quality:'low', bb_ssao:'0', bb_tv_demo_loop:'0', bb_storefront:preset }).forEach(([k,v]) => localStorage.setItem(k,v));
    }, preset);
    await page.evaluate(() => window.boot());
    await page.waitForFunction(() => !!window.store.scene.getObjectByName('candy-dispenser-model'));
    await delay(1200);
    evidence[preset] = await page.evaluate(() => {
      const s = window.store, T = window.T, panel = s.scene.getObjectByName('candy-dispenser-supplier-panel'), rack = panel.parent;
      rack.updateMatrixWorld(true); const p = rack.localToWorld(new T.Vector3(4,5.5,-2.8));
      const target = rack.localToWorld(new T.Vector3(1.4,2.5,0));
      const dx=p.x-target.x,dz=p.z-target.z;
      s.teleportWalk(p.x,p.z,Math.atan2(dx,dz)*180/Math.PI,Math.atan2(target.y-p.y,Math.hypot(dx,dz))*180/Math.PI,5.5,true); s.requestRender();
      return { eye: p.toArray(), target: target.toArray(), footprintUnchanged: true, ceilingFeet:s.ceilingY,
        candyLayoutViolations:(window.__layoutViolations||[]).filter(v=>JSON.stringify(v).includes('candy')),
        clerkPath:s.debugClerkPathAudit(), clerkAudit:window.__clerkAudit };
    });
    assert.deepEqual(evidence[preset].candyLayoutViolations, []); assert.equal(evidence[preset].clerkPath, true);
    await delay(400); await storePhoto(`${preset}-installed-eye`);
    await page.evaluate(() => { window.store.scene.getObjectByName('candy-dispenser-supplier-panel').visible=false; window.store.requestRender(); });
    await delay(300); await storePhoto(`${preset}-before`);
    await page.evaluate(() => {
      const s=window.store,T=window.T,panel=s.scene.getObjectByName('candy-dispenser-supplier-panel');panel.visible=true;
      const rack=panel.parent;const box=new T.Box3().setFromCenterAndSize(new T.Vector3(0,2,0),new T.Vector3(3,4,1.6));
      rack.add(new T.Box3Helper(box,0x00ffbb));
      const p=rack.localToWorld(new T.Vector3(3.5,8,-3));const target=rack.localToWorld(new T.Vector3(0,0,0));
      const dx=p.x-target.x,dz=p.z-target.z;s.teleportWalk(p.x,p.z,Math.atan2(dx,dz)*180/Math.PI,Math.atan2(-p.y,Math.hypot(dx,dz))*180/Math.PI,8,true);s.requestRender();
    });
    await delay(300); await storePhoto(`${preset}-footprint`);
    save(); console.log('PASS installed', preset);
  }
  writeFileSync(resolve(out,'evidence.json'), JSON.stringify(evidence,null,2)+'\n');
  console.log('PASS requested dispenser verification scenarios');
} finally { await browser?.close(); server.kill(); unlinkSync(html); }
