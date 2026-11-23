import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyWhiteBorderShader, whiteClamshellWindowAspect } from '../src/white-border-shader.ts';

function compile(mat: THREE.MeshStandardMaterial) {
  const shader = {
    uniforms: {} as Record<string, { value: number }>,
    vertexShader: '#include <uv_vertex>',
    fragmentShader: '#include <map_fragment>',
  };
  mat.onBeforeCompile(shader as any, {} as any);
  return shader;
}

test('white clamshell variants share one program and carry their crop and rim side as uniforms', () => {
  // Three reuses a compiled program for every material with the same cache key.
  // With the crop baked into the source, the first variant compiled (an
  // uncropped placeholder or back) served the cropped fronts too, and covers
  // showed shrunk inside bars on all four sides.
  const front = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  const back = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  applyWhiteBorderShader(front, 0.0084);
  applyWhiteBorderShader(back, 0, 'left');
  assert.equal(front.customProgramCacheKey(), back.customProgramCacheKey());
  const f = compile(front), b = compile(back);
  assert.equal(f.fragmentShader, b.fragmentShader);
  assert.equal(f.vertexShader, b.vertexShader);
  assert.equal(f.uniforms.uWhiteRimCropX.value, 0.0084);
  assert.equal(f.uniforms.uWhiteRimLeft.value, 0);
  assert.equal(b.uniforms.uWhiteRimCropX.value, 0);
  assert.equal(b.uniforms.uWhiteRimLeft.value, 1);
  assert.doesNotMatch(f.fragmentShader, /0\.0084/);
});

test('the white clamshell window is within two percent of a 2:3 poster', () => {
  const poster = 0.445 / 0.667; // CASE_DIMS.dvd, the poster's authored face
  const window = whiteClamshellWindowAspect();
  assert.ok(Math.abs(window / poster - 1) < 0.02, `window ${window} vs poster ${poster}`);
});
