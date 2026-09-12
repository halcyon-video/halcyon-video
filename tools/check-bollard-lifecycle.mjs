// Browser checks against the real installer and exported asset; used by verify-bollards.
export async function checkBollardLifecycle(page) {
  return page.evaluate(async () => {
    const T = window.T, Loader = window.L;
    const { buildEntranceBollards } = await import('/src/entrance-bollards.ts');
    const bytes = await (await fetch('/models/entrance-bollard.glb')).arrayBuffer();
    const original = Loader.prototype.load;
    let pending;
    Loader.prototype.load = function(url, success, progress, error) { pending = { url, success, error }; };
    const assert = (condition, message) => { if (!condition) throw Error(message); };
    const resources = root => {
      const set = new Set();
      root.traverse(o => { if (o.isMesh) { set.add(o.geometry); for (const m of Array.isArray(o.material)?o.material:[o.material]) set.add(m); } });
      return set;
    };
    const watch = set => { const counts = new Map(); for (const r of set) { counts.set(r,0); r.addEventListener('dispose',()=>counts.set(r,counts.get(r)+1)); } return counts; };
    const once = counts => [...counts.values()].every(v=>v===1);
    const reports = [];
    try {
      for (const width of [32,46,70]) {
        const scene = new T.Scene(), parent = new T.Group();scene.add(parent);
        let refreshes = 0;
        const xs = [-width/2-1.4,width/2+1.4];
        const fixture = buildEntranceBollards(scene,parent,xs,16.6,()=>refreshes++);
        const group = parent.getObjectByName('entranceBollards');
        const fallbackResources = resources(group);
        const parsed = await new Loader().parseAsync(bytes.slice(0),'');
        const imported = watch(resources(parsed.scene));
        pending.success(parsed);
        const model = group.getObjectByName('display-model');
        assert(!group.getObjectByName('display-fallback').visible,'fallback stays visible after load');
        assert(refreshes===1,'load must refresh shadows/render callback once');
        const first=[],second=[];
        model.children[0].traverse(o=>{if(o.isMesh)first.push(o);});
        model.children[1].traverse(o=>{if(o.isMesh)second.push(o);});
        assert(first.length===3&&second.length===3,'three material primitives per post');
        first.forEach((o,i)=>assert(o.geometry===second[i].geometry&&o.material===second[i].material,'instances must share resources'));
        const bounds=model.children.map(o=>{const b=new T.Box3().setFromObject(o);return {min:b.min.toArray(),max:b.max.toArray()};});
        bounds.forEach((b,i)=>{assert(Math.abs(b.min[1])<1e-6,'sidewalk contact');assert(Math.abs(b.max[1]-3)<1e-6,'height');assert(Math.abs((b.min[0]+b.max[0])/2-xs[i])<1e-6,'anchor');});
        const all=resources(group);fallbackResources.forEach(r=>all.add(r));
        const counts=watch(all);
        fixture.dispose();fixture.dispose();
        assert(once(counts),'resources disposed exactly once');
        assert(once(imported),'imported replaced materials and shared geometry disposed once');
        assert(parent.children.length===0,'fixture detached');
        reports.push({width,bounds,uniqueResources:all.size,sharedGeometry:true,exactlyOnceDisposal:true,refreshes});
      }
      for(const mode of ['failure','late','detached']) {
        const scene=new T.Scene(),parent=new T.Group();scene.add(parent);let refreshes=0;
        const fixture=buildEntranceBollards(scene,parent,[-20,20],16.6,()=>refreshes++);
        const group=parent.getObjectByName('entranceBollards');
        if(mode==='failure') {
          pending.error(new Error('Intentional missing-asset check'));
          assert(group.getObjectByName('display-fallback').visible,'missing asset needs fallback');
          assert(group.getObjectByName('display-fallback').children.length===4,'two fallback posts and bands');
          fixture.dispose();
        } else {
          if(mode==='late')fixture.dispose();else parent.removeFromParent();
          const parsed=await new Loader().parseAsync(bytes.slice(0),'');const counts=watch(resources(parsed.scene));
          pending.success(parsed);
          assert(once(counts),'late imported resources released');
          assert(!group.getObjectByName('display-model'),'late asset attached');
          fixture.dispose();
        }
        assert(refreshes===0,'failed/detached load must not refresh');
        reports.push({mode,passed:true});
      }
      return reports;
    } finally { Loader.prototype.load=original; }
  });
}
