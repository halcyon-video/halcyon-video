import { assetUrl, HOSTED_BUILD } from './asset-url';
import { NR_BAY_WIDTH, type NrRun } from './nr-run-layout';
import { NR_SECTION_COLS, WALL_SHELF_HEIGHTS } from './store-layout';

interface Profile { era: string; sourceBays: number; bays: number; heights: number[]; depth: number }
let profile: Profile | null = null;

/** Local furniture dimensions settle before the wall and its stock are built. */
export async function loadWallBankProfile(): Promise<void> {
  profile = null;
  if (HOSTED_BUILD) return;
  try {
    const response = await fetch(assetUrl('user-assets/fixtures/tv-wall-bank-remodel/shelves.json'), { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return;
    const p = await response.json();
    if (typeof p.era !== 'string' || !Number.isInteger(p.sourceBays) || p.sourceBays < 1 || p.sourceBays > 3 ||
        !Number.isInteger(p.bays) || p.bays < 1 || p.bays > 4 || !Array.isArray(p.heights) || p.heights.length !== WALL_SHELF_HEIGHTS.length ||
        p.heights.some((y: unknown, i: number) => typeof y !== 'number' || !Number.isFinite(y) || y < .4 || y > 7.5 || (i > 0 && y - p.heights[i - 1] < .75)) ||
        typeof p.depth !== 'number' || !Number.isFinite(p.depth) || p.depth < 1.1 || p.depth > 1.6) return;
    profile = p;
  } catch { /* Missing or invalid local geometry leaves the original wall intact. */ }
}

export function wallBankShelfPlan(runs: NrRun[], era: string) {
  if (!profile || profile.era !== era) return null;
  const run = runs.find(r => r.yaw === 0 && r.cols >= profile!.sourceBays * NR_SECTION_COLS);
  if (!run) return null;
  const left = run.x - run.length / 2;
  const firstBay = Math.max(0, Math.min(run.cols / NR_SECTION_COLS - profile.sourceBays,
    Math.round((11 - left) / NR_BAY_WIDTH - profile.sourceBays / 2)));
  const width = profile.sourceBays * NR_BAY_WIDTH;
  return { ...profile, run, firstBay, width, x: left + firstBay * NR_BAY_WIDTH + width / 2,
    startCol: run.startCol + firstBay * NR_SECTION_COLS, cols: profile.sourceBays * NR_SECTION_COLS };
}
export type WallBankShelfPlan = NonNullable<ReturnType<typeof wallBankShelfPlan>>;

/** Preserve every title and row, distributing existing columns between the replacement bays. */
export function wallBankShelfSlot(plan: WallBankShelfPlan | null, col: number, row: number) {
  if (!plan || col < plan.startCol || col >= plan.startCol + plan.cols) return null;
  let index = col - plan.startCol;
  for (let bay = 0; bay < plan.bays; bay++) {
    const count = Math.floor(plan.cols / plan.bays) + (bay < plan.cols % plan.bays ? 1 : 0);
    if (index < count || bay === plan.bays - 1) {
      const width = plan.width / plan.bays;
      const spacing = Math.min(.58, (width - .56) / Math.max(1, count - 1));
      return { x: plan.x - plan.width / 2 + (bay + .5) * width + (index - (count - 1) / 2) * spacing,
        y: plan.heights[row] ?? plan.heights[0], z: plan.run.z + plan.depth - .14, rotationY: 0 };
    }
    index -= count;
  }
  return null;
}
