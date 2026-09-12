// Public GLB + actual StoreScene photographs; follows verify-nr-wall.mjs.
// --grid captures ceiling tile kit views; optional --theme=, --format=, --count=, --fallback.
import {mkdirSync,writeFileSync,unlinkSync, readdirSync, readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root=new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'/tmp/luminaire-verification');mkdirSync(out,{recursive:true});
if(readdirSync(resolve(root,'public/user-assets')).some(n=>n!=='README.md'))throw Error('Public evidence requires a tree without user-assets');
const gridMode=process.argv.includes('--grid');
const option=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=')[1]??fallback;
const gridFallback=process.argv.includes('--fallback');
const gridCounts=option('count','80,6000').split(',').map(Number);
const port=6285, html=resolve(root,'tools/verify-ceiling-luminaire.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try{
 writeFileSync(html,`<body style="margin:0"><div id="store" style="width:960px;height:720px"></div><script type="module">
 import * as THREE from '/node_modules/three/build/three.module.js';
 import {installCeilingLuminaires} from '/src/ceiling-luminaire.ts';
 window.T=THREE;window.install=installCeilingLuminaires;
 window.boot=async(n)=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:n},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2006,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};
 </script>`);
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Isolated Vite server failed');try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
 browser=await puppeteer.launch({headless:true,protocolTimeout:300000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.setViewport({width:960,height:720});
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,240));});
 page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
 await page.goto(`http://localhost:${port}/tools/verify-ceiling-luminaire.html`);await page.waitForFunction(()=>!!window.install);
 const modelsOnly=process.argv.includes('--models-only');
 const evidence=modelsOnly?JSON.parse(readFileSync(resolve(out,'evidence.json'),'utf8')):{};
 for(const fallback of (gridMode?[]:[false,true])){
  await page.setRequestInterception(true);page.removeAllListeners('request');page.on('request',r=>fallback&&r.url().includes('ceiling-luminaire-')?r.abort():r.continue());
  await page.evaluate(async(fallback)=>{
   const T=window.T; const scene=new T.Scene();scene.background=new T.Color(0x273344);scene.add(new T.HemisphereLight(0xffffff,0x68788a,2));const light=new T.DirectionalLight(0xffffff,3);light.position.set(2,3,4);scene.add(light);
   const parent=window.install(scene,[{x:-1,y:0,z:0,variant:'dome'},{x:1,y:0,z:0,variant:'directional'}],()=>{});
   if(!fallback)await new Promise((res,rej)=>{const start=Date.now();const poll=()=>{if(parent.children.length===3)res();else if(Date.now()-start>15000)rej(Error('Load timeout'));else setTimeout(poll,100);};poll();});
   const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,720);renderer.toneMapping=T.ACESFilmicToneMapping;document.getElementById('store').replaceChildren(renderer.domElement);
   const camera=new T.PerspectiveCamera(38,4/3,.01,100);
   window.draw=(view)=>{camera.position.fromArray({front:[0,-2.8,6],side:[5,-1,2],rear:[1,2,-5],below:[0,-7,1]}[view]);camera.lookAt(0,-.85,0);renderer.render(scene,camera);};window.fixture=parent;
  },fallback);
  for(const view of ['front','side','rear','below']){await page.evaluate(v=>window.draw(v),view);await page.screenshot({path:resolve(out,`${fallback?'fallback':'source'}-${view}.png`)});}
  evidence[fallback?'fallback':'source']=await page.evaluate(()=>{let draws=0,instances=0;window.fixture.traverse(o=>{if(o.isInstancedMesh&&o.visible){draws+=Array.isArray(o.material)?(o.geometry.groups.length||1):1;instances+=o.count;}});return {draws,instances,children:window.fixture.children.map(o=>o.name)};});
 }
 page.removeAllListeners('request');await page.setRequestInterception(false);
 if(!gridMode)evidence.lifecycle=await page.evaluate(async()=>{
   const scene=new window.T.Scene();let refreshed=0;
   const group=window.install(scene,[{x:0,y:13.5,z:0,variant:'dome'}],()=>refreshed++);
   group.removeFromParent();await new Promise(r=>setTimeout(r,1000));
   if(refreshed||group.children.length!==1)throw Error('Late model adopted after removal');
   return {lateLoadDiscarded:true,refreshes:refreshed};
 });
 for(const [count,height,exposed,fallback] of (gridMode?gridCounts.map(n=>[n,'standard',false,gridFallback]):modelsOnly?[]:[[80,'standard',false,false],[80,'standard',true,false],[6000,'standard',true,false],[6000,'high',true,false],[80,'standard',true,true]])){
  await page.goto(`http://localhost:${port}/tools/verify-ceiling-luminaire.html`);await page.waitForFunction(()=>!!window.boot);
  await page.evaluate(({height,exposed,format,theme})=>{localStorage.clear();Object.entries({bb_store_format:format,bb_theme:theme,bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_ceiling:height,bb_ceiling_structure:exposed?'exposed':'tile'}).forEach(([k,v])=>localStorage.setItem(k,v));},{height,exposed,format:option('format','corporate'),theme:option('theme','bb-2000')});
  await page.setRequestInterception(true);page.removeAllListeners('request');page.on('request',r=>fallback&&r.url().includes(gridMode?'ceiling-grid.glb':'ceiling-luminaire-')?r.abort():r.continue());
  await page.evaluate(n=>window.boot(n),count);
  if(exposed&&!fallback)await page.waitForFunction(()=>window.store.scene.getObjectByName('Ceiling luminaires')?.children.length===3);
  if(gridMode&&!fallback)await page.waitForFunction(()=>window.store.scene.getObjectByName('Suspended ceiling kit')?.userData.loaded,{timeout:60000});
  await delay(2000);
  const key=`store-${count}-${height}-${exposed?'exposed':'tile'}${fallback?'-fallback':''}`;
  evidence[key]=await page.evaluate(()=>{const s=window.store;const root=s.scene.getObjectByName('Ceiling luminaires');const boxes=[];root?.traverse(o=>{if(o.isInstancedMesh&&o.visible){const b=new window.T.Box3().setFromObject(o);boxes.push({name:o.name,min:b.min.toArray(),max:b.max.toArray(),count:o.count});}});s.teleportWalk(11,4,0,22,5.5,true);s.requestRender();return {ceiling:s.ceilingY,backWall:s.backWallZ,width:s.getStoreWidth(),lights:s.trofferKeyLights.length,shadowLights:s.trofferKeyLights.filter(l=>l.castShadow).length,boxes};});
  await delay(1000);await page.screenshot({path:resolve(out,key+'.png')});
  if(gridMode){
   evidence[key].grid=await page.evaluate(()=>{const s=window.store,r=s.scene.getObjectByName('Suspended ceiling kit');const parts=[];let draws=0,triangles=0;const materials=new Set();s.scene.traverse(g=>{if(g.name==='Suspended ceiling kit')g.traverse(o=>{if(!o.isMesh||!o.visible)return;const count=o.count??1;const t=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3;parts.push({name:o.name,count,triangles:t*count});draws++;triangles+=t*count;materials.add(o.material);});});return {loaded:!!r?.userData.loaded,parts,draws,triangles,materials:materials.size,memory:s.renderer.info.memory,render:s.renderer.info.render};});
   for(const [view,x,z,yaw,pitch,y] of [['aisle',11,-15,0,55,5.5],['side',2,-12,-80,45,8],['soffit',11,-6,180,55,5.5],['plenum',11,-15,20,-18,evidence[key].ceiling+.3]]){
    await page.evaluate(a=>{window.store.teleportWalk(...a,true);window.store.requestRender();},[x,z,yaw,pitch,y]);await delay(700);await page.screenshot({path:resolve(out,key+'-'+view+'.png')});
   }
  }
  if(exposed){await page.evaluate(()=>{const s=window.store,T=window.T;
    const root=s.scene.getObjectByName('Ceiling luminaires');
    const group=root.getObjectByName('dome Blender instances')||root.getObjectByName('Luminaire fallback');
    const mesh=group.children.find(o=>o.isInstancedMesh&&o.visible);const m=new T.Matrix4();mesh.getMatrixAt(0,m);const p=new T.Vector3().setFromMatrixPosition(m);
    s.teleportWalk(p.x+3,p.z+6,Math.atan2(3,6)*180/Math.PI,Math.atan2(s.ceilingY-1.4-5.5,Math.hypot(3,6))*180/Math.PI,5.5,true);s.requestRender();});await delay(500);await page.screenshot({path:resolve(out,key+'-upward.png')});}
  if(gridMode){
   // Close inspection in the actual store, above and below the same junction.
   // Bypass the dynamic resolution scaler and bloom for readable profile detail.
   for(const view of ['joint-below','joint-side','joint-top']){
    await page.evaluate(view=>{
     const s=window.store,T=window.T;s.isRendering=false;
     const p=new T.Vector3(11-s.getStoreWidth()/2+5*Math.floor(s.getStoreWidth()/10),s.ceilingY,s.backWallZ+2.5*Math.floor((15-s.backWallZ)/5));
     const c=new T.PerspectiveCamera(42,4/3,.01,300);
     c.position.copy(p).add(new T.Vector3(...{'joint-below':[1.1,-.7,1.2],'joint-side':[1.1,.14,1.2],'joint-top':[1.1,.45,1.2]}[view]));c.lookAt(p.x,p.y,p.z);
     s.renderer.setSize(960,720);s.renderer.toneMappingExposure=.35;s.renderer.render(s.scene,c);
    },view);await page.screenshot({path:resolve(out,key+'-'+view+'.png')});
   }
  }
  writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(key,JSON.stringify({lights:evidence[key].lights,parts:evidence[key].boxes.length}));
  // Navigation destroys the isolated page/context between scenarios. The
  // installer removal lifecycle is tested separately above.
  page.removeAllListeners('request');await page.setRequestInterception(false);
 }
 writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
}finally{await browser?.close();server.kill();unlinkSync(html);}
