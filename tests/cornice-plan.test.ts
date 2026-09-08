import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {corniceJoints,fitCorniceVertex,CORNICE_MIRROR_HEIGHT,CORNICE_MIRROR_TILT} from '../src/cornice-plan.ts';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
for(const size of [1,2,5]) for(const stepped of [false,true]) for(const square of [false,true]) {
  const l=-25*size,r=25*size,back=-30*size,front=11.2;
  const points=[{x:-16,z:front},{x:l,z:front},{x:l,z:back},{x:r-8,z:back},
    ...(stepped?[{x:r-8,z:back+8},{x:r,z:back+8}]:[{x:r,z:back}]),
    {x:r,z:front},{x:16,z:front},...(square?[{x:7,z:-5.5},{x:-7,z:-5.5}]:[{x:0,z:-8}])];
  test(`size ${size}, step ${stepped}, square ${square}: every trim and mirror level shares its mitre`,()=>{
    const joints=corniceJoints(points);
    for(let i=0;i<joints.length;i++){
      const prev=joints[(i+joints.length-1)%joints.length],p=joints[i],next=joints[(i+1)%joints.length];
      for(const depth of [-1.8,0,.02,CORNICE_MIRROR_HEIGHT*Math.sin(CORNICE_MIRROR_TILT)+.02,.62]){
        const left=fitCorniceVertex(prev,p,1,-2.7,depth),right=fitCorniceVertex(p,next,0,-2.7,depth);
        left.forEach((v,k)=>near(v,right[k]));
        for(const [a,b] of [[prev,p],[p,next]]){
          const len=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
          near((left[0]-p.x)*nx+(left[2]-p.z)*nz,depth);
        }
      }
    }
  });
}
test('cornice GLB is an efficient physical profile with UVs and no baked lighting',async()=>{
  const data=await readFile(new URL('../public/models/ceiling-cornice.glb',import.meta.url));
  assert.ok(data.length<12000);
  const {scene}=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  const bounds=new THREE.Box3().setFromObject(scene);near(bounds.min.x,0);near(bounds.max.x,1);near(bounds.min.y,-2.7);
  let triangles=0;
  scene.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    const g=o.geometry;triangles+=(g.index?.count??g.getAttribute('position').count)/3;
    for(const name of ['position','normal','uv'])assert.ok(Array.from(g.getAttribute(name).array).every(Number.isFinite));
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      assert.ok(m instanceof THREE.MeshStandardMaterial);assert.equal(m.emissive.getHex(),0);
    }
  });
  assert.ok(triangles > 0 && triangles <= 64);
});
