import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mobileCheckoutAction} from '../src/mobile-checkout.ts';
function rig(flags = {}, takes = true, mode = 'inspect', carrying = false) {
 const calls: string[] = [];
 const scene = {mode, canHoldToCheckout:()=>carrying, getSelectedMovie:()=>({id:'selected',...flags}),
 setCarryMode:(enabled:boolean)=>calls.push('carry:'+enabled), takeSelectedTape:()=>{calls.push('take:selected');return takes}, enterCheckout:()=>calls.push('counter')};
 return {calls,scene:scene as unknown as Parameters<typeof mobileCheckoutAction>[0]};
}
test('phone counter action takes the inspected local movie before entering checkout',()=>{
 const r=rig();assert.equal(mobileCheckoutAction(r.scene,false),true);assert.deepEqual(r.calls,['carry:true','take:selected','counter']);
});
test('full stack and duplicate pickup do not check out a different title',()=>{
 const r=rig({},false,'inspect',true);assert.equal(mobileCheckoutAction(r.scene,false),true);assert.deepEqual(r.calls,['carry:true','take:selected']);
});
test('streaming, episodes and unavailable stock retain their selection flow',()=>{
 for(const flag of ['streaming','isSeries','comingSoon','discovery','collectionGap']){
  const r=rig({[flag]:true});assert.equal(mobileCheckoutAction(r.scene,false),false,flag);assert.deepEqual(r.calls,[]);
 }
});
test('carried stock has a counter route while walking, but terminal input owns its controls',()=>{
 const r=rig({},true,'walk-around',true);assert.equal(mobileCheckoutAction(r.scene,true),false);assert.deepEqual(r.calls,[]);
 assert.equal(mobileCheckoutAction(r.scene,false),true);assert.deepEqual(r.calls,['counter']);
 const empty=rig({},true,'walk-around',false);assert.equal(mobileCheckoutAction(empty.scene,false),false);assert.deepEqual(empty.calls,[]);
});
