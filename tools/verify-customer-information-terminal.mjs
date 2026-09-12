// Uses the same isolated Vite/Puppeteer approach as verify-downlight.mjs.
// Start Vite on TERMINAL_CHECK_PORT (default 4380) before running this tool.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const out = resolve(process.env.TERMINAL_CHECK_OUT || 'scratch/customer-information-terminal');
const port = process.env.TERMINAL_CHECK_PORT || '4380';
assert.deepEqual(readdirSync('public/user-assets'), ['README.md'], 'Public evidence requires a tree without private user-assets');
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.setViewport({ width: 1200, height: 900 });
  await page.goto(`http://localhost:${port}/tools/customer-information-terminal-preview.html`);
  await page.waitForFunction(() => window.preview?.ready, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  for (const view of ['front', 'side', 'rear', 'eye', 'supports']) {
    await page.evaluate(view => window.setView(view), view);
    await page.screenshot({ path: resolve(out, `${view}.png`) });
  }
  await page.evaluate(() => window.setView('front'));
  const success = await page.evaluate(() => {
    const p = window.preview;
    const group = p.scene.getObjectByName(p.placement.id);
    const model = group.getObjectByName('display-model');
    const materials = new Set(), geometries = new Set(), textures = new Set();
    group.traverse(o => {
      if (!o.isMesh) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m); if (m.map) textures.add(m.map);
      }
    });
    const disposed = { geometry: 0, material: 0, texture: 0 };
    for (const [type, values] of [['geometry', geometries], ['material', materials], ['texture', textures]])
      values.forEach(o => o.addEventListener('dispose', () => disposed[type]++));
    const result = { loaded: !!model, fallbackHidden: !group.getObjectByName('display-fallback').visible,
      screen: group.getObjectByName('ReplaceableScreen').material.name,
      defaultPlacements: p.defaults.filter(v => v.kind === p.placement.kind).length,
      footprint: p.fixture.getFootprint(), counters: p.counters(),
      bounds: p.bounds(),
      draws: p.renderer.info.render.calls, triangles: p.renderer.info.render.triangles,
      expectedDisposal: { geometry: geometries.size, material: materials.size, texture: textures.size } };
    p.fixture.dispose(); p.fixture.dispose();
    result.disposed = disposed;
    result.detached = !p.scene.getObjectByName(p.placement.id);
    const gated = p.createFixture({ ...p.placement, options: {} }, p.ctx);
    gated.build(); result.gateClosed = !p.scene.getObjectByName(p.placement.id); gated.dispose();
    return result;
  });
  assert.equal(success.loaded, true); assert.equal(success.fallbackHidden, true);
  assert.equal(success.screen, 'CustomerInformationScreen');
  assert.equal(success.defaultPlacements, 0); assert.equal(success.footprint, null);
  assert.equal(success.counters.colliders, 0); assert.ok(success.counters.renderRequests > 0);
  for (const [i, size] of [1.79, 2.01, .441].entries()) assert.ok(Math.abs(success.bounds.size[i] - size) < 1e-4);
  assert.equal(success.detached, true); assert.equal(success.gateClosed, true);
  assert.deepEqual(success.disposed, success.expectedDisposal);

  await page.setRequestInterception(true);
  let mode = 'fail', pending;
  page.on('request', request => {
    if (request.url().endsWith('/models/customer-information-terminal.glb')) {
      if (mode === 'fail') void request.respond({ status: 404, body: 'Deliberate missing asset check' });
      else pending = request;
    } else void request.continue();
  });
  await page.evaluate(() => window.preview.fixture.build());
  await page.waitForFunction(() => window.preview.logs.length > 0);
  const fallback = await page.evaluate(() => {
    const p = window.preview; window.setView('front');
    return p.scene.getObjectByName('display-fallback').visible && !p.scene.getObjectByName('display-model');
  });
  assert.equal(fallback, true);
  await page.screenshot({ path: resolve(out, 'fallback.png') });
  await page.evaluate(() => window.preview.fixture.dispose());
  mode = 'delay';
  await page.evaluate(() => window.preview.fixture.build());
  const deadline = Date.now() + 10000;
  while (!pending && Date.now() < deadline) await new Promise(r => setTimeout(r, 25));
  assert.ok(pending, 'held GLB request');
  await page.evaluate(() => window.preview.fixture.dispose());
  await pending.continue();
  await page.waitForNetworkIdle();
  assert.equal(await page.evaluate(() => !!window.preview.scene.getObjectByName('display-model')), false);
  assert.deepEqual(errors, []);
  const report = { success, errorFallback: fallback, lateLoadDetached: true, pageErrors: errors,
    publicUserAssets: 'README.md only', installation: 'Not enabled: no confirmed floor/counter anchor. Eye view is a crop-relative viewing study, not an installed photograph.' };
  writeFileSync(resolve(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
