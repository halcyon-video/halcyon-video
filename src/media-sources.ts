// CONNECTED SOURCES (GH #84) — the list of media servers this store is
// stocked from, replacing the single jellyfin_url/jellyfin_token/jellyfin_userid
// triple that made the store one-server by construction.
//
// The shape of the problem, from the report: two libraries on your own server,
// three more on a friend's shared one. Plex hands both to you on one account
// (fetchPlexServers never filtered on `owned`), so "my libraries + their
// libraries" is the ordinary case there rather than an exotic one — but the
// ceiling was never Plex's. It was these three keys, and the ~46 places that
// read them, so this module is about the keys.
//
// THREE RULES HOLD THIS TOGETHER, and breaking any one of them breaks an
// install that already works:
//
//  1. LEGACY INSTALLS SYNTHESIZE. An install that predates this has no
//     `media_sources` and a perfectly good jellyfin_url/token/userid — so
//     listMediaSources() manufactures one source from them rather than
//     reporting the store unconfigured. No migration step, no first-boot
//     reconnect, nothing for an existing user to notice.
//  2. THE PRIMARY SOURCE MIRRORS BACK. Every write mirrors sources[0] into
//     those same three keys (and provider_kind). That is what keeps the
//     consumers this pass deliberately does NOT touch — Jellyseerr, remote
//     play, the Settings credential rows, the wake-up token check, flat
//     mode's server field — working on a well-defined server instead of
//     guessing. Those features are one-per-install by nature (there is one
//     request server, one streamed kiosk, one row to type a password into),
//     so "the primary source" is the honest answer for them, not a stopgap.
//  3. LIBRARY IDS ARE NAMESPACED, credentials are not. Two servers hand out
//     colliding library ids (Plex section keys are small integers — "1" on
//     both servers is normal), and the carry/TV toggles key on that id, so a
//     bare id would have the friend's Movies aisle switching off yours. Ids
//     become `<sourceId>:<libId>` at the merge, and split back to the bare id
//     before any provider call — a provider only ever sees its own ids.
//
// Node-testable: `import type` only, and every localStorage touch is guarded,
// so tests/media-sources.test.ts runs the id/merge logic under
// `node --experimental-strip-types` without a DOM.
// Explicit .ts specifiers: tests/media-sources.test.ts loads this module under
// `node --test`'s type-stripping loader, which can't resolve a bare sibling
// specifier (same note as playback-routing.ts).
import {
  activeProviderKind,
  PROVIDER_KIND_KEY,
  DEFAULT_PROVIDER_KIND,
} from './providers/provider-registry.ts';
import type {
  Library,
  LibrarySummary,
  ProviderSession,
  Title,
} from './providers/media-source-provider.ts';

/** Where the connected-source list lives. */
export const MEDIA_SOURCES_KEY = 'media_sources';
/** Per-source remembered library lists, for the carry toggles (see below). */
const KNOWN_LIBS_BY_SOURCE_KEY = 'bb_known_libraries_by_source';

/** The legacy singleton's identity once it becomes a source. Stable forever:
 *  carry-toggle keys written before #84 are bare library ids, and resolving
 *  those depends on knowing which source used to be "the" server. */
export const LEGACY_SOURCE_ID = 'primary';

/** One connected media server: where it is, who we are on it, what speaks it. */
export interface MediaSource {
  /** Stable per-install id — namespaces this server's library ids. Never a
   *  URL: addresses change (LAN -> plex.direct) and the carry choices keyed
   *  off it must survive that. */
  id: string;
  /** Provider kind — 'jellyfin' | 'plex' | … Per-source, not per-install:
   *  a Jellyfin box and a Plex box can stock one store together. */
  kind: string;
  url: string;
  token: string;
  /** Jellyfin addresses /Users/<id>/…; empty on Plex by design (GH #66). */
  userId: string;
  userName?: string;
  /** What the library list and aisle signs call this server. */
  name: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Private mode / locked storage — the store still runs, just forgets.
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    /* a store that can't persist still works this session */
  }
}

function drop(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/** A readable label for a server we were given no name for. */
export function labelForUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return 'Media server';
  try {
    const host = new URL(trimmed).host;
    return host || trimmed;
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').replace(/\/$/, '') || 'Media server';
  }
}

function sanitize(raw: any, index: number): MediaSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const url = typeof raw.url === 'string' ? raw.url : '';
  const token = typeof raw.token === 'string' ? raw.token : '';
  if (!url || !token) return null; // a source we can't actually talk to
  const id = typeof raw.id === 'string' && raw.id ? raw.id : index === 0 ? LEGACY_SOURCE_ID : `s${index}`;
  return {
    id,
    kind: typeof raw.kind === 'string' && raw.kind ? raw.kind : DEFAULT_PROVIDER_KIND,
    url,
    token,
    userId: typeof raw.userId === 'string' ? raw.userId : '',
    userName: typeof raw.userName === 'string' ? raw.userName : undefined,
    name: typeof raw.name === 'string' && raw.name ? raw.name : labelForUrl(url),
  };
}

/**
 * Every server this store is stocked from, in order — [0] is the primary.
 *
 * Rule 1: an install with no list but a saved singleton gets that singleton
 * back as one source, so nothing about an existing store changes.
 */
export function listMediaSources(): MediaSource[] {
  const raw = read(MEDIA_SOURCES_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const list = parsed.map(sanitize).filter((s): s is MediaSource => s !== null);
        if (list.length) return dedupe(list);
      }
    } catch {
      // Corrupt list: fall through to the legacy singleton rather than
      // reporting the store unconfigured and dropping someone at setup.
    }
  }
  const legacy = legacySingletonSource();
  return legacy ? [legacy] : [];
}

/** The saved singleton keys as a source, or null if this install has none. */
export function legacySingletonSource(): MediaSource | null {
  const url = read('jellyfin_url');
  const token = read('jellyfin_token');
  if (!url || !token) return null;
  return {
    id: LEGACY_SOURCE_ID,
    kind: activeProviderKind(),
    url,
    token,
    userId: read('jellyfin_userid') || '',
    userName: read('jellyfin_username') || undefined,
    name: labelForUrl(url),
  };
}

/** Same server twice (re-connected at a new address, say) collapses to one. */
function dedupe(list: MediaSource[]): MediaSource[] {
  const byId = new Map<string, MediaSource>();
  for (const s of list) if (!byId.has(s.id)) byId.set(s.id, s);
  return [...byId.values()];
}

/**
 * Persist the list, and mirror [0] into the legacy keys (rule 2). Callers
 * never write jellyfin_url/token/userid themselves — going through here is
 * what keeps the primary source and those keys from drifting apart.
 */
export function saveMediaSources(list: ReadonlyArray<MediaSource>): void {
  const clean = dedupe(list.map((s, i) => sanitize(s, i)).filter((s): s is MediaSource => s !== null));
  write(MEDIA_SOURCES_KEY, JSON.stringify(clean));
  const primary = clean[0];
  if (!primary) {
    drop('jellyfin_url');
    drop('jellyfin_token');
    drop('jellyfin_userid');
    return;
  }
  write('jellyfin_url', primary.url);
  write('jellyfin_token', primary.token);
  write('jellyfin_userid', primary.userId);
  // provider_kind follows the PRIMARY source. A mixed-backend store still
  // resolves each source's own provider through providerKindForSource();
  // this only decides what the singleton consumers assume.
  write(PROVIDER_KIND_KEY, primary.kind);
}

/**
 * Connect a server, or refresh one already connected. Identity is (kind, url)
 * — reconnecting the same box keeps its id, and therefore every carry choice
 * already made about its libraries.
 */
export function addMediaSource(input: Omit<MediaSource, 'id'> & { id?: string }): MediaSource {
  const list = listMediaSources();
  const url = input.url;
  const existing = list.find(
    (s) => s.id === input.id || (s.kind === input.kind && sameServer(s.url, url))
  );
  const source: MediaSource = {
    id: existing?.id ?? input.id ?? nextSourceId(list),
    kind: input.kind,
    url,
    token: input.token,
    userId: input.userId,
    userName: input.userName,
    name: input.name || labelForUrl(url),
  };
  const next = existing ? list.map((s) => (s.id === source.id ? source : s)) : [...list, source];
  saveMediaSources(next);
  return source;
}

/** Two addresses for one box (trailing slash, http vs https on a LAN name). */
function sameServer(a: string, b: string): boolean {
  const norm = (u: string) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

function nextSourceId(list: ReadonlyArray<MediaSource>): string {
  if (!list.length) return LEGACY_SOURCE_ID;
  const taken = new Set(list.map((s) => s.id));
  for (let i = 2; i < 500; i++) {
    const id = `s${i}`;
    if (!taken.has(id)) return id;
  }
  return `s${Date.now()}`;
}

export function removeMediaSource(id: string): void {
  saveMediaSources(listMediaSources().filter((s) => s.id !== id));
}

/** Disconnect everything (log out / change server). */
export function clearMediaSources(): void {
  drop(MEDIA_SOURCES_KEY);
  drop(KNOWN_LIBS_BY_SOURCE_KEY);
  drop('jellyfin_url');
  drop('jellyfin_token');
  drop('jellyfin_userid');
}

export function sourceById(id: string | undefined | null): MediaSource | null {
  if (!id) return null;
  return listMediaSources().find((s) => s.id === id) ?? null;
}

/** The server the singleton consumers mean (rule 2). */
export function primaryMediaSource(): MediaSource | null {
  return listMediaSources()[0] ?? null;
}

/** True once this store is stocked from more than one server — the flag the
 *  UI uses to decide whether to say WHICH server a library belongs to. */
export function hasMultipleSources(): boolean {
  return listMediaSources().length > 1;
}

// ─── Routing a title back to the server it came from ──────────────────────────

/**
 * Which server owns this title. A title with no `sourceId` is from before the
 * fan-out, from the demo catalog, or synthesized (discovery/gap/streaming/
 * game) — all of which belong to the primary source, so an unmarked title
 * behaves exactly as it did when there was only one server.
 */
export function sourceForTitle(title: { sourceId?: string } | null | undefined): MediaSource | null {
  return sourceById(title?.sourceId) ?? primaryMediaSource();
}

/** The provider kind to talk to this source with. */
export function providerKindForSource(source: MediaSource | null | undefined): string {
  return source?.kind || activeProviderKind();
}

/** A source as the ProviderSession every provider method takes. */
export function sessionForSource(source: MediaSource): ProviderSession {
  return { accessToken: source.token, userId: source.userId, userName: source.userName ?? '' };
}

/**
 * Everything needed to make one backend call about a title: where, as whom,
 * and in which dialect. Null when the store has no server at all (demo).
 */
export function connectionForTitle(
  title: { sourceId?: string } | null | undefined
): { source: MediaSource; url: string; token: string; userId: string; session: ProviderSession } | null {
  const source = sourceForTitle(title);
  if (!source) return null;
  return {
    source,
    url: source.url,
    token: source.token,
    userId: source.userId,
    session: sessionForSource(source),
  };
}

// ─── Namespaced library ids (rule 3) ─────────────────────────────────────────

const NS = ':';

/** `<sourceId>:<libId>` — what the store, the toggles and the scene all see. */
export function namespaceLibraryId(sourceId: string, libraryId: string): string {
  return `${sourceId}${NS}${libraryId}`;
}

/**
 * Split a namespaced id back apart. An id with no separator is a bare,
 * pre-#84 one and belongs to the primary source — which is what keeps carry
 * toggles written by an older build pointing at the same library.
 */
export function splitLibraryId(id: string): { sourceId: string; libraryId: string } {
  const at = String(id ?? '').indexOf(NS);
  if (at < 0) return { sourceId: LEGACY_SOURCE_ID, libraryId: String(id ?? '') };
  return { sourceId: id.slice(0, at), libraryId: id.slice(at + 1) };
}

/** The bare id a provider knows this library by. */
export function bareLibraryId(id: string): string {
  return splitLibraryId(id).libraryId;
}

// ─── Per-source remembered library lists ─────────────────────────────────────
//
// The carry toggles must keep offering a library that is currently EXCLUDED —
// an excluded library is absent from the catalog by design, so the drawer
// can't be built from the catalog alone (see library-settings.ts). jellyfin.ts
// already remembers one flat list for one server; this is the same idea per
// source, which is also where the server's display name for the grouped rows
// comes from.

export interface RememberedSourceLibraries {
  sourceId: string;
  sourceName: string;
  libraries: LibrarySummary[];
}

export function rememberSourceLibraries(
  source: MediaSource,
  libs: ReadonlyArray<LibrarySummary>
): void {
  const all = knownLibrariesBySource().filter((e) => e.sourceId !== source.id);
  all.push({
    sourceId: source.id,
    sourceName: source.name,
    libraries: libs.map((l) => ({ id: l.id, name: l.name })),
  });
  // Only for servers still connected — a disconnected one must not keep
  // offering rows in the drawer.
  const live = new Set(listMediaSources().map((s) => s.id));
  write(KNOWN_LIBS_BY_SOURCE_KEY, JSON.stringify(all.filter((e) => live.has(e.sourceId))));
}

export function knownLibrariesBySource(): RememberedSourceLibraries[] {
  const raw = read(KNOWN_LIBS_BY_SOURCE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.sourceId === 'string' && Array.isArray(e.libraries))
      .map((e) => ({
        sourceId: String(e.sourceId),
        sourceName: typeof e.sourceName === 'string' ? e.sourceName : 'Media server',
        libraries: e.libraries
          .filter((l: any) => l && typeof l.id === 'string')
          .map((l: any) => ({ id: String(l.id), name: String(l.name ?? l.id) })),
      }));
  } catch {
    return [];
  }
}

// ─── Merging catalogs from several servers ───────────────────────────────────

/**
 * Stamp one server's catalog with its identity: namespaced library ids, and
 * `sourceId` on the library and every title in it, so artwork, playback and
 * progress can all be routed back to the server the title actually came from.
 *
 * Mutates in place — these objects were built for this store microseconds ago
 * by the provider, and a catalog-scale copy would be thousands of allocations
 * for nothing.
 */
export function stampSourceOnLibraries(source: MediaSource, libs: Library[]): Library[] {
  for (const lib of libs) {
    lib.id = namespaceLibraryId(source.id, lib.id);
    lib.sourceId = source.id;
    for (const movie of lib.movies) {
      movie.sourceId = source.id;
      // libraryName is what the shelf signage and several fixtures read, so
      // it has to match the (possibly disambiguated) library name below.
      movie.libraryName = lib.name;
    }
  }
  return libs;
}

/**
 * Two servers both calling a library "Movies" would put two identically-signed
 * aisles in one store with no way to tell whose is whose. When (and only when)
 * a name is claimed by more than one server, say which server it is — a
 * single-server store's signage never changes.
 */
export function disambiguateLibraryNames(
  entries: ReadonlyArray<{ source: MediaSource; libraries: Library[] }>
): void {
  if (entries.length < 2) return;
  const owners = new Map<string, Set<string>>();
  for (const { source, libraries } of entries) {
    for (const lib of libraries) {
      const key = lib.name.toLowerCase();
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key)!.add(source.id);
    }
  }
  for (const { source, libraries } of entries) {
    for (const lib of libraries) {
      if ((owners.get(lib.name.toLowerCase())?.size ?? 0) < 2) continue;
      lib.name = `${lib.name} (${source.name})`;
      for (const movie of lib.movies) movie.libraryName = lib.name;
    }
  }
}

// ─── Carry ids: an item id that survives a round trip through storage ────────
//
// A Title.id is only unique WITHIN its server, and several flows persist a bare
// id and look the title up again later: the tapes you're carrying, a rental
// record, the checkout event. On a two-server store that lookup is ambiguous —
// both boxes issue `1`, `m0`, and so on — and first-match-wins silently
// resolves to the other server's film. So anything that round-trips carries the
// source with it.
//
// Title.id itself stays BARE, always: it is what gets handed back to the
// server, and qualifying it would break every request.

/** The id to persist or emit for this title. */
export function carryIdFor(title: { id: string; sourceId?: string }): string {
  return title.sourceId ? namespaceLibraryId(title.sourceId, title.id) : title.id;
}

/**
 * Does this title answer to that carry id? Accepts both forms, because records
 * written before #84 (and by a single-source store) hold bare ids — a rental
 * lockout must not survive an upgrade only to find no tapes.
 */
export function matchesCarryId(title: { id: string; sourceId?: string }, carryId: string): boolean {
  if (carryId === title.id) return true;
  const split = splitLibraryId(carryId);
  if (split.libraryId !== title.id) return false;
  return (title.sourceId ?? LEGACY_SOURCE_ID) === split.sourceId;
}

/** Find the title a carry id names, across every library. */
export function findTitleByCarryId<T extends { id: string; sourceId?: string }>(
  libraries: ReadonlyArray<{ movies: T[] }>,
  carryId: string
): T | undefined {
  // An EXACT (source, id) match wins over a bare-id one, so a qualified record
  // can never be answered by the wrong server's film just because it came
  // first in the library order.
  for (const lib of libraries) {
    const exact = lib.movies.find((m) => m.sourceId && carryIdFor(m) === carryId);
    if (exact) return exact;
  }
  for (const lib of libraries) {
    const loose = lib.movies.find((m) => matchesCarryId(m, carryId));
    if (loose) return loose;
  }
  return undefined;
}

/** Titles, flattened across every library — what the store stocks. */
export function allTitles(libs: ReadonlyArray<Library>): Title[] {
  return libs.flatMap((l) => l.movies);
}
