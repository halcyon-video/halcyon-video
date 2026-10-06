import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rememberPlaybackPosition, restorePlaybackPosition, quickPlayback } from '../src/playback-position.ts';
function scene() {
  const position: any = {
    mode: 'inspect', selectedLibraryIdx: 2, selectedUnitIdx: 3, selectedSide: 'back',
    selectedShelf: 1, selectedCol: 4, selectedUnitSource: 'fixture', selectedFixtureId: 'stand', cameraWindowMinCol: 2,
    pendingReturnDrop: [], walkReturnPose: null,
    whiteoutEl() {return null;}, hideHeroCases() {}, resetHeroFace() {}, updateColsCount() {}, updateCameraTarget() {}, requestRender() {},
    collectHeldTapesForReturn() { this.heldReturned = true; return []; },
    currentCameraPos: {copy(){}}, targetCameraPos: {}, currentLookAt: {copy(){}}, targetLookAt: {},
    camera: {position:{copy(){}},lookAt(){}}, getSelectedMovie(){return null;},
    returnToEntrance(){this.mode='library-select';},
    teleportWalk(x:number,z:number,yaw:number,pitch:number){this.mode='walk-around';this.walkPose={x,z,yaw,pitch};},
  };
  return position;
}
test('playback restores exact shelf and fixture selection once, without a return camera takeover', () => {
  const s=scene();rememberPlaybackPosition(s);
  Object.assign(s,{mode:'checkout',selectedLibraryIdx:0,selectedCol:0,selectedFixtureId:null,checkoutRunning:true,returnDropWatch:true});
  restorePlaybackPosition(s);
  assert.equal(s.mode,'browse');assert.equal(s.selectedLibraryIdx,2);assert.equal(s.selectedCol,4);
  assert.equal(s.selectedFixtureId,'stand');assert.equal(s.checkoutRunning,false);assert.equal(s.returnDropWatch,false);
  restorePlaybackPosition(s);assert.equal(s.mode,'library-select','the saved position is consumed');
});
test('walking playback returns to the exact standing pose', () => {
  const s=scene();s.walkReturnPose={x:11,z:5,yaw:.3,pitch:.1,savedMode:'browse'};
  rememberPlaybackPosition(s);s.walkReturnPose=null;restorePlaybackPosition(s);
  assert.deepEqual(s.walkPose,{x:11,z:5,yaw:.3*180/Math.PI,pitch:.1*180/Math.PI});
  assert.equal(s.savedModeBeforeWalk,'browse');
});
test('streaming return preserves unrelated carried tapes',()=>{
  const s=scene();rememberPlaybackPosition(s);restorePlaybackPosition(s,false);
  assert.equal(s.heldReturned,undefined);assert.equal(s.mode,'browse');
});
test('quick playback setting skips return animation while normal mode retains it',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let enabled='1';
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>enabled}});
  try {
    for(const quick of [true,false]){
      enabled=quick?'1':'0';assert.equal(quickPlayback(),quick);
      const s=scene();let dropped=0;s.entrance={hideBag(){},hasReturnSlot:()=>true,dropReturnedTapes(){dropped++;}};
      s.pendingReturnDrop=[{id:'played'}];rememberPlaybackPosition(s);restorePlaybackPosition(s);
      assert.equal(dropped,quick?0:1);assert.deepEqual(s.pendingReturnDrop,[]);
    }
  } finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');}
});
