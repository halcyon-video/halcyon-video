// Actual StoreScene photographs; adapted from verify-hatchback.mjs.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root=new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'/tmp/curb-kit-verification'),label=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const port=6295,html=resolve(root,'tools/verify-curb-kit.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try{
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:800px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1200,height:800});page.on('pageerror',e=>console.log(e.message));
await page.goto(`http://localhost:${port}/tools/verify-curb-kit.html`);await page.waitForFunction(()=>!!window.boot);
await page.evaluate(()=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_theme:'bb-2000',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day',bb_day_sky:'mall_parking_lot',bb_sun_azimuth:'-35',bb_sun_elevation:'40',bb_sun_warmth:'0'}).forEach(([k,v])=>localStorage.setItem(k,v));});
if(label==='before'){await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/models/curb-kit.glb')?r.abort():r.continue());}
console.log('Booting store');await page.evaluate(()=>window.boot());console.log('Store ready');
await page.waitForFunction(()=>{const g=window.store.scene.getObjectByName('exteriorEnvironment');return g?.children.find(o=>o.type==='Group'&&o.children.length===5)?.children.every(s=>s.children.length===2);},{timeout:30000});
if(label==='after')await page.waitForFunction(()=>window.store.scene.getObjectByName('Blender concrete edges')?.children.length===3);
await delay(1500);
const metrics=await page.evaluate(()=>{
const s=window.store,T=window.T,kit=s.scene.getObjectByName('Blender concrete edges');
return {width:s.getStoreWidth(),batches:kit?.children.map(o=>{const b=new T.Box3().setFromObject(o);return {role:o.name,triangles:o.geometry.index.count/3,vertices:o.geometry.attributes.position.count,min:b.min.toArray(),max:b.max.toArray()};}),roadFallbackVisible:s.scene.getObjectByName('Road edge fallback').visible};});
writeFileSync(resolve(out,label+'-cost.json'),JSON.stringify(metrics,null,2));
for(const [name,position,target] of [['inside',[8,5.5,11],[8,0,23]],['threshold',[15,1.1,17],[11,0,15]],['sidewalk-side',[64,1.5,23],[58.4,0,21.6]],['road',[22,2,67],[11,0,62.5]],['lot-corner',[-33,1.2,65],[-29.5,0,62]],['rear-edge',[-32,1,30],[-29.5,0,45]]]){
await page.evaluate(({position,target})=>{const s=window.store,[x,y,z]=position,[tx,ty,tz]=target;s.teleportWalk(x,z,Math.atan2(x-tx,z-tz)*180/Math.PI,-Math.atan2(y-ty,Math.hypot(x-tx,z-tz))*180/Math.PI,y,true);s.requestRender();},{position,target});await delay(700);await page.screenshot({path:resolve(out,label+'-'+name+'.png')});console.log('Captured',name);}
if(label==='after') {
 const lifecycle=await page.evaluate(async()=>{
  const T=window.T,L=window.L;
  const {installCurbKit}=await import('/src/curb-kit.ts');
  const template=(await new L().loadAsync('/models/curb-kit.glb')).scene;
  const original=L.prototype.load;let pending;
  L.prototype.load=function(url,success,progress,error){pending={success,error};};
  const bounds={centerX:11,minX:-29.5,maxX:51.5,frontZ:15,farZ:62};
  function fixture(){const scene=new T.Scene(),parent=new T.Group(),fallback=new T.Group(),mat=new T.MeshStandardMaterial();scene.add(parent);parent.add(fallback);let refresh=0;const handle=installCurbKit(parent,bounds,94.8,4.7,[fallback],mat,()=>refresh++);return {scene,parent,fallback,mat,handle,refresh:()=>refresh};}
  function payload(){const root=template.clone(true);let resources=0,releases=0;root.traverse(o=>{if(!o.isMesh)return;o.geometry=o.geometry.clone();o.material=o.material.clone();for(const r of [o.geometry,o.material]){resources++;r.addEventListener('dispose',()=>releases++);}});return {scene:root,resources, released:()=>releases};}
  try {
   const late=fixture(),lateModel=payload();late.handle.dispose();late.handle.dispose();pending.success(lateModel);
   if(lateModel.released()!==lateModel.resources||late.refresh()||late.parent.children.length!==1)throw Error('Late load leaked/adopted');
   late.mat.dispose();
   const offline=fixture();pending.error(Error('Intentional 404'));
   if(!offline.fallback.visible||offline.parent.children.length!==1||offline.refresh())throw Error('Missing asset lost fallback');offline.handle.dispose();offline.mat.dispose();
   const malformed=fixture(),bad=payload();bad.scene.children[0].name='Invalid';pending.success(bad);
   if(!malformed.fallback.visible||bad.released()!==bad.resources||malformed.parent.children.length!==1)throw Error('Malformed asset lost fallback');malformed.handle.dispose();malformed.mat.dispose();
   const live=fixture(),model=payload();pending.success(model);
   const installed=live.parent.getObjectByName('Blender concrete edges');
   if(!installed||installed.children.length!==3||live.fallback.visible||live.refresh()!==1||model.released()!==model.resources)throw Error('Atomic install failed');
   let released=0,sharedDisposed=0;const owned=new Set();
   installed.traverse(o=>{if(o.isMesh){owned.add(o.geometry);if(o.material!==live.mat)owned.add(o.material);}});
   for(const r of owned)r.addEventListener('dispose',()=>released++);
   live.mat.addEventListener('dispose',()=>sharedDisposed++);
   live.handle.dispose();live.handle.dispose();
   if(released!==owned.size||sharedDisposed||live.parent.getObjectByName('Blender concrete edges'))throw Error('Ownership or idempotent cleanup failed');live.mat.dispose();
   return {lateLoadResources:lateModel.resources,lateLoadReleased:lateModel.released(),offlineFallback:true,malformedFallback:true,atomicInstall:true,ownedResourcesReleased:released,borrowedMaterialPreserved:true,refreshes:1};
  }finally{L.prototype.load=original;const {disposeDetachedModel}=await import('/src/model-resources.ts');disposeDetachedModel(template);}
 });
 writeFileSync(resolve(out,'lifecycle.json'),JSON.stringify(lifecycle,null,2));
}
console.log(label,metrics);
}finally{await browser?.close();server.kill();unlinkSync(html);}
