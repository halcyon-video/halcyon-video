// StoreScene photography following verify-ceiling-luminaire.mjs; isolated settings/server.
import {mkdirSync,writeFileSync,unlinkSync,readFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root=process.env.SIGN_MOUNT_ROOT||new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'scratch/sign-mount');mkdirSync(out,{recursive:true});
const phase=process.argv[3]||'after',port=Number(process.env.SIGN_MOUNT_PORT||6296),html=resolve(root,`tools/verify-sign-mount-${port}.html`);
const config=resolve(root,`tools/verify-sign-mount-${port}.config.mjs`);
writeFileSync(config,`import base from '../vite.config.ts';export default async env=>{const c=await base(env);return {...c,cacheDir:${JSON.stringify(resolve(root,`scratch/sign-mount-vite-cache-${port}`))},server:{...c.server,hmr:false}};};`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config',config,'--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;const evidence=existsSync(resolve(out,`${phase}-evidence.json`))?JSON.parse(readFileSync(resolve(out,`${phase}-evidence.json`),'utf8')):{};
try{
 writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1280px;height:900px"></div><script type="module">
 import * as THREE from '/node_modules/three/build/three.module.js';window.T=THREE;
 window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:160},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1993,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Comedy'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Comedy',movies,genres:['Comedy']}],()=>{});await window.store.ready;};
 </script>`);
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Vite failed');try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
 browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});
 page.on('console',m=>{if(m.type()==='error')console.log('console',m.text().slice(0,250));});
 page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
 for(const [theme,height] of (process.env.SIGN_MOUNT_SCENARIOS?JSON.parse(process.env.SIGN_MOUNT_SCENARIOS):[['bb-1993','standard'],['bb-2000','standard'],['bb-1993','high'],['bb-2000','high']])){
  await page.goto(`http://localhost:${port}/tools/verify-sign-mount-${port}.html?demo=1`);await page.waitForFunction(()=>!!window.boot);
  await page.evaluate(({theme,height})=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_theme:theme,bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_ceiling:height,bb_ceiling_structure:'tile'}).forEach(([k,v])=>localStorage.setItem(k,v));},{theme,height});
  console.log('boot',theme,height);await page.evaluate(()=>window.boot());console.log('ready');await delay(2500);
  const key=`${phase}-${theme}-${height}`;
  evidence[key]=await page.evaluate(()=>{
   const s=window.store,T=window.T;
   const signs=s.activeSignageObjects.filter(o=>o.position.y===0&&new T.Box3().setFromObject(o).min.y>6);
   if(!signs.length)throw Error('No ceiling signs');
   window.target=signs[0];
   return {ceiling:s.ceilingY,signs:signs.map(o=>({name:o.name,position:o.position.toArray(),bounds:new T.Box3().setFromObject(o).getSize(new T.Vector3()).toArray(),top:new T.Box3().setFromObject(o).max.y,model:!!o.getObjectByName('display-model'),contacts:o.userData.signMount?.contactYs}))};
  });
  if(phase==='after'&&evidence[key].signs.some(s=>!s.model))throw Error('Mount not loaded');
  for(const view of (process.env.SIGN_MOUNT_VIEWS?JSON.parse(process.env.SIGN_MOUNT_VIEWS):['front','side','rear','detail','mount-side'])){
   await page.evaluate(view=>{const T=window.T,s=window.store,o=window.target;const box=new T.Box3().setFromObject(o),center=box.getCenter(new T.Vector3());
    const spec=o.userData.signMount;
    const local={front:[0,-3,9],side:[6,-1,3],rear:[0,-2,-9],detail:[1.6,-.45,1.8],'mount-side':spec?.rigid?[-.65,-.015,.18]:[.25,.08,.48]}[view];
    const aim=view==='mount-side'?new T.Vector3(spec ? -(spec.rigid?spec.width*.24:spec.width/2-.4) : -.8,spec ? (spec.rigid?spec.ceilingY-.085:spec.topY+.09) : box.max.y-.085,0).applyAxisAngle(new T.Vector3(0,1,0),o.rotation.y).add(new T.Vector3(o.position.x,0,o.position.z)):view==='detail'?new T.Vector3(-1,box.max.y-.12,0).applyAxisAngle(new T.Vector3(0,1,0),o.rotation.y).add(new T.Vector3(o.position.x,0,o.position.z)):center;
    const p=new T.Vector3(...local).applyAxisAngle(new T.Vector3(0,1,0),o.rotation.y).add(aim);
    const d=p.clone().sub(aim);s.teleportWalk(p.x,p.z,Math.atan2(d.x,d.z)*180/Math.PI,Math.atan2(-d.y,Math.hypot(d.x,d.z))*180/Math.PI,p.y,true);s.camera.near=.01;s.camera.updateProjectionMatrix();s.requestRender();
   },view);await delay(view==='mount-side'?1800:450);await page.screenshot({path:resolve(out,`${key}-${view}.png`)});
  }
  writeFileSync(resolve(out,`${phase}-evidence.json`),JSON.stringify(evidence,null,2)+'\n');console.log(key,JSON.stringify(evidence[key]));
 }
}finally{await browser?.close();server.kill();unlinkSync(html);unlinkSync(config);}
