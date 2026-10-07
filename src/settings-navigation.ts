import type { SettingDef, SettingGroup } from './settings';

export const GROUP_HINTS: Record<SettingGroup, string> = {
  'Catalog': 'Choose streaming apps, carried libraries, and the catalog date.',
  'Store Look': 'Store era, time of day, shelves, cases, and building.',
  'Store Brand': 'Design your store logo and signage.',
  'Browsing & Rentals': 'Camera, checkout, quick playback, and rental limits.',
  'Playback': 'Movie audio, captions, and playback device.',
  'Overhead TVs': 'Choose programs, library feeds, and fallback behavior.',
  'Video Games': 'Game catalog and console platforms.',
  'Performance': 'Graphics quality, display mode, and frame rate.',
  'Connection': 'Media servers, requests, and remote connections.',
};
export const SUBPAGE_HINTS: Record<string, string> = {
  'Movie Cases': 'Media format and rental cover designs.',
  'Color & Lighting': 'Color response, warmth, and film look.',
  'Building & Storefront': 'Ceiling, walls, floor, bulbs, and storefront.',
  'Platforms': 'Which consoles appear on the games shelf.',
  'Store Libraries': 'Which server libraries are stocked.',
  'Library Feeds': 'Which libraries supply overhead TV programs.',
};
/** One destination per choice; registration and saved keys stay compatible. */
export function organizeSetting(def: SettingDef): SettingDef {
  if (def.subpage === 'Browsing & Rentals' || def.key === 'bb_browse_camera')
    return { ...def, group: 'Browsing & Rentals', subpage: undefined };
  if (def.subpage === 'Overhead TVs')
    return { ...def, group: 'Overhead TVs', subpage: def.key.startsWith('bb_tvlib_') ? 'Library Feeds' : undefined };
  if (def.subpage === 'Store Libraries' || def.key === 'bb_streaming_enabled' || def.key === 'bb_studio_picks')
    return { ...def, group: 'Catalog' };
  if (def.key === 'bb_streaming_services') return { ...def, group: 'Catalog',
    visibleWhen: () => typeof localStorage !== 'undefined' && localStorage.getItem('bb_render_mode') === 'flat' };
  return def;
}
export const SETTINGS_ACTIONS = [
  { group: 'Catalog', id: 'btn-streaming', label: 'Choose Streaming Apps', hint: 'Tick the services you have. Save to restock the shelves.' },
  { group: 'Catalog', id: 'btn-media-date', label: 'Catalog Release Date', hint: 'Set the latest release date stocked by this store.' },
  { group: 'Overhead TVs', id: 'btn-overhead-tvs', label: 'Choose TV Programs', hint: 'Choose what each ceiling TV plays.' },
] as const;
