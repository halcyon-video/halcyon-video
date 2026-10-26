/** Measurements shared with tools/models/studio-island.py — change both
 * together. Feet; origin at the floor centre; local +Z and -Z are the two
 * stocked faces. Gables taper above the shoulder, so higher shelves are
 * shallower and their rails step back. */
export const STUDIO_ISLAND = {
  halfWidth: 1.6, laminate: 0.0625, foot: 1.0, shoulder: 0.5, top: 4.3, topZ: 0.36, spine: 0.06,
  lean: 0.2, lip: 0.12, rail: 0.02, deckY: [0.75, 1.85, 2.95], columns: 4, headerHeight: 0.85, headerZ: 0.1,
} as const;

export interface StudioIslandRow { deckFrontY: number; deckBackY: number; railFrontZ: number }

export function studioIslandRows(): StudioIslandRow[] {
  const s = STUDIO_ISLAND;
  const gableZ = (y: number) => s.foot - Math.max(0, y - s.shoulder) * (s.foot - s.topZ) / (s.top - s.shoulder);
  return s.deckY.map(deckFrontY => {
    const railFrontZ = gableZ(deckFrontY + s.lip) - 0.02;
    const depth = railFrontZ - s.rail - s.spine;
    return { deckFrontY, deckBackY: deckFrontY - depth * Math.tan(s.lean), railFrontZ };
  });
}

/** Local centre of a copy on shelf `row` of the +Z face (negate x and z for
 * the -Z face): its front edge rests behind the rail, leaning with the deck. */
export function studioIslandCase(row: number, col: number, caseHeight: number, caseDepth: number, spacing: number) {
  const s = STUDIO_ISLAND, r = studioIslandRows()[row];
  const back = 0.02 + caseDepth / 2, lift = caseHeight / 2 + 0.005;
  const z = r.railFrontZ - s.rail - back * Math.cos(s.lean), y = r.deckFrontY - back * Math.sin(s.lean);
  return { x: (col - (s.columns - 1) / 2) * spacing, y: y + lift * Math.cos(s.lean), z: z - lift * Math.sin(s.lean) };
}
