import type { SettingDef } from './settings';

export const CUSTOMER_IDS = [
  'customer-01', 'customer-02', 'customer-03', 'customer-04', 'customer-05',
  'customer-06', 'customer-07', 'customer-08', 'customer-09', 'customer-10',
] as const;
export const CLERK_IDENTITY_SETTING: SettingDef = {
  key: 'bb_clerk_identity', label: 'Clerk', kind: 'cycle', group: 'Store Look',
  values: [{ id: 'clerk-a', label: 'Chestnut Bob' }, { id: 'clerk-b', label: 'Black Quiff' }],
  default: 'clerk-a', applyMode: 'rebuild-scene', hint: 'Choose the employee working this store.',
};
export function resolveClerkIdentity(value: unknown): 'clerk-a' | 'clerk-b' {
  return value === 'clerk-b' ? 'clerk-b' : 'clerk-a';
}
export function customerCount(value: unknown): number {
  return value === 'morning' ? 2 : value === 'sunset' ? 8 : value === 'night' ? 5 : 4;
}
/** All ten identities participate in the time-of-day rotation, with no duplicate per visit. */
export function customerRoster(value: unknown, offset = 0): readonly string[] {
  const start = ((Math.trunc(offset) % CUSTOMER_IDS.length) + CUSTOMER_IDS.length) % CUSTOMER_IDS.length;
  return Array.from({ length: customerCount(value) }, (_, i) => CUSTOMER_IDS[(start + i) % CUSTOMER_IDS.length]);
}

/** Asymmetric ink must stay on the anatomical left arm through every turn. */
export function customerAtlasRows(id: string): 5 | 8 {
  return id === 'customer-06' ? 8 : 5;
}
export function customerSpriteFacing(id: string, octant: number): { row: number; flip: boolean } {
  return customerAtlasRows(id) === 8
    ? { row: octant, flip: false }
    : { row: octant <= 4 ? octant : 8 - octant, flip: octant > 4 };
}
