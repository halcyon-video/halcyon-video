/** Measurements shared with tools/models/spotlight-column.py — change both
 * together. Feet; origin at the floor centre; local +Z is the front face.
 * Copies lean back against the drum on raked ledge rings, twelve per ring:
 * three columns on each of four quarter faces. */
export const SPOTLIGHT_COLUMN = {
  drumRadius: 0.95, ledgeRadius: 1.22, rimThickness: 0.025, lean: 0.2, ledgeY: [1.25, 2.25, 3.25],
  columns: 3, faces: 4, step: Math.PI / 6, marqueeSize: 2.2, marqueeBottomY: 4.45, marqueeHeight: 0.8,
} as const;

/** Angle (from local +Z toward +X) of a column on a quarter face. */
export function spotlightColumnAngle(face: number, col: number): number {
  const c = SPOTLIGHT_COLUMN;
  return face * Math.PI / 2 + (col - (c.columns - 1) / 2) * c.step;
}

/** Radial position and height of a copy's centre on ledge `row`: its top
 * back edge rests against the drum and its bottom sits on the raked deck. */
export function spotlightColumnCase(row: number, caseHeight: number, caseDepth: number) {
  const c = SPOTLIGHT_COLUMN, sin = Math.sin(c.lean), cos = Math.cos(c.lean);
  const bottom = c.drumRadius + 0.008 + (caseDepth / 2) * cos + caseHeight * sin;
  const deckY = c.ledgeY[row] + (bottom - c.drumRadius) * Math.tan(c.lean);
  const lift = caseHeight / 2 + 0.005;
  return { radius: bottom - lift * sin, y: deckY + lift * cos, deckY };
}
