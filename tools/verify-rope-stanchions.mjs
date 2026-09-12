// Run Vite on ROPE_CHECK_PORT (4386) first. Public-safe browser lifecycle/evidence.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
const out = resolve(process.env.ROPE_CHECK_OUT || 'scratch/rope-stanchions');
assert.deepEqual(readdirSync('public/user-assets'), ['README.md']);
mkdirSync(out,{recursive:true});
const browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage(), errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.setViewport({width:1400,height:950});
 await page.goto(`http://localhost:${process.env.ROPE_CHECK_PORT || 4386}/tools/rope-stanchions-preview.html`);
 await page.waitForFunction(()=>window.preview?.ready);
 for(const view of ['front','side','rear','eye','supports']) {
  await page.evaluate(v=>window.setView(v),view);await page.screenshot({path:resolve(out,view+'.png')});
 }
 const gate = await page.evaluate(async () => {
   const { admitFixturePlacements, DEFAULT_FIXTURE_PLACEMENTS } = await import('/src/store-fixtures-config.ts');
   return admitFixturePlacements(DEFAULT_FIXTURE_PLACEMENTS,{floorDisplays:false,counterShape:'desk'}).some(p=>p.kind==='rope-stanchions');
 });
 assert.equal(gate,false,'compact format excludes the queue');
 const reports=[];
 for(const options of [{},{span:7,sag:.25},{span:5,sag:.15},{span:NaN,sag:Infinity}]) {
  await page.evaluate(options=>{ const p=window.preview;p.fixture.dispose();p.fixture=p.createFixture({...p.placement,options},p.ctx);p.fixture.build(); },options);
  await page.waitForFunction(()=>window.preview.scene.getObjectByName('display-model'));
  const r=await page.evaluate(()=>{
   const p=window.preview,g=p.scene.getObjectByName(p.placement.id),m=g.getObjectByName('display-model');
   const geometry=new Set(),materials=new Set(),instances=new Set();
   const meshes=[]; let maxRadiusError=0;
   g.traverse(o=>{if(o.isMesh){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.isInstancedMesh)instances.add(o);}});
   m.traverse(o=>{if(o.isMesh)meshes.push({name:o.name,count:o.count||1,uv:!!o.geometry.attributes.uv,role:o.material.name});});
   const span=p.fixture.getFootprint().w/2-14/24;
   m.traverse(o=>{
    if(!o.isMesh || o.name!=='InstancedRope' || o.material.name!=='RopeFabric')return;
    const a=o.geometry.attributes.position,u=o.geometry.attributes.uv;
    const sag=typeof p.fixture.placement.options?.sag==='number' && Number.isFinite(p.fixture.placement.options.sag) ? p.fixture.placement.options.sag : .2;
    for(let i=0;i<a.count;i++){
     const t=(1-u.getY(i))/4.8,cx=-span/2+.35+(span-.7)*t,cy=2.875-4*(span*sag-.09)*t*(1-t);
     maxRadiusError=Math.max(maxRadiusError,Math.abs(Math.hypot(a.getX(i)-cx,a.getY(i)-cy,a.getZ(i))-.042));
    }
   });
   const disposed={geometry:0,material:0,instance:0};
   for(const [key,set] of [['geometry',geometry],['material',materials],['instance',instances]])set.forEach(v=>v.addEventListener('dispose',()=>disposed[key]++));
   const r={meshes,maxRadiusError,footprint:p.fixture.getFootprint(),bounds:p.bounds(),hidden:!g.getObjectByName('display-fallback').visible,expected:{geometry:geometry.size,material:materials.size,instance:instances.size}};
   p.fixture.dispose();p.fixture.dispose();r.disposed=disposed;r.detached=!p.scene.getObjectByName(p.placement.id);return r;
  });
  console.log('Sweep radius error',options,r.maxRadiusError);
  assert.ok(r.maxRadiusError<.00002, 'sag preserves rope diameter');assert.equal(r.hidden,true);assert.equal(r.detached,true);assert.deepEqual(r.expected,r.disposed);
  assert.equal(r.meshes.filter(m=>m.name==='InstancedPost').length,3);
  assert.equal(r.meshes.filter(m=>m.name==='InstancedRope').length,2);
  assert.ok(r.meshes.every(m=>m.uv));assert.ok(Math.abs(r.bounds.max[1]-3.25)<1e-5);
  assert.ok(Math.abs(r.bounds.size[0]-r.footprint.w)<1e-4);reports.push(r);
 }
 let mode='fail',pending;
 await page.setRequestInterception(true);
 page.on('request',r=>{if(r.url().endsWith('/models/rope-stanchions.glb')) {if(mode==='hold'){pending=r;return;}void r.respond({status:404,body:'Deliberate fallback check'});}else void r.continue();});
 await page.evaluate(()=>window.preview.fixture.build());
 await page.waitForFunction(()=>window.preview.logs.length>0);
 assert.equal(await page.evaluate(()=>window.preview.scene.getObjectByName('display-fallback').visible),true);
 await page.evaluate(()=>window.setView('front'));await page.screenshot({path:resolve(out,'fallback.png')});
 await page.evaluate(()=>window.preview.fixture.dispose());mode='hold';
 await page.evaluate(()=>window.preview.fixture.build());
 for(let i=0;!pending && i<100;i++)await new Promise(r=>setTimeout(r,30));
 assert.ok(pending);await page.evaluate(()=>window.preview.fixture.dispose());await pending.continue();await page.waitForNetworkIdle();
 assert.equal(await page.evaluate(()=>!!window.preview.scene.getObjectByName('display-model')),false);
 assert.deepEqual(errors,[]);
 writeFileSync(resolve(out,'verification.json'),JSON.stringify({reports,missingAssetFallback:true,lateLoadDetached:true,pageErrors:errors,publicAssets:'README.md only'},null,2));
 console.log('Rope stanchions: variants, instancing, bounds, UVs, disposal, failed and late loading passed.');
}finally{await browser.close();}
