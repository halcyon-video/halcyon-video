import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('cone canopy export has grounded tapered supports, UVs and named finishes', async () => {
  const bytes=await readFile(new URL('../public/models/storefront-entry-cone-canopy.glb',import.meta.url));
  assert(bytes.length<300_000);
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const bounds=new THREE.Box3().setFromObject(scene);
  assert(Math.abs(bounds.min.y)<1e-6);
  assert(Math.abs(bounds.max.y-18.2)<1e-5);
  assert(Math.abs(bounds.max.z-11.56)<1e-5);
  const roles=new Set<string>(); let triangles=0, cones=0;
  scene.traverse(obj=>{
    if (!(obj instanceof THREE.Mesh)) return;
    const g=obj.geometry, m=obj.material as THREE.Material;
    roles.add(m.name);
    for(const attribute of ['position','normal','uv']) {
      assert(g.getAttribute(attribute));
      assert(Array.from(g.getAttribute(attribute).array).every(Number.isFinite));
    }
    triangles+=(g.index?.count ?? g.getAttribute('position').count)/3;
    if(obj.name.includes('turned_cone')) {
      cones++;
      const p=g.getAttribute('position'); const cx=obj.name.startsWith('Left')?-9.5:9.5;
      for(let i=0;i<p.count;i++) {
        const y=p.getY(i),radius=Math.hypot(p.getX(i)-cx,p.getZ(i)-10);
        if(Math.abs(y-.55)<1e-5) assert(Math.abs(radius-.43)<1e-5,'narrow shaft foot');
        if(Math.abs(y-7.72)<1e-5) assert(Math.abs(radius-1.08)<1e-5,'inverted taper');
        assert(radius<=1.45001,'capital stays beneath canopy');
      }
    }
    g.dispose();m.dispose();
  });
  assert.equal(cones,2);
  assert(triangles<8000);
  assert.deepEqual([...roles].sort(),['FacadeCoping','FacadeDownlight','FacadeSlate','FacadeSoffit']);
});
