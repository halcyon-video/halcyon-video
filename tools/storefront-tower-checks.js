// Browser checks invoked by verify-storefront-tower.mjs, using the real loaders.
export async function checkStorefront(T, Loader) {
  const {buildFacadeEntryModel} = await import('/src/storefront-entry-model.ts');
  const {buildWindowAwnings} = await import('/src/storefront-awning.ts');
  const {getActiveTheme} = await import('/src/themes.ts');
  const templates = {};
  for (const name of ['entry-gabled-brick','entry-flat-parapet','entry-arcaded-brick','entry-cone-canopy','awning']) {
    templates[name] = (await new Loader().loadAsync('/models/storefront-'+name+'.glb')).scene;
  }
  const original = Loader.prototype.load;
  let pending=[];
  Loader.prototype.load=function(url,success,progress,error){pending.push({url,success,error});};
  const assert = (ok,msg) => {if (!ok) throw Error(msg);};
  const payload = source => {
    const scene=source.clone(true);let count=0,released=0;
    scene.traverse(o=>{if(!o.isMesh)return;o.geometry=o.geometry.clone();o.material=o.material.clone();
      for(const resource of [o.geometry,o.material]){count++;resource.addEventListener('dispose',()=>released++);}});
    return {scene,count,released:()=>released};
  };
  function fixture(width=86.8,half=7.9,ceiling=13.5,style='gabled-brick',awning=false) {
    pending=[];const scene=new T.Scene();let renders=0,shadows=0,logs=0;
    const ctx={scene,storeWidth:width,ceilingY:ceiling,activeTheme:getActiveTheme(),
      requestRender:()=>renders++,requestShadowRefresh:()=>shadows++,log:()=>logs++};
    const root=awning?buildWindowAwnings(ctx,half):buildFacadeEntryModel(ctx,{
      style,entryHalfWidth:half,openingHalfWidth:style==='gabled-brick'?half-.7:5.55,
      frontCornerMargin:2.25,brickMaterial:()=>new T.MeshStandardMaterial(),primary:'#334c89'});
    scene.add(root);
    return {root,scene,requests:[...pending],counts:()=>({renders,shadows,logs})};
  }
  const rows=[];
  try {
    for(const style of ['gabled-brick','flat-parapet','arcaded-brick','cone-canopy']) {
      for(const [width,half,ceiling] of [[70,7.3,13.5],[86.8,7.9,18],[110,8.9,24]]) {
        const f=fixture(width,half,ceiling,style);
        // Arcade's decorative window-bay calls are outside this tower test.
        const request=f.requests.find(p=>p.url.includes('storefront-entry-'));
        f.root.updateMatrixWorld(true);
        const fallback=f.root.getObjectByName('display-fallback');
        const fallbackBounds=new T.Box3().setFromObject(fallback);
        let fallbackCount=0,fallbackDisposed=0;
        fallback.traverse(o=>{if(o.isMesh){fallbackCount++;o.geometry.addEventListener('dispose',()=>fallbackDisposed++);}});
        const data=payload(templates['entry-'+style]);request.success(data);
        const model=f.root.getObjectByName('display-model');
        assert(model && !f.root.getObjectByName('display-fallback').visible,'Tower install/fallback');
        f.root.updateMatrixWorld(true);
        const bounds=new T.Box3().setFromObject(model);
        assert(bounds.min.y===0 && bounds.max.z<(style==='cone-canopy'?27.2:21.8),'Tower lost ground/sidewalk anchor');
        model.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;
          assert(g.attributes.uv.count===g.attributes.position.count,'Missing UVs');
          assert([...g.attributes.normal.array].every(Number.isFinite),'Invalid normals');});
        if(style==='cone-canopy') {
          assert(bounds.min.distanceTo(fallbackBounds.min)<.03 && bounds.max.distanceTo(fallbackBounds.max)<.03,'Cone fallback bounds drift');
          const slate=f.root.userData.ownedFinishes.find(m=>m===model.children.find(o=>o.material?.color?.getHex()===0x454b50)?.material);
          assert(slate,'Slate material role missing');
          f.root.userData.setOutsideMode('night');
          assert(slate.emissiveIntensity===1 && slate.emissive.getHex()===0,'Slate should not glow');
          assert(f.root.userData.ownedFinishes.some(m=>m.emissiveIntensity===3),'Night downlight missing');
          f.root.userData.setOutsideMode('day');
          assert(!f.root.userData.ownedFinishes.some(m=>m.emissiveIntensity===3),'Day downlight stayed lit');
        }
        rows.push({style,width,half,ceiling,min:bounds.min.toArray(),max:bounds.max.toArray()});
        f.root.userData.dispose();f.root.userData.dispose();
        assert(data.released()===data.count,'Tower resource release');
        assert(fallbackCount===fallbackDisposed,'Fallback geometry release');
        assert(f.counts().shadows===1,'Shadow refresh');
      }
    }
    for(const width of [70,86.8,110]) {
      const f=fixture(width,7.9,13.5,'gabled-brick',true);
      assert(f.requests.length===2,'Two awning consumers');
      const data=f.requests.map(r=>{const d=payload(templates.awning);r.success(d);return d;});
      f.root.updateMatrixWorld(true);
      for(const wing of f.root.children){const b=new T.Box3().setFromObject(wing.getObjectByName('display-model'));
        assert(b.min.y>9 && b.max.z<21.8,'Awning window/sidewalk clearance');
        assert(b.max.x<.5 || b.min.x>21.5,'Awning overlaps tower pier');}
      f.root.userData.dispose();f.root.userData.dispose();
      assert(data.every(d=>d.count===d.released()),'Awning resource release');
    }
    for(const [awning,style] of [[false,'gabled-brick'],[true,'gabled-brick'],[false,'cone-canopy']]) {
      const missing=fixture(86.8,7.9,13.5,style,awning);
      missing.requests.forEach(r=>r.error(Error('Intentional offline test')));
      assert(missing.counts().logs===missing.requests.length,'Missing asset not logged');
      missing.root.traverse(o=>{if(o.name==='display-fallback')assert(o.visible,'Offline fallback hidden');});
      missing.root.userData.dispose();
      const late=fixture(86.8,7.9,13.5,style,awning);
      late.root.removeFromParent();
      for(const r of late.requests){const d=payload(templates[awning?'awning':'entry-'+style]);r.success(d);
        assert(d.count===d.released(),'Late payload leaked');}
      assert(!late.root.getObjectByName('display-model') && late.counts().shadows===0,'Detached install');
    }
    return {variants:rows,awningWidths:[70,86.8,110],offlineFallback:true,lateLoadReleased:true,
      doubleDispose:true,uvsAndNormals:true,shadowRefresh:true};
  } finally {
    Loader.prototype.load=original;
    for(const source of Object.values(templates))source.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  }
}
