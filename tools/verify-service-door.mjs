// Actual StoreScene photographs; adapted from verify-hatchback.mjs.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root=new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'/tmp/service-door-verification'),label=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const facade=process.argv[4]||'gabled-brick';
const port=6297,html=resolve(root,'tools/verify-service-door.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try{
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:800px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1200,height:800});page.on('pageerror',e=>console.log(e.message));
await page.goto(`http://localhost:${port}/tools/verify-service-door.html`);await page.waitForFunction(()=>!!window.boot);
await page.evaluate((facade)=>{localStorage.clear();Object.entries({bb_facade:facade,bb_store_format:'corporate',bb_window_awnings:'1',bb_theme:'halcyon',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day',bb_day_sky:'mall_parking_lot',bb_sun_azimuth:'-35',bb_sun_elevation:'40',bb_sun_warmth:'0'}).forEach(([k,v])=>localStorage.setItem(k,v));},facade);
if(label==='checks'){
const result=await page.evaluate(async()=>{const {checkServiceDoorVariants}=await import('/tools/service-door-checks.js');return checkServiceDoorVariants(window.T,window.L);});writeFileSync(resolve(out,'integration-checks.json'),JSON.stringify(result,null,2));
}else{
if(label==='before'){await page.setRequestInterception(true);page.on('request',r=>r.url().endsWith('/models/service-door.glb')?r.abort():r.continue());}
console.log('Booting store');await page.evaluate(()=>window.boot());
await delay(3500);
if(label!=='before')await page.waitForFunction(()=>!!window.store.scene?.getObjectByName('serviceDoor')?.getObjectByName('display-model'));
const anchor=await page.evaluate(()=>{const s=window.store;const f=s.scene.getObjectByName('storefrontFacade');const door=s.scene.getObjectByName('serviceDoor');if(door)return door.position.toArray();let p;f.traverse(o=>{if(o.isMesh&&o.material.color?.getHex()===0x39404a)p=o.position.toArray();});if(!p)throw Error('Door absent');return [11+s.getStoreWidth()/2,0,p[2]];});
const [x,,z]=anchor;
const views=[['interior',[x-10,4.6,z+2],[x,3.8,z]],['exterior',[x+11,4.8,z-3],[x,3.8,z]],['hardware',[x-3.3,4.8,z+2],[x-.15,4.2,z]],['threshold',[x+3,1.6,z+2],[x+.5,.5,z]]];
await page.evaluate(()=>{window.store.isRendering=false;});
for(const pass of label==='after'?['before','after']:[label]){
await page.evaluate(pass=>{const d=window.store.scene.getObjectByName('serviceDoor');const m=d.getObjectByName('display-model');if(m)m.visible=pass==='after';d.getObjectByName('display-fallback').visible=pass!=='after';},pass);
for(const [name,position,target] of views){
await page.evaluate(({position,target})=>{const s=window.store,[x,y,z]=position,[tx,ty,tz]=target;s.teleportWalk(x,z,Math.atan2(x-tx,z-tz)*180/Math.PI,-Math.atan2(y-ty,Math.hypot(x-tx,z-tz))*180/Math.PI,y,true);s.camera.aspect=1.5;s.camera.updateProjectionMatrix();s.renderer.setPixelRatio(1);s.renderer.setSize(1200,800);s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);},{position,target});await delay(1800);await page.screenshot({path:resolve(out,pass+'-'+name+'.png')});console.log('Captured',pass,name);}}
if(label==='after'){const checks=await page.evaluate(async()=>{const {checkServiceDoor}=await import('/tools/service-door-checks.js');return checkServiceDoor(window.store,window.T);});writeFileSync(resolve(out,'integration-checks.json'),JSON.stringify(checks,null,2));}
}
}finally{await browser?.close();server.kill();unlinkSync(html);}
