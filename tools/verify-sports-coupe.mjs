// Actual StoreScene captures, following verify-ceiling-luminaire.mjs.
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root = new URL('../', import.meta.url).pathname;
const out = resolve(process.argv[2] || '/tmp/sports-coupe-verification');
const label = process.argv[3] || 'after';
const theme = process.argv[4] || 'bb-2000';
const baseline = label === 'before' ? execFileSync('git', ['show', 'e3e06fc:public/models/car_sports.glb'], {cwd:root}) : null;
mkdirSync(out, {recursive:true});
const port = Number(process.env.COUPE_CHECK_PORT || 6288), html = resolve(root, `tools/verify-sports-coupe-${port}.html`);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], {cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try {
 writeFileSync(html, `<body style="margin:0"><div id="store" style="width:1200px;height:800px"></div><script type="module">
 import * as T from 'three';
 import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
 window.Loader=GLTFLoader;
 import {PARKING_STALLS,buildExteriorEnvironment} from '/src/exterior-environment.ts';
 window.T=T;window.stalls=PARKING_STALLS;window.buildExterior=buildExteriorEnvironment;
 window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};
 </script>`);
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Vite failed');try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
 browser=await puppeteer.launch({headless:true,timeout:90000,protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.setViewport({width:1200,height:800});
 page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
 await page.goto(`http://localhost:${port}/tools/verify-sports-coupe-${port}.html`);
 await page.waitForFunction(()=>!!window.boot);
 await page.evaluate((theme)=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_theme:theme,bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day',bb_day_sky:'park_parking',bb_sun_azimuth:'-65',bb_sun_elevation:'38',bb_sun_warmth:'0.25'}).forEach(([k,v])=>localStorage.setItem(k,v));},theme);
 if(label==='fallback'||baseline) {await page.setRequestInterception(true);page.on('request',r=>r.url().includes('car_sports.glb')?(baseline?r.respond({status:200,contentType:'model/gltf-binary',body:baseline}):r.abort()):r.continue());}
 const metrics={};
 if(label!=='lifecycle'){
 console.log('Booting',label,theme);await page.evaluate(()=>window.boot());console.log('Store ready');
 await page.waitForFunction(()=>{let row;window.store.scene.traverse(o=>{if(o.children.length===5&&o.children.every(c=>Math.abs(c.position.z-(window.stalls.rowFrontZ+window.stalls.depth/2))<.01))row=o;});window.carRow=row;return row&&row.children.every(c=>c.children.length===2);},{timeout:60000});
 await delay(2500);
 Object.assign(metrics,await page.evaluate(()=>{
  const T=window.T,s=window.store,row=window.carRow;
  s.isRendering=false;s.renderer.setPixelRatio(1);s.renderer.setSize(1200,800,false);
  const cost=(root)=>{let triangles=0,draws=0;const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;draws+=Array.isArray(o.material)?o.geometry.groups.length:1;geometries.add(o.geometry);for(const m of [o.material].flat()){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});return {triangles,draws,geometries:geometries.size,materials:materials.size,textures:textures.size};};
  const cars=row.children.map(stall=>{const car=stall.children[1],b=new T.Box3().setFromObject(car);return {stall:stall.position.toArray(),yaw:stall.rotation.y,bounds:{min:b.min.toArray(),max:b.max.toArray()},scale:car.scale.toArray(),rotation:car.rotation.toArray(),...cost(car)};});
  window.capture=(pos,target)=>{s.camera.fov=65;s.camera.updateProjectionMatrix();const p=new T.Vector3(...pos),t=new T.Vector3(...target),d=p.clone().sub(t);s.teleportWalk(p.x,p.z,Math.atan2(d.x,d.z)*180/Math.PI,-Math.atan2(d.y,Math.hypot(d.x,d.z))*180/Math.PI,p.y,true);s.requestRender();};
  return {cars,fullLotCars:cost(row),environmentIntensity:s.scene.environmentIntensity,theme:localStorage.getItem('bb_theme')};
 }));
 const cx=metrics.cars[2].stall[0],cz=metrics.cars[2].stall[2];
 const views={storefront:[[cx-6,5.5,10],[cx,1.2,cz]],lot:[[cx+24,18,cz+23],[cx,1,cz]],rear:[[cx-6,3.5,cz-10],[cx,1.2,cz]],left:[[cx+5.8,2.7,cz],[cx,1.2,cz]],right:[[cx-5.8,2.7,cz],[cx,1.2,cz]],front:[[cx+6,3.5,cz+10],[cx,1.2,cz]],underside:[[cx+5,.12,cz+7],[cx,.7,cz]]};
 for(const [view,[pos,target]] of Object.entries(views)){
  if ((label==='fallback'||theme==='bb-1990') && !['front','storefront','lot'].includes(view)) continue;
  const png=await page.evaluate((a)=>{window.capture(...a);const s=window.store;s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL('image/png');},[pos,target]);
  writeFileSync(resolve(out,`${label}-${view}.png`),Buffer.from(png.split(',')[1],'base64'));
  if(view==='lot')metrics.render=await page.evaluate(()=>{const s=window.store,r=s.renderer;const prev=r.info.autoReset;r.info.autoReset=false;r.info.reset();r.render(s.scene,s.camera);const result={...r.info.render,memory:{...r.info.memory}};r.info.autoReset=prev;return result;});
 }
 }
 metrics.lifecycle=await page.evaluate(async()=>{
  const T=window.T,GLTFLoader=window.Loader;
  const original=GLTFLoader.prototype.load,results={};let pending=[];
  GLTFLoader.prototype.load=function(url,ok,progress,fail){pending.push({ok,fail});return this;};
  const check=(value,message)=>{if(!value)throw Error(message);};
  const source=()=>{const scene=new T.Group(),g=new T.BoxGeometry(2,1,4),texture=new T.Texture(),m=new T.MeshStandardMaterial({map:texture});scene.add(new T.Mesh(g,m));const disposed={geometry:0,material:0,texture:0};g.addEventListener('dispose',()=>disposed.geometry++);m.addEventListener('dispose',()=>disposed.material++);texture.addEventListener('dispose',()=>disposed.texture++);return {scene,disposed,m};};
  try {
   let refreshes=0;const scene=new T.Scene();scene.environmentIntensity=.55;
   const live=window.buildExterior(scene,50,4.7,false,()=>refreshes++),model=source();pending[2].ok(model);
   check(refreshes===1,'Live load failed to refresh');check(Math.abs(model.m.envMapIntensity-.2/.55)<1e-8,'Finish clamp changed');
   const bounds=new T.Box3().setFromObject(model.scene);check(Math.abs(bounds.min.y)<1e-8,'Ground seating changed');
   live.dispose();live.dispose();check(Object.values(model.disposed).every(n=>n===1),'Live resources not released exactly once');results.live={refreshes,disposed:model.disposed};
   pending=[];refreshes=0;const late=window.buildExterior(new T.Scene(),50,4.7,false,()=>refreshes++),lateModel=source();late.dispose();pending[2].ok(lateModel);pending[1].fail(Error('delayed failure'));
   check(refreshes===0,'Removed scene was refreshed');check(Object.values(lateModel.disposed).every(n=>n===1),'Late resources leaked');check(late.group.getObjectByName('Parked cars').children.every(s=>s.children.length===1),'Late fallback adopted');results.late={refreshes,disposed:lateModel.disposed};
   pending=[];refreshes=0;const fallback=window.buildExterior(new T.Scene(),50,4.7,false,()=>refreshes++);pending[2].fail(Error('intentional fallback test'));
   const box=fallback.group.getObjectByName('Parked cars').children[2].children[1];check(box?.isMesh&&refreshes===1,'Fallback missing');const b=new T.Box3().setFromObject(box);check(Math.abs(b.min.y)<1e-6,'Fallback ground contact');let releases=0;box.geometry.addEventListener('dispose',()=>releases++);fallback.dispose();check(releases===1,'Fallback geometry leaked');results.fallback={refreshes,releases};
  }finally{GLTFLoader.prototype.load=original;}
  return results;
 });
 writeFileSync(resolve(out,`${label}.json`),JSON.stringify(metrics,null,2)+'\n');console.log(JSON.stringify(metrics));
} finally {await browser?.close();server.kill();unlinkSync(html);}
