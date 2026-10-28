/**
 * Which of a platform's roms get a shelf slot (GH #406).
 *
 * The budgeted games department used to rank only the first page of an
 * alphabetical fetch, so a big platform shelved "best of A–C". Now the whole
 * platform list comes in and this picks from it: rated roms first, highest
 * rating first; the remaining slots are filled by unrated roms in a seeded
 * shuffle, so they spread across the whole alphabet instead of following name
 * order. The shuffle is a pure function of (seed, rom id), so the same visit
 * always shelves the same stock and a rebuild never reshuffles.
 */

const VISIT_SEED_KEY = 'romm_visit_seed';

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Seed for this store visit: stable for the browser tab's session, renewed on
 * a new session or a new calendar day. Falls back to the date alone where
 * sessionStorage is unavailable.
 */
export function stockVisitSeed(now: Date = new Date()): string {
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  try {
    const stored = sessionStorage.getItem(VISIT_SEED_KEY);
    if (stored && stored.startsWith(day + ':')) return stored;
    const fresh = `${day}:${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(VISIT_SEED_KEY, fresh);
    return fresh;
  } catch {
    return day;
  }
}

export function pickShelfStock<T extends { id: number | string; rating?: number | null }>(
  roms: T[],
  count: number,
  seed: string
): T[] {
  const keyed = roms.map((rom) => ({ rom, key: hash32(`${seed}|${rom.id}`), rating: rom.rating || 0 }));
  keyed.sort((a, b) => {
    if ((b.rating > 0 ? 1 : 0) !== (a.rating > 0 ? 1 : 0)) return b.rating > 0 ? 1 : -1;
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.key - b.key;
  });
  return keyed.slice(0, count).map((k) => k.rom);
}
