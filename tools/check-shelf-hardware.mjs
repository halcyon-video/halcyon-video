// Exercise the shipped pointer dispatch and gated clasp lifecycle in the browser.
export async function checkShelfHardware(page) {
 return page.evaluate(async () => {
  const s=window.store;
  const {ShelfClasps}=await import('/src/fixtures/shelf-clasp.ts');
  const GLTFLoader=window.L;
  const T=window.T;
  const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
  assert(s.shelfClasps.count>0,'Expected gated synthetic store clasps');
  s.focusFirstClasp();
  s.scene.updateMatrixWorld(true);s.camera.updateMatrixWorld(true);
  const target=s.firstReachableClasp().target;
  const ndc=target.position.clone().project(s.camera),rect=s.renderer.domElement.getBoundingClientRect();
  let calls=0,walks=0,scope=null;
  const call=s.callClerkToClasp,go=s.clerk.goTo;
  s.callClerkToClasp=function(t){calls++;scope={category:t.category,libraryIdx:t.libraryIdx};return call.call(this,t);};
  s.clerk.goTo=function(...args){walks++;return go.apply(this,args);};
  try {s.handlePointerClick(new PointerEvent('pointerup',{clientX:rect.left+(ndc.x+1)*rect.width/2,clientY:rect.top+(1-ndc.y)*rect.height/2}));}
  finally{s.callClerkToClasp=call;s.clerk.goTo=go;}
  assert(calls===1&&walks===1,'Click did not dispatch one clerk walk');
  assert(scope.category===target.category&&scope.libraryIdx===target.libraryIdx,'Click scope changed');
  const probe=s.debugClaspProbe();
  const original=GLTFLoader.prototype.load;
  let done,fail,wakes=0;
  GLTFLoader.prototype.load=function(_url,ok,_progress,bad){done=ok;fail=bad;};
  const parent=new T.Group();
  const make=()=>{const c=new ShelfClasps();c.add({x:0,y:0,z:0,rotY:Math.PI/2,parent,category:'Drama',libraryIdx:2});c.finish(()=>wakes++);return c;};
  const resources=[];
  try {
   const c=make();resources.push(c);fail();
   assert(c.count===1&&c.pickables[0].visible,'Failed model hid call button');
   c.setFocused(c.pickables[0]);assert(c.focusedTarget().libraryIdx===2,'Fallback focus lost scope');
   const card=c.pickables[0].getObjectByName('clasp-card');
   assert(card.material[0]===c.hotFaceMaterial,'Focus did not update separate card');
   const dead=make();dead.dispose();done({scene:new T.Group()});
   assert(wakes===0,'Retired/failed loader woke scene');
   const empty=new ShelfClasps();resources.push(empty);assert(empty.count===0,'Ungated set should be empty');
  }finally{GLTFLoader.prototype.load=original;resources.forEach(c=>c.dispose());}
  return {clickCalls:calls,clerkWalks:walks,scope,probe,fallbackClickable:true,lateLoadCancelled:true,
   hardwareGeometryShared:s.shelfClasps.pickables[0].getObjectByName('clasp-jaws').geometry===s.shelfClasps.pickables[1].getObjectByName('clasp-jaws').geometry};
 });
}
