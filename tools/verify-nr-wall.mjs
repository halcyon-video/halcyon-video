// Render the real runtime installer, including an eight-foot construction seam
// and a trimmed trailing section. Run: node tools/verify-nr-wall.mjs [output-dir]
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root = new URL('../', import.meta.url).pathname;
const output = resolve(process.argv[2] || '/tmp/nr-wall-verification');
const port = 4397;
const htmlPath = resolve(root, 'tools/verify-nr-wall.html');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  mkdirSync(output, { recursive: true });
  writeFileSync(htmlPath, `<body style="margin:0"><script type="module">
    import * as THREE from '/node_modules/three/build/three.module.js';
    import { NrWallModelBatch } from '/src/nr-wall-model.ts';
    window.THREE = THREE; window.NrWallModelBatch = NrWallModelBatch;
  </script></body>`);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://localhost:' + port)).ok) break; } catch {}
    await delay(100);
  }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 1000 });
  await page.goto(`http://localhost:${port}/tools/verify-nr-wall.html`);
  await page.waitForFunction(() => !!window.NrWallModelBatch);
  const evidence = await page.evaluate(async () => {
    const T = window.THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1400, 1000); renderer.setClearColor(0x273344);
    renderer.outputColorSpace = T.SRGBColorSpace; document.body.append(renderer.domElement);
    const scene = new T.Scene(); scene.add(new T.HemisphereLight(0xfff5df, 0x536578, 2));
    const light = new T.DirectionalLight(0xffffff, 2.5); light.position.set(-3, 10, 7); scene.add(light);
    const parent = new T.Group(); scene.add(parent);
    const fallback = new T.Mesh(new T.BoxGeometry(17, 8, .7), new T.MeshStandardMaterial({ color: 'red' }));
    fallback.position.y = 4; parent.add(fallback);
    const batch = new window.NrWallModelBatch(); batch.add(parent, 17, [fallback], [-8.52, 0, 8.52]);
    await Promise.race([new Promise(resolve => batch.finish(resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Model load timeout')), 15000))]);
    const wall = new T.Mesh(new T.BoxGeometry(19, 10, .1), new T.MeshStandardMaterial({ color: 0xe5ba29 }));
    wall.position.set(0, 5, -.08); scene.add(wall);
    const camera = new T.PerspectiveCamera(40, 1.4, .1, 100);
    window.draw = (view) => {
      if (view === 'front') camera.position.set(0, 6, 29);
      else camera.position.set(18, 10, 21);
      camera.lookAt(0, 4.5, .3); renderer.render(scene, camera);
    };
    window.draw('front');
    const model = parent.getObjectByName('modeled-new-release-wall');
    const box = new T.Box3().setFromObject(model);
    return { fallbackHidden: !fallback.visible, drawCallsForFixture: model.children.length,
      bounds: { min: box.min.toArray(), max: box.max.toArray() }, triangles: model.children.reduce((n, m) => n + m.geometry.index.count / 3, 0) };
  });
  await page.screenshot({ path: resolve(output, 'runtime-front.png') });
  await page.evaluate(() => window.draw('oblique'));
  await page.screenshot({ path: resolve(output, 'runtime-oblique.png') });
  writeFileSync(resolve(output, 'runtime-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} finally {
  await browser?.close(); server.kill(); unlinkSync(htmlPath);
}
