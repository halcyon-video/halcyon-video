// StoreScene photography using the same public-only harness as verify-coffee-table.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
const preset=process.argv[4]||'standard';
const requestedViews=new Set((process.env.BALLOON_VIEWS||'context,side,rear,detail,knot,mouth').split(','));
const baseRef=process.env.BALLOON_BASE_REF||'c84a6b4d40c676bf5732e5800d79e19aafe6e009';
const out=resolve(process.argv[2]||'/tmp/balloon'),label=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const html=resolve('tools/verify-balloon-'+label+'.html'),beforeModule=resolve('src/fixtures/balloon-before-verification.ts'),port=Number(process.env.BALLOON_PORT||6283);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});let browser;
try {
if(label==='before')writeFileSync(beforeModule,execFileSync('git',['show',baseRef+':src/fixtures/counter-props-93.ts']));
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1100px;height:850px"></div><script type="module">
import * as T from 'three';window.T=T;
window.boot=async()=>{localStorage.clear();Object.entries({bb_storefront:'${preset}',bb_theme:'bb-1993',bb_store_format:'corporate',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day'}).forEach(([k,v])=>localStorage.setItem(k,v));const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1993,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:'shell',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});browser.process()?.on('exit',(code,signal)=>console.log('Browser exit',code,signal));const page=await browser.newPage();await page.setViewport({width:1100,height:850});page.setDefaultNavigationTimeout(120000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.text().includes('[props]'))console.log(m.text());});
if(label==='before'){
 await page.setRequestInterception(true);page.on('request',async r=>{
  if(r.url().includes('/models/balloon.glb'))return r.respond({status:200,contentType:'model/gltf-binary',body:execFileSync('git',['show',baseRef+':public/models/balloon.glb'])});
  if(r.url().includes('/src/fixtures/counter-props-93.ts'))return r.respond({status:200,contentType:'application/javascript',body:await (await fetch('http://localhost:'+port+'/src/fixtures/balloon-before-verification.ts')).text()});
  return r.continue();
 });
}
if(label==='fallback'){await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/models/balloon.glb')?r.abort():r.continue());}
await page.goto('http://localhost:'+port+'/tools/verify-balloon-'+label+'.html');await page.waitForFunction(()=>!!window.boot);console.log('Booting store');await page.evaluate(()=>window.boot());console.log('Store ready');await page.waitForFunction(()=>store.scene.getObjectByName('prop:balloon')||store.scene.getObjectByName('balloon-fallback'),{timeout:120000});await delay(2000);
console.log('Balloon loaded');const result=await page.evaluate(()=>{const s=store,T=window.T;s.pauseRendering();s.renderer.setPixelRatio(1);s.renderer.setSize(1100,850,false);const balloons=[];s.scene.traverse(o=>{if(o.name==='prop:balloon'||o.name==='balloon-fallback')balloons.push(o);});if(!balloons.length)throw Error('No balloons');const b=new T.Box3();balloons.forEach(o=>b.expandByObject(o));const center=localStorage.getItem('bb_storefront')==='standard'?new T.Vector3(7.325104971516662,5.588391558942936,-1.6752345241803408):b.getCenter(new T.Vector3());window.draw=(offset,close)=>{s.renderer.setPixelRatio(1);s.renderer.setSize(1100,850,false);s.camera.aspect=1100/850;s.camera.updateProjectionMatrix();const target=close==='knot'?balloons[0].getObjectByName('mount_neck').getWorldPosition(new T.Vector3()):close?new T.Box3().setFromObject(balloons[0]).getCenter(new T.Vector3()):center;s.camera.position.copy(target).add(new T.Vector3(...offset));s.camera.lookAt(target);s.camera.updateMatrixWorld();s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();};return {count:balloons.length,bounds:[b.min.toArray(),b.max.toArray()],instances:balloons.map(o=>{const b=new T.Box3().setFromObject(o);const materials=[];let tris=0;o.traverse(m=>{if(m.isMesh){tris+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;materials.push({name:m.material.name,color:m.material.color?.getHexString(),normal:!!m.material.normalMap,roughness:!!m.material.roughnessMap});}});return {bounds:[b.min.toArray(),b.max.toArray()],triangles:tris,materials};})};});
for(const [name,offset,close] of [['context',[6,-.2,9],false],['side',[7,0,0],false],['rear',[-5,1,-7],false],['detail',[1.3,.3,1.7],true],...(label!=='before'&&label!=='fallback'?[['knot',[.18,.04,.3],'knot'],['mouth',[-.16,-.14,-.22],'knot']]:[])].filter(([name])=>requestedViews.has(name))){const data=await page.evaluate(({offset,close})=>window.draw(offset,close),{offset,close});writeFileSync(resolve(out,label+'-'+name+'.png'),Buffer.from(data.split(',')[1],'base64'));}
if(label!=='before'&&label!=='fallback') result.checks=await page.evaluate(async()=>{
 const s=store,T=window.T;const props=[];s.scene.traverse(o=>{if(o.name==='prop:balloon')props.push(o);});
 if(props.length!==6)throw Error('Expected six balloon poses');
 const roles=new Set(),colors=new Set(),shells=[],cords=[],ownedMats=new Set();let maxTieError=0;
 for(const inst of props){
  const tie=new T.Vector3(...inst.userData.tiePoint),end=inst.getObjectByName('mount_tie').getWorldPosition(new T.Vector3());maxTieError=Math.max(maxTieError,end.distanceTo(tie));
  inst.traverse(o=>{if(!o.isMesh)return;roles.add(o.material.name);if(!o.geometry.attributes.uv||!o.material.normalMap||!o.material.roughnessMap)throw Error('Missing UV/PBR maps');
   if(o.material.name==='BalloonLatex'){colors.add(o.material.color.getHexString());ownedMats.add(o.material);}
   if(o.name==='LatexShell_Neck_RolledMouth')shells.push(o);if(o.name==='ContinuousCottonString'){
    cords.push(o);const a=o.geometry.attributes.position,p=new T.Vector3();let nearest=Infinity;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i);o.localToWorld(p);nearest=Math.min(nearest,p.distanceTo(tie));}if(nearest>.004)throw Error('Cord misses physical tie: '+nearest);
   }
  });
 }
 if(maxTieError>1e-6||colors.size!==6||roles.size!==2)throw Error('Tint/anchor contract failed');
 if(new Set(shells.map(o=>o.geometry)).size!==1||new Set(cords.map(o=>o.geometry)).size!==6||ownedMats.size!==6)throw Error('Resource sharing failed');
 // The six shell envelopes must clear each other; use a conservative radial
 // cross-section test per height because a rotated AABB includes empty corners.
 const pos=new T.Vector3(),sections=shells.map(o=>{const a=[];const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){pos.fromBufferAttribute(p,i);o.localToWorld(pos);a.push(pos.clone());}return a;});
 let minBodyGap=Infinity;for(let i=0;i<props.length;i++)for(let j=i+1;j<props.length;j++){
  const ci=props[i].getObjectByName('mount_body').getWorldPosition(new T.Vector3()),cj=props[j].getObjectByName('mount_body').getWorldPosition(new T.Vector3());
  const d=Math.hypot(ci.x-cj.x,ci.z-cj.z);
  for(let y=Math.max(Math.min(...sections[i].map(p=>p.y)),Math.min(...sections[j].map(p=>p.y)));y<Math.min(Math.max(...sections[i].map(p=>p.y)),Math.max(...sections[j].map(p=>p.y)));y+=.01){
   const radius=(a,c)=>Math.max(0,...a.filter(p=>Math.abs(p.y-y)<.06).map(p=>Math.hypot(p.x-c.x,p.z-c.z)));const ri=radius(sections[i],ci),rj=radius(sections[j],cj);if(ri&&rj)minBodyGap=Math.min(minBodyGap,d-ri-rj);
  }
 }
 if(minBodyGap<0)throw Error('Balloon shells intersect: '+minBodyGap);
 // Test actual triangle overlap with balloon shell bounds, excluding their
 // own family and invisible fallback equipment. Includes counter equipment.
 const intersections=[];for(const shell of shells){const b=new T.Box3().setFromObject(shell);s.scene.traverse(o=>{if(!o.isMesh)return;let p=o;while(p){if(!p.visible||p.name==='prop:balloon')return;p=p.parent;}
  const box=new T.Box3().setFromObject(o);if(!box.intersectsBox(b))return;const tri=new T.Triangle(),a=o.geometry.attributes.position,ix=o.geometry.index;if(!a)return;
  for(let k=0;k<(ix?.count??a.count);k+=3){[tri.a,tri.b,tri.c].forEach((v,j)=>v.fromBufferAttribute(a,ix?ix.getX(k+j):k+j).applyMatrix4(o.matrixWorld));if(b.intersectsTriangle(tri)){intersections.push(o.name||o.parent?.name);break;}}
 });}
 // Conservative tiny per-triangle boxes check the posed strings too. The
 // bottom .02 feet are the intentional attachment/contact region on the band.
 for(const cord of cords){const cb=new T.Box3().setFromObject(cord),cp=cord.geometry.attributes.position,ci=cord.geometry.index,boxes=[];
  const tieY=cord.parent.parent.userData.tiePoint?.[1]??props[0].userData.tiePoint[1];
  for(let i=0;i<(ci?.count??cp.count);i+=3){const box=new T.Box3();for(let k=0;k<3;k++)box.expandByPoint(new T.Vector3().fromBufferAttribute(cp,ci?ci.getX(i+k):i+k).applyMatrix4(cord.matrixWorld));if(box.min.y>tieY+.02)boxes.push(box);}
  s.scene.traverse(o=>{if(!o.isMesh)return;let p=o;while(p){if(!p.visible||p.name==='prop:balloon')return;p=p.parent;}
   if(!new T.Box3().setFromObject(o).intersectsBox(cb))return;const a=o.geometry.attributes.position,ix=o.geometry.index,tri=new T.Triangle();if(!a)return;
   for(let k=0;k<(ix?.count??a.count);k+=3){[tri.a,tri.b,tri.c].forEach((v,j)=>v.fromBufferAttribute(a,ix?ix.getX(k+j):k+j).applyMatrix4(o.matrixWorld));if(boxes.some(b=>b.intersectsTriangle(tri))){intersections.push('cord:'+ (o.name||o.parent?.name));break;}}
  });
 }
 if(intersections.length)throw Error('Equipment/architecture crosses balloon: '+intersections.join(','));
 const shared=shells[0].geometry;let sharedDisposals=0,cordDisposals=0,materialDisposals=0;shared.addEventListener('dispose',()=>sharedDisposals++);cords.forEach(o=>o.geometry.addEventListener('dispose',()=>cordDisposals++));ownedMats.forEach(m=>m.addEventListener('dispose',()=>materialDisposals++));
 const root=props[0].parent;const {clearActiveSignage}=await import('/src/fixtures/signage.ts');clearActiveSignage(s.scene,[root]);
 if(sharedDisposals||cordDisposals!==6||materialDisposals!==6||root.getObjectByName('prop:balloon'))throw Error('Rebuild ownership failed');
 const {buildCounterProps93}=await import('/src/fixtures/counter-props-93.ts');buildCounterProps93(s);await new Promise(r=>setTimeout(r,50));const rebuilt=s.scene.getObjectByName('counter-props-93');if(!rebuilt.getObjectByName('prop:balloon'))throw Error('Cache rebuild failed');clearActiveSignage(s.scene,[rebuilt]);
 buildCounterProps93(s);const late=s.scene.getObjectByName('counter-props-93');clearActiveSignage(s.scene,[late]);await new Promise(r=>setTimeout(r,50));if(late.getObjectByName('prop:balloon'))throw Error('Late load added detached balloons');
 const {disposePropCache}=await import('/src/props.ts');disposePropCache();if(sharedDisposals!==1)throw Error('Cache did not release shell');
 return {maxTieError,minBodyGap,intersections,colors:[...colors],sharedShellGeometries:1,posedCordGeometries:6,ownedLatexMaterials:6,cordDisposals,materialDisposals,sharedDisposals,rebuild:true,lateLoad:true};
});
if(label==='fallback'&&(result.count!==6||result.instances.some(o=>o.materials.some(m=>m.name==='BalloonLatex'))))throw Error('Missing-asset fallback failed');
if(errors.length)throw Error(errors.join('\n'));
result.errors=errors;writeFileSync(resolve(out,label+'-integration.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();server.kill();unlinkSync(html);if(label==='before')unlinkSync(beforeModule);}
