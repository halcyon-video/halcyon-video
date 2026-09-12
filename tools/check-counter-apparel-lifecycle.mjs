// Actual GLTF loader and fixture; no renderer needed. Start Vite on APPAREL_PORT.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {writeFileSync,unlinkSync} from 'node:fs';
const html='tools/counter-apparel-lifecycle.html';writeFileSync(html,'<body>Apparel lifecycle check</body>');
const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage();await page.goto(`http://localhost:${process.env.APPAREL_PORT||4205}/${html}`);
 const results=await page.evaluate(async()=>{
  localStorage.clear();localStorage.setItem('bb_store_format','corporate');
  const source=await(await fetch('/src/fixtures/display-model.ts')).text();
  const T=await import(source.match(/from ["']([^"']*three[^"']*)["']/)[1]);
  const {GLTFLoader}=await import(source.match(/from ["']([^"']*GLTFLoader[^"']*)["']/)[1]);
  const {CounterApparel}=await import('/src/fixtures/counter-apparel.ts');
  const original=GLTFLoader.prototype.load,results={};
  for(const mode of ['installed','late','detached','failure','wrong-era','no-glass']) {
   const scene=new T.Scene(),ctx={scene,activeTheme:{id:mode==='wrong-era'?'bb-2000':'bb-1993'},storefrontSpec:{entryStyle:mode==='no-glass'?'storefront-door':'vestibule',doorWidth:3.2},requestRender:()=>{},requestShadowRefresh:()=>{},log:()=>{}};
   const fixture=new CounterApparel({id:'test',kind:'counter-apparel',position:{x:15,z:0},yaw:Math.PI},ctx);
   let finish;const done=new Promise(r=>finish=r);const stats={loads:0,expected:{geometry:0,material:0,texture:0},disposed:{geometry:0,material:0,texture:0}};
   GLTFLoader.prototype.load=function(url,onLoad,progress,onError){
    stats.loads++;
    if(mode==='failure'){queueMicrotask(()=>{onError(new Error('deliberate offline'));finish();});return;}
    return original.call(this,url,g=>{
     const sets={geometry:new Set(),material:new Set(),texture:new Set()};
     g.scene.traverse(o=>{if(o.isMesh){sets.geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){sets.material.add(m);Object.values(m).forEach(v=>{if(v instanceof T.Texture)sets.texture.add(v);});}}});
     for(const [key,set] of Object.entries(sets)){stats.expected[key]=set.size;set.forEach(v=>v.addEventListener('dispose',()=>stats.disposed[key]++));}
     if(mode==='late')fixture.dispose();if(mode==='detached')scene.getObjectByName('test').removeFromParent();
     onLoad(g);finish();
    },progress,e=>{onError(e);finish();});
   };
   fixture.build();if(stats.loads)await done;
   stats.installed=!!scene.getObjectByName('display-model');stats.fallback=scene.getObjectByName('display-fallback')?.visible;
   stats.floor=fixture.getFootprint();fixture.dispose();fixture.dispose();stats.removed=!scene.getObjectByName('test');results[mode]=stats;
  }
  GLTFLoader.prototype.load=original;
  const {installDisplayModel}=await import('/src/fixtures/display-model.ts');
  const scene=new T.Scene(),parent=new T.Group(),fallback=new T.Group();scene.add(parent);parent.add(fallback);
  const sharedMap=new T.Texture(),sharedFinish=new T.MeshStandardMaterial({map:sharedMap});
  let finishDisposals=0,mapDisposals=0,finishLoad;
  sharedMap.addEventListener('dispose',()=>mapDisposals++);sharedFinish.addEventListener('dispose',()=>finishDisposals++);
  const loaded=new Promise(r=>finishLoad=r);
  GLTFLoader.prototype.load=function(url,onLoad,progress,onError){return original.call(this,url,g=>{onLoad(g);finishLoad();},progress,onError);};
  const remove=installDisplayModel({scene,requestRender:()=>{},requestShadowRefresh:()=>{},log:()=>{}},parent,fallback,'models/counter-apparel.glb',{ShirtCotton:sharedFinish});
  await loaded;remove();results.sharedFinish={finishDisposals,mapDisposals};sharedFinish.dispose();sharedMap.dispose();
  GLTFLoader.prototype.load=original;return results;
 });
 for(const mode of ['installed','late','detached']) {assert.deepEqual(results[mode].disposed,results[mode].expected);assert.equal(results[mode].expected.geometry,5);assert.ok(results[mode].expected.texture>=5);assert.equal(results[mode].removed,true);assert.equal(results[mode].floor,null);}
 assert.deepEqual(results.sharedFinish,{finishDisposals:0,mapDisposals:0});
 assert.equal(results.installed.installed,true);assert.equal(results.installed.fallback,false);
 for(const mode of ['late','detached','failure','wrong-era','no-glass'])assert.equal(results[mode].installed,false);
 assert.equal(results.failure.fallback,true);assert.equal(results['wrong-era'].loads,0);assert.equal(results['no-glass'].loads,0);
 writeFileSync(process.argv[2]||'scratch/apparel-lifecycle.json',JSON.stringify(results,null,2));console.log('PASS',JSON.stringify(results));
} finally {await browser.close();unlinkSync(html);}
