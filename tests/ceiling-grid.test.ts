import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { moduleGridPlan, polygonGridPlan } from '../src/ceiling-grid-plan.ts';
import { installCeilingGrid } from '../src/ceiling-grid.ts';

const loadKit=async()=>{
  const bytes=fs.readFileSync(new URL('../public/models/ceiling-grid.glb',import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
};
test('module grid deduplicates rails and follows missing modules and variable field sizes',()=>{
  for(const [cols,rows] of [[1,1],[3,4],[17,29]]){
    const centers=Array.from({length:cols*rows},(_,i)=>({x:(i%cols+.5)*5,z:(Math.floor(i/cols)+.5)*2.5}));
    const plan=moduleGridPlan(centers,5,2.5);
    assert.equal(plan.spans.length,cols*(rows+1)+rows*(cols+1));
    assert.equal(plan.spans.filter(s=>s.edge).length,2*(cols+rows));
    assert.equal(new Set(plan.spans.map(s=>[JSON.stringify(s.a),JSON.stringify(s.b)].sort().join('|'))).size,plan.spans.length);
    if(cols>1){
      centers.pop();const cut=moduleGridPlan(centers,5,2.5);
      assert.ok(!cut.spans.some(s=>s.a.x===cols*5&&s.b.x===cols*5&&Math.min(s.a.z,s.b.z)===(rows-1)*2.5));
    }
  }
  assert.deepEqual(moduleGridPlan([],5,2.5),{spans:[],joints:[]});
});
test('diagonal and trapezoid soffit grids clip to the lid and retain troffer phase',()=>{
  for(const poly of [[{x:-8,z:10},{x:0,z:-8},{x:8,z:10}], [{x:-8,z:10},{x:-3,z:-5},{x:3,z:-5},{x:8,z:10}]]){
    const plan=polygonGridPlan(poly,{x:.5,z:1.25},5,2.5);
    const inside=(p:{x:number;z:number})=>poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return (b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x)>-1e-7;});
    for(const s of plan.spans){assert.ok(inside(s.a));assert.ok(inside(s.b));}
    for(const j of plan.joints){assert.ok(Math.abs((j.x-.5)/5-Math.round((j.x-.5)/5))<1e-7);assert.ok(Math.abs((j.z-1.25)/2.5-Math.round((j.z-1.25)/2.5))<1e-7);}
    assert.equal(plan.spans.filter(s=>s.edge).length,poly.length);
  }
  assert.deepEqual(polygonGridPlan([],{x:0,z:0},5,2.5),{spans:[],joints:[]});
});
test('runtime export has bounded cost, named roles, UVs and recessed tile contact',async()=>{
  const {scene}=await loadKit();scene.updateMatrixWorld(true);
  const roles=new Set<string>();let triangles=0;
  for(const name of ['TBar','CrossTee','EdgeAngle','TileRim']){
    const mesh=scene.getObjectByName(name) as THREE.Mesh;assert.ok(mesh?.isMesh);
    const geo=mesh.geometry;assert.equal(geo.getAttribute('uv').count,geo.getAttribute('position').count);
    const uv=geo.getAttribute('uv'),index=geo.index!;
    for(let i=0;i<index.count;i+=3){
      const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
      const area=(uv.getX(b)-uv.getX(a))*(uv.getY(c)-uv.getY(a))-(uv.getY(b)-uv.getY(a))*(uv.getX(c)-uv.getX(a));
      assert.ok(Math.abs(area)>1e-10,`${name} has a collapsed UV triangle`);
    }
    for(const n of geo.getAttribute('normal').array)assert.ok(Number.isFinite(n));
    triangles+=geo.index!.count/3;roles.add((mesh.material as THREE.Material).name);
  }
  assert.deepEqual([...roles].sort(),['AcousticFiber','GridPaint']);assert.ok(triangles<250);
  const tile=new THREE.Box3().setFromObject(scene.getObjectByName('TileRim')!);
  const bar=new THREE.Box3().setFromObject(scene.getObjectByName('TBar')!);
  assert.ok(Math.abs(tile.max.x-tile.min.x-4.88)<1e-5);
  assert.ok(Math.abs(tile.max.z-tile.min.z-2.38)<1e-5);
  assert.ok(tile.min.y>bar.min.y,'recessed face above exposed rail');
  assert.ok(bar.max.y<=.111&&bar.min.y>=-.076);
});
test('installer retains fallback on failure; batches, refreshes and discards late resources',async()=>{
  const original=GLTFLoader.prototype.load,originalTexture=THREE.TextureLoader.prototype.load;
  let textureReady:(texture:THREE.Texture)=>void=()=>{};
  THREE.TextureLoader.prototype.load=function(_url,onLoad){textureReady=onLoad!;return new THREE.Texture();};
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{value:{},configurable:true});
  let success:Parameters<GLTFLoader['load']>[1]=()=>{},failure:Parameters<GLTFLoader['load']>[3];
  GLTFLoader.prototype.load=function(_url,onLoad,_progress,onError){success=onLoad;failure=onError;};
  try{
    const parent=new THREE.Scene(),paint=new THREE.MeshStandardMaterial(),fallback=new THREE.Group();parent.add(fallback);
    let refreshes=0,borrowedDisposed=0;paint.addEventListener('dispose',()=>borrowedDisposed++);
    const options={parent,plan:moduleGridPlan([{x:2.5,z:1.25},{x:7.5,z:1.25}],5,2.5),y:13.5,paint,fallback:[fallback],refresh:()=>refreshes++};
    const failed=installCeilingGrid(options);failure?.(new Error('offline'));assert.equal(fallback.visible,true);failed.removeFromParent();
    const live=installCeilingGrid(options);success(await loadKit());
    assert.equal(fallback.visible,false);assert.equal(refreshes,1);assert.equal(live.userData.loaded,true);
    assert.equal(live.children.filter(o=>o instanceof THREE.InstancedMesh).length,2);
    const edge=live.getObjectByName('EdgeAngle') as THREE.Mesh;
    const bounds=new THREE.Box3().setFromObject(edge);assert.ok(bounds.min.x>=-1e-6&&bounds.max.x<=10.000001);assert.ok(bounds.min.z>=-1e-6&&bounds.max.z<=2.500001);
    live.removeFromParent();assert.equal(borrowedDisposed,0,'runtime must not dispose borrowed finishes');
    const late=installCeilingGrid(options),model=await loadKit();let disposed=0;
    (model.scene.getObjectByName('TBar') as THREE.Mesh).geometry.addEventListener('dispose',()=>disposed++);
    late.removeFromParent();success(model);assert.equal(disposed,1);assert.equal(refreshes,1);
    const fiber=new THREE.MeshStandardMaterial(),textured=installCeilingGrid({...options,fiber,tiles:[{x:2.5,z:1.25}]});
    success(await loadKit());const grain=new THREE.Texture();let grainDisposed=0;grain.addEventListener('dispose',()=>grainDisposed++);
    textureReady(grain);assert.equal(((textured.getObjectByName('TileRim') as THREE.Mesh).material as THREE.MeshStandardMaterial).map,grain);
    textured.removeFromParent();assert.equal(grainDisposed,1);
    const lateTexture=installCeilingGrid({...options,fiber,tiles:[{x:2.5,z:1.25}]});success(await loadKit());lateTexture.removeFromParent();
    const lateGrain=new THREE.Texture();let lateGrainDisposed=0;lateGrain.addEventListener('dispose',()=>lateGrainDisposed++);textureReady(lateGrain);assert.equal(lateGrainDisposed,1);
    const expectedRefreshes=refreshes;
    const teardown=installCeilingGrid(options),sentinel=teardown.children[0] as THREE.Mesh;
    sentinel.geometry.dispose();success(await loadKit());assert.equal(teardown.children.length,1);assert.equal(refreshes,expectedRefreshes);
  }finally{GLTFLoader.prototype.load=original;THREE.TextureLoader.prototype.load=originalTexture;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});
