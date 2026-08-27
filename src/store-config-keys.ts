// Which localStorage keys are STORE CONFIGURATION, and what happens to them —
// the decision half of GH #123, split from the transport half so it can be
// tested (see tests/store-config-keys.test.ts).
//
// Deliberately has NO imports, same reason as media-source-provider.ts and
// seerr-config.ts: it must run under `node --test` type-stripping, and its
// sibling store-config-sync.ts drags in a provider, which drags in Tauri and
// DOM globals a test process cannot load. localStorage is reached as a global
// and guarded, so a DOM-less caller gets empty results rather than a throw.
//
// This is the file to edit when a new setting must (or must not) follow a
// person between machines. The rationale for each exclusion lives with it —
// the whole point of an explicit skip-set is that the argument is written
// down where the next person changing it will read it.

/** Every key in the app's settings family is a candidate; the skip-set below
 *  carves out the ones that describe a machine rather than a store. */
const SYNC_PREFIX = /^bb_/;

/**
 * Skipped by prefix.
 *
 * `bb_quality` covers the tier itself plus its calibration siblings
 * (bb_quality_auto/_sig/_ss), which are measurements of THIS GPU — replaying
 * one machine's benchmark verdict onto another is how a fast box ends up
 * clamped to a slow one's tier.
 */
const SKIP_PREFIXES = [
  'bb_quality',   // tier + the auto-calibration's cached verdict for this GPU
  'bb_debug_',    // developer switches, never a user's store
];

/** Skipped by exact key — see the three families in the header. */
const SKIP_KEYS = new Set([
  // Device-local rendering + performance.
  'bb_render_mode',
  'bb_ao',
  'bb_ssao',
  'bb_aa',
  'bb_fps_cap',
  'bb_fps_meter',
  'bb_px_budget',
  'bb_settle_ss',
  'bb_motion_ss',
  'bb_motion_sharp',
  'bb_mirrors',
  'bb_partial_composite',
  'bb_overflow',
  'bb_poster_cache_mb',
  'bb_vr_render_scale',
  'bb_hero_art',
  'bb_device_gate',
  'bb_boot_context_loss_attempts',
  // Device-local playback: whether THIS machine hands films to a local mpv.
  'bb_local_mpv',
  // Hosting + kiosk state. A second machine must not decide it is also the
  // Remote Play host, and one store's rental lockout is not another's.
  'bb_remote_play',
  'bb_remote_instance',
  'bb_rental',      // the lockout RECORD; bb_rental_mode, the setting, travels
  'bb_rental_dev',
  // Server-derived caches. Re-fetched on every sync, and stale copies of
  // another machine's library list would confuse the carried-library rows.
  'bb_known_libraries',
  'bb_known_libraries_by_source',
  'bb_staff_picks_v1',
  // Ephemeral session state.
  'bb_carried',           // the tapes in your hands this minute
  'bb_last_nightly_reload',
  // Test/harness overrides. These exist to make a screenshot deterministic;
  // pushing one to the server would make it permanent for a real person.
  'bb_harness_cast',
  'bb_tv_testcard',
  'bb_tv_demo_loop',
  'bb_promo_date',
  // This module's own bookkeeping (below).
  'bb_config_pins',
]);

/**
 * Keys the harness pinned via `?set=` / a shortcut param, which a fetched
 * snapshot must never overwrite.
 *
 * Screenshots and the nav-state suite are only useful because the same URL
 * produces the same store twice; a server-side theme quietly winning over
 * `--theme bb-2000` would make every visual gate lie. Written by
 * harness-params.ts (which stays import-free, so it hands the list over
 * through storage rather than a call) and read here.
 *
 * Belt and braces: the harness has no media source, so hydrate already returns
 * early there. This makes the guarantee structural instead of incidental, so
 * it survives someone later pointing a harness run at a real server.
 */
export const HARNESS_PIN_KEY = 'bb_config_pins';

function readPinnedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(HARNESS_PIN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((k) => typeof k === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

/** Does this localStorage key belong to the synced store-configuration space? */
export function isSyncedConfigKey(key: string): boolean {
  if (!SYNC_PREFIX.test(key)) return false;
  if (SKIP_KEYS.has(key)) return false;
  return !SKIP_PREFIXES.some((p) => key.startsWith(p));
}

/** This machine's current store configuration, as the server would hold it. */
export function snapshotLocalConfig(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof localStorage === 'undefined') return out;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSyncedConfigKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

/**
 * Make this machine's configuration match `values`.
 *
 * Reconciling, not merging: a synced key the snapshot omits is a key the user
 * cleared on the other machine, so it is removed here too. Merging instead
 * would make "switch a library off on the laptop" un-doable from the TV — the
 * excluded-library keys are exactly the ones whose ABSENCE is meaningful.
 *
 * Returns what changed, for the boot log.
 */
export function applyConfigSnapshot(values: Record<string, string>): {
  written: number;
  removed: number;
  pinned: string[];
} {
  const pinned = readPinnedKeys();
  const skippedPins: string[] = [];
  let written = 0;
  let removed = 0;
  if (typeof localStorage === 'undefined') return { written, removed, pinned: skippedPins };

  for (const [key, value] of Object.entries(values)) {
    // The server's record can hold meta keys of its own (a save stamp, a
    // format version); only the config key-space is ever written to disk here.
    if (!isSyncedConfigKey(key)) continue;
    if (pinned.has(key)) {
      skippedPins.push(key);
      continue;
    }
    if (localStorage.getItem(key) === value) continue;
    localStorage.setItem(key, value);
    written++;
  }

  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSyncedConfigKey(key)) continue;
    if (pinned.has(key) || key in values) continue;
    stale.push(key);
  }
  for (const key of stale) {
    localStorage.removeItem(key);
    removed++;
  }
  return { written, removed, pinned: skippedPins };
}
