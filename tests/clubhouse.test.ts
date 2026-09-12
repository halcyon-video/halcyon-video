import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StorePlan } from '../src/store-plan.ts';
import { clubhouseEligible, clubhouseFeet, clubhouseHost, childrenChairPlacements } from '../src/fixtures/clubhouse-layout.ts';
import { validateLayout } from '../src/layout-validator.ts';
import { ClerkNavGrid } from '../src/clerk-nav.ts';
import type { Movie, JellyfinLibrary } from '../src/jellyfin.ts';
const movies=Array.from({length:1800},(_,i)=>({id:`family-${i}`,title:`Family ${i}`,genres:['Family'],year:1989,duration:'1h',rating:'G',overview:'',director:'',actors:[],localPath:''} as Movie));
const libraries=[{id:'family',name:'Family',movies} as JellyfinLibrary];
test('only supported 1990 corporate corners admit the host and chairs',()=>{
  for(const era of ['bb-1989','bb-1993','bb-2000','bb-2010','hv-90s','independent']){
    assert.equal(clubhouseEligible(era,'corporate',90,13.5,20),false);
    assert.deepEqual(childrenChairPlacements({...clubhouseHost(-40,-40,20),theme:era}),[]);
  }
  assert.equal(clubhouseEligible('bb-1990','mom-and-pop',90,13.5,20),false);
  assert.equal(clubhouseEligible('bb-1990','corporate',40,13.5,20),false);
  assert.equal(clubhouseEligible('bb-1990','corporate',90,9,20),false);
  assert.equal(clubhouseEligible('bb-1990','corporate',90,13.5,0),false);
  assert.equal(childrenChairPlacements({...clubhouseHost(-40,-40,20),theme:'bb-1990'}).length,1);
});
for(const arrangement of ['straight','diagonal','herringbone'] as const) test(`${arrangement}: reserve corner, retain every aisle/stock transform, reset on era switch`,()=>{
  const plan=new StorePlan(libraries);plan.arrangement=arrangement;plan.plan('bb-1993');
  const units=JSON.stringify(plan.shelvingUnits),oldBack=plan.backWallZ;
  plan.plan('bb-1990');const host=plan.clubhouse!;assert.ok(host);assert.equal(JSON.stringify(plan.shelvingUnits),units);
  assert.equal(host.center.x,11-plan.getStoreWidth()/2+7.2);assert.equal(host.center.z,plan.backWallZ+7.2);
  const solids=clubhouseFeet(host);
  const errors=validateLayout([...solids,...plan.getUnitFootprints()],{minX:11-plan.getStoreWidth()/2,maxX:11+plan.getStoreWidth()/2,minZ:plan.backWallZ,maxZ:15}).filter(v=>v.severity==='error');
  assert.deepEqual(errors,[]);
  // Five-foot turning disk plus the three-foot diagonal approach are open.
  const [placement]=childrenChairPlacements({...host,theme:'bb-1990'});
  const chairs=[-1.15,1.15].map(offset=>({cx:placement.position.x+offset*Math.cos(placement.yaw),cz:placement.position.z-offset*Math.sin(placement.yaw),w:1.16,d:1.13,yaw:placement.yaw,clearance:0}));
  const grid=new ClerkNavGrid({minX:host.center.x-6,maxX:host.center.x+17,minZ:host.center.z-6,maxZ:host.center.z+17},[...solids,...chairs],{cellSize:.1,clearance:.1,wallMargin:0});
  for(let a=0;a<Math.PI*2;a+=.08)assert.ok(grid.isWalkable(host.center.x+1+2.5*Math.cos(a),host.center.z+1.5+2.5*Math.sin(a)));
  assert.ok(grid.findPath(host.center.x+12,host.center.z+12,host.center.x+1,host.center.z+1.5));
  plan.plan('bb-1993');assert.equal(plan.clubhouse,null);assert.equal(plan.backWallZ,oldBack);
});
test('shipped host uses UVs, named materials, modest cost and floor/ceiling bounds',()=>{
  const bytes=readFileSync(new URL('../public/models/clubhouse.glb',import.meta.url));
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.ok(bytes.length<650000);assert.equal(gltf.meshes.length,6);assert.equal(gltf.images?.length??0,0);
  let triangles=0,minY=Infinity,maxY=-Infinity;
  for(const mesh of gltf.meshes)for(const p of mesh.primitives){
    assert.ok(p.attributes.TEXCOORD_0!==undefined);assert.ok(gltf.materials[p.material].name);
    const pos=gltf.accessors[p.attributes.POSITION];minY=Math.min(minY,pos.min[1]);maxY=Math.max(maxY,pos.max[1]);triangles+=gltf.accessors[p.indices].count/3;
  }
  assert.ok(Math.abs(minY)<.001);assert.ok(Math.abs(maxY-10.6)<.001);assert.ok(triangles<9000);
});

test('open side windows transmit a sightline through the exported mesh',async()=>{
  const {GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');
  const {Raycaster,Vector3}=await import('three');
  const bytes=readFileSync(new URL('../public/models/clubhouse.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  for(const [origin,direction] of [[[-3,5.5,9],[0,0,-1]],[[9,5.5,-3],[-1,0,0]]]){
    const hit=new Raycaster(new Vector3(...origin),new Vector3(...direction)).intersectObject(scene,true)[0];
    assert.ok(hit&&hit.distance>15,'first visible surface must be the far room wall, beyond the open window');
  }
});

test('upper paint band meets the wall stripe and finish UVs retain physical scale',()=>{
  const bytes=readFileSync(new URL('../public/models/clubhouse.glb',import.meta.url));
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const top=(role:string)=>Math.max(...gltf.meshes.flatMap((m:any)=>m.primitives)
    .filter((p:any)=>gltf.materials[p.material].name===role)
    .map((p:any)=>gltf.accessors[p.attributes.POSITION].max[1]));
  const wallTop=13.5-2.7-.5;
  assert.ok(Math.abs(top('HeaderPaint')-wallTop)<.0001);
  assert.ok(Math.abs(top('EdgePaint')-(wallTop-1/3))<.0001);
  for(const mesh of gltf.meshes)for(const p of mesh.primitives){
    const uv=gltf.accessors[p.attributes.TEXCOORD_0];
    const view=gltf.bufferViews[uv.bufferView];
    const start=20+bytes.readUInt32LE(12)+8+(view.byteOffset??0)+(uv.byteOffset??0);
    const values=Array.from({length:uv.count*2},(_,i)=>bytes.readFloatLE(start+i*4));
    assert.ok(Math.max(...values)-Math.min(...values)>10,'physical UVs must not be packed to 0..1');
  }
});

 test('chairs face the corner wedge console and leave viewing clearance',()=>{
  const host=clubhouseHost(0,0,20);
  const [chair]=childrenChairPlacements({...host,theme:'bb-1990'});
  const cabinet=clubhouseFeet(host).find(f=>f.label.endsWith('tv-cabinet'))!;
  // Diagonal chairs facing the wedge (yaw is -135 degrees)
  assert.ok(Math.abs(Math.sin(chair.yaw) - Math.sin(-3*Math.PI/4)) < .001);
  assert.ok(Math.abs(chair.position.z-cabinet.cz) > 2.0); // No longer aligned to Z
  assert.ok(chair.position.x-cabinet.cx > 2.0);
  assert.equal(cabinet.yaw,0); // Footprint yaw is 0 now
});
