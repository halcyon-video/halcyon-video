// CATALOG FAN-OUT (GH #84) — stock one store from every connected server.
//
// The old shape was one url + one session + one fetchLibraries call. This is
// the same call, once per source, merged: each server's libraries come back
// namespaced by source, every title stamped with the server it came from, and
// same-named libraries told apart by whose they are.
//
// SEQUENTIAL, DELIBERATELY. Two Jellyfin syncs must not overlap: jellyfin.ts's
// collection pass clears its module-level collectionArt / collectionTmdbIds
// maps at the start of every sync, so a second server starting mid-flight
// wipes the first one's collection art and the collection endcap loses its
// artwork. Syncing two servers therefore costs roughly two syncs' time, which
// is the honest price until that state is per-call rather than per-module.
//
// A SERVER THAT FAILS MUST NOT EMPTY THE STORE. The reported case is a friend's
// shared server alongside your own; theirs being asleep is the ordinary
// condition, not an error worth losing your own shelves over. Each source is
// caught on its own and reported in `failures`; only losing EVERY source
// throws, which is what keeps the existing unreachable-distributor notice and
// its background retry working exactly as before.
import { createProvider } from './providers/provider-registry';
import { registerBuiltInProviders } from './providers/index';
import type { Library, LibrarySummary } from './providers/media-source-provider';
import {
  listMediaSources,
  sessionForSource,
  stampSourceOnLibraries,
  disambiguateLibraryNames,
  rememberSourceLibraries,
  knownLibrariesBySource,
  type MediaSource,
} from './media-sources';
import { excludedBareIdsForSource } from './library-settings';

export interface SourceSyncFailure {
  source: MediaSource;
  error: string;
}

export interface CatalogSyncResult {
  /** Every carried library across every reachable source, namespaced. */
  libraries: Library[];
  /** Sources that couldn't be reached or refused — never fatal on its own. */
  failures: SourceSyncFailure[];
  /** Sources that did answer. */
  synced: MediaSource[];
}

/**
 * Sync every connected source and merge the result.
 *
 * `onProgress` keeps the caller's stall watchdog fed exactly as the
 * single-server call did; with more than one server the stage names are
 * prefixed with whose sync is talking, because a two-minute silence on the
 * CRT is a very different thing when you know which of two servers it is.
 */
export async function fetchCatalogFromAllSources(opts?: {
  onProgress?: (stage: string) => void;
  /** Called as each source finishes, for the boot console. */
  onSourceDone?: (source: MediaSource, libraryCount: number, titleCount: number) => void;
}): Promise<CatalogSyncResult> {
  registerBuiltInProviders();
  const sources = listMediaSources();
  if (!sources.length) return { libraries: [], failures: [], synced: [] };

  const multi = sources.length > 1;
  const collected: { source: MediaSource; libraries: Library[] }[] = [];
  const failures: SourceSyncFailure[] = [];

  for (const source of sources) {
    const stage = (s: string) => {
      // 'page' is a liveness tick with a meaning the caller decodes; never
      // decorate it or the page counter stops counting.
      opts?.onProgress?.(s === 'page' || !multi ? s : `${source.name}: ${s}`);
    };
    try {
      const provider = createProvider(source.kind);
      const libs = await provider.fetchLibraries(source.url, sessionForSource(source), stage, {
        excludeLibraryIds: excludedBareIdsForSource(source.id),
      });
      rememberFrom(source, libs);
      stampSourceOnLibraries(source, libs);
      collected.push({ source, libraries: libs });
      opts?.onSourceDone?.(
        source,
        libs.length,
        libs.reduce((n, l) => n + l.movies.length, 0)
      );
    } catch (e: any) {
      failures.push({ source, error: String(e?.message ?? e) });
    }
  }

  if (!collected.length) {
    // Every source failed: behave like the old single-server failure so the
    // opening-day notice screen and its retry loop still fire.
    const first = failures[0];
    throw new Error(first ? first.error : 'No media servers answered.');
  }

  disambiguateLibraryNames(collected);
  return {
    libraries: collected.flatMap((c) => c.libraries),
    failures,
    synced: collected.map((c) => c.source),
  };
}

/**
 * Keep this source's remembered library list current. Union, not replace: what
 * came back omits every EXCLUDED library by design (their sync is skipped), and
 * those are exactly the rows the Store Libraries drawer must keep offering so
 * they can be switched back on.
 */
function rememberFrom(source: MediaSource, libs: ReadonlyArray<Library>): void {
  const prior = knownLibrariesBySource().find((e) => e.sourceId === source.id)?.libraries ?? [];
  const merged = new Map<string, LibrarySummary>();
  for (const l of prior) merged.set(l.id, l);
  // Names from THIS sync win — a library renamed on the server should read
  // its new name in the drawer. Ids here are still bare: the stamp happens
  // after this call.
  for (const l of libs) merged.set(l.id, { id: l.id, name: l.name });
  rememberSourceLibraries(source, [...merged.values()]);
}
