// Private optional housing: photograph the actual store. Adapted from verify-counter-tv.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const out=resolve(process.argv[2]||'/tmp/cash-housing');mkdirSync(out,{recursive:true});
const port=6298,html=resolve('tools/verify-cash-housing.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});let browser;
try {
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1100px;height:850px"></div><script type="module">
import * as T from 'three';window.T=T;
window.preset='${process.env.HOUSING_PRESET || 'standard'}';window.boot=async()=>{localStorage.clear();Object.entries({bb_theme:'bb-2010',bb_store_format:'corporate',bb_storefront:window.preset,bb_quality:'high',bb_ssao:'0',bb_tv_demo_loop:'0'}).forEach(([k,v])=>localStorage.setItem(k,v));const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:40},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1993,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});const page=await browser.newPage();await page.setViewport({width:1100,height:850});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://localhost:${port}/tools/verify-cash-housing.html`);await page.evaluate(()=>window.boot());await page.waitForFunction(()=>!!(store.scene.getObjectByName('counter-cash-housing-0')||store.scene.getObjectByName('counter-cash-housing-model')),{timeout:120000});await delay(1800);
await page.evaluate(async()=>{window.refreshContact=(await import('/src/fixtures/counter-equipment-contact.ts')).refreshEquipmentContact;});
const evidence=await page.evaluate(()=>{const s=store,T=window.T;s.pauseRendering();s.renderer.setPixelRatio(1);s.renderer.setSize(1100,850,false);
const model=s.scene.getObjectByName('counter-cash-housing-0')||s.scene.getObjectByName('counter-cash-housing-model');
window.housings=[];s.scene.traverse(o=>{if(o.name.startsWith('counter-cash-housing-'))housings.push(o);});
const center=model.getWorldPosition(new T.Vector3());const q=model.getWorldQuaternion(new T.Quaternion());
const stations=housings.map((o,i)=>{const station=s.scene.getObjectByName('counter-terminal-station-'+i);return station?{station,y:station.position.y}:null;});
window.draw=name=>{const before=name.startsWith('before');housings.forEach(o=>o.visible=!before);
stations.forEach(p=>{if(p)p.station.position.y=p.y-(before?model.userData.supportHeight||0:0);});
if(before)model.userData.contactCleanup?.();else window.refreshContact(model.parent);
const mode=name.replace('before-','').replace('after-','');const offset={context:[3,3,5],front:[.3,1.2,2.5],side:[2, .7,.5],rear:[1.2,2.8,-2],underside:[1.2,.12,1.7]}[mode];
s.camera.position.copy(new T.Vector3(...offset).applyQuaternion(q).add(center));s.camera.lookAt(center.clone().add(new T.Vector3(0,.15,0)));s.camera.updateMatrixWorld();s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();};
let triangles=0,draws=0;const materials=new Set(),textures=new Set();model.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;draws++;if(!o.geometry.attributes.uv||!o.geometry.attributes.normal)throw Error('Missing attributes');materials.add(o.material.name);for(const v of Object.values(o.material))if(v?.isTexture)textures.add(v);}});
return {anchor:center.toArray(),instances:housings.length,triangles,draws,materials:[...materials],textures:textures.size,supportHeight:model.userData.supportHeight,textureBytesEstimateWithMipmaps:textures.size*256*256*4*4/3,contactReceiverRemoved:!model.getObjectByName('HousingContactBake')};});
assert.ok(evidence.instances>0);assert.ok(evidence.contactReceiverRemoved);
for(const name of ['before-context','after-context','before-front','after-front','after-side','after-rear','after-underside']){const data=await page.evaluate(name=>window.draw(name),name);writeFileSync(resolve(out,name+'.png'),Buffer.from(data.split(',')[1],'base64'));}
assert.deepEqual(errors,[]);writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log(evidence);
}finally{await browser?.close();server.kill();unlinkSync(html);}
