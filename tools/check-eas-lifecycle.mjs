// Exercise real exported resources, async races, anchors and pair ownership.
export async function checkEasLifecycle(page) {
 return page.evaluate(async()=>{
  const T=window.T,L=window.L;
  const {installEasPedestals}=await import('/src/fixtures/eas-pedestal-model.ts');
  const bytes=await(await fetch('/models/eas-pedestal.glb')).arrayBuffer();
  const original=L.prototype.load;let pending;
  L.prototype.load=function(url,success,progress,error){pending={success,error};};
  const assert=(v,m)=>{if(!v)throw Error(m);};const report=[];
  try {for(const mode of ['success','failure','late','ancestor-detached']) {
   const scene=new T.Scene(),parent=new T.Group(),fallback=new T.Group();scene.add(parent);parent.add(fallback);
   let renders=0,shadows=0;
   const ctx={scene,requestRender:()=>renders++,fixtureContext:()=>({requestShadowRefresh:()=>shadows++,log:()=>{}})};
   const anchors=[{x:2.68,z:8.45},{x:2.68,z:12.75}];
   installEasPedestals(ctx,parent,fallback,anchors);
   if(mode==='failure'){pending.error('intentional');assert(fallback.visible,'fallback missing');parent.removeFromParent();report.push({mode,passed:true});continue;}
   const parsed=await new L().parseAsync(bytes.slice(0),'');const resources=new Set();
   parsed.scene.traverse(o=>{if(o.isMesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)resources.add(v);}}});
   const counts=new Map([...resources].map(r=>[r,0]));resources.forEach(r=>r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1)));
   if(mode==='late')parent.removeFromParent();
   if(mode==='ancestor-detached'){const wrapper=new T.Group();scene.add(wrapper);wrapper.add(parent);wrapper.removeFromParent();}
   pending.success(parsed);
   let bounds=[];
   if(mode==='success'){
    const models=parent.children.filter(o=>o.name==='eas-pedestal-model');assert(models.length===2&&!fallback.visible,'pair swap');
    bounds=models.map((o,i)=>{const b=new T.Box3().setFromObject(o),size=b.getSize(new T.Vector3());assert(Math.abs(b.min.y)<1e-6&&Math.abs(size.y-3.43)<1e-5,'floor/height');assert(Math.abs(size.x-.62)<1e-5&&Math.abs(size.z-.5)<1e-5,'footprint');assert(Math.abs(b.getCenter(new T.Vector3()).z-anchors[i].z)<1e-6,'door anchor');return {min:b.min.toArray(),max:b.max.toArray()};});
    const meshes=models.map(model=>{const result=[];model.traverse(o=>{if(o.isMesh)result.push(o);});return result;});
    assert(meshes[0].length===4,'four material primitives');
    meshes[0].forEach((o,i)=>{assert(o.geometry===meshes[1][i].geometry&&o.material===meshes[1][i].material,'shared pair resources');assert(o.geometry.attributes.uv&&o.geometry.attributes.normal,'UVs and normals');});
    assert(renders===1&&shadows===1,'refresh');parent.removeFromParent();
   }else assert(renders===0&&parent.children.length===1,'late model attached');
   assert([...counts.values()].every(v=>v===1),'resource disposal must be exactly once');
   report.push({mode,passed:true,resources:resources.size,bounds});
  }
  const {buildStorefrontDressing93}=await import('/src/fixtures/storefront-dressing-93.ts');
  pending=undefined;
  const noChamber={scene:new T.Scene(),activeSignageObjects:[],getStoreWidth:()=>40,storefrontSpec:{entryStyle:'storefront-door'},entrance:{getVestibuleInfo:()=>({hasChamber:false})},fixtureContext:()=>{throw Error('unexpected collider on storefront-door');}};
  buildStorefrontDressing93(noChamber);
  assert(!pending&&!noChamber.scene.getObjectByName('eas-pedestal-fallback'),'no gate without a chamber');
  report.push({mode:'storefront-door',passed:true});
  return report;}finally{L.prototype.load=original;}
 });
}
