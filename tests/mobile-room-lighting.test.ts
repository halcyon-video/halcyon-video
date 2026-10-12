import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const eras = ['bb-1990', 'bb-1993', 'bb-2000', 'bb-2010'];

test('mobile ships a baked daytime environment for every store era', () => {
  for (const era of eras) {
    const dir = `public/lighting/${era}`;
    assert.ok(existsSync(`${dir}/store-environment.bin.gz`), `${era} binary map`);
    const meta = JSON.parse(readFileSync(`${dir}/store-environment.json`, 'utf8'));
    assert.equal(meta.width, 384);
    assert.equal(meta.height, 512);
    assert.ok(meta.intensity > 0);
  }
});

test('mobile room lighting selects the active era map', () => {
  const source = readFileSync('src/mobile-room-lighting.ts', 'utf8');
  assert.match(source, /lighting\/\$\{era\}\/store-environment\.json/);
  assert.match(source, /lighting\/\$\{era\}\/store-environment\.bin\.gz/);
  assert.doesNotMatch(source, /getActiveTheme\(\)\.id !== 'bb-1990'/);
});

test('phone bootstrap environment shares the baked map shader variant', () => {
  // Three keys lit programs on the CubeUV height (4 × cube size). A mismatch makes
  // the baked map's arrival recompile every prepared room material at first draw.
  const source = readFileSync('src/mobile-room-lighting.ts', 'utf8');
  const size = Number(source.match(/BAKED_ROOM_CUBE_SIZE = (\d+);/)?.[1]);
  for (const era of eras) {
    const meta = JSON.parse(readFileSync(`public/lighting/${era}/store-environment.json`, 'utf8'));
    assert.equal(meta.height, 4 * size, `${era} baked map height`);
  }
  const scene = readFileSync('src/three-scene.ts', 'utf8');
  assert.match(scene, /fromScene\(roomEnv, 0\.04, 0\.1, 100,\s*mobileRoomLightingExpected\(\) \? \{ size: BAKED_ROOM_CUBE_SIZE \} : \{\}\)/);
});
