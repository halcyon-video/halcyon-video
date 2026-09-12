// Browser checks against the real installer and exported asset; used by verify-mats.
export async function checkMatLifecycle(page) {
  return page.evaluate(async () => {
    const T = window.T, Loader = window.L;
    const { buildWalkOffMats } = await import('/src/entrance/walk-off-mats.ts');
    const bytes = await (await fetch('/models/entrance-mat.glb')).arrayBuffer();
    const original = Loader.prototype.load;
    let pending;
    Loader.prototype.load = function(url, success, progress, error) { pending = { url, success, error }; };
    const assert = (condition, message) => { if (!condition) throw Error(message); };
    const resources = root => {
      const set = new Set();
      root.traverse(o => { if (o.isMesh) { set.add(o.geometry); for (const m of Array.isArray(o.material)?o.material:[o.material]) { set.add(m); for(const v of Object.values(m)) if(v instanceof T.Texture) set.add(v); } } });
      return set;
    };
    const watch = set => { const counts = new Map(); for (const r of set) { counts.set(r,0); r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1)); } return counts; };
    const once = counts => [...counts.values()].every(v=>v===1);
    const reports = [];
    try {
      for (const width of [5.94, 4]) {
        const scene = new T.Scene(), parent = new T.Group();scene.add(parent);
        let refreshes = 0;
        const xs = width === 4 ? [11] : [14.85,7.15];
        const fixture = buildWalkOffMats({scene,requestRender:()=>refreshes++,requestShadowRefresh:()=>{},log:()=>{}},parent,width,width === 4 ? 2.2 : 5.3,xs,11.8);
        const group = parent.getObjectByName('entranceWalkOffMats');
        const fallbackResources = resources(group);
        const parsed = await new Loader().parseAsync(bytes.slice(0),'');
        const imported = watch(resources(parsed.scene));
        pending.success(parsed);
        const model = group.getObjectByName('walk-off-mat-model');
        assert(!group.getObjectByName('walk-off-mat-fallback').visible,'fallback stays visible after load');
        assert(refreshes===1,'load must refresh shadows/render callback once');
        const first=[],second=[];
        model.children[0].traverse(o=>{if(o.isMesh)first.push(o);});
        (model.children[1] || model.children[0]).traverse(o=>{if(o.isMesh)second.push(o);});
        assert(first.length===2&&second.length===2,'two mat parts');
        first.forEach((o,i)=>assert(o.geometry===second[i].geometry&&o.material===second[i].material,'instances must share resources'));
        const bounds=model.children.map(o=>{const b=new T.Box3().setFromObject(o);return {min:b.min.toArray(),max:b.max.toArray()};});
        bounds.forEach((b,i)=>{assert(Math.abs(b.min[1])<1e-6,'floor contact');assert(Math.abs(b.max[1]-.024)<1e-6,'height');assert(Math.abs((b.min[0]+b.max[0])/2-xs[i])<1e-6,'anchor');assert(Math.abs(b.max[0]-b.min[0]-width)<1e-6,'width');assert(Math.abs(b.max[2]-b.min[2]-(width===4?2.2:5.3))<1e-6,'depth');});
        const all=resources(group);fallbackResources.forEach(r=>all.add(r));
        const counts=watch(all);
        fixture();fixture();
        assert(once(counts),'resources disposed exactly once');
        assert(once(imported),'imported replaced materials and shared geometry disposed once');
        assert(parent.children.length===0,'fixture detached');
        reports.push({width,bounds,uniqueResources:all.size,sharedGeometry:true,exactlyOnceDisposal:true,refreshes});
      }
      for(const mode of ['failure','late','detached']) {
        const scene=new T.Scene(),parent=new T.Group();scene.add(parent);let refreshes=0;
        const fixture=buildWalkOffMats({scene,requestRender:()=>refreshes++,requestShadowRefresh:()=>{},log:()=>{}},parent,5.94,5.3,[14.85,7.15],11.8);
        const group=parent.getObjectByName('entranceWalkOffMats');
        if(mode==='failure') {
          pending.error(new Error('Intentional missing-asset check'));
          assert(group.getObjectByName('walk-off-mat-fallback').visible,'missing asset needs fallback');
          assert(group.getObjectByName('walk-off-mat-fallback').children.length===2,'two fallback mats');
          fixture();
        } else {
          if(mode==='late')fixture();else parent.removeFromParent();
          const parsed=await new Loader().parseAsync(bytes.slice(0),'');const counts=watch(resources(parsed.scene));
          pending.success(parsed);
          assert(once(counts),'late imported resources released');
          assert(!group.getObjectByName('walk-off-mat-model'),'late asset attached');
          fixture();
        }
        assert(refreshes===0,'failed/detached load must not refresh');
        reports.push({mode,passed:true});
      }
      return reports;
    } finally { Loader.prototype.load=original; }
  });
}
