// Controlled loader timing; same real installer and GLB as the seasonal consumer.
export async function checkStandeeLifecycle(page) {
 return page.evaluate(async()=>{
  const T=window.T;
  const Loader=window.L;
  const {installStandeeConstruction}=await import('/src/fixtures/standee-construction.ts');
  const {collectionEndcapPlacements}=await import('/src/fixtures/collection-endcap.ts');
  const bytes=await(await fetch('/models/standee-support-header.glb')).arrayBuffer();
  const original=Loader.prototype.load;let pending;
  Loader.prototype.load=function(url,success,progress,error){pending={url,success,error};};
  const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
  const watch=root=>{const counts=new Map();root.traverse(o=>{if(o.isMesh)for(const r of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])])if(!counts.has(r)){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1));}});return counts;};
  const once=c=>[...c.values()].every(n=>n===1);
  const reports=[];
  try {
   for(const mode of ['success','failure','late','detached']) {
    const scene=new T.Scene(),kit=new T.Group();scene.add(kit);
    let renders=0,shadows=0;const ctx={scene,requestRender:()=>renders++,requestShadowRefresh:()=>shadows++,log:()=>{}};
    const art=document.createElement('canvas');art.width=100;art.height=200;
    const c=art.getContext('2d');c.fillRect(0,0,100,200);c.clearRect(30,60,40,80);
    const construction=installStandeeConstruction(ctx,kit,1.9,3.9,4.6,art);
    const edge=kit.getObjectByName('CorrugatedSilhouetteEdge');
    assert(edge.geometry.attributes.position.count>0,'edge for image touching canvas bounds');
    const initial=edge.geometry;let oldDisposed=0;initial.addEventListener('dispose',()=>oldDisposed++);
    c.clearRect(0,0,100,200);construction.update(art);
    assert(oldDisposed===1&&edge.geometry.attributes.position.count===0,'empty art must remove prior edge');
    c.beginPath();c.moveTo(50,0);c.lineTo(100,200);c.lineTo(0,200);c.closePath();c.fill();construction.update(art);
    edge.geometry.computeBoundingBox();assert(edge.geometry.boundingBox.max.x<.951,'silhouette edge matches physical width');
    const edgeCounts=watch(kit);
    assert(pending.url.endsWith('/models/standee-support-header.glb'),'base-resolved asset');
    let modelCounts;
    if(mode==='failure'){
     pending.error(new Error('Intentional missing file'));
     assert(kit.getObjectByName('display-fallback').visible,'keep fallback after failure');
    }else{
     if(mode==='late')construction.dispose();
     if(mode==='detached')kit.removeFromParent();
     const parsed=await new Loader().parseAsync(bytes.slice(0),'');modelCounts=watch(parsed.scene);pending.success(parsed);
     if(mode==='success'){
      assert(kit.getObjectByName('display-model'),'real mesh installed');
      assert(!kit.getObjectByName('display-fallback').visible,'fallback hidden');
      assert(shadows===1,'shadow refresh after install');
     }else{assert(!kit.getObjectByName('display-model'),'late/detached mesh rejected');assert(once(modelCounts),'late resources released once');}
    }
    construction.dispose();construction.dispose();
    assert(once(edgeCounts),'edge resources released once');
    if(modelCounts)assert(once(modelCounts),'loaded resources released once');
    assert(kit.children.length===0,'construction detached');
    if(mode!=='success')assert(shadows===0,'no shadow refresh for failed load');
    reports.push({mode,passed:true,renders,shadows});
   }
   localStorage.setItem('bb_promo_date','2026-09-10');
   assert(collectionEndcapPlacements(window.store).length===0,'holiday gate');
   localStorage.setItem('bb_promo_date','2026-12-10');
   assert(collectionEndcapPlacements(window.store).length>0,'December placement');
   return {loader:reports,seasonGate:true,silhouetteReplacement:true};
  }finally{Loader.prototype.load=original;}
 });
}
