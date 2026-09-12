// Adapted from verify-candy-rack.mjs: real loader success, failure and teardown.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
const port=6291;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser;
try {
 for(let i=0;i<100;i++){try{if((await fetch(`http://localhost:${port}`)).ok)break;}catch{}await delay(100);}
 browser=await puppeteer.launch({args:['--no-sandbox']});const page=await browser.newPage();
 let mode='success',held=[];
 await page.setRequestInterception(true);
 page.on('request',r=>{
  if(r.url().endsWith('/__poster_check'))return void r.respond({status:200,contentType:'text/html',body:'<html></html>'});
  if(r.url().includes('poster-frame-')&&r.url().endsWith('.glb')){
   if(mode==='hold'){held.push(r);return;}
   if(mode==='failure')return void r.abort();
  }
  void r.continue();
 });
 await page.goto(`http://localhost:${port}/__poster_check`);
 await page.evaluate(async()=>{
  const source=await(await fetch('/src/poster-frame-model.ts')).text();
  const T=await import(source.match(/from ["']([^"']*three[^"']*)["']/)[1]);
  const {installPosterFrame}=await import('/src/poster-frame-model.ts');
  window.T=T;window.deleted=new Set();
  for(const proto of [T.BufferGeometry.prototype,T.Material.prototype]){
   const dispose=proto.dispose;proto.dispose=function(){window.deleted.add(this.uuid);dispose.call(this);};
  }
  window.make=(variant='window')=>{
   const scene=new T.Scene(),parent=new T.Group(),fallback=new T.Group(),finish=new T.MeshStandardMaterial();
   fallback.add(new T.Mesh(new T.BoxGeometry(3,4,.2),finish));parent.add(fallback);scene.add(parent);
   const state={scene,parent,fallback,finish,renders:0,shadows:0};window.state=state;
   installPosterFrame({scene,renderer:{shadowMap:{}},requestRender(){state.renders++;},queueStructuralShadowRefresh(){state.shadows++;}},parent,fallback,variant,finish,variant==='window'?2.5:4.7*2/3,variant==='window'?3.75:4.7);
  };
 });
 const results=[];
 for(const variant of ['window','wall']){
  await page.evaluate(v=>window.make(v),variant);
  await page.waitForFunction(()=>window.state.renders===1);
  const state=await page.evaluate(async()=>{
   const s=window.state,m=s.parent.getObjectByName('display-model'),ids=[];
   m.traverse(o=>{if(o.isMesh){ids.push(o.geometry.uuid);if(o.material!==s.finish)ids.push(o.material.uuid);}});
   const hidden=!s.fallback.visible;
   // Exercise the exact static scene traversal used by StoreScene.destroy.
   s.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
   await Promise.resolve();
   return {hidden,released:ids.every(id=>window.deleted.has(id)),detached:!m.parent,shadows:s.shadows};
  });
  assert.deepEqual(state,{hidden:true,released:true,detached:true,shadows:1});results.push({variant,...state});
 }
 mode='failure';await page.evaluate(()=>window.make());await delay(600);
 assert.ok(await page.evaluate(()=>window.state.fallback.visible&&window.state.renders===0));results.push({failureRetainsFallback:true});
 mode='hold';await page.setCacheEnabled(false);await page.evaluate(()=>window.make());
 for(let i=0;!held.length;i++){assert.ok(i<100);await delay(30);}
 const before=await page.evaluate(()=>{window.state.scene.remove(window.state.parent);return window.deleted.size;});
 for(const r of held)await r.continue();held=[];
 await page.waitForFunction(n=>window.deleted.size>=n+6,{},before);
 assert.ok(await page.evaluate(()=>window.state.renders===0&&!window.state.parent.getObjectByName('display-model')));
 results.push({lateDetachedLoadReleased:true});
 // Pending load cancelled by the scene's geometry-disposal sentinel too.
 await page.evaluate(()=>window.make());for(let i=0;!held.length;i++){assert.ok(i<100);await delay(30);}
 const n=await page.evaluate(async()=>{window.state.fallback.children[0].geometry.dispose();await Promise.resolve();return window.deleted.size;});
 for(const r of held)await r.continue();held=[];
 await page.waitForFunction(n=>window.deleted.size>=n+6,{},n);
 assert.ok(await page.evaluate(()=>window.state.renders===0));results.push({lateDisposedLoadReleased:true});
 console.log(JSON.stringify(results,null,2));
 if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(results,null,2)+'\n');
} finally {await browser?.close();server.kill();}
