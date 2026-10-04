import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitCasePlaceholder } from '../src/case-placeholder-fit.ts';
test('wide game placeholders contain the sleeve, reuse their material, and release it with the source', () => {
  const base = new THREE.MeshStandardMaterial({map: new THREE.Texture()});
  const fitted = fitCasePlaceholder(base, 1.4, 0.7);
  assert.notEqual(fitted, base);
  assert.equal(fitCasePlaceholder(base, 1.4, 0.7), fitted);
  const shader = { uniforms: {}, fragmentShader: '#include <map_fragment>' } as any;
  fitted.onBeforeCompile(shader, {} as any);
  assert.equal(shader.uniforms.uFallbackAspect.value, 2);
  assert.match(shader.fragmentShader, /fallbackUv.x.*uFallbackAspect/);
  let disposed = false; fitted.addEventListener('dispose', () => { disposed = true; });
  base.dispose(); assert.equal(disposed, true);
});
