// Actual fixture loaders, failed/late loads, ownership and authored detail views.
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureDevelopmentScope, developmentBrowserEnvironment } from './lib/development-resources.mjs';
import { startDevServer } from './lib/dev-server.mjs';
await ensureDevelopmentScope();
const out=resolve('scratch/publicity-kits/remaining-models');mkdirSync(out,{recursive:true});
if(readdirSync('public/user-assets').some(p=>p!=='README.md'))throw Error('Public review needs a user-assets-free camp');
const html=resolve('tools/counter-accessories-review.html');
writeFileSync(html,`<body style="margin:0;background:#20242a"><script type="module">
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {TipJar} from '/src/fixtures/tip-jar.ts';
import {TapeCleanerDisplay} from '/src/fixtures/period-fixtures.ts';
import {acrylicTentSign} from '/src/fixtures/sign-fixtures.ts';
import {getActiveTheme} from '/src/themes.ts';
import {paintTipCardCanvas} from '/src/tip-jar.ts';
localStorage.clear();localStorage.setItem('bb_quality','high');localStorage.setItem('bb_theme','bb-1993');
window.T=T;window.Loader=GLTFLoader;window.TipJar=TipJar;window.Tray=TapeCleanerDisplay;
window.tent=acrylicTentSign;window.theme=getActiveTheme;
window.paintTipCardCanvas=paintTipCardCanvas;
window.ready=true;
</script>`);
const port=4297,server=await startDevServer({port,repoRoot:process.cwd()});
const browser=await puppeteer.launch({headless:true,env:developmentBrowserEnvironment(),args:[
  '--no-sandbox','--disable-setuid-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl-egl','--disable-accelerated-video-decode',
]});
const errors=[];
try{
 const page=await browser.newPage();await page.setViewport({width:960,height:800});
 page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
 page.on('console',m=>{if(m.type()==='error')console.error('BROWSER',m.text());});
 await page.goto('http://localhost:'+port+'/tools/counter-accessories-review.html');
 await page.waitForFunction(()=>window.ready,{timeout:30000});
 const result=await page.evaluate(async()=>{
  const T=window.T,Loader=window.Loader;
  const assert=(c,m)=>{if(!c)throw Error(m);};
  const resources=root=>{const s=new Set();root.traverse(o=>{if(o.isMesh){s.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){s.add(m);for(const v of Object.values(m))if(v?.isTexture)s.add(v);}}});return s;};
  const watch=set=>{const counts=new Map();for(const r of set){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));}return counts;};
  const allOnce=(c,label)=>assert([...c.values()].every(n=>n===1),label+': '+[...c].filter(([r,n])=>n!==1).map(([r,n])=>r.type+' '+r.name+' '+n).join(','));
  const files=['tip-mug','acrylic-l-holder','cleaner-display-tray','cleaner-carton'];const bytes={};
  for(const f of files)bytes[f]=await(await fetch('/models/'+f+'.glb')).arrayBuffer();
  const original=Loader.prototype.load,reports=[];
  try{
   for(const Kind of [window.TipJar,window.Tray])for(const mode of ['success','failure','late','detached']){
    const scene=new T.Scene(),camera=new T.PerspectiveCamera();let refreshes=0;const pending=[];
    Loader.prototype.load=function(url,success,progress,error){pending.push({url,success,error});return this;};
    const ctx={scene,camera,activeTheme:window.theme(),requestRender:()=>{},requestShadowRefresh:()=>refreshes++,addCollider:()=>{},log:()=>{}};
    const f=new Kind({id:'counter-test',position:{x:0,z:0},yaw:0,options:{surfaceY:0}},ctx);f.build();
    const root=scene.children[0];assert(root,'fixture built');const before=watch(resources(root));
    assert(pending.length===2,'both owned asset loads begin');
    if(mode==='late')f.dispose();
    if(mode==='detached')root.removeFromParent();
    for(const p of pending){
     if(mode==='failure'){p.error(new Error('expected missing asset'));continue;}
     const name=p.url.split('/').pop().replace('.glb','');
     const parsed=await new Loader().parseAsync(bytes[name].slice(0),'');const counts=watch(resources(parsed.scene));
     p.success(parsed);await Promise.resolve();await Promise.resolve();
     if(mode==='late'||mode==='detached')allOnce(counts,Kind.name+' '+mode+' imported disposal');
    }
    if(mode==='success'){
     const models=[];root.traverse(o=>{if(o.name==='display-model')models.push(o);});
     assert(models.length===(Kind===window.TipJar?2:1),'authored models installed');
     for(const m of models)assert(m.visible,'prepared model visible');
     if(Kind===window.TipJar){
      const mug=root.getObjectByName('tip-mug').getObjectByName('display-model');
      let hit; mug.traverse(o=>{if(o.isMesh)hit=o;});assert(f.hitTest(hit),'new mug mesh remains clickable');
      const holder=root.getObjectByName('tip-card-holder').getObjectByName('display-model');
      holder.traverse(o=>{if(o.isMesh)hit=o;});assert(f.hitTest(hit),'holder remains clickable');
      root.updateMatrixWorld(true);
      for(const m of [mug,holder])assert(Math.abs(new T.Box3().setFromObject(m).min.y)<1e-6,'countertop contact');
     }
    }
    if(mode==='failure'){let n=0;root.traverse(o=>{if(o.name==='display-fallback'&&o.visible)n++;});assert(n===(Kind===window.TipJar?2:1),'fallback retained');}
    f.dispose();f.dispose();allOnce(before,Kind.name+' '+mode+' fallback disposal');
    assert(!scene.children.length,'fixture detached');reports.push({fixture:Kind.name,mode,passed:true,refreshes});
   }
  }finally{Loader.prototype.load=original;}
  const scene=new T.Scene();scene.background=new T.Color('#30373e');
  scene.add(new T.HemisphereLight(0xffffff,0x524c3b,2.6));
  const key=new T.DirectionalLight(0xffffff,3);key.position.set(-3,5,4);scene.add(key);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,800);
  renderer.setPixelRatio(1);document.body.append(renderer.domElement);
  const camera=new T.PerspectiveCamera(40,960/800,.01,100);
  const floor=new T.Mesh(new T.BoxGeometry(5,.04,3),new T.MeshStandardMaterial({color:0x75664e,roughness:.65}));floor.position.y=-.02;scene.add(floor);
  const ctx={scene,camera,activeTheme:window.theme(),requestRender:()=>{},requestShadowRefresh:()=>{},addCollider:()=>{},log:()=>{}};
  const mug=new window.TipJar({id:'tip-review',position:{x:0,z:0},yaw:0,options:{surfaceY:0}},ctx);mug.build();
  window.review={scene,renderer,camera,mug,ctx,floor};
  window.renderReview=(p,target)=>{camera.position.set(...p);camera.lookAt(...target);renderer.render(scene,camera);return renderer.domElement.toDataURL();};
  const c=document.createElement('canvas');c.width=1536;c.height=1229;window.paintTipCardCanvas(c);window.qrCard=c.toDataURL();
  return reports;
 });
 await page.waitForFunction(()=>{let n=0;window.review.scene.traverse(o=>{if(o.name==='display-model'&&o.visible)n++;});return n===2;},{timeout:30000});
 for(const [name,p,t] of [
  ['tip-front',[.2,1.45,2.6],[.1,.40,0]],['tip-side',[-2,1.0,.7],[-.1,.35,0]],
  ['tip-rear',[1.6,1.3,-2],[.1,.35,0]],['mug-interior',[-.5,.95,.62],[-.46,.22,0]],
 ]){const data=await page.evaluate(({p,t})=>window.renderReview(p,t),{p,t});writeFileSync(out+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));}
 writeFileSync(out+'/tip-card-decode.png',Buffer.from((await page.evaluate(()=>window.qrCard)).split(',')[1],'base64'));
 await page.evaluate(()=>{const r=window.review;r.mug.dispose();r.tray=new window.Tray({id:'tray-review',position:{x:0,z:0},yaw:0,options:{surfaceY:0}},r.ctx);r.tray.build();});
 await page.waitForFunction(()=>!!window.review.scene.getObjectByName('cleaner-carton-stock')&&!!window.review.scene.getObjectByName('display-model'),{timeout:30000});
 for(const [name,p,t] of [['tray-front',[2.8,1.8,3.4],[0,.5,0]],['tray-rear',[-2.7,1.6,-3.2],[0,.5,0]],['tray-side',[3,1.2,.1],[0,.5,0]]]){
  const data=await page.evaluate(({p,t})=>window.renderReview(p,t),{p,t});writeFileSync(out+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));
 }
 await page.evaluate(()=>{const r=window.review;r.tray.dispose();const T=window.T,c=document.createElement('canvas');c.width=512;c.height=256;const g=c.getContext('2d');g.fillStyle='#e2cf99';g.fillRect(0,0,512,256);g.fillStyle='#18334c';g.font='bold 70px sans-serif';g.textAlign='center';g.fillText('PLEASE',256,100);g.fillText('REWIND',256,190);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;r.tent=window.tent(tex,1,.5);r.scene.add(r.tent);});
 for(const [name,p,t] of [['tent-front',[.8,.9,1.8],[0,.24,0]],['tent-rear',[-.8,.9,-1.8],[0,.24,0]],['tent-side',[1.6,.65,0],[0,.24,0]]]){
  const data=await page.evaluate(({p,t})=>window.renderReview(p,t),{p,t});writeFileSync(out+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));
 }
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(out+'/counter-lifecycle.json',JSON.stringify({result,pageErrors:errors},null,2)+'\n');
 console.log(JSON.stringify({checks:result.length,pageErrors:errors,photographs:10}));
}finally{await browser.close();server.stop();rmSync(html,{force:true});}
