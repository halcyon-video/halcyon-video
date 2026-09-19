import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { compileProgramsInStages } from '../src/program-warmup.ts';

function rig(retire: boolean) {
  let reflected=0, polls=0;
  const program:any={program:{},getUniforms(){assert.ok(program.program);reflected++;},getAttributes(){assert.ok(program.program);reflected++;}};
  const gl={getExtension(){return {COMPLETION_STATUS_KHR:99};},isContextLost(){return false;},getProgramParameter(handle:unknown){
    assert.ok(handle,'never query a deleted program handle');polls++;
    if(retire){queueMicrotask(()=>{program.program=undefined;});return false;}return true;
  }};
  const renderer:any={info:{programs:[program]},getContext:()=>gl,getRenderTarget:()=>null,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,
    autoClear:true,localClippingEnabled:false,shadowMap:{needsUpdate:true},setRenderTarget(){},render(){},compile(){}};
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));
  return {renderer,scene,stats:()=>({reflected,polls})};
}
test('model retirement during a yielded shader poll finishes without querying a deleted program',{timeout:1000},async t=>{
 const controller=new AbortController();t.after(()=>controller.abort());
 const r=rig(true);await compileProgramsInStages(r.renderer,r.scene,new THREE.PerspectiveCamera(),null,controller.signal);
 assert.deepEqual(r.stats(),{reflected:0,polls:1});assert.equal(r.renderer.autoClear,true);assert.equal(r.renderer.localClippingEnabled,false);
});
test('live programs still finish their uniform and attribute preparation',async()=>{
 const r=rig(false);await compileProgramsInStages(r.renderer,r.scene,new THREE.PerspectiveCamera(),null,new AbortController().signal);
 assert.deepEqual(r.stats(),{reflected:2,polls:1});
});
