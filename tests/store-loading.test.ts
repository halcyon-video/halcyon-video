import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
function rig() {
 const elements = new Map<string,any>();
 const element=(id:string)=>{ if(!elements.has(id))elements.set(id,{style:{},attributes:{},textContent:'',classList:{contains:()=>true},setAttribute(k:string,v:string){this.attributes[k]=v},removeAttribute(k:string){delete this.attributes[k]}});return elements.get(id)};
 const paint={fillStyle:'',fillRect(){}};
 element('store-loading-fill').getContext=()=>paint;
 const window:any={};let tick:Function=()=>{};
 const document={getElementById:element,currentScript:{src:'https://example.test/store/loading-screen.js'},querySelectorAll:()=>[{src:'https://example.test/store/main.js'}]};
 const context={window,document,URL,Set,Number,Math,performance:{getEntriesByType:()=>[]},PerformanceObserver:class{observe(){}disconnect(){}},MutationObserver:class{observe(){}},setTimeout:(fn:Function)=>{tick=fn;return 1},clearTimeout:()=>{}};
 runInNewContext(readFileSync(new URL('../public/loading-screen.js',import.meta.url),'utf8'),context);
 return {ui:window.halcyonLoading,element,next:()=>tick()};
}
test('loading reports actual monotonic work, preserves early downloads, resets after completion',()=>{
 const r=rig();r.ui.update(18);r.ui.reset();assert.equal(r.element('store-loading-fill').style.width,'18%');
 r.ui.update(45,'Stocking shelves');r.ui.update(25);assert.equal(r.element('store-loading-progress').attributes['aria-valuenow'],'45');
 assert.equal(r.element('store-loading-status').textContent,'Stocking shelves');r.ui.update(100);r.ui.reset();assert.equal(r.element('store-loading-fill').style.width,'0%');
 r.ui.update(70);r.ui.reset();assert.equal(r.element('store-loading-fill').style.width,'0%','a retried build starts new work');
});
test('failed graphics stay visible even if background work completes',()=>{
 const r=rig();r.ui.fail();r.ui.update(100,'Done');assert.equal(r.element('store-loading-label').attributes.role,'alert');assert.match(r.element('store-loading-label').textContent,/Unable/);
});
test('slideshow waits for image load, uses subpath-safe assets and changes tips',()=>{
 const r=rig();r.next();const back=r.element('store-loading-view-b');assert.equal(back.src,'https://example.test/store/loading/store-aisles.webp');assert.notEqual(back.style.opacity,'1');back.onload();assert.equal(back.style.opacity,'1');assert.match(r.element('store-loading-tip').textContent,/self-host/);
});
