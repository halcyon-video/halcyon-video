import test from 'node:test';
import assert from 'node:assert/strict';
import { gameShelfTargets } from '../src/game-shelf-targets.ts';

test('platform destinations name the platform and enter the matching face and column', () => {
  const slots = [
    { movie: { platform: 'SNES' }, side: 'front', col: 0, restingX: 2, restingZ: 1 },
    { movie: { platform: 'SNES' }, side: 'front', col: 1, restingX: 2, restingZ: 3 },
    { movie: { platform: 'PlayStation' }, side: 'back', col: 8, restingX: 4, restingZ: 5 },
  ];
  const fixture = { placement: { kind: 'game-section' }, getSlots: () => slots } as any;
  assert.deepEqual(gameShelfTargets(fixture), [
    { label: 'SNES', side: 'front', col: 0, x: 2, z: 2 },
    { label: 'PLAYSTATION', side: 'back', col: 8, x: 4, z: 5 },
  ]);
  assert.deepEqual(gameShelfTargets({ ...fixture, placement: { kind: 'bargain-bin' } }), []);
});
