// Real store, isolated settings, public assets. Start Vite on APPAREL_PORT.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readdirSync,unlinkSync} from 'node:fs';
const out=process.env.APPAREL_OUT||'scratch/counter-apparel';mkdirSync(out,{recursive:true});
assert.deepEqual(readdirSync('public/user-assets'),['README.md']);
const html='tools/counter-apparel-check.html';
writeFileSync(html,`<body style="margin:0"><div id="store" style="width:640px;height:480px"></div><script type="module">
window.boot=async()=>{const {StoreScene}=await import('/src/three-scene.ts');window.storeScene=new StoreScene(document.getElementById('store'),[],()=>{});await window.storeScene.ready;console.log('Ready');};
</script>`);
const browser=await puppeteer.launch({headless:true,protocolTimeout:600000,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage();await page.setViewport({width:640,height:480});
 page.on('console',m=>{if(/store|apparel|GPU|Loading/i.test(m.text()))console.log(m.text());});
 page.on('pageerror',e=>console.log('PAGE',e.message));
 await page.evaluateOnNewDocument(()=>{localStorage.clear();localStorage.setItem('bb_quality','low');localStorage.setItem('bb_outside','day');localStorage.setItem('bb_theme','bb-1993');localStorage.setItem('bb_store_format','corporate');});
 await page.goto(`http://localhost:${process.env.APPAREL_PORT||4205}/tools/counter-apparel-check.html`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>!!window.boot);await page.evaluate(()=>window.boot());
 await page.waitForFunction(()=>window.storeScene?.scene.getObjectByName('counter-apparel')?.getObjectByName('display-model'),{timeout:600000});
 const metrics=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');const s=window.storeScene;s.pauseRendering();s.overviewCursors?.setVisible(false);if(s.selectionArrow)s.selectionArrow.visible=false;s.renderer.setPixelRatio(1);s.renderer.setSize(1200,900,false);
  const g=s.scene.getObjectByName('counter-apparel');const b=new T.Box3().setFromObject(g);const meshes=[];
  g.traverse(o=>{if(o.isMesh)meshes.push({name:o.name,triangles:(o.geometry.index?.count||o.geometry.attributes.position.count)/3,uv:!!o.geometry.attributes.uv,material:o.material.name,map:!!o.material.map,normal:!!o.material.normalMap,roughness:!!o.material.roughnessMap});});
  const adjoining=['counter-terminal-station-0','counter-terminal-station-1','counter-office-kit','wall-track-board-wall-track-board-registers'].map(name=>{const o=s.scene.getObjectByName(name);const box=o?new T.Box3().setFromObject(o):null;return {name,present:!!o,intersects:box?(()=>{let hit=false;const tri=new T.Triangle();g.updateWorldMatrix(true,true);g.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position,idx=m.geometry.index;for(let i=0;i<(idx?.count||p.count);i+=3){[tri.a,tri.b,tri.c].forEach((v,k)=>v.fromBufferAttribute(p,idx?idx.getX(i+k):i+k).applyMatrix4(m.matrixWorld));if(box.intersectsTriangle(tri)){hit=true;break;}}});return hit;})():false,bounds:box?{min:box.min.toArray(),max:box.max.toArray()}:null};});
  window.apparelShot=(pos,target,before)=>{g.visible=!before;s.camera.position.set(...pos);s.camera.lookAt(...target);s.camera.updateMatrixWorld();s.renderer.setRenderTarget(null);s.renderer.render(s.scene,s.camera);return s.renderer.domElement.toDataURL();};
  return {bounds:{min:b.min.toArray(),max:b.max.toArray()},meshes,adjoining};
 });
 writeFileSync(out+'/installed-metrics.json',JSON.stringify(metrics,null,2));
 for(const [name,pos,target] of [
  ['before',[12,5.8,1],[14.7,5.8,8.5]],['after',[12,5.8,1],[14.7,5.8,8.5]],
  ['front',[15.6,6.0,4.5],[15.6,6.0,8.5]],['side',[18,6.1,7.2],[15,5.9,8.3]],
  ['rear',[15.6,6.15,11.8],[15.6,6.05,8.5]],['cap-rear',[14.35,7.0,9.6],[14.35,6.9,8.3]],['hooks',[16.1,7.3,7.3],[15.7,6.78,8.48]],
 ]){const data=await page.evaluate(({pos,target,name})=>window.apparelShot(pos,target,name==='before'),{pos,target,name});writeFileSync(out+'/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));console.log(name);}
 assert.ok(metrics.meshes.every(m=>m.uv&&m.normal&&m.roughness));assert.ok(metrics.adjoining.every(o=>!o.intersects),'apparel clear of terminal/sign/office bounds');
 assert.ok(metrics.meshes.filter(m=>/Cotton|Twill|Stitch/.test(m.material)).every(m=>m.map&&m.normal&&m.roughness),'all fabric roles carry PBR textures');
 console.log(JSON.stringify(metrics));
} finally {await browser.close();unlinkSync(html);}
