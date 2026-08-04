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
import { getSetting } from './settings';
import { demoPoster } from './demo-library';
import { isGamesOnly } from './games-only';

export interface RommConfig {
  url: string;
  apiKey: string;
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
  if (!url || !apiKey) return null;
  return { url: url.replace(/\/$/, ''), apiKey };
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
          Authorization: authHeader(config),
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
  const auth = primary.startsWith(config.url) ? `&auth=${encodeURIComponent(authHeader(config))}` : '';
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
      : `/dev-proxy?art=${encodeURIComponent(abs)}&auth=${encodeURIComponent(authHeader(config))}`;
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
export function isPlatformEnabled(label: string): boolean {
  const key = label.toLowerCase().replace(/\s+/g, '');
  let settingKey = `bb_platform_${key}`;
  if (key === 'snes' || key === 'supernintendo') settingKey = 'bb_platform_snes';
  if (key === 'superfamicom' || key === 'sfam' || key === 'sfc') settingKey = 'bb_platform_sfam';
  if (key === 'nes' || key === 'famicom' || key === 'nintendoentertainment') settingKey = 'bb_platform_nes';
  if (key === 'n64' || key === 'nintendo64') settingKey = 'bb_platform_n64';
  if (key === '3ds' || key === 'nintendo3ds') settingKey = 'bb_platform_3ds';
  if (key === 'psp' || key === 'playstationportable') settingKey = 'bb_platform_psp';
  if (key === 'nintendodsi' || key === 'dsi') settingKey = 'bb_platform_dsi';
  if (key === 'nintendoswitch' || key === 'switch') settingKey = 'bb_platform_switch';
  if (key === 'wiiu') settingKey = 'bb_platform_wiiu';
  if (key === 'xbox') settingKey = 'bb_platform_xbox';
  if (key === 'segasaturn' || key === 'saturn') settingKey = 'bb_platform_saturn';
  if (key === 'genesis' || key === 'segagenesis' || key === 'megadrive') settingKey = 'bb_platform_genesis';
  if (key === 'psx' || key === 'ps1' || key === 'playstation') settingKey = 'bb_platform_psx';
  if (key === 'ps2' || key === 'playstation2') settingKey = 'bb_platform_ps2';
  if (key === 'gamecube' || key === 'nintendogamecube') settingKey = 'bb_platform_gamecube';
  if (key === 'dreamcast' || key === 'segadreamcast') settingKey = 'bb_platform_dreamcast';
  if (key === 'gba' || key === 'gameboyadvance') settingKey = 'bb_platform_gba';
  if (key === 'gbc' || key === 'gameboycolor') settingKey = 'bb_platform_gbc';
  if (key === 'gb' || key === 'gameboy') settingKey = 'bb_platform_gb';
  if (key === 'arcade' || key === 'mame' || key === 'neogeo') settingKey = 'bb_platform_arcade';
  if (key === 'atari') settingKey = 'bb_platform_atari';

  const val = getSetting<boolean>(settingKey);
  return val === undefined ? false : val;
}

function generateMockGames(wholeLibrary = false): Movie[] {
  const games: Movie[] = [];
  const selectedPlatforms = [
    { label: 'SNES', key: 'snes' },
    { label: 'NES', key: 'nes' },
    { label: 'NINTENDO 64', key: 'n64' },
    { label: 'GENESIS', key: 'genesis' },
    { label: 'PLAYSTATION', key: 'psx' },
    { label: 'PLAYSTATION 2', key: 'ps2' },
    { label: 'GAMECUBE', key: 'gamecube' },
    { label: 'DREAMCAST', key: 'dreamcast' },
    { label: 'GAME BOY ADVANCE', key: 'gba' },
    { label: 'ARCADE', key: 'arcade' },
    { label: 'ATARI', key: 'atari' }
  ];

  const mockData: Record<string, { title: string; year: number; rating?: number; overview?: string }[]> = {
    snes: [
      { title: 'Super Mario World', year: 1990, rating: 9.5, overview: 'Mario and Luigi go to Dinosaur Land to save Princess Toadstool.' },
      { title: 'Chrono Trigger', year: 1995, rating: 9.8, overview: 'A young man is accidentally transported through time and must save the world.' },
      { title: 'The Legend of Zelda: A Link to the Past', year: 1991, rating: 9.7, overview: 'Link must rescue the descendants of the Seven Sages to defeat Ganon.' },
      { title: 'Super Metroid', year: 1994, rating: 9.7, overview: 'Samus Aran travels to planet Zebes to retrieve a stolen Metroid hatchling.' },
      { title: 'Donkey Kong Country', year: 1994, rating: 9.1, overview: 'Donkey Kong and Diddy Kong search for their stolen banana hoard.' },
      { title: 'Street Fighter II', year: 1992, rating: 9.0, overview: 'Fighters from around the world compete in a martial arts tournament.' },
      { title: 'Final Fantasy VI', year: 1994, rating: 9.6, overview: 'A group of rebels opposes an empire that is trying to conquer the world using magic.' },
      { title: 'Mega Man X', year: 1993, rating: 9.2, overview: 'Mega Man X must stop the Maverick reploids from destroying humanity.' },
      { title: 'Super Mario Kart', year: 1992, rating: 8.8, overview: 'Mario and friends race go-karts in various tracks.' },
      { title: 'Super Mario RPG', year: 1996, rating: 9.3, overview: 'Mario teams up with Bowser, Peach, Mallow, and Geno to save the Star Road.' },
      { title: 'EarthBound', year: 1994, rating: 9.4, overview: 'Ness and his friends travel the world to defeat the alien entity Giygas.' },
      { title: 'Super Castlevania IV', year: 1991, rating: 9.0, overview: 'Simon Belmont sets out to destroy Dracula once again.' },
      { title: 'F-Zero', year: 1990, rating: 8.5, overview: 'High-speed futuristic racing across challenging tracks.' },
      { title: 'Secret of Mana', year: 1993, rating: 9.0, overview: 'Three heroes fight to prevent an empire from reviving a flying fortress.' },
      { title: 'Yoshi\'s Island', year: 1995, rating: 9.5, overview: 'Yoshi carries Baby Mario across hazardous environments to rescue Baby Luigi.' },
      { title: 'Star Fox', year: 1993, rating: 8.8, overview: 'Fox McCloud and his team defend the Lylat system from Andross.' },
      { title: 'Contra III: The Alien Wars', year: 1992, rating: 9.2, overview: 'Two soldiers fight off a massive alien invasion on Earth.' },
      { title: 'Super Punch-Out!!', year: 1994, rating: 8.9, overview: 'Little Mac climbs the ranks of the WVBA to become champion.' },
      { title: 'Final Fight', year: 1990, rating: 8.4, overview: 'Cody, Haggar, and Guy rescue Jessica from the Mad Gear gang.' },
      { title: 'Harvest Moon', year: 1996, rating: 8.7, overview: 'A young boy restores his grandfather\'s abandoned farm.' }
    ],
    nes: [
      { title: 'Super Mario Bros. 3', year: 1988, rating: 9.8, overview: 'Mario and Luigi travel across various worlds to defeat Bowser\'s Koopaling children.' },
      { title: 'The Legend of Zelda', year: 1986, rating: 9.5, overview: 'Link gathers the eight fragments of the Triforce of Wisdom to rescue Princess Zelda.' },
      { title: 'Metroid', year: 1986, rating: 9.0, overview: 'Samus Aran infiltrates planet Zebes to destroy Mother Brain.' },
      { title: 'Mega Man 2', year: 1988, rating: 9.6, overview: 'Mega Man battles Dr. Wily and his eight new robot masters.' },
      { title: 'Castlevania III: Dracula\'s Curse', year: 1989, rating: 9.1, overview: 'Trevor Belmont fights his way to Dracula\'s castle with the help of unique allies.' },
      { title: 'Contra', year: 1987, rating: 9.4, overview: 'Two commandoes fight alien invaders in South America.' },
      { title: 'Punch-Out!!', year: 1987, rating: 9.3, overview: 'Little Mac fights various colorful boxers to challenge Mike Tyson.' },
      { title: 'Duck Hunt', year: 1984, rating: 8.0, overview: 'Shoot ducks and clay pigeons with the NES Zapper.' },
      { title: 'Final Fantasy', year: 1987, rating: 8.9, overview: 'Four Light Warriors set out to restore light to the four elemental crystals.' },
      { title: 'Super Mario Bros.', year: 1985, rating: 9.5, overview: 'Mario travels through the Mushroom Kingdom to rescue Princess Toadstool.' },
      { title: 'Ninja Gaiden', year: 1988, rating: 9.0, overview: 'Ryu Hayabusa seeks revenge for his father\'s death.' },
      { title: 'Bubble Bobble', year: 1986, rating: 8.8, overview: 'Two dragons bubble enemies to rescue their girlfriends.' },
      { title: 'Castlevania', year: 1986, rating: 9.0, overview: 'Simon Belmont enters Dracula\'s castle to destroy the vampire lord.' },
      { title: 'Zelda II: The Adventure of Link', year: 1987, rating: 8.2, overview: 'Link seeks the Triforce of Courage to wake Princess Zelda from a sleeping curse.' },
      { title: 'Kirby\'s Adventure', year: 1993, rating: 9.2, overview: 'Kirby travels Dream Land to recover the pieces of the Star Rod.' },
      { title: 'Excitebike', year: 1984, rating: 8.1, overview: 'Race motorbikes over obstacles and design your own tracks.' },
      { title: 'Double Dragon', year: 1987, rating: 8.7, overview: 'Two martial artists rescue Billy\'s girlfriend from a gang.' },
      { title: 'Mega Man 3', year: 1990, rating: 9.2, overview: 'Mega Man and his robot dog Rush gather elements to build a peace-keeping robot.' },
      { title: 'Ghosts \'n Goblins', year: 1985, rating: 8.0, overview: 'Arthur fights demons to rescue Princess Prin Prin.' },
      { title: 'Tecmo Bowl', year: 1987, rating: 8.6, overview: 'Classic gridiron American football action.' }
    ],
    n64: [
      { title: 'Super Mario 64', year: 1996, rating: 9.8, overview: 'Mario enters worlds inside paintings to rescue Princess Peach.' },
      { title: 'The Legend of Zelda: Ocarina of Time', year: 1998, rating: 9.9, overview: 'Link travels through time to stop Ganondorf from obtaining the Triforce.' },
      { title: 'GoldenEye 007', year: 1997, rating: 9.6, overview: 'James Bond infiltrates various locations to stop a satellite weapon.' },
      { title: 'Mario Kart 64', year: 1996, rating: 9.2, overview: 'Mario and friends race in 3D tracks with weapon items.' },
      { title: 'Super Smash Bros.', year: 1999, rating: 9.1, overview: 'Nintendo characters battle each other in arena stages.' },
      { title: 'Star Fox 64', year: 1997, rating: 9.3, overview: 'Fox McCloud pilots the Arwing to defend the Lylat system.' },
      { title: 'Banjo-Kazooie', year: 1998, rating: 9.4, overview: 'A bear and a bird collect Jigsaws and musical notes to rescue Banjo\'s sister.' },
      { title: 'Perfect Dark', year: 1999, rating: 9.5, overview: 'Joanna Dark investigates a conspiracy involving alien technology.' },
      { title: 'The Legend of Zelda: Majora\'s Mask', year: 2000, rating: 9.7, overview: 'Link has three days to stop the Moon from crashing into Termina.' },
      { title: 'Paper Mario', year: 2000, rating: 9.3, overview: 'Mario rescues the Star Spirits to defeat Bowser in a paper-craft world.' },
      { title: 'F-Zero X', year: 1998, rating: 9.0, overview: 'High-speed futuristic racing with 30 pilots competing.' },
      { title: 'Mario Party', year: 1998, rating: 8.5, overview: 'Board game with Mario characters and various minigames.' },
      { title: 'Conker\'s Bad Fur Day', year: 2001, rating: 9.2, overview: 'A squirrel goes on a wild, mature-themed adventure to get home.' },
      { title: 'Wave Race 64', year: 1996, rating: 8.9, overview: 'Jet ski racing with realistic water physics.' },
      { title: 'Donkey Kong 64', year: 1999, rating: 8.8, overview: 'Collect bananas and rescue DK\'s friends in 3D worlds.' },
      { title: 'Kirby 64: The Crystal Shards', year: 2000, rating: 8.7, overview: 'Kirby combines abilities to save Ripple Star.' },
      { title: 'Pokemon Stadium', year: 1999, rating: 8.6, overview: 'Battle Pokemon in 3D arenas using imported game save files.' },
      { title: 'Diddy Kong Racing', year: 1997, rating: 9.0, overview: 'Adventure racing in cars, planes, and hovercrafts.' }
    ],
    genesis: [
      { title: 'Sonic the Hedgehog 2', year: 1992, rating: 9.4, overview: 'Sonic and Tails speed through zones to stop Dr. Robotnik\'s Death Egg.' },
      { title: 'Streets of Rage 2', year: 1992, rating: 9.3, overview: 'Four heroes clean up the streets in a classic side-scrolling beat \'em up.' },
      { title: 'Phantasy Star IV', year: 1993, rating: 9.5, overview: 'Chaz and friends battle an ancient evil across the Algo Star System.' },
      { title: 'Gunstar Heroes', year: 1993, rating: 9.4, overview: 'High-octane run-and-gun action with combining weapon types.' },
      { title: 'Shinobi III: Return of the Ninja Master', year: 1993, rating: 9.1, overview: 'Joe Musashi battles the Neo Zeed syndicate with ninja skills.' },
      { title: 'Sonic & Knuckles', year: 1994, rating: 9.2, overview: 'Sonic and Knuckles team up (or split) to stop the Death Egg.' },
      { title: 'Castlevania: Bloodlines', year: 1994, rating: 9.0, overview: 'John Morris and Eric Lecarde battle through WWI-era Europe.' },
      { title: 'Mortal Kombat II', year: 1993, rating: 9.0, overview: 'Fighters battle in Outworld in the legendary martial arts tournament.' },
      { title: 'Sonic the Hedgehog', year: 1991, rating: 9.1, overview: 'The blue hedgehog speeds to free animals from Dr. Robotnik.' },
      { title: 'Beyond Oasis', year: 1994, rating: 8.9, overview: 'Prince Ali uses the Gold Armlet to summon spirits and stop evil.' },
      { title: 'Monster World IV', year: 1994, rating: 9.0, overview: 'Aisha travels with her blue Pepelogoo to save elemental spirits.' },
      { title: 'Streets of Rage', year: 1991, rating: 8.7, overview: 'Three ex-cops clean up a crime-ridden city.' },
      { title: 'Earthworm Jim', year: 1994, rating: 8.9, overview: 'A worm in a super-suit battles bizarre enemies across space.' },
      { title: 'Aladdin', year: 1993, rating: 9.0, overview: 'Classic Disney adaptation featuring hand-drawn animations.' },
      { title: 'Ecco the Dolphin', year: 1992, rating: 8.5, overview: 'A dolphin travels through time and oceans to rescue his pod.' },
      { title: 'Golden Axe', year: 1989, rating: 8.6, overview: 'Three warriors seek revenge against Death Adder.' },
      { title: 'VectorMan', year: 1995, rating: 8.8, overview: 'An orb-bot cleans up Earth from toxic waste and rogue robots.' },
      { title: 'Comix Zone', year: 1995, rating: 8.7, overview: 'A cartoonist is trapped inside his own post-apocalyptic comic book.' },
      { title: 'Ristar', year: 1995, rating: 9.0, overview: 'A star stretches his arms to climb and defeat Kaiser Greedy.' },
      { title: 'Landstalker', year: 1992, rating: 8.9, overview: 'Isometric action RPG following Nigel the treasure hunter.' }
    ],
    psx: [
      { title: 'Final Fantasy VII', year: 1997, rating: 9.8, overview: 'Cloud Strife and AVALANCHE oppose the Shinra corporation and Sephiroth.' },
      { title: 'Metal Gear Solid', year: 1998, rating: 9.8, overview: 'Solid Snake infiltrates Shadow Moses to stop the terrorist group FOXHOUND.' },
      { title: 'Castlevania: Symphony of the Night', year: 1997, rating: 9.9, overview: 'Dracula\'s half-vampire son Alucard explores a shifting castle.' },
      { title: 'Resident Evil 2', year: 1998, rating: 9.5, overview: 'Leon S. Kennedy and Claire Redfield fight zombies in Raccoon City.' },
      { title: 'Crash Bandicoot: Warped', year: 1998, rating: 9.2, overview: 'Crash and Coco travel through time to gather crystals.' },
      { title: 'Gran Turismo 2', year: 1999, rating: 9.3, overview: 'Comprehensive driving simulation with hundreds of cars.' },
      { title: 'Silent Hill', year: 1999, rating: 9.4, overview: 'Harry Mason searches for his missing daughter in a fog-shrouded town.' },
      { title: 'Chrono Cross', year: 2000, rating: 9.4, overview: 'Serge travels between parallel dimensions to uncover his past.' },
      { title: 'Tekken 3', year: 1998, rating: 9.5, overview: 'Fighters battle in Ogre\'s tournament.' },
      { title: 'Tony Hawk\'s Pro Skater 2', year: 2000, rating: 9.6, overview: 'Skateboards, combos, and a legendary punk soundtrack.' },
      { title: 'Resident Evil', year: 1996, rating: 9.0, overview: 'S.T.A.R.S. members investigate a mysterious mansion.' },
      { title: 'Tomb Raider', year: 1996, rating: 8.9, overview: 'Lara Croft searches for the Scion of Atlantis.' },
      { title: 'Syphon Filter', year: 1999, rating: 8.8, overview: 'Gabe Logan tracks down a global biological weapon.' },
      { title: 'Legacy of Kain: Soul Reaver', year: 1999, rating: 9.2, overview: 'Raziel seeks vengeance against his creator Kain.' },
      { title: 'Final Fantasy VIII', year: 1999, rating: 9.1, overview: 'Squall Leonhart and SeeD mercenaries fight a sorceress.' },
      { title: 'Spyro the Dragon', year: 1998, rating: 8.9, overview: 'A purple dragon rescues his fellow dragons.' },
      { title: 'Resident Evil 3: Nemesis', year: 1999, rating: 9.0, overview: 'Jill Valentine escapes Raccoon City while pursued by Nemesis.' },
      { title: 'Ape Escape', year: 1999, rating: 9.1, overview: 'Catch time-traveling monkeys.' },
      { title: 'Final Fantasy IX', year: 2000, rating: 9.6, overview: 'Zidane Tribal kidnaps Princess Garnet.' },
      { title: 'Xenogears', year: 1998, rating: 9.5, overview: 'Fei Fong Wong pilots gears in a philosophical sci-fi story.' }
    ]
  };

  for (const plat of selectedPlatforms) {
    // Games-only ignores the platform toggles for real Romm stock, so the
    // no-server demo catalog has to do the same — otherwise a games-only demo
    // boot with every toggle off would build a store with nothing in it.
    if (wholeLibrary || isPlatformEnabled(plat.label)) {
      const data = mockData[plat.key] || [];
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        games.push({
          id: `game_mock_${plat.key}_${i}`,
          title: item.title,
          year: item.year,
          duration: 'N/A',
          rating: 'NR',
          overview: item.overview || 'No description available.',
          director: 'Unknown',
          actors: [],
          genres: [],
          localPath: '',
          posterUrl: demoPoster(i),
          game: true,
          platform: plat.label,
          launchPath: '',
          communityRating: item.rating,
          criticRating: item.rating ? item.rating * 10 : 0
        });
      }
    }
  }

  return games;
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
 *      the "take this to the counter" toast.
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
