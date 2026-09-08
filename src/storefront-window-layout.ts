export interface WindowBay {
  width: number;
  hasCenterMullion: boolean;
  /** Solid masonry before this pane, measured left to right. */
  masonryBefore?: number;
}

export function windowBaySpan(bays: WindowBay[]): number {
  return bays.reduce((sum, bay) => sum + bay.width + (bay.masonryBefore ?? 0), 0);
}

/** Preserve whole panes and their indices while splitting glass at masonry. */
export function windowBayLayout(bays: WindowBay[], entry?: { center: number; halfWidth: number }) {
  const half = Math.floor(bays.length / 2);
  const sides = entry ? [bays.slice(0, half), bays.slice(half)] : [bays];
  const runs: { lo: number; hi: number; widths: number[]; innerAtLo: boolean; innerAtHi: boolean }[] = [];
  const panes: { lo: number; hi: number }[] = [];
  const gaps: { lo: number; hi: number }[] = [];
  sides.forEach((side, index) => {
    let x = entry
      ? index === 0 ? entry.center - entry.halfWidth - windowBaySpan(side) : entry.center + entry.halfWidth
      : -windowBaySpan(side) / 2;
    let run: typeof runs[number] | undefined;
    side.forEach((bay, i) => {
      const gap = bay.masonryBefore ?? 0;
      if (gap > 0) {
        gaps.push({ lo: x, hi: x + gap });
        x += gap;
        run = undefined;
      }
      if (!run) {
        run = { lo: x, hi: x, widths: [], innerAtLo: !!entry && index === 1 && i === 0, innerAtHi: false };
        runs.push(run);
      }
      panes.push({ lo: x, hi: x + bay.width });
      x += bay.width;
      run.hi = x;
      run.widths.push(bay.width);
      run.innerAtHi = !!entry && index === 0 && i === side.length - 1;
    });
  });
  return { runs, panes, gaps, width: runs.length ? runs[runs.length - 1].hi - runs[0].lo : 0 };
}
