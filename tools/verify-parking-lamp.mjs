// Actual StoreScene photographs; adapted from verify-hatchback.mjs.
// Run before editing, then after; output goes outside the source tree.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root=new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'/tmp/parking-lamp-verification'),label=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const port=Number(process.env.LAMP_PORT||6264),html=resolve(root,`tools/verify-parking-lamp-${port}.html`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try{
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:800px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1200,height:800});page.on('pageerror',e=>console.log(e.message));
await page.goto(`http://localhost:${port}/tools/verify-parking-lamp-${port}.html`);await page.waitForFunction(()=>!!window.boot);
await page.evaluate(()=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_theme:'bb-2000',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day',bb_day_sky:'park_parking',bb_sunset_sky:'suburban_parking_area',bb_night_sky:'hansaplatz',bb_sun_azimuth:'35',bb_sun_elevation:'35',bb_sun_warmth:'0.2'}).forEach(([k,v])=>localStorage.setItem(k,v));});
if(process.argv.includes('--checks-only')) {
const checks=await page.evaluate(async()=>{
 const T=window.T,L=window.L;
 const {buildExteriorEnvironment,PARKING_STALLS}=await import('/src/exterior-environment.ts');
 const bytes=await (await fetch('/models/parking-lamp.glb')).arrayBuffer();
 const original=L.prototype.load,result=[];let pending=[];
 L.prototype.load=function(url,success,progress,error){pending.push({url,success,error});};
 try {
  for(const width of [40,80]){
   pending=[];let refreshes=0;
   const scene=new T.Scene(),exterior=buildExteriorEnvironment(scene,width,4.7,false,()=>refreshes++);
   const roots=[0,1].map(i=>exterior.group.getObjectByName('parking-lamp-'+i));
   const pools=[0,1].map(i=>exterior.group.getObjectByName('parking-lamp-pool-'+i));
   roots.forEach((r,i)=>{
    if(r.position.x!==PARKING_STALLS.centerX+(i===0?-13.5:13.5)||r.position.z!==PARKING_STALLS.rowFrontZ+PARKING_STALLS.depth)throw Error('Lamp left stall boundary');
    if(!pools[i].position.equals(new T.Vector3(r.position.x,-.02,r.position.z))||pools[i].geometry.parameters.width!==18||pools[i].geometry.parameters.height!==18)throw Error('Pool moved/resized');
   });
   exterior.setOutsideMode('night');
   const model=await new L().parseAsync(bytes.slice(0),'');
   pending.find(p=>p.url.endsWith('/parking-lamp.glb')).success(model);
   if(refreshes!==1)throw Error('Missing install refresh');
   const lenses=roots.map(r=>r.getObjectByName('ParkingLamp_LampLens'));
   if(lenses[0].material!==lenses[1].material||lenses[0].material.emissiveIntensity!==3.2)throw Error('Pending night mode lost');
   const modes=[];
   for(const [mode,intensity,opacity] of [['day',.05,.04],['sunset',2.2,.15],['night',3.2,.5]]){
    exterior.setOutsideMode(mode);
    if(lenses.some(l=>l.material.emissiveIntensity!==intensity)||pools.some(p=>p.material.opacity!==opacity))throw Error('Mode contract changed');
    modes.push({mode,intensity,opacity});
   }
   let triangles=0,draws=0;const geometries=new Set(),materials=new Set();
   scene.updateMatrixWorld(true);
   const bounds=roots.map(r=>{
    const m=r.getObjectByName('parking-lamp-model');
    if(r.getObjectByName('parking-lamp-fallback').visible)throw Error('Fallback still visible');
    m.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;draws++;geometries.add(o.geometry);materials.add(o.material);}});
    const b=new T.Box3().setFromObject(m);return {min:b.min.toArray(),max:b.max.toArray()};
   });
   if(geometries.size!==4||materials.size!==4||triangles!==5196||draws!==8)throw Error('Instance cost/sharing changed');
   exterior.dispose();exterior.dispose();if(scene.children.length)throw Error('Exterior retained');
   result.push({width,bounds,triangles,draws,sharedGeometries:geometries.size,sharedMaterials:materials.size,modes,refreshes});
  }
 }finally{L.prototype.load=original;}
 return result;
});
writeFileSync(resolve(out,'integration-checks.json'),JSON.stringify(checks,null,2));console.log(checks);
} else {
console.log('Booting store');await page.evaluate(()=>window.boot());console.log('Store ready');
await delay(2000);
if(label!=='before')await page.waitForFunction(()=>window.store.scene.getObjectByName('parking-lamp-model'),{timeout:30000});
const anchor=await page.evaluate(async()=>{const {PARKING_STALLS}=await import('/src/exterior-environment.ts');return [PARKING_STALLS.centerX-13.5,PARKING_STALLS.rowFrontZ+PARKING_STALLS.depth];});
for(const mode of ['day','sunset','night']){
 await page.evaluate(mode=>window.store.setOutsideMode(mode),mode);await delay(900);
 for(const [name,pos,target] of [
  ['inside',[anchor[0]+8,5,12],[anchor[0]+8,7,anchor[1]]],
  ['lot',[anchor[0]+29,10,anchor[1]+21],[anchor[0]+12,6,anchor[1]-4]],
  ['side',[anchor[0]+5,13.1,anchor[1]-1],[anchor[0],12.5,anchor[1]-.5]],
  ['underside',[anchor[0]+1.1,11.3,anchor[1]-2.7],[anchor[0],12.9,anchor[1]-1.1]],
  ['rear',[anchor[0]-2,13.8,anchor[1]+4],[anchor[0],12.7,anchor[1]-.5]],
  ['base',[anchor[0]+1.6,1.6,anchor[1]-2.3],[anchor[0],.65,anchor[1]]],
 ]){
  if(mode!=='day'&&!['inside','lot'].includes(name))continue;
  if(label==='comparison'&&!['inside','lot','underside'].includes(name))continue;
  for(const state of label==='comparison' && name!=='underside'?['before','after']:['after']){
  const data=await page.evaluate(({pos,target,state,label})=>{const s=window.store;s.pauseRendering();if(label==='comparison'){for(let i=0;i<2;i++){const root=s.scene.getObjectByName('parking-lamp-'+i);root.getObjectByName('parking-lamp-fallback').visible=state==='before';root.getObjectByName('parking-lamp-model').visible=state==='after';}s.renderer.shadowMap.needsUpdate=true;}s.renderer.setPixelRatio(1);s.renderer.setSize(960,640,false);s.camera.position.set(...pos);s.camera.lookAt(...target);s.camera.updateMatrixWorld();s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();},{pos,target,state,label});
  writeFileSync(resolve(out,label+'-'+(label==='comparison'?state+'-':'')+mode+'-'+name+'.png'),Buffer.from(data.split(',')[1],'base64'));console.log('Captured',state,mode,name);
  }
 }
}
console.log('Photographs complete');
}
}finally{await browser?.close();server.kill();unlinkSync(html);}
