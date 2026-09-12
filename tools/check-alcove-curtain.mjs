import assert from 'node:assert/strict';
export async function checkAlcoveCurtain(page) {
 const report=await page.evaluate(async()=>{
  const source=await(await fetch('/src/fixtures/display-model.ts')).text();
  const T=await import(source.match(/from ["']([^"']*three[^"']*)["']/)[1]);
  const {GLTFLoader}=await import(source.match(/from ["']([^"']*GLTFLoader[^"']*)["']/)[1]);
  const {CurtainedAlcove}=await import('/src/fixtures/curtained-alcove.ts');
  const original=GLTFLoader.prototype.load,results=[];
  for(const action of ['right','left','low-ceiling','failure','late']) {
   const scene=new T.Scene(),colliders=[],logs=[];let refresh=0,render=0,finish;
   const ctx={...window.store.fixtureContext(),scene,storeWidth:36,backWallZ:-30,ceilingY:action==='low-ceiling'?7:9,addCollider:m=>colliders.push(m),log:m=>logs.push(m),requestShadowRefresh:()=>refresh++,requestRender:()=>render++};
   let loaded;
   const arrived=new Promise(resolve=>{GLTFLoader.prototype.load=function(url,done,progress,fail){
    if(action==='failure'){fail(new Error('Expected test failure'));resolve();return;}
    return original.call(this,url,g=>{loaded=g.scene;if(action==='late')finish=()=>done(g);else done(g);resolve();},progress,fail);
   };});
   const fixture=new CurtainedAlcove({id:'check',kind:'curtained-alcove',position:{x:0,z:0},yaw:0,options:{cornerSide:action==='left'?'left':'right',roomWidth:8,roomDepth:6}},ctx);
   fixture.build();if(action!=='low-ceiling')await arrived;
   const geometries=new Set(),materials=new Set(),instances=new Set();
   const collect=root=>root.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));if(o.isInstancedMesh)instances.add(o);}});
   collect(scene);if(action==='late')collect(loaded);
   const disposed={geometry:0,material:0,instance:0};
   for(const [kind,set] of [['geometry',geometries],['material',materials],['instance',instances]])set.forEach(o=>o.addEventListener('dispose',()=>disposed[kind]++));
   const model=scene.getObjectByName('display-model'),fallback=scene.getObjectByName('display-fallback');
   const meshes=[];model?.traverse(o=>{if(o.isMesh)meshes.push({name:o.name,count:o.count??1,triangles:(o.geometry.index?.count||o.geometry.attributes.position.count)/3,uv:!!o.geometry.attributes.uv,role:o.material.name});});
   scene.updateMatrixWorld(true);
   const bounds=model?new T.Box3().setFromObject(model):null;
   let positionError=0;
   if(model){
    const old=fallback.children[0],a=new T.Matrix4(),b=new T.Matrix4();let ni=[0,0];
    for(let i=0;i<old.count;i++) {const k=i%4===2?1:0;old.getMatrixAt(i,a);model.getObjectByName(k?'AlcoveBeadFacet_instances':'AlcoveBeadBarrel_instances').getMatrixAt(ni[k]++,b);b.premultiply(model.matrixWorld);positionError=Math.max(positionError,new T.Vector3().setFromMatrixPosition(a).distanceTo(new T.Vector3().setFromMatrixPosition(b)));}
   }
   const side=action==='left'?-1:1,innerX=11+side*(36/2-8),doorZ=-30+6-.35-1.5;
   const ray=new T.Raycaster(new T.Vector3(innerX-1,3,doorZ),new T.Vector3(1,0,0),0,2);
   const passageHits=ray.intersectObjects(colliders,false).length;
   const r={action,passageHits,colliders:colliders.length,footprint:fixture.getFootprint(),meshes,bounds:bounds?{min:bounds.min.toArray(),max:bounds.max.toArray()}:null,positionError,fallbackVisible:fallback?.visible,refresh,render,expected:{geometry:geometries.size,material:materials.size,instance:instances.size}};
   fixture.update(10000);fixture.dispose();if(finish)finish();fixture.dispose();r.disposed=disposed;r.remaining=scene.children.length;results.push(r);
  }
  GLTFLoader.prototype.load=original;return results;
 });
 for(const r of report){
  assert.equal(r.remaining,0);assert.deepEqual(r.disposed,r.expected);
  if(['left','right'].includes(r.action)){
   assert.equal(r.colliders,4);assert.equal(r.passageHits,0);assert.equal(r.meshes.length,6);assert.equal(r.fallbackVisible,false);assert.ok(r.positionError<2e-6,`bead centre error ${r.positionError}`);assert.ok(r.meshes.every(m=>m.uv));assert.equal(r.meshes.find(m=>m.name==='AlcoveCord_instances').count,15);assert.ok(r.bounds.min[1]>.0);assert.ok(Math.abs(r.bounds.max[1]-6.86)<1e-5);assert.equal(r.render,1);
  } else if(r.action==='failure')assert.equal(r.fallbackVisible,true);
  else if(r.action==='low-ceiling'){assert.equal(r.colliders,0);assert.equal(r.footprint,null);}
 }
 return report;
}
