// GH #123 — which settings follow a person between machines, and what applying
// another machine's snapshot does to this one.
//
// The two rules worth testing are the two whose failure DESTROYS something
// rather than merely failing to help:
//
//  - a key that must never travel travelling anyway (a credential, the kiosk's
//    render mode, a rental lockout landing on someone else's evening);
//  - reconciliation removing a local key it had no business removing.
//
// Everything else here is guarding the boring direction: that the settings the
// issue is actually about — theme, arrangement, carried libraries, streaming
// services, brand — do make the trip.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Node has no localStorage; shim before import (same idiom as
// media-sources.test.ts / playback-routing.test.ts).
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const {
  isSyncedConfigKey,
  snapshotLocalConfig,
  applyConfigSnapshot,
  HARNESS_PIN_KEY,
} = await import('../src/store-config-keys.ts');

beforeEach(() => store.clear());

// ─── What travels ────────────────────────────────────────────────────────────

test('the settings the issue is about all travel', () => {
  for (const key of [
    'bb_theme',              // "same theme"
    'bb_arrangement',        // "same layout"
    'bb_store_format',
    'bb_brand_pack',         // "brand pack"
    'bb_streaming_services', // "streaming services"
    'bb_streaming_enabled',
    'bb_medium',
    'bb_outside',
    'bb_carrylib_primary:9f', // "same carried libraries"
    'bb_tvlib_primary:9f',
    'bb_games_enabled',
    'bb_platform_snes',
    'bb_rental_mode',        // the SETTING, unlike bb_rental the lockout record
  ]) {
    assert.equal(isSyncedConfigKey(key), true, `${key} should follow the user`);
  }
});

test('device-local performance keys never travel', () => {
  // The issue names these explicitly: a kiosk's GPU settings arriving on a
  // laptop is a worse store, not the same one.
  for (const key of [
    'bb_render_mode', 'bb_quality', 'bb_quality_auto', 'bb_quality_sig',
    'bb_ao', 'bb_ssao', 'bb_aa', 'bb_fps_cap', 'bb_px_budget', 'bb_local_mpv',
  ]) {
    assert.equal(isSyncedConfigKey(key), false, `${key} must stay on this machine`);
  }
});

test('secrets and connection state cannot travel, by construction', () => {
  // None of these carry the bb_ prefix, which is the point: the inclusion rule
  // excludes credentials structurally rather than by remembering to list them.
  for (const key of [
    'jellyfin_url', 'jellyfin_token', 'jellyfin_userid', 'jellyfin_password',
    'jellyseerr_url', 'jellyseerr_api_key', 'romm_apikey', 'romm_launch_cmd',
    'media_sources', 'provider_kind', 'plex_account_token',
  ]) {
    assert.equal(isSyncedConfigKey(key), false, `${key} is a secret or a connection`);
  }
});

test('hosting, lockout and ephemeral state never travel', () => {
  for (const key of [
    'bb_remote_play',    // a second machine must not also become the host
    'bb_remote_instance',
    'bb_rental',         // one store's lockout clock is not another's
    'bb_carried',        // the tapes in your hands this minute
    'bb_known_libraries',
    'bb_staff_picks_v1',
  ]) {
    assert.equal(isSyncedConfigKey(key), false, `${key} is session or host state`);
  }
});

test('harness determinism overrides never travel', () => {
  // A screenshot flag pushed to a server would become permanent for a person.
  for (const key of ['bb_tv_testcard', 'bb_tv_demo_loop', 'bb_promo_date', 'bb_debug_layer_cap']) {
    assert.equal(isSyncedConfigKey(key), false, `${key} is a test override`);
  }
});

// ─── Snapshot ────────────────────────────────────────────────────────────────

test('a snapshot carries the config and nothing else', () => {
  localStorage.setItem('bb_theme', 'bb-2000');
  localStorage.setItem('bb_carrylib_primary:9f', '0');
  localStorage.setItem('bb_render_mode', 'flat');
  localStorage.setItem('jellyfin_token', 'SECRET');
  const snap = snapshotLocalConfig();
  assert.deepEqual(snap, { bb_theme: 'bb-2000', 'bb_carrylib_primary:9f': '0' });
});

// ─── Applying another machine's snapshot ─────────────────────────────────────

test('applying a snapshot makes this machine match the other one', () => {
  localStorage.setItem('bb_theme', 'hv-90s');
  const res = applyConfigSnapshot({ bb_theme: 'bb-2000', bb_arrangement: 'herringbone' });
  assert.equal(localStorage.getItem('bb_theme'), 'bb-2000');
  assert.equal(localStorage.getItem('bb_arrangement'), 'herringbone');
  assert.equal(res.written, 2);
});

test('an omitted key is a CLEARED key, not an untouched one', () => {
  // The case that makes this matter: you switch a library off on the laptop.
  // That choice is stored as the ABSENCE of nothing and the presence of a '0',
  // but the reverse — switching one back ON deletes the key — is how a merge
  // would silently keep the library excluded on the TV forever.
  localStorage.setItem('bb_carrylib_primary:9f', '0');
  localStorage.setItem('bb_theme', 'bb-2000');
  const res = applyConfigSnapshot({ bb_theme: 'bb-2000' });
  assert.equal(localStorage.getItem('bb_carrylib_primary:9f'), null);
  assert.equal(res.removed, 1);
});

test('reconciliation never touches a key outside the synced space', () => {
  // The nightmare: hydrating a store logs it out, or resets the machine's
  // render mode, because reconciliation swept keys it does not own.
  localStorage.setItem('jellyfin_token', 'KEEP-ME');
  localStorage.setItem('jellyfin_url', 'http://localhost:8096');
  localStorage.setItem('bb_render_mode', 'flat');
  localStorage.setItem('bb_quality', 'low');
  localStorage.setItem('bb_rental', '{"until":123}');
  applyConfigSnapshot({ bb_theme: 'bb-2000' });
  assert.equal(localStorage.getItem('jellyfin_token'), 'KEEP-ME');
  assert.equal(localStorage.getItem('jellyfin_url'), 'http://localhost:8096');
  assert.equal(localStorage.getItem('bb_render_mode'), 'flat');
  assert.equal(localStorage.getItem('bb_quality'), 'low');
  assert.equal(localStorage.getItem('bb_rental'), '{"until":123}');
});

test('a server snapshot cannot write device-local keys even if it holds them', () => {
  // An older or hacked record naming bb_render_mode must not flip this machine
  // into 2.5D — the skip-set is enforced on the way IN as well as on the way out.
  localStorage.setItem('bb_render_mode', '3d');
  applyConfigSnapshot({ bb_render_mode: 'flat', bb_theme: 'bb-2000' });
  assert.equal(localStorage.getItem('bb_render_mode'), '3d');
  assert.equal(localStorage.getItem('bb_theme'), 'bb-2000');
});

test('server metadata keys never reach storage as settings', () => {
  applyConfigSnapshot({ halcyon_config_v: '1', halcyon_saved_at: 'now', bb_theme: 'bb-2000' });
  assert.equal(localStorage.getItem('halcyon_config_v'), null);
  assert.equal(localStorage.getItem('halcyon_saved_at'), null);
  assert.equal(localStorage.getItem('bb_theme'), 'bb-2000');
});

// ─── Harness pinning ─────────────────────────────────────────────────────────

test('a harness-pinned key survives a snapshot that disagrees', () => {
  // `--theme bb-2000` silently losing to an account's saved theme would not
  // fail a checkpoint — it would quietly photograph the wrong store.
  localStorage.setItem('bb_theme', 'bb-2000');
  localStorage.setItem(HARNESS_PIN_KEY, JSON.stringify(['bb_theme']));
  const res = applyConfigSnapshot({ bb_theme: 'hv-90s', bb_arrangement: 'straight' });
  assert.equal(localStorage.getItem('bb_theme'), 'bb-2000');
  assert.equal(localStorage.getItem('bb_arrangement'), 'straight');
  assert.deepEqual(res.pinned, ['bb_theme']);
});

test('a pinned key is not swept by reconciliation either', () => {
  localStorage.setItem('bb_medium', 'vhs');
  localStorage.setItem(HARNESS_PIN_KEY, JSON.stringify(['bb_medium']));
  applyConfigSnapshot({ bb_theme: 'bb-2000' });
  assert.equal(localStorage.getItem('bb_medium'), 'vhs');
});

test('a corrupt pin list degrades to no pins rather than throwing', () => {
  localStorage.setItem(HARNESS_PIN_KEY, 'not json');
  assert.doesNotThrow(() => applyConfigSnapshot({ bb_theme: 'bb-2000' }));
  assert.equal(localStorage.getItem('bb_theme'), 'bb-2000');
});

test('the pin list is itself never synced', () => {
  assert.equal(isSyncedConfigKey(HARNESS_PIN_KEY), false);
  localStorage.setItem(HARNESS_PIN_KEY, JSON.stringify(['bb_theme']));
  assert.equal(HARNESS_PIN_KEY in snapshotLocalConfig(), false);
});

// ─── Round trip ──────────────────────────────────────────────────────────────

test('machine A configured, machine B hydrated, same store', () => {
  // The issue's "done when", in miniature.
  localStorage.setItem('bb_theme', 'bb-2000');
  localStorage.setItem('bb_arrangement', 'herringbone');
  localStorage.setItem('bb_streaming_services', 'netflix,max');
  localStorage.setItem('bb_carrylib_primary:9f', '0');
  localStorage.setItem('bb_render_mode', '3d');   // machine A is the kiosk
  const fromA = snapshotLocalConfig();

  store.clear();                                   // machine B, fresh browser
  localStorage.setItem('bb_render_mode', 'flat');  // …and a weaker machine
  localStorage.setItem('jellyfin_token', 'B-OWN-TOKEN');
  applyConfigSnapshot(fromA);

  assert.equal(localStorage.getItem('bb_theme'), 'bb-2000');
  assert.equal(localStorage.getItem('bb_arrangement'), 'herringbone');
  assert.equal(localStorage.getItem('bb_streaming_services'), 'netflix,max');
  assert.equal(localStorage.getItem('bb_carrylib_primary:9f'), '0');
  // B keeps its own machine and its own credentials.
  assert.equal(localStorage.getItem('bb_render_mode'), 'flat');
  assert.equal(localStorage.getItem('jellyfin_token'), 'B-OWN-TOKEN');
});
