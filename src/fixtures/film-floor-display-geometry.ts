/** Measurements shared with tools/models/film-floor-display.py — change both
 * together. Feet; origin at the floor centre of the base; local +Z faces the
 * customer. The side panels taper from `footZ` at the kick to `topFrontZ` at
 * the top, and each tray's apron sits just inside that line. */
export const FILM_DISPLAY = {
  board: 0.024, halfWidth: 1.05, backZ: -0.5, footZ: 0.5, kick: 0.4, top: 4.46, topFrontZ: 0.04,
  tilt: 0.2, lip: 0.15, apron: 0.08, firstDeckY: 0.66, pitch: 0.95, rows: 4, columns: 3, headerHeight: 0.82,
} as const;

export interface FilmDisplayRow { deckFrontY: number; deckBackY: number; apronFrontZ: number }

export function filmDisplayRows(): FilmDisplayRow[] {
  const d = FILM_DISPLAY;
  const zFront = (y: number) => d.footZ - (y - d.kick) * (d.footZ - d.topFrontZ) / (d.top - d.kick);
  return Array.from({ length: d.rows }, (_, k) => {
    const deckFrontY = d.firstDeckY + k * d.pitch, apronFrontZ = zFront(deckFrontY + d.lip) - 0.01;
    const deckDepth = apronFrontZ - d.board - (d.backZ + 2 * d.board);
    return { deckFrontY, deckBackY: deckFrontY - deckDepth * Math.tan(d.tilt), apronFrontZ };
  });
}

/** Local centre of a face-out case on raked tray `row`: its front edge rests
 * just behind the apron and it leans back with the deck. */
export function filmDisplayCaseCenter(row: number, col: number, caseHeight: number, caseDepth: number, spacing: number) {
  const d = FILM_DISPLAY, r = filmDisplayRows()[row];
  const back = 0.02 + caseDepth / 2, lift = caseHeight / 2 + 0.005;
  const z = r.apronFrontZ - d.board - back * Math.cos(d.tilt), y = r.deckFrontY - back * Math.sin(d.tilt);
  return { x: (col - (d.columns - 1) / 2) * spacing, y: y + lift * Math.cos(d.tilt), z: z - lift * Math.sin(d.tilt) };
}
