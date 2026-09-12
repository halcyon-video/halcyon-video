// In-store evidence at both existing anchors; run before/after asset changes.
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const out=process.argv[2]||'scratch/candy-rack', privateMode=process.env.CANDY_CHECK_PRIVATE==='1';
mkdirSync(out,{recursive:true});
const html='tools/.candy-photo.html',port=4493;
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1100px;height:850px"></div><script type="module">
import * as T from 'three';window.T=T;window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1990,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.s=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});s.pauseRendering();await s.ready;};</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});let browser;
try{
 for(let i=0;;i++){try{if((await fetch(`http://localhost:${port}`)).ok)break;}catch{}if(i>100)throw Error('Vite timeout');await delay(100);}
 browser=await puppeteer.launch({headless:false,protocolTimeout:180000,args:['--no-sandbox','--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.setViewport({width:1100,height:850});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>{if(r.url().includes('/user-assets/')&&!(privateMode&&r.url().includes('/candy-queue-rack/')))return void r.abort();void r.continue();});
 const evidence={};
 for(const preset of ['standard','usquare-counter']){
 await page.goto(`http://localhost:${port}/${html}`);
 await page.evaluate(p=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_theme:'bb-1990',bb_quality:'high',bb_ssao:'0',bb_tv_demo_loop:'0',bb_storefront:p}).forEach(([k,v])=>localStorage.setItem(k,v));},preset);
 console.log('BOOT',preset);await page.evaluate(()=>boot());console.log('READY',preset);await page.waitForFunction(()=>!!s.scene.getObjectByName('candy-rack-model'));await delay(1000);
 evidence[preset]=await page.evaluate(()=>({violations:(window.__layoutViolations||[]).filter(v=>JSON.stringify(v).includes('candy')),clerkPath:s.debugClerkPathAudit(),clerkAudit:window.__clerkAudit}));
 assert.deepEqual(evidence[preset].violations,[]);console.log('PATH',JSON.stringify(evidence[preset]));
 for(const [view,p]of Object.entries({front:[3.8,5.5,-6],side:[-6,3.6,-.6],rear:[2.5,7,5],contact:[-4,2.5,-1.8]})){
 const png=await page.evaluate(p=>{s.pauseRendering();const g=s.scene.getObjectByName('candy-rack-model').parent;g.updateMatrixWorld(true);s.camera.position.copy(g.localToWorld(new T.Vector3(...p)));s.camera.lookAt(g.localToWorld(new T.Vector3(0,2,0)));s.camera.updateMatrixWorld();s.renderer.shadowMap.needsUpdate=true;s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();},p);
 writeFileSync(`${out}/${preset}-${view}.png`,Buffer.from(png.split(',')[1],'base64'));
 }
 if(preset==='standard') for(const [name,p]of Object.entries({'detail-side':[-6,3,-.5],'detail-rear':[3,4,7]})){
 const png=await page.evaluate(p=>{const model=s.scene.getObjectByName('candy-rack-model').parent.clone(true);model.position.set(0,0,0);model.rotation.set(0,0,0);const scene=new T.Scene();scene.background=new T.Color('#858b91');scene.add(model,new T.HemisphereLight(0xffffff,0x888888,2));const light=new T.DirectionalLight(0xffffff,3);light.position.set(-3,7,5);scene.add(light);const camera=new T.PerspectiveCamera(36,1100/850,.01,100);camera.position.set(...p);camera.lookAt(0,2,0);s.renderer.render(scene,camera);return s.renderer.domElement.toDataURL();},p);
 writeFileSync(`${out}/${name}.png`,Buffer.from(png.split(',')[1],'base64'));
 }
 console.log('PASS photographs',preset);
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/evidence.json`,JSON.stringify({privateMode,evidence,errors},null,2));
}finally{await browser?.close();server.kill();unlinkSync(html);}
