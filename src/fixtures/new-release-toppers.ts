// NEW RELEASES ticket toppers — the section markers on the New Releases wall.
//
// The 1990 store paints no lettering on its walls (owner ruling 2026-08-03;
// see wall-stripe-1990.ts, which leaves the wall carrying only the blue/gold
// stripe), so the wall bays are named the way the gondolas are: a ticket
// signboard card standing on the fixture top, ONE PER SECTION, printed "New
// Releases" — the same card, the same print, the same no-feet flush mount as
// the aisle section signboards (fixtures/ticket-board-sign.ts).
//
// Runs hand themselves in as they are built (store-shell.ts buildShelfRun);
// every card in the store then shares one material and one geometry.
import * as THREE from 'three';
import { getActiveTheme, type StoreTheme } from '../themes';
import { markSignMesh } from '../sign-builders';
import { BOX_SPACING, SECTION_COLS } from '../store-layout';
import {
  createTicketBoardLabelMaterial, TICKET_BOARD_W, TICKET_BOARD_H, TICKET_BOARD_T,
} from './ticket-board-sign';

/** The copy every card on this wall carries. */
const LABEL = 'New Releases';

/**
 * Single source of truth for the gate: the eras whose shelf toppers ARE this
 * ticket card. Later eras name the same wall in their own way — painted
 * lettering (bb-1993), gold star badges (bb-2000), the printed band
 * (bb-2010) — all built by fixtures/signage.ts, so a card here would double
 * up on them.
 */
export function newReleaseToppersActive(theme: StoreTheme = getActiveTheme()): boolean {
  return theme.topperStyle === 'ticket-board';
}

/** One wall-shelving run, in its own local space (X spans the run, +Z faces the store). */
export interface NrTopperRun {
  /** The run's group — cards are parented here, so they inherit its placement. */
  parent: THREE.Object3D;
  /** Run length in feet, the same value its shelf boards are cut to. */
  length: number;
  /** Local Y of the fixture top the cards stand on. */
  topY: number;
  /** Local Z of the fixture's front lip at that height. */
  frontZ: number;
  /** Card edges/back — the run's own shelf laminate. */
  sideMaterial: THREE.Material;
}

/**
 * Stand a "New Releases" ticket card on each section of each wall run. No-op
 * on every theme but the ticket-board era.
 */
export function buildNewReleaseToppers(runs: NrTopperRun[]): THREE.Mesh[] {
  if (runs.length === 0 || !newReleaseToppersActive()) return [];

  // One print and one card shape for the whole store: every card carries the
  // same copy, so this is a single material + geometry however many sections
  // the wall runs to.
  const faceMat = createTicketBoardLabelMaterial(LABEL);
  const geo = new THREE.BoxGeometry(TICKET_BOARD_W, TICKET_BOARD_H, TICKET_BOARD_T);
  const built: THREE.Mesh[] = [];

  for (const run of runs) {
    // Section math is the run's own (buildShelfRun's dividers and the movie
    // slots derive their columns exactly this way), so a card lands centred on
    // the bay its dividers frame rather than drifting off the run's ends.
    const runCols = Math.floor((run.length - 1.0) / BOX_SPACING);
    if (runCols <= 0) continue;
    const margin = (run.length - runCols * BOX_SPACING) / 2;
    const sections = Math.ceil(runCols / SECTION_COLS);

    for (let s = 0; s < sections; s++) {
      const startCol = s * SECTION_COLS;
      const endCol = Math.min(runCols - 1, startCol + SECTION_COLS - 1);
      const centerCol = (startCol + endCol) / 2;
      const x = -run.length / 2 + margin + (centerCol + 0.5) * BOX_SPACING;
      const card = markSignMesh(
        new THREE.Mesh(geo, [
          run.sideMaterial, run.sideMaterial, // ±X edges
          run.sideMaterial, run.sideMaterial, // ±Y edges
          faceMat,                            // +Z — the printed face, into the store
          run.sideMaterial,                   // -Z back
        ]),
        { casts: true }, // free-standing board: it does cast
      );
      // Bottom edge flush on the fixture top, set just back from the front lip
      // so the card stands ON the deck instead of overhanging its edge.
      card.position.set(x, run.topY + TICKET_BOARD_H / 2, run.frontZ - TICKET_BOARD_T);
      card.layers.set(1); // mirror-skip, like every other shelf topper
      run.parent.add(card);
      built.push(card);
    }
  }
  return built;
}
