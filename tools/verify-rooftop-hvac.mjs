// StoreScene capture pattern from verify-hatchback.mjs; no user assets.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root=new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'/tmp/rooftop-hvac-verification');mkdirSync(out,{recursive:true});
const port=6291,html=resolve(root,'tools/verify-rooftop-hvac.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try{
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:800px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1200,height:800});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const evidence={};
for(const style of (process.argv[3] ? [process.argv[3]] : ['gabled-brick','flat-parapet','arcaded-brick'])){
 await page.goto(`http://localhost:${port}/tools/verify-rooftop-hvac.html`);await page.waitForFunction(()=>!!window.boot);
 await page.evaluate(style=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_facade:style,bb_theme:'bb-2000',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day'}).forEach(([k,v])=>localStorage.setItem(k,v));},style);
 await page.evaluate(()=>window.boot());
 await page.waitForFunction(()=>window.store.scene.getObjectByName('rooftopHVAC')?.getObjectByName('display-model'),{timeout:30000});
 await delay(1200);
 await page.evaluate(()=>{window.store.softwareGL=false;window.debugResetResScale();});
 evidence[style]=await page.evaluate(()=>{const s=window.store,T=window.T,g=s.scene.getObjectByName('rooftopHVAC');window.hvac=g;const b=new T.Box3().setFromObject(g.getObjectByName('display-model'));if(Math.abs(b.min.y-s.ceilingY-.85)>.001)throw Error('Curb not seated');if(b.min.x<11-s.getStoreWidth()/2||b.max.x>11+s.getStoreWidth()/2||b.min.z<s.backWallZ||b.max.z>15)throw Error('Unsupported footprint');return {min:b.min.toArray(),max:b.max.toArray(),roofY:s.ceilingY+.85,width:s.getStoreWidth(),backZ:s.backWallZ};});
 for(const view of (style==='gabled-brick'?['exterior','side','rear','inside']:['exterior'])){
  await page.evaluate(view=>{const s=window.store,T=window.T,c=new T.Box3().setFromObject(window.hvac).getCenter(new T.Vector3());let p;
  if(view==='exterior')p=new T.Vector3(c.x+5,5.5,90);
  else if(view==='side')p=c.clone().add(new T.Vector3(-11,6,9));
  else if(view==='rear')p=c.clone().add(new T.Vector3(9,5,-11));
  else {p=new T.Vector3(11,5.5,3);c.set(11,8,15);}
  s.teleportWalk(p.x,p.z,Math.atan2(p.x-c.x,p.z-c.z)*180/Math.PI,-Math.atan2(p.y-c.y,Math.hypot(p.x-c.x,p.z-c.z))*180/Math.PI,p.y,true);s.requestRender();},view);
  for(const state of ['before','after']){
   await page.evaluate(state=>{window.hvac.visible=state==='after';window.store.requestShadowRefresh?.();window.store.requestRender();},state);await delay(700);
   await page.screenshot({path:resolve(out,`${style}-${view}-${state}.png`)});
  }
 }
}
evidence.lifecycle=await page.evaluate(async()=>{
 const {buildRooftopHVAC,rooftopHVACAnchor}=await import('/src/rooftop-hvac.ts');
 const T=window.T,L=window.L,original=L.prototype.load,pending=[];
 L.prototype.load=function(url,success,progress,error){pending.push({success,error});};
 const scene=new T.Scene();let refresh=0,logs=0,disposed=0;
 const ctx={scene,requestRender:()=>refresh++,requestShadowRefresh:()=>refresh++,log:()=>logs++};
 try{
 const late=buildRooftopHVAC(ctx,60,-40,13.5);scene.add(late);late.removeFromParent();late.userData.dispose();
 const fake=()=>{const g=new T.Group(),geo=new T.BoxGeometry(),mat=new T.MeshStandardMaterial();geo.addEventListener('dispose',()=>disposed++);mat.addEventListener('dispose',()=>disposed++);g.add(new T.Mesh(geo,mat));return g;};
 pending.shift().success({scene:fake()});if(disposed!==2||refresh!==0||late.children.length!==1)throw Error('Late load leaked');
 const failure=buildRooftopHVAC(ctx,60,-40,13.5);scene.add(failure);pending.shift().error(Error('Expected test failure'));if(!failure.children[0].visible||logs!==1)throw Error('Fallback failure');
 const success=buildRooftopHVAC(ctx,60,-40,13.5);scene.add(success);pending.shift().success({scene:fake()});if(success.children[0].visible||refresh!==2)throw Error('Install failed');success.userData.dispose();success.userData.dispose();if(disposed!==4)throw Error('Release not idempotent');
 if(rooftopHVACAnchor(20,-30,13.5)||rooftopHVACAnchor(60,0,13.5))throw Error('Unsafe placement accepted');
 for(const width of [32,60,120])for(const back of [-9,-40,-100])for(const y of [13.5,18]){const a=rooftopHVACAnchor(width,back,y);if(!a||a.x-3.23<11-width/2||a.z-2.1<back||a.y!==y+.85)throw Error('Layout placement');}
 return {lateLoadDisposed:true,failureFallback:true,successRefreshes:2,idempotentRelease:true,placementCases:18};
 }finally{L.prototype.load=original;}
});
evidence.pageErrors=errors;if(errors.length)throw Error(errors.join('\n'));
writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(evidence);
}finally{await browser?.close();server.kill();unlinkSync(html);}
