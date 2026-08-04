// Header signs for the four-sided promo floor stands.
//
// These used to be 2.25 ft 16:9 billboards — a Jellyfin backdrop, a poster
// inset and a name band, one per face, standing a foot and a half over the
// stand. Far too big: nothing in the store hung a lightbox that size over a
// floor fixture, and four of them turned a display into a kiosk. What a stand
// actually wore was the small header the shelf runs wear.
//
// EVERY theme gets the 1993 fascia blade — the colored band in white varsity
// block letters. This is a deliberate exception to the rule shelving.ts
// follows (section signs track the active theme's `topperStyle`): the stands
// briefly did track it, wearing the 1990 signboard, the 2000 arched plaque and
// the 2010 flush banner in their own eras, and the blade simply looked best on
// this fixture in all of them. User's call, on the built result.
//
// The blade is hung in the HOUSE colorway, not the 1993 genre-color system the
// aisle blades use. A promo stand's header prints a CAMPAIGN name ("HOLIDAY
// FAVORITES", "PREVIOUSLY VIEWED"), not a genre, so there is no genre family to
// look up — bb93GenreColor fell through to its default and printed the same
// blue on every stand. That was invisible while the house itself was navy and
// became the one off-palette object in an emerald room the moment the brand
// moved. Deriving from the active theme means the stands follow the house (and
// an installed brand pack) the way every other sign already does.
import * as THREE from 'three';
import { createFasciaBladeFactory, FASCIA_BLADE_H, type FasciaColorway } from './genre-fascia';
import { getActiveTheme, themeTrimDarkHex } from '../themes';
import { getActiveLogoSpec } from '../logo-spec';

export interface PromoTopperFactory {
  /** How far the topper rises above the surface it's seated on (ft). */
  readonly height: number;
  /**
   * One face's header, built to FACE +Z with its base at y=0. The caller seats
   * it on the stand's core top and rotates it about Y per face.
   */
  build(label: string, faceWidthFt: number): THREE.Object3D;
  /** Releases everything this factory created. Safe to call twice. */
  dispose(): void;
}

/**
 * A header factory for one store build. The blade factory caches its materials
 * and geometries internally and they go with the meshes the fixture disposes;
 * its textures are module-cached on purpose (shared with the aisle blades, and
 * they survive scene rebuilds).
 */
/**
 * The house colorway: the same three colors the run-top boards take — field =
 * `palette.primary`, letters = the emblem's own knockout, outline = the trim
 * near-black the baseboards derive (a plain black outline goes muddy on a dark
 * field, which is why it derives rather than being fixed).
 */
export function houseBladeColorway(): FasciaColorway {
  const theme = getActiveTheme();
  return {
    field: theme.palette.primary,
    ink: getActiveLogoSpec(theme).textColor,
    outline: themeTrimDarkHex(theme),
  };
}

export function createPromoTopperFactory(): PromoTopperFactory {
  const blades = createFasciaBladeFactory(houseBladeColorway());
  return {
    height: FASCIA_BLADE_H,
    build(label, faceWidthFt) {
      // The blade's faces are ±X and its length runs along Z, so a -90° turn
      // about Y puts the printed face on +Z and the length across the stand's
      // face.
      const mesh = blades.blade(label, label, faceWidthFt);
      // SINGLE-SIDED here, unlike an aisle blade. This one is mounted at the
      // edge of the stand's top with its back to the core, so the -X print
      // would only ever be seen as the FAR face's reverse showing over the
      // stand — reading as a second, floating sign. Swap it for plain trim
      // (material 2 is the blade's own edge material).
      if (Array.isArray(mesh.material)) mesh.material[1] = mesh.material[2];
      const holder = new THREE.Group();
      mesh.rotation.y = -Math.PI / 2;
      mesh.position.y = FASCIA_BLADE_H / 2;
      holder.add(mesh);
      return holder;
    },
    dispose() { /* nothing owned beyond the meshes the fixture disposes */ },
  };
}
