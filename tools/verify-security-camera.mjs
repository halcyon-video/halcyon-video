// Actual StoreScene photographs and anchor/lifecycle checks. Based on verify-ceiling-luminaire.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const out=resolve(process.argv[2]||'/tmp/security-camera');mkdirSync(out,{recursive:true});
const port=6291,html=resolve('tools/verify-security-camera.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser;
try {
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1100px;height:850px"></div><script type="module">
import * as T from '/node_modules/three/build/three.module.js';window.T=T;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1993,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1100,height:850});page.on('pageerror',e=>console.log(e.message));
const evidence={};
for(const height of ['standard','high']){
 await page.goto(`http://localhost:${port}/tools/verify-security-camera.html`);await page.waitForFunction(()=>!!window.boot);
 await page.evaluate(height=>{localStorage.clear();Object.entries({bb_theme:'bb-1993',bb_store_format:'corporate',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_ceiling:height}).forEach(([k,v])=>localStorage.setItem(k,v));},height);
 await page.evaluate(()=>window.boot());await page.waitForFunction(()=>window.store.scene.getObjectByName('security-camera-93')?.getObjectByName('display-model'),{timeout:120000});
 await delay(1500);
 evidence[height]=await page.evaluate(()=>{
 const s=window.store,T=window.T;s.pauseRendering();s.renderer.setPixelRatio(1);s.renderer.setSize(1100,850,false);
 const root=s.scene.getObjectByName('security-camera-93'),model=root.getObjectByName('display-model'),head=model.getObjectByName('CameraHead');root.updateMatrixWorld(true);
 const origin=head.getWorldPosition(new T.Vector3()),direction=new T.Vector3(-1,0,0).transformDirection(head.matrixWorld),target=new T.Vector3(11,3,-6).sub(origin).normalize();
 if(direction.dot(target)<.999999)throw Error('Optical axis misses overview target');
 const plate=new T.Box3().setFromObject(model.getObjectByName('CameraMount_CameraEnamel'));if(Math.abs(plate.max.y-root.position.y)>1e-6)throw Error('Plate not flush');
 let tris=0,draws=0;const mats=new Set();model.traverse(o=>{if(o.isMesh){tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;draws++;if(!o.geometry.attributes.uv)throw Error('Missing UV');mats.add(o.material.name);}});
 window.draw=(name)=>{const before=name.startsWith('before');model.visible=!before;root.getObjectByName('display-fallback').visible=before;
 const mode=name.replace('before-','').replace('after-','');const offset={context:[-3,-3,-5],front:[-1.5,-.65,-1.8],side:[1.5,-.4,-1.6],rear:[1.4,-.25,1.5]}[mode];
 const v=new T.Vector3(...offset);v.applyAxisAngle(new T.Vector3(0,1,0),model.getObjectByName('CameraMount').rotation.y);s.camera.position.copy(root.position).add(v);s.camera.lookAt(root.position.x,root.position.y-.65,root.position.z);s.camera.updateMatrixWorld();s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();};
 const b=new T.Box3().setFromObject(model);return {anchor:root.position.toArray(),ceiling:s.ceilingY,axisDot:direction.dot(target),plateTop:plate.max.y,bounds:{min:b.min.toArray(),max:b.max.toArray()},triangles:tris,draws,materials:[...mats]};
 });
 for(const name of ['before-context','after-context','before-front','after-front','side','rear']){const data=await page.evaluate(name=>window.draw(name),name);writeFileSync(resolve(out,`${height}-${name}.png`),Buffer.from(data.split(',')[1],'base64'));}
 console.log(height,evidence[height]);
 evidence[height].cleanup=await page.evaluate(()=>{const r=window.store.scene.getObjectByName('security-camera-93');let disposed=0;r.getObjectByName('display-model').traverse(o=>{if(o.isMesh)o.geometry.addEventListener('dispose',()=>disposed++);});r.removeFromParent();if(r.getObjectByName('display-model'))throw Error('Loaded tree retained');return {disposed};});
}
// Removed while loading: installer must discard the late GLB and leave fallback.
evidence.late=await page.evaluate(async()=>{const {buildSecurityCamera93}=await import('/src/fixtures/security-camera-93.ts');const s=window.store;buildSecurityCamera93(s,()=>8);const root=s.activeSignageObjects.at(-1);root.removeFromParent();await new Promise(r=>setTimeout(r,1200));if(root.getObjectByName('display-model'))throw Error('Late load installed');return true;});
// Failed request keeps the original procedural prop visible.
await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/models/security-camera.glb')?r.abort():r.continue());
evidence.failure=await page.evaluate(async()=>{const {buildSecurityCamera93}=await import('/src/fixtures/security-camera-93.ts');const s=window.store;buildSecurityCamera93(s,()=>8);const root=s.activeSignageObjects.at(-1);await new Promise(r=>setTimeout(r,1000));if(root.getObjectByName('display-model')||!root.getObjectByName('display-fallback').visible)throw Error('Fallback failed');return true;});
writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
}finally{await browser?.close();server.kill();unlinkSync(html);}
