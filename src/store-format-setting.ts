// The "Store Format" row in the settings drawer.
//
// Its own module rather than another block inside settings.ts for two reasons.
// The first is the ordinary one: settings.ts is already the drawer's registry
// AND the paint code for half a dozen custom panels, and this feature's row has
// a genuinely unusual apply mode that wants explaining where someone will find
// it. The second is that store-format.ts CANNOT import settings.ts — the format
// is read at module-evaluation time by store-layout.ts, and settings.ts sits
// downstream of that through themes.ts, so registering from there would be a
// cycle. This module is the seam: it depends on both and nothing depends on it.
import { registerSetting } from './settings';
import { STORE_FORMATS, STORE_FORMAT_KEY, DEFAULT_STORE_FORMAT } from './store-format';

/** Register the Store Format row. Called once from registerCoreSettings(). */
export function registerStoreFormatSetting(): void {
  registerSetting({
    key: STORE_FORMAT_KEY,
    label: 'Store Format',
    kind: 'cycle',
    group: 'Store Look',
    values: Object.values(STORE_FORMATS).map((f) => ({ id: f.id, label: f.name })),
    default: DEFAULT_STORE_FORMAT,
    // 'reload', not 'rebuild-scene' — and this is the one setting in the drawer
    // where that is not laziness.
    //
    // The format is resolved ONCE, when store-layout.ts's module body runs, and
    // that module then derives real constants from it: how many shelf tiers a
    // unit has, and from that UNIT_SIDE_CAPACITY, UNIT_CAPACITY,
    // SECTION_CAPACITY, TINY_LIBRARY_MOVIES. A dozen modules capture those at
    // import time. A scene rebuild would put nine-tier shelving on the floor
    // while every one of those consumers still believed a unit face holds sixty
    // cases — so the store would be built and stocked to two different sets of
    // numbers. Re-entering through a page load is what keeps them one set.
    // See the header of store-format.ts.
    applyMode: 'reload',
    hint: 'The kind of store this is. Changes the floor plan, not just the finishes — reloads.',
    subpage: 'Building & Storefront',
  });
}
