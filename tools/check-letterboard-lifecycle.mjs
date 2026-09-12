// Exercise the production fixture and GLB in a browser without building a store.
import puppeteer from 'puppeteer';
import {writeFileSync, unlinkSync} from 'node:fs';
const html=new URL('./.letterboard-check.html',import.meta.url);
writeFileSync(html,`<!doctype html><title>Letterboard checks</title><script type="module">import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';import {ComingSoonLetterboard} from '/src/fixtures/coming-soon-letterboard.ts';window.checkModules={T,Loader:GLTFLoader,Fixture:ComingSoonLetterboard};</script>`);
const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.goto(`http://localhost:${process.env.LETTERBOARD_PORT || 4239}/tools/.letterboard-check.html`);
 await page.waitForFunction(()=>!!window.checkModules);
 const report=await page.evaluate(async()=>{
  localStorage.clear();localStorage.setItem('bb_theme','bb-1990');
  const {T,Loader,Fixture}=window.checkModules;
  const bytes=await(await fetch('/models/coming-soon-letterboard.glb')).arrayBuffer();
  const original=Loader.prototype.load;let pending;
  Loader.prototype.load=function(url,success,progress,error){pending={url,success,error};};
  const assert=(yes,why)=>{if(!yes)throw Error(why);};
  const counts=root=>{const set=new Set();root.traverse(o=>{if(o.isMesh){set.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])set.add(m);}});const map=new Map();for(const r of set){map.set(r,0);r.addEventListener('dispose',()=>map.set(r,map.get(r)+1));}return map;};
  const ctx=()=>({scene:new T.Scene(),libraries:[],staffPickMovies:[],storefrontSpec:{counterShape:'shield'},log(){},addCollider(){},requestRender(){},requestShadowRefresh(){}});
  const placement={id:'test',kind:'coming-soon-letterboard',position:{x:9,z:7.75},yaw:Math.PI,options:{themes:['bb-1990']}};
  const reports=[];
  try{
   for(const mode of ['success','failure','late','detached']){
    const c=ctx();let renders=0,shadows=0,colliders=0;c.requestRender=()=>renders++;c.requestShadowRefresh=()=>shadows++;c.addCollider=()=>colliders++;
    const f=new Fixture(placement,c);f.build();const g=c.scene.children[0];const fallback=g.getObjectByName('display-fallback');
    assert(fallback.visible,'fallback visible while loading');assert(pending.url.endsWith('models/coming-soon-letterboard.glb'),'base-path model request');assert(colliders===1 && f.getFootprint()===null,'original counter-only collision');
    if(mode==='failure'){pending.error(Error('intentional failure'));assert(fallback.visible,'fallback on error');f.dispose();reports.push({mode,passed:true});continue;}
    const model=await new Loader().parseAsync(bytes.slice(0),'');const imported=counts(model.scene);const fallbackCounts=counts(fallback);
    if(mode==='late')f.dispose();if(mode==='detached')g.removeFromParent();
    const oldRenders=renders,oldShadows=shadows;pending.success(model);
    if(mode==='success'){
     assert(!fallback.visible && g.getObjectByName('display-model'),'successful atomic install');assert(renders===oldRenders+1&&shadows===oldShadows+1,'load refresh');
     let live;model.scene.traverse(o=>{if(o.isMesh&&o.material.map)live=o;});assert(live,'live canvas installed');
     const mat=live.material;assert(mat===fallback.children[0].material[4],'face material shared with fallback');
     const uv=live.geometry.getAttribute('uv'),pos=live.geometry.getAttribute('position');
     for(let i=0;i<uv.count;i++)assert(Math.abs(uv.getY(i)-(pos.getY(i)/3.5+.5))<1e-6,'upright runtime canvas UV');
     const first=mat.map;let oldDisposed=0;first.addEventListener('dispose',()=>oldDisposed++);
     c.libraries=[{id:'test',movies:[{id:'1',title:'Live replacement',premiereDate:new Date(Date.now()+86400000*30).toISOString()}]}];
     f.refreshFromFeed();assert(mat.map!==first&&oldDisposed===1,'live feed replaces and releases canvas');
     const second=mat.map;f.refreshFromFeed();assert(mat.map===second,'same rows reuse canvas');
     let finalDisposed=0;second.addEventListener('dispose',()=>finalDisposed++);
     f.dispose();f.dispose();assert(finalDisposed===1,'live canvas disposal once');
     assert([...fallbackCounts.values()].every(n=>n===1),'fallback resources disposed once');
    }else{
     assert(!g.getObjectByName('display-model'),'late/detached model rejected');assert(renders===oldRenders&&shadows===oldShadows,'late model no refresh');f.dispose();
    }
    assert([...imported.values()].every(n=>n===1),'all imported resources disposed once');assert(c.scene.children.length===0,'teardown removes fixture');reports.push({mode,passed:true});
   }
   for(const [shape,themes] of [['usquare',['bb-1990']],['shield',['bb-1993']]]){
    const c=ctx();c.storefrontSpec.counterShape=shape;const f=new Fixture({...placement,options:{themes}},c);pending=null;f.build();assert(c.scene.children.length===0&&!pending,'layout/era gate');f.dispose();reports.push({shape,themes,gated:true});
   }
   // A disposed fixture can be rebuilt and obtain a fresh model safely.
   const c=ctx(),f=new Fixture(placement,c);f.build();f.dispose();f.build();pending.success(await new Loader().parseAsync(bytes.slice(0),''));assert(c.scene.children[0].getObjectByName('display-model'),'rebuild installs');f.dispose();reports.push({rebuild:true});
   return reports;
  }finally{Loader.prototype.load=original;}
 });
 console.log(JSON.stringify(report,null,2));
 if(process.env.LETTERBOARD_OUT)writeFileSync(process.env.LETTERBOARD_OUT+'/lifecycle.json',JSON.stringify(report,null,2));
}finally{await browser.close();unlinkSync(html);}
