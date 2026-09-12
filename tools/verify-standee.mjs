// Real StoreScene photographs, using the established verify-bollards harness.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
import {checkStandeeLifecycle} from './check-standee-lifecycle.mjs';
const detailsOnly=process.argv[4]==='details-only';
const out=resolve(process.argv[2]||'scratch/standee'),label=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const port=6243,html=resolve('tools/verify-standee.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try {
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:900px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:240},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1990,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:'',collectionName:i<6?'Winter Tales':undefined}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;window.fixture=window.store.slottedFixtures.find(f=>f.placement.kind==='collection-endcap');};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1200,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://localhost:${port}/tools/verify-standee.html`);await page.waitForFunction(()=>!!window.boot);
await page.evaluate(()=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_theme:'hv-90s',bb_quality:'medium',bb_ssao:'0',bb_tv_demo_loop:'0',bb_promo_date:'2026-12-10',bb_outside:'day'}).forEach(([k,v])=>localStorage.setItem(k,v));});
await page.evaluate(()=>window.boot());console.log('Store ready');await page.waitForFunction(()=>!!window.fixture);await delay(2000);
if(label==='after') await page.waitForFunction(()=>window.fixture.group.getObjectByName('standee-construction')?.getObjectByName('display-model'));
if(!detailsOnly) for(const [name,pos,target] of [['front',[0,7,8],[0,6.3,0]],['rear',[2,7,-6],[0,6.4,0]],['edge',[4,6.7,.3],[0,6.3,0]],['join',[1.8,5.5,1.6],[.4,5.1,0]]]) {
 await page.evaluate(({pos,target})=>{const s=window.store,g=window.fixture.group;g.updateWorldMatrix(true,false);const p=g.localToWorld(new window.T.Vector3(...pos)),c=g.localToWorld(new window.T.Vector3(...target));s.teleportWalk(p.x,p.z,Math.atan2(p.x-c.x,p.z-c.z)*180/Math.PI,-Math.atan2(p.y-c.y,Math.hypot(p.x-c.x,p.z-c.z))*180/Math.PI,p.y,true);s.requestRender();},{pos,target});await delay(700);await page.screenshot({path:resolve(out,label+'-'+name+'.png')});
}
if(label==='after') {
 writeFileSync(resolve(out,'lifecycle.json'),JSON.stringify(await checkStandeeLifecycle(page),null,2));
 const cost=await page.evaluate(()=>{const root=window.fixture.group.getObjectByName('standee-construction');let triangles=0,draws=0;root.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;draws++;}});const b=new window.T.Box3().setFromObject(root);return {triangles,draws,worldBounds:{min:b.min.toArray(),max:b.max.toArray()}};});
 writeFileSync(resolve(out,'runtime-cost.json'),JSON.stringify(cost,null,2));
 // Additional transparent product views use the real exported/installed geometry.
 await page.evaluate(async()=>{
  const T=window.T,kit=window.fixture.group.getObjectByName('standee-construction').parent;
  const model=kit.clone(true);model.position.set(0,0,0);model.rotation.set(0,0,0);
  for(const o of model.children)o.position.y-=4.6;
  const floor=(await new window.L().loadAsync('/models/standee-support-floor.glb')).scene;
  window.store.destroy();
  const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x60503c,3));
  const light=new T.DirectionalLight(0xffffff,3);light.position.set(2,5,3);scene.add(light);
  const fill=new T.DirectionalLight(0xffffff,2);fill.position.set(-2,3,-4);scene.add(fill);
  const r=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});r.setSize(900,900);r.setClearColor(0,0);
  const camera=new T.PerspectiveCamera(40,1,.01,50);
  window.alphaView=(kind,pos,target)=>{scene.remove(model,floor);scene.add(kind==='floor'?floor:model);camera.position.set(...pos);camera.lookAt(...target);r.render(scene,camera);return r.domElement.toDataURL('image/png');};
 });
 for(const [name,kind,pos,target] of [
  ['alpha-front','header',[0,2,6],[0,1.9,0]],
  ['alpha-edge','header',[7,2,-.8],[0,1.9,0]],
  ['alpha-back','header',[1.5,2,-6],[0,1.9,0]],
  ['floor-rear','floor',[2.5,2.8,-5.5],[0,1.5,-.4]],
  ['floor-lock','floor',[1.3,1,-1.5],[0,.55,-.3]],
 ]) {const png=await page.evaluate(({kind,pos,target})=>window.alphaView(kind,pos,target),{kind,pos,target});writeFileSync(resolve(out,name+'.png'),Buffer.from(png.split(',')[1],'base64'));}
}
assert.deepEqual(errors,[]);console.log(label+' photographs captured');
} finally {await browser?.close();server.kill();unlinkSync(html);}
