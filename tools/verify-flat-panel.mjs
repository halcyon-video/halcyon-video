// Real StoreScene photography, using the existing verify-counter-tv workflow.
import {mkdirSync, writeFileSync, unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const out=resolve(process.env.LCD_OUT || '/tmp/flat-panel-terminal');
const phase=process.env.LCD_PHASE || 'after', theme=process.env.LCD_THEME || 'bb-2010';
const layout=process.env.LCD_LAYOUT || 'default';
mkdirSync(out,{recursive:true});
const port=Number(process.env.LCD_PORT || 6391), html=resolve(`tools/verify-flat-panel-${port}.html`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(port),'--strictPort'],{stdio:'ignore'});let browser;
try {
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:1100px;height:850px"></div><script type="module">
import * as T from 'three';window.T=T;
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';window.GLTFLoader=GLTFLoader;
window.boot=async(theme,layout)=>{localStorage.clear();Object.entries({bb_theme:theme,bb_store_format:theme==='mom-and-pop'?'mom-and-pop':'corporate',bb_storefront:layout,bb_quality:'low',bb_ssao:'0',bb_tv_demo_loop:'0'}).forEach(([k,v])=>localStorage.setItem(k,v));const {StoreScene}=await import('/src/three-scene.ts');const movies=Array.from({length:40},(_,i)=>({id:'movie'+i,title:'Movie '+i,year:1993,duration:'1h 40m',rating:'PG',overview:'',director:'',actors:[],genres:['Drama'],localPath:''}));window.store=new StoreScene(document.getElementById('store'),[{id:'movies',name:'Movies',movies,genres:['Drama']}],()=>{});await store.ready;};</script>`);
for(let i=0;i<100;i++){try{if((await fetch('http://localhost:'+port)).ok)break;}catch{}await delay(100);}
browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage();await page.setViewport({width:1100,height:850});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://localhost:${port}/tools/verify-flat-panel-${port}.html`);await page.evaluate((t,l)=>window.boot(t,l),theme,layout);
await page.waitForFunction(()=>!!store.scene.getObjectByName('rental-keyboard-model') && !!store.scene.getObjectByName('rental-terminal-model'),{timeout:120000});await delay(1500);
await page.evaluate(async()=>{const m=await import('/src/counter-terminal.ts');window.menu=m.counterTerminalLines(['btn-settings','btn-streaming','btn-media-date','btn-project','btn-cancel'],4);});
const evidence=await page.evaluate(()=>{const s=store,T=window.T;s.pauseRendering();const clerk=s.scene.getObjectByName('lit-clerk-billboard');if(clerk)clerk.visible=false;s.renderer.setPixelRatio(1);s.renderer.setSize(1100,850,false);const root=s.scene.getObjectByName('counter-terminal-station-0');root.updateMatrixWorld(true);
window.draw=view=>{const offset={context:[-2.8,2.5,4.5],front:[.1,1.5,3],side:[2.6,1.6,.6],rear:[1.6,1.9,-2.5],detail:[.9,1,-1.5]}[view];if(view==='dock'){const pose=s.entrance.getSearchCameraPose();s.camera.position.copy(pose.camPos);s.camera.lookAt(pose.lookAt);}else{s.camera.position.copy(root.localToWorld(new T.Vector3(...offset)));s.camera.lookAt(root.localToWorld(new T.Vector3(0,.8,0)));}s.camera.updateMatrixWorld();s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();};
const {lines,cursorLine}=window.menu; s.entrance.setTerminalText(lines,cursorLine);
const pose=s.entrance.getSearchCameraPose(),live=root.getObjectByName('counter-terminal-live-screen');
const lcd=root.getObjectByName('rental-terminal-model');
const keyboard=root.getObjectByName('rental-keyboard-model');
const localBody=o=>{o.updateMatrixWorld(true);const b=new T.Box3();o.traverse(c=>{if(c.isMesh&&!c.material.name.endsWith('CableRubber')){const pos=c.geometry.attributes.position;for(let i=0;i<pos.count;i++){const v=new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(c.matrixWorld);root.worldToLocal(v);b.expandByPoint(v);}}});return {min:b.min.toArray(),max:b.max.toArray()};};
const placement={monitor:localBody(lcd),keyboard:localBody(keyboard),islandDepth:s.entrance.counterTopInfo.depth};
const resources=new Set();lcd.traverse(o=>{if(o.isMesh){resources.add(o.geometry);resources.add(o.material);for(const v of Object.values(o.material))if(v?.isTexture)resources.add(v);}});
return {placement,clerkHiddenForInspection:true,dockDistance:pose.camPos.distanceTo(pose.lookAt),liveScreen:live?.geometry.parameters,hardware:lcd.userData.hardwareVariant,resources:resources.size,stations:[0,1].map(i=>{const g=s.scene.getObjectByName('counter-terminal-station-'+i);return g?{anchor:g.position.toArray(),models:g.children.map(c=>c.name),variant:g.getObjectByName('rental-terminal-model')?.userData.hardwareVariant}:null;}),shape:s.entrance?.counterTopInfo,entranceKeys:Object.keys(s).filter(k=>k.toLowerCase().includes('entrance'))};});
for(const view of (process.env.LCD_PHOTOS === '0' ? [] : ['context','front','side','rear','detail','dock'])){const data=await page.evaluate(view=>window.draw(view),view);writeFileSync(resolve(out,`${phase}-${theme}-${layout}-${view}.png`),Buffer.from(data.split(',')[1],'base64'));}
assert.ok(Math.abs(evidence.dockDistance-1.3)<1e-6);
assert.ok(Math.abs(evidence.placement.monitor.min[1])<1e-5);
assert.ok(Math.abs(evidence.placement.keyboard.min[1])<1e-5);
assert.ok(evidence.placement.keyboard.min[2]>=-evidence.placement.islandDepth/2);
assert.ok(evidence.placement.keyboard.max[2]<=evidence.placement.islandDepth/2);
if(theme==='bb-2010') {assert.equal(evidence.stations[0].variant,'lcd');assert.equal(evidence.stations[1].variant,'crt');}
else assert.equal(evidence.hardware,'crt');
if (process.env.LCD_CHECKS !== '0' && theme === 'bb-2010') {
  evidence.lifecycle = await page.evaluate(async () => {
    const {EntranceCheckout}=await import('/src/entrance/index.ts');
    const {GLTFLoader}=window;
    const T=window.T, s=window.store;
    window.makeTerminalProbe=()=>{
      const parent=new T.Group();s.scene.add(parent);
      const fixture=new EntranceCheckout(s.fixtureContext());fixture.counterTopInfo={depth:1.6};
      fixture.buildDeskTerminals(parent,[{x:0,y:0,z:0,rotY:0},{x:3,y:0,z:0,rotY:0}]);
      let canvasDisposals=0;fixture.terminalTex.addEventListener('dispose',()=>canvasDisposals++);
      return {parent,fixture,get canvasDisposals(){return canvasDisposals;}};
    };
    const root=s.scene.getObjectByName('counter-terminal-hardware'), resources=new Set(), counts=new Map();
    root.traverse(o=>{if(o.isMesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}}});
    resources.forEach(r=>r.addEventListener('dispose',()=>counts.set(r,(counts.get(r)||0)+1)));
    root.parent.removeFromParent();
    const cleanup={expected:resources.size,disposed:counts.size,maxDisposals:Math.max(...counts.values()),detached:!root.parent};
    // Wrap actual loader delivery so late-arrival ownership can be observed.
    const original=GLTFLoader.prototype.load;window.lateDisposals=[];
    GLTFLoader.prototype.load=function(url,loaded,...rest){return original.call(this,url,gltf=>{
      const entry={url,expected:0,disposed:0};const owned=new Set();
      gltf.scene.traverse(o=>{if(o.isMesh){owned.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){owned.add(m);for(const v of Object.values(m))if(v?.isTexture)owned.add(v);}}});
      entry.expected=owned.size;owned.forEach(r=>r.addEventListener('dispose',()=>entry.disposed++));
      window.lateDisposals.push(entry);loaded(gltf);
    },...rest);};
    const late=window.makeTerminalProbe();late.parent.removeFromParent();window.lateProbe=late;
    return {cleanup};
  });
  assert.equal(evidence.lifecycle.cleanup.expected,evidence.lifecycle.cleanup.disposed);
  assert.equal(evidence.lifecycle.cleanup.maxDisposals,1);assert.ok(evidence.lifecycle.cleanup.detached);
  await page.waitForFunction(()=>window.lateDisposals.length===3 && window.lateDisposals.every(v=>v.disposed===v.expected),{timeout:30000});
  evidence.lifecycle.late=await page.evaluate(()=>({resources:window.lateDisposals,children:window.lateProbe.parent.children.length,canvasDisposals:window.lateProbe.canvasDisposals}));
  assert.equal(evidence.lifecycle.late.children,0);assert.equal(evidence.lifecycle.late.canvasDisposals,1);
  await page.setRequestInterception(true);
  page.on('request',r=>r.url().endsWith('/models/flat-panel-terminal.glb')?r.abort():r.continue());
  await page.evaluate(()=>{window.failedProbe=window.makeTerminalProbe();});
  await page.waitForFunction(()=>window.failedProbe.parent.getObjectByName('counter-terminal-fallback'),{timeout:30000});
  evidence.lifecycle.failure=await page.evaluate(()=>{const p=window.failedProbe;const station=p.parent.getObjectByName('counter-terminal-station-0');const pose=p.fixture.getSearchCameraPose();const result={fallback:!!station.getObjectByName('counter-terminal-fallback'),screen:!!station.getObjectByName('counter-terminal-live-screen'),dockDistance:pose.camPos.distanceTo(pose.lookAt)};p.parent.removeFromParent();return result;});
  assert.ok(evidence.lifecycle.failure.fallback && evidence.lifecycle.failure.screen);
  assert.ok(Math.abs(evidence.lifecycle.failure.dockDistance-1.3)<1e-6);
}
assert.deepEqual(errors,[]);writeFileSync(resolve(out,`${phase}-${theme}-${layout}.json`),JSON.stringify(evidence,null,2)+'\n');console.log(evidence);
} finally {await browser?.close();server.kill();unlinkSync(html);}
