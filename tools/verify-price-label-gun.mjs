// User-assets-free real-app photographs and placement checks.
// Start Vite on LABEL_GUN_PORT (default 4279), then run this script.
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve(process.env.LABEL_GUN_OUT || 'scratch/publicity-kits/issue-192');
mkdirSync(out, { recursive: true });
if (readdirSync('public/user-assets').some(p => p !== 'README.md')) throw Error('Screenshots require a user-assets-free tree');
const browser = await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
try {
 const page = await browser.newPage(); await page.setViewport({width:640,height:480});
 page.on('console', m=>{if(/Loading store textures|Inside the store|GPU|label/i.test(m.text())) console.log(m.text());});
 page.on('pageerror', e=>console.log('PAGE ERROR',e.message));
 await page.evaluateOnNewDocument((theme)=>{
   localStorage.clear();localStorage.setItem('bb_quality','low');localStorage.setItem('bb_outside','day');
   localStorage.setItem('bb_theme',theme);localStorage.setItem('bb_store_format','corporate');
 }, process.env.LABEL_GUN_THEME || 'bb-1993');
 await page.goto(`http://localhost:${process.env.LABEL_GUN_PORT || 4279}/?demo=1`,{waitUntil:'domcontentloaded',timeout:120000});
 console.log('DOM loaded');

 await page.waitForFunction(()=>!!window.storeScene?.scene.getObjectByName('price-label-gun-model'),{timeout:600000,polling:1000});
 const metrics=await page.evaluate(async()=>{
   const T=await import('/node_modules/three/build/three.module.js');
   const s=window.storeScene;s.pauseRendering();
   s.renderer.setPixelRatio(1); s.renderer.setSize(1200,900,false);
   const kit=s.scene.getObjectByName('counter-price-label-gun');
   const bounds=new T.Box3().setFromObject(kit);
   let draws=0,triangles=0,instances=0;
   kit.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count ?? o.geometry.attributes.position.count)/3*(o.count ?? 1);if(o.isInstancedMesh)instances+=o.count;}});
   window.labelGunShot=(pos,target)=>{
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
   if(!contained) throw Error('Price label gun escaped its existing counter navigation obstacle');
   const adjoining = ['counter-terminal-station-0','counter-terminal-station-1','wall-track-board-wall-track-board-registers', 'office-kit-model'].map(name=>{
     const object=s.scene.getObjectByName(name);
     if(!object) return {name,present:false};
     const other=new T.Box3().setFromObject(object);
     if(bounds.intersectsBox(other)) throw Error('Price label gun intersects '+name);
     return {name,present:true,intersects:false,bounds:{min:other.min.toArray(),max:other.max.toArray()}};
   });
   const { priceLabelGunAnchor } = await import('/src/store-fixtures-config.ts');
   for (const shape of ['desk','usquare']) if(priceLabelGunAnchor(shape,11,8.5,'bb-1993')!==null) throw Error('Unsupported shape admitted');
   for (const era of ['bb-1990','bb-2000','bb-2010']) if(priceLabelGunAnchor('shield',11,8.5,era)!==null) throw Error('Unsupported era admitted');
   if(Math.abs(priceLabelGunAnchor('shield',11,10,'bb-1993').z-9.25)>.0001) throw Error('Anchor datum drift');
   if(Math.abs(bounds.min.y-3.54)>.001) throw Error('Prop does not contact counter');
   return {bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},draws,triangles,instances,containedInCounterFootprint:contained,adjoining,nav};
 });
 writeFileSync(out+'/installed-metrics.json',JSON.stringify(metrics,null,2));
 for(const [name,pos,target] of [
   ['before',[8.7,5.5,4.3],[7.1,3.7,7.75]],
   ['installed-eye',[8.7,5.5,4.3],[7.1,3.7,7.75]],
   ['front',[7.55,4.4,6.8],[7.1,3.66,7.75]],
   ['side',[8.05,4.15,7.75],[7.1,3.66,7.75]],
   ['rear',[6.25,4.15,8.22],[7.1,3.66,7.75]],
   ['footprint-photo',[7.1,6.2,7.75],[7.1,3.54,7.75]],
 ]){
   const data = await page.evaluate(({pos,target,name})=>{window.storeScene.scene.getObjectByName('counter-price-label-gun').visible=name!=='before';return window.labelGunShot(pos,target);},{pos,target,name});
   writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
   console.log(name);
 }

 console.log(JSON.stringify(metrics));
} finally {await browser.close();}
