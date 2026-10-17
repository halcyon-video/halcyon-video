import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFloorDisplayProfile, installFloorDisplayProfiles, localFloorDisplayProfile } from '../src/fixtures/floor-display-profile.ts';
const profile = { model: 'user-assets/fixtures/custom/display.glb', coreHeight: 5, shelfHeights: [1,2,3,4], shelfCenters: [1.2,1.1,1,.9], lean: -.4, dark: true, topper: false };
test('local display profile keeps a coherent stock and surface contract', () => {
  const parsed = parseFloorDisplayProfile(profile)!;
  assert.equal(parsed.shelfHeights.length, parsed.shelfCenters.length);
  assert.equal(parsed.topper, false);
  parsed.shelfHeights[0] = 3;
  assert.equal(profile.shelfHeights[0], 1);
});
test('invalid model paths and geometry cannot replace a working display', () => {
  for (const change of [
    {model:'https://example.com/model.glb'}, {model:'user-assets/../secret.glb'},
    {shelfHeights:[1,2,2,4]}, {shelfHeights:[1,NaN,3,4]}, {shelfCenters:[1,2]},
    {shelfCenters:[1,1,1,1.3]}, {lean:-1}, {coreHeight:3.9},
    {shelfColumns:[3,3]}, {shelfColumns:[3,2.5,2,1]}, {shelfColumns:[6,3,2,1]},
    {terraced:true,shelfCenters:[1,1,1,1]},
  ]) assert.equal(parseFloorDisplayProfile({...profile,...change}), null);
  assert.equal(parseFloorDisplayProfile(null), null);
  assert.ok(parseFloorDisplayProfile({...profile, shelfHeights:[.25,2,3,4]}));
});

test('installed era profiles apply only to their era and allow individual overrides', () => {
  installFloorDisplayProfiles({early:{'*':{...profile,terraced:true,shelfColumns:[4,3,2,1]}}});
  assert.equal(localFloorDisplayProfile('stand', 'later'), null);
  assert.deepEqual(localFloorDisplayProfile('stand', 'early')?.shelfColumns, [4,3,2,1]);
  installFloorDisplayProfiles({early:{'*':{...profile,model:'../bad.glb'}}});
  assert.equal(localFloorDisplayProfile('stand', 'early'), null);
});

test('a raised terrace keeps an inset support and rejects incoherent widths', () => {
  const raised = {...profile, terraced: true, pedestalWidth: 1.4};
  assert.equal(parseFloorDisplayProfile(raised)?.pedestalWidth, 1.4);
  for (const width of [0, NaN, Infinity, 3, '1.4']) {
    assert.equal(parseFloorDisplayProfile({...raised, pedestalWidth: width}), null);
  }
  assert.equal(parseFloorDisplayProfile({...raised, terraced: false}), null);
});

test('one installed feature stand leaves other displays and eras untouched', () => {
  installFloorDisplayProfiles({early:{feature:{...profile,terraced:true,pedestalWidth:1.4}}});
  assert.equal(localFloorDisplayProfile('feature','early')?.pedestalWidth,1.4);
  assert.equal(localFloorDisplayProfile('other','early'),null);
  assert.equal(localFloorDisplayProfile('feature','later'),null);
  installFloorDisplayProfiles({});
});
