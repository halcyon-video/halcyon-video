import test from 'node:test';
import assert from 'node:assert/strict';
import { fitFacadeEntryVertex } from '../src/storefront-entry-fit.ts';

test('gabled pier stays centered on its projecting base across entry widths', () => {
  for (const [ceiling, half, opening] of [[12,8,7.2],[16,10.8,8.3],[20,13,9.5]]) {
    for (const sign of [-1,1]) for (const y of [0,2]) {
      const x = (a: number) => fitFacadeEntryVertex(sign*a,y,ceiling,half,opening,'gabled-brick')[0];
      const shaft = [x(7.6),x(10.35)].sort((a,b)=>a-b);
      const base = [x(7.5),x(10.45)].sort((a,b)=>a-b);
      assert.ok(Math.abs((shaft[0]+shaft[1])-(base[0]+base[1]))<1e-8);
      assert.ok(Math.abs(shaft[0]-base[0]-.1)<1e-8);
      assert.ok(Math.abs(base[1]-shaft[1]-.1)<1e-8);
      assert.ok(Math.abs(shaft[1]-shaft[0]-2.75)<1e-8);
    }
  }
});


test('exported entry sill meets the front wing without a masonry gap', async () => {
  const { readFileSync } = await import('node:fs');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const THREE = await import('three');
  const bytes = readFileSync(new URL('../public/models/storefront-entry-gabled-brick.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  for(const y of [1.6,4]) {
    const right=new THREE.Raycaster(new THREE.Vector3(15,y,.1),new THREE.Vector3(-1,0,0)).intersectObject(scene,true);
    const left=new THREE.Raycaster(new THREE.Vector3(-15,y,.1),new THREE.Vector3(1,0,0)).intersectObject(scene,true);
    assert.ok(right.length && left.length,'both knee and vertical jamb are solid');
    for(const [half,opening] of [[8,7.2],[10.8,8.3],[13,9.5]]) {
      assert.ok(Math.abs(fitFacadeEntryVertex(right[0].point.x,y,16,half,opening,'gabled-brick')[0]-half)<1e-5);
      assert.ok(Math.abs(fitFacadeEntryVertex(left[0].point.x,y,16,half,opening,'gabled-brick')[0]+half)<1e-5);
    }
  }
});
