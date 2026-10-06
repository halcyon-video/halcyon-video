import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureDevelopmentScope, developmentBrowserEnvironment } from './lib/development-resources.mjs';
import { startDevServer } from './lib/dev-server.mjs';
await ensureDevelopmentScope();
const out=resolve('scratch/publicity-kits/remaining-models');mkdirSync(out,{recursive:true});
if(readdirSync('public/user-assets').some(n=>n!=='README.md'))throw Error('Public screenshots require a clean asset tree');
const port=4297,html=resolve('tools/sale-table-review.html');
writeFileSync(html,`<body><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {PvDrapeTable} from '/src/fixtures/pv-drape-table.ts';import {initCaseMedium} from '/src/video-case.ts';
import {getActiveTheme} from '/src/themes.ts';
window.T=T;window.Loader=GLTFLoader;window.Table=PvDrapeTable;window.medium=initCaseMedium;window.theme=getActiveTheme;window.ready=true;
</script>`);
const server=await startDevServer({port,repoRoot:process.cwd()});
const browser=await puppeteer.launch({headless:true,env:developmentBrowserEnvironment(),args:[
 '--no-sandbox','--disable-setuid-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl-egl','--disable-accelerated-video-decode',
]});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
 page.on('console',m=>{if(/saletableproof|Sale table not admitted|\[harness\] READY/.test(m.text()))console.log(m.text());});
 if(!process.argv.includes('--installed-only')) {
 await page.goto('http://localhost:'+port+'/tools/sale-table-review.html');await page.waitForFunction(()=>window.ready);
 const lifecycle=await page.evaluate(async()=>{
  const T=window.T,L=window.Loader,assert=(c,m)=>{if(!c)throw Error(m);};
  const bytes={};for(const f of ['sale-table','sale-table-rack'])bytes[f]=await(await fetch('/models/'+f+'.glb')).arrayBuffer();
  const resources=root=>{const set=new Set();root.traverse(o=>{if(o.isMesh){set.add(o.geometry);if(o.isInstancedMesh)set.add(o);for(const m of Array.isArray(o.material)?o.material:[o.material]){set.add(m);for(const t of Object.values(m))if(t?.isTexture)set.add(t);}}});return set;};
  const watch=set=>{const c=new Map();for(const v of set){c.set(v,0);v.addEventListener('dispose',()=>c.set(v,c.get(v)+1));}return c;};
  const once=(c,label)=>assert([...c.values()].every(n=>n===1),label+': '+[...c].filter(([v,n])=>n!==1).map(([v,n])=>v.type+' '+v.name+' '+n).join(','));
  const original=L.prototype.load,reports=[];
  try{
   for(const [medium,mode]of [['vhs','success'],['dvd','success'],['dvd','failure'],['dvd','late'],['dvd','detached']]){
    localStorage.clear();localStorage.setItem('bb_medium',medium);localStorage.setItem('bb_theme','bb-2010');window.medium();
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(),pending=[];
    L.prototype.load=function(url,success,progress,error){pending.push({url,success,error});return this;};
    const ctx={scene,camera,activeTheme:window.theme(),libraries:[{id:'movies',movies:Array.from({length:80},(_,i)=>({id:'m'+i,title:'Movie '+i,year:1998,genres:['Drama']}))}],requestRender:()=>{},requestShadowRefresh:()=>{},addCollider:()=>{},log:()=>{}};
    const f=new window.Table({id:'sale-test',position:{x:0,z:0},yaw:.4,options:{noRentalCase:true}},ctx);f.build();
    assert(pending.length===2,'both authored families requested');
    const root=scene.children[0],before=watch(resources(root)),slots=JSON.stringify(f.getSlots()),foot=JSON.stringify(f.getFootprint());
    assert(f.getSlots().length===66,'eleven columns, three tiers, both faces');
    if(mode==='late')f.dispose();if(mode==='detached')root.removeFromParent();
    for(const p of pending){
     if(mode==='failure'){p.error(new Error('Expected missing asset'));continue;}
     const key=p.url.split('/').pop().replace('.glb',''),parsed=await new L().parseAsync(bytes[key].slice(0),'');
     const imported=watch(resources(parsed.scene));p.success(parsed);await Promise.resolve();await Promise.resolve();
     if(mode==='late'||mode==='detached')once(imported,mode+' imported');
    }
    if(mode==='success'){
     assert(root.children.filter(o=>o.name==='display-model'&&o.visible).length===2,'models installed');
     assert(slots===JSON.stringify(f.getSlots()),'all case transforms and identity preserved');
     assert(foot===JSON.stringify(f.getFootprint()),'navigation footprint preserved');
     const models=root.children.filter(o=>o.name==='display-model');let draws=0;
     models.forEach(m=>m.traverse(o=>{if(o.isMesh)draws++;}));assert(draws===5,'four furniture finishes plus one rack batch');
    }
    if(mode==='failure')assert(root.children.filter(o=>o.name==='display-fallback'&&o.visible).length===2,'both fallbacks retained');
    f.dispose();f.dispose();once(before,mode+' fallback');assert(!scene.children.length,'removed');
    reports.push({medium,mode,slots:66,passed:true});
   }
  }finally{L.prototype.load=original;}
  return reports;
 });
 writeFileSync(out+'/sale-table-lifecycle.json',JSON.stringify({lifecycle,pageErrors:errors},null,2)+'\n');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Lifecycle and both case media passed');
 }
 await page.setViewport({width:390,height:844,deviceScaleFactor:2});
 await page.evaluateOnNewDocument(()=>localStorage.clear());
 await page.goto('http://localhost:'+port+'/harness.html?fast=1&quality=high&theme=bb-2010&medium=dvd&lib=400&series=0&set=bb_customers%3Doff&state=saletableproof',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__ready,{timeout:120000});
 if(!(await page.evaluate(()=>window.__checkpointOk)))throw Error('Existing sale-table browsing checkpoint failed');
 await page.waitForFunction(()=>{
  const s=window.store,f=s?.slottedFixtures.find(f=>f.placement.kind==='pv-drape-table');
  const root=f&&s.scene.getObjectByName('pv-drape-table-'+f.placement.id);
  return root?.children.filter(o=>o.name==='display-model'&&o.visible).length===2;
 },{timeout:60000});
 const installed=await page.evaluate(()=>{
  const s=window.store,f=s.slottedFixtures.find(f=>f.placement.kind==='pv-drape-table');
  const root=s.scene.getObjectByName('pv-drape-table-'+f.placement.id);s.pauseRendering();
  s.renderer.setPixelRatio(2);s.renderer.setSize(390,844,false);
  window.tablePhoto=(offset,target,before=false)=>{
   for(const o of root.children){if(o.name==='display-model')o.visible=!before;if(o.name==='display-fallback')o.visible=before;}
   const p=root.position.clone().set(...offset);root.localToWorld(p);s.camera.position.copy(p);
   const t=root.position.clone().set(...target);root.localToWorld(t);s.camera.lookAt(t);s.camera.updateMatrixWorld(true);
   s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();
  };
  return {placement:f.placement,footprint:f.getFootprint(),slots:f.getSlots().length,checkpoint:window.__checkpointOk,phoneViewport:[390,844],physicalPhone:false};
 });
 for(const [name,p,t,before]of[
  ['sale-installed-before',[6,5.8,8],[0,2.4,0],true],['sale-installed-front',[6,5.8,8],[0,2.4,0],false],
  ['sale-installed-rear',[-6,5.8,-8],[0,2.4,0],false],['sale-installed-side',[9,4.6,0],[0,2.3,0],false],
 ]){const data=await page.evaluate(({p,t,before})=>window.tablePhoto(p,t,before),{p,t,before});writeFileSync(out+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));}
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(out+'/sale-table-installed.json',JSON.stringify({...installed,pageErrors:errors},null,2)+'\n');
 console.log(JSON.stringify(installed));
}finally{await browser.close();server.stop();rmSync(html,{force:true});}
