// User-assets-free real-app photographs and placement checks.
// Start Vite on OFFICE_PORT (default 4279), then run this script.
import puppeteer from 'puppeteer';
import { writeOfficeFootprint } from './office-footprint.mjs';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve(process.env.OFFICE_OUT || 'scratch/publicity-kits/issue-279');
mkdirSync(out, { recursive: true });
if (readdirSync('public/user-assets').some(p => p !== 'README.md')) throw Error('Screenshots require a user-assets-free tree');
const browser = await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
try {
 const page = await browser.newPage(); await page.setViewport({width:640,height:480});
 page.on('console', m=>{if(/Loading store textures|Inside the store|GPU|office/i.test(m.text())) console.log(m.text());});
 page.on('pageerror', e=>console.log('PAGE ERROR',e.message));
 await page.evaluateOnNewDocument((theme)=>{
   localStorage.clear();localStorage.setItem('bb_quality','low');localStorage.setItem('bb_outside','day');
   localStorage.setItem('bb_theme',theme);localStorage.setItem('bb_store_format','corporate');
 }, process.env.OFFICE_THEME || 'bb-1993');
 await page.goto(`http://localhost:${process.env.OFFICE_PORT || 4279}/?demo=1`,{waitUntil:'domcontentloaded',timeout:120000});
 console.log('DOM loaded');

 await page.waitForFunction(()=>!!window.storeScene?.scene.getObjectByName('office-kit-model'),{timeout:600000,polling:1000});
 const metrics=await page.evaluate(async()=>{
   const T=await import('/node_modules/three/build/three.module.js');
   const s=window.storeScene;s.pauseRendering();
   s.renderer.setPixelRatio(1); s.renderer.setSize(1200,900,false);
   const kit=s.scene.getObjectByName('counter-office-kit');
   const bounds=new T.Box3().setFromObject(kit);
   let draws=0,triangles=0,instances=0;
   kit.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count ?? o.geometry.attributes.position.count)/3*(o.count ?? 1);if(o.isInstancedMesh)instances+=o.count;}});
   window.officeShot=(pos,target)=>{
     s.camera.position.set(...pos);s.camera.lookAt(...target);s.camera.updateMatrixWorld();
     s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);
     return s.renderer.domElement.toDataURL();
   };
   const nav = s.entrance.getClerkNav();
   const band = nav.footprints.find(f=>f.label==='structure:counter-band-nav-4');
   const contained = [bounds.min.x,bounds.max.x].every(x=>[bounds.min.z,bounds.max.z].every(z=>{
     const dx=x-band.cx,dz=z-band.cz,c=Math.cos(band.yaw),n=Math.sin(band.yaw);
     return Math.abs(dx*c-dz*n)<=band.w/2 && Math.abs(dx*n+dz*c)<=band.d/2;
   }));
   if(!contained) throw Error('Office kit escaped its existing counter navigation obstacle');
   const adjoining = ['counter-terminal-station-0','counter-terminal-station-1','wall-track-board-wall-track-board-registers'].map(name=>{
     const object=s.scene.getObjectByName(name);
     if(!object) return {name,present:false};
     const other=new T.Box3().setFromObject(object);
     if(bounds.intersectsBox(other)) throw Error('Office kit intersects '+name);
     return {name,present:true,intersects:false,bounds:{min:other.min.toArray(),max:other.max.toArray()}};
   });
   const { counterOfficeKitAnchor } = await import('/src/store-fixtures-config.ts');
   if(counterOfficeKitAnchor('desk',11,8.6)!==null || counterOfficeKitAnchor('usquare',11,8.6)!==null) throw Error('Unsupported counter shape received office kit');
   if(Math.abs(counterOfficeKitAnchor('shield',11,10).z-9.15)>.0001) throw Error('Anchor did not track counter datum');
   return {bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},draws,triangles,instances,containedInCounterFootprint:contained,adjoining,nav};
 });
 writeFileSync(out+'/installed-metrics.json',JSON.stringify(metrics,null,2));
 for(const [name,pos,target] of [
   ['before',[12.6,5.4,3.7],[13,4.6,7.8]],
   ['installed-eye',[12.6,5.4,3.7],[13,4.6,7.8]],
   ['front',[13.0,5.5,4.6],[13.1,4.45,7.8]],
   ['side',[16.7,5.3,6.0],[13.1,4.6,7.8]],
   ['rear',[13.0,5.7,10.5],[13.1,4.6,7.8]],
   ['footprint-photo',[13.1,10,7.3],[13.1,0,7.3]],
 ]){
   const data = await page.evaluate(({pos,target,name})=>{window.storeScene.scene.getObjectByName('counter-office-kit').visible=name!=='before';return window.officeShot(pos,target);},{pos,target,name});
   writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
   console.log(name);
 }
 await writeOfficeFootprint(metrics, out, browser);
 console.log(JSON.stringify(metrics));
} finally {await browser.close();}
