// Real StoreScene photographs and lifecycle checks. Start Vite on PODIUM_PORT.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readdirSync,unlinkSync} from 'node:fs';
const out=process.env.PODIUM_OUT||'scratch/catalog-podium';mkdirSync(out,{recursive:true});
assert.deepEqual(readdirSync('public/user-assets'),['README.md']);
const html='tools/.catalog-podium-check.html';
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:640px;height:480px"></div><script type="module">
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1990,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.s=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});s.pauseRendering();await s.ready;};</script>`);
const browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
try {
 const page=await browser.newPage();await page.setViewport({width:640,height:480});
 page.on('requestfailed',r=>console.log('REQUEST',r.url(),r.failure()?.errorText));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{localStorage.clear();for(const [k,v] of Object.entries({bb_quality:'low',bb_theme:'bb-1990',bb_outside:'day',bb_store_format:'corporate',bb_ssao:'0',bb_tv_demo_loop:'0'}))localStorage.setItem(k,v);});
 await page.goto(`http://127.0.0.1:${process.env.PODIUM_PORT||4200}/${html}`,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>window.boot());console.log('Store ready');
 await page.waitForFunction(()=>s.scene.getObjectByName('catalog-podium-checkout')?.getObjectByName('display-model'),{timeout:120000});
 const metrics=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');window.T=T;
  s.pauseRendering();s.overviewCursors?.setVisible(false);if(s.selectionArrow)s.selectionArrow.visible=false;
  s.renderer.setPixelRatio(1);s.renderer.setSize(1200,900,false);s.camera.aspect=4/3;s.camera.updateProjectionMatrix();
  const g=s.scene.getObjectByName('catalog-podium-checkout');window.g=g;const model=g.getObjectByName('display-model');
  const b=new T.Box3().setFromObject(model);let triangles=0,draws=0;const textures=new Set();const surfaces=[];
  model.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;draws++;surfaces.push({material:o.material.name,uv:!!o.geometry.attributes.uv,map:!!o.material.map,normal:!!o.material.normalMap,roughness:!!o.material.roughnessMap});Object.values(o.material).forEach(v=>{if(v?.isTexture)textures.add(v);});});
  window.shot=(pos,target,before)=>{g.visible=!before;s.camera.position.set(...pos);s.camera.lookAt(...target);s.camera.updateMatrixWorld();s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();};
  return {layoutViolations:(window.__layoutViolations||[]).filter(v=>/catalog-podium/.test(v.a+' '+v.b)),bounds:{min:b.min.toArray(),max:b.max.toArray()},triangles,draws,textures:textures.size,surfaces,fallbackHidden:!g.getObjectByName('display-fallback').visible};
 });
 for(const [name,p,t] of [
  ['before',[-.5,5.4,7],[-5,1.8,-3]],['after',[-.5,5.4,7],[-5,1.8,-3]],
  ['working-height',[-4.4,4.6,1.2],[-5,2.6,-3]],['side',[-.5,3.4,-3],[-5,1.8,-3]],
  ['rear',[-7.5,3.8,-6],[-5,2,-3]],['bindings',[-4.4,4.4,-1.5],[-5,2.9,-3]],
 ]){const data=await page.evaluate(({p,t,name})=>shot(p,t,name==='before'),{p,t,name});writeFileSync(out+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));console.log(name);}
 assert.deepEqual(metrics.layoutViolations,[]);
 assert.ok(metrics.surfaces.every(m=>m.uv&&m.map&&m.normal&&m.roughness));assert.ok(metrics.fallbackHidden);
 // Exercise the same class in a small scene to make disposal accounting exact.
 await page.evaluate(async()=>{
  const {admitFixturePlacements}=await import('/src/store-fixtures-config.ts');
  if(admitFixturePlacements([{kind:'catalog-podium'}],{floorDisplays:false,counterShape:'desk'}).length)throw Error('Small-store gate failed');
  const {CatalogPodium}=await import('/src/fixtures/catalog-podium.ts');window.K=CatalogPodium;window.logs=[];window.colliders=[];
  window.ctx={...s.fixtureContext(),scene:new T.Scene(),addCollider:o=>colliders.push(o),log:m=>logs.push(m),requestRender(){},requestShadowRefresh(){}};
  window.p={id:'test-podium',kind:'catalog-podium',position:{x:0,z:0},yaw:Math.PI/2};window.f=new K(p,ctx);f.build();
 });
 await page.waitForFunction(()=>ctx.scene.getObjectByName('display-model'));
 const lifecycle=await page.evaluate(()=>{
  const group=ctx.scene.getObjectByName('test-podium'),resources=new Set();group.traverse(o=>{if(o.isMesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);Object.values(m).forEach(v=>{if(v?.isTexture)resources.add(v);});}}});
  let disposed=0;resources.forEach(o=>o.addEventListener('dispose',()=>disposed++));const fp=f.getFootprint();f.dispose();f.dispose();const hits=[];colliders[0].raycast(new T.Raycaster(),hits);
  const gate={};for(const id of ['bb-1993','bb-2000','bb-2010']){const k=new K(p,{...ctx,activeTheme:{...ctx.activeTheme,id}});k.build();gate[id]=k.getFootprint()===null;k.dispose();}
  return {expected:resources.size,disposed,detached:ctx.scene.children.length===0,footprint:fp,disposedColliderHits:hits.length,gate};
 });
 assert.equal(lifecycle.expected,lifecycle.disposed);assert.ok(lifecycle.detached);assert.equal(lifecycle.disposedColliderHits,0);assert.ok(Object.values(lifecycle.gate).every(Boolean));
 await page.setRequestInterception(true);let mode='fail',pending;
 page.on('request',r=>{if(r.url().endsWith('/models/catalog-podium.glb')){if(mode==='fail')void r.respond({status:404,body:'Deliberate fallback test'});else pending=r;}else void r.continue();});
 await page.evaluate(()=>f.build());await page.waitForFunction(()=>logs.length>0);
 assert.ok(await page.evaluate(()=>ctx.scene.getObjectByName('display-fallback').visible&&!ctx.scene.getObjectByName('display-model')));
 mode='delay';await page.evaluate(()=>f.build());
 const deadline=Date.now()+10000;while(!pending&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));assert.ok(pending);
 await page.evaluate(()=>f.dispose());await pending.continue();await page.waitForNetworkIdle();
 assert.equal(await page.evaluate(()=>ctx.scene.children.length),0);assert.deepEqual(errors,[]);
 writeFileSync(out+'/verification.json',JSON.stringify({metrics,lifecycle,errorFallback:true,lateLoadDetached:true,pageErrors:errors},null,2));
 console.log(JSON.stringify({metrics,lifecycle}));
} finally {await browser.close();unlinkSync(html);}
