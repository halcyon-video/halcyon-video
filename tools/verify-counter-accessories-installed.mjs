import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureDevelopmentScope, developmentBrowserEnvironment } from './lib/development-resources.mjs';
import { startDevServer } from './lib/dev-server.mjs';
await ensureDevelopmentScope();
const out=resolve('scratch/publicity-kits/remaining-models');mkdirSync(out,{recursive:true});
const port=4297,server=await startDevServer({port,repoRoot:process.cwd()});
const browser=await puppeteer.launch({headless:true,env:developmentBrowserEnvironment(),args:[
 '--no-sandbox','--disable-setuid-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl-egl','--disable-accelerated-video-decode',
]});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
 await page.setViewport({width:390,height:844,deviceScaleFactor:2});
 await page.evaluateOnNewDocument(()=>{localStorage.clear();});
 await page.goto('http://localhost:'+port+'/harness.html?fast=1&quality=high&lib=200&state=tipjar',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__ready,{timeout:120000});
 await page.waitForFunction(()=>{
  const s=window.store;if(!s)return false;let mug=false,holder=false;
  s.scene.traverse(o=>{if(o.name==='display-model'&&o.visible){
   if(o.parent.name==='tip-mug')mug=true;
   if(o.parent.name==='tip-card-holder')holder=true;
  }});
  return mug&&holder;
 },{timeout:120000});
 const result=await page.evaluate(()=>{
  const s=window.store;s.pauseRendering();s.renderer.setPixelRatio(2);s.renderer.setSize(390,844,false);
  const tip=s.scene.getObjectByName('counter-tip-jar');
  let tray; s.scene.traverse(o=>{if(o.children.some(c=>c.name==='cleaner-carton-stock'))tray=o;});
  if(!tip)throw Error('Tip fixture missing');
  if(tray)throw Error('Dormant cleaner merchandise was unexpectedly reinstated');
  window.counterPhoto=(which,offset,target)=>{
   const root=which==='tip'?tip:tray;root.updateWorldMatrix(true,true);
   const v=root.position.clone();v.set(...offset);root.localToWorld(v);s.camera.position.copy(v);
   const t=root.position.clone();t.set(...target);root.localToWorld(t);s.camera.lookAt(t);s.camera.updateMatrixWorld(true);
   s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();
  };
  let meshes=0,triangles=0;
  tip.traverseVisible(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.count??1);}});
  return {tip:{position:tip.position.toArray(),yaw:tip.rotation.y},cleanerMerchandiseRemainsDormant:true,meshes,triangles,phoneViewport:[390,844],physicalPhone:false};
 });
 for(const [name,which,offset,target]of[
  ['tip-installed-front','tip',[.1,1.6,3.6],[.1,.42,0]],
  ['tip-installed-side','tip',[-2.5,1.5,1.6],[.05,.4,0]],
  ['tip-installed-rear','tip',[.1,1.7,-3.5],[.1,.4,0]],
 ]){
  const data=await page.evaluate(({which,offset,target})=>window.counterPhoto(which,offset,target),{which,offset,target});
  writeFileSync(out+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));
 }
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(out+'/counter-installed.json',JSON.stringify({...result,pageErrors:errors},null,2)+'\n');
 console.log(JSON.stringify(result));
}finally{await browser.close();server.stop();}
