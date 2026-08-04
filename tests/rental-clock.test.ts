// T23 — unit tests for the pure rental-clock rules (weeknight/weekend
// capacity + unlock-time computation, record parsing).
//
//   npm run test:rental
//
// Runs under plain `node --test` with type stripping — no test framework.
// All dates below are LOCAL-time calendar constructors on a known week:
// Mon 2026-07-06 … Sun 2026-07-12 (2026-07-06 is a Monday).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rentalWindowAt,
  rentalCapacityAt,
  unlockTimeFor,
  makeRentalRecord,
  parseRentalRecord,
  isLockedOut,
  msUntilUnlock,
  formatUnlockLabel,
  DEV_LOCKOUT_MS,
} from '../src/rental-clock.ts';

const d = (day: number, hour: number, minute = 0) =>
  new Date(2026, 6, day, hour, minute, 0, 0); // July 2026; the 6th is a Monday

test('weeknight window: Tuesday evening is a weeknight, capacity 2', () => {
  const at = d(7, 20); // Tue 20:00
  assert.equal(rentalWindowAt(at), 'weeknight');
  assert.equal(rentalCapacityAt(at), 2);
});

test('weeknight unlock: Tuesday 20:00 checkout unlocks Wednesday 12:00', () => {
  assert.deepEqual(unlockTimeFor(d(7, 20)), d(8, 12));
});

test('weeknight unlock: just-after-midnight checkout still unlocks the NEXT day at noon', () => {
  // Mon 00:10 is a weeknight; "next day 12:00" is Tuesday noon.
  assert.deepEqual(unlockTimeFor(d(6, 0, 10)), d(7, 12));
});

test('Friday 16:59 is still a weeknight (limit 2, unlocks Saturday noon)', () => {
  const at = d(10, 16, 59); // Fri 16:59
  assert.equal(rentalWindowAt(at), 'weeknight');
  assert.equal(rentalCapacityAt(at), 2);
  assert.deepEqual(unlockTimeFor(at), d(11, 12)); // Sat 12:00
});

test('Friday 17:00 enters the weekend window: capacity 4, unlocks Monday 08:00', () => {
  const at = d(10, 17); // Fri 17:00 exactly
  assert.equal(rentalWindowAt(at), 'weekend');
  assert.equal(rentalCapacityAt(at), 4);
  assert.deepEqual(unlockTimeFor(at), d(13, 8)); // Mon 2026-07-13 08:00
});

test('Saturday checkout: weekend window, unlocks Monday 08:00', () => {
  const at = d(11, 14); // Sat 14:00
  assert.equal(rentalWindowAt(at), 'weekend');
  assert.equal(rentalCapacityAt(at), 4);
  assert.deepEqual(unlockTimeFor(at), d(13, 8));
});

test('Sunday 23:30 checkout: weekend window, unlocks the very next morning (Monday 08:00)', () => {
  const at = d(12, 23, 30); // Sun 23:30
  assert.equal(rentalWindowAt(at), 'weekend');
  assert.deepEqual(unlockTimeFor(at), d(13, 8));
});

test('Sunday 00:30 (small hours) is weekend too — store rules, not club rules', () => {
  const at = d(12, 0, 30); // Sun 00:30
  assert.equal(rentalWindowAt(at), 'weekend');
  assert.deepEqual(unlockTimeFor(at), d(13, 8));
});

test('unlock times land past month/year boundaries correctly', () => {
  // Fri 2026-12-31? No — 2026-12-31 is a Thursday. Use Thu 31 Dec 20:00
  // (weeknight): next day noon is Fri 2027-01-01 12:00.
  const at = new Date(2026, 11, 31, 20, 0, 0, 0);
  assert.deepEqual(unlockTimeFor(at), new Date(2027, 0, 1, 12, 0, 0, 0));
});

test('makeRentalRecord: dev timer overrides the rule with exactly 5 minutes', () => {
  const at = d(11, 14); // Saturday — real rule would be Monday 08:00
  const rec = makeRentalRecord(['a', 'b'], at, true);
  assert.equal(Date.parse(rec.unlockAt) - Date.parse(rec.checkoutAt), DEV_LOCKOUT_MS);
});

test('makeRentalRecord: real rule round-trips through ISO strings', () => {
  const at = d(7, 20);
  const rec = makeRentalRecord(['x'], at, false);
  assert.deepEqual(rec.items, ['x']);
  assert.equal(Date.parse(rec.checkoutAt), at.getTime());
  assert.equal(Date.parse(rec.unlockAt), d(8, 12).getTime());
});

test('isLockedOut / msUntilUnlock respect the stored instant (never re-derive)', () => {
  const rec = makeRentalRecord(['x'], d(7, 20), false); // unlocks Wed 12:00
  assert.equal(isLockedOut(rec, d(8, 11, 59)), true);
  assert.equal(isLockedOut(rec, d(8, 12)), false);
  assert.equal(msUntilUnlock(rec, d(8, 11, 59)), 60 * 1000);
  assert.equal(msUntilUnlock(rec, d(8, 13)), 0);
});

test('parseRentalRecord: accepts a well-formed record', () => {
  const rec = makeRentalRecord(['a', 'b'], d(10, 18), false);
  const parsed = parseRentalRecord(JSON.stringify(rec));
  assert.deepEqual(parsed, rec);
});

test('parseRentalRecord: rejects corrupt/malformed payloads', () => {
  assert.equal(parseRentalRecord(null), null);
  assert.equal(parseRentalRecord(''), null);
  assert.equal(parseRentalRecord('{not json'), null);
  assert.equal(parseRentalRecord('42'), null);
  assert.equal(parseRentalRecord('{"items":"nope","checkoutAt":"x","unlockAt":"y"}'), null);
  assert.equal(parseRentalRecord(JSON.stringify({ items: [1, 2], checkoutAt: new Date().toISOString(), unlockAt: new Date().toISOString() })), null);
  assert.equal(parseRentalRecord(JSON.stringify({ items: ['a'], checkoutAt: 'garbage', unlockAt: new Date().toISOString() })), null);
});

test('formatUnlockLabel: readable diegetic label', () => {
  const rec = makeRentalRecord(['a'], d(11, 14), false); // Sat → Mon 08:00
  assert.equal(formatUnlockLabel(rec), 'MON 8:00 AM');
  const rec2 = makeRentalRecord(['a'], d(7, 20), false); // Tue → Wed 12:00
  assert.equal(formatUnlockLabel(rec2), 'WED 12:00 PM');
});
