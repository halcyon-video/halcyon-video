import { invoke } from '@tauri-apps/api/core';
// Explicit .ts specifier: tests/version-collapse.test.ts loads this module
// under `node --test`'s type-stripping loader, which can't resolve the bare
// sibling specifier (same note as media-date-screen.ts).
import { activeMediaCutoff, titleReleasedBy } from './media-release-date.ts';

// The store's domain model lives in media-types.ts now that a second backend
// (plex.ts) fills the same shapes -- see the note at the top of that file.
// Re-exported here so the modules that import `Movie` and friends from
// './jellyfin' keep compiling unchanged.
import type {
  Movie,
  MediaStreamInfo,
  MovieVersion,
  MediaPlaybackInfo,
  HlsStreamOptions,
  Episode,
  MediaLibrary,
  JellyfinLibrary,
  LibrarySummary,
  PublicUser,
  MediaSession,
} from './media-types.ts';
export type {
  Movie,
  MediaStreamInfo,
  MovieVersion,
  MediaPlaybackInfo,
  HlsStreamOptions,
  Episode,
  MediaLibrary,
  JellyfinLibrary,
  LibrarySummary,
  PublicUser,
  MediaSession,
};

// Backend-neutral media logic (version collapsing, direct-play safety, the
// collection side-tables, transcode ceilings) lives in media-shared.ts so
// plex.ts can use the same rules without importing this module. Re-exported
// for the callers that have always imported them from here.
import {
  pickSubtitleDelivery,
  isTextSubtitleCodec,
  type SubtitleDelivery,
  formatBytes,
  qualityTag,
  collapseDuplicateVersions,
  collectionArt,
  collectionTmdbIds,
  collectionSyncStats,
  isHevcPassThroughEnabled,
  isHevcMain10Supported,
  isDirectPlaySafe,
  DEFAULT_VIDEO_BITRATE,
  COPY_VIDEO_BITRATE,
} from './media-shared.ts';
import { knownServerLibraries, rememberKnownLibraries, type MediaBackend } from './media-backend.ts';
export { knownServerLibraries };
export {
  pickSubtitleDelivery,
  isTextSubtitleCodec,
  type SubtitleDelivery,
  collapseDuplicateVersions,
  collectionArt,
  collectionTmdbIds,
  collectionSyncStats,
  isHevcPassThroughEnabled,
  isDirectPlaySafe,
};
/** Audio + subtitle streams of one media source, for the player's track picker. */
function extractStreamsFromSource(source: any): MediaStreamInfo[] | undefined {
  const raw = source?.MediaStreams;
  if (!Array.isArray(raw)) return undefined;
  const streams: MediaStreamInfo[] = raw
    .filter((s: any) => (s.Type === 'Audio' || s.Type === 'Subtitle') && typeof s.Index === 'number')
    .map((s: any) => ({
      index: s.Index,
      type: s.Type,
      language: s.Language || undefined,
      displayTitle: s.DisplayTitle || undefined,
      codec: s.Codec || undefined,
      isDefault: !!s.IsDefault,
      channels: (s.Type === 'Audio' && typeof s.Channels === 'number') ? s.Channels : undefined,
    }));
  return streams.length > 0 ? streams : undefined;
}

/** Audio + subtitle streams of an item's first media source. */
function extractMediaStreams(item: any): MediaStreamInfo[] | undefined {
  return extractStreamsFromSource(item.MediaSources?.[0]);
}

/** Container/codec info of one media source — see MediaPlaybackInfo. */
function extractPlaybackInfoFromSource(source: any): MediaPlaybackInfo | undefined {
  if (!source) return undefined;
  const streams: any[] = Array.isArray(source.MediaStreams) ? source.MediaStreams : [];
  const video = streams.find((s) => s.Type === 'Video');
  const videoCodec = typeof video?.Codec === 'string' ? video.Codec : undefined;
  const audioCodecs = streams
    .filter((s) => s.Type === 'Audio' && typeof s.Codec === 'string')
    .map((s) => String(s.Codec).toLowerCase());
  return {
    container: typeof source.Container === 'string' ? source.Container.toLowerCase() : undefined,
    videoCodec: typeof videoCodec === 'string' ? videoCodec.toLowerCase() : undefined,
    audioCodecs,
    width: typeof video?.Width === 'number' ? video.Width : undefined,
    height: typeof video?.Height === 'number' ? video.Height : undefined,
    aspectRatio: typeof video?.AspectRatio === 'string' ? video.AspectRatio : undefined,
    videoRange: typeof video?.VideoRange === 'string' ? video.VideoRange : undefined,
  };
}

/** Container/codec info of an item's first media source. */
function extractPlaybackInfo(item: any): MediaPlaybackInfo | undefined {
  return extractPlaybackInfoFromSource(item.MediaSources?.[0]);
}

/**
 * Lightweight liveness/auth check for a stored token (issue #16). A 24/7 box
 * that has sat idle for days may hold a token the server has since expired or
 * rotated. `GET /Users/Me` returns 200 for a valid token and 401 otherwise, so
 * this both proves the server is reachable and that the token still authorizes.
 * Resolves true on a clean success; resolves false ONLY when the server
 * definitively rejected the token (HTTP 401/403). Anything else — network
 * blip, timeout, 5xx — throws, so callers can tell "token is stale" apart from
 * "server unreachable" and never tear down a session over a transient failure
 * (issue #125).
 */
export async function validateToken(jellyfinUrl: string, token: string): Promise<boolean> {
  if (!jellyfinUrl || !token) return false;
  try {
    const url = jellyfinUrl.replace(/\/$/, "");
    await jellyfinRequest("GET", `${url}/Users/Me`, undefined, token);
    return true;
  } catch (e) {
    // Both transports surface HTTP failures as "HTTP error <status>: ..."
    // (browser fetch path below; Tauri jellyfin_request in src-tauri/lib.rs).
    const msg = e instanceof Error ? e.message : String(e);
    if (/^HTTP error (401|403):/.test(msg)) return false;
    throw e;
  }
}

async function jellyfinRequest(
  method: string,
  url: string,
  authHeader?: string,
  token?: string,
  body?: string
): Promise<string> {
  const hasTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
  if (hasTauri) {
    return await invoke<string>("jellyfin_request", {
      method,
      url,
      authHeader,
      token,
      body
    });
  } else {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (authHeader) {
      headers["X-Emby-Authorization"] = authHeader;
    }
    if (token) {
      headers["X-MediaBrowser-Token"] = token;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60-second timeout

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body || undefined,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error ${response.status}: ${text}`);
      }
      return await response.text();
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after 60 seconds`);
      }
      throw e;
    }
  }
}

export function normalizeUrl(url: string): string {
  let cleaned = (url || '').trim().replace(/\/$/, "");
  if (!cleaned) return '';
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `http://${cleaned}`;
  }
  return cleaned;
}

export async function authenticateUser(
  jellyfinUrl: string,
  username: string,
  password?: string
): Promise<{ accessToken: string; userId: string; userName: string }> {
  const url = normalizeUrl(jellyfinUrl);
  
  try {
    const responseStr = await jellyfinRequest(
      "POST",
      `${url}/Users/AuthenticateByName`,
      `MediaBrowser Client="Halcyon Video", Device="HTPC", DeviceId="halcyon-htpc-device", Version="0.1.0"`,
      undefined,
      JSON.stringify({
        Username: username,
        Pw: password || ""
      })
    );

    let authData;
    try {
      authData = JSON.parse(responseStr);
    } catch (e) {
      throw new Error(responseStr || "Authentication returned invalid response.");
    }

    if (!authData.AccessToken || !authData.User || !authData.User.Id) {
      throw new Error("Invalid response payload from Jellyfin server.");
    }

    return {
      accessToken: authData.AccessToken,
      userId: authData.User.Id,
      userName: authData.User.Name
    };
  } catch (error: any) {
    const msg = error?.message ?? (typeof error === 'string' ? error : String(error));
    throw new Error(msg || "Failed to authenticate with Jellyfin server.");
  }
}

/**
 * Hits Jellyfin's public user list (`/Users/Public`), the same endpoint
 * Jellyfin's own "select user" screen uses -- no auth required. Some
 * servers disable this endpoint (LDAP-only setups, admin lockdown, etc.);
 * callers should treat a thrown error or an empty array as "fall back to
 * the classic single-login form."
 */
export async function fetchPublicUsers(jellyfinUrl: string): Promise<PublicUser[]> {
  const url = normalizeUrl(jellyfinUrl);
  const responseStr = await jellyfinRequest("GET", `${url}/Users/Public`);

  let data: any;
  try {
    data = JSON.parse(responseStr);
  } catch (e) {
    throw new Error(responseStr || "Public user list returned an invalid response.");
  }

  if (!Array.isArray(data)) return [];
  return data
    .map((u: any) => ({
      id: u.Id as string,
      name: u.Name as string,
      hasPassword: !!u.HasPassword,
      primaryImageTag: u.PrimaryImageTag || undefined,
    }))
    .filter((u) => !!u.id && !!u.name);
}

/** Jellyfin avatar image URL for a public user, or null if they have none set. */
export function buildUserAvatarUrl(jellyfinUrl: string, userId: string, primaryImageTag?: string): string | null {
  if (!primaryImageTag) return null;
  const url = jellyfinUrl.replace(/\/$/, "");
  return `${url}/Users/${userId}/Images/Primary?tag=${encodeURIComponent(primaryImageTag)}&quality=90`;
}

function checkIs4k(item: any): boolean {
  if (item.Width && item.Width >= 3840) return true;
  if (item.Height && item.Height >= 2160) return true;

  if (item.MediaSources && Array.isArray(item.MediaSources)) {
    for (const source of item.MediaSources) {
      if (source.MediaStreams && Array.isArray(source.MediaStreams)) {
        for (const stream of source.MediaStreams) {
          if (stream.Type === 'Video') {
            if (stream.Width && stream.Width >= 3840) return true;
            if (stream.Height && stream.Height >= 2160) return true;
          }
        }
      }
    }
  }

  const title = item.Name || '';
  const path = item.Path || '';
  const regex = /\b(4k|2160p)\b/i;
  if (regex.test(title) || regex.test(path)) return true;

  return false;
}

// ─── Quality versions (4K / 1080p) ───────────────────────────────────────────

/** Human file size for version labels ("54.4 GB"). */
/** One MovieVersion per MediaSource of a catalog item (best-first sorting and
 *  the 2+-only pruning happen later, in finalizeVersions). Exported for unit
 *  tests only. */
export function buildItemVersions(item: any): MovieVersion[] {
  const sources: any[] = Array.isArray(item.MediaSources) && item.MediaSources.length > 0
    ? item.MediaSources
    : [null];
  return sources.map((source): MovieVersion => {
    const streams: any[] = Array.isArray(source?.MediaStreams) ? source.MediaStreams : [];
    const video = streams.find((s) => s.Type === "Video");
    // Item-level Width/Height only describe the DEFAULT source — never borrow
    // them for a sibling source of a merged item.
    const width: number | undefined =
      typeof video?.Width === "number" ? video.Width
      : (sources.length === 1 && typeof item.Width === "number" ? item.Width : undefined);
    const height: number | undefined =
      typeof video?.Height === "number" ? video.Height
      : (sources.length === 1 && typeof item.Height === "number" ? item.Height : undefined);
    const path: string = source?.Path || item.Path || "";
    const is4k = (width ?? 0) >= 3840 || (height ?? 0) >= 2160 || /\b(4k|2160p)\b/i.test(path);
    const tag = is4k ? "4K" : qualityTag(width, height);
    const range = typeof video?.VideoRange === "string" && /hdr|dovi|dolby/i.test(video.VideoRange) ? "HDR" : undefined;
    const codec = typeof video?.Codec === "string" ? video.Codec.toUpperCase() : undefined;
    const size = typeof source?.Size === "number" && source.Size > 0 ? formatBytes(source.Size) : undefined;
    const label =
      [tag, range, codec, size].filter(Boolean).join(" · ") ||
      source?.Name || "Original";
    return {
      itemId: item.Id,
      // MediaSourceId only matters (and only differs from the item id) on a
      // merged multi-source item — a single-source item streams by item id.
      mediaSourceId: sources.length > 1 && source?.Id ? source.Id : undefined,
      label,
      is4k,
      width,
      height,
      localPath: path || undefined,
      mediaStreams: extractStreamsFromSource(source),
      mediaPlaybackInfo: extractPlaybackInfoFromSource(source),
    };
  });
}

// Item types ingested as shelf titles. "Video" covers Jellyfin's
// generic-video classification (OVAs, one-off specials, home-video-ish rips,
// hard-to-categorize films — common in mixed libraries); those items render
// and play exactly like a Movie (poster + playback both key off item.Id).
// Standalone Episode items with no parent Series are deliberately NOT
// requested: pulling Episode recursively would download every episode of
// every series in the library just to keep the rare orphan.
const CATALOG_ITEM_TYPES = "Movie,Series,Video";

/**
 * Drop non-feature items from a catalog query and log what was skipped.
 * Jellyfin marks trailers/theme videos/other extras with a non-null ExtraType
 * (they also live under a parent's Special Features, but ExtraType is the
 * reliable flag on the item itself) — without this, adding "Video" to
 * IncludeItemTypes would put trailers on the shelves. Anything with an
 * unexpected Type is dropped too (defensive; the server-side IncludeItemTypes
 * filter should prevent it). The console.info summary makes future
 * missing-content gaps diagnosable from the log.
 */
function filterCatalogItems(items: any[], context: string): any[] {
  const skipped = new Map<string, number>();
  const kept = items.filter((item: any) => {
    let reason: string | null = null;
    if (item.ExtraType) {
      reason = `${item.Type || "Unknown"}/ExtraType=${item.ExtraType}`;
    } else if (item.Type !== "Movie" && item.Type !== "Series" && item.Type !== "Video") {
      reason = String(item.Type || "Unknown");
    }
    if (reason) {
      skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
      return false;
    }
    return true;
  });
  if (skipped.size > 0) {
    const parts = Array.from(skipped, ([k, n]) => `${n}x ${k}`).join(", ");
    console.info(`[Jellyfin] ${context}: skipped ${items.length - kept.length} item(s) by type: ${parts}`);
  }
  return kept;
}

// Page size for catalog Items queries (issue #124). With People + MediaSources
// in Fields, a whole-library response can run tens of megabytes, and a single
// JSON.parse of that stalls the main thread (boot-escape input, boot overlay)
// for hundreds of ms per library at every boot. Paging keeps each parse small,
// and the awaited network fetch between pages naturally yields the event loop
// back to input/paint — no worker or idle-callback machinery needed.
const CATALOG_PAGE_SIZE = 500;

/**
 * Fetch every item of a catalog Items query in CATALOG_PAGE_SIZE chunks.
 * `itemsUrl` must already carry its query string; StartIndex/Limit plus a
 * stable SortBy (required for consistent pagination — downstream re-sorts
 * anyway, see store-plan's shelfTitleCompare) are appended here. Throws on
 * an unparseable page; callers keep their existing error handling.
 */
// Liveness tap for the paged catalog walk. Every library sync fans out into
// many concurrent pagers, so "a page came back" is the only honest signal that
// the server is still answering -- a per-library tick would fire once for all
// of them and then go quiet for the whole long tail. Set for the duration of a
// sync by fetchJellyfinLibrariesAndMovies; concurrent pagers all feed the same
// listener, which is exactly the semantics a stall watchdog wants.
let pageProgressTick: (() => void) | null = null;

async function fetchItemsPaged(itemsUrl: string, token: string): Promise<any[]> {
  const items: any[] = [];
  for (;;) {
    const responseStr = await jellyfinRequest(
      "GET",
      `${itemsUrl}&SortBy=SortName&SortOrder=Ascending&StartIndex=${items.length}&Limit=${CATALOG_PAGE_SIZE}`,
      undefined,
      token
    );

    let pageData: any;
    try {
      pageData = JSON.parse(responseStr);
    } catch (e) {
      throw new Error(responseStr || "Jellyfin items API returned invalid response.");
    }

    const pageItems: any[] = pageData.Items || [];
    for (const item of pageItems) items.push(item);
    pageProgressTick?.();

    const total = typeof pageData.TotalRecordCount === "number" ? pageData.TotalRecordCount : items.length;
    // Empty-page guard keeps a server that under-reports pages from spinning forever.
    if (pageItems.length === 0 || items.length >= total) break;
  }
  return items;
}

export async function fetchMediaCatalog(
  jellyfinUrl: string,
  token: string,
  userId: string
): Promise<{ movies: Movie[] }> {
  if (!token || !jellyfinUrl || !userId) {
    throw new Error("Missing connection credentials.");
  }

  const url = jellyfinUrl.replace(/\/$/, "");
  console.log(`[Jellyfin] Attempting to connect to ${url} for user ${userId}...`);

  try {
    // Series are excluded here on purpose: this global fallback has no
    // per-library context, and the store's series flow (episode boxsets)
    // is driven by the per-library sync in fetchJellyfinLibrariesAndMovies.
    const rawItems = await fetchItemsPaged(
      `${url}/emby/Users/${userId}/Items?IncludeItemTypes=Movie,Video&Recursive=true&Fields=Path,Overview,Genres,ProductionYear,PremiereDate,RunTimeTicks,OfficialRating,DateCreated,Width,Height,MediaSources,CommunityRating,CriticRating,People,BackdropImageTags,Studios,PrimaryImageAspectRatio,ExtraType,ProviderIds,UserData`,
      token
    );
    const items = filterCatalogItems(rawItems, "global catalog");

    if (items.length === 0) {
      throw new Error("Connection succeeded, but no movies were found in your Jellyfin library.");
    }

    // Map Jellyfin items to our Movie model
    const movies: Movie[] = items.map((item: any) => {
      // Jellyfin duration is in ticks (1 tick = 10,000,000 second ticks)
      const ticks = item.RunTimeTicks || 0;
      const durationMin = Math.round(ticks / 10000000 / 60);
      
      return {
        id: item.Id,
        title: item.Name,
        year: item.ProductionYear || 2000,
        premiereDate: item.PremiereDate || undefined,
        duration: durationMin > 0 ? `${durationMin}m` : "N/A",
        rating: item.OfficialRating || "NR",
        overview: item.Overview || "No description available.",
        director: item.People?.find((p: any) => p.Type === "Director")?.Name || "Unknown Director",
        actors: (item.People || []).filter((p: any) => p.Type === "Actor" && p.Name).slice(0, 5).map((p: any) => p.Name),
        castPeople: (item.People || [])
          .filter((p: any) => p.Type === "Actor" && p.Name && p.Id)
          .slice(0, 5)
          .map((p: any) => ({
            id: p.Id,
            name: p.Name,
            imageUrl: p.PrimaryImageTag ? `${url}/emby/Items/${p.Id}/Images/Primary?api_key=${token}` : undefined,
          })),
        genres: item.Genres || [],
        localPath: item.Path || '',
        posterUrl: `${url}/emby/Items/${item.Id}/Images/Primary?api_key=${token}`,
        backdropUrl: item.BackdropImageTags && item.BackdropImageTags.length > 0 ? `${url}/emby/Items/${item.Id}/Images/Backdrop/0?api_key=${token}` : undefined,
        dateCreated: item.DateCreated || "",
        is4k: checkIs4k(item),
        communityRating: typeof item.CommunityRating === 'number' ? item.CommunityRating : undefined,
        criticRating: typeof item.CriticRating === 'number' ? item.CriticRating : undefined,
        studios: (item.Studios || []).map((s: any) => s.Name || s),
        mediaStreams: extractMediaStreams(item),
        mediaPlaybackInfo: extractPlaybackInfo(item),
        primaryImageAspectRatio: (typeof item.PrimaryImageAspectRatio === 'number' && item.PrimaryImageAspectRatio > 0) ? item.PrimaryImageAspectRatio : undefined,
        versions: buildItemVersions(item),
        tmdbId: extractTmdbId(item),
        runTimeTicks: item.RunTimeTicks || undefined,
        ...extractWatchState(item),
      };
    });
    const collapsedMovies = collapseDuplicateVersions(movies, "global catalog");

    console.log(`[Jellyfin] Successfully synced ${collapsedMovies.length} titles.`);
    return { movies: collapsedMovies };
  } catch (error: any) {
    console.error("[Jellyfin] Failed to sync metadata:", error);
    throw new Error(error.message || "Failed to connect to Jellyfin server.");
  }
}

/**
 * movieId -> collection (BoxSet) name for every collection the user can see.
 * Collections are native Jellyfin (created by hand or by the per-library
 * "Automatically add movies to collections" option); items don't carry their
 * membership in list queries, so each BoxSet's children are walked once here.
 * A movie in several collections keeps the first one seen — one shelf spot.
 */
async function fetchCollectionMembership(
  url: string,
  token: string,
  userId: string
): Promise<Map<string, string>> {
  const membership = new Map<string, string>();
  collectionArt.clear();
  collectionTmdbIds.clear();
  let rejected = 0;
  // ProviderIds carries TmdbCollection — the id of the collection on TMDB,
  // which is how fetchCollectionGaps learns the full member list (Jellyfin
  // only ever reports the members you already have).
  const boxSets = await fetchItemsPaged(
    `${url}/emby/Users/${userId}/Items?IncludeItemTypes=BoxSet&Recursive=true&Fields=ProviderIds`,
    token
  );
  await Promise.all(
    boxSets.map(async (set: any) => {
      if (!set?.Id || !set?.Name) return;
      const children = await fetchItemsPaged(
        `${url}/emby/Users/${userId}/Items?ParentId=${set.Id}&Recursive=true`,
        token
      );
      // Jellyfin auto-creates a BoxSet whenever ONE movie has two versions on
      // disk (a 1080p file and a 4K file), so a large share of "collections"
      // are really the same title twice. Count DISTINCT titles, not children,
      // and drop anything that isn't at least two genuinely different movies —
      // otherwise the store's collection displays fill with fake one-title sets.
      const distinctTitles = new Set<string>();
      for (const child of children) {
        if (!child?.Id) continue;
        distinctTitles.add(`${(child.Name || '').trim().toLowerCase()}|${child.ProductionYear ?? ''}`);
      }

      // Scraped sets carry TmdbCollection; hand-assembled ones carry nothing,
      // and those simply never show gaps (we can't know what "complete" means
      // for a collection the user invented).
      const providerIds = set.ProviderIds || {};
      const rawTmdb = providerIds.TmdbCollection ?? providerIds.tmdbcollection;
      const tmdbCollectionId = Number(rawTmdb);
      const scraped = Number.isFinite(tmdbCollectionId) && tmdbCollectionId > 0;

      // The version-pair heuristic below can't tell "one movie, two files"
      // from "a real collection you own one film of" — and the second is the
      // MOST incomplete a collection can be, exactly what gap cases exist to
      // show. A version pair carries the movie's own Tmdb id, never a
      // TmdbCollection one, so a scraped set is provably a real collection
      // and keeps its place no matter how little of it is on the shelf.
      if (distinctTitles.size < 2 && !scraped) { rejected++; return; }

      // A real collection carries its own artwork in Jellyfin — the signage
      // uses the backdrop as the card with the poster inset, so keep both.
      collectionArt.set(set.Name, {
        posterUrl: set.ImageTags?.Primary
          ? `${url}/emby/Items/${set.Id}/Images/Primary?api_key=${token}`
          : undefined,
        backdropUrl: set.BackdropImageTags && set.BackdropImageTags.length > 0
          ? `${url}/emby/Items/${set.Id}/Images/Backdrop/0?api_key=${token}`
          : undefined,
      });

      if (scraped) collectionTmdbIds.set(set.Name, tmdbCollectionId);

      for (const child of children) {
        if (child?.Id && !membership.has(child.Id)) membership.set(child.Id, set.Name);
      }
    })
  );
  if (rejected > 0) {
    console.log(`[Jellyfin] Ignored ${rejected} single-title BoxSet(s) (version pairs, not real collections).`);
  }
  collectionSyncStats.boxSets = boxSets.length;
  collectionSyncStats.scraped = collectionTmdbIds.size;
  collectionSyncStats.rejectedVersionPairs = rejected;
  return membership;
}

/**
 * TMDB id off a synced item's ProviderIds. Until this existed, `Movie.tmdbId`
 * was only ever set on titles synthesized FROM Jellyseerr — so nothing in the
 * library could be looked up on TMDB, which is what "films like this one" and
 * the collection-gap join both need. Absent for anything Jellyfin matched by
 * another provider (or not at all).
 */
function extractTmdbId(item: any): number | undefined {
  const raw = item?.ProviderIds?.Tmdb ?? item?.ProviderIds?.tmdb;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

/** This user's watch state off UserData (requested via Fields=UserData). */
function extractWatchState(
  item: any
): Pick<Movie, 'played' | 'playCount' | 'lastPlayedDate' | 'resumePositionTicks'> {
  const ud = item?.UserData;
  if (!ud) return {};
  return {
    played: ud.Played === true || undefined,
    playCount: typeof ud.PlayCount === 'number' && ud.PlayCount > 0 ? ud.PlayCount : undefined,
    lastPlayedDate: typeof ud.LastPlayedDate === 'string' && ud.LastPlayedDate ? ud.LastPlayedDate : undefined,
    resumePositionTicks:
      typeof ud.PlaybackPositionTicks === 'number' && ud.PlaybackPositionTicks > 0
        ? ud.PlaybackPositionTicks
        : undefined,
  };
}

/** Tag every synced movie with its collection name. Failure is non-fatal by
 *  design: the shelves simply stay plain-alphabetical without the tags. */
async function applyCollectionMembership(
  libraries: JellyfinLibrary[],
  url: string,
  token: string,
  userId: string
): Promise<void> {
  try {
    const membership = await fetchCollectionMembership(url, token, userId);
    if (membership.size === 0) return;
    let tagged = 0;
    for (const lib of libraries) {
      for (const m of lib.movies) {
        const name = membership.get(m.id);
        if (name) {
          m.collectionName = name;
          tagged++;
        }
      }
    }
    console.log(`[Jellyfin] Tagged ${tagged} titles from ${membership.size} collection memberships.`);
  } catch (err) {
    console.warn("[Jellyfin] Collection (BoxSet) sync failed — shelves stay alphabetical:", err);
  }
}

/**
 * The user's video-capable views: one Views call + the non-video blocklist,
 * shared by the full catalog sync below and the names-only listing the
 * first-run setup terminal shows (#41).
 *
 * The filter is a BLOCKLIST on purpose: mixed movies-and-shows libraries have
 * reported their CollectionType as "mixed", "unknown", "folders", or nothing
 * at all depending on server version, so allowlisting known values kept
 * dropping them (the "my mixed library never shows up" bug). Anything not
 * explicitly non-video is synced — an empty or non-video generic view
 * returns 0 Movie/Series/Video items in the item fetch and is discarded
 * harmlessly. Blocked: music, books, photos, playlists, livetv, trailers,
 * and boxsets (collections only duplicate items already synced from their
 * home libraries; membership is tagged via applyCollectionMembership).
 * Grouped-folder views report Type "UserView" rather than
 * "CollectionFolder", so both container types are accepted.
 */
async function fetchVideoViews(url: string, token: string, userId: string): Promise<any[]> {
  const viewsResponseStr = await jellyfinRequest(
    "GET",
    `${url}/emby/Users/${userId}/Views`,
    undefined,
    token
  );

  let viewsData;
  try {
    viewsData = JSON.parse(viewsResponseStr);
  } catch (e) {
    throw new Error(viewsResponseStr || "Jellyfin views API returned invalid response.");
  }

  const viewItems = viewsData.Items || [];
  const NON_VIDEO_COLLECTION_TYPES = new Set([
    "music", "books", "photos", "playlists", "livetv", "trailers", "boxsets",
  ]);
  return viewItems.filter((v: any) => {
    const keep =
      (v.Type === "CollectionFolder" || v.Type === "UserView") &&
      !NON_VIDEO_COLLECTION_TYPES.has(String(v.CollectionType ?? "").toLowerCase());
    // Always log the verdict per view — "why is my library missing?" should
    // be answerable from the console without a debugger.
    console.info(
      `[Jellyfin] View "${v.Name}" (Type=${v.Type}, CollectionType=${v.CollectionType ?? "none"}): ${keep ? "syncing" : "skipped (non-video)"}`
    );
    return keep;
  });
}

/**
 * Names-only library listing for the first-run setup terminal (#41): one
 * Views call, no item sync, so the checkbox screen can appear the moment a
 * member signs in — the expensive per-library item fetch then runs only for
 * the libraries the store actually carries.
 */
export async function fetchLibraryList(
  jellyfinUrl: string,
  token: string,
  userId: string
): Promise<LibrarySummary[]> {
  if (!token || !jellyfinUrl || !userId) {
    throw new Error("Missing connection credentials.");
  }
  const url = jellyfinUrl.replace(/\/$/, "");
  const views = await fetchVideoViews(url, token, userId);
  const list = views.map((v: any) => ({ id: String(v.Id), name: String(v.Name) }));
  rememberKnownLibraries(list);
  return list;
}

export async function fetchJellyfinLibrariesAndMovies(
  jellyfinUrl: string,
  token: string,
  userId: string,
  // Called at each milestone of the sync. Callers use it as a liveness signal:
  // a big library legitimately takes minutes, so a caller must be able to tell
  // "still working" from "server is gone" without a wall-clock deadline that
  // a large enough catalog can never beat.
  onProgress?: (stage: string) => void,
  opts?: {
    /**
     * Library ids this store does NOT carry (#41): their item sync is skipped
     * entirely, not fetched-and-hidden. Sourced from the Store Libraries
     * toggles (Settings → Connection / the setup terminal's checkbox rows).
     */
    excludeLibraryIds?: ReadonlySet<string>;
  }
): Promise<JellyfinLibrary[]> {
  if (!token || !jellyfinUrl || !userId) {
    throw new Error("Missing connection credentials.");
  }

  const url = jellyfinUrl.replace(/\/$/, "");
  console.log(`[Jellyfin] Querying user views (libraries) for user ${userId}...`);

  if (onProgress) pageProgressTick = () => onProgress('page');
  try {
    const allVideoViews = await fetchVideoViews(url, token, userId);
    // The full pre-exclusion list is remembered so the Store Libraries page
    // can keep offering excluded libraries for re-enabling (#41).
    rememberKnownLibraries(allVideoViews.map((v: any) => ({ id: String(v.Id), name: String(v.Name) })));
    const excluded = opts?.excludeLibraryIds;
    const movieLibraries = excluded?.size
      ? allVideoViews.filter((v: any) => {
          const skip = excluded.has(String(v.Id));
          if (skip) {
            console.info(
              `[Jellyfin] View "${v.Name}": skipped (not carried by this store — Settings → Connection → Store Libraries)`
            );
          }
          return !skip;
        })
      : allVideoViews;

    const librariesList: JellyfinLibrary[] = [];

    const libraryPromises = movieLibraries.map(async (lib: any) => {
      console.log(`[Jellyfin] Syncing catalog for library "${lib.Name}" (${lib.Id})...`);
      onProgress?.(`library "${lib.Name}"`);
      try {
        const rawItems = await fetchItemsPaged(
          `${url}/emby/Users/${userId}/Items?ParentId=${lib.Id}&IncludeItemTypes=${CATALOG_ITEM_TYPES}&Recursive=true&Fields=Path,Overview,Genres,ProductionYear,PremiereDate,RunTimeTicks,OfficialRating,DateCreated,Width,Height,MediaSources,CommunityRating,CriticRating,People,BackdropImageTags,Studios,PrimaryImageAspectRatio,ExtraType,ProviderIds,UserData`,
          token
        );
        const items = filterCatalogItems(rawItems, `library "${lib.Name}"`);
        if (items.length === 0) return null;

        const movies: Movie[] = items.map((item: any) => {
          const ticks = item.RunTimeTicks || 0;
          const durationMin = Math.round(ticks / 10000000 / 60);

          return {
            id: item.Id,
            title: item.Name,
            year: item.ProductionYear || 2000,
            premiereDate: item.PremiereDate || undefined,
            duration: item.Type === "Series" ? "Series" : (durationMin > 0 ? `${durationMin}m` : "N/A"),
            rating: item.OfficialRating || "NR",
            overview: item.Overview || "No description available.",
            director: item.People?.find((p: any) => p.Type === "Director")?.Name || "Unknown Director",
            actors: (item.People || []).filter((p: any) => p.Type === "Actor" && p.Name).slice(0, 5).map((p: any) => p.Name),
            castPeople: (item.People || [])
              .filter((p: any) => p.Type === "Actor" && p.Name && p.Id)
              .slice(0, 5)
              .map((p: any) => ({
                id: p.Id,
                name: p.Name,
                imageUrl: p.PrimaryImageTag ? `${url}/emby/Items/${p.Id}/Images/Primary?api_key=${token}` : undefined,
              })),
            genres: item.Genres || [],
            localPath: item.Path || '',
            posterUrl: `${url}/emby/Items/${item.Id}/Images/Primary?api_key=${token}`,
            backdropUrl: item.BackdropImageTags && item.BackdropImageTags.length > 0 ? `${url}/emby/Items/${item.Id}/Images/Backdrop/0?api_key=${token}` : undefined,
            dateCreated: item.DateCreated || "",
            isSeries: item.Type === "Series",
            is4k: checkIs4k(item),
            communityRating: typeof item.CommunityRating === 'number' ? item.CommunityRating : undefined,
            criticRating: typeof item.CriticRating === 'number' ? item.CriticRating : undefined,
            libraryName: lib.Name,
            studios: (item.Studios || []).map((s: any) => s.Name || s),
            mediaStreams: extractMediaStreams(item),
            mediaPlaybackInfo: extractPlaybackInfo(item),
            primaryImageAspectRatio: (typeof item.PrimaryImageAspectRatio === 'number' && item.PrimaryImageAspectRatio > 0) ? item.PrimaryImageAspectRatio : undefined,
            versions: item.Type === "Series" ? undefined : buildItemVersions(item),
            tmdbId: extractTmdbId(item),
            runTimeTicks: item.Type === "Series" ? undefined : (item.RunTimeTicks || undefined),
            ...extractWatchState(item),
          };
        });
        const collapsedMovies = collapseDuplicateVersions(movies, `library "${lib.Name}"`);

        // Extract unique genres inside this library
        const genresSet = new Set<string>();
        collapsedMovies.forEach(m => m.genres.forEach(g => genresSet.add(g)));
        const genres = Array.from(genresSet).sort();

        return {
          id: lib.Id,
          name: lib.Name,
          movies: collapsedMovies,
          genres
        };
      } catch (err) {
        console.error(`[Jellyfin] Failed to sync library "${lib.Name}":`, err);
        return null;
      }
    });

    const results = await Promise.all(libraryPromises);
    for (const res of results) {
      if (res) {
        librariesList.push(res);
      }
    }

    if (librariesList.length === 0) {
      // Fallback: fetch all media recursively if views are empty or not filtering properly
      console.log("[Jellyfin] No distinct movie libraries found. Falling back to global catalog sync.");
      const globalCatalog = await fetchMediaCatalog(jellyfinUrl, token, userId);
      if (globalCatalog.movies.length > 0) {
        const genresSet = new Set<string>();
        globalCatalog.movies.forEach(m => {
          m.libraryName = "Movies";
          m.genres.forEach(g => genresSet.add(g));
        });
        librariesList.push({
          id: "all_movies_fallback",
          name: "Movies",
          movies: globalCatalog.movies,
          genres: Array.from(genresSet).sort()
        });
      } else {
        throw new Error("No movies found in your Jellyfin libraries.");
      }
    }

    onProgress?.('collection membership');
    await applyCollectionMembership(librariesList, url, token, userId);

    onProgress?.('done');
    console.log(`[Jellyfin] Successfully mapped ${librariesList.length} libraries.`);
    return librariesList;
  } catch (error: any) {
    console.error("[Jellyfin] Failed to sync libraries and metadata:", error);
    const msg = error?.message ?? (typeof error === 'string' ? error : String(error));
    throw new Error(msg || "Failed to sync libraries from Jellyfin server.");
  } finally {
    pageProgressTick = null;
  }
}

export async function fetchFirstEpisodeOfSeries(
  jellyfinUrl: string,
  token: string,
  userId: string,
  seriesId: string
): Promise<{ id: string; path: string } | null> {
  const url = jellyfinUrl.replace(/\/$/, "");
  try {
    const responseStr = await jellyfinRequest(
      "GET",
      // Without an explicit sort this returned the server's default order, not
      // S01E01 — see the note in fetchSeriesEpisodes.
      `${url}/emby/Users/${userId}/Items?ParentId=${seriesId}&IncludeItemTypes=Episode&Recursive=true&SortBy=ParentIndexNumber,IndexNumber&SortOrder=Ascending&Limit=1`,
      undefined,
      token
    );
    const data = JSON.parse(responseStr);
    const item = data.Items?.[0];
    if (item) {
      return {
        id: item.Id,
        path: item.Path || ""
      };
    }
  } catch (e) {
    console.error(`[Jellyfin] Failed to fetch first episode for series ${seriesId}:`, e);
  }
  return null;
}

/**
 * Fetch all episodes for a TV series, ordered by season then episode number.
 * Used by the episode picker overlay.
 */
export async function fetchSeriesEpisodes(
  jellyfinUrl: string,
  token: string,
  userId: string,
  seriesId: string
): Promise<Episode[]> {
  const url = jellyfinUrl.replace(/\/$/, "");
  try {
    const responseStr = await jellyfinRequest(
      "GET",
      // SortBy=ParentIndexNumber,IndexNumber is season-then-episode ORDER.
      // SortName sorts lexically by episode TITLE, which scrambled the list:
      // the season panel's "first episode of season N" lookup, the episode
      // selector's index, and playback's up-next step all walk this array, so
      // they were all reading a mis-ordered series.
      `${url}/emby/Users/${userId}/Items?ParentId=${seriesId}&IncludeItemTypes=Episode&Recursive=true&Fields=Path,Overview,RunTimeTicks,PremiereDate,UserData&SortBy=ParentIndexNumber,IndexNumber&SortOrder=Ascending&Limit=500`,
      undefined,
      token
    );
    const data = JSON.parse(responseStr);
    let items: any[] = data.Items || [];
    // Media Release Date pin (#42): a series that premiered before the rolling
    // cutoff still shelves, but episodes that aired after it haven't happened
    // yet in the store's timeline — a 1996-pinned store must not list (or
    // play) a 1998 season. Undated episodes stay, same rule as the catalog.
    const mediaCutoff = activeMediaCutoff();
    if (mediaCutoff) {
      items = items.filter((item) =>
        titleReleasedBy({ premiereDate: item.PremiereDate || undefined }, mediaCutoff));
    }
    return items.map((item) => ({
      id: item.Id,
      seriesId,
      seriesName: item.SeriesName || "",
      seasonNumber: item.ParentIndexNumber || 0,
      episodeNumber: item.IndexNumber || 0,
      name: item.Name || "",
      overview: item.Overview || "",
      path: item.Path || "",
      runTimeTicks: item.RunTimeTicks || 0,
      resumePositionTicks:
        typeof item.UserData?.PlaybackPositionTicks === 'number' && item.UserData.PlaybackPositionTicks > 0
          ? item.UserData.PlaybackPositionTicks
          : undefined,
      // Episode "still" — the Primary image on an Episode item. Sized down for
      // the on-box thumbnail; falls back to a placeholder if the load 404s.
      thumbUrl: `${url}/emby/Items/${item.Id}/Images/Primary?api_key=${token}&maxWidth=400`,
      // Season this episode belongs to. Jellyfin Episode items carry SeasonId;
      // its Primary image is the season POSTER (2:3), used for the season chip.
      seasonId: item.SeasonId,
      seasonPrimaryUrl: item.SeasonId
        ? `${url}/emby/Items/${item.SeasonId}/Images/Primary?api_key=${token}&maxWidth=400`
        : undefined
    }));
  } catch (e) {
    console.error(`[Jellyfin] Failed to fetch episodes for series ${seriesId}:`, e);
    return [];
  }
}

// ─── Playback Reporting ───────────────────────────────────────────────────────

const JELLYFIN_DEVICE_ID = 'halcyon-htpc-device';
const PLAYBACK_CLIENT = `MediaBrowser Client="Halcyon Video", Device="HTPC", DeviceId="${JELLYFIN_DEVICE_ID}", Version="0.1.0"`;

/**
 * Report playback start to Jellyfin.
 * This lets the server track what's playing and update "Continue Watching".
 */
export async function reportPlaybackStart(
  jellyfinUrl: string,
  token: string,
  itemId: string
): Promise<void> {
  const url = jellyfinUrl.replace(/\/$/, "");
  try {
    await jellyfinRequest(
      "POST",
      `${url}/Sessions/Playing`,
      PLAYBACK_CLIENT,
      token,
      JSON.stringify({ ItemId: itemId, CanSeek: false, IsPaused: false, IsMuted: false })
    );
    console.log(`[Jellyfin] Playback start reported for item ${itemId}`);
  } catch (e) {
    console.warn("[Jellyfin] Failed to report playback start:", e);
  }
}

/**
 * Report playback stopped to Jellyfin (mark as watched when positionTicks near end).
 */
export async function reportPlaybackStopped(
  jellyfinUrl: string,
  token: string,
  itemId: string,
  positionTicks: number = 0
): Promise<void> {
  const url = jellyfinUrl.replace(/\/$/, "");
  try {
    await jellyfinRequest(
      "POST",
      `${url}/Sessions/Playing/Stopped`,
      PLAYBACK_CLIENT,
      token,
      JSON.stringify({ ItemId: itemId, PositionTicks: positionTicks })
    );
    console.log(`[Jellyfin] Playback stopped reported for item ${itemId} at tick ${positionTicks}`);
  } catch (e) {
    console.warn("[Jellyfin] Failed to report playback stopped:", e);
  }
}

/**
 * Report ongoing playback position to Jellyfin (drives the "Continue Watching"
 * progress bar). Call this periodically and on pause/seek while the in-app
 * player is running.
 */
export async function reportPlaybackProgress(
  jellyfinUrl: string,
  token: string,
  itemId: string,
  positionTicks: number,
  isPaused: boolean
): Promise<void> {
  const url = jellyfinUrl.replace(/\/$/, "");
  try {
    await jellyfinRequest(
      "POST",
      `${url}/Sessions/Playing/Progress`,
      PLAYBACK_CLIENT,
      token,
      JSON.stringify({ ItemId: itemId, PositionTicks: positionTicks, IsPaused: isPaused, CanSeek: true })
    );
  } catch (e) {
    console.warn("[Jellyfin] Failed to report playback progress:", e);
  }
}

/**
 * Tell Jellyfin to stop transcoding a session immediately rather than
 * waiting for its idle timeout. Call this right before abandoning an HLS
 * stream for a rebuilt one (seek, quality/track change) so the old ffmpeg
 * process isn't left encoding a stream nobody is reading anymore.
 *
 * Unlike its siblings above this takes only the PlaySessionId: it's called
 * directly from VideoPlayer (which only ever sees stream URLs, not the
 * jellyfinUrl/token main.ts holds), so it reads the same localStorage keys
 * main.ts persists them under instead of threading them through every
 * caller.
 */
export async function stopActiveEncoding(playSessionId: string, log?: (msg: string) => void): Promise<void> {
  const jellyfinUrl = localStorage.getItem("jellyfin_url");
  const token = localStorage.getItem("jellyfin_token");
  if (!jellyfinUrl || !token) return;
  const url = jellyfinUrl.replace(/\/$/, "");
  try {
    await jellyfinRequest(
      "DELETE",
      `${url}/Videos/ActiveEncodings?deviceId=${encodeURIComponent(JELLYFIN_DEVICE_ID)}&playSessionId=${encodeURIComponent(playSessionId)}`,
      PLAYBACK_CLIENT,
      token
    );
  } catch (e: any) {
    console.warn("[Jellyfin] Failed to stop active encoding:", e);
    // Only surfaced to the in-app console on failure, per the caller's
    // narration contract — the message already carries "HTTP error <status>".
    log?.(`[Player] stopActiveEncoding failed: ${e?.message ?? e}`);
  }
}

/**
 * On-demand MediaSources probe for an item whose playback info isn't already
 * held in memory. TV episodes are the case in practice: fetchSeriesEpisodes /
 * fetchFirstEpisodeOfSeries never request MediaSources (a series can have
 * hundreds of episodes, and the episode picker never needs codec info), so
 * launchVideoPlayback calls this for the one episode it's about to play,
 * right before opening the player. Returns undefined on any failure —
 * isDirectPlaySafe treats that as not-safe, defaulting to HLS (audio always
 * works there) rather than risking WebKitGTK's silent audio drop.
 */
export async function fetchItemPlaybackInfo(
  jellyfinUrl: string,
  token: string,
  userId: string,
  itemId: string
): Promise<MediaPlaybackInfo | undefined> {
  const url = jellyfinUrl.replace(/\/$/, "");
  try {
    const responseStr = await jellyfinRequest(
      "GET",
      `${url}/emby/Users/${userId}/Items/${itemId}?Fields=MediaSources`,
      undefined,
      token
    );
    const item = JSON.parse(responseStr);
    return extractPlaybackInfo(item);
  } catch (e) {
    console.error(`[Jellyfin] Failed to probe media info for item ${itemId}:`, e);
    return undefined;
  }
}

// ─── Streaming URLs ───────────────────────────────────────────────────────────

/**
 * Direct ("static") stream of the original file. Plays only if the in-app
 * webview can natively decode the container/codecs (e.g. H.264/AAC MP4).
 * Used as a fallback when transcoded HLS is unavailable.
 */
export function buildStaticStreamUrl(jellyfinUrl: string, token: string, itemId: string, mediaSourceId?: string): string {
  const url = jellyfinUrl.replace(/\/$/, "");
  const sourceParam = mediaSourceId ? `&MediaSourceId=${encodeURIComponent(mediaSourceId)}` : "";
  return `${url}/Videos/${itemId}/stream?static=true&api_key=${encodeURIComponent(token)}${sourceParam}`;
}

/**
 * WebVTT sidecar for one subtitle stream, for a <track> on the <video>.
 * Jellyfin converts SRT/ASS/SSA to VTT on the fly here — styling and
 * positioning are flattened, which is the trade for not re-encoding the film.
 */
export function buildSubtitleTrackUrl(
  jellyfinUrl: string,
  token: string,
  itemId: string,
  streamIndex: number,
  mediaSourceId?: string,
): string {
  const url = jellyfinUrl.replace(/\/$/, '');
  const source = mediaSourceId ?? itemId;
  return `${url}/Videos/${itemId}/${encodeURIComponent(source)}/Subtitles/${streamIndex}/0/Stream.vtt`
       + `?api_key=${encodeURIComponent(token)}`;
}

// PlaySessionId baked into the most recently built HLS URL. Exposed via
// getLastHlsPlaySessionId() so a caller that only has the URL (the player's
// buildStream callback returns a plain string) can still learn which session
// to tear down with stopActiveEncoding() before rebuilding it.
let lastHlsPlaySessionId: string | undefined;

export function getLastHlsPlaySessionId(): string | undefined {
  return lastHlsPlaySessionId;
}

/**
 * HLS master playlist that asks Jellyfin to transcode (when needed) to
 * H.264/AAC — a format the in-app player can always handle. This is what makes
 * "any format in the library" play inside the app, the way a streaming service
 * does, instead of shelling out to an external player. When the webview can
 * decode HEVC, the request also allows hevc so HEVC sources are stream-copied
 * (remuxed into fMP4 segments) rather than re-encoded to H.264.
 */
export function buildHlsStreamUrl(jellyfinUrl: string, token: string, itemId: string, opts?: HlsStreamOptions): string {
  const url = jellyfinUrl.replace(/\/$/, "");
  const playSessionId = `${itemId}-${Date.now()}`;
  lastHlsPlaySessionId = playSessionId;
  // HEVC pass-through only when the SOURCE is HEVC and the webview decodes
  // it. HEVC needs fMP4 segments (WebKit's MSE takes them without
  // transmuxing); everything else stays on the battle-tested TS path — fMP4
  // also trips a Jellyfin bug where the init-segment URL inherits
  // StartTimeTicks and 500s (see the loader workaround in video-player.ts),
  // so its blast radius is kept to the files that need it.
  const hevcCopy =
    isHevcPassThroughEnabled() &&
    (opts?.sourceVideoCodec === "hevc" || opts?.sourceVideoCodec === "h265");
  const segmentContainer = hevcCopy ? "mp4" : "ts";
  const params = new URLSearchParams({
    api_key: token,
    MediaSourceId: opts?.mediaSourceId ?? itemId,
    DeviceId: JELLYFIN_DEVICE_ID,
    PlaySessionId: playSessionId,
    VideoCodec: hevcCopy ? "h264,hevc" : "h264",
    AudioCodec: "aac,mp3",
    // An explicit picker preset always wins (the user asked to cap quality).
    // Otherwise a copy-eligible source gets the high ceiling so Jellyfin
    // stream-copies it instead of re-encoding down to DEFAULT_VIDEO_BITRATE.
    VideoBitrate: String(opts?.maxBitrate ?? (hevcCopy ? COPY_VIDEO_BITRATE : DEFAULT_VIDEO_BITRATE)),
    AudioBitrate: "192000",
    MaxAudioChannels: "2",
    TranscodingMaxAudioChannels: "2",
    TranscodingProtocol: "hls",
    TranscodingContainer: segmentContainer,
    SegmentContainer: segmentContainer,
    MinSegments: "1",
    BreakOnNonKeyFrames: "true",
  });
  // 10-bit HEVC can't be copied to a webview that only decodes Main — force
  // those back to the h264 transcode rather than hand MSE undecodable video.
  if (hevcCopy && !isHevcMain10Supported()) params.set("MaxVideoBitDepth", "8");
  if (opts?.maxWidth) params.set("MaxWidth", String(opts.maxWidth));
  if (opts?.startPositionTicks) params.set("StartTimeTicks", String(opts.startPositionTicks));
  if (opts?.audioStreamIndex !== undefined) params.set("AudioStreamIndex", String(opts.audioStreamIndex));
  if (opts?.subtitleStreamIndex !== undefined) {
    // Encode (burn-in) is the one delivery method guaranteed to render on the
    // transcode path (pixels are baked in, container-agnostic) — no VTT
    // sidecar/textTracks wiring required. Burn-in forces the server to
    // re-encode video even when it could otherwise stream-copy.
    params.set("SubtitleStreamIndex", String(opts.subtitleStreamIndex));
    params.set("SubtitleMethod", "Encode");
  }
  return `${url}/Videos/${itemId}/master.m3u8?${params.toString()}`;
}

/**
 * Whether an HLS URL was built to let the server STREAM-COPY the video, i.e.
 * it may carry a full-bitrate 4K remux (~94 Mbps) rather than a stream capped
 * at DEFAULT_VIDEO_BITRATE. The player uses this to pick a buffer profile that
 * keeps such a stream inside the webview's SourceBuffer budget.
 */
export function isStreamCopyUrl(src: string): boolean {
  try {
    const v = new URL(src, "http://x").searchParams.get("VideoBitrate");
    return v !== null && Number(v) >= COPY_VIDEO_BITRATE;
  } catch {
    return false;
  }
}


// ─── Backend registration ─────────────────────────────────────────────────────

/**
 * The Jellyfin implementation of MediaBackend. Everything above is the
 * implementation; this object is only the wiring, so the free functions stay
 * directly callable (and unit-testable) exactly as they were.
 */
export const jellyfinBackend: MediaBackend = {
  kind: 'jellyfin',
  label: 'Jellyfin',

  normalizeUrl,
  async identify(rawUrl: string): Promise<boolean> {
    // /System/Info/Public is Jellyfin's unauthenticated "who am I" endpoint.
    // Emby answers it too and reports its own ProductName; the store has never
    // been tested against Emby, so only a self-declared Jellyfin counts here
    // rather than quietly treating one server as the other.
    try {
      const url = normalizeUrl(rawUrl);
      const body = await jellyfinRequest('GET', `${url}/System/Info/Public`);
      const info = JSON.parse(body);
      return /jellyfin/i.test(String(info?.ProductName ?? ''));
    } catch {
      return false;
    }
  },

  validateToken,
  authenticateUser,
  fetchPublicUsers: (url: string) => fetchPublicUsers(url),
  buildUserAvatarUrl: (url: string, user: PublicUser) =>
    buildUserAvatarUrl(url, user.id, user.primaryImageTag),
  // Jellyfin has no card-to-session switch: picking a card just pre-fills the
  // name on the same AuthenticateByName call the manual form makes.
  signInAsPublicUser: (url: string, user: PublicUser, secret?: string) =>
    authenticateUser(url, user.name, secret),

  fetchLibraryList,
  fetchLibrariesAndMovies: fetchJellyfinLibrariesAndMovies,

  fetchSeriesEpisodes,
  fetchFirstEpisodeOfSeries,

  subtitleDelivery: pickSubtitleDelivery,
  buildSubtitleTrackUrl,

  fetchItemPlaybackInfo,
  buildStaticStreamUrl,
  buildHlsStreamUrl,
  lastHlsPlaySessionId: getLastHlsPlaySessionId,
  stopActiveEncoding,
  isStreamCopyUrl,

  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackStopped,
};
