// T18: Romm integration -- an optional video-game data source layered next to
// the Jellyfin movie catalog. Romm (https://github.com/rommapp/romm) is a
// self-hosted ROM manager with a REST API (`/api/platforms`, `/api/roms`).
// Mirrors the Jellyseerr module's shape (jellyseerr.ts): if a Romm server
// isn't configured every export here is a no-op / returns [], so callers never
// branch on whether the feature is enabled and the game section simply never
// builds (zero requests, zero cost) when unconfigured.
//
// Config (all optional, persisted to localStorage like the Jellyseerr fields):
//   romm_url         base URL of the Romm server, e.g. http://192.168.1.50:8080
//   romm_apikey      credentials. "username:password" -> HTTP Basic auth
//                    (Romm's documented API auth); anything else -> Bearer token.
//   romm_launch_cmd  (Tauri only) emulator command template renting a game
//                    shells out to, e.g. "es-de --start-game {path}" or
//                    "retroarch -L {core} {path}". {path} is substituted as a
//                    single argv element (never a shell string) -- see launchGame.
//   romm_path_prefix (Tauri only) local filesystem prefix prepended to the
//                    rom's server-relative path so {path} resolves on this host.
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Movie } from './jellyfin';
import { operatorDefault } from './operator-defaults';
import { isGamesOnly } from './games-only';
import { isPlatformEnabled } from './game-platforms';
import { fetchGamesFromSnapshot } from './games-snapshot';

export { isPlatformEnabled };

export interface RommConfig {
  url: string;
  apiKey: string;
  /**
   * Operator-managed (GH #129): the key lives on the SERVER and /dev-proxy
   * attaches it host-side, so `apiKey` is empty here on purpose and every
   * request must go out with NO auth header — sending an empty one would look
   * like a client credential and stop the proxy substituting the real one.
   */
  viaOperator?: boolean;
}

// Overall cap on how many games the section carries (see the ticket's texture
// budget note): games share the movie poster queue, so bound the count so game
// covers never starve the library's own shelves. Sized to the department's
// actual slot count — the full-store 2×2 department is 4 single-sided units
// x 48 slots (4 shelves x 12 cols, see game-section.ts/gameSectionPlacements)
// — so a well-stocked Romm fills every shelf.
const GAME_SECTION_CAP = 192;
// Per-platform ceiling so one huge platform can't consume the whole budget
// (96 = one full unit). The actual per-platform request size is an even split
// of the section cap across enabled platforms, computed in fetchGames().
const PER_PLATFORM_CAP = 96;
// How many roms to REQUEST per platform (name order — the only order_by every
// Romm version supports). Larger than the shelf budget on purpose: the shelf
// keeps the top-RATED slice, and rating can't be ordered server-side, so an
// alphabetical fetch capped at the shelf size would shelve "the first N by
// name" instead of the platform's most popular games.
const PER_PLATFORM_FETCH = 500;
// GAMES ONLY (games-only.ts): the games have the whole floor plan, so there is
// no budget to split — every rom of every platform gets a shelf. The request
// limit is a sanity ceiling on a single response, not a shelf budget; a
// platform with more roms than this is fetched in pages (see fetchPlatformRoms).
const FULL_LIBRARY_PAGE = 2000;

export function getRommConfig(): RommConfig | null {
  const url = (typeof localStorage !== 'undefined' ? localStorage.getItem('romm_url') : null) || (typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_ROMM_URL : null);
  const apiKey = (typeof localStorage !== 'undefined' ? localStorage.getItem('romm_apikey') : null) || (typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_ROMM_APIKEY : null);
  if (url && apiKey) return { url: url.replace(/\/$/, ''), apiKey };
  // Third tier (GH #129): this server's operator configured a Romm for
  // everyone and kept the key host-side. Only consulted when the visitor has
  // no complete config of their own — someone who typed their own address and
  // key is pointed at THEIR server, not the operator's.
  const operator = operatorDefault('romm');
  if (operator && !url) return { url: operator.url, apiKey: '', viaOperator: true };
  return null;
}

// Build the HTTP Authorization header for a Romm request. Romm's API accepts
// HTTP Basic auth (username:password); if the configured key isn't a
// user:password pair we fall back to a Bearer token.
export function authHeader(config: RommConfig): string {
  if (config.apiKey.includes(':')) {
    return `Basic ${btoa(config.apiKey)}`;
  }
  return `Bearer ${config.apiKey}`;
}

// Per-request ceiling for the browser transport. The default suits the
// department's small, budgeted queries. WHOLE-LIBRARY requests need far more,
// and not because any one of them is slow: fetchGames fires every platform
// CONCURRENTLY, so a full-library boot hands Romm ~19 simultaneous
// fetch-everything queries and they all queue behind each other server-side.
// Measured on a 7.1k-rom library, nine of nineteen platforms — including
// one-rom platforms, so this is queueing, not payload size — blew the 20s
// budget, got aborted, and silently vanished from the store: 5217 of 7110 games
// shelved with nothing in the UI to say why.
const REQUEST_TIMEOUT_MS = 20_000;
const FULL_LIBRARY_TIMEOUT_MS = 180_000;

// Mirrors jellyseerr.ts's transport: Tauri invoke when running inside the app
// shell (so CORS never applies and the request runs on the host, not the
// sandboxed webview), plain fetch with a timeout otherwise.
async function rommRequest(
  config: RommConfig,
  path: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<any> {
  const url = `${config.url}${path}`;
  const hasTauri =
    typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

  let responseStr: string;
  if (hasTauri) {
    responseStr = await invoke<string>('romm_request', {
      method: 'GET',
      url,
      authHeader: authHeader(config),
      body: undefined,
    });
  } else {
    // Browser build: same CORS wall as jellyseerr.ts — the Authorization
    // header triggers a preflight Romm never answers, so route through the
    // vite dev/preview server's /dev-proxy middleware (vite.config.ts).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('/dev-proxy', {
        method: 'GET',
        headers: {
          'X-Proxy-Target': url,
          // Operator-managed: no Authorization at all, and the proxy supplies
          // the operator's (GH #129).
          ...(config.viaOperator ? {} : { Authorization: authHeader(config) }),
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error ${response.status}: ${text}`);
      }
      responseStr = await response.text();
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') throw new Error(`Request to ${url} timed out.`);
      throw e;
    }
  }

  try {
    return JSON.parse(responseStr);
  } catch {
    throw new Error(responseStr || 'Romm returned an invalid response.');
  }
}

interface RommPlatform {
  id: number;
  name: string;
  slug: string;
  romCount: number;
}

// Friendly, era-appropriate section label for a Romm platform (matches the
// signboards a real rental game wall carried). Falls back to the platform's
// own name for anything not in the map so unknown systems still get a sign.
function platformLabel(name: string, slug: string): string {
  const key = `${slug} ${name}`.toLowerCase();

  // Word-boundary matching matters here: a bare substring test for 'nes'
  // also matches "genesis" and "nintendo entertainment"-less names, which
  // mislabels whole platforms and makes them leak through (or vanish from)
  // the platform toggles.
  // Super Famicom BEFORE Snes: the Japanese carton is a different object, not a
  // regional label on the same one. An SFC box is tall and narrow (~10.7 x 19.1
  // cm, 0.56) where the NA Snes box is wide (7.5 x 5.25 in, 1.43), and their
  // scans match those shapes — 0.553 vs 1.368 measured on this library. Sharing
  // one label stretched every SFC cover 2.6x across a landscape face.
  if (/\bsfam\b|\bsfc\b|super\s*famicom/.test(key)) {
    return 'SUPER FAMICOM';
  }
  if (/\bsnes\b|super\s*nintendo/.test(key)) {
    return 'SNES';
  }
  if (/\bnes\b|famicom|famicon|nintendo entertainment|\bfc\b/.test(key)) {
    return 'NES';
  }

  const rules: [RegExp, string][] = [
    [/n64|nintendo[-\s]?64/, 'NINTENDO 64'],
    [/\b3ds\b|nintendo[-\s]?3ds/, 'NINTENDO 3DS'],
    [/gamecube|ngc|\bgc\b/, 'GAMECUBE'],
    [/wii[-\s]?u/, 'WII U'],
    [/\bswitch\b/, 'NINTENDO SWITCH'],
    [/\bdsi\b/, 'NINTENDO DSI'],
    [/\bxbox\b/, 'XBOX'],
    [/genesis|mega[-\s]?drive|megadrive/, 'GENESIS'],
    [/sega[-\s]?cd|segacd/, 'SEGA CD'],
    [/saturn/, 'SEGA SATURN'],
    [/dreamcast/, 'DREAMCAST'],
    [/master[-\s]?system/, 'SEGA MASTER SYSTEM'],
    [/\bpsp\b|playstation[-\s]?portable/, 'PSP'],
    [/\bps2\b|playstation[-\s]?2/, 'PLAYSTATION 2'],
    [/\bpsx\b|\bps1\b|\bps\b|playstation/, 'PLAYSTATION'],
    [/game[-\s]?boy[-\s]?advance|\bgba\b/, 'GAME BOY ADVANCE'],
    [/game[-\s]?boy[-\s]?color|\bgbc\b/, 'GAME BOY COLOR'],
    [/game[-\s]?boy|\bgb\b/, 'GAME BOY'],
    [/arcade|mame|neo[-\s]?geo/, 'ARCADE'],
    [/atari/, 'ATARI'],
    [/turbo[-\s]?grafx|pc[-\s]?engine/, 'TURBOGRAFX-16'],
  ];
  for (const [re, label] of rules) if (re.test(key)) return label;
  return name.toUpperCase();
}

// Resolve a Romm rom's cover art to a URL the poster pipeline can fetch.
// Romm exposes covers as either a full url (`url_cover`) or a
// server-relative resource path (`path_cover_l`/`path_cover_s`).
//
// In the browser build the absolute URL is useless as-is: neither Romm nor
// the IGDB image CDN answers CORS, so the poster worker's fetch dies before
// it leaves the browser — the game shelves sit artless. Same wall as the API
// (see rommRequest), same cure: wrap the target into a /dev-proxy marker the
// poster worker unwraps into a header-addressed same-origin request. The
// Authorization header rides along only for the Romm server's own resources
// (newer Romm builds gate /assets behind auth) — never for third-party hosts.
function coverUrl(config: RommConfig, rom: any, platformId?: number): string | undefined {
  // Prefer art Romm already has ON DISK over the third-party link it recorded.
  // Two reasons: the local copy needs no external service, and the url_cover
  // links carry Romm's SHARED ScreenScraper developer key — measured 2026-07-28,
  // that key is rejected ("Erreur de login : Verifier vos identifiants
  // developpeur"), so every one of those links returns a 59-byte error page
  // instead of a cover. Romm records the local path in path_cover_* when it has
  // one; when it doesn't, the file is still on disk under the documented
  // resources layout, so derive it from the platform + rom id.
  const recorded: string | undefined =
    rom.path_cover_l || rom.path_cover_large || rom.path_cover_s;
  const derived =
    !recorded && typeof platformId === 'number' && rom.id !== undefined
      ? `/assets/romm/resources/roms/${platformId}/${rom.id}/cover/big.png`
      : undefined;
  const raw = recorded || derived;
  const remote: string | undefined =
    typeof rom.url_cover === 'string' && rom.url_cover ? rom.url_cover : undefined;
  if (!raw && !remote) return undefined;

  const absolutize = (u: string): string =>
    /^https?:\/\//.test(u) ? u
      : u.startsWith('/') ? `${config.url}${u}`
      : `${config.url}/assets/romm/resources/${u}`;

  const primary = raw ? absolutize(raw) : absolutize(remote!);
  const fallback = raw && remote ? remote : undefined;

  const hasTauri =
    typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
  if (hasTauri) return primary; // no vite middleware in the Tauri shell

  // The poster worker unwraps this marker into header-addressed same-origin
  // requests (poster-worker.ts) and falls back to `alt` if the primary 404s or
  // comes back as something that isn't an image.
  // No `auth=` in operator-managed mode: the marker carries no credential and
  // the proxy attaches the operator's (GH #129). The unwrappers already treat a
  // missing `auth` as "send none" (poster-worker.ts, game-case-art.ts).
  const auth = primary.startsWith(config.url) && !config.viaOperator
    ? `&auth=${encodeURIComponent(authHeader(config))}` : '';
  const alt = fallback ? `&alt=${encodeURIComponent(fallback)}` : '';
  return `/dev-proxy?art=${encodeURIComponent(primary)}${auth}${alt}`;
}

// ── Flat scan art beyond the front cover ────────────────────────────────────
// A full box scan is five surfaces, and until the 2026-07-28 re-scrape the
// library only ever had one of them. These are the other three:
//
//   box2d_back  the flat BACK panel      -> the case's rear face
//   box2d_side  the SPINE (narrow strip) -> the case's -X face
//   physical    the disc / cart LABEL    -> visible through a jewel case lid
//
// Resolution differs from coverUrl() in one deliberate way: there is NO remote
// fallback. The ss_metadata `*_url` links carry Romm's SHARED ScreenScraper
// developer key, which is rejected (measured 2026-07-28, see coverUrl) — an
// `alt=` on these would only paint a 59-byte error page onto a case face,
// which is strictly worse than leaving the face blank. So: disk or nothing.
//
// Romm records `box2d_back_path` and `physical_path` but has no
// `box2d_side_path` key at all, even when the spine file is on disk — so the
// spine is derived from the documented resources layout and gated on its
// `_url` sibling instead.
export interface GameArtUrls {
  back?: string;
  spine?: string;
  label?: string;
}

const GAME_ART_MEDIA: ReadonlyArray<{ key: keyof GameArtUrls; media: string }> = [
  { key: 'back', media: 'box2d_back' },
  { key: 'spine', media: 'box2d_side' },
  { key: 'label', media: 'physical' },
];

function gameArtUrls(config: RommConfig, rom: any, platformId?: number): GameArtUrls | undefined {
  const ss = rom.ss_metadata;
  if (!ss || typeof ss !== 'object') return undefined;
  const hasTauri =
    typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

  const out: GameArtUrls = {};
  for (const { key, media } of GAME_ART_MEDIA) {
    const recorded: string | undefined = ss[`${media}_path`];
    // No recorded path: only derive when ScreenScraper reported the medium at
    // all, so a library that never scraped it doesn't cost one 404 per case.
    const derivable = !recorded && !!ss[`${media}_url`]
      && typeof platformId === 'number' && rom.id !== undefined;
    if (!recorded && !derivable) continue;
    const raw = recorded || `roms/${platformId}/${rom.id}/${media}/${media}.png`;
    const abs = /^https?:\/\//.test(raw) ? raw
      : raw.startsWith('/') ? `${config.url}${raw}`
      : `${config.url}/assets/romm/resources/${raw}`;
    out[key] = hasTauri
      ? abs
      : `/dev-proxy?art=${encodeURIComponent(abs)}`
        + (config.viaOperator ? '' : `&auth=${encodeURIComponent(authHeader(config))}`);
  }
  return out.back || out.spine || out.label ? out : undefined;
}

// How many discs is this title, judged from filenames: Romm shelves each disc
// as its own rom, so FF IX is four single-file rows tied together by
// `sibling_roms`. Counting DISTINCT disc numbers across self + siblings (not
// sibling count + 1) is what makes revision noise harmless — a `(Rev 1)`
// sibling of the same disc carries the same disc number and collapses.
// A rom with no disc tag of its own returns undefined (single disc / cart);
// so do CD-era singles, which is why the tag on the rom itself is the gate.
const DISC_TAG = /\((?:disc|cd) ?(\d+)\)/i;

function discCountFrom(rom: any): number | undefined {
  const own = DISC_TAG.exec(rom.fs_name || '');
  if (!own) return undefined;
  const nums = new Set<string>([own[1]]);
  for (const sib of rom.sibling_roms || []) {
    const m = DISC_TAG.exec(sib?.fs_name_no_ext || '');
    if (m) nums.add(m[1]);
  }
  return nums.size >= 2 ? nums.size : undefined;
}

// Does another rom in this rom's sibling group FRONT the shared case? A
// multi-disc title is ONE retail case holding every disc (owner's call,
// 2026-07-28) — so exactly one of its disc-roms may shelve, wearing the fat
// box and discCount. The elected fronter is the lowest disc number, rom id
// as the tiebreak (two revisions of the same disc carry the same number).
// Deliberately NOT "keep Disc 1": elected from whatever discs actually
// exist, so a title whose first disc is missing still shelves. Every group
// member computes over the same set (self + sibling_roms = the full group),
// so the election agrees without any cross-rom state.
function frontedBySibling(rom: any): boolean {
  const own = DISC_TAG.exec(rom.fs_name || '');
  if (!own) return false;
  let bestDisc = parseInt(own[1], 10);
  let bestId = rom.id;
  for (const sib of rom.sibling_roms || []) {
    const m = DISC_TAG.exec(sib?.fs_name_no_ext || '');
    if (!m || sib.id === undefined || sib.id === null) continue;
    const n = parseInt(m[1], 10);
    if (n < bestDisc || (n === bestDisc && sib.id < bestId)) {
      bestDisc = n;
      bestId = sib.id;
    }
  }
  return bestId !== rom.id;
}

// Best-effort release year from whatever date field this Romm build provides
// (unix seconds or ms at the top level or nested in igdb metadata).
function releaseYear(rom: any): number | undefined {
  const candidates = [
    rom.first_release_date,
    rom.metadatum?.first_release_date,
    rom.igdb_metadata?.first_release_date,
    rom.release_date,
  ];
  for (const c of candidates) {
    if (typeof c === 'number' && c > 0) {
      const ms = c > 1e11 ? c : c * 1000; // seconds vs. ms heuristic
      const y = new Date(ms).getFullYear();
      if (y > 1970 && y < 2100) return y;
    }
    if (typeof c === 'string' && c) {
      const y = new Date(c).getFullYear();
      if (Number.isFinite(y) && y > 1970 && y < 2100) return y;
    }
  }
  return undefined;
}

// Server-relative path to the rom file (folder + filename) that, once rewritten
// through romm_path_prefix, points at the local file an emulator can launch.
function romRelPath(rom: any): string {
  const parts = [rom.fs_path, rom.fs_name || rom.file_name].filter(
    (p) => typeof p === 'string' && p.length > 0
  );
  return parts.join('/').replace(/\/+/g, '/');
}

/**
 * Fetch platforms and their most-recently-added games from Romm, normalized
 * into Movie objects (id `game_<romId>`, `game: true`, `platform`, `launchPath`,
 * poster art via the shared poster queue) so they flow through the existing
 * slot/browse/inspect pipeline exactly like movies. Games are the section's
 * stock; the game-section fixture groups them by `platform`.
 *
 * Never throws: if Romm isn't configured, is unreachable, or a platform lookup
 * fails, this logs a warning and continues (or returns []) so the rest of the
 * app is unaffected -- and nothing is fetched at all when unconfigured.
 */
function generateMockGames(wholeLibrary = false): Movie[] {
  return fetchGamesFromSnapshot(undefined, wholeLibrary);
}

/**
 * Every rom of one platform, in fs_name order, paged so a platform bigger than
 * a single response still comes back whole. Only games-only mode asks for this
 * — the department's budgeted mode takes one PER_PLATFORM_FETCH page and ranks
 * it. Stops on the first short page, which is also what a `total` we can't
 * trust (see the order_by=name note below) degrades to safely.
 */
async function fetchAllPlatformRoms(config: RommConfig, platformId: number): Promise<any[]> {
  const items: any[] = [];
  for (let offset = 0; ; offset += FULL_LIBRARY_PAGE) {
    const data = await rommRequest(
      config,
      `/api/roms?platform_ids=${platformId}&limit=${FULL_LIBRARY_PAGE}&offset=${offset}` +
        '&order_by=fs_name&order_dir=asc',
      FULL_LIBRARY_TIMEOUT_MS
    );
    const page: any[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    items.push(...page);
    if (page.length < FULL_LIBRARY_PAGE) return items;
  }
}

export async function fetchGames(): Promise<Movie[]> {
  // GAMES ONLY: the games own the floor plan, so the shelf budget and the
  // per-platform toggles both step aside — "every one in the Romm library"
  // means every platform that has roms and every rom on it.
  const wholeLibrary = isGamesOnly();
  const config = getRommConfig();
  if (!config) {
    return generateMockGames(wholeLibrary);
  }

  const pathPrefix = (localStorage.getItem('romm_path_prefix') || '').replace(/\/$/, '');
  const games: Movie[] = [];
  const seenRomIds = new Set<number | string>();
  const sectionCap = wholeLibrary ? Infinity : GAME_SECTION_CAP;
  const failed: string[] = [];

  try {
    const platformsRaw = await rommRequest(config, '/api/platforms');
    // Selection must be deterministic and fair (issue: "which games show up
    // seems random"). The old query took the 40 most-recently-ADDED roms per
    // platform (order_by=id desc — upload order, nothing to do with quality)
    // and a mid-loop global-cap break starved whichever platforms the server
    // happened to list last. Now: enabled platforms are sorted by label, the
    // budget is split evenly across them, and roms come back in fs_name order.
    // NOT order_by=name: on Romm 5.x that ordering silently returns a partial
    // set (70 of 134 rows in one measurement) while reporting an inflated
    // total, which starved whole platforms of stock. fs_name and id both
    // return everything. Likewise platform_idS (plural) — the singular
    // platform_id is ignored by 5.x and hands back roms across ALL platforms,
    // which is what the defensive per-rom platform check below still guards.
    // game-section.ts's sortGamesBest re-ranks each platform's stock by rating.
    const platforms: RommPlatform[] = (Array.isArray(platformsRaw) ? platformsRaw : [])
      .map((p: any) => ({
        id: p.id,
        name: p.name || p.slug || 'Games',
        slug: p.slug || '',
        romCount: p.rom_count ?? p.roms_count ?? 0,
      }))
      .filter((p: RommPlatform) => typeof p.id === 'number' && p.romCount !== 0)
      .filter((p: RommPlatform) => wholeLibrary || isPlatformEnabled(platformLabel(p.name, p.slug)))
      .sort((a: RommPlatform, b: RommPlatform) =>
        platformLabel(a.name, a.slug).localeCompare(platformLabel(b.name, b.slug)));

    const perPlatform = wholeLibrary
      ? Infinity
      : platforms.length > 0
      ? Math.min(PER_PLATFORM_CAP, Math.floor(GAME_SECTION_CAP / platforms.length))
      : 0;

    // Per-platform rom lists are independent of each other (the platform list
    // request already completed above), so fetch them all concurrently rather
    // than one-at-a-time — with N enabled platforms this turns N sequential
    // RTTs into one, which matters because loadGameMovies sits inside the
    // boot-critical Promise.all/Promise.race in main.ts. allSettled (not
    // Promise.all) so one platform's failure can't reject the whole batch —
    // the previous per-platform try/catch tolerated that and this preserves it.
    const results = await Promise.allSettled(
      platforms.map((platform) =>
        wholeLibrary
          ? fetchAllPlatformRoms(config, platform.id)
          : rommRequest(
              config,
              `/api/roms?platform_ids=${platform.id}&limit=${PER_PLATFORM_FETCH}&order_by=fs_name&order_dir=asc`
            )
      )
    );

    for (let i = 0; i < platforms.length; i++) {
      if (games.length >= sectionCap) break; // safety net only — the even split stays under the cap
      const platform = platforms[i];
      const label = platformLabel(platform.name, platform.slug);
      const result = results[i];
      if (result.status === 'rejected') {
        // A dropped platform is invisible from inside the store — its aisles
        // simply never build — so name it and the roms it cost, loudly.
        failed.push(`${label} (${platform.romCount} rom(s))`);
        console.warn(`[Romm] Failed to fetch games for platform ${platform.name}:`, result.reason);
        continue;
      }
      const data = result.value;
      const items: any[] = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : [];
      // Keep this platform's TOP-RATED slice of the (alphabetical, oversized)
      // fetch — the shelf should carry each platform's most popular games,
      // and Romm can't order by rating server-side.
      const valid = items.filter((rom) => {
        const id = rom.id;
        const title = rom.name || rom.fs_name_no_ext || rom.fs_name;
        if (id === undefined || id === null || !title) return false;
        // Defensive platform check: some Romm versions/endpoints ignore an
        // unrecognized platform_id filter and return roms across ALL
        // platforms — which put disabled platforms' games (mislabeled with
        // this platform's sign) on the shelf. Trust the rom's own platform
        // over the request parameter.
        const romPlatformId = rom.platform_id ?? rom.platform?.id;
        if (typeof romPlatformId === 'number' && romPlatformId !== platform.id) return false;
        // One CASE per multi-disc title: the elected disc-rom shelves with
        // the fat box + discCount; the rest are the same case's other discs.
        if (frontedBySibling(rom)) return false;
        if (seenRomIds.has(id)) return false; // one shelf copy per game, ever
        seenRomIds.add(id);
        return true;
      });
      valid.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      for (const rom of valid.slice(0, perPlatform)) {
        if (games.length >= sectionCap) break;
        const id = rom.id;
        const title: string = rom.name || rom.fs_name_no_ext || rom.fs_name;
        const rel = romRelPath(rom);
        const launchPath = rel ? `${pathPrefix ? pathPrefix + '/' : ''}${rel}` : '';
        games.push({
          id: `game_${id}`,
          title,
          year: releaseYear(rom) ?? 0,
          duration: 'N/A',
          rating: 'NR',
          overview:
            rom.summary || rom.metadatum?.summary || rom.igdb_metadata?.summary || 'No description available.',
          director: 'Unknown',
          actors: [],
          genres: [],
          localPath: '',
          posterUrl: coverUrl(config, rom, platform.id),
          gameArt: gameArtUrls(config, rom, platform.id),
          discCount: discCountFrom(rom),
          game: true,
          platform: label,
          launchPath,
          communityRating: rom.rating,
          criticRating: rom.rating ? rom.rating * 10 : 0
        });
      }
    }
  } catch (e) {
    console.warn('[Romm] Failed to load games (server unreachable or misconfigured):', e);
    return games; // whatever was gathered before the failure
  }

  console.log(`[Romm] Loaded ${games.length} game(s) across the library.`);
  if (failed.length > 0) {
    console.warn(
      `[Romm] ${failed.length} platform(s) did not load and are MISSING from the store: ${failed.join(', ')}`
    );
  }
  return games;
}

export type LaunchResult = 'launched' | 'webplayer' | 'browser' | 'error';

// Numeric Romm rom id behind a real catalog entry's `game_<id>` -- mock/demo
// games (`game_mock_*`, no Romm server behind them) don't match.
function rommRomId(movie: Movie): number | null {
  const m = /^game_(\d+)$/.exec(movie.id);
  return m ? Number(m[1]) : null;
}

/**
 * "Rent" a game -> play it, best transport first:
 *   1. Tauri with a configured emulator command -> native spawn ('launched').
 *      Uses Tauri's argument-array spawn (never a shell string): the command
 *      template is tokenized on the Rust side and {path} is substituted as a
 *      single argv element, so an untrusted rom path can never inject shell
 *      syntax.
 *   2. Real Romm rom otherwise -> Romm's own in-browser EmulatorJS player, in
 *      a new tab (or the system browser under Tauri) ('webplayer').
 *   3. Neither (mock/demo games, no Romm) -> 'browser', and the caller shows
 *      the demo explanatory card and counter line.
 * Returns 'error' on any failure. Never throws.
 */
export async function launchGame(movie: Movie): Promise<LaunchResult> {
  const hasTauri =
    typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;

  const template = hasTauri ? (localStorage.getItem('romm_launch_cmd') || '').trim() : '';
  if (template && movie.launchPath) {
    try {
      await invoke<string>('launch_game', {
        template,
        path: movie.launchPath,
      });
      return 'launched';
    } catch (e) {
      console.warn(`[Romm] Failed to launch "${movie.title}":`, e);
      return 'error';
    }
  }

  // No native emulator: send real Romm roms to the server's built-in
  // EmulatorJS player. Route per rommapp/romm's frontend/src/plugins/router.ts:
  // `/rom/:rom/ejs` (stable v3.5.0 through current master; only v3.0.0 used
  // the older `/play/:rom`).
  const config = getRommConfig();
  const romId = rommRomId(movie);
  if (config && romId !== null) {
    const url = `${config.url}/rom/${romId}/ejs`;
    try {
      if (hasTauri) {
        await openUrl(url); // system browser -- the webview stays on the store
      } else {
        window.open(url, '_blank');
      }
      return 'webplayer';
    } catch (e) {
      console.warn(`[Romm] Failed to open the browser player for "${movie.title}":`, e);
      return 'error';
    }
  }

  return 'browser';
}
