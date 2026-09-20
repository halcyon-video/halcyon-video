import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canHoldToReturn } from '../src/carry-return-state.ts';

test('canHoldToReturn: requires carryMode, tapes carried, and no blocking modes', () => {
  const mockScene = (overrides: Record<string, any> = {}) => ({
    carryMode: true,
    checkoutRunning: false,
    isWalkAroundMode: false,
    mode: 'browse',
    carried: { count: 1 },
    ...overrides,
  } as any);

  assert.equal(canHoldToReturn(mockScene()), true);
  assert.equal(canHoldToReturn(mockScene({ mode: 'inspect' })), true);
  assert.equal(canHoldToReturn(mockScene({ mode: 'checkout' })), true);

  // False when no tapes carried
  assert.equal(canHoldToReturn(mockScene({ carried: { count: 0 } })), false);
  assert.equal(canHoldToReturn(mockScene({ carried: null })), false);

  // False when carryMode disabled
  assert.equal(canHoldToReturn(mockScene({ carryMode: false })), false);

  // False when checkout is running
  assert.equal(canHoldToReturn(mockScene({ checkoutRunning: true })), false);

  // False when in first-person walk mode
  assert.equal(canHoldToReturn(mockScene({ isWalkAroundMode: true })), false);

  // False in backroom
  assert.equal(canHoldToReturn(mockScene({ mode: 'backroom' })), false);
});
