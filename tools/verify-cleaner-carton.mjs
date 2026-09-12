// Real StoreScene photography, with deliberate isolated settings.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const out=resolve(process.argv[2]||'/tmp/cleaner-carton'), phase=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const port=6301,html=resolve('tools/verify-cleaner-carton.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});let browser;
try {
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1100px;height:850px"></div><script type="module">
import * as T from 'three';window.T=T;
window.boot=async()=>{localStorage.clear();Object.entries({bb_theme:'classic',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0'}).forEach(([k,v])=>localStorage.setItem(k,v));const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:40},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1993,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});const page=await browser.newPage();await page.setViewport({width:1100,height:850});const errors=[];page.on('pageerror',e=>errors.push(e.message));
if(phase==='before'){await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/models/cleaner-carton.glb')?r.abort():r.continue());}
await page.goto(`http://localhost:${port}/tools/verify-cleaner-carton.html`);await page.evaluate(()=>window.boot());await delay(3500);
if(phase==='after')await page.waitForFunction(()=>!!store.scene.getObjectByName('cleaner-carton-stock'),{timeout:120000});
const evidence=await page.evaluate(()=>{const s=store,T=window.T;s.pauseRendering();s.renderer.setPixelRatio(1);s.renderer.setSize(1100,850,false);let root;s.scene.traverse(o=>{if(o.isInstancedMesh&&o.count===10&&Math.abs(o.geometry.parameters?.width-.365)<.00001)root=o.parent;});if(!root)throw Error('Missing cleaner stock');window.root=root;root.updateMatrixWorld(true);
window.draw=mode=>{const offset={context:[-2,2.3,3.4],front:[.25,1.35,1.65],side:[1.5,1.1,.55],rear:[-.9,1.25,-1.45],closure:[-.5,1.2,.6]}[mode];s.camera.position.copy(root.localToWorld(new T.Vector3(...offset)));s.camera.lookAt(root.localToWorld(new T.Vector3(mode==='closure'?-.6:0,.68,0)));s.camera.updateMatrixWorld();s.renderer.setPixelRatio(1);s.renderer.setSize(1100,850,false);s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();};
return {anchor:root.position.toArray(),yaw:root.rotation.y};});
for(const name of ['context','front','side','rear','closure']){const data=await page.evaluate(name=>window.draw(name),name);writeFileSync(resolve(out,phase+'-'+name+'.png'),Buffer.from(data.split(',')[1],'base64'));
 if(phase==='after'){const before=await page.evaluate(name=>{const m=root.getObjectByName('cleaner-carton-stock'),f=root.getObjectByName('cleaner-carton-fallback');m.visible=false;f.visible=true;const data=window.draw(name);m.visible=true;f.visible=false;return data;},name);writeFileSync(resolve(out,'before-'+name+'.png'),Buffer.from(before.split(',')[1],'base64'));}}
if(phase==='after') {
 evidence.resources=await page.evaluate(()=>{const m=root.getObjectByName('cleaner-carton-stock');const mats=Array.isArray(m.material)?m.material:[m.material];const textures=new Set();for(const mat of mats)for(const v of Object.values(mat))if(v?.isTexture)textures.add(v);return {count:m.count,triangles:m.geometry.index.count/3,draws:m.geometry.groups.length,materials:mats.map(m=>m.name),textures:textures.size,uv:m.geometry.attributes.uv.count,bounds:(m.geometry.computeBoundingBox(),{min:m.geometry.boundingBox.min.toArray(),max:m.geometry.boundingBox.max.toArray()})};});
 assert.equal(evidence.resources.count,10);assert.ok(evidence.resources.triangles<1000);
 evidence.lifecycle=await page.evaluate(async()=>{
  const {installCleanerCartons}=await import('/src/fixtures/cleaner-carton.ts');
  const original=root.getObjectByName('cleaner-carton-fallback');
  const front=original.material[4].map;
  const p=new T.Group();store.scene.add(p);const fallback=original.clone();fallback.visible=true;p.add(fallback);
  let refresh=0;const release=installCleanerCartons(p,fallback,{front},new T.Color(.2,.25,.3),()=>refresh++);
  for(let i=0;i<100&&!p.getObjectByName('cleaner-carton-stock');i++)await new Promise(r=>setTimeout(r,30));
  const model=p.getObjectByName('cleaner-carton-stock');if(!model)throw Error('Test stock failed to load');
  const resources=new Set([model,model.geometry,...model.material]);
  for(const mat of model.material)for(const v of Object.values(mat))if(v?.isTexture&&v!==front)resources.add(v);
  let disposed=0,borrowedDisposed=0;resources.forEach(r=>r.addEventListener('dispose',()=>disposed++));
  const listener=()=>borrowedDisposed++;front.addEventListener('dispose',listener);
  release();release();front.removeEventListener('dispose',listener);
  const cleanup={resources:resources.size,disposed,borrowedDisposed,refresh,removed:!p.getObjectByName('cleaner-carton-stock')};
  const late=installCleanerCartons(p,fallback,{front},new T.Color(.2,.25,.3),()=>{throw Error('Retired model installed');});late();
  await new Promise(r=>setTimeout(r,1000));cleanup.lateRemoved=!p.getObjectByName('cleaner-carton-stock');p.removeFromParent();fallback.dispose();return cleanup;
 });
 assert.equal(evidence.lifecycle.resources,evidence.lifecycle.disposed);assert.equal(evidence.lifecycle.borrowedDisposed,0);assert.equal(evidence.lifecycle.refresh,1);assert.ok(evidence.lifecycle.removed&&evidence.lifecycle.lateRemoved);
 await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/models/cleaner-carton.glb')?r.abort():r.continue());
 evidence.failure=await page.evaluate(async()=>{const {installCleanerCartons}=await import('/src/fixtures/cleaner-carton.ts');const p=new T.Group();store.scene.add(p);const f=root.getObjectByName('cleaner-carton-fallback').clone();f.visible=true;p.add(f);const release=installCleanerCartons(p,f,{front:f.material[4].map},new T.Color(.2,.2,.2),()=>{});await new Promise(r=>setTimeout(r,1000));const kept=f.visible&&!p.getObjectByName('cleaner-carton-stock');release();f.dispose();p.removeFromParent();return kept;});assert.ok(evidence.failure);
}
assert.deepEqual(errors,[]);writeFileSync(resolve(out,phase+'-evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log(evidence);
}finally{await browser?.close();server.kill();unlinkSync(html);}
