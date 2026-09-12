// Actual StoreScene photography, following verify-bollards.mjs. No private assets.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {checkAlcoveCurtain} from './check-alcove-curtain.mjs';
const out=resolve(process.argv[2]||'docs/screenshots/alcove-curtain'),phase=process.argv[3]||'after';mkdirSync(out,{recursive:true});
const port=6232,html=resolve('tools/verify-alcove-curtain.html');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser;
try {
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:900px"></div><script type="module">
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');window.store=new StoreScene(document.getElementById('store'),[],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1200,height:900});
if(phase==='fallback'){await page.setRequestInterception(true);page.on('request',r=>r.url().endsWith('/alcove-curtain.glb')?r.abort():r.continue());}
await page.goto(`http://localhost:${port}/tools/verify-alcove-curtain.html`);await page.waitForFunction(()=>window.boot);
await page.evaluate(()=>{localStorage.clear();Object.entries({bb_store_format:'mom-and-pop',bb_theme:'default',bb_quality:'medium',bb_ssao:'0',bb_tv_demo_loop:'0',bb_live_mirrors:'0'}).forEach(([k,v])=>localStorage.setItem(k,v));});
await page.evaluate(()=>window.boot());await delay(2000);
if(phase==='after')await page.waitForFunction(()=>window.store.scene.getObjectByName('AlcoveBeadBarrel_instances'));
const anchor=await page.evaluate(()=>{const s=window.store;return [11+s.getStoreWidth()/2-7.5,0,s.backWallZ+5-.35-1.5];});
if(!process.argv.includes('--checks-only'))for(const [name,offset,target] of [['front',[-6,4.1,0],[0,3.6,0]],['side',[-2,5.2,-1],[0,4.8,0]],['rear',[3,4.5,0],[0,3.6,0]],['attachment',[-.7,6.5,.4],[0,6.6,0]]]){
await page.evaluate(({anchor,offset,target})=>{const s=window.store,p=anchor.map((v,i)=>v+offset[i]),c=anchor.map((v,i)=>v+target[i]);s.teleportWalk(p[0],p[2],Math.atan2(p[0]-c[0],p[2]-c[2])*180/Math.PI,-Math.atan2(p[1]-c[1],Math.hypot(p[0]-c[0],p[2]-c[2]))*180/Math.PI,p[1],true);s.requestRender();},{anchor,offset,target});await delay(900);await page.screenshot({path:resolve(out,`${phase}-${name}.png`)});
}
if(phase==='after')writeFileSync(resolve(out,'verification.json'),JSON.stringify(await checkAlcoveCurtain(page),null,2));
assert.deepEqual(errors,[]);console.log(phase,anchor);
}finally{await browser?.close();server.kill();unlinkSync(html);}
