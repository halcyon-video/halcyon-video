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
//
// MULTI-SOURCE (GH #84): a library id is only unique within its own server —
// Plex section keys are small integers, so "1" naming a different library on
// each of two servers is the normal case, not a freak collision. Ids are
// therefore namespaced `<sourceId>:<libId>` everywhere above the provider, and
// these keys follow. Keys written before #84 are BARE, and resolving them is
// what keeps an existing store's choices: a bare key belongs to the primary
// source, and a namespaced key for the same library always wins over it.
import { registerSetting } from './settings';
import { knownServerLibraries } from './jellyfin';
import type { LibrarySummary } from './jellyfin';
import {
  LEGACY_SOURCE_ID,
  knownLibrariesBySource,
  listMediaSources,
  namespaceLibraryId,
  splitLibraryId,
} from './media-sources';

export const CARRY_LIB_PREFIX = 'bb_carrylib_';
export const TV_LIB_PREFIX = 'bb_tvlib_';

// What each family's visibleWhen closures consult — reassigned on every
// registration pass, so rows for libraries that disappeared (deleted on the
// server, or a different server entirely) drop out of the drawer without any
// registry surgery. Their localStorage keys stay behind harmlessly.
let carryIds = new Set<string>();
let tvIds = new Set<string>();

/** Every carried-library row this store should offer, per source. */
interface CarryRow {
  /** Namespaced — what the setting key and the catalog both use. */
  id: string;
  /** As the drawer labels it (server-qualified when there's more than one). */
  label: string;
}

function carryRows(catalogLibs: ReadonlyArray<LibrarySummary>): CarryRow[] {
  const remembered = knownLibrariesBySource();
  const sources = listMediaSources();
  if (remembered.length) {
    const multi = remembered.length > 1;
    return remembered.flatMap((entry) =>
      entry.libraries.map((l) => ({
        id: namespaceLibraryId(entry.sourceId, l.id),
        label: multi ? `${entry.sourceName} — ${l.name}` : l.name,
      }))
    );
  }
  // Nothing remembered per-source yet: a store that predates #84, or one that
  // has never run the setup terminal. Fall back exactly as before — the flat
  // remembered list, then the catalog — and attribute it to the primary
  // source so its rows key the same way everything else does.
  const flat = knownServerLibraries();
  const fallback = flat.length > 0 ? flat : catalogLibs;
  const sourceId = sources[0]?.id ?? LEGACY_SOURCE_ID;
  return fallback.map((l) => ({
    // A catalog id is already namespaced; a remembered flat one is bare.
    id: l.id.includes(':') ? l.id : namespaceLibraryId(sourceId, l.id),
    label: l.name,
  }));
}

/**
 * (Re)register both toggle families. `catalogLibs` is the loaded catalog
 * (real or demo, ids already namespaced) driving the Overhead TVs rows; the
 * Store Libraries rows come from the remembered per-source lists — the only
 * view that still contains EXCLUDED libraries.
 */
export function registerLibraryToggles(catalogLibs: ReadonlyArray<LibrarySummary>): void {
  const rows = carryRows(catalogLibs);

  carryIds = new Set(rows.map((r) => r.id));
  for (const row of rows) {
    const id = row.id;
    const { sourceId, libraryId } = splitLibraryId(id);
    registerSetting({
      key: `${CARRY_LIB_PREFIX}${id}`,
      label: row.label,
      kind: 'toggle',
      group: 'Connection',
      subpage: 'Store Libraries',
      // Seeded from whatever this library's choice already resolves to, so a
      // pre-#84 bare key keeps its meaning under the namespaced row that
      // replaces it — the row reads OFF for a library the store already
      // wasn't carrying, instead of silently re-stocking it.
      default: isLibraryCarried(sourceId, libraryId),
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

function rawCarryValue(id: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(`${CARRY_LIB_PREFIX}${id}`);
  } catch {
    return null;
  }
}

/**
 * Does this store carry that library? Namespaced key first, then the pre-#84
 * bare key (primary source only), then the default of yes.
 */
export function isLibraryCarried(sourceId: string, libraryId: string): boolean {
  const namespaced = rawCarryValue(namespaceLibraryId(sourceId, libraryId));
  if (namespaced !== null) return namespaced !== '0';
  if (sourceId === LEGACY_SOURCE_ID) {
    const bare = rawCarryValue(libraryId);
    if (bare !== null) return bare !== '0';
  }
  return true;
}

/** Library ids this store does NOT carry, as stored (namespaced or bare). */
export function excludedLibraryIds(): Set<string> {
  return scanPrefix(CARRY_LIB_PREFIX, '0');
}

/**
 * The BARE ids to skip when syncing one source — what a provider understands,
 * since a provider only ever sees its own server's ids.
 *
 * Resolved through isLibraryCarried rather than taken straight off the scan,
 * so a namespaced ON correctly shadows a leftover bare OFF instead of the
 * library staying excluded forever.
 */
export function excludedBareIdsForSource(sourceId: string): Set<string> {
  const out = new Set<string>();
  for (const stored of scanPrefix(CARRY_LIB_PREFIX, '0')) {
    const split = splitLibraryId(stored);
    if (split.sourceId !== sourceId) continue;
    if (!isLibraryCarried(sourceId, split.libraryId)) out.add(split.libraryId);
  }
  return out;
}

/**
 * Library ids explicitly selected to feed the overhead TVs (none = heuristic).
 * A bare id from before #84 also answers to its namespaced form, so an
 * existing store's Overhead TVs choice survives the catalog being namespaced
 * instead of quietly reverting to the family-genre heuristic.
 */
export function tvPoolLibraryIds(): Set<string> {
  const out = new Set<string>();
  for (const id of scanPrefix(TV_LIB_PREFIX, '1')) {
    out.add(id);
    if (!id.includes(':')) out.add(namespaceLibraryId(LEGACY_SOURCE_ID, id));
  }
  return out;
}

/** Persist one carried-library choice (the setup terminal's checkbox rows). */
export function setLibraryCarried(id: string, carried: boolean): void {
  localStorage.setItem(`${CARRY_LIB_PREFIX}${id}`, carried ? '1' : '0');
}
