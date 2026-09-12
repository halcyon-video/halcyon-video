// Actual StoreScene photographs and anchor/lifecycle checks. Based on verify-ceiling-luminaire.
import {mkdirSync,writeFileSync,unlinkSync,readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const out=resolve(process.argv[2]||'/tmp/wall-courtesy-telephone');mkdirSync(out,{recursive:true});
if(readdirSync('public/user-assets').some(n=>n!=='README.md'))throw Error('Use public-only assets for evidence');
const port=6292,html=resolve('tools/verify-wall-courtesy-telephone.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser;
try {
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1100px;height:850px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async(count)=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:count},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1993,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1100,height:850});page.on('pageerror',e=>console.log(e.message));
const evidence={};
for(const height of ['standard','high']){
 await page.goto(`http://localhost:${port}/tools/verify-wall-courtesy-telephone.html`);await page.waitForFunction(()=>!!window.boot);
 await page.evaluate(height=>{localStorage.clear();Object.entries({bb_theme:'bb-1993',bb_store_format:'corporate',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day',bb_ceiling:height}).forEach(([k,v])=>localStorage.setItem(k,v));},height);
 console.log('Boot',height);await page.evaluate(height=>window.boot(height==='standard'?80:16),height);console.log('Ready',height);await page.waitForFunction(()=>window.store.scene.getObjectByName('wall-courtesy-telephone')?.getObjectByName('display-model'),{timeout:120000});
 await delay(1500);
 evidence[height]=await page.evaluate(()=>{
 const s=window.store,T=window.T;s.pauseRendering();s.renderer.setPixelRatio(1);s.renderer.setSize(1100,850,false);
 const root=s.scene.getObjectByName('wall-courtesy-telephone'),model=root.getObjectByName('display-model');root.updateMatrixWorld(true);
 const b=new T.Box3().setFromObject(model),door=s.scene.getObjectByName('serviceDoor'),doorBounds=new T.Box3().setFromObject(door);
 if(b.intersectsBox(doorBounds))throw Error('Phone intersects service door');
 if(Math.abs(b.max.x-root.position.x)>1e-5)throw Error('Backplate must seat on wall');
 let tris=0,draws=0;const mats=new Set();model.traverse(o=>{if(o.isMesh){tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;draws++;if(!o.geometry.attributes.uv || !o.material.normalMap || !o.material.roughnessMap)throw Error('Missing surface maps');mats.add(o.material.name);}});
 if(draws!==6)throw Error('Expected six optimized material batches');
 const intersections=[];s.scene.traverse(o=>{if(!o.isMesh||!o.visible)return;let p=o;while(p){if(p===root)return;p=p.parent;}const box=new T.Box3().setFromObject(o);if(box.intersectsBox(b) && box.min.x < b.max.x-.01){const tri=new T.Triangle(),pos=o.geometry.attributes.position,idx=o.geometry.index;for(let i=0;i<(idx?.count||pos.count);i+=3){[tri.a,tri.b,tri.c].forEach((v,k)=>v.fromBufferAttribute(pos,idx?idx.getX(i+k):i+k).applyMatrix4(o.matrixWorld));if(b.intersectsTriangle(tri)){intersections.push({name:o.name,parent:o.parent?.name,box:{min:box.min.toArray(),max:box.max.toArray()}});break;}}}});
 if(intersections.length)throw Error('Neighbor geometry crosses phone: '+JSON.stringify(intersections));
 window.draw=(name)=>{model.visible=!name.startsWith('before');const mode=name.replace('before-','').replace('after-','');
 const offset={context:[-8,1.3,5],front:[-2.7,-.25,0],side:[-1.2,-.25,-2],rear:[1.8,.1,-1.4]}[mode];
 // Rear is an inspection view: hide only architectural wall/veneer meshes in the
 // camera-to-phone ray, keep the mounted phone at its actual store transform.
 const hidden=[];if(mode==='rear')s.scene.traverse(o=>{if(!o.isMesh||!o.visible)return;let p=o;while(p){if(p===root)return;p=p.parent;}const box=new T.Box3().setFromObject(o);if(box.min.x>=root.position.x-.01 && box.max.x<=root.position.x+1.8){hidden.push(o);o.visible=false;}});
 s.camera.position.copy(root.position).add(new T.Vector3(...offset));s.camera.lookAt(root.position.x,root.position.y-.3,root.position.z+(mode==='context'?1.1:0));s.camera.updateMatrixWorld();s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);const url=s.renderer.domElement.toDataURL();hidden.forEach(o=>o.visible=true);return url;};
 return {anchor:root.position.toArray(),ceiling:s.ceilingY,bounds:{min:b.min.toArray(),max:b.max.toArray()},doorBounds:{min:doorBounds.min.toArray(),max:doorBounds.max.toArray()},triangles:tris,draws,materials:[...mats],intersections};
 });
 for(const name of ['before-context','after-context','after-front','side','rear']){const data=await page.evaluate(name=>window.draw(name),name);writeFileSync(resolve(out,`${height}-${name}.png`),Buffer.from(data.split(',')[1],'base64'));}
 console.log(height,JSON.stringify(evidence[height]));
 evidence[height].cleanup=await page.evaluate(()=>{const r=window.store.scene.getObjectByName('wall-courtesy-telephone');let disposed=0;r.getObjectByName('display-model').traverse(o=>{if(o.isMesh)o.geometry.addEventListener('dispose',()=>disposed++);});r.removeFromParent();if(r.getObjectByName('display-model'))throw Error('Loaded tree retained');return {disposed};});
}
// Exercise the shared loader with success/error callbacks held deliberately.
evidence.lifecycle=await page.evaluate(async()=>{
 const T=window.T,GLTFLoader=window.L;
 const {buildWallCourtesyTelephone}=await import('/src/fixtures/wall-courtesy-telephone.ts');const s=window.store;
 const template=(await new GLTFLoader().loadAsync('/models/wall-courtesy-telephone.glb')).scene;
 const original=GLTFLoader.prototype.load;let pending;
 GLTFLoader.prototype.load=function(url,success,progress,error){pending={success,error};};
 try {
 const ctx=s.fixtureContext(),facade=new T.Group();s.scene.add(facade);
 const late=buildWallCourtesyTelephone(ctx,facade,34,-10);late.removeFromParent();
 let disposed=0;template.traverse(o=>{if(o.isMesh){o.geometry.addEventListener('dispose',()=>disposed++);}});pending.success({scene:template});
 if(late.getObjectByName('display-model')||disposed!==6)throw Error('Late disposal failed');
 const failed=buildWallCourtesyTelephone(ctx,facade,34,-10);pending.error(new Error('Deliberate missing asset'));
 if(!failed.getObjectByName('display-fallback').visible||failed.getObjectByName('display-model'))throw Error('Missing-asset fallback failed');
 const gated=buildWallCourtesyTelephone({...ctx,activeTheme:{...ctx.activeTheme,id:'bb-2000'}},facade,34,-10);if(gated)throw Error('Era gate failed');
 facade.removeFromParent();return {lateDisposed:disposed,missingFallback:true,wrongEraAbsent:true};
 }finally{GLTFLoader.prototype.load=original;}
});
writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
}finally{await browser?.close();server.kill();unlinkSync(html);}
