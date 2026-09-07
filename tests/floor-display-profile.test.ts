import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFloorDisplayProfile } from '../src/fixtures/floor-display-profile.ts';
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
  ]) assert.equal(parseFloorDisplayProfile({...profile,...change}), null);
  assert.equal(parseFloorDisplayProfile(null), null);
});
