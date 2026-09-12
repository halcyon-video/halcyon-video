// Real store photographs plus GLB/lifecycle/stock-support checks.
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync,unlinkSync,readFileSync,existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
const root=new URL('../',import.meta.url).pathname,out=process.argv[2]||'/tmp/power-wing-evidence';mkdirSync(out,{recursive:true});
const html=root+'tools/verify-power-wing.html',port=4404;
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1100px;height:850px"></div><script type="module">
import * as T from 'three'; import {CandyDisplay} from '/src/fixtures/period-fixtures.ts';window.T=T;window.CandyDisplay=CandyDisplay;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1993,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});let browser;const evidence=existsSync(`${out}/evidence.json`)?JSON.parse(readFileSync(`${out}/evidence.json`,'utf8')):{};
try{
 for(let i=0;;i++){try{if((await fetch(`http://localhost:${port}`)).ok)break;}catch{}if(i>100)throw Error('Vite timeout');await delay(100);}
 browser=await puppeteer.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.setViewport({width:1100,height:850});page.on('pageerror',e=>console.log('PAGE',e.message));
 let mode='success',held;await page.setRequestInterception(true);page.on('request',r=>{if(r.url().includes('/user-assets/'))return void r.abort();if(r.url().endsWith('candy-power-wing.glb')){if(mode==='failure')return void r.abort();if(mode==='hold'){held=r;return;}}void r.continue();});
 const open=async()=>{await page.goto(`http://localhost:${port}/tools/verify-power-wing.html`);await page.waitForFunction(()=>!!window.CandyDisplay);};
 if(!process.argv.includes('--store-only')) {
 await open();await page.evaluate(()=>{
  localStorage.setItem('bb_theme','bb-1993');window.deleted=new Set();for(const proto of [T.BufferGeometry.prototype,T.Material.prototype,T.Texture.prototype]){const old=proto.dispose;proto.dispose=function(){window.deleted.add(this.uuid);old.call(this);};}
  window.make=()=>{const scene=new T.Scene();window.rack={scene,logs:[],renders:0};const ctx={scene,addCollider(){},requestShadowRefresh(){},requestRender(){rack.renders++;},log(s){rack.logs.push(s);}};rack.fixture=new CandyDisplay({id:'candy-display-front',kind:'candy-display',position:{x:0,z:0},yaw:0,options:{powerWing:true}},ctx);rack.fixture.build();};window.make();
 });await page.waitForFunction(()=>!!rack.scene.getObjectByName('candy-power-wing-model'));
 evidence.asset=await page.evaluate(()=>{
  const model=rack.scene.getObjectByName('candy-power-wing-model');model.updateMatrixWorld(true);const b=new T.Box3().setFromObject(model);let triangles=0,draws=0;const ids=new Set(),textures=new Set();model.traverse(o=>{if(!o.isMesh)return;draws++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;ids.add(o.geometry.uuid);ids.add(o.material.uuid);for(const a of ['position','normal','uv'])if(!o.geometry.attributes[a]||![...o.geometry.attributes[a].array].every(Number.isFinite))throw Error('Invalid attributes');for(const t of Object.values(o.material))if(t?.isTexture){ids.add(t.uuid);textures.add(t.uuid);}});
  let contacts=0;const stock=model.parent.children.filter(o=>o.name.startsWith('candy-stock-'));const normal=new T.Vector3(0,Math.cos(-Math.PI/15),Math.sin(-Math.PI/15));for(const inst of stock)for(let i=0;i<inst.count;i++){const m=new T.Matrix4();inst.getMatrixAt(i,m);for(const x of [-.16,.16])for(const z of [-.09,.09]){const p=new T.Vector3(x,-.21,z).applyMatrix4(m);const ray=new T.Raycaster(p.addScaledVector(normal,.005),normal.clone().negate(),0,.01);if(!ray.intersectObject(model,true).length)throw Error('Stock unsupported');contacts++;}}
  const result={min:b.min.toArray(),max:b.max.toArray(),triangles,draws,textures:textures.size,contacts,rows:rack.fixture.rows};rack.fixture.dispose();result.released=[...ids].every(id=>window.deleted.has(id));result.detached=rack.scene.children.length===0;return result;
 });assert.ok(evidence.asset.released&&evidence.asset.detached);assert.ok(evidence.asset.min[0]>=-1.5&&evidence.asset.max[0]<=1.5);assert.ok(evidence.asset.min[2]>=-.8&&evidence.asset.max[2]<=.8);assert.equal(evidence.asset.contacts,700);assert.equal(evidence.asset.rows.length,5);
 mode='failure';await page.evaluate(()=>make());await page.waitForFunction(()=>rack.logs.length>0);assert.ok(await page.evaluate(()=>rack.scene.getObjectByName('candy-rack-fallback').visible));await page.evaluate(()=>rack.fixture.dispose());evidence.failureFallback=true;
 mode='hold';await page.setCacheEnabled(false);await page.evaluate(()=>make());for(let i=0;!held;i++){if(i>100)throw Error('hold timeout');await delay(50);}const before=await page.evaluate(()=>{rack.fixture.dispose();return deleted.size;});await held.continue();await page.waitForFunction(n=>deleted.size>=n+11,{},before);assert.ok(await page.evaluate(()=>rack.scene.children.length===0&&rack.renders===0));evidence.lateLoadReleased=true;mode='success';
 // Inspect the exact exported model with runtime print from both sides.
 await page.evaluate(()=>make());await page.waitForFunction(()=>!!rack.scene.getObjectByName('candy-power-wing-model'));await page.evaluate(()=>{const scene=rack.scene;scene.background=new T.Color('#78828d');scene.add(new T.HemisphereLight(0xffffff,0x888888,2));const l=new T.DirectionalLight(0xffffff,3);l.position.set(-3,7,-5);scene.add(l);const r=new T.WebGLRenderer({antialias:true});r.setSize(1100,850);document.getElementById('store').replaceChildren(r.domElement);const c=new T.PerspectiveCamera(36,1100/850,.01,100);window.draw=p=>{c.position.fromArray(p);c.lookAt(0,2.2,0);r.render(scene,c);};});
 for(const [name,p] of Object.entries({front:[4,4,-7],side:[8.5,3.6,-1.5],rear:[3,4,7]})){await page.evaluate(p=>draw(p),p);await page.screenshot({path:`${out}/detail-${name}.png`});}
 }
 writeFileSync(`${out}/evidence.json`,JSON.stringify(evidence,null,2)+'\n');
 for(const preset of ['standard','usquare-counter']){
  console.log('STORE',preset);
  await open();await page.evaluate(p=>{localStorage.clear();for(const[k,v]of Object.entries({bb_store_format:'corporate',bb_theme:'bb-1993',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_storefront:p}))localStorage.setItem(k,v);},preset);await page.evaluate(()=>boot());await page.waitForFunction(()=>!!store.scene.getObjectByName('candy-power-wing-model'));await delay(1200);
  await page.evaluate(()=>{const g=store.scene.getObjectByName('candy-power-wing-model').parent;const previous=new Set(store.scene.children);window.beforeFixture=new CandyDisplay({id:'before-candy',kind:'candy-display',position:{x:g.position.x,z:g.position.z},yaw:g.rotation.y,options:{dispenserPacks:true}},{scene:store.scene,addCollider(){},requestRender(){store.requestRender();},requestShadowRefresh(){store.renderer.shadowMap.needsUpdate=true;},log(){}});beforeFixture.build();window.beforeGroup=store.scene.children.find(o=>!previous.has(o));beforeGroup.visible=false;});
  await page.waitForFunction(()=>!!beforeGroup.getObjectByName('candy-rack-model')&&!!beforeGroup.getObjectByName('candy-dispenser-model'));
  evidence[preset]=await page.evaluate(()=>({violations:(window.__layoutViolations||[]).filter(v=>JSON.stringify(v).includes('candy')),clerkPath:store.debugClerkPathAudit()}));assert.deepEqual(evidence[preset].violations,[]);assert.equal(evidence[preset].clerkPath,true);
  for(const [view,p] of Object.entries({front:[3.8,5.5,-6],side:[6,5,-.6],rear:[2.5,7,5]})){
   await page.evaluate(p=>{const model=store.scene.getObjectByName('candy-power-wing-model'),g=model.parent;g.updateMatrixWorld(true);const eye=g.localToWorld(new T.Vector3(...p)),target=g.localToWorld(new T.Vector3(0,2,0));const dx=eye.x-target.x,dz=eye.z-target.z;store.teleportWalk(eye.x,eye.z,Math.atan2(dx,dz)*180/Math.PI,Math.atan2(target.y-eye.y,Math.hypot(dx,dz))*180/Math.PI,eye.y,true);store.requestRender();},p);
   for(const state of ['after','before']){await page.evaluate(state=>{const m=store.scene.getObjectByName('candy-power-wing-model');m.parent.visible=state==='after';beforeGroup.visible=state==='before';store.requestRender();},state);await delay(300);const png=await page.evaluate(()=>{window.debugResetResScale?.();return store.captureFeedbackSnapshot().png;});writeFileSync(`${out}/${preset}-${state}-${view}.png`,Buffer.from(png.split(',')[1],'base64'));}
  }
 }
 writeFileSync(`${out}/evidence.json`,JSON.stringify(evidence,null,2)+'\n');console.log('PASS',JSON.stringify(evidence));
}finally{await browser?.close();server.kill();unlinkSync(html);}
