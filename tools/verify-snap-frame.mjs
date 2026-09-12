// Adapted from verify-ceiling-luminaire.mjs: actual StoreScene photographs.
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { createServer } from 'vite';
import { checkSnapFrameLifecycle } from './check-snap-frame-lifecycle.mjs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const out=resolve(process.argv[2]||'/tmp/snap-frame'), phase=process.argv[3]||'after';
mkdirSync(out,{recursive:true});
const port=6295, html=resolve('tools/verify-snap-frame.html');
const server=await createServer({cacheDir:resolve(out,'vite-cache'),server:{port,strictPort:true,hmr:false}});await server.listen();
let browser;
try {
 writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:900px"></div><script type="module">
 import * as THREE from 'three'; import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'; window.T=THREE;window.L=GLTFLoader;
 window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');
 const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2006,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:'',castPeople:[{id:'actor'+i%12,name:'Actor '+i%12,imageUrl:'/latest_movie_poster.png'}]}));
 window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
 for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.setViewport({width:1200,height:900});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.message);});page.on('console',m=>{if(m.text().includes('[wall-decor]'))console.log(m.text());});
 await page.goto(`http://localhost:${port}/tools/verify-snap-frame.html`);await page.waitForFunction(()=>!!window.boot);
 await page.evaluate(({format,theme})=>{localStorage.clear();Object.entries({bb_store_format:format,bb_theme:theme,bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_ceiling:'high',bb_walldecor:'1',bb_marquee_bulbs:'1',bb_outside:'day'}).forEach(([k,v])=>localStorage.setItem(k,v));},{format:process.env.FRAME_FORMAT||'corporate',theme:process.env.FRAME_THEME||'hv-90s'});
 if(phase==='fallback'||phase==='before'){await page.setRequestInterception(true);page.on('request',r=>r.url().includes('wire-snap-frame')&&r.url().endsWith('.glb')?r.abort():r.continue());}
 await page.evaluate(()=>window.boot());console.log('Store ready');await delay(4000);

 const evidence=await page.evaluate(()=>{
  const s=window.store;
  window.target=s.activeSignageObjects.find(g=>g.children.some(o=>o.isMesh&&o.geometry.type==='PlaneGeometry'&&Math.abs(o.position.z-.02)<.00001)&&g.children.some(o=>o.isMesh&&o.geometry.type==='CylinderGeometry')) || s.activeSignageObjects.find(g=>g.name==='wire-snap-frame'&&g.userData.hasPost);
  if(!window.target)throw Error('No register snap frame');
  let triangles=0,draws=0;window.target.traverseVisible(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;draws++;}});
  return {anchor:window.target.position.toArray(),triangles,draws,loaded:!!window.target.getObjectByName('display-model')};
 });
 if(phase==='after')assert.ok(evidence.loaded);
 if(phase==='fallback')assert.equal(evidence.loaded,false);
 for(const [view,offset,target] of [['context',[1.5,1.3,4],[0,.65,0]],['front',[.7,.25,1.25],[0,.78,0]],['side',[1.7,.2,.35],[0,.65,0]],['rear',[.6,.25,-1.8],[0,.7,0]],['foot',[.5,.32,.6],[0,.17,0]]]){
  await page.evaluate(({offset,target})=>{
   const s=window.store,T=window.T,a=window.target;a.updateWorldMatrix(true,false);
   const c=a.localToWorld(new T.Vector3(...target)),p=a.localToWorld(new T.Vector3(...target).add(new T.Vector3(...offset))),d=p.clone().sub(c);
   s.teleportWalk(p.x,p.z,Math.atan2(d.x,d.z)*180/Math.PI,-Math.atan2(d.y,Math.hypot(d.x,d.z))*180/Math.PI,p.y,true);s.requestRender();
  },{offset,target});await delay(700);await page.screenshot({path:resolve(out,`${phase}-${view}.png`)});
  if(phase==='after'){
   await page.evaluate(()=>{for(const g of window.store.activeSignageObjects)if(g.name==='wire-snap-frame'){g.getObjectByName('display-model').visible=false;g.getObjectByName('display-fallback').visible=true;}window.store.requestRender();});await delay(700);await page.screenshot({path:resolve(out,`before-${view}.png`)});
   await page.evaluate(()=>{for(const g of window.store.activeSignageObjects)if(g.name==='wire-snap-frame'){g.getObjectByName('display-model').visible=true;g.getObjectByName('display-fallback').visible=false;}window.store.requestRender();});
  }

 }
 if(phase==='after')writeFileSync(resolve(out,'lifecycle.json'),JSON.stringify(await checkSnapFrameLifecycle(page),null,2));
 assert.deepEqual(errors,[]);
 evidence.pageErrors=errors;writeFileSync(resolve(out,`${phase}.json`),JSON.stringify(evidence,null,2));console.log(evidence);
} finally {await browser?.close();await server.close();unlinkSync(html);}
