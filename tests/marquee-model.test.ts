import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('marquee export preserves compact dimensions, UVs and material roles',()=>{
 const data=readFileSync(new URL('../public/models/marquee-bulb.glb',import.meta.url));
 const g=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
 assert.deepEqual(g.materials.map((m:any)=>m.name).sort(),['BulbGlass','NickelNeck','PorcelainSocket']);
 assert.equal(g.images,undefined);
 let tris=0; const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
 for(const m of g.meshes)for(const p of m.primitives){
   assert.notEqual(p.attributes.TEXCOORD_0,undefined); assert.notEqual(p.attributes.NORMAL,undefined);
   tris+=g.accessors[p.indices].count/3;
   const a=g.accessors[p.attributes.POSITION];
   for(let i=0;i<3;i++){mins[i]=Math.min(mins[i],a.min[i]);maxs[i]=Math.max(maxs[i],a.max[i]);}
 }
 assert.ok(tris<=320);assert.ok(data.length<24000);
 assert.ok(Math.abs(maxs[0]-mins[0]-.09)<1e-6);
 assert.ok(Math.abs(mins[2]+.085)<1e-6);assert.ok(Math.abs(maxs[2]-.045)<1e-6);
});
