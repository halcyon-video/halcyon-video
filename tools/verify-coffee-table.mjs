// Real BackRoom consumer photography, adapted from verify-mats.mjs.
import { mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const out=resolve(process.argv[2]||'/tmp/coffee-table'),label=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const html=resolve('tools/verify-coffee-table.html'),port=6215;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser;
try {
writeFileSync(html,`<body style="margin:0"><script type="module">
import * as T from 'three';import {BackRoom,BACK_ROOM_ORIGIN} from '/src/back-room.ts';import {disposePropCache} from '/src/props.ts';
window.boot=async()=>{localStorage.clear();localStorage.setItem('bb_quality','low');localStorage.setItem('bb_ssao','0');localStorage.setItem('bb_tv_demo_loop','0');window.T=T;window.Room=BackRoom;const {StoreScene}=await import('/src/three-scene.ts');const host=document.createElement('div');host.style.cssText='width:1100px;height:800px';document.body.append(host);window.store=new StoreScene(host,[{id:'movies',name:'Movies',movies:Array.from({length:24},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1995,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''})),genres:['Drama']}],()=>{});console.log('Store constructed');await store.ready;console.log('Store ready');window.scene=store.scene;window.room=new BackRoom(scene,{log:()=>{}});
await room.build([{id:'test',title:'The Last Screening',year:1995,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}],{items:['test'],checkoutAt:'1995-09-08T18:00:00',unlockAt:'1995-09-11T08:00:00'},false);
window.r=store.renderer;r.setSize(1100,800);r.setPixelRatio(1);store.isRendering=false;
window.c=new T.PerspectiveCamera(48,1100/800,.01,100);window.view=(p,t)=>{c.position.copy(BACK_ROOM_ORIGIN).add(new T.Vector3(...p));c.lookAt(BACK_ROOM_ORIGIN.clone().add(new T.Vector3(...t)));r.render(scene,c);};window.clean=()=>{const table=scene.getObjectByName('prop:coffee_table');const geometries=new Set();table?.traverse(o=>{if(o.isMesh)geometries.add(o.geometry);});let freed=0;for(const g of geometries)g.addEventListener('dispose',()=>freed++);room.dispose();const freedByRoom=freed;disposePropCache();const freedByCache=freed-freedByRoom;return {freedByRoom,freedByCache,sharedGeometries:geometries.size,roomRemoved:!scene.getObjectByName('back-room')};};};</script>`);
for(let i=0;i<100;i++){try {if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage(),errors=[];page.on('console',m=>{if(m.type()==='log')console.log(m.text());});page.on('pageerror',e=>{errors.push(e.message);console.log(e.message);});await page.setViewport({width:1100,height:800});
if(label==='before'){await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/models/coffee_table.glb')?r.respond({status:200,contentType:'model/gltf-binary',body:readFileSync(resolve(out,'original-coffee-table.glb'))}):r.continue());}
if(label==='fallback'){await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/models/coffee_table.glb')?r.abort():r.continue());}
await page.goto('http://localhost:'+port+'/tools/verify-coffee-table.html');await page.waitForFunction(()=>!!window.boot);await page.evaluate(()=>window.boot());await delay(2000);
for(const [name,p,t] of [['room',[4.5,4.6,7],[0,1.5,-.7]],['seated',[.34,2.5,2.42],[.30,2.08,.42]],['side',[5,2.7,1],[0,1.25,.9]],['rear',[-3,3,-3],[0,1.35,.9]],['underside',[2.7,.35,3.8],[0,1.3,.9]]]){await page.evaluate(({p,t})=>window.view(p,t),{p,t});await page.screenshot({path:resolve(out,label+'-'+name+'.png')});}
const result=await page.evaluate(()=>{const g=scene.getObjectByName('back-room'),table=g.children.find(o=>o.name==='prop:coffee_table'||o.userData.propFallback);const b=new T.Box3().setFromObject(table);return {bounds:[b.min.toArray(),b.max.toArray()],tableTop:room.stackBaseY,materials:[...new Set((()=>{const a=[];table.traverse(o=>{if(o.isMesh)a.push(...(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name));});return a;})())],state:room.state};});
if(label==='after'){assert.ok(result.materials.includes('TableGlazing'));assert.ok(Math.abs(result.bounds[1][1]-2.0125)<1e-5);assert.ok(Math.abs(result.bounds[1][2]-result.bounds[0][2]-3.5)<1e-5);}
const interactions=await page.evaluate(()=>{const inspected=room.inspectFocused();room.update(performance.now()+1000,c);const flipped=room.toggleFlip();room.update(performance.now()+2000,c);room.closeInspect();room.update(performance.now()+3000,c);return {inspected,flipped,state:room.state};});assert.equal(interactions.inspected,true);assert.equal(interactions.flipped,true);assert.equal(interactions.state,'view');result.interactions=interactions;
result.cleanup=await page.evaluate(()=>window.clean());assert.equal(result.cleanup.roomRemoved,true);if(label==='after'){assert.equal(result.cleanup.freedByRoom,0);assert.equal(result.cleanup.freedByCache,result.cleanup.sharedGeometries);assert.ok(result.cleanup.sharedGeometries>0);}assert.deepEqual(errors,[]);writeFileSync(resolve(out,label+'-integration.json'),JSON.stringify(result,null,2));console.log(label,result);
if(label==='after') {
 await page.setRequestInterception(true);page.on('request',r=>r.url().includes('/models/coffee_table.glb')?r.abort():r.continue());
 await page.evaluate(async()=>{window.room=new Room(scene,{log:()=>{}});await room.build([{id:'test',title:'The Last Screening',year:1995,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}],{items:['test'],checkoutAt:'1995-09-08T18:00:00',unlockAt:'1995-09-11T08:00:00'},false);});
 await delay(1500);
 await page.evaluate(()=>window.view([4.5,4.6,7],[0,1.5,-.7]));await page.screenshot({path:resolve(out,'fallback-room.png')});
 const fallback=await page.evaluate(()=>{const table=scene.getObjectByName('back-room').children.find(o=>o.userData.propFallback);const b=new T.Box3().setFromObject(table);const inspected=room.inspectFocused();room.closeInspect();return {size:b.getSize(new T.Vector3()).toArray(),inspected,state:room.state};});
 assert.ok(Math.abs(fallback.size[1]-1.35)<1e-5);assert.equal(fallback.inspected,true);assert.equal(fallback.state,'view');
 fallback.cleanup=await page.evaluate(()=>window.clean());assert.equal(fallback.cleanup.roomRemoved,true);assert.deepEqual(errors,[]);
 writeFileSync(resolve(out,'fallback-integration.json'),JSON.stringify(fallback,null,2));console.log('fallback',fallback);
}

} finally {await browser?.close();server.kill();unlinkSync(html);}
