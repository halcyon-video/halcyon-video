// What a floor fixture is CALLED in navigation UI — one implementation shared
// by the entrance overview's floating cursors (store-overview.ts) and the jump
// index's DISPLAYS row (store-subnav.ts).
//
// It lived only in the jump index, so the overview fell back to raw placement
// ids and hung tickets reading "PV-DRAPE-TABLE-FRONT" and "PROMO-STAND-BACK"
// over the store — engineering identifiers, in the biggest type on screen,
// while the index called the same two fixtures "PREVIOUSLY VIEWED" and
// "SUMMER SMASH HITS". Same fixtures, same store, two different names.
import type { SlottedFixture } from './fixtures';

/**
 * A fixture's live identity string: a promo stand's current campaign topper, a
 * bin's name, an endcap's title — the same one the browse HUD names it by. The
 * placement option and then the id are fallbacks, and an id only ever surfaces
 * for a fixture that named itself nothing at all.
 */
export function slottedFixtureLabel(f: SlottedFixture): string {
  const p = f.placement;
  return (f.genre || (p.options?.genre as string) || p.id || 'display').toUpperCase();
}

/**
 * Qualify repeated labels IN PLACE. Several fixtures share a title in an
 * uncategorized store (every genre endcap falls back to "Related Movies", every
 * game gondola to "Video Games"), and a row of identical tickets is unusable.
 * Prefer the aisle a repeat belongs to; a qualifier that just repeats the title
 * ("MOVIES · MOVIES") disambiguates nothing, so those get numbered instead.
 *
 * Call it after the caller's own ordering pass — the numbering follows list
 * order, so it should be the order the player actually steps through.
 */
export function qualifyDuplicateLabels<T extends { label: string }>(
  items: T[],
  fixtureOf: (item: T) => SlottedFixture | undefined,
): void {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.label, (counts.get(it.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const it of items) {
    if ((counts.get(it.label) ?? 0) < 2) continue;
    const base = it.label;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const lib = fixtureOf(it)?.placement.options?.libraryName as string | undefined;
    const qual = lib && lib.toUpperCase() !== base ? lib.toUpperCase() : null;
    it.label = qual ? `${base} · ${qual}` : `${base} ${n}`;
  }
}
