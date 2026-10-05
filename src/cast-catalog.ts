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
export const CUSTOMER_SETTING: SettingDef = {
  key: 'bb_customers', label: 'Customers', kind: 'cycle', group: 'Store Look',
  values: [{ id: 'quiet', label: 'A Few Browsers' }, { id: 'busy', label: 'All Ten Regulars' }, { id: 'off', label: 'Off' }],
  default: 'quiet', applyMode: 'rebuild-scene', hint: 'Regulars browse the stocked aisles.',
};
export function resolveClerkIdentity(value: unknown): 'clerk-a' | 'clerk-b' {
  return value === 'clerk-b' ? 'clerk-b' : 'clerk-a';
}
export function customerCount(value: unknown): number {
  return value === 'off' ? 0 : value === 'busy' ? 10 : 3;
}
/** All ten identities participate in quiet stores, with no duplicate per visit. */
export function customerRoster(value: unknown, offset = 0): readonly string[] {
  const start = ((Math.trunc(offset) % CUSTOMER_IDS.length) + CUSTOMER_IDS.length) % CUSTOMER_IDS.length;
  return Array.from({ length: customerCount(value) }, (_, i) => CUSTOMER_IDS[(start + i) % CUSTOMER_IDS.length]);
}
