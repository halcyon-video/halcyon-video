// The 1990 TICKET SIGNBOARD card — the store's standard shelf-top marker.
//
// One physical object, used in two places: the gondola section signboards
// (shelving.ts, one per aisle section, printed with that section's genre) and
// the New Releases wall toppers (new-release-toppers.ts). Both are the same
// card, so the print, the finish and the 14 x 8.5 in cut live here rather than
// being restated per caller.
//
// The art is canon and gated: createCategorySignTexture draws the attested
// 1990 ticket (owner ruling 2026-07-30 off the TAPES FOR SALE reference —
// navy torn-ticket field, gold rules, brand face caps, auto-fit and word-
// wrapped), cut to this card's own aspect so nothing stretches. Callers pass
// COPY, never art.
//
// NO FEET — owner ruling 2026-07-30 off the 1990 ticket-sign reference
// (/uploads/…dfbc6bb7-6483.png): "they don't seem to have feet". The card
// sits FLUSH on the fixture's top surface; the 0.15 ft clearance on chrome
// stalks this used to have is what read as posts.
import * as THREE from 'three';
import { createCategorySignTexture } from '../canvas-textures';

import { formatShelfWood } from '../format-surfaces';

/** Card face in feet — the standard 14 x 8.5 in landscape print. */
export const TICKET_BOARD_W = 14.0 / 12;
export const TICKET_BOARD_H = 8.5 / 12;
/** Board thickness: a printed laminate panel, not a poster. */
export const TICKET_BOARD_T = 0.06;
/** The aspect the ticket art is cut to, so the print never stretches. */
export const TICKET_BOARD_ASPECT = 14 / 8.5;

/**
 * Printed face of a ticket signboard carrying `label`. Callers cache per
 * label — one material serves every card printed with the same copy.
 */
export function createTicketBoardLabelMaterial(label: string): THREE.MeshPhysicalMaterial {
  const isWood = !!formatShelfWood();
  return new THREE.MeshPhysicalMaterial({
    map: createCategorySignTexture(label, undefined, false, TICKET_BOARD_ASPECT),
    // Laminated print in corporate; matte card stock in mom-and-pop.
    roughness: isWood ? 0.8 : 0.35,
    metalness: isWood ? 0.0 : 0.05,
    clearcoat: isWood ? 0.0 : 1.0,
    clearcoatRoughness: 0.15,
  });
}

