import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerStops } from '../src/customer-stops.ts';
import type { StorePlan } from '../src/store-plan.ts';
import type { ClerkNavGrid } from '../src/clerk-nav.ts';
import type { JellyfinLibrary, Movie } from '../src/jellyfin.ts';
test('customer departments follow the owned front/rear stock on a shared physical unit',()=>{
 const movie=(id:string):Movie=>({id,title:id,genres:[],localPath:''} as Movie);
 const libraries=[{name:'Thrillers',games:false},{name:'Animation',games:false}] as JellyfinLibrary[];
 const layouts=[{entries:[movie('thriller')],sectionLabels:new Map([['0','THRILLER']])},{entries:[movie('cartoon')],sectionLabels:new Map([['0','ANIMATION']])}];
 const unit={libraryIdx:0,unitIdxInLibrary:0,singleSided:false,browseSign:1,cols:12,xCenter:30};
 const plan={shelvingUnits:[unit],faceOwner:(_u:unknown,side:string)=>({libraryIdx:side==='front'?1:0,block:0}),layoutFor:(i:number)=>layouts[i],aisleColZ:()=>-10,unitToWorld:(_u:unknown,x:number,z:number)=>({x,z})} as unknown as StorePlan;
 const nav={nearestWalkable:(x:number,z:number)=>({x,z}),findPath:()=>[{x:0,z:0}]} as unknown as ClerkNavGrid;
 const stops=customerStops(plan,libraries,[],nav,{x:0,z:0},{x:0,z:10});
 assert.equal(stops.length,2);
 assert.deepEqual(stops.find(s=>s.id.includes(':front:'))!.departments,['animation']);
 assert.deepEqual(stops.find(s=>s.id.includes(':back:'))!.departments,['thrillers']);
});
