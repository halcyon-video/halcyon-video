import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { curbKitPlan } from '../src/curb-kit-plan.ts';

const blob=readFileSync(new URL('../public/models/curb-kit.glb',import.meta.url));
const gltf=JSON.parse(blob.subarray(20,20+blob.readUInt32LE(12)).toString());
const binStart=28+blob.readUInt32LE(12);
function attribute(index:number) {
  const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView];
  const width={SCALAR:1,VEC2:2,VEC3:3}[a.type as 'SCALAR'|'VEC2'|'VEC3']!;
  const size=a.componentType===5126?4:2;
  return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>{
    const offset=binStart+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||width*size)+j*size;
    return a.componentType===5126?blob.readFloatLE(offset):blob.readUInt16LE(offset);
  }));
}
test('concrete export is bounded, UV mapped, outward facing and inexpensive',()=>{
  assert.equal(gltf.meshes.length,5);assert.equal(gltf.materials.length,3);
  assert.ok(blob.length<20000);assert.equal(gltf.images,undefined);
  let triangles=0;
  for(const mesh of gltf.meshes){
    const p=mesh.primitives[0],pos=attribute(p.attributes.POSITION),uv=attribute(p.attributes.TEXCOORD_0),idx=attribute(p.indices).flat();
    assert.equal(uv.length,pos.length);assert.ok(uv.flat().every(Number.isFinite));
    let volume=0;
    for(let i=0;i<idx.length;i+=3){
      const [a,b,c]=idx.slice(i,i+3).map(k=>pos[k]);
      const u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);
      const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      assert.ok(Math.hypot(...cross)>1e-9,`${mesh.name} degenerate face`);
      volume+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
    }
    assert.ok(volume>0,`${mesh.name} outward orientation`);
    const a=gltf.accessors[p.attributes.POSITION];
    if(mesh.name.startsWith('Sidewalk'))assert.ok(Math.abs(a.max[1])<1e-6,'threshold stays at floor Y=0');
    if(mesh.name==='GutterSpan')assert.ok(Math.abs(a.max[2]-1.6)<1e-6,'gutter reaches existing road start');
    if(mesh.name==='GutterSpan') {
      const top=pos.filter(v=>v[1]>-.05);
      assert.ok(top.every(v=>v[1]>-.035),'pan stays above the ground fade');
    }
    triangles+=idx.length/3;
  }
  assert.equal(triangles,134);
});
test('all lot widths keep road endpoints and sidewalk return joints',()=>{
  for(const lotWidth of [63,81])for(const depth of [4.7,6.5]){
    const minX=11-lotWidth/2,maxX=11+lotWidth/2;
    const plan=curbKitPlan({centerX:11,minX,maxX,frontZ:15,farZ:62},94.8,depth);
    const gutter=plan.filter(p=>p.part==='GutterSpan');
    assert.equal(gutter[0].x,minX-70);
    assert.ok(Math.abs(gutter.at(-1)!.x+gutter.at(-1)!.length-(maxX+70))<1e-9);
    assert.ok(gutter.every(p=>p.z===62.4)); // road still begins at 64 ft
    for(let i=1;i<gutter.length;i++)assert.ok(Math.abs(gutter[i-1].x+gutter[i-1].length-gutter[i].x)<1e-9);
    const slab=plan.find(p=>p.part==='SidewalkSpan')!;
    const ends=plan.filter(p=>p.part==='SidewalkReturn');
    assert.equal(slab.x,ends[0].x+.2);
    assert.ok(Math.abs(slab.x+slab.length-(ends[1].x-.2))<1e-9);
    assert.ok([slab,...ends].every(p=>p.z===15&&p.depth===depth));
    const junctions=plan.filter(p=>p.part==='CurbJunction');
    assert.deepEqual(junctions.map(p=>p.x),[minX-.2,maxX-.2]);
    const sides=plan.filter(p=>p.yaw===-Math.PI/2);
    assert.ok(sides.every(p=>Math.abs(p.x-(minX+.2))<1e-6||Math.abs(p.x-(maxX+.2))<1e-6));
    assert.ok(Math.abs(Math.max(...sides.map(p=>p.z+p.length))-62)<1e-9);
  }
});
