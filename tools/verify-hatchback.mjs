// Actual StoreScene photographs and full five-stall geometry costs.
import {mkdirSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root=new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'/tmp/hatchback-verification'),label=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const port=6287,html=resolve(root,'tools/verify-hatchback.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try{
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:800px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1200,height:800});page.on('pageerror',e=>console.log(e.message));
await page.goto(`http://localhost:${port}/tools/verify-hatchback.html`);await page.waitForFunction(()=>!!window.boot);
await page.evaluate(()=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_theme:'bb-2000',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day'}).forEach(([k,v])=>localStorage.setItem(k,v));});
if(label==='before'){await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/models/car_hatchback.glb')?r.respond({status:200,contentType:'model/gltf-binary',body:readFileSync('/tmp/car-hatchback-before.glb')}):r.continue());}
console.log('Booting store');await page.evaluate(()=>window.boot());console.log('Store ready');
await page.waitForFunction(()=>{const g=window.store.scene.getObjectByName('exteriorEnvironment');return g?.children.find(o=>o.type==='Group'&&o.children.length===5)?.children.every(s=>s.children.length===2);},{timeout:30000});
await delay(1500);
const metrics=await page.evaluate(()=>{const T=window.T,g=window.store.scene.getObjectByName('exteriorEnvironment').children.find(o=>o.type==='Group'&&o.children.length===5);window.cars=g;const result=[];g.children.forEach(s=>{const m=s.children[1],b=new T.Box3().setFromObject(m);let triangles=0,draws=0;const mats=new Set(),geos=new Set(),textures=new Set();m.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;draws+=o.geometry.groups.length||1;geos.add(o.geometry.uuid);for(const mat of Array.isArray(o.material)?o.material:[o.material]){mats.add(mat.uuid);for(const v of Object.values(mat))if(v?.isTexture)textures.add(v.uuid);}});result.push({min:b.min.toArray(),max:b.max.toArray(),triangles,draws,materials:mats.size,geometries:geos.size,textures:textures.size,yaw:s.rotation.y});});return result;});
writeFileSync(resolve(out,label+'-cost.json'),JSON.stringify(metrics,null,2));
for(const [name,offset,target] of (process.argv.includes('--lifecycle-only')?[]:[['lot',[18,12,32],[0,0,0]],['front',[7,5,11],[0,0,0]],['rear',[-7,5,-11],[0,0,0]],['left',[-12,3,0],[0,0,0]],['right',[12,3,0],[0,0,0]],['inside',[-6,3,-43],[0,0,0]]])){
await page.evaluate(({name,offset})=>{const s=window.store,T=window.T,b=new T.Box3().setFromObject(window.cars.children[1].children[1]);const c=b.getCenter(new T.Vector3());if(name==='lot')c.copy(new T.Box3().setFromObject(window.cars).getCenter(new T.Vector3()));const p=c.clone().add(new T.Vector3(...offset));s.teleportWalk(p.x,p.z,Math.atan2(p.x-c.x,p.z-c.z)*180/Math.PI,-Math.atan2(p.y-c.y,Math.hypot(p.x-c.x,p.z-c.z))*180/Math.PI,p.y,true);s.requestRender();},{name,offset});await delay(700);await page.screenshot({path:resolve(out,label+'-'+name+'.png')});console.log('Captured',name);}
if(label==='after'){
 const lifecycle=await page.evaluate(async()=>{
 const {buildExteriorEnvironment}=await import('/src/exterior-environment.ts');
 const GLTFLoader=window.L;
 const T=window.T,original=GLTFLoader.prototype.load;let pending=[];
 // Scope this car regression to car loads; other exterior fixtures have their own lifecycle checks.
 GLTFLoader.prototype.load=function(url,success,progress,error){if(!/\/car_(?:hatchback|sedan|sports)\.glb$/.test(url))return original.call(this,url,success,progress,error);pending.push({success,error});};
 try{
 let refresh=0,released=0;const scene=new T.Scene();
 const late=buildExteriorEnvironment(scene,40,4.7,false,()=>refresh++);
 late.dispose();late.dispose();
 for(const cb of pending){const g=new T.BoxGeometry(2,2,4),t=new T.Texture(),m=new T.MeshStandardMaterial({map:t});for(const r of [g,m,t])r.addEventListener('dispose',()=>released++);const model=new T.Group();model.add(new T.Mesh(g,m));cb.success({scene:model});}
 // Each exterior GLB request (cars and shared lamp family) owns three mock resources.
 if(released!==pending.length*3||refresh!==0||scene.children.length)throw Error('Late-load cleanup failed');
 pending=[];const fallback=buildExteriorEnvironment(scene,40,4.7,false,()=>refresh++);
 pending.forEach(cb=>cb.error(new Error('Intentional verification failure')));
 const cars=fallback.group.children.find(o=>o.type==='Group'&&o.children.length===5);
 if(!cars.children.every(s=>s.children.length===2)||refresh!==5)throw Error('Fallback placement/refresh failed');
 fallback.dispose();return {lateResourcesDisposed:released,lateRefreshes:0,fallbackCars:5,fallbackRefreshes:refresh,idempotentDispose:true};
 }finally{GLTFLoader.prototype.load=original;}
 });
 writeFileSync(resolve(out,'lifecycle.json'),JSON.stringify(lifecycle,null,2));
}
console.log(label,metrics);
}finally{await browser?.close();server.kill();unlinkSync(html);}
