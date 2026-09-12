// Browser-side checks against the actual exported asset and installer.
export async function checkSnapFrameLifecycle(page) {
 return page.evaluate(async()=>{
  const T=window.T;
  const GLTFLoader=window.L;
  const {wireSnapFrame}=await import('/src/fixtures/sign-fixtures.ts');
  const {installWireSnapFrame}=await import('/src/fixtures/wire-snap-frame-model.ts');
  const bytes=await (await fetch('/models/wire-snap-frame.glb')).arrayBuffer();
  const original=GLTFLoader.prototype.load;
  const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
  const results=[];
  try {
   for(const [w,h,post] of [[.9,.7,true],[.9,.7,false],[1.5,.8,true],[.4,.4,false]]){
    let done;GLTFLoader.prototype.load=function(url,success){done=success;return this;};
    const scene=new T.Scene(),root=wireSnapFrame(new T.Texture(),w,h,post);scene.add(root);
    const poster=root.children.find(o=>o.geometry?.type==='PlaneGeometry');
    const liveArt=new T.Texture();poster.material=poster.material.clone();poster.material.map=liveArt;
    let renders=0,shadows=0;
    installWireSnapFrame({scene,requestRender:()=>renders++,requestShadowRefresh:()=>shadows++,log:()=>{}},root,w,h,post);
    const gltf=await new GLTFLoader().parseAsync(bytes.slice(0),'');done(gltf);
    assert(root.getObjectByName('display-model')===gltf.scene,'install');
    assert(!root.getObjectByName('display-fallback').visible,'fallback hidden');
    assert(poster.visible&&poster.material.map===liveArt,'live art retained');
    assert(renders===1&&shadows===1,'refresh');
    root.updateWorldMatrix(true,true);
    const railBox=new T.Box3();for(const name of ['TopSnapRail','BottomSnapRail','LeftSnapRail','RightSnapRail'])railBox.union(new T.Box3().setFromObject(root.getObjectByName(name)));
    const size=railBox.getSize(new T.Vector3());
    assert(Math.abs(size.x-w-.08)<1e-6&&Math.abs(size.y-h-.08)<1e-6,'dimensions');
    assert(Math.abs(railBox.min.y-((post?.42:0)-.04))<1e-6,'frame anchor');
    assert(root.getObjectByName('AdjustableStand').visible===post,'post variant');
    let disposed=0;const geometries=new Set();gltf.scene.traverse(o=>{if(o.isMesh)geometries.add(o.geometry);});
    geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));scene.remove(root);
    assert(disposed===geometries.size&&!gltf.scene.parent,'removal disposal');
    results.push({width:w,height:h,post,railBounds:{min:railBox.min.toArray(),max:railBox.max.toArray()},disposed});
   }
   // Removal before the loader finishes must never reattach or refresh.
   let done;GLTFLoader.prototype.load=function(url,success){done=success;return this;};
   const scene=new T.Scene(),root=wireSnapFrame(new T.Texture(),.9,.7,true);scene.add(root);
   const ctx={scene,requestRender:()=>{throw Error('late render');},requestShadowRefresh:()=>{throw Error('late shadow');},log:()=>{}};
   installWireSnapFrame(ctx,root,.9,.7,true);scene.remove(root);
   const gltf=await new GLTFLoader().parseAsync(bytes.slice(0),'');let disposed=0;
   gltf.scene.traverse(o=>{if(o.isMesh)o.geometry.addEventListener('dispose',()=>disposed++);});done(gltf);
   assert(disposed===16&&!gltf.scene.parent,'late disposal');
   GLTFLoader.prototype.load=function(url,success,progress,error){error(new Error('expected unavailable asset'));return this;};
   const fallback=wireSnapFrame(new T.Texture(),.9,.7,true);scene.add(fallback);
   installWireSnapFrame(ctx,fallback,.9,.7,true);
   assert(fallback.getObjectByName('display-fallback').visible&&!fallback.getObjectByName('display-model'),'failure fallback');
   scene.remove(fallback);
   return {sizes:results,lateLoadDisposed:disposed,missingAssetFallback:true,liveArtworkPreserved:true};
  } finally {GLTFLoader.prototype.load=original;}
 });
}
