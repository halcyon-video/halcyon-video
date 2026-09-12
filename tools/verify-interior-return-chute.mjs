// Actual StoreScene photographs; adapted from verify-hatchback.mjs.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root=new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'/tmp/interior-chute-verification'),label=process.argv[3]||'after',theme=process.argv[4]||'bb-1993',preset=process.argv[5]||'standard';mkdirSync(out,{recursive:true});
const port=6219,html=resolve(root,'tools/verify-interior-return-chute.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try{
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:800px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1200,height:800});page.on('pageerror',e=>console.log(e.message));
await page.goto(`http://localhost:${port}/tools/verify-interior-return-chute.html`);await page.waitForFunction(()=>!!window.boot);
await page.evaluate(({theme,preset})=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_theme:theme,bb_storefront:preset,bb_quality:'high',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day',bb_day_sky:'mall_parking_lot',bb_sun_azimuth:'-35',bb_sun_elevation:'40',bb_sun_warmth:'0'}).forEach(([k,v])=>localStorage.setItem(k,v));},{theme,preset});
if(label==='before'){await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/models/interior-return-chute.glb')?r.abort():r.continue());}
console.log('Booting store');await page.evaluate(()=>window.boot());console.log('Store ready');
if(label==='after')await page.waitForFunction(()=>window.store.scene.getObjectByName('interior-return-chute-model'));
await delay(1500);
const metrics=await page.evaluate(()=>{
const s=window.store,T=window.T;
const model=s.scene.getObjectByName('interior-return-chute');
window.kioskCenter=new T.Box3().setFromObject(model).getCenter(new T.Vector3());
let triangles=0,draws=0;model.traverseVisible(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;draws++;if(!o.geometry.attributes.uv)throw Error('Missing UV');}});
const b=new T.Box3().setFromObject(model);return {triangles,draws,min:b.min.toArray(),max:b.max.toArray(),width:s.getStoreWidth()};});
writeFileSync(resolve(out,label+'-cost.json'),JSON.stringify(metrics,null,2));
for(const [name,offset] of [['front',[1.8,.2,6]],['side',[5,.4,2]],['rear',[-3,2,-5]],['context',[-6,3,9]],['close',[.8,.7,2.7]]]){
await page.evaluate(({offset})=>{const s=window.store,c=window.kioskCenter;const v=new window.T.Vector3(...offset).applyAxisAngle(new window.T.Vector3(0,1,0),s.scene.getObjectByName('interior-return-chute').rotation.y); const [dx,dy,dz]=v.toArray();const x=c.x+dx,y=c.y+dy,z=c.z+dz;s.teleportWalk(x,z,Math.atan2(dx,dz)*180/Math.PI,-Math.atan2(dy,Math.hypot(dx,dz))*180/Math.PI,y,true);s.requestRender();},{offset});await delay(1200);await page.screenshot({path:resolve(out,label+'-'+name+'.png')});console.log('Captured',name);}
if(label==='after') {
 await page.evaluate(()=>{const s=window.store; s.entrance.dropReturnedTapes([{id:'returned',title:'Returned tape',year:1993,genres:[]}],performance.now());s.entrance.debugFreezeReturnDrop(1150);s.requestRender();});
 await delay(1200); await page.screenshot({path:resolve(out,'after-return.png')});
 await page.evaluate(()=>{window.store.entrance.debugFreezeReturnDrop(1500);window.store.requestRender();});
 await delay(1200); await page.screenshot({path:resolve(out,'after-depth.png')});

 const lifecycle=await page.evaluate(async()=>{
  const T=window.T,L=window.L;
  const {installReturnSlotModel}=await import('/src/entrance/return-slot-model.ts');
  const template=(await new L().loadAsync('/models/interior-return-chute.glb')).scene;
  const original=L.prototype.load;let pending;
  L.prototype.load=function(url,success,progress,error){pending={success,error};};
  function fixture(){const scene=new T.Scene(),parent=new T.Group(),fallback=new T.Group(),mat=new T.MeshStandardMaterial();scene.add(parent);parent.add(fallback);let refresh=0;const handle=installReturnSlotModel({scene,requestRender:()=>refresh++,requestShadowRefresh:()=>{}},parent,[fallback],'#1844bb');return {scene,parent,fallback,mat,handle,refresh:()=>refresh};}
  function payload(){const root=template.clone(true);let resources=0,releases=0;root.traverse(o=>{if(!o.isMesh)return;o.geometry=o.geometry.clone();o.material=o.material.clone();for(const r of [o.geometry,o.material]){resources++;r.addEventListener('dispose',()=>releases++);}});return {scene:root,resources, released:()=>releases};}
  try {
   const late=fixture(),lateModel=payload();late.handle.dispose();late.handle.dispose();pending.success(lateModel);
   if(lateModel.released()!==lateModel.resources||late.refresh()||late.parent.children.length!==1)throw Error('Late load leaked/adopted');
   late.mat.dispose();
   const offline=fixture();pending.error(Error('Intentional 404'));
   if(!offline.fallback.visible||offline.parent.children.length!==1||offline.refresh())throw Error('Missing asset lost fallback');offline.handle.dispose();offline.mat.dispose();
   const malformed=fixture(),bad=payload();bad.scene.scale.setScalar(2);pending.success(bad);
   if(!malformed.fallback.visible||bad.released()!==bad.resources||malformed.parent.children.length!==1)throw Error('Malformed asset lost fallback');malformed.handle.dispose();malformed.mat.dispose();
   const live=fixture(),model=payload();pending.success(model);
   const installed=live.parent.getObjectByName('interior-return-chute-model');
   if(!installed||installed.children.length!==4||live.fallback.visible||live.refresh()!==1)throw Error('Atomic install failed');
   live.handle.setOpen(true);
   if(Math.abs(installed.getObjectByName('ChuteFlap').rotation.x-Math.PI/2)>.001)throw Error('Flap failed to retract');
   live.handle.setOpen(false);
   let released=0,sharedDisposed=0;const owned=new Set();
   installed.traverse(o=>{if(o.isMesh){owned.add(o.geometry);if(o.material!==live.mat){owned.add(o.material);for(const v of Object.values(o.material))if(v instanceof T.Texture)owned.add(v);}}});
   for(const r of owned)r.addEventListener('dispose',()=>released++);
   live.mat.addEventListener('dispose',()=>sharedDisposed++);
   live.handle.dispose();live.handle.dispose();
   if(released!==owned.size||sharedDisposed||live.parent.getObjectByName('interior-return-chute-model'))throw Error('Ownership or idempotent cleanup failed');live.mat.dispose();
   return {lateLoadResources:lateModel.resources,lateLoadReleased:lateModel.released(),offlineFallback:true,malformedFallback:true,atomicInstall:true,ownedResourcesReleased:released,borrowedMaterialPreserved:true,refreshes:1};
  }finally{L.prototype.load=original;const {disposeDetachedModel}=await import('/src/model-resources.ts');disposeDetachedModel(template);}
 });
 writeFileSync(resolve(out,'lifecycle.json'),JSON.stringify(lifecycle,null,2));
}
console.log(label,metrics);
}finally{await browser?.close();server.kill();unlinkSync(html);}
