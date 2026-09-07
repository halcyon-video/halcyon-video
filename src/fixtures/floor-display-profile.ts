/** Optional local model drops. Profile dimensions drive both fallback and stock. */
export interface FloorDisplayProfile {
  model: string;
  coreHeight: number;
  shelfHeights: number[];
  shelfCenters: number[];
  lean: number;
  dark: boolean;
  topper: boolean;
}

export function parseFloorDisplayProfile(value: unknown): FloorDisplayProfile | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  const heights = p.shelfHeights, centers = p.shelfCenters;
  if (typeof p.model !== 'string' || !/^user-assets\/[a-zA-Z0-9_./-]+\.glb$/.test(p.model) || p.model.includes('..')) return null;
  if (!Array.isArray(heights) || heights.length < 1 || heights.length > 6 || !Array.isArray(centers) || centers.length !== heights.length) return null;
  if (heights.some((n, i) => typeof n !== 'number' || !Number.isFinite(n) || n < .5 || n > 5 || (i > 0 && n <= heights[i - 1]))) return null;
  // Keep every tray inside the established three-foot browsing footprint.
  if (centers.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < .65 || n > 1.25)) return null;
  if (typeof p.coreHeight !== 'number' || !Number.isFinite(p.coreHeight) || p.coreHeight < heights[heights.length - 1] + .5 || p.coreHeight > 6) return null;
  if (typeof p.lean !== 'number' || !Number.isFinite(p.lean) || p.lean < -.65 || p.lean > 0) return null;
  return { model: p.model, coreHeight: p.coreHeight, shelfHeights: heights.slice(), shelfCenters: centers.slice(), lean: p.lean, dark: p.dark === true, topper: p.topper !== false };
}

export function localFloorDisplayProfile(id: string): FloorDisplayProfile | null {
  try { return parseFloorDisplayProfile(JSON.parse(localStorage.getItem('bb_floor_display_profiles') || '{}')[id]); }
  catch { return null; }
}
