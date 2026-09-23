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
