// StoreScene photography harness adapted from verify-hatchback.mjs.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
import { readdirSync } from 'node:fs';
import { checkBollardLifecycle } from './check-bollard-lifecycle.mjs';
if (readdirSync('public/user-assets').some(p => p !== 'README.md')) throw Error('Public photographs require no private user-assets');
const root=new URL('../',import.meta.url).pathname;
const out=resolve(process.argv[2]||'/tmp/bollard-verification'),label=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const port=6263,html=resolve(root,'tools/verify-bollards.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_DEMO:'1'}});
let browser;
try{
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1000px;height:700px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:80},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1000,height:700});page.on('pageerror',e=>console.log(e.message));
await page.goto(`http://localhost:${port}/tools/verify-bollards.html`);await page.waitForFunction(()=>!!window.boot);
await page.evaluate(()=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_theme:'bb-2000',bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day'}).forEach(([k,v])=>localStorage.setItem(k,v));});
console.log('Booting store');await page.evaluate(()=>window.boot());console.log('Store ready');
await delay(2500);
if(label==='before' && await page.evaluate(()=>!!window.store.scene.getObjectByName('entranceBollards'))) throw Error('Before capture requires the original exterior implementation');
if(label==='after') {
 await page.waitForFunction(()=>window.store.scene.getObjectByName('entranceBollards')?.getObjectByName('display-model'));
 const lifecycle=await checkBollardLifecycle(page);
 writeFileSync(resolve(out,'lifecycle.json'),JSON.stringify(lifecycle,null,2));
 console.log('Lifecycle checks passed');
}
const anchor=await page.evaluate(()=>{const g=window.store.scene.getObjectByName('exteriorEnvironment');const posts=g.getObjectByName('entranceBollards');if(posts)return posts.userData.anchors[1];const meshes=g.children.filter(o=>o.isMesh&&o.geometry.type==='CylinderGeometry'&&o.geometry.parameters.height===.9);return [meshes[1].position.x,0,meshes[1].position.z];});
const views = label==='details' ? [['side',[-4,3.5,0],[0,1.5,0]],['rear',[-.4,3.5,-2],[0,1.5,0]],['base',[-1.2,1.1,1.7],[0,.15,0]],['eye',[-3,5.5,5],[0,1.5,0]]] : [['entrance',[ -9,5.5,10],[-4,1.4,0]],['inside',[-8,5.5,-7],[0,1.5,0]],['side',[5,3.5,0],[0,1.5,0]],['rear',[2,4,-5],[0,1.3,0]],['base',[1.3,1.1,1.7],[0,.15,0]]];
for(const [name,offset,target] of views){
 await page.evaluate(({anchor,offset,target})=>{const s=window.store;const p=anchor.map((v,i)=>v+offset[i]),c=anchor.map((v,i)=>v+target[i]);s.teleportWalk(p[0],p[2],Math.atan2(p[0]-c[0],p[2]-c[2])*180/Math.PI,-Math.atan2(p[1]-c[1],Math.hypot(p[0]-c[0],p[2]-c[2]))*180/Math.PI,p[1],true);s.requestRender();},{anchor,offset,target});await delay(900);if(label==='details') { const png=await page.evaluate(()=>{window.debugResetResScale();return window.store.captureFeedbackSnapshot().png;});writeFileSync(resolve(out,label+'-'+name+'.png'),Buffer.from(png.split(',')[1],'base64')); } else await page.screenshot({path:resolve(out,label+'-'+name+'.png')});console.log('Captured',name);
}
console.log(label,anchor);
}finally{await browser?.close();server.kill();unlinkSync(html);}
