// In-store photography using the existing StoreScene/teleportWalk harness.
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer';
import {checkShelfHardware} from './check-shelf-hardware.mjs';
const out=resolve(process.argv[2]||'/tmp/shelf-hardware'),label=process.argv[3]||'after';
mkdirSync(out,{recursive:true});
const port=Number(process.env.SHOT_PORT || 6237),html=resolve(`tools/verify-shelf-hardware-${port}.html`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore',env:{...process.env,GOMAXPROCS:'2',VITE_DEMO:'1'}});
let browser;
try {
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1200px;height:800px"></div><script type="module">
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.T=T;window.L=GLTFLoader;
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:160},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:2000,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await window.store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,protocolTimeout:300000,args:['--no-sandbox','--num-raster-threads=1','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
for(const theme of (process.env.SHOT_THEMES || 'bb-1990,bb-2010').split(',')) {
 const page=await browser.newPage();await page.evaluateOnNewDocument(()=>Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2}));await page.setViewport({width:1200,height:800});page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
 await page.goto(`http://localhost:${port}/tools/verify-shelf-hardware-${port}.html`);await page.waitForFunction(()=>!!window.boot);
 await page.evaluate(theme=>{localStorage.clear();Object.entries({bb_store_format:'corporate',bb_theme:theme,bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0',bb_outside:'day'}).forEach(([k,v])=>localStorage.setItem(k,v));},theme);
 console.log('Boot',theme);await page.evaluate(()=>window.boot());console.log('Ready',theme);await delay(3000);await page.evaluate(()=>window.store.pauseRendering());
 if(process.env.SHOT_GAMES) {
  await page.evaluate(async()=>{
   const s=window.store,{GameSection}=await import('/src/fixtures/game-section.ts');
   const {gameSectionPlacements}=await import('/src/store-fixtures-config.ts');
   const ctx=s.fixtureContext();ctx.gameMovies=s.libraries[0].movies.slice(0,24).map((m,i)=>({...m,id:'game'+i,game:true,platform:'NES'}));
   const f=new GameSection(gameSectionPlacements(s.getStoreWidth())[0],ctx);f.build();s.slottedFixtures.push(f);
  });
  await page.waitForFunction(()=>window.store.slottedFixtures.find(f=>f.placement.kind==='game-section')?.group?.children.filter(o=>o.name==='modeled-shelf-construction').length===12);
 }

 for(const [view,offset] of [['run',[5,1,4]],['side',[.7,.25,1.1]],['rear',[-.10,-.15,.7]],['channel',[.5,-.10,1.5]]].filter(([view])=>!process.env.SHOT_VIEWS||process.env.SHOT_VIEWS.split(',').includes(view))) {
  await page.evaluate(offset=>{const s=window.store,t=s.shelfClasps.firstTarget();if(!t)throw Error('Missing clasp anchor');const c=t.position,p=c.clone().add(t.outward.clone().multiplyScalar(offset[0])).add(new window.T.Vector3(0,offset[1],offset[2]));s.teleportWalk(p.x,p.z,Math.atan2(p.x-c.x,p.z-c.z)*180/Math.PI,-Math.atan2(p.y-c.y,Math.hypot(p.x-c.x,p.z-c.z))*180/Math.PI,p.y,true);s.requestRender();},offset);
  await delay(600);
  const png=await page.evaluate(()=>{window.debugResetResScale();return window.store.captureFeedbackSnapshot().png;});
  writeFileSync(resolve(out,`${label}-${theme}-${view}.png`),Buffer.from(png.split(',')[1],'base64'));console.log('Captured',theme,view);
 }
 console.log(theme,await page.evaluate(()=>({count:window.store.shelfClasps.count,render:window.store.renderer.info.render,memory:window.store.renderer.info.memory})));
 if(process.env.SHOT_GAMES) {
  for(const anchor of ['game','wall']) {
   await page.evaluate(anchor=>{
    const s=window.store,T=window.T;let c,p;
    if(anchor==='game') {
      const f=s.slottedFixtures.find(f=>f.placement.kind==='game-section');if(!f)throw Error('Missing stocked game fixture');
      const group=f.group;group.updateWorldMatrix(true,true);
      if(group.children.filter(o=>o.name==='modeled-shelf-construction').length!==12)throw Error('Game decks/channels did not load');
      c=group.localToWorld(new T.Vector3(.85,3.2,0));p=group.localToWorld(new T.Vector3(3.5,4.2,3));
    }else{
      const g=s.scene.getObjectByName('modeled-new-release-wall');g.updateWorldMatrix(true,true);
      c=g.localToWorld(new T.Vector3(0,4.3,.82));p=g.localToWorld(new T.Vector3(3,5.2,4));
    }
    s.teleportWalk(p.x,p.z,Math.atan2(p.x-c.x,p.z-c.z)*180/Math.PI,-Math.atan2(p.y-c.y,Math.hypot(p.x-c.x,p.z-c.z))*180/Math.PI,p.y,true);s.requestRender();
   },anchor);
   await delay(600);const png=await page.evaluate(()=>{window.debugResetResScale();return window.store.captureFeedbackSnapshot().png;});
   writeFileSync(resolve(out,`${label}-${theme}-${anchor}.png`),Buffer.from(png.split(',')[1],'base64'));
  }
 }
 if(label==='after') writeFileSync(resolve(out,`${theme}-interaction.json`),JSON.stringify(await checkShelfHardware(page),null,2));
 await page.close();
}
} finally {await browser?.close();server.kill();unlinkSync(html);}
