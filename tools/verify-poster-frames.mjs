// Adapted from verify-ceiling-luminaire.mjs: actual StoreScene photographs.
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const out=resolve(process.argv[2]||'/tmp/poster-frames'), phase=process.argv[3]||'after';
mkdirSync(out,{recursive:true});
const port=6290, html=resolve('tools/verify-poster-frames.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser;
try {
 writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:900px"></div><script type="module">
 import * as THREE from '/node_modules/three/build/three.module.js'; window.T=THREE;
 window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');
 const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2006,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:'',castPeople:[{id:'actor'+i%12,name:'Actor '+i%12,imageUrl:'/latest_movie_poster.png'}]}));
 window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
 for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.setViewport({width:1200,height:900});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.message);});page.on('console',m=>{if(m.text().includes('[wall-decor]'))console.log(m.text());});
 await page.goto(`http://localhost:${port}/tools/verify-poster-frames.html`);await page.waitForFunction(()=>!!window.boot);
 await page.evaluate(({format,theme})=>{localStorage.clear();Object.entries({bb_store_format:format,bb_theme:theme,bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_ceiling:'high',bb_walldecor:'1',bb_marquee_bulbs:'1',bb_outside:'day'}).forEach(([k,v])=>localStorage.setItem(k,v));},{format:process.env.FRAME_FORMAT||'corporate',theme:process.env.FRAME_THEME||'bb-2000'});
 if(phase==='fallback'){await page.setRequestInterception(true);page.on('request',r=>r.url().includes('poster-frame-')&&r.url().endsWith('.glb')?r.abort():r.continue());}
 await page.evaluate(()=>window.boot());await delay(4000);
 const evidence=await page.evaluate(()=>{
  const s=window.store,T=window.T;
  window.targets={window:s.posterMarqueeFrames[0].anchor};
  s.scene.traverse(o=>{if(o.isMesh&&o.geometry.type==='PlaneGeometry'&&Math.abs(o.position.z-.065)<.0001&&!window.targets.wall)window.targets.wall=o;});
  return {windows:s.posterMarqueeFrames.length,wall:!!window.targets.wall,models:s.scene.getObjectsByProperty('name','display-model').filter(o=>o.userData.posterFrameVariant).length};
 });
 if(!evidence.wall)throw Error('No wall portrait in evidence scene');
 if(phase!=='before'&&phase!=='fallback')assert.equal(evidence.models,evidence.windows+6);
 if(phase==='fallback')assert.equal(evidence.models,0);
 if(phase==='detail'){
  evidence.marquee=await page.evaluate(async()=>{
   const s=window.store,T=window.T;
   localStorage.setItem('bb_quality','medium');
   const {buildMarqueeBulbs}=await import('/src/store-shell.ts');
   buildMarqueeBulbs(s,s.getStoreWidth(),s.backWallZ);localStorage.setItem('bb_quality','low');
   const frames=s.posterMarqueeFrames,mesh=s.marqueeBulbsMesh;
   let index=mesh.count-frames.reduce((n,f)=>n+2*Math.round(f.width/.5)+2*Math.round(f.height/.5),0),maxError=0;
   for(const f of frames){
    const inverse=f.anchor.matrixWorld.clone().invert(),m=new T.Matrix4();
    for(let j=0;j<2*Math.round(f.width/.5)+2*Math.round(f.height/.5);j++){
     mesh.getMatrixAt(index++,m);const p=new T.Vector3().setFromMatrixPosition(m).applyMatrix4(inverse);
     maxError=Math.max(maxError,Math.abs(p.z-.16),Math.min(Math.abs(Math.abs(p.x)-f.width/2),Math.abs(Math.abs(p.y)-f.height/2)));
    }
    const normal=new T.Vector3(0,0,1).transformDirection(f.anchor.matrixWorld),p=f.anchor.getWorldPosition(new T.Vector3());
    if(normal.dot(new T.Vector3(11,p.y,-2).sub(p))<=0)throw Error('Outward-facing frame');
   }
   s.requestRender();return {frames:frames.length,maxError};
  });
  assert.ok(evidence.marquee.maxError<.00001);
 }

 for(const kind of ['window','wall'])for(const view of (phase==='detail'?['front','corner']:['front','side','rear'])){
  if(kind==='wall'&&view==='rear')continue;
  await page.evaluate(({kind,view})=>{
   const s=window.store,T=window.T,a=window.targets[kind];a.updateWorldMatrix(true,false);
   const c=a.getWorldPosition(new T.Vector3()),q=a.getWorldQuaternion(new T.Quaternion());
   if(kind==='window'&&a.isMesh)q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI));
   if(view==='corner')c.add(new T.Vector3(kind==='window'?1.3:1.56,kind==='window'?1.875:2.35,0).applyQuaternion(q));
   const offset=new T.Vector3(...({corner:[1,.4,1.5],front:[1,.3,8],side:[6,.4,2.4],rear:[3,.5,-7]}[view])).applyQuaternion(q),p=c.clone().add(offset);
   s.teleportWalk(p.x,p.z,Math.atan2(offset.x,offset.z)*180/Math.PI,-Math.atan2(offset.y,Math.hypot(offset.x,offset.z))*180/Math.PI,p.y,true);s.requestRender();
  },{kind,view});await delay(700);await page.screenshot({path:resolve(out,`${phase}-${kind}-${view}.png`)});
 }
 assert.deepEqual(errors,[]);
 evidence.pageErrors=errors;writeFileSync(resolve(out,`${phase}.json`),JSON.stringify(evidence,null,2));console.log(evidence);
} finally {await browser?.close();server.kill();unlinkSync(html);}
