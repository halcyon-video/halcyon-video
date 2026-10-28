// EmulationStation gamelist.xml reader (issue #407): the games department's
// second library source next to Romm. ES-DE, Batocera, RetroPie and stock
// EmulationStation all write the same flat <gameList><game>…</game></gameList>
// files, so a tolerant tag scan is enough — and it keeps this module free of
// DOMParser so node tests can load it.

export interface EsGame {
  name: string;
  /** ROM path as written, usually "./Game.zip" relative to the gamelist. */
  path: string;
  desc?: string;
  /** Art paths as written (relative to the gamelist, "~/", or absolute). */
  image?: string;
  thumbnail?: string;
  cover?: string;
  backcover?: string;
  marquee?: string;
  fanart?: string;
  /** 0..1 as ES stores it. */
  rating?: number;
  playcount?: number;
  genre?: string;
  players?: string;
  releaseYear?: number;
  developer?: string;
  publisher?: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
      if (body[0] === '#') {
        const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[body.toLowerCase()] ?? whole;
    })
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  if (!m) return undefined;
  const value = decode(m[1]);
  return value === '' ? undefined : value;
}

/** ES dates are "19950101T000000"; some scrapers write a bare year. */
export function esReleaseYear(value: string | undefined): number | undefined {
  const m = /^(\d{4})/.exec((value || '').trim());
  if (!m) return undefined;
  const year = Number(m[1]);
  return year >= 1950 && year <= 2100 ? year : undefined;
}

export function parseGamelist(xml: string): EsGame[] {
  const games: EsGame[] = [];
  const blockRe = /<game(?:\s[^>]*)?>([\s\S]*?)<\/game>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml))) {
    const block = m[1];
    const path = tag(block, 'path');
    if (!path) continue;
    const stem = path.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    const rating = Number(tag(block, 'rating'));
    const playcount = Number(tag(block, 'playcount'));
    games.push({
      name: tag(block, 'name') || stem,
      path,
      desc: tag(block, 'desc'),
      image: tag(block, 'image'),
      thumbnail: tag(block, 'thumbnail'),
      cover: tag(block, 'cover'),
      backcover: tag(block, 'backcover'),
      marquee: tag(block, 'marquee'),
      fanart: tag(block, 'fanart'),
      rating: Number.isFinite(rating) && rating > 0 ? Math.min(1, rating) : undefined,
      playcount: Number.isFinite(playcount) && playcount > 0 ? Math.floor(playcount) : undefined,
      genre: tag(block, 'genre'),
      players: tag(block, 'players'),
      releaseYear: esReleaseYear(tag(block, 'releasedate')),
      developer: tag(block, 'developer'),
      publisher: tag(block, 'publisher'),
    });
  }
  return games;
}

/**
 * Popularity on the shelf scale Romm uses (0-10): the frontend's own rating
 * when scraped, otherwise a play-count score so games the owner actually plays
 * outrank untouched ones. undefined = no signal; the loader spreads those.
 */
export function esPopularity(game: EsGame): number | undefined {
  if (game.rating !== undefined) return Math.round(game.rating * 100) / 10;
  if (game.playcount !== undefined) return Math.min(game.playcount, 10) / 2;
  return undefined;
}

/** Stable pseudo-random order for unrated games (same store every boot). */
export function esSpreadKey(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Candidate file stems for ES-DE's downloaded_media/<system>/<kind>/<stem>.* layout. */
export const ES_MEDIA_KINDS = {
  front: ['covers', '3dboxes', 'miximages', 'screenshots'],
  back: ['backcovers'],
  label: ['physicalmedia'],
} as const;

/** ES system folder name -> EmulatorJS core. */
const CORES: Record<string, string> = {
  nes: 'nes', famicom: 'nes', fds: 'nes',
  snes: 'snes', sfc: 'snes', snesna: 'snes', superfamicom: 'snes',
  genesis: 'segaMD', megadrive: 'segaMD', md: 'segaMD', megadrivejp: 'segaMD',
  mastersystem: 'segaMS', sms: 'segaMS', gamegear: 'segaGG', gg: 'segaGG',
  gb: 'gb', gbc: 'gb', gba: 'gba', n64: 'n64', nds: 'nds',
  psx: 'psx', ps1: 'psx', pcengine: 'pce', tg16: 'pce', atari2600: 'atari2600', atari7800: 'atari7800', lynx: 'lynx',
};

export const esCoreFor = (system: string): string | undefined => CORES[system.toLowerCase()];
