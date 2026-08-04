// T23 — Rental-mode clock math: the pure weekday/weekend capacity + unlock-time
// rules, and the `bb_rental` localStorage record helpers.
//
// This module is deliberately dependency-free (no three.js, no DOM beyond a
// guarded localStorage) so the rules can be unit-tested straight under
// `node --test` (npm run test:rental). All clock math is LOCAL time — the
// store closes when YOUR town's video store closes.
//
// Rules (ticket T23, exact):
//   - Weeknight rental (checkout any time outside the weekend window):
//     limit 2 tapes, locked out until 12:00 noon the NEXT day.
//   - Weekend rental (checkout Friday >= 17:00 local, or any time
//     Saturday/Sunday): limit 4 tapes, locked out until Monday 08:00.
//   - Dev timer (settings/harness): 5 minutes instead, for testing the loop.
//
// `unlockAt` is computed ONCE at checkout and persisted; boot only compares
// wall clock against the stored instant — never re-derives the rule.

export const RENTAL_STORAGE_KEY = 'bb_rental';

/** Dev-timer lockout: 5 minutes (ticket-mandated test loop). */
export const DEV_LOCKOUT_MS = 5 * 60 * 1000;

export const WEEKNIGHT_CAPACITY = 2;
export const WEEKEND_CAPACITY = 4;

export type RentalWindow = 'weeknight' | 'weekend';

export interface RentalRecord {
  /** Rented item ids (Jellyfin/harness movie ids), checkout order. */
  items: string[];
  /** ISO timestamp of the checkout instant. */
  checkoutAt: string;
  /** ISO timestamp the lockout ends (computed once, at checkout). */
  unlockAt: string;
}

/**
 * Which rental window a wall-clock instant falls in. The weekend window is
 * Friday from 17:00 local onward, plus all of Saturday and Sunday.
 */
export function rentalWindowAt(at: Date): RentalWindow {
  const day = at.getDay(); // 0 = Sunday … 6 = Saturday
  if (day === 0 || day === 6) return 'weekend';
  if (day === 5 && at.getHours() >= 17) return 'weekend';
  return 'weeknight';
}

/** Carry limit in effect at an instant: 2 on weeknights, 4 in the weekend window. */
export function rentalCapacityAt(at: Date): number {
  return rentalWindowAt(at) === 'weekend' ? WEEKEND_CAPACITY : WEEKNIGHT_CAPACITY;
}

/**
 * When a rental checked out at `checkoutAt` unlocks:
 *   - weeknight → 12:00 noon the next calendar day
 *   - weekend   → the coming Monday, 08:00
 * Built with calendar-component Date constructors (not ms arithmetic) so a
 * DST transition inside the lockout still lands on the literal wall-clock
 * "noon"/"8 AM".
 */
export function unlockTimeFor(checkoutAt: Date): Date {
  if (rentalWindowAt(checkoutAt) === 'weekend') {
    // Days until the coming Monday: Fri(5)→3, Sat(6)→2, Sun(0)→1.
    const day = checkoutAt.getDay();
    const daysToMonday = day === 5 ? 3 : day === 6 ? 2 : 1;
    return new Date(
      checkoutAt.getFullYear(), checkoutAt.getMonth(), checkoutAt.getDate() + daysToMonday,
      8, 0, 0, 0,
    );
  }
  return new Date(
    checkoutAt.getFullYear(), checkoutAt.getMonth(), checkoutAt.getDate() + 1,
    12, 0, 0, 0,
  );
}

/** Build the persistable record for a checkout happening at `checkoutAt`. */
export function makeRentalRecord(items: string[], checkoutAt: Date, devTimer: boolean): RentalRecord {
  const unlock = devTimer
    ? new Date(checkoutAt.getTime() + DEV_LOCKOUT_MS)
    : unlockTimeFor(checkoutAt);
  return {
    items: [...items],
    checkoutAt: checkoutAt.toISOString(),
    unlockAt: unlock.toISOString(),
  };
}

/** True while `now` is still before the record's stored unlock instant. */
export function isLockedOut(record: RentalRecord, now: Date): boolean {
  const unlock = Date.parse(record.unlockAt);
  return Number.isFinite(unlock) && now.getTime() < unlock;
}

/** Milliseconds until unlock (clamped >= 0). */
export function msUntilUnlock(record: RentalRecord, now: Date): number {
  const unlock = Date.parse(record.unlockAt);
  if (!Number.isFinite(unlock)) return 0;
  return Math.max(0, unlock - now.getTime());
}

/**
 * Parse + validate a raw `bb_rental` string. Returns null for anything that
 * isn't a well-formed record (corrupt JSON, wrong shapes, unparseable dates)
 * so a bad write can never wedge the boot path into a broken lockout.
 */
export function parseRentalRecord(raw: string | null): RentalRecord | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<RentalRecord>;
    if (!obj || typeof obj !== 'object') return null;
    if (!Array.isArray(obj.items) || obj.items.some((i) => typeof i !== 'string')) return null;
    if (typeof obj.checkoutAt !== 'string' || !Number.isFinite(Date.parse(obj.checkoutAt))) return null;
    if (typeof obj.unlockAt !== 'string' || !Number.isFinite(Date.parse(obj.unlockAt))) return null;
    return { items: obj.items, checkoutAt: obj.checkoutAt, unlockAt: obj.unlockAt };
  } catch {
    return null;
  }
}

/** Format the unlock instant for the diegetic DUE BACK note, e.g. "MON 8:00 AM". */
export function formatUnlockLabel(record: RentalRecord): string {
  const t = Date.parse(record.unlockAt);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${dayNames[d.getDay()]} ${h}:${mm} ${ampm}`;
}

// ── localStorage plumbing (guarded so the pure math above stays node-testable) ──

export function loadRentalRecord(): RentalRecord | null {
  if (typeof localStorage === 'undefined') return null;
  return parseRentalRecord(localStorage.getItem(RENTAL_STORAGE_KEY));
}

export function saveRentalRecord(record: RentalRecord): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RENTAL_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage full/unavailable — the lockout still runs this session, it just
    // won't survive a restart.
  }
}

export function clearRentalRecord(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(RENTAL_STORAGE_KEY);
}
