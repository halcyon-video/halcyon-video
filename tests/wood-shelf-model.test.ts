import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { joineryModelsReady } from '../src/joinery-model.ts';
import { applyWoodGrainUV, applyWoodGrainToFlaggedGroups, isWoodGrainMaterial, WOOD_GRAIN_FLAG, woodToeBoard, woodWallBacking, woodWallDeck, woodWallUpright } from '../src/wood-shelf-model.ts';

import { NR_WALL_SLOPE, nrWallDepthAtHeight, NR_WALL_SHELF_DEPTH } from '../src/store-layout.ts';

(globalThis as any).document ??= {}; // joinery stamping is browser-only; the kit itself is parsed from disk here

async function joinery() {
  const bytes = await readFile(new URL('../public/models/visible-joinery.glb', import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const span = (g: THREE.BufferGeometry, key: string, comp: 'x' | 'y') => {
  const a = g.getAttribute(key); let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.count; i++) { const v = a[`get${comp.toUpperCase()}` as 'getX'](i); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return hi - lo;
};
/** Mean |dUV| per foot along a world axis over triangles whose normal is dominated by `face`. */
function uvPerFoot(g: THREE.BufferGeometry, face: 'x' | 'y' | 'z', along: 'x' | 'y' | 'z') {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  const idx = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i);
  let du = 0, dv = 0, len = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1];
    const nn = n.getX(a) ** 2 + n.getY(a) ** 2 + n.getZ(a) ** 2;
    if (Math.abs(n[`get${face.toUpperCase()}` as 'getX'](a)) < .9 * Math.sqrt(nn)) continue;
    for (const [i, j] of [[a, b], [b, idx[t + 2]], [idx[t + 2], a]]) {
      const delta = (c: 'x' | 'y' | 'z') => Math.abs(p[`get${c.toUpperCase()}` as 'getX'](i) - p[`get${c.toUpperCase()}` as 'getX'](j));
      const d = delta(along);
      // Axis-aligned edges only: diagonals mix both texture directions.
      if (d < .02 || (['x', 'y', 'z'] as const).some(c => c !== along && delta(c) > 1e-5)) continue;
      du += Math.abs(uv.getX(i) - uv.getX(j)); dv += Math.abs(uv.getY(i) - uv.getY(j)); len += d;
    }
  }
  return { u: du / len, v: dv / len };
}

test('wood grain UVs follow the board, keep physical scale and stay unmirrored', () => {
  const box = new THREE.BoxGeometry(6, .06, 1).toNonIndexed(); applyWoodGrainUV(box, 'x');
  const top = uvPerFoot(box, 'y', 'x');
  assert.ok(top.u > .005 && top.v < 1e-6, 'U (grain) advances along the span and not across it');
  assert.ok(Math.abs(top.u - 1 / 15) < 1e-6, 'physical scale: 2.5 ft tile x 6 repeats');
  const board = new THREE.BoxGeometry(.04, 8, 1).toNonIndexed(); applyWoodGrainUV(board, 'y');
  const face = uvPerFoot(board, 'x', 'y');
  assert.ok(Math.abs(face.u - 1 / 15) < 1e-6 && face.v < 1e-6, 'upright grain runs vertically');
  const across = uvPerFoot(board, 'x', 'z');
  assert.ok(Math.abs(across.v - 1 / 3) < 1e-6 && across.u < 1e-6, 'across-grain scale is the 1.5 ft x 2 repeat tile');
  // Handedness: every triangle keeps its UV winding relative to its normal.
  const p = box.getAttribute('position'), uv = box.getAttribute('uv'), n = box.getAttribute('normal');
  let mirrored = 0; const faceSigns = new Map<string, number>();
  for (let t = 0; t < p.count; t += 3) {
    const e1 = new THREE.Vector3().fromBufferAttribute(p, t + 1).sub(new THREE.Vector3().fromBufferAttribute(p, t));
    const e2 = new THREE.Vector3().fromBufferAttribute(p, t + 2).sub(new THREE.Vector3().fromBufferAttribute(p, t));
    const area = (uv.getX(t + 1) - uv.getX(t)) * (uv.getY(t + 2) - uv.getY(t)) - (uv.getX(t + 2) - uv.getX(t)) * (uv.getY(t + 1) - uv.getY(t));
    const nn = new THREE.Vector3().fromBufferAttribute(n, t);
    const winding = Math.sign(e1.cross(e2).dot(nn)); // +1 for outward-facing triangles
    const key = [nn.x, nn.y, nn.z].map(Math.round).join();
    faceSigns.set(key, Math.sign(area) * winding);
    if (Math.sign(area) * winding < 0) mirrored++;
  }
  assert.equal(new Set(faceSigns.values()).size, 1, 'all faces share one UV handedness');
  assert.equal(mirrored, 0, 'texture is not mirrored when seen from outside');
  assert.equal(isWoodGrainMaterial(new THREE.MeshStandardMaterial()), false, 'laminate is not timber');
  const timber = new THREE.MeshStandardMaterial(); timber.userData[WOOD_GRAIN_FLAG] = true;
  assert.equal(isWoodGrainMaterial(timber), true);
});

test('authored wall boards arrive with the built-in taper, slope and grain; missing and disposed loads leave the fallback', async t => {
  const kit = await joinery();
  let resolve!: (v: any) => void, reject!: (e: Error) => void;
  const make = () => new Promise<any>((res, rej) => { resolve = res; reject = rej; });
  let pending = make();
  t.mock.method(GLTFLoader.prototype, 'loadAsync', () => pending);
  const L = 12, d = NR_WALL_SHELF_DEPTH, deckDepth = nrWallDepthAtHeight(.42);
  const builtinDeck = () => {
    const g = new THREE.BoxGeometry(L, .0625, deckDepth), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - .01125 + NR_WALL_SLOPE * (p.getZ(i) - deckDepth / 2));
    g.computeVertexNormals(); return g;
  };
  const deck = woodWallDeck(builtinDeck(), L, .0625, deckDepth, NR_WALL_SLOPE, -.01125);
  const panelGeo = new THREE.BoxGeometry(.04, 8, d);
  { const p = panelGeo.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0) p.setZ(i, nrWallDepthAtHeight(p.getY(i) + 4) - d / 2); }
  const panel = woodWallUpright(panelGeo, .04, 8, d, nrWallDepthAtHeight);
  const backing = woodWallBacking(L, 8, .04), toe = woodToeBoard(L, .32, .04);
  const beforeTriangles = deck.index!.count / 3;
  assert.equal(beforeTriangles, 12, 'built-in slab until the model arrives');
  resolve(kit); await joineryModelsReady();
  assert.ok(deck.index!.count / 3 > 12 && panel.index!.count / 3 > 12 && toe.index!.count / 3 > 12, 'finished eased boards replaced the slabs');
  deck.computeBoundingBox(); panel.computeBoundingBox();
  assert.ok(Math.abs(deck.boundingBox!.max.x - L / 2) < 1e-4 && Math.abs(deck.boundingBox!.max.z - deckDepth / 2) < 1e-4, 'deck keeps its anchors');
  const pos = deck.getAttribute('position'); let front = -Infinity, rear = -Infinity;
  for (let i = 0; i < pos.count; i++) { if (pos.getZ(i) > deckDepth / 2 - .01) front = Math.max(front, pos.getY(i)); if (pos.getZ(i) < -deckDepth / 2 + .01) rear = Math.max(rear, pos.getY(i)); }
  assert.ok(Math.abs((front - rear) / (deckDepth - .02) - NR_WALL_SLOPE) < .006, 'sloped support plane survived the async swap');
  const pp = panel.getAttribute('position'); let topFront = -Infinity, botFront = -Infinity;
  for (let i = 0; i < pp.count; i++) { if (pp.getY(i) > 3.99) topFront = Math.max(topFront, pp.getZ(i)); if (pp.getY(i) < -3.99) botFront = Math.max(botFront, pp.getZ(i)); }
  assert.ok(Math.abs(botFront - (nrWallDepthAtHeight(0) - d / 2)) < .01 && Math.abs(topFront - (nrWallDepthAtHeight(8) - d / 2)) < .01, 'end panel taper survived');
  assert.ok(span(deck, 'uv', 'x') > 0 && uvPerFoot(deck, 'y', 'x').v < 1e-5, 'deck grain along the span');
  assert.ok(uvPerFoot(panel, 'x', 'y').v < 1e-5 && uvPerFoot(panel, 'x', 'y').u > .06, 'panel grain vertical');
  assert.ok(backing.getAttribute('uv1'), 'backing provides normalized UV1 for shade/AO');
  assert.equal(backing.getAttribute('uv1').getX(0) >= 0 && backing.getAttribute('uv1').getX(0) <= 1, true, 'backing keeps normalized UV1 lanes');
  assert.ok(uvPerFoot(backing, 'z', 'y').u > .05 && uvPerFoot(backing, 'z', 'y').v < 1e-5, 'backing has physical vertical grain on UV0');
  for (const g of [deck, panel, toe, backing]) for (const key of ['position', 'normal', 'uv']) assert.ok(Array.from(g.getAttribute(key).array).every(Number.isFinite));

  pending = make();
  const missing = woodWallDeck(builtinDeck(), L, .0625, deckDepth, NR_WALL_SLOPE, -.01125);
  reject(new Error('404')); await joineryModelsReady();
  assert.equal(missing.index!.count / 3, 12, 'missing kit keeps the built-in board');

  pending = make();
  const retired = woodWallDeck(builtinDeck(), L, .0625, deckDepth, NR_WALL_SLOPE, -.01125);
  retired.dispose(); resolve(await joinery()); await joineryModelsReady();
  assert.equal(retired.index!.count / 3, 12, 'a board disposed during loading is never refilled');
});


test('mixed wood and printed cap retains normalized front art while side/back get vertical grain', () => {
  const geo = new THREE.BufferGeometry();
  // 6 vertices: 3 for front (mat 0), 3 for side (mat 1)
  const pos = new Float32Array([
    // front face
    0, 0, 1,   1, 0, 1,   0, 1, 1,
    // side face
    1, 2, 3,   1, 2, 4,   1, 3, 3
  ]);
  const norm = new Float32Array([
    0, 0, 1,   0, 0, 1,   0, 0, 1,
    1, 0, 0,   1, 0, 0,   1, 0, 0
  ]);
  const uv = new Float32Array([
    0.1, 0.2,   0.3, 0.4,   0.5, 0.6,
    0.0, 0.0,   0.0, 0.0,   0.0, 0.0
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.addGroup(0, 3, 0);
  geo.addGroup(3, 3, 1);

  const frontMat = new THREE.MeshStandardMaterial();
  const sideMat = new THREE.MeshStandardMaterial();
  sideMat.userData[WOOD_GRAIN_FLAG] = true;
  const mats = [frontMat, sideMat];

  applyWoodGrainToFlaggedGroups(geo, mats, 'y');

  // Front UVs should remain byte-identical
  const uvAttr = geo.getAttribute('uv');
  assert.ok(Math.abs(uvAttr.getX(0) - 0.1) < 1e-6);
  assert.ok(Math.abs(uvAttr.getY(0) - 0.2) < 1e-6);
  assert.ok(Math.abs(uvAttr.getX(1) - 0.3) < 1e-6);
  assert.ok(Math.abs(uvAttr.getY(1) - 0.4) < 1e-6);
  assert.ok(Math.abs(uvAttr.getX(2) - 0.5) < 1e-6);
  assert.ok(Math.abs(uvAttr.getY(2) - 0.6) < 1e-6);

  // Side UVs should be updated to physical grain
  assert.ok(uvAttr.getX(3) !== 0.0 || uvAttr.getY(3) !== 0.0, 'side UVs updated');
});

test('wood side groups preserve printed UVs on indexed and nonindexed caps', () => {
  for (const indexed of [true, false]) {
    const base = new THREE.BoxGeometry(1, 8.2, .1);
    const g = indexed ? base : base.toNonIndexed();
    const printed = new THREE.MeshStandardMaterial(), wood = new THREE.MeshStandardMaterial();
    wood.userData[WOOD_GRAIN_FLAG] = true;
    const materials = [wood, wood, wood, wood, printed, wood];
    const stream = (group: number) => {
      const range = g.groups[group], uv = g.getAttribute('uv'), values: number[] = [];
      for (let i = range.start; i < range.start + range.count; i++) {
        const vertex = g.index ? g.index.getX(i) : i; values.push(uv.getX(vertex), uv.getY(vertex));
      }
      return values;
    };
    const art = stream(4), side = stream(0);
    applyWoodGrainToFlaggedGroups(g, materials);
    assert.deepEqual(stream(4), art, 'printed front remains unchanged');
    assert.notDeepEqual(stream(0), side, 'unprinted side receives physical grain');
    const grain = uvPerFoot(g, 'x', 'y');
    assert.ok(Math.abs(grain.u - 1 / 15) < 1e-6 && grain.v < 1e-6, 'side grain follows height');
    g.dispose(); if (g !== base) base.dispose(); printed.dispose(); wood.dispose();
  }
});
