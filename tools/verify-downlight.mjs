#!/usr/bin/env node
// tools/verify-downlight.mjs
// Renders verification photographs of the Blender recessed downlight model:
// 1. Front (upward oblique showing trim, reflector bowl, and lamp lens)
// 2. Side (elevation showing trim drop and plenum can depth)
// 3. Rear/Support (isometric top view of mounting frame, junction box, conduit whip)
// 4. Installed (eye-level view of front soffit with downlights installed)

import { copyFileSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const port = Number(process.env.DOWNLIGHT_CHECK_PORT || 4396);
const root = new URL('../', import.meta.url).pathname;
const server = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });

let browser;
try {
  for (let i = 0; ; i++) {
    if (server.exitCode !== null) throw new Error('Isolated Vite server exited prematurely');
    try {
      const res = await fetch(`http://localhost:${port}`);
      if (res.ok) break;
    } catch {}
    if (i > 100) throw new Error('Vite startup timeout');
    await delay(100);
  }

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });

  const htmlContent = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Downlight Verification</title>
    <script type="module">
      import * as THREE from 'three';
      import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
      import { buildFrontSoffit } from '/src/ceiling-soffit.ts';

      window.THREE = THREE;
      window.GLTFLoader = GLTFLoader;
      window.buildFrontSoffit = buildFrontSoffit;
      window.__ready = true;
    </script>
  </head>
  <body style="margin:0;overflow:hidden;background:#15181d;">
    <canvas id="c"></canvas>
  </body>
</html>`;
  writeFileSync(resolve(root, 'tools/verify-downlight.html'), htmlContent);

  await page.goto(`http://localhost:${port}/tools/verify-downlight.html`);
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });

  await page.evaluate(() => {
    const { THREE, GLTFLoader } = window;
    const canvas = document.getElementById('c');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1024, 768);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    window.renderer = renderer;

    const loader = new GLTFLoader();
    window.loadModel = () => new Promise((resolve, reject) => {
      loader.load('/models/recessed-downlight.glb', gltf => resolve(gltf.scene), undefined, reject);
    });
  });

  const captures = [
    {
      name: 'preview-front.png',
      desc: 'Upward oblique view showing trim ring, reflector bowl, and emissive lamp',
      fn: async () => {
        return await page.evaluate(async () => {
          const { THREE, renderer, loadModel } = window;
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x1a1e24);

          const model = await loadModel();
          scene.add(model);

          // Subtle drywall ceiling plane segment
          const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xdeded8, roughness: 0.9, side: THREE.DoubleSide });
          const shape = new THREE.Shape();
          shape.moveTo(-1.5, -1.5); shape.lineTo(1.5, -1.5); shape.lineTo(1.5, 1.5); shape.lineTo(-1.5, 1.5); shape.closePath();
          const hole = new THREE.Path();
          hole.absarc(0, 0, 0.32, 0, Math.PI * 2, true);
          shape.holes.push(hole);
          const ceilingMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), ceilingMat);
          ceilingMesh.rotation.x = Math.PI / 2;
          scene.add(ceilingMesh);

          const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
          scene.add(hemi);

          const upLight = new THREE.DirectionalLight(0xffffff, 1.5);
          upLight.position.set(0.5, -1.2, 0.8);
          scene.add(upLight);

          const camera = new THREE.PerspectiveCamera(40, 1024 / 768, 0.05, 50);
          camera.position.set(0.35, -0.75, 0.55);
          camera.lookAt(0, 0.12, 0);

          renderer.render(scene, camera);
          return renderer.domElement.toDataURL('image/png');
        });
      },
    },
    {
      name: 'preview-side.png',
      desc: 'Side elevation view showing trim lip drop below ceiling and upper plenum housing',
      fn: async () => {
        return await page.evaluate(async () => {
          const { THREE, renderer, loadModel } = window;
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x1a1e24);

          const model = await loadModel();
          scene.add(model);

          // Reference line indicating ceiling plane y = 0
          const lineMat = new THREE.LineBasicMaterial({ color: 0x4fc3f7 });
          const points = [new THREE.Vector3(-1.2, 0, 0), new THREE.Vector3(1.2, 0, 0)];
          const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
          scene.add(new THREE.Line(lineGeo, lineMat));

          const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1.2);
          scene.add(hemi);
          const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
          dirLight.position.set(1.5, 1.5, 2.0);
          scene.add(dirLight);
          const dirLightBack = new THREE.DirectionalLight(0xffffff, 0.8);
          dirLightBack.position.set(-1.5, -0.5, -1.0);
          scene.add(dirLightBack);

          const camera = new THREE.PerspectiveCamera(30, 1024 / 768, 0.05, 50);
          camera.position.set(0, 0.28, 2.8);
          camera.lookAt(0, 0.28, 0);

          renderer.render(scene, camera);
          return renderer.domElement.toDataURL('image/png');
        });
      },
    },
    {
      name: 'preview-rear.png',
      desc: 'Top isometric / support view showing plenum can, junction box, mounting bars, and whip',
      fn: async () => {
        return await page.evaluate(async () => {
          const { THREE, renderer, loadModel } = window;
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x1a1e24);

          const model = await loadModel();
          scene.add(model);

          const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
          scene.add(hemi);
          const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
          keyLight.position.set(1.5, 2.5, 1.5);
          scene.add(keyLight);
          const fillLight = new THREE.DirectionalLight(0x88bbff, 0.9);
          fillLight.position.set(-2.0, 1.0, -1.5);
          scene.add(fillLight);

          const camera = new THREE.PerspectiveCamera(35, 1024 / 768, 0.05, 50);
          camera.position.set(1.4, 1.5, 1.4);
          camera.lookAt(0, 0.28, 0);

          renderer.render(scene, camera);
          return renderer.domElement.toDataURL('image/png');
        });
      },
    },
    {
      name: 'preview-installed.png',
      desc: 'In-store eye-level oblique view of the front soffit ceiling with recessed downlights installed',
      fn: async () => {
        return await page.evaluate(async () => {
          const { THREE, renderer, buildFrontSoffit } = window;
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0a0c10);

          const ceilingY = 11.5;
          const dummyMat = new THREE.MeshStandardMaterial({ color: 0xdeded8, roughness: 0.85 });
          const soffitMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.9 });

          const res = buildFrontSoffit({
            scene,
            ceilingY,
            storefrontSpec: { counterShape: 'shield', doorWidth: 3.5, entryStyle: 'vestibule' },
            storeWidth: 60,
            corniceWallGap: 0.5,
            corniceBand: 1.0,
            corniceDrop: 2.0,
            tileMaterial: dummyMat,
            trofferPanelMaterial: dummyMat,
            trofferFrameMaterial: dummyMat,
            whiteBodyMat: soffitMat,
            tileX: 2.5,
            tileZ: 2.5,
            softwareGL: false,
            reflectorSize: { w: 100, h: 100 },
            plainWhite: true,
          });

          // Wait for GLTF models to load and hide fallback
          const fallback = res.group.getObjectByName('downlightFallback');
          for (let i = 0; i < 60 && fallback && fallback.visible; i++) {
            await new Promise(r => setTimeout(r, 50));
          }

          // Add store ambient/fill lighting illuminating upward towards ceiling
          const amb = new THREE.AmbientLight(0xffffff, 0.9);
          scene.add(amb);
          const floorBounce = new THREE.DirectionalLight(0xffeedd, 1.8);
          floorBounce.position.set(11.0, 0.0, 8.0);
          floorBounce.target.position.set(11.0, 9.5, 4.0);
          scene.add(floorBounce);
          scene.add(floorBounce.target);

          // Add store floor
          const floorGeo = new THREE.PlaneGeometry(60, 40);
          const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a404d, roughness: 0.7 });
          const floor = new THREE.Mesh(floorGeo, floorMat);
          floor.rotation.x = -Math.PI / 2;
          scene.add(floor);

          // Add a checkout counter box to provide authentic in-store context
          const counterGeo = new THREE.BoxGeometry(16, 3.2, 3.0);
          const counterMat = new THREE.MeshStandardMaterial({ color: 0x2b303c, roughness: 0.6 });
          const counter = new THREE.Mesh(counterGeo, counterMat);
          counter.position.set(11.0, 1.6, 5.0);
          scene.add(counter);

          // Eye-level camera (5.4 ft) looking up obliquely along the front soffit V-angle
          const camera = new THREE.PerspectiveCamera(58, 1024 / 768, 0.1, 100);
          camera.position.set(18.0, 5.2, 14.0);
          camera.lookAt(7.0, 8.8, 3.5);

          renderer.render(scene, camera);
          return renderer.domElement.toDataURL('image/png');
        });
      },
    },
  ];

  const outDir = '/home/devin/mognet-workers/pipeline-6h/out/fix-halcyon-286';
  const kitDir = resolve(root, 'scratch/publicity-kits/issue-286');
  mkdirSync(kitDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  for (const cap of captures) {
    console.log(`Rendering ${cap.name} (${cap.desc})...`);
    const dataUrl = await cap.fn();
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const kitPath = resolve(kitDir, cap.name);
    const outPath = resolve(outDir, cap.name);
    writeFileSync(kitPath, buffer);
    writeFileSync(outPath, buffer);
    console.log(`Saved -> ${kitPath} and ${outPath} (${buffer.length} bytes)`);
  }

  console.log('All verification photographs generated successfully!');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  try { unlinkSync(resolve(root, 'tools/verify-downlight.html')); } catch {}
}
