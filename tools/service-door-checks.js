// Called by the in-store photography harness after its last photograph.
export function checkServiceDoor(store, T, retire = true) {
  const facade = store.scene.getObjectByName('storefrontFacade');
  const door = facade.getObjectByName('serviceDoor');
  const model = door.getObjectByName('display-model');
  const fallback = door.getObjectByName('display-fallback');
  if (!model || fallback.visible) throw Error('Authored door did not replace fallback');
  store.scene.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(model);
  const geometries = new Set(), materials = new Set();
  let triangles = 0, fallbackTriangles = 0;
  model.traverse(o => { if (o.isMesh) {
    geometries.add(o.geometry);
    materials.add(o.material);
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  }});
  fallback.traverse(o => { if(o.isMesh) fallbackTriangles += o.geometry.index.count / 3; });
  if (triangles !== 3132 || geometries.size !== 4) throw Error('Unexpected runtime geometry');
  if (bounds.min.z < door.position.z - 1.701 || bounds.max.z > door.position.z + 1.701) throw Error('Door escaped exclusion span');
  let disposed = 0;
  geometries.forEach(g => g.addEventListener('dispose', () => disposed++));
  if (retire) { door.userData.dispose(); door.userData.dispose(); }
  if (retire && (disposed !== 4 || door.getObjectByName('display-model'))) throw Error('Door cleanup failed');
  return {anchor:door.position.toArray(),min:bounds.min.toArray(),max:bounds.max.toArray(),triangles,fallbackTriangles,meshes:geometries.size,materials:materials.size,geometryDisposals:disposed};
}

export async function checkServiceDoorVariants(T, Loader) {
  const {buildStorefrontFacade, rightSideDoorZone} = await import('/src/storefront-facade.ts');
  const {getActiveTheme} = await import('/src/themes.ts');
  const template = (await new Loader().loadAsync('/models/service-door.glb')).scene;
  const original = Loader.prototype.load;
  let pending = [];
  Loader.prototype.load = function(url, success) { pending.push({url,success}); };
  const rows = [];
  try {
    for (const style of ['gabled-brick','flat-parapet','arcaded-brick','cone-canopy']) {
      localStorage.setItem('bb_facade',style);
      for (const width of [70,86.8,110]) {
        pending = [];
        const scene = new T.Scene(); let renders=0,shadows=0;
        const ctx={scene,storeWidth:width,activeTheme:getActiveTheme(),requestRender(){renders++;},requestShadowRefresh(){shadows++;},log(){}};
        const sideRibbon={frontZ:12.75,backZ:-20};
        const {group}=buildStorefrontFacade({context:ctx,storeWidth:width,backWallZ:-60,ceilingY:13.5,entryHalfWidth:7.9,entryOpeningHalfWidth:7.2,brickMaterial:()=>new T.MeshStandardMaterial(),stripeColor:'#334c89',trimColor:'#ccaa55',sideRibbon,frontCornerMargin:2.25,windowMasonryGaps:[]});
        scene.add(group);
        const request=pending.find(p=>p.url.endsWith('models/service-door.glb'));
        if(!request)throw Error('Missing service door request');
        const model=template.clone(true);
        model.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=o.material.clone();}});
        const beforeRenders=renders,beforeShadows=shadows;
        request.success({scene:model});
        const result=checkServiceDoor({scene},T);
        const zone=rightSideDoorZone(sideRibbon);
        if(result.min[2]<zone.z0-.001||result.max[2]>zone.z1+.001)throw Error('Exclusion changed');
        if(renders!==beforeRenders+1||shadows!==beforeShadows+1)throw Error('Render refresh missing');
        rows.push({style,width,...result});
        scene.remove(group);
      }
    }
    if(rightSideDoorZone(null)!==null)throw Error('Absent ribbon exclusion changed');
    const scene=new T.Scene();pending=[];
    const ctx={scene,storeWidth:70,activeTheme:getActiveTheme(),requestRender(){},requestShadowRefresh(){},log(){}};
    const {group}=buildStorefrontFacade({context:ctx,storeWidth:70,backWallZ:-60,ceilingY:13.5,entryHalfWidth:7.9,entryOpeningHalfWidth:7.2,brickMaterial:()=>new T.MeshStandardMaterial(),stripeColor:'#334c89',trimColor:'#ccaa55',sideRibbon:null,frontCornerMargin:2.25,windowMasonryGaps:[]});
    if(group.getObjectByName('serviceDoor')||pending.some(p=>p.url.endsWith('models/service-door.glb')))throw Error('Door loaded without ribbon');
    return {rows,noRibbon:true};
  } finally {Loader.prototype.load=original;}
}
