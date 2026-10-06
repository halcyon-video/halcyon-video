/** Authored identities, never inferred from age, gender or clothing at runtime. */
import type { SettingDef } from './settings';
export interface CustomerPreference { favored: readonly string[]; secondary: readonly string[] }
export const CUSTOMER_PREFERENCES: Readonly<Record<string, CustomerPreference>> = {
  'customer-01': { favored: [], secondary: [] },
  'customer-02': { favored: [], secondary: [] },
  'customer-03': { favored: [], secondary: [] },
  'customer-04': { favored: ['action'], secondary: [] },
  'customer-05': { favored: [], secondary: [] },
  'customer-06': { favored: [], secondary: [] },
  'customer-07': { favored: ['thrillers'], secondary: [] },
  'customer-08': { favored: ['games'], secondary: [] },
  'customer-09': { favored: [], secondary: [] },
  'customer-10': { favored: [], secondary: [] },
};
export function customerDepartment(label: string): string {
  const value = label.toLowerCase().trim();
  if (/game|nintendo|playstation|snes|genesis|sega|xbox|steam/.test(value)) return 'games';
  if (/thriller|suspense/.test(value)) return 'thrillers';
  if (/action/.test(value)) return 'action';
  return value;
}
export const CUSTOMER_PREFERENCE_SETTINGS: SettingDef[] = [
  ['01','Orange Jacket'],['02','Sweater Vest'],['03','Mustard Sweater'],['04','Plaid Shirt'],['05','Plum Bomber'],
  ['06','Brown Vest'],['07','Rose Cardigan'],['08','Windbreaker'],['09','Green Overshirt'],['10','Bowling Shirt'],
].map(([id,name])=>({key:`bb_customer_favorite_${id}`,label:`${name} Browsing`,kind:'cycle',group:'Store Look',
  values:[{id:'auto',label:'Regular’s Choice'},{id:'all',label:'Any Stocked Department'},{id:'games',label:'Video Games'},
    {id:'thrillers',label:'Suspense / Thrillers'},{id:'action',label:'Action'}],default:'auto',applyMode:'rebuild-scene',
  hint:'An individual preference; other stocked shelves remain available.'}));
export function customerPreference(id: string, raw?: string | null, favorite?: string | null): CustomerPreference {
  const fallback = CUSTOMER_PREFERENCES[id] ?? { favored: [], secondary: [] };
  if(favorite==='all')return {favored:[],secondary:[]};
  if(favorite && ['games','thrillers','action'].includes(favorite))return {favored:[favorite],secondary:[]};
  try {
    const entry = raw ? JSON.parse(raw)?.[id] : null;
    if (!entry || typeof entry !== 'object') return fallback;
    const list = (value: unknown, original: readonly string[]) => Array.isArray(value)
      ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 80).slice(0, 16).map(customerDepartment))]
      : original;
    return { favored: list(entry.favored, fallback.favored), secondary: list(entry.secondary, fallback.secondary) };
  } catch { return fallback; }
}
export function customerPreferenceWeight(profile: CustomerPreference, departments: readonly string[]): number {
  if (departments.some(d => profile.favored.includes(customerDepartment(d)))) return 6;
  if (departments.some(d => profile.secondary.includes(customerDepartment(d)))) return 3;
  return 1;
}
