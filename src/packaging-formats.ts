// Physical packaging is catalog metadata, independent of cover aspect/genre.
// These dimensions are nominal closed cases in feet; see the model contract.
export type PackagingFormat = 'vhs-slipcase' | 'vhs-white-clamshell';
export type CaseModelFamily = 'vhs-slipcase' | 'vhs-white' | 'vhs-rental' | 'dvd-keepcase' | 'jewel-single' | 'jewel-fat';
export interface CaseDimensions { w: number; h: number; d: number; family?: CaseModelFamily }
export const WHITE_CLAMSHELL_DIMS: CaseDimensions = Object.freeze({ w: 5.5 / 12, h: 8.75 / 12, d: 1.25 / 12, family: 'vhs-white' });
export const JEWEL_FAT_DEPTH_IN = 0.72;
const JEWEL = new Set(['PLAYSTATION', 'SEGA SATURN', 'SEGA CD', 'DREAMCAST']);
const KEEP = new Set(['PLAYSTATION 2', 'GAMECUBE', 'XBOX', 'NINTENDO 3DS', 'NINTENDO DSI', 'NINTENDO SWITCH', 'PSP', 'WII U']);
export function isJewelCasePlatform(platform?: string): boolean { return !!platform && JEWEL.has(platform); }
export function isWhiteClamshell(movie: { game?: boolean; isSeries?: boolean; packaging?: PackagingFormat; libraryName?: string }, medium: string): boolean {
  if (medium !== 'vhs' || movie.game || movie.isSeries) return false;
  if (movie.packaging !== undefined) return movie.packaging === 'vhs-white-clamshell';
  // Preserve the operator's established library styling; this is presentation,
  // not evidence that any particular release shipped in this physical edition.
  return movie.libraryName === 'Animated Movies';
}
export function gameConstruction(platform?: string, discCount = 1): CaseModelFamily | undefined {
  if (isJewelCasePlatform(platform)) return discCount >= 2 ? 'jewel-fat' : 'jewel-single';
  if (platform && KEEP.has(platform)) return 'dvd-keepcase';
  // Known molded cartridge boxes; paperboard editions remain ambiguous and
  // should be selected explicitly when edition metadata becomes available.
  if (platform === 'GENESIS' || platform === 'SEGA MASTER SYSTEM') return 'vhs-rental';
  return undefined; // retain variable cartons and unknown-system fallback
}

export const GAME_BOX_IN: Record<string, [number, number, number]> = {
  // Cartridge era — cardboard cartons and plastic clamshells.
  'NES': [5.0, 7.0, 1.0],
  'SNES': [7.5, 5.25, 1.1],              // NA landscape carton
  'SUPER FAMICOM': [4.2, 7.5, 1.1],      // JP carton: tall and narrow, not a wide Snes box
  'NINTENDO 64': [7.5, 5.25, 1.1],       // landscape carton
  'GAME BOY': [4.75, 5.25, 0.9],         // near-square
  'GAME BOY COLOR': [4.75, 5.25, 0.9],
  'GAME BOY ADVANCE': [4.8, 5.4, 0.9],   // portrait, like the GB carton
  'GENESIS': [5.5, 7.5, 1.2],
  'SEGA MASTER SYSTEM': [5.5, 7.0, 1.0],
  'ATARI': [5.0, 7.0, 1.0],
  'TURBOGRAFX-16': [5.5, 4.9, 0.9],
  'ARCADE': [5.0, 7.0, 1.0],             // Neo Geo AES cartons are far larger;
                                         // a rental store sleeved odd carts.
  // Optical era — jewel cases and keep cases.
  'PLAYSTATION': [5.6, 4.9, 0.4],        // CD jewel case, landscape
  'SEGA SATURN': [4.9, 5.6, 0.4],        // CD jewel case, portrait
  'SEGA CD': [5.5, 7.9, 0.75],
  'DREAMCAST': [5.5, 7.5, 0.6],
  'PLAYSTATION 2': [5.3, 7.5, 0.55],     // DVD keep case
  'GAMECUBE': [5.3, 7.4, 0.6],
  'XBOX': [5.3, 7.5, 0.55],
  'NINTENDO 3DS': [5.4, 4.75, 0.5],      // small keep case, landscape
  'NINTENDO DSI': [5.4, 4.9, 0.5],       // DS-family keep case, landscape
  'NINTENDO SWITCH': [4.2, 6.6, 0.45],   // portrait keep case
  'PSP': [4.1, 6.7, 0.6],                // UMD case, portrait
  'WII U': [5.3, 7.5, 0.6],              // DVD-footprint keep case
};
