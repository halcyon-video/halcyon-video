import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StorePlan } from '../src/store-plan.ts';
import { UNIT_CAPACITY } from '../src/store-layout.ts';
import type { JellyfinLibrary, Movie } from '../src/jellyfin.ts';

test('mobile stocking fills both shelf faces with existing titles, leaving desktop and empty stores alone', () => {
  const movies = Array.from({length:20}, (_,i) => ({id:String(i), title:`Film ${i}`, genres:[], year:2025} as Movie));
  const lib = {id:'streaming:test',name:'Movies',movies,genres:[],streaming:true} as JellyfinLibrary;
  const layout = (library: JellyfinLibrary, fill = false) => {
    const plan = new StorePlan([library], fill); plan.plan(); return plan.layoutFor(0).entries;
  };
  const entries = layout(lib, true);
  assert.equal(entries.length, UNIT_CAPACITY);
  assert.ok(entries.every(m => m && movies.includes(m)));
  assert.equal(new Set(entries.map(m => m?.id)).size, 20);
  assert.equal(layout(lib).length, 20);
  assert.equal(layout({...lib,movies:[]}, true).length, 0);
});
