import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {coordinateClubhouseCarpetHex} from '../src/fixtures/clubhouse-carpet-color.ts';
test('blue store carpet produces the owner-requested red clubhouse independently of blue brightness',()=>{
for(const color of ['#294370','#2546aa','#667799'])assert.equal(coordinateClubhouseCarpetHex(color),'#a52b2b');
});
test('nonblue store carpet follows its selected palette rather than being forced red',()=>{
const a=coordinateClubhouseCarpetHex('#98372c'),b=coordinateClubhouseCarpetHex('#307d32');assert.notEqual(a,b);
for(const value of [a,b]){assert.match(value,/^#[a-f0-9]{6}$/);const c=new THREE.Color(value),hsl={h:0,s:0,l:0};c.getHSL(hsl);assert.ok(hsl.l>=.079&&hsl.l<=.301);}
});
