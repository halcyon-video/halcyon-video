import test from 'node:test';
import assert from 'node:assert/strict';
import { createCandyRackFinish } from '../src/fixtures/candy-rack-finish.ts';

test('rack finish has bounded reflectance, deterministic relief and owned texture', () => {
  const a = createCandyRackFinish(), b = createCandyRackFinish();
  assert.notEqual(a.texture, b.texture);
  assert.deepEqual(a.texture.image.data, b.texture.image.data);
  assert.equal(a.material.bumpMap, a.texture);
  assert.equal(a.material.roughnessMap, a.texture);
  assert.ok(Math.min(...a.material.color.toArray()) >= .08);
  assert.ok(new Set(a.texture.image.data).size > 30);
  assert.equal(a.texture.image.data.byteLength, 65536);
  for (const finish of [a,b]) { finish.material.dispose(); finish.texture.dispose(); }
});
