/** Optional local model drops. Profile dimensions drive both fallback and stock. */
export interface FloorDisplayProfile {
  model: string;
  coreHeight: number;
  shelfHeights: number[];
  shelfCenters: number[];
  lean: number;
  dark: boolean;
  topper: boolean;
  terraced?: boolean;
  light?: boolean;
  shelfColumns?: number[];
}

export function parseFloorDisplayProfile(value: unknown): FloorDisplayProfile | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  const heights = p.shelfHeights, centers = p.shelfCenters;
  if (typeof p.model !== 'string' || !/^user-assets\/[a-zA-Z0-9_./-]+\.glb$/.test(p.model) || p.model.includes('..')) return null;
  if (!Array.isArray(heights) || heights.length < 1 || heights.length > 6 || !Array.isArray(centers) || centers.length !== heights.length) return null;
  if (heights.some((n, i) => typeof n !== 'number' || !Number.isFinite(n) || n < .1 || n > 5 || (i > 0 && n <= heights[i - 1]))) return null;
  // Keep every tray inside the established three-foot browsing footprint.
  if (centers.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < .5 || n > (p.terraced === true ? 1.38 : 1.25))) return null;
  if (typeof p.coreHeight !== 'number' || !Number.isFinite(p.coreHeight) || p.coreHeight < heights[heights.length - 1] + .5 || p.coreHeight > 6) return null;
  if (typeof p.lean !== 'number' || !Number.isFinite(p.lean) || p.lean < -.65 || p.lean > 0) return null;
  const columns = p.shelfColumns;
  if (columns !== undefined && (!Array.isArray(columns) || columns.length !== heights.length || columns.some(n => !Number.isInteger(n) || n < 1 || n > 5))) return null;
  if (p.terraced === true && centers.some((n, i) => i > 0 && n >= centers[i - 1])) return null;
  if (p.terraced === true && centers.some((n, i) => n - .15 + ((heights[i + 1] ?? p.coreHeight as number) - heights[i]) * Math.tan(p.lean as number) <= .1)) return null;
  return { terraced: p.terraced === true, light: p.light === true, shelfColumns: Array.isArray(columns) ? columns.slice() : undefined, model: p.model, coreHeight: p.coreHeight, shelfHeights: heights.slice(), shelfCenters: centers.slice(), lean: p.lean, dark: p.dark === true, topper: p.topper !== false };
}

const installed: Record<string, Record<string, FloorDisplayProfile>> = Object.create(null);
export function installFloorDisplayProfiles(value: unknown): void {
  for (const era of Object.keys(installed)) delete installed[era];
  if (!value || typeof value !== 'object') return;
  for (const [era, entries] of Object.entries(value)) {
    if (!entries || typeof entries !== 'object') continue;
    for (const [id, candidate] of Object.entries(entries)) {
      const profile = parseFloorDisplayProfile(candidate);
      if (profile) (installed[era] ??= Object.create(null))[id] = profile;
    }
  }
}

export function localFloorDisplayProfile(id: string, era = ''): FloorDisplayProfile | null {
  try {
    const profiles = JSON.parse(localStorage.getItem('bb_floor_display_profiles') || '{}');
    const override = parseFloorDisplayProfile(profiles[era]?.[id] ?? profiles[id]);
    if (override) return override;
  } catch { /* A malformed saved override must not hide an installed profile. */ }
  return installed[era]?.[id] ?? installed[era]?.['*'] ?? null;
}
