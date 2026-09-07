// New Releases ribbon BAYS — the physical sections the shelf-run builder cuts
// with its divider panels, expressed as GLOBAL ribbon column ranges.
//
// The ribbon is one column index across up to four wall runs (the left-wall
// unit, then back-wall Runs 1-3), but every run is cut into bays on its OWN
// axis: a divider every SECTION_COLS from the run's first column, with the
// leftover forming a narrower trailing bay against the run's end panel
// (store-shell.ts buildShelfRun, the ticket toppers and nrDividerNudge all use
// that per-run math). Run column counts come from floor((length - 1) /
// BOX_SPACING) and are almost never multiples of six, so title sections dealt
// across the global ribbon from col 0 drifted off the bays: past the first
// short run one title showed two copies at the end of a bay and four at the
// start of the next, and a section could straddle the corner between runs.
// Owner's rule (2026-09-06): a title lives in exactly one bay, unless it takes
// two whole neighbouring bays as a double feature.
//
// Pure math, no three.js — node-testable (tests/nr-bays.test.ts).
import { SECTION_COLS } from './store-layout.ts';

export interface NrBay {
  /** Index of the wall run this bay sits on, in ribbon order. */
  runIdx: number;
  /** First GLOBAL ribbon column of the bay. */
  startCol: number;
  /** Last GLOBAL ribbon column of the bay (inclusive). */
  endCol: number;
  /** Column count: SECTION_COLS for a full bay, fewer for a trailing partial. */
  cols: number;
  /** True when the bay is a full SECTION_COLS wide — features go there only. */
  full: boolean;
}

/** Cut the ribbon into bays exactly as the run builder places its dividers. */
export function nrBaysForRuns(runCols: number[]): NrBay[] {
  const bays: NrBay[] = [];
  let startCol = 0;
  runCols.forEach((cols, runIdx) => {
    for (let local = 0; local < cols; local += SECTION_COLS) {
      const width = Math.min(SECTION_COLS, cols - local);
      bays.push({
        runIdx,
        startCol: startCol + local,
        endCol: startCol + local + width - 1,
        cols: width,
        full: width === SECTION_COLS,
      });
    }
    startCol += Math.max(0, cols);
  });
  return bays;
}

export interface NrBayPlan {
  /** Bay indices where a double-feature starts; it occupies that bay AND the next. */
  doubleStarts: number[];
  /** Bay indices carrying a super-feature. */
  superBays: number[];
  /** Every remaining bay (partial ones included), in ribbon order: one title per row. */
  regularBays: number[];
}

/**
 * Hand feature sections to bays in ribbon order without ever letting a title
 * cross a divider or a corner: a double-feature takes the first pair of FULL
 * bays that sit side by side on the SAME run, a super-feature the next free
 * full bay, and everything left shows one title per shelf tier.
 * `wantDoubles` / `wantSupers` are upper bounds — the geometry may fit fewer.
 */
export function planNrBays(bays: NrBay[], wantDoubles: number, wantSupers: number): NrBayPlan {
  const taken = new Array<boolean>(bays.length).fill(false);
  const doubleStarts: number[] = [];
  for (let i = 0; i + 1 < bays.length && doubleStarts.length < wantDoubles; i++) {
    if (taken[i] || !bays[i].full || !bays[i + 1].full || bays[i].runIdx !== bays[i + 1].runIdx) continue;
    doubleStarts.push(i);
    taken[i] = taken[i + 1] = true;
    i++;
  }
  const superBays: number[] = [];
  for (let i = 0; i < bays.length && superBays.length < wantSupers; i++) {
    if (taken[i] || !bays[i].full) continue;
    superBays.push(i);
    taken[i] = true;
  }
  const regularBays: number[] = [];
  for (let i = 0; i < bays.length; i++) if (!taken[i]) regularBays.push(i);
  return { doubleStarts, superBays, regularBays };
}
