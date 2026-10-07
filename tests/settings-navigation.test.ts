import test from 'node:test';
import assert from 'node:assert/strict';
import { organizeSetting, SETTINGS_ACTIONS } from '../src/settings-navigation.ts';
import type { SettingDef } from '../src/settings.ts';
const setting = (key: string, group: SettingDef['group'], subpage?: string): SettingDef =>
  ({ key, group, subpage, kind: 'toggle', label: key, default: false, applyMode: 'live' });
test('behavior, stock and television choices have single category homes', () => {
  assert.deepEqual(organizeSetting(setting('bb_quick_playback', 'Store Look', 'Browsing & Rentals')),
    setting('bb_quick_playback', 'Browsing & Rentals'));
  assert.equal(organizeSetting(setting('bb_browse_camera', 'Store Look')).group, 'Browsing & Rentals');
  assert.equal(organizeSetting(setting('bb_carrylib_movie', 'Connection', 'Store Libraries')).group, 'Catalog');
  assert.equal(organizeSetting(setting('bb_tvlib_movie', 'Playback', 'Overhead TVs')).subpage, 'Library Feeds');
  assert.equal(organizeSetting(setting('bb_tv_status', 'Playback', 'Overhead TVs')).subpage, undefined);
  assert.equal(organizeSetting(setting('bb_streaming_services', 'Connection')).visibleWhen?.(), false);
  assert.equal(SETTINGS_ACTIONS.filter(a => a.id === 'btn-streaming').length, 1);
  assert.equal(SETTINGS_ACTIONS.filter(a => a.id === 'btn-media-date').length, 1);
  assert.equal(SETTINGS_ACTIONS.filter(a => a.id === 'btn-overhead-tvs').length, 1);
});
