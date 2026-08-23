// Which FILE a brand font name actually paints in.
//
// The brand editor's family picker (settings.ts BRAND_FONTS) stores display
// names, and two of them used to arrive only over a Google-Fonts @import in
// styles.css — i.e. never on an offline kiosk boot, where the emblem then
// painted in whatever the system sans is and nothing said so. Both are now
// bundled (and that @import is gone as of 2026-08-06), so the picker's name
// maps onto the shipped file. The stored spec keeps the human name; only the
// canvas font string changes.
//
// Anton and Bebas Neue were bundled with the others but were once missing from
// the map below, so picking either in the editor painted the emblem in the
// system sans — the exact silent substitution this map exists to stop. Every
// family the picker offers must resolve to a shipped file; adding a name to
// settings.ts's BRAND_FONTS without adding it here is the bug to watch for.
//
// This lives in its own module (rather than inside logo-renderer.ts, where it
// started) because the emblem composer's text layers need the same answer, and
// two copies of this map is precisely the trap described above with a second
// place to forget.
import { BB_ANTON, BB_ARCHIVO_BLACK, BB_BEBAS, BB_OUTFIT } from './bundled-fonts';
import { brandPackFontFamily } from './brand-pack';

const BUNDLED_BRAND_FAMILY: Record<string, string> = {
  Anton: BB_ANTON,
  'Archivo Black': BB_ARCHIVO_BLACK,
  'Bebas Neue': BB_BEBAS,
  Outfit: BB_OUTFIT,
};

/**
 * The CSS font-family list a brand font NAME letters in.
 *
 * A brand pack's own faces resolve the same way: brand-pack.ts registered each
 * under a BBPack-prefixed family, and the spec keeps the human name. A name
 * that is already a stack (contains a comma) is used verbatim.
 */
export function brandFontFamilyCss(name: string): string {
  const bundled = BUNDLED_BRAND_FAMILY[name] ?? brandPackFontFamily(name);
  return bundled
    ? `${bundled}, sans-serif`
    : name.includes(',') ? name : `"${name}", sans-serif`;
}
