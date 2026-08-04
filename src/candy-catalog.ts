// T19 — candy-SKU mapping: turns the generic wire-rack row labels from the
// T06 candy fixture (src/fixtures/period-fixtures.ts, DEFAULT_CANDY_LABELS)
// into real-product-shaped metadata (name + size) a delivery deep link can
// search for. There is no public API that maps in-store display copy to an
// exact real-world SKU/UPC, so this is a
// small curated lookup rather than anything fetched live -- good enough for
// "search DoorDash for X", which is all the chosen v1 backend needs.
export interface CandyCatalogEntry {
  name: string;
  size: string;
}

const CANDY_CATALOG: Record<string, CandyCatalogEntry> = {
  'CHOCO BARS': { name: 'Assorted Chocolate Candy Bars', size: '1.5 oz' },
  'GUMMY BEARS': { name: 'Gummy Bears', size: '5 oz bag' },
  'POPCORN': { name: 'Movie Theater Butter Popcorn', size: '3.5 oz bag' },
  'MOVIE MINTS': { name: 'Chocolate-Covered Mints', size: '3.5 oz box' },
  'SOUR RIBBONS': { name: 'Sour Candy Ribbons', size: '4 oz bag' },
};

/** Best-effort lookup; unrecognized labels still get a usable name/size. */
export function catalogEntryFor(label: string): CandyCatalogEntry {
  return CANDY_CATALOG[label.toUpperCase()] ?? { name: label, size: '1 pack' };
}
