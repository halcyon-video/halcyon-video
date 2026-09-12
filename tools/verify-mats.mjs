// StoreScene photography harness adapted from verify-hatchback.mjs.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
import { readdirSync } from 'node:fs';
import { checkMatLifecycle } from './check-mat-lifecycle.mjs';

if (readdirSync('public/user-assets').some(p => p !== 'README.md')) throw Error('Public photographs require no private user-assets');
const root=new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'/tmp/mat-verification'),label=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const port=6222,html=resolve(root,'tools/verify-mats.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try{
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1000px;height:700px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1000,height:700});page.on('pageerror',e=>console.log(e.message));
await page.goto(`http://localhost:${port}/tools/verify-mats.html`);await page.waitForFunction(()=>!!window.boot);
await page.evaluate((label)=>{localStorage.clear();Object.entries({bb_store_format:label==='single'?'mom-and-pop':'corporate',bb_theme:'bb-2000',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day'}).forEach(([k,v])=>localStorage.setItem(k,v));},label);
console.log('Booting store');await page.evaluate(()=>window.boot());console.log('Store ready');
await delay(2500);
if(label==='before' && await page.evaluate(()=>!!window.store.scene.getObjectByName('entranceWalkOffMats'))) throw Error('Before photographs require the original entrance implementation');
if(label!=='before') await page.waitForFunction(()=>window.store.scene.getObjectByName('entranceWalkOffMats')?.getObjectByName('walk-off-mat-model'));
if(label!=='before') writeFileSync(resolve(out,'lifecycle.json'),JSON.stringify(await checkMatLifecycle(page),null,2));
const anchor=[13.025,0,11.8];
const views=label==='single' ? [['single',[-2,5.5,-2.4],[-2,0,2]]] : label==='details' ? [['whole',[-2,6.5,2.5],[-2,0,-.3]],['eye',[2.8,5.5,2.2],[1.8,0,0]]] : [['passages',[-2,5,1.3],[-2,0,0]],['side',[-1.7,.38,.6],[0,.012,0]],['rear',[.7,.5,-2.6],[0,.012,-1.7]]];
for(const [name,offset,target] of views){
 await page.evaluate(({anchor,offset,target,label})=>{const s=window.store;s.camera.fov=label==='details'?95:60;s.camera.updateProjectionMatrix();const p=anchor.map((v,i)=>v+offset[i]),c=anchor.map((v,i)=>v+target[i]);s.teleportWalk(p[0],p[2],Math.atan2(p[0]-c[0],p[2]-c[2])*180/Math.PI,-Math.atan2(p[1]-c[1],Math.hypot(p[0]-c[0],p[2]-c[2]))*180/Math.PI,p[1],true);s.requestRender();},{anchor,offset,target,label});await delay(900);{ const png=await page.evaluate(()=>{window.debugResetResScale();return window.store.captureFeedbackSnapshot().png;});writeFileSync(resolve(out,label+'-'+name+'.png'),Buffer.from(png.split(',')[1],'base64')); }console.log('Captured',name);
}
if(label!=='before') {
 const integration=await page.evaluate(()=>{const T=window.T,g=window.store.scene.getObjectByName('entranceWalkOffMats'),m=g.getObjectByName('walk-off-mat-model');return {dimensions:g.userData.dimensions,visibleFallback:g.getObjectByName('walk-off-mat-fallback').visible,bounds:m.children.map(o=>{const b=new T.Box3().setFromObject(o);return {min:b.min.toArray(),max:b.max.toArray()};})};});
 writeFileSync(resolve(out,label+'-integration.json'),JSON.stringify(integration,null,2));
}
console.log(label,anchor);
}finally{await browser?.close();server.kill();unlinkSync(html);}
