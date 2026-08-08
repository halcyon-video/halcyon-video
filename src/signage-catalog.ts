import * as THREE from 'three';
import { createSignTextTexture, createCategorySignTexture, createNewReleasesSignTexture } from './canvas-textures';
import { bb93SignageOn } from './genre-colors';

export type SignCategory =
  | 'bin-topper'        // above previously-viewed bins
  | 'wall-newrelease'   // above the New Releases wall shelves
  | 'candy'             // on candy displays
  | 'register'          // near/on the checkout counter
  | 'shelf'             // on gondola shelves / pricing strips
  | 'divider'           // on shelf dividers
  | 'ceiling-nav'       // hanging navigation (GENRE names, NEW RELEASES →, etc.)
  | 'ceiling-promo';    // hanging price/promo cards (1993: "INCREDIBLE VALUES")

export interface SignDef {
  id: string;
  category: SignCategory;
  fixture: 'acrylic-tent' | 'ceiling-hanging' | 'shelf-topper' | 'wall' | 'wire-frame';
  texture: () => THREE.Texture;   // canvas-texture factory
  size: { w: number; h: number }; // feet
}

const STATIC_CATALOG: SignDef[] = [
  {
    id: 'be-kind-rewind',
    category: 'register',
    fixture: 'acrylic-tent',
    texture: () => createSignTextTexture('Please', 'Rewind', 'standard', 0.9 / 0.7),
    size: { w: 0.9, h: 0.7 }
  },
  {
    id: 'rental-policy',
    category: 'register',
    fixture: 'wire-frame',
    texture: () => createSignTextTexture('5 Nights', '$2.99 Rental', 'standard', 0.9 / 0.7),
    size: { w: 0.9, h: 0.7 }
  },
  {
    id: 'membership-free',
    category: 'register',
    fixture: 'wire-frame',
    texture: () => createSignTextTexture('Membership', 'Is Always Free', 'standard', 0.9 / 0.7),
    size: { w: 0.9, h: 0.7 }
  },
  {
    id: 'new-releases-wall',
    category: 'wall-newrelease',
    fixture: 'wall',
    texture: () => createNewReleasesSignTexture(),
    size: { w: 11.0, h: 11.0 / 6.6666 }
  },
  {
    id: 'previously-viewed-promo',
    category: 'bin-topper',
    fixture: 'shelf-topper',
    texture: () => createSignTextTexture('Previously Viewed', '3 for $20.00', 'promo', 1.5 / 0.8),
    size: { w: 1.5, h: 0.8 }
  },
  {
    id: 'candy-promo',
    category: 'candy',
    fixture: 'wire-frame',
    texture: () => createSignTextTexture('Movie Theater Candy', '$1.99 each', 'promo', 0.9 / 0.7),
    size: { w: 0.9, h: 0.7 }
  },
  // 1993 footage pack: the closed-lane tent. (The yellow INCREDIBLE VALUES
  // card over the bargain bin was retired by owner pin 031; the red
  // "2-EVENING NEW RELEASE RENTAL $3" ceiling card over the back-wall floor
  // displays was removed entirely by owner request — GH #2.)
  {
    id: 'next-register-please',
    category: 'register',
    fixture: 'acrylic-tent',
    texture: () => createSignTextTexture('Next Register', 'Please', 'yellow-navy', 0.9 / 0.5),
    size: { w: 0.9, h: 0.5 }
  }
];

const SIGNAGE_CATALOG = new Map<string, SignDef>(STATIC_CATALOG.map(s => [s.id, s]));

// Every statically-defined sign, for tooling/enumeration (tools/list-slots.mjs).
// Dynamic ceiling-nav-<NAME> defs are generated per genre by getSignDef below.
export function listCatalogSignDefs(): SignDef[] {
  return [...STATIC_CATALOG];
}

// Dynamic lookup helper that supports statically-defined signs as well as
// on-the-fly generated ceiling navigation signs for any category or library.
export function getSignDef(id: string): SignDef | undefined {
  if (SIGNAGE_CATALOG.has(id)) {
    return SIGNAGE_CATALOG.get(id);
  }

  // If it's a dynamic ceiling nav sign (e.g. 'ceiling-nav-ACTION' or 'ceiling-nav-COMEDY')
  if (id.startsWith('ceiling-nav-')) {
    const genreOrLibName = id.slice('ceiling-nav-'.length).toUpperCase();
    // Opt-in bb_93_signage: layered genre marker (backer + disc + navy
    // plate, ~36in x 15in per the Part II COMEDY sign vs the light fixture
    // beside it); default keeps the #34 rectangle.
    const ribbon93 = bb93SignageOn();
    const size = ribbon93 ? { w: 3.0, h: 1.25 } : { w: 4.2, h: 1.2 };
    return {
      id,
      category: 'ceiling-nav',
      fixture: 'ceiling-hanging',
      // Face aspect goes with it so the ticket art is cut to this card and not
      // stretched onto it (the 4.2 x 1.2 hanger is 3.5:1, not the legacy 4:1).
      // This sign is CEILING-HUNG: its wires are built by ceilingHangingSign()
      // and are not part of the run-top de-footing.
      // Ceiling hangers get the BLADE cut of the board: field edge to edge (the
      // hanger is die-cut to the art, so there's no card stock to show) with a
      // single rule instead of the double.
      texture: () => createCategorySignTexture(genreOrLibName, undefined, ribbon93, size.w / size.h, !ribbon93),
      size
    };
  }

  return undefined;
}
