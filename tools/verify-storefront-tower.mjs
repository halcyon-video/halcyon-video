// Actual StoreScene photographs; adapted from verify-hatchback.mjs.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root=new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'/tmp/storefront-tower-verification'),label=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const facade=process.argv[4]||'gabled-brick';
const port=6294,html=resolve(root,'tools/verify-storefront-tower.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try{
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:800px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1200,height:800});page.on('pageerror',e=>console.log(e.message));
await page.goto(`http://localhost:${port}/tools/verify-storefront-tower.html`);await page.waitForFunction(()=>!!window.boot);
await page.evaluate((facade)=>{localStorage.clear();Object.entries({bb_facade:facade,bb_store_format:'corporate',bb_window_awnings:'1',bb_theme:'halcyon',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day',bb_day_sky:'mall_parking_lot',bb_sun_azimuth:'-35',bb_sun_elevation:'40',bb_sun_warmth:'0'}).forEach(([k,v])=>localStorage.setItem(k,v));},facade);
if(label==='letters') await page.evaluate(()=>localStorage.setItem('bb_logo',JSON.stringify({storefront:{mode:'letters',extrudeDepth:.15,letterHeightFt:2}})));
if (label==='checks') {
 const checks=await page.evaluate(async()=>{const {checkStorefront}=await import('/tools/storefront-tower-checks.js');return checkStorefront(window.T,window.L);});
 writeFileSync(resolve(out,'integration-checks.json'),JSON.stringify(checks,null,2));console.log(checks);
} else {
console.log('Booting store');await page.evaluate(()=>window.boot());console.log('Store ready');
await page.waitForFunction(()=>window.store.scene.getObjectByName('storefrontEntryModel')?.getObjectByName('display-model'));
await page.waitForFunction(()=>window.store.scene.getObjectByName('storefrontWindowAwnings')?.getObjectByName('display-model'));
await delay(1500);
const metrics=await page.evaluate(()=>{
const s=window.store,T=window.T;
return {width:s.getStoreWidth(),groups:['storefrontEntryModel','storefrontWindowAwnings'].map(name=>{const g=s.scene.getObjectByName(name),bounds=new T.Box3().setFromObject(g);let triangles=0,meshes=0;g.traverse(o=>{if(o.isMesh&&o.parent.name==='display-model'){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});return {name,triangles,meshes,min:bounds.min.toArray(),max:bounds.max.toArray()};})};});
writeFileSync(resolve(out,label+'-cost.json'),JSON.stringify(metrics,null,2));
if(label==='letters') {
  const placement=await page.evaluate(()=>{
    const s=window.store,T=window.T,group=s.scene.getObjectByName('storefrontLogo3D');
    if(!group || group.children.length!==2) throw Error('Expected two wall letter rows');
    group.updateMatrixWorld(true);
    const boxes=group.children.map(row=>new T.Box3().setFromObject(row));
    for(const b of boxes) {
      if(b.min.z<15.79 || b.max.z>16.1 || b.min.y<13.4 || b.max.y>16.4) throw Error('Letters lost upper wall plane');
      if(!(b.max.x<-.4 || b.min.x>22.4)) throw Error('Letters overlap canopy');
    }
    return boxes.map(b=>({min:b.min.toArray(),max:b.max.toArray()}));
  });
  writeFileSync(resolve(out,'letters-placement.json'),JSON.stringify(placement,null,2));
}
const views=facade==='cone-canopy' ? [['front',[11,9,62],[11,11,22]],['side',[40,13,39],[11,11,22]],['roof',[27,30,36],[11,15,21]],['underside',[12,5,18],[11,9.2,23]],['rear',[3,7,17],[11,8,25]]] : [['front',[11,8,64],[11,12,19]],['side',[39,14,35],[12,14,19]],['roof',[23,29,27],[11,19,18]],['underside',[12,6,18],[11,9.2,20]],['rear',[2,25,10],[11,19,17]],['awning-end',[30,13,24],[23,11,18]],['awning-underside',[25,7,17],[26,9.3,18]]];
for(const [name,position,target] of views){
await page.evaluate(({position,target})=>{const s=window.store,[x,y,z]=position,[tx,ty,tz]=target;s.teleportWalk(x,z,Math.atan2(x-tx,z-tz)*180/Math.PI,-Math.atan2(y-ty,Math.hypot(x-tx,z-tz))*180/Math.PI,y,true);window.debugResetResScale?.();s.requestRender();},{position,target});await delay(2500);await page.screenshot({path:resolve(out,label+'-'+name+'.png')});console.log('Captured',name);}
if(facade==='cone-canopy') {
  await page.evaluate(()=>{const s=window.store;s.setOutsideMode('night');s.teleportWalk(40,39,Math.atan2(29,17)*180/Math.PI,-Math.atan2(2,Math.hypot(29,17))*180/Math.PI,13,true);window.debugResetResScale?.();s.requestRender();});
  await delay(2500);await page.screenshot({path:resolve(out,label+'-night.png')});
  await page.evaluate(()=>{
    const s = window.store;
    s.setOutsideMode('day');
    localStorage.setItem('bb_cone_canopy_finish', 'full-slate');
  });
  await page.goto(page.url());
  await page.waitForFunction(()=>!!window.boot);
  await page.evaluate(()=>window.boot());
  await page.waitForFunction(()=>window.store.scene.getObjectByName('storefrontEntryModel')?.getObjectByName('display-model'));
  await delay(2500);
  await page.evaluate(()=>{const s=window.store;s.teleportWalk(11,62,180,0,9,true);window.debugResetResScale?.();s.requestRender();});
  await delay(2500);await page.screenshot({path:resolve(out,label+'-full-slate-front.png')});
  await page.evaluate(()=>{const s=window.store;s.teleportWalk(40,39,Math.atan2(29,17)*180/Math.PI,-Math.atan2(2,Math.hypot(29,17))*180/Math.PI,13,true);window.debugResetResScale?.();s.requestRender();});
  await delay(2500);await page.screenshot({path:resolve(out,label+'-full-slate-side.png')});
  await page.evaluate(()=>{const s=window.store;s.setOutsideMode('day');const g=s.scene.getObjectByName('storefrontEntryModel');g.getObjectByName('display-model').visible=false;g.getObjectByName('display-fallback').visible=true;s.teleportWalk(39,35,Math.atan2(27,16)*180/Math.PI,0,12,true);window.debugResetResScale?.();s.requestRender();});
  await delay(2500);await page.screenshot({path:resolve(out,label+'-fallback.png')});
}
console.log(label,metrics);
}
}finally{await browser?.close();server.kill();unlinkSync(html);}
