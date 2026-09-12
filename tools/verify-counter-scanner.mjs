// Private reference-asset verification, adapted from verify-eas/price-label-gun.
// Start Vite on SCANNER_PORT (4287), install the delivered local scanner, run node.
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const out=resolve(process.env.SCANNER_OUT||'scratch/publicity-kits/issue-187');mkdirSync(out,{recursive:true});
const html=resolve('tools/scanner-verification.html');
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:900px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:40},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
const browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage();await page.setViewport({width:1200,height:900});
 page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
 await page.evaluateOnNewDocument((storefront)=>{localStorage.clear();localStorage.setItem('bb_storefront',storefront);Object.entries({bb_store_format:'corporate',bb_theme:'bb-2010',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day'}).forEach(([k,v])=>localStorage.setItem(k,v));},process.env.SCANNER_STOREFRONT||'standard');
 await page.goto(`http://localhost:${process.env.SCANNER_PORT||4287}/tools/scanner-verification.html`);await page.waitForFunction(()=>!!window.boot);
 console.log('Booting');await page.evaluate(()=>window.boot());
 await page.waitForFunction(()=>!!window.store.scene.getObjectByName('counter-scanner-model'),{timeout:180000});
 const metrics=await page.evaluate(async()=>{
  const T=window.T,s=window.store;s.pauseRendering();s.renderer.setPixelRatio(1);s.renderer.setSize(1200,900,false);
  const model=s.scene.getObjectByName('counter-scanner-model');model.updateWorldMatrix(true,true);
  const bounds=new T.Box3().setFromObject(model);const parts=[];const materials=new Set(),textures=new Set();
  model.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;
   if(!g.attributes.uv||!g.attributes.normal)throw Error('Missing UV/normal: '+o.name);
   for(const [name,attr]of Object.entries(g.attributes))for(const v of attr.array)if(!Number.isFinite(v))throw Error('Nonfinite '+name);
   for(let i=0;i<g.attributes.normal.count;i++){const n=new T.Vector3().fromBufferAttribute(g.attributes.normal,i);if(Math.abs(n.length()-1)>.002)throw Error('Nonunit normal');}
   parts.push({name:o.name,triangles:(g.index?.count||g.attributes.position.count)/3});
   for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v);if(!m.map||!m.normalMap||!m.roughnessMap)throw Error('Untextured surface '+m.name);}
  });
  const a=s.entrance.getCounterTopAnchorAt(s.storefrontSpec.counterShape==='usquare'?-2.50:-2.75);
  for(const name of ['Nose_contact_rest','Heel_contact_rest']){const o=model.getObjectByName(name);if(!o)throw Error('Missing contact rest '+name);if(Math.abs(new T.Box3().setFromObject(o).min.y-a.y)>.0001)throw Error('Floating rest '+name);}
  const contacts=parts.filter(p=>/rest/.test(p.name));
  const trigger=model.getObjectByName('Recessed_curved_finger_trigger');
  if(Math.abs(new T.Box3().setFromObject(trigger).min.y-a.y-.066)>.001)throw Error('Wrong trigger revision');
  const inverse=new T.Matrix4().copy(model.matrixWorld).invert();const localBounds=new T.Box3();
  model.traverse(o=>{if(o.isMesh)for(let i=0;i<o.geometry.attributes.position.count;i++)localBounds.expandByPoint(new T.Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));});
  if(localBounds.max.z+.24>a.depth/2||localBounds.min.z+.24 < -a.depth/2)throw Error('Scanner exceeds worktop depth');
  // A pole display's head and foot share one mesh, so its whole-object box
  // fills empty air. Test its occupied triangles against the scanner envelope.
  const adjacent=['counter-terminal-station-0','counter-terminal-station-1','customer-vfd-model'].map(name=>{
   const o=s.scene.getObjectByName(name);if(!o)return {name,present:false,intersects:false};
   const other=new T.Box3().setFromObject(o);const broadPhase=bounds.intersectsBox(other);let trianglesInScannerEnvelope=0;
   if(broadPhase)o.traverse(mesh=>{if(!mesh.isMesh)return;const g=mesh.geometry,p=g.attributes.position,idx=g.index;const count=idx?idx.count:p.count;
    for(let i=0;i<count;i+=3){const points=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));if(bounds.intersectsBox(new T.Box3().setFromPoints(points)))trianglesInScannerEnvelope++;}
   });
   return {name,present:true,bounds:{min:other.min.toArray(),max:other.max.toArray()},broadPhase,trianglesInScannerEnvelope,intersects:trianglesInScannerEnvelope>0};
  });
  if(adjacent.some(p=>p.intersects))throw Error('Scanner intersects adjacent equipment '+JSON.stringify(adjacent));
  window.scannerShot=(offset,target,before)=>{model.visible=!before;const pos=new T.Vector3(...offset).applyAxisAngle(new T.Vector3(0,1,0),model.rotation.y).add(model.position);const aim=new T.Vector3(...target).applyAxisAngle(new T.Vector3(0,1,0),model.rotation.y).add(model.position);s.camera.position.copy(pos);s.camera.lookAt(aim);s.camera.fov=48;s.camera.aspect=1200/900;s.camera.updateProjectionMatrix();s.camera.updateMatrixWorld();s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();};
  return {bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},anchor:a,parts,triangles:parts.reduce((n,p)=>n+p.triangles,0),draws:parts.length,materials:materials.size,textures:[...textures].map(t=>({name:t.name,width:t.image?.width,height:t.image?.height})),contacts,adjacent};
 });
 writeFileSync(out+'/installed-metrics.json',JSON.stringify(metrics,null,2));
 for(const [name,offset,target,before]of [
  ['before',[1.8,2.2,2.8],[.15,.1,0],true],['after',[1.8,2.2,2.8],[.15,.1,0],false],
  ['front',[.35,.65,-1.12],[.12,.09,.05],false],['side',[1.10,.32,.06],[.10,.10,.07],false],
  ['rear',[.75,.65,1.3],[.2,.07,.1],false],['overhead',[.25,1.65,.12],[.25,0,.1],false]
 ]){const data=await page.evaluate(({offset,target,before})=>window.scannerShot(offset,target,before),{offset,target,before});writeFileSync(`${out}/${name}.png`,Buffer.from(data.split(',')[1],'base64'));console.log('Captured '+name);}
 const lifecycle=await page.evaluate(async()=>{
  const T=window.T,L=window.L;const {installCounterScanner}=await import('/src/fixtures/counter-scanner.ts');const {clearActiveSignage}=await import('/src/fixtures/signage.ts');
  const bytes=await(await fetch('/user-assets/fixtures/late-era-fixtures-2012/scanner/model.glb')).arrayBuffer();
  const original=L.prototype.load;let pending,requests=[];
  L.prototype.load=function(url,success,progress,error){requests.push(url);pending={success,error};};
  const assert=(v,m)=>{if(!v)throw Error(m);};
  const resources=root=>{const result=new Set();root.traverse(o=>{if(o.isMesh){result.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){result.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)result.add(v);}}});return result;};
  const watch=root=>{const map=new Map();for(const r of resources(root)){map.set(r,0);r.addEventListener('dispose',()=>map.set(r,map.get(r)+1));}return map;};
  const reports=[];
  try{
   for(const theme of ['bb-1989','bb-1990','bb-1993','bb-1998','bb-2000','bb-2010'])for(const shape of ['shield','usquare','desk']){
    requests=[];let refreshes=0;const scene=new T.Scene(),parent=new T.Group();scene.add(parent);
    const mock={scene,activeTheme:{id:theme},storefrontSpec:{counterShape:shape},entrance:{getCounterTopAnchorAt:u=>({x:u,y:2.82,z:1,rotY:.4,depth:1.4})},fixtureContext:()=>({requestShadowRefresh:()=>refreshes++}),requestRender:()=>refreshes++};
    installCounterScanner(mock,parent);const eligible=theme==='bb-2010'&&shape!=='desk';assert((requests.length>0)===eligible,'Period/shape gate');
    if(eligible){const parsed=await new L().parseAsync(bytes.slice(0),'');const watched=watch(parsed.scene);pending.success(parsed);assert(parent.children.length===1&&refreshes===2,'Attachment refresh');const model=parent.children[0];assert(Math.abs(model.position.x-((shape==='usquare'?-2.50:-2.75)+Math.sin(.4)*.24))<1e-6,'Placement yaw');clearActiveSignage(scene,[parent]);assert([...watched].every(([r,n])=>r instanceof T.Texture?n===1:n>=1),'Cleanup');}
    reports.push({theme,shape,eligible,passed:true});
   }
   for(const mode of ['failure','late-success','detached-failure','missing-anchor']){
    requests=[];let refreshes=0;const scene=new T.Scene(),parent=new T.Group();scene.add(parent);
    const mock={scene,activeTheme:{id:'bb-2010'},storefrontSpec:{counterShape:'shield'},entrance:{getCounterTopAnchorAt:()=>mode==='missing-anchor'?null:({x:0,y:2.82,z:0,rotY:0})},fixtureContext:()=>({requestShadowRefresh:()=>refreshes++}),requestRender:()=>refreshes++};
    installCounterScanner(mock,parent);
    if(mode==='failure'){pending.error();assert(parent.children.length===0,'Empty desk fallback');}
    if(mode==='late-success'){parent.removeFromParent();const parsed=await new L().parseAsync(bytes.slice(0),'');const watched=watch(parsed.scene);pending.success(parsed);assert([...watched.values()].every(n=>n===1),'Late resources disposal');}
    if(mode==='detached-failure'){parent.removeFromParent();const count=requests.length;pending.error();assert(requests.length===count,'Detached retry');}
    if(mode==='missing-anchor')assert(requests.length===0,'Missing anchor requested asset');
    assert(!parent.children.length&&refreshes===0,'Failed/detached refresh');reports.push({mode,passed:true});
   }
   return reports;
  }finally{L.prototype.load=original;}
 });
 writeFileSync(out+'/lifecycle.json',JSON.stringify(lifecycle,null,2));console.log(JSON.stringify(metrics));
}finally{await browser.close();unlinkSync(html);}
