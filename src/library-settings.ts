// Per-library settings, registered DYNAMICALLY once a catalog is known —
// unlike every static row in settings.ts, these can't exist until a server
// (or the demo) has told us what libraries there are. Two families share the
// mechanism:
//
//  - STORE LIBRARIES (#41, Settings → Connection → Store Libraries): which
//    libraries this store carries as aisles. Default ON; switching one off
//    skips its item sync entirely on the next boot (see excludeLibraryIds in
//    fetchJellyfinLibrariesAndMovies). First set on the opening-day setup
//    terminal's checkbox screen; editable from the drawer after. These rows
//    register from the REMEMBERED full server list (below), not the loaded
//    catalog — an excluded library is absent from the catalog by design, and
//    its row must survive so it can be switched back on.
//
//  - OVERHEAD TVS (#39, Settings → Playback → Overhead TVs): which libraries
//    feed the ceiling CRTs' playback pool (ambient-tvs.ts). Default OFF for
//    every row — none selected means the family-genre heuristic keeps picking,
//    so existing stores don't change behavior. These rows register from the
//    CURRENT catalog (a pool can only draw from stock that's actually in the
//    store — and in the demo that's the demo libraries).
//
// Value reads go through raw localStorage scans rather than getSetting():
// the carried-set is needed at sync time, BEFORE any registration has run on
// a fresh boot, and the TV pool is read inside the harness-booted scene where
// main.ts never registers anything. Keys are stable per library id, so a
// choice survives re-syncs and member switches.
import { registerSetting } from './settings';
import { knownServerLibraries } from './media-backend.ts';
import type { LibrarySummary } from './media-types.ts';

export const CARRY_LIB_PREFIX = 'bb_carrylib_';
export const TV_LIB_PREFIX = 'bb_tvlib_';

// What each family's visibleWhen closures consult — reassigned on every
// registration pass, so rows for libraries that disappeared (deleted on the
// server, or a different server entirely) drop out of the drawer without any
// registry surgery. Their localStorage keys stay behind harmlessly.
let carryIds = new Set<string>();
let tvIds = new Set<string>();

/**
 * (Re)register both toggle families. `catalogLibs` is the loaded catalog
 * (real or demo) driving the Overhead TVs rows; the Store Libraries rows come
 * from the remembered full server list (jellyfin.ts knownServerLibraries —
 * the only view that still contains EXCLUDED libraries), falling back to the
 * catalog when nothing is remembered yet (pre-#41 stores that have never run
 * the setup terminal, and the demo).
 */
export function registerLibraryToggles(catalogLibs: ReadonlyArray<LibrarySummary>): void {
  const remembered = knownServerLibraries();
  const carryLibs = remembered.length > 0 ? remembered : catalogLibs;

  carryIds = new Set(carryLibs.map((l) => l.id));
  for (const lib of carryLibs) {
    const id = lib.id;
    registerSetting({
      key: `${CARRY_LIB_PREFIX}${id}`,
      label: lib.name,
      kind: 'toggle',
      group: 'Connection',
      subpage: 'Store Libraries',
      default: true,
      applyMode: 'reload',
      hint: 'OFF = this store does not carry the library; its sync is skipped.',
      visibleWhen: () => carryIds.has(id),
    });
  }

  tvIds = new Set(catalogLibs.map((l) => l.id));
  for (const lib of catalogLibs) {
    const id = lib.id;
    registerSetting({
      key: `${TV_LIB_PREFIX}${id}`,
      label: lib.name,
      kind: 'toggle',
      group: 'Playback',
      subpage: 'Overhead TVs',
      default: false,
      applyMode: 'rebuild-scene',
      hint: 'Feed the ceiling TVs from this library. All OFF = family picks.',
      visibleWhen: () => tvIds.has(id),
    });
  }
}

function scanPrefix(prefix: string, wanted: '0' | '1'): Set<string> {
  const out = new Set<string>();
  if (typeof localStorage === 'undefined') return out;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix) && localStorage.getItem(key) === wanted) {
      out.add(key.slice(prefix.length));
    }
  }
  return out;
}

/** Library ids this store does NOT carry (absent key = carried, the default). */
export function excludedLibraryIds(): Set<string> {
  return scanPrefix(CARRY_LIB_PREFIX, '0');
}

/** Library ids explicitly selected to feed the overhead TVs (none = heuristic). */
export function tvPoolLibraryIds(): Set<string> {
  return scanPrefix(TV_LIB_PREFIX, '1');
}

/** Persist one carried-library choice (the setup terminal's checkbox rows). */
export function setLibraryCarried(id: string, carried: boolean): void {
  localStorage.setItem(`${CARRY_LIB_PREFIX}${id}`, carried ? '1' : '0');
}
