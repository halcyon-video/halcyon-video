/** Authored identities, never inferred from age, gender or clothing at runtime. */
export interface CustomerPreference { favored: readonly string[]; secondary: readonly string[] }
export const CUSTOMER_PREFERENCES: Readonly<Record<string, CustomerPreference>> = {
  'customer-01': { favored: ['comedy'], secondary: ['family'] },
  'customer-02': { favored: ['drama'], secondary: ['documentary'] },
  'customer-03': { favored: ['romance'], secondary: ['comedy'] },
  'customer-04': { favored: ['action'], secondary: ['adventure'] },
  'customer-05': { favored: ['horror'], secondary: ['thrillers'] },
  'customer-06': { favored: ['science fiction'], secondary: ['fantasy'] },
  'customer-07': { favored: ['thrillers'], secondary: ['drama'] },
  'customer-08': { favored: ['games'], secondary: ['animation'] },
  'customer-09': { favored: ['documentary'], secondary: ['drama'] },
  'customer-10': { favored: ['animation'], secondary: ['family'] },
};
export function customerDepartment(label: string): string {
  const value = label.toLowerCase().trim();
  if (/game|nintendo|playstation|snes|genesis|sega|xbox|steam/.test(value)) return 'games';
  if (/thriller|suspense/.test(value)) return 'thrillers';
  if (/action/.test(value)) return 'action';
  if (/sci.?fi|science fiction/.test(value)) return 'science fiction';
  if (/documentar/.test(value)) return 'documentary';
  if (/animat|anime/.test(value)) return 'animation';
  return value;
}
export function customerPreference(id: string): CustomerPreference {
  return CUSTOMER_PREFERENCES[id] ?? { favored: [], secondary: [] };
}
export function customerPreferenceWeight(profile: CustomerPreference, departments: readonly string[]): number {
  if (departments.some(d => profile.favored.includes(customerDepartment(d)))) return 6;
  if (departments.some(d => profile.secondary.includes(customerDepartment(d)))) return 3;
  return 1;
}
