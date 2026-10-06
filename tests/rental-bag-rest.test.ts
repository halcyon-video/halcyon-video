import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('authored bag data retains the solver binding, floor pins and die-cut envelope',()=>{
 const data=JSON.parse(readFileSync(new URL('../src/model-data/rental-bag-rest.json',import.meta.url),'utf8'));
 assert.equal(data.nodeCount,340);assert.equal(data.nodes.length,1020);assert.ok(data.nodes.every(Number.isFinite));
 for(let i=0;i<13;i++){
  assert.equal(data.nodes[i*3+1],.02,'front floor pin');
  if(i>0&&i<12)assert.equal(data.nodes[(169+i-1)*3+1],.02,'back floor pin');
 }
 for(const n of [325,339])assert.equal(data.nodes[n*3+1],1.76,'handle top datum');
 assert.equal(data.bottomIndices.length,66);assert.ok(data.bottomIndices.every((i:number)=>Number.isInteger(i)&&i>=0&&i<26));
 const b=readFileSync(new URL('../public/models/rental-bag-rest.glb',import.meta.url));assert.ok(b.length<40_000);
 const gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
 assert.ok(['MASK','BLEND'].includes(gltf.materials[0].alphaMode),'handle cutout survives export');
 assert.equal(gltf.materials[0].doubleSided,true,'thin film visible from inside');
 const primitives=gltf.meshes.flatMap((m:any)=>m.primitives);assert.equal(primitives.length,1);
 assert.equal(gltf.accessors[primitives[0].indices].count/3,646);
 assert.ok(primitives.every((p:any)=>p.attributes.NORMAL!==undefined&&p.attributes.TEXCOORD_0!==undefined));
});
