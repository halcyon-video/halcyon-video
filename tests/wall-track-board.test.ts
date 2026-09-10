import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function parseGlb(name: string) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${name} has glTF magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${name} is glTF 2.0`);
  const jsonLen = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonLen).toString('utf8'));
  return { bytes, doc };
}

test('wall-track-board-tall: exported bounds, UVs, normals and resource budget', async () => {
  const { bytes, doc } = parseGlb('wall-track-board-tall');
  assert.ok(bytes.length < 100_000, `byte length ${bytes.length} < 100KB`);

  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());

  // Combined track board + companion poster width ~ 4.6 ft, height ~ 3.8 ft, depth ~ 0.08 ft
  assert.ok(size.x > 4.4 && size.x < 4.8, `tall width ${size.x} in expected range`);
  assert.ok(size.y > 3.7 && size.y < 3.9, `tall height ${size.y} in expected range`);
  assert.ok(size.z < 0.10, `tall depth ${size.z} under 0.10 ft`);

  const expectedMaterials = [
    'BoardHardware',
    'PosterFace',
    'PosterFrame',
    'TrackBacking',
    'TrackFrameSilver',
    'TrackRail',
    'TrackStripFace',
  ];
  const foundMaterials = doc.materials.map((m: { name: string }) => m.name).sort();
  assert.deepEqual(foundMaterials, expectedMaterials.sort());

  let triangles = 0;
  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geo = obj.geometry;
    triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    assert.ok(geo.attributes.position, 'mesh has position attribute');
    assert.ok(geo.attributes.normal, 'mesh has normal attribute');
    assert.ok(geo.attributes.uv, 'mesh has uv attribute');
  });

  assert.ok(triangles <= 1200, `triangle count ${triangles} <= 1200`);
});

test('wall-track-board-long: exported bounds, UVs, normals and resource budget', async () => {
  const { bytes, doc } = parseGlb('wall-track-board-long');
  assert.ok(bytes.length < 80_000, `byte length ${bytes.length} < 80KB`);

  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());

  // Parameterized long board: width ~ 11.5 ft, height ~ 1.5 ft
  assert.ok(size.x > 11.3 && size.x < 11.7, `long width ${size.x} in expected range`);
  assert.ok(size.y > 1.4 && size.y < 1.6, `long height ${size.y} in expected range`);
  assert.ok(size.z < 0.12, `long depth ${size.z} under 0.12 ft`);

  const expectedMaterials = [
    'BoardHardware',
    'TrackBacking',
    'TrackEmissive',
    'TrackFrameDark',
    'TrackHood',
    'TrackRail',
    'TrackStripFace',
  ];
  const foundMaterials = doc.materials.map((m: { name: string }) => m.name).sort();
  assert.deepEqual(foundMaterials, expectedMaterials.sort());

  let triangles = 0;
  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geo = obj.geometry;
    triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    assert.ok(geo.attributes.position, 'mesh has position attribute');
    assert.ok(geo.attributes.normal, 'mesh has normal attribute');
    assert.ok(geo.attributes.uv, 'mesh has uv attribute');
  });

  assert.ok(triangles <= 800, `triangle count ${triangles} <= 800`);
});

test('wall-track-rail: 1-foot modular unit bounds and attributes', async () => {
  const { bytes, doc } = parseGlb('wall-track-rail');
  assert.ok(bytes.length < 10_000, `rail bytes ${bytes.length} < 10KB`);

  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());

  assert.ok(Math.abs(size.x - 1.0) < 0.05, `rail modular length 1.0 ft`);
  assert.ok(size.z < 0.05, `rail profile depth under 0.05 ft`);

  const foundMaterials = doc.materials.map((m: { name: string }) => m.name).sort();
  assert.deepEqual(foundMaterials, ['TrackRail', 'TrackStripFace']);
});

test('wall-track-board: placement declarations and era gating', () => {
  const configSource = readFileSync(new URL('../src/store-fixtures-config.ts', import.meta.url), 'utf8');

  // Verify tall format placement behind registers
  assert.ok(configSource.includes("id: 'wall-track-board-registers'"), 'registers placement declared');
  assert.ok(configSource.includes("format: 'tall'"), 'tall format specified');
  assert.ok(
    /id:\s*'wall-track-board-registers'[\s\S]*?themes:\s*\[\s*'bb-1993',\s*'bb-2000',\s*'bb-2010'\s*\]/.test(configSource),
    'tall board themes include bb-1993, bb-2000, bb-2010',
  );

  // Verify long format placement facing shoppers above front glass
  assert.ok(configSource.includes("id: 'wall-track-board-terms'"), 'terms placement declared');
  assert.ok(configSource.includes("format: 'long'"), 'long format specified');
  assert.ok(
    /id:\s*'wall-track-board-terms'[\s\S]*?themes:\s*\[\s*'bb-1993',\s*'bb-2000',\s*'bb-2010'\s*\]/.test(configSource),
    'long board themes include bb-1993, bb-2000, bb-2010',
  );

  // 1990 Coming Soon board is not displaced (only exists on bb-1990 via COMING_SOON_LETTERBOARD_THEMES)
  assert.ok(configSource.includes("id: 'coming-soon-letterboard-counter-end'"));
  assert.ok(
    /id:\s*'coming-soon-letterboard-counter-end'[\s\S]*?themes:\s*COMING_SOON_LETTERBOARD_THEMES/.test(configSource),
    'coming soon board retains bb-1990 gating',
  );
});

test('wall-track-board: registration in fixture-registry', () => {
  const registrySource = readFileSync(new URL('../src/fixture-registry.ts', import.meta.url), 'utf8');
  assert.ok(registrySource.includes("'wall-track-board'"), 'wall-track-board registered in fixture registry');
});

test('wall-track-board: reproducible blender generator metrics', () => {
  const rawMetrics = readFileSync(new URL('../tools/models/wall-track-board-metrics.json', import.meta.url), 'utf8');
  const metrics = JSON.parse(rawMetrics);

  assert.ok(metrics['wall-track-board-tall'], 'tall model metrics exist');
  assert.ok(metrics['wall-track-board-long'], 'long model metrics exist');
  assert.ok(metrics['wall-track-rail'], 'rail model metrics exist');

  assert.ok(metrics['wall-track-board-tall'].triangles <= 1200, 'tall model under 1200 triangles');
  assert.ok(metrics['wall-track-board-tall'].bytes < 100_000, 'tall model under 100KB');

  assert.ok(metrics['wall-track-board-long'].triangles <= 800, 'long model under 800 triangles');
  assert.ok(metrics['wall-track-board-long'].bytes < 80_000, 'long model under 80KB');

  assert.ok(metrics['wall-track-rail'].triangles <= 100, 'modular rail under 100 triangles');
  assert.ok(metrics['wall-track-rail'].bytes < 10_000, 'modular rail under 10KB');
});
