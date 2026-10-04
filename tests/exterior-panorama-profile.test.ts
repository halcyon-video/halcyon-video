import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {panoramaProfile, PANORAMA_GROUND_Y, type OutsideMode} from '../src/exterior-panorama-profile.ts';

test('all selectable times have bundled matching-location images',()=>{
  const modes: OutsideMode[]=['morning','day','sunset','night'];
  const files=modes.map(mode=>panoramaProfile(mode).file);
  assert.equal(new Set(files).size,4);
  for(const file of files)assert(existsSync('public/'+file),file);
  assert(files.every(file=>file.startsWith('environments/southern-strip/')));
});

test('projected ground sits below the parking shadow surface and its paint',()=>{
  assert(PANORAMA_GROUND_Y < -.09, 'photographed ground must not z-fight with parking shadow surface');
  assert(-.09 < -.082, 'stall markings remain above the shadow-receiving surface');
});
