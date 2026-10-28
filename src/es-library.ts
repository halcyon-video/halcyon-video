// EmulationStation games source (issue #407): stocks the games department from
// a folder of gamelist.xml files (ES-DE, Batocera, RetroPie, stock ES) with the
// frontend's own scraped box art. Browser-only by design — the owner picks the
// folder once; nothing is uploaded and no server, account or API key is
// involved, so it works the same on the hosted demo, a local install and
// inside the Tauri webview. Never required: with no folder chosen every export
// is inert.
import type { Movie } from './jellyfin';
import { platformLabel } from './game-platform-label';
import { isPlatformEnabled } from './game-platforms';
import { isGamesOnly } from './games-only';
import {
  ES_MEDIA_KINDS, esPopularity, esSpreadKey, parseGamelist, type EsGame,
} from './es-gamelist';

type FileGetter = () => Promise<File>;
type FileIndex = Map<string, FileGetter>;

const NAME_KEY = 'es_library_name';
const DB_NAME = 'halcyon-es-library';
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp'];
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
// Same budget Romm's department uses (romm.ts GAME_SECTION_CAP / PER_PLATFORM_CAP).
const SECTION_CAP = 384;
const PER_PLATFORM_CAP = 96;
const WALK_ENTRY_CAP = 400_000;

let index: FileIndex | null = null;
let current: Movie[] = [];
const roms = new Map<string, { system: string; file: FileGetter }>();
let blobUrls: string[] = [];
let status = 'No EmulationStation library chosen.';
const listeners = new Set<() => void>();

export const esStatus = (): string => status;
export const esFolderName = (): string => localStorage.getItem(NAME_KEY) || '';
/** A folder has been chosen (this or an earlier session). */
export const esConfigured = (): boolean => !!esFolderName();
export function watchEsStatus(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(message: string) { status = message; for (const l of listeners) l(); }
const changed = () => window.dispatchEvent(new Event('es-library-changed'));

// ---- folder access -------------------------------------------------------------

const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();
// ROM files are indexed by name only (a handle each, nothing is read) so a rented
// game can find its file; the browser player reads it on demand.
const ROM_EXT = new Set(['nes', 'fds', 'sfc', 'smc', 'gb', 'gbc', 'gba', 'md', 'gen', 'smd', 'sms', 'gg', 'n64', 'z64', 'v64', 'nds',
  'pce', 'a26', 'a78', 'lnx', 'ws', 'wsc', 'ngp', 'ngc', 'bin', 'cue', 'iso', 'chd', 'pbp', 'zip', '7z']);
const wanted = (name: string) => name.toLowerCase() === 'gamelist.xml' || IMAGE_EXT.includes(extOf(name)) || ROM_EXT.has(extOf(name));

function indexFileList(list: FileList): FileIndex {
  const out: FileIndex = new Map();
  for (const file of Array.from(list)) {
    if (!wanted(file.name)) continue;
    // webkitRelativePath starts with the picked folder's own name; drop it so
    // keys are relative to the folder the owner chose.
    const rel = (file.webkitRelativePath || file.name).split('/').slice(1).join('/') || file.name;
    out.set(rel.toLowerCase(), async () => file);
  }
  return out;
}

async function indexDirectory(root: any): Promise<FileIndex> {
  const out: FileIndex = new Map();
  let seen = 0;
  const walk = async (dir: any, prefix: string, depth: number): Promise<void> => {
    for await (const [name, handle] of dir.entries()) {
      if (++seen > WALK_ENTRY_CAP) return;
      if (handle.kind === 'directory') {
        if (depth < 10 && !name.startsWith('.')) await walk(handle, `${prefix}${name}/`, depth + 1);
      } else if (wanted(name)) {
        out.set(`${prefix}${name}`.toLowerCase(), () => handle.getFile());
      }
    }
  };
  await walk(root, '', 0);
  return out;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbGet(): Promise<any | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('handles').objectStore('handles').get('dir');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(handle: any | null): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const store = db.transaction('handles', 'readwrite').objectStore('handles');
    const req = handle ? store.put(handle, 'dir') : store.delete('dir');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function pickWithInput(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as any).webkitdirectory = true;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

// ---- gamelist -> shelf stock ------------------------------------------------------

function systemOf(gamelistKey: string): string {
  const parts = gamelistKey.split('/');
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

// Last-N-segments lookup tables, built once per index (a linear scan per game
// is too slow against a ROM-sized folder).
const tailCache = new WeakMap<FileIndex, Map<number, Map<string, FileGetter>>>();
function tails(idx: FileIndex, n: number): Map<string, FileGetter> {
  let byN = tailCache.get(idx);
  if (!byN) tailCache.set(idx, byN = new Map());
  let table = byN.get(n);
  if (!table) {
    byN.set(n, table = new Map());
    for (const [key, getter] of idx) {
      const segs = key.split('/');
      if (segs.length >= n) table.set(segs.slice(-n).join('/'), getter);
    }
  }
  return table;
}

/** Resolve an art path as written in a gamelist to an indexed file. */
function findFile(idx: FileIndex, gamelistKey: string, written: string): FileGetter | undefined {
  const dir = gamelistKey.slice(0, gamelistKey.lastIndexOf('/') + 1);
  const norm = written.replace(/\\/g, '/');
  if (norm.startsWith('./') || !/^([a-z]:)?\//i.test(norm) && !norm.startsWith('~')) {
    const segs = (dir + norm.replace(/^\.\//, '')).split('/');
    const out: string[] = [];
    for (const s of segs) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }
    const hit = idx.get(out.join('/').toLowerCase());
    if (hit) return hit;
  }
  // Absolute or "~/" paths name a place on the machine that wrote them; match
  // the tail (system dir + file) against whatever the chosen folder holds.
  return tails(idx, 2).get(norm.split('/').slice(-2).join('/').toLowerCase());
}

/** A game's ROM: beside the gamelist (Batocera, RetroPie) or in <ROMs>/<system>/ (ES-DE, where gamelists live apart from the ROMs). */
function findRom(idx: FileIndex, gamelistKey: string, system: string, written: string): FileGetter | undefined {
  const direct = findFile(idx, gamelistKey, written);
  if (direct) return direct;
  const rel = written.replace(/\\/g, '/').replace(/^\.\//, '');
  return tails(idx, rel.split('/').length + 1).get(`${system}/${rel}`.toLowerCase());
}

/** ES-DE keeps scrapes in downloaded_media/<system>/<kind>/<rom stem>.<ext>. */
function findMedia(idx: FileIndex, system: string, kinds: readonly string[], romPath: string): FileGetter | undefined {
  const stem = romPath.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').toLowerCase();
  for (const kind of kinds) {
    for (const ext of IMAGE_EXT) {
      const hit = tails(idx, 3).get(`${system}/${kind}/${stem}.${ext}`);
      if (hit) return hit;
    }
  }
  return undefined;
}

async function toUrl(getter: FileGetter | undefined): Promise<string | undefined> {
  if (!getter) return undefined;
  try {
    const file = await getter();
    const type = file.type || MIME[extOf(file.name)] || 'image/png';
    const url = URL.createObjectURL(new Blob([file], { type }));
    blobUrls.push(url);
    return url;
  } catch { return undefined; }
}

const score = (g: EsGame): number => esPopularity(g) ?? -1;

async function buildGames(idx: FileIndex): Promise<Movie[]> {
  const wholeLibrary = isGamesOnly();
  const lists = [...idx.keys()].filter((k) => k.endsWith('gamelist.xml'));
  // One gamelist per system; ES-DE keeps them under gamelists/<system>/ while
  // Batocera/RetroPie keep them beside the ROMs, so the parent dir is the system.
  const bySystem = new Map<string, { key: string; games: EsGame[] }>();
  for (const key of lists) {
    const system = systemOf(key);
    if (!system) continue;
    const games = parseGamelist(await (await idx.get(key)!()).text());
    const prev = bySystem.get(system);
    if (!prev || games.length > prev.games.length) bySystem.set(system, { key, games });
  }
  const platforms = [...bySystem.entries()]
    .map(([system, v]) => ({ system, label: platformLabel(system, system), ...v }))
    .filter((p) => p.games.length > 0 && (wholeLibrary || isPlatformEnabled(p.label)))
    .sort((a, b) => a.label.localeCompare(b.label));
  const perPlatform = wholeLibrary ? Infinity
    : Math.min(PER_PLATFORM_CAP, Math.floor(SECTION_CAP / Math.max(1, platforms.length)));

  const out: Movie[] = [];
  roms.clear();
  for (const p of platforms) {
    // Rated or played games first (the frontend's own popularity), the rest in
    // a stable pseudo-random spread so an unscraped library isn't just A-to-Z.
    const ranked = p.games.slice().sort((a, b) => score(b) - score(a) || esSpreadKey(a.name) - esSpreadKey(b.name));
    for (const g of ranked.slice(0, perPlatform)) {
      if (out.length >= (wholeLibrary ? Infinity : SECTION_CAP)) break;
      const front = findMedia(idx, p.system, ES_MEDIA_KINDS.front.slice(0, 2), g.path);
      const pick = (w?: string) => (w ? findFile(idx, p.key, w) : undefined);
      const posterUrl = await toUrl(front ?? pick(g.cover) ?? pick(g.thumbnail) ?? pick(g.image)
        ?? findMedia(idx, p.system, ES_MEDIA_KINDS.front.slice(2), g.path));
      const back = await toUrl(pick(g.backcover) ?? findMedia(idx, p.system, ES_MEDIA_KINDS.back, g.path));
      const label = await toUrl(findMedia(idx, p.system, ES_MEDIA_KINDS.label, g.path));
      const popularity = esPopularity(g);
      const facts = [g.genre, g.players ? `${g.players} player(s)` : '', g.developer || g.publisher]
        .filter(Boolean).join(' · ');
      const id = `game_es_${p.system}_${esSpreadKey(g.path).toString(36)}`;
      const romFile = findRom(idx, p.key, p.system, g.path);
      if (romFile) roms.set(id, { system: p.system, file: romFile });
      out.push({
        id,
        title: g.name,
        year: g.releaseYear ?? 0,
        duration: 'N/A',
        rating: 'NR',
        overview: g.desc || facts || 'No description available.',
        director: g.developer || 'Unknown',
        actors: [],
        genres: g.genre ? [g.genre] : [],
        localPath: '',
        posterUrl,
        gameArt: back || label ? { back, label } : undefined,
        game: true,
        platform: p.label,
        // No server path: renting resolves the ROM through esRomFile() instead.
        launchPath: '',
        communityRating: popularity,
        criticRating: popularity ? popularity * 10 : 0,
      } as Movie);
    }
  }
  return out;
}

// ---- public surface ---------------------------------------------------------------

export const isEsGame = (movie: Movie): boolean => movie.id.startsWith('game_es_');
/** The rented game's ROM in the chosen folder (undefined when the folder holds no such file). */
export const esRomFile = (movie: Movie) => roms.get(movie.id);

async function adopt(next: FileIndex, name: string): Promise<void> {
  index = next;
  localStorage.setItem(NAME_KEY, name);
  await loadEsGames(true);
}

/** Choose the library folder. Must run from a click (browsers require it). */
export async function chooseEsFolder(): Promise<void> {
  const picker = (window as any).showDirectoryPicker as undefined | ((o: object) => Promise<any>);
  publish('Reading your EmulationStation folder…');
  if (picker) {
    let handle: any;
    try { handle = await picker({ id: 'halcyon-es', mode: 'read' }); }
    catch { publish(esConfigured() ? status : 'No folder chosen.'); return; }
    const idx = await indexDirectory(handle);
    await dbPut(handle).catch(() => {});
    await adopt(idx, handle.name);
  } else {
    const files = await pickWithInput();
    if (!files || !files.length) { publish('No folder chosen.'); return; }
    const name = (files[0].webkitRelativePath || '').split('/')[0] || 'EmulationStation';
    await adopt(indexFileList(files), name);
  }
}

/** Boot-time reconnect to the remembered folder, only if the browser still allows it. */
async function restore(): Promise<boolean> {
  if (index) return true;
  if (!esConfigured() || !('indexedDB' in window)) return false;
  try {
    const handle = await dbGet();
    if (!handle) { publish('Your EmulationStation folder needs choosing again.'); return false; }
    const perm = await handle.queryPermission?.({ mode: 'read' });
    if (perm !== 'granted') {
      publish(`Choose ${handle.name} again to let Halcyon read it. Your games stay off the shelves until then.`);
      return false;
    }
    index = await indexDirectory(handle);
    return true;
  } catch { return false; }
}

export async function loadEsGames(force = false): Promise<Movie[]> {
  if (!esConfigured()) return [];
  if (!force && current.length) return current;
  if (!(await restore()) || !index) return [];
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls = [];
  try {
    current = await buildGames(index);
    const withArt = current.filter((g) => g.posterUrl).length;
    publish(`${current.length} games from ${esFolderName()} (${withArt} with box art). Close settings to stock the shelves.`);
  } catch (error) {
    console.warn('[EmulationStation] could not read the library:', error);
    current = [];
    publish('That folder could not be read. Try choosing it again.');
  }
  changed();
  return current;
}

export async function forgetEsFolder(): Promise<void> {
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls = []; current = []; index = null;
  localStorage.removeItem(NAME_KEY);
  await dbPut(null).catch(() => {});
  publish('EmulationStation folder forgotten. Its games have been removed.');
  changed();
}

/** Stock from an in-memory folder listing (relative path -> file). Used by the screenshot harness and tests. */
export async function loadEsFromEntries(entries: Array<[string, File]>, name = 'EmulationStation'): Promise<Movie[]> {
  const idx: FileIndex = new Map();
  for (const [path, file] of entries) if (wanted(file.name)) idx.set(path.toLowerCase(), async () => file);
  await adopt(idx, name);
  return current;
}
