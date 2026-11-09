import test from 'node:test';
import assert from 'node:assert/strict';
import { isMisattributedPlatformLogo } from '../src/platform-logo-veto.ts';

test('the iQue image reported for N64 is vetoed', () => {
  assert.equal(isMisattributedPlatformLogo('https://images.igdb.com/igdb/image/upload/t_logo_med/pl78.png'), true);
  assert.equal(isMisattributedPlatformLogo('https://images.igdb.com/igdb/image/upload/t_1080p/pl78.jpg?x=1'), true);
});
test('other platform logos pass', () => {
  assert.equal(isMisattributedPlatformLogo('https://images.igdb.com/igdb/image/upload/t_logo_med/pl780.png'), false);
  assert.equal(isMisattributedPlatformLogo('https://images.igdb.com/igdb/image/upload/t_logo_med/pl7.png'), false);
  assert.equal(isMisattributedPlatformLogo(undefined), false);
});
