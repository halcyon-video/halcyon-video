// Run Vite on REEL_CHECK_PORT first. Real flat-store consumer, fallback and resize.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
const out=resolve(process.env.REEL_CHECK_OUT || 'scratch/projection-reel');mkdirSync(out,{recursive:true});
const b=await puppeteer.launch({headless:true,args:['--no-sandbox']});
try {
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.evaluateOnNewDocument(()=>{localStorage.clear();localStorage.setItem('bb_render_mode','flat');});
 await p.setViewport({width:1440,height:1000});
 await p.goto(`http://localhost:${process.env.REEL_CHECK_PORT||4245}/?demo=1`,{waitUntil:'networkidle2'});
 await p.waitForFunction(()=>{const i=document.querySelector('.flat-awning-bg');return i?.complete&&i.naturalWidth===1920;});
 assert.match(await p.$eval('.flat-awning-bg',e=>e.src),/awning-projection-reel/);
 await p.screenshot({path:resolve(out,'after.png')});
 await p.$('.flat-awning').then(e=>e.screenshot({path:resolve(out,'awning-detail.png')}));
 await p.setViewport({width:800,height:800});await p.screenshot({path:resolve(out,'after-compact.png')});
 await p.setRequestInterception(true);p.on('request',r=>r.resourceType()==='image'&&r.url().includes('awning-projection-reel')?void r.abort():void r.continue());
 await p.reload({waitUntil:'networkidle2'});
 await p.waitForFunction(()=>{const i=document.querySelector('.flat-awning-bg');return i?.complete&&i.naturalWidth===1920&&i.src.includes('awning-film-strip');});
 await p.screenshot({path:resolve(out,'fallback.png')});assert.deepEqual(errors,[]);
 // Inspect the actual exported mesh in WebGL from useful non-front views.
 await p.setViewport({width:900,height:900});
 await p.evaluate(async()=>{
  const source=await (await fetch('/src/entrance/counter-model.ts')).text();
  const THREE=await import(source.match(/from ["']([^"']*three[^"']*)["']/)[1]);
  const {GLTFLoader}=await import(source.match(/from ["']([^"']*GLTFLoader[^"']*)["']/)[1]);
  const model=(await new GLTFLoader().loadAsync('/models/projection-reel.glb')).scene;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#263140');scene.add(model);
  scene.add(new THREE.HemisphereLight(0xffffff,0x343849,3));
  const key=new THREE.DirectionalLight(0xffffff,4);key.position.set(2,3,4);scene.add(key);
  const fill=new THREE.DirectionalLight(0xc8dcff,3);fill.position.set(-2,-3,-1);scene.add(fill);
  const r=new THREE.WebGLRenderer({antialias:true});r.setSize(900,900);
  document.body.replaceChildren(r.domElement);document.body.style.margin='0';
  const c=new THREE.PerspectiveCamera(35,1,.01,20);
  window.reelView=(pos)=>{c.position.set(...pos);c.lookAt(0,0,0);r.render(scene,c);};
  window.reelCleanup=()=>{model.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});r.dispose();};
 });
 for(const [view,pos] of [['front',[0,3,0.001]],['side',[3,.3,.3]],['rear',[.8,-3,.5]]]){
  await p.evaluate(pos=>window.reelView(pos),pos);await p.screenshot({path:resolve(out,'runtime-'+view+'.png')});
 }
 await p.evaluate(()=>window.reelCleanup());assert.deepEqual(errors,[]);
 // Inspect exported glTF buffers: bounds, UVs and draw cost, no opaque cutout decals.
 const data=readFileSync('public/models/projection-reel.glb');
 const gltf=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
 let triangles=0;
 for(const m of gltf.meshes)for(const q of m.primitives){assert.ok(q.attributes.TEXCOORD_0!==undefined);triangles+=gltf.accessors[q.indices].count/3;}
 assert.equal(gltf.meshes.length,3);assert.equal(gltf.materials.length,2);assert.equal(gltf.images,undefined);
 const a=gltf.accessors.filter(a=>a.type==='VEC3'&&a.min&&a.max);
 const bounds=[0,1,2].map(i=>[Math.min(...a.map(a=>a.min[i])),Math.max(...a.map(a=>a.max[i]))]);
 assert.ok(Math.abs(bounds[0][1]-bounds[0][0]-1.25)<.001);
 writeFileSync(resolve(out,'verification.json'),JSON.stringify({triangles,glbBytes:data.length,meshes:gltf.meshes.map(m=>m.name),materials:gltf.materials.map(m=>m.name),bounds,uv:true,textureImages:0,fallback:true,pageErrors:errors},null,2)+'\n');
} finally {await b.close();}
