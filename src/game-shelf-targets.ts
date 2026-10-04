import type { SlottedFixture } from './fixtures';
export function gameShelfTargets(fixture: SlottedFixture) {
  if (fixture.placement.kind !== 'game-section') return [];
  const groups = new Map<string, ReturnType<SlottedFixture['getSlots']>>();
  for (const slot of fixture.getSlots()) {
    const label = slot.movie.platform;
    if (!label) continue;
    const key = `${slot.side}:${label}`;
    const slots = groups.get(key) ?? [];
    slots.push(slot); groups.set(key, slots);
  }
  return [...groups.values()].map(slots => ({
    label: slots[0].movie.platform!.toUpperCase(),
    side: slots[0].side as 'front' | 'back',
    col: Math.min(...slots.map(slot => slot.col)),
    x: slots.reduce((sum, slot) => sum + slot.restingX, 0) / slots.length,
    z: slots.reduce((sum, slot) => sum + slot.restingZ, 0) / slots.length,
  }));
}
