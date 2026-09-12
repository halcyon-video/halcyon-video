// Actual-store photographs, adapted from verify-office-kit and verify-bollards.
// Run VITE_DEMO=1 Vite on LETTERBOARD_PORT, then this script.
// BEFORE=1 captures the untouched procedural fixture before integration.
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
const out = process.env.LETTERBOARD_OUT || '/home/devin/mognet-workers/out/astra-halcyon-239';
mkdirSync(out, {recursive:true});
const before=!!process.env.BEFORE;
const html=new URL('./.letterboard-store.html',import.meta.url);
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:500px;height:400px"></div><script type="module">
import {StoreScene} from '/src/three-scene.ts';
window.boot=async()=>{const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));
const s=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});s.pauseRendering();window.storeScene=s;await s.ready;};</script>`);
const browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
try {
 const page=await browser.newPage();await page.setViewport({width:500,height:400});
 page.on('console', m=>{if(/Loading store textures|Inside the store|Display model unavailable/.test(m.text()))console.log(m.text());});
 page.on('pageerror', e=>console.log('PAGE ERROR',e.message));
 await page.evaluateOnNewDocument(()=>{localStorage.clear();localStorage.setItem('bb_quality','low');localStorage.setItem('bb_theme','bb-1990');localStorage.setItem('bb_outside','day');localStorage.setItem('bb_store_format','corporate');localStorage.setItem('bb_ssao','0');localStorage.setItem('bb_tv_demo_loop','0');});
 await page.goto(`http://localhost:${process.env.LETTERBOARD_PORT || 4239}/tools/.letterboard-store.html`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>!!window.boot);
 console.log('Booting actual StoreScene');
 await page.evaluate(()=>window.boot());
 console.log('Store ready');
 await page.waitForFunction((before)=>{
  const g=window.storeScene?.scene.getObjectByName('coming-soon-letterboard-coming-soon-letterboard-counter-end');
  return g && (before || g.getObjectByName('display-model'));
 },{timeout:600000,polling:1000},before);
 console.log('Letterboard ready');
 await new Promise(r=>setTimeout(r,1500));
 const metrics=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');const s=window.storeScene;s.pauseRendering();
  s.renderer.setPixelRatio(1);s.renderer.setSize(1000,800,false);
  const g=s.scene.getObjectByName('coming-soon-letterboard-coming-soon-letterboard-counter-end');
  const model=g.getObjectByName('display-model');const b=new T.Box3().setFromObject(model || g, true);
  return {bounds:{min:b.min.toArray(),max:b.max.toArray()},model:!!model};
 });
 writeFileSync(`${out}/${before?'before':'after'}-bounds.json`,JSON.stringify(metrics,null,2));
 for(const [name,pos,target] of [
  ['store',[9,5.5,1.5],[9,5.1,7.8]],
  ['front',[9,5.5,4.6],[9,5.35,8.05]],
  ['side',[12,5.3,7.15],[9,5.3,8.05]],
  ['rear',[10.5,5.6,10.3],[9,5.35,8.1]],
  ['rear-support',[10.5,7.1,9.7],[9,6.7,8.4]],
  ['contact',[10.7,3.9,7.35],[9.75,3.62,7.77]],
 ]){
  const data=await page.evaluate(({pos,target})=>{const s=window.storeScene;s.camera.position.set(...pos);s.camera.lookAt(...target);s.camera.updateMatrixWorld();s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();},{pos,target});
  writeFileSync(`${out}/${before?'before':'after'}-${name}.png`,Buffer.from(data.split(',')[1],'base64'));console.log(name);
 }
 console.log(metrics);
}finally{await browser.close();unlinkSync(html);}
