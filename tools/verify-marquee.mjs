// Isolated actual StoreScene evidence, following verify-ceiling-luminaire.mjs.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const out=resolve(process.argv[2]||'/tmp/marquee-verification');mkdirSync(out,{recursive:true});
let baseline=true;
const port=6291,html=resolve('tools/verify-marquee.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser;
try {
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:900px"></div><script type="module">
import * as T from '/node_modules/three/build/three.module.js';window.T=T;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');window.store=new StoreScene(document.getElementById('store'),[],()=>{});await window.store.ready;localStorage.setItem('bb_quality','medium');window.store.buildMarqueeBulbs(window.store.getStoreWidth(),window.store.backWallZ);};
</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
if(!process.argv.includes('--resources-only')) {
const page=await browser.newPage();await page.setViewport({width:1200,height:900});
console.log('Browser ready');const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Shader'))errors.push(m.text());});
if(baseline){await page.setRequestInterception(true);page.on('request',r=>r.url().includes('marquee-bulb.glb')?r.abort():r.continue());}
await page.goto(`http://localhost:${port}/tools/verify-marquee.html`);await page.waitForFunction(()=>!!window.boot);
await page.evaluate(()=>{localStorage.clear();Object.entries({bb_theme:'bb-1993',bb_store_format:'corporate',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_ceiling:'high',bb_marquee_bulbs:'1',bb_marquee_anim:'steady',bb_live_mirrors:'0'}).forEach(([k,v])=>localStorage.setItem(k,v));});
console.log('Booting store');await page.evaluate(()=>window.boot());console.log('Store ready',await page.evaluate(()=>({present:!!window.store,bulbs:!!window.store?.marqueeBulbsMesh,quality:localStorage.getItem('bb_quality')})));await page.waitForFunction(()=>!!window.store.marqueeBulbsMesh);
for (baseline of [true,false]) {
if(!baseline){page.removeAllListeners('request');await page.setRequestInterception(false);await page.evaluate(async()=>{const {installMarqueeModel}=await import('/src/marquee-bulb-model.ts');installMarqueeModel(window.store.marqueeBulbsMesh,()=>window.store.requestRender());});await page.waitForFunction(()=>window.store.marqueeBulbsMesh.geometry.name==='Marquee assembly');}
await delay(1500);
const metrics=await page.evaluate(()=>{const s=window.store,m=s.marqueeBulbsMesh;return {count:m.count,trianglesPerInstance:(m.geometry.index?.count||m.geometry.attributes.position.count)/3,groups:m.geometry.groups.length,materials:Array.isArray(m.material)?m.material.length:1,posters:s.posterMarqueeFrames.length};});
for(const view of ['store','cornice-side','poster-corner','poster-side','poster-rear']){
await page.evaluate(view=>{const s=window.store,T=window.T;let target,pos;
if(view==='store'){s.teleportWalk(11,4,0,22,5.5,true);s.requestRender();return;}
if(view==='cornice-side'){const m=new T.Matrix4();s.marqueeBulbsMesh.getMatrixAt(1,m);target=new T.Vector3().setFromMatrixPosition(m);const q=new T.Quaternion(),scale=new T.Vector3(),unused=new T.Vector3();m.decompose(unused,q,scale);pos=target.clone().add(new T.Vector3(.3,-.20,.65).applyQuaternion(q));}
else {const f=s.posterMarqueeFrames[0];f.anchor.updateWorldMatrix(true,false);target=new T.Vector3(-f.width/2,f.height/2-.25,.16).applyMatrix4(f.anchor.matrixWorld);const q=f.anchor.getWorldQuaternion(new T.Quaternion());const delta=new T.Vector3(...(view==='poster-side'?[.6,.1,.35]:view==='poster-rear'?[.3,.15,-.5]:[.15,.05,.85])).applyQuaternion(q);pos=target.clone().add(delta);}
const d=pos.clone().sub(target);s.teleportWalk(pos.x,pos.z,Math.atan2(d.x,d.z)*180/Math.PI,Math.atan2(-d.y,Math.hypot(d.x,d.z))*180/Math.PI,pos.y,true);s.requestRender();},view);
await delay(650);await page.screenshot({path:resolve(out,`${baseline?'before':'after'}-${view}.png`)});
}
if(!baseline){
metrics.modes=await page.evaluate(()=>{const s=window.store,m=s.marqueeBulbsMesh,result={};for(const mode of ['steady','off','chase']){s.setMarqueeAnimMode(mode);result[mode]=Array.from(m.instanceColor.array.slice(0,9));}s.updateMarqueeBulbs(1000);result.next=Array.from(m.instanceColor.array.slice(0,9));return result;});
assert.ok(metrics.modes.steady.every(x=>x===1));assert.ok(metrics.modes.off.every(x=>Math.abs(x-.12)<1e-6));assert.equal(metrics.modes.chase[0],1);assert.equal(metrics.modes.next[3],1);
}
assert.deepEqual(errors,[]);writeFileSync(resolve(out,baseline?'before.json':'after.json'),JSON.stringify({...metrics,errors},null,2));console.log(metrics);
}
}
// Verify ownership and the actual draw count in a small isolated renderer.
const check=await browser.newPage();await check.setViewport({width:900,height:900});await check.goto(`http://localhost:${port}/tools/verify-marquee.html`);await check.waitForFunction(()=>!!window.T);
const resource=await check.evaluate(async()=>{
 const source=await(await fetch('/src/marquee-bulb-model.ts')).text();
 const {GLTFLoader}=await import(source.match(/from ["']([^"']*GLTFLoader[^"']*)["']/)[1]);
 const T=await import(source.match(/from ["']([^"']*three[^"']*)["']/)[1]);
 const {installMarqueeModel}=await import('/src/marquee-bulb-model.ts');
 const original=GLTFLoader.prototype.load;const results={};
 for(const action of ['install','remove','dispose','failure']){
  const scene=new T.Scene(),geo=new T.SphereGeometry(.045,8,6),mat=new T.MeshStandardMaterial({emissive:0xffd9a0,emissiveIntensity:3.2});
  const mesh=new T.InstancedMesh(geo,mat,1);mesh.setMatrixAt(0,new T.Matrix4());mesh.setColorAt(0,new T.Color(1,1,1));scene.add(mesh);
  let refreshes=0,releasedGeo=0,releasedMat=0,fallbackDisposed=0;
  geo.addEventListener('dispose',()=>fallbackDisposed++);
  let finish;const finished=new Promise(r=>finish=r);
  GLTFLoader.prototype.load=function(url,onLoad,progress,onError){
   if(action==='failure'){queueMicrotask(()=>{onError(new Error('simulated offline'));finish();});return;}
   return original.call(this,url,g=>{g.scene.traverse(o=>{if(o.isMesh){o.geometry.addEventListener('dispose',()=>releasedGeo++);o.material.addEventListener('dispose',()=>releasedMat++);}});onLoad(g);finish();},progress,onError);
  };
  installMarqueeModel(mesh,()=>refreshes++);
  if(action==='remove')mesh.removeFromParent();if(action==='dispose')geo.dispose();
  await finished;
  results[action]={refreshes,releasedGeo,releasedMat,fallbackDisposed,adopted:mesh.geometry!==geo};
  if(action==='install'){
   const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,900);renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;
   document.body.replaceChildren(renderer.domElement);scene.background=new T.Color(0x293342);scene.add(new T.HemisphereLight(0xffffff,0x999999,3));
   const light=new T.DirectionalLight(0xffffff,3);light.position.set(1,2,3);scene.add(light);
   const camera=new T.PerspectiveCamera(32,1,.001,10);
   mesh.setColorAt(0,new T.Color(.12,.12,.12));mesh.instanceColor.needsUpdate=true;
   window.detail=(view)=>{camera.position.fromArray(view==='side'?[.32,.03,.11]:[.15,.12,-.33]);camera.lookAt(0,0,-.02);renderer.render(scene,camera);};
   window.detail('side');results.drawCalls=renderer.info.render.calls;results.triangles=renderer.info.render.triangles;
   results.maskValues=[...new Set(mesh.geometry.attributes.lampEmission.array)];
   window.detailCleanup=()=>{mesh.geometry.dispose();mat.dispose();renderer.dispose();};
  }else {if(mesh.geometry!==geo)mesh.geometry.dispose();if(action!=='dispose')geo.dispose();mat.dispose();}
 }
 GLTFLoader.prototype.load=original;return results;
});
assert.equal(resource.drawCalls,1);assert.equal(resource.triangles,280);assert.deepEqual(resource.maskValues.sort(),[0,1]);
for(const action of ['remove','dispose']){assert.equal(resource[action].adopted,false);assert.equal(resource[action].refreshes,0);assert.equal(resource[action].releasedGeo,3);assert.equal(resource[action].releasedMat,3);}
assert.equal(resource.failure.adopted,false);assert.equal(resource.install.fallbackDisposed,1);assert.equal(resource.install.refreshes,1);
for(const view of ['side','rear']){await check.evaluate(v=>window.detail(v),view);await check.screenshot({path:resolve(out,'assembly-'+view+'.png')});}
await check.evaluate(()=>window.detailCleanup());await check.close();
writeFileSync(resolve(out,'resources.json'),JSON.stringify(resource,null,2));

} finally {await browser?.close();server.kill();unlinkSync(html);}
