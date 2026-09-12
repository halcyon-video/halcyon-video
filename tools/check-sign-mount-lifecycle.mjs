// Real GLTF loader at the sign removal boundary; run with the photo Vite server.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer';
const browser=process.env.SIGN_MOUNT_BROWSER_URL?await puppeteer.connect({browserURL:process.env.SIGN_MOUNT_BROWSER_URL,protocolTimeout:600000}):await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const results={};let page;
try {
 page=await browser.newPage();
 await page.goto(`http://localhost:${process.env.SIGN_MOUNT_PORT||6296}/tools/verify-sign-mount-${process.env.SIGN_MOUNT_PORT||6296}.html`);
 await page.evaluate(async()=>{
  const source=await (await fetch('/src/fixtures/sign-mount.ts')).text();
  const T=await import(source.match(/from ["']([^"']*three[^"']*)["']/)[1]);
  const {registerSignMount,installSignMount}=await import('/src/fixtures/sign-mount.ts');
  window.make=()=>{
   const scene=new T.Scene(),parent=new T.Group(),fallback=new T.Group();scene.add(parent);
   const stats={renders:0,shadows:0,logs:[],geometry:{},material:{}};
   const watch=(proto,key)=>{const original=proto.dispose;proto.dispose=function(){stats[key][this.uuid]=(stats[key][this.uuid]||0)+1;return original.call(this);};return ()=>proto.dispose=original;};
   const restoreG=watch(T.BufferGeometry.prototype,'geometry'),restoreM=watch(T.Material.prototype,'material');
   registerSignMount(parent,fallback,{width:4,topY:10,ceilingY:13.5,rigid:false});
   window.case={parent,fallback,stats,restore:()=>{restoreG();restoreM();}};
   installSignMount({scene,requestRender:()=>stats.renders++,requestShadowRefresh:()=>stats.shadows++,log:m=>stats.logs.push(m)},parent);
  };
 });
 await page.evaluate(()=>window.make());
 await page.waitForFunction(()=>!!window.case.parent.getObjectByName('display-model'));
 results.success=await page.evaluate(()=>{const c=window.case;const hidden=!c.fallback.visible;c.parent.removeFromParent();c.restore();return {...c.stats,hidden,removed:!c.parent.getObjectByName('display-model')};});
 assert.equal(results.success.hidden,true);assert.equal(results.success.removed,true);
 assert.equal(results.success.renders,1);assert.equal(results.success.shadows,1);
 assert.equal(Object.keys(results.success.geometry).length,7);assert.ok(Object.values(results.success.geometry).every(n=>n===1));
 assert.equal(Object.keys(results.success.material).length,2);assert.ok(Object.values(results.success.material).every(n=>n===1));
 await page.setCacheEnabled(false);await page.setRequestInterception(true);
 let pending;page.on('request',r=>r.url().includes('/models/sign-mount.glb')?pending=r:r.continue());
 await page.evaluate(()=>window.make());
 for(let i=0;i<100&&!pending;i++)await new Promise(r=>setTimeout(r,20));assert.ok(pending);
 await page.evaluate(()=>window.case.parent.removeFromParent());await pending.continue();
 await page.waitForFunction(()=>Object.keys(window.case.stats.geometry).length===7);
 results.late=await page.evaluate(()=>{const c=window.case;c.restore();return {...c.stats,adopted:!!c.parent.getObjectByName('display-model')};});
 assert.equal(results.late.adopted,false);assert.equal(results.late.renders,0);assert.equal(results.late.shadows,0);
 assert.ok(Object.values(results.late.geometry).every(n=>n===1));assert.equal(Object.keys(results.late.material).length,2);
 page.removeAllListeners('request');page.on('request',r=>r.url().includes('/models/sign-mount.glb')?r.abort():r.continue());
 await page.evaluate(()=>window.make());await page.waitForFunction(()=>window.case.stats.logs.length>0);
 results.failure=await page.evaluate(()=>{const c=window.case;c.parent.removeFromParent();c.restore();return {...c.stats,fallbackVisible:c.fallback.visible,adopted:!!c.parent.getObjectByName('display-model')};});
 assert.equal(results.failure.fallbackVisible,true);assert.equal(results.failure.adopted,false);assert.equal(results.failure.renders,0);
 writeFileSync(process.argv[2]||'scratch/sign-mount-lifecycle.json',JSON.stringify(results,null,2)+'\n');console.log('Sign mount success/removal, delayed load and network fallback: passed');
} finally {if(process.env.SIGN_MOUNT_BROWSER_URL){await page?.close();await browser.disconnect();}else await browser.close();}
