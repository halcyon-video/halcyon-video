import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

test('twin-monitor tower preserves its floor envelope, wire supports and outward CRT faces',async()=>{
  // Geometry-only Node check; actual packed finishes are inspected in the browser.
  (globalThis as any).self=globalThis;
  const original=T.TextureLoader.prototype.load;
  T.TextureLoader.prototype.load=function(_url,onLoad){const t=new T.Texture();queueMicrotask(()=>onLoad?.(t));return t;};
  try {
    const bytes=readFileSync(new URL('../public/models/twin-crt-tower.glb',import.meta.url));
    assert.ok(bytes.length<1_500_000);
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    scene.updateMatrixWorld(true);let triangles=0,draws=0;
    scene.traverse(o=>{if(!(o instanceof T.Mesh))return;draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
      for(const key of ['position','normal','uv']){const a=o.geometry.getAttribute(key);assert.ok(a&&Array.from(a.array).every(Number.isFinite));}
    });assert.ok(triangles<20_000&&draws<=10);
    const bounds=new T.Box3().setFromObject(scene);assert.ok(bounds.min.y>=-1e-6&&bounds.max.y<=8.3);
    assert.ok(bounds.min.x>=-1.4&&bounds.max.x<=1.4&&bounds.min.z>=-.75&&bounds.max.z<=.75);
    for(const y of [.9,1.79,2.68,3.57,4.46,5.35]){
      const hit=new T.Raycaster(new T.Vector3(0,y+.2,.2),new T.Vector3(0,-1,0)).intersectObject(scene,true)[0];
      assert.ok(hit&&Math.abs(hit.point.y-y)<.025,`wire support at ${y}`);
    }
    for(const x of [-.605,.605]){
      const hit=new T.Raycaster(new T.Vector3(x,6.934,2),new T.Vector3(0,0,-1)).intersectObject(scene,true)[0];
      assert.ok(hit&&hit.point.z>.5,'monitor faces the customer');
    }
    const mats=new Set<T.Material>();scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));}});
    mats.forEach(m=>{for(const v of Object.values(m))if(v instanceof T.Texture)v.dispose();m.dispose();});
  }finally{T.TextureLoader.prototype.load=original;}
});
