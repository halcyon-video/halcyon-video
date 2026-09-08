import { selfLit } from './material-lighting';
// Exterior envelope shared by three architectural styles. Window openings,
// service-door placement and masonry tiling follow the store's live plan.
// Fitted entrance portals and canopies are authored in Blender; none of this
// exterior dressing changes the walkable entrance or its door animations.
import * as THREE from 'three';
import type { FixtureContext } from './fixtures';
import { facadeStyle, facadeDimensions, type FacadeStyle } from './storefront-architecture';
import { buildFacadeEntryModel } from './storefront-entry-model';
import { onBrandChange } from './brand-live';
import { getActiveTheme } from './themes';
import { createFacadeTileMaterial, mapFacadeUV } from './facade-masonry';
import { WINDOW_BAY_TARGET_WIDTH, FRONT_WINDOW_CORNER_MARGIN, STORE_CENTER_X, FRONT_GLASS_Z } from './store-layout';

export interface FacadeBuildParams {
  context: FixtureContext;
  storeWidth: number;      // ft, front-wall span (store centreline is x = 11)
  backWallZ: number;       // ft, world z of the back wall (left fascia runs to it)
  ceilingY: number;        // ft, interior ceiling; independent of the window head
  entryHalfWidth: number;  // vestibuleHalfWidth(spec): tower proportions key off it
  // entranceOpeningHalfWidth(spec) (store-layout.ts): half-width of the glazed
  // entry composition — sidelight | door | door | sidelight — that the recessed
  // entry-bay opening (the brick jamb pillars) frames exactly.
  entryOpeningHalfWidth: number;
  brickMaterial: (repX: number, repY: number) => THREE.MeshStandardMaterial;
  stripeColor: string;     // glazed-tile band color (theme primary)
  trimColor: string;       // the single brass course capping the band (theme secondary)
  // Shared z-span of the side-window ribbons (null = solid side walls). The
  // exterior brick veneers below wrap exactly the parts of the side walls the
  // interior glazing does NOT cover.
  sideRibbon: { frontZ: number; backZ: number } | null;
  // ACTUAL solid margin (ft) between each end of the front window row and the
  // corner (>= store-layout.ts's FRONT_WINDOW_CORNER_MARGIN — whole-pane
  // quantization can widen it): the brick returns below fill exactly the
  // spans the front glazing no longer reaches.
  frontCornerMargin: number;
}

// Brand mounting plane and available architectural sign area. The gabled
// prototype wears its sign below the spring line, above the lower tile band.
export interface FacadeLogoAnchor {
  x: number;
  y: number;
  z: number;      // front face of the gable (logo group's back plane)
  width: number;  // sized so the ticket stays inside the raking edges
  height: number;
  // The gable triangle in world terms, so the 3D sign modes (extruded emblem,
  // freestanding letters — logo-storefront.ts) can solve their own layout
  // against the raking copings instead of guessing from width/height alone.
  gable: { baseY: number; halfWidth: number; height: number };
  // The front parapet band (brick fascia above the window heads, full facade
  // width, centred on the store centreline x). Big freestanding-letter rows
  // that outgrow the gable lay out along this band instead — the
  // "letters across the whole front" placement.
  fascia: { width: number; bottomY: number; topY: number };
}

export interface StorefrontFacade {
  group: THREE.Group;
  logoAnchor: FacadeLogoAnchor;
}

const CX = STORE_CENTER_X; // store centreline
const FRONT_Z = FRONT_GLASS_Z; // storefront glass line

// Entrance-tower masonry, in feet from the store centreline. The gabled mass
// overhangs the vestibule glass by ENTRY_MASS_OVERHANG on each side, and a
// stepped flanking pier of ENTRY_PIER_W stands immediately outboard of it.
const ENTRY_MASS_OVERHANG = 0;
const ENTRY_PIER_W = 2;

/**
 * Half-width (ft, from the store centreline x = 11) of the SOLID stretch of
 * front elevation the entrance tower occupies — the gabled mass plus its
 * stepped flanking piers, which stand PROUD of the glass line at z > 15.
 *
 * Anything on the front glass inside this span faces brick, not the parking
 * lot: the interior window bays run right on past behind the tower, so a
 * pane's existence says nothing about whether you can see through it. Window
 * graphics (fixtures/storefront-dressing-93.ts's QUIK DROP vinyl) clear this
 * before choosing a bay. `entryHalfWidth` is the same vestibuleHalfWidth(spec)
 * the facade is built from.
 */
export function entryMassSolidHalfWidth(entryHalfWidth: number, style: FacadeStyle = facadeStyle()): number {
  return entryHalfWidth + ENTRY_MASS_OVERHANG + (style === 'arcaded-brick' ? 8 : ENTRY_PIER_W);
}

// Glazing head for ALL storefront windows — front bays and side ribbons.
// Per the entrance close-up photo: window tops line up with the entry
// glazing, the walkway opening runs just half a foot taller, and everything
// above is solid brick to the parapet.
export const WINDOW_HEAD_Y = 9.0;

// ── Side-window ribbon spec (both side walls, per the reference photos) ─────
// A banded run of tall single panes toward the FRONT of each side wall: brick
// knee below, glazing head well under the roofline, brick above and on either
// side. three-scene.ts computes the shared z-span (the depth rule — the
// ribbon ends as close to HALF the store's depth as whole panes allow — but
// it must also dodge the stepped corner) and passes it back in as
// `sideRibbon`. Every pane is exactly WINDOW_BAY_TARGET_WIDTH (4 ft) wide,
// same as the front storefront panes; the baseline store carries SIX of them
// (SIDE_PANES_BASELINE), 24 ft of glass ending exactly at half-depth.
export const SIDE_RIBBON_FRONT_Z = FRONT_Z - FRONT_WINDOW_CORNER_MARGIN; // 12.75: flat wall at the front corner
export const SIDE_RIBBON_CLEARANCE = 1.2;  // solid wall between the NR unit's front edge and the glass
export const SIDE_RIBBON_PANE_W = WINDOW_BAY_TARGET_WIDTH; // every side pane exactly 4 ft
export const SIDE_RIBBON_MIN_LEN = SIDE_RIBBON_PANE_W;     // below one whole pane, keep the wall solid

// ── Right-wall service door + EXIT sign footprint ───────────────────────────
// Shared with wall-decor.ts (pin 052): wall décor must never overlap this
// door, its frame, or the EXIT sign above it, so the exclusion geometry is
// exported here instead of re-derived/duplicated elsewhere.
export const RIGHT_SIDE_DOOR_W = 3.0;
export const RIGHT_SIDE_DOOR_H = 7.0;
export interface RightSideDoorZone {
  z0: number;   // back edge (more -z) of the door+frame footprint
  z1: number;   // front edge — sits right at sideRibbon.backZ, the glass start
  yTop: number; // top of the door/frame/EXIT-sign assembly
}
/**
 * World-space exclusion rectangle for the right-wall service door + EXIT
 * sign, or null when the shell has no side ribbon — the door only builds
 * "tucked immediately BEHIND the last window pane" (see the door block
 * below), so with no ribbon there is no door either.
 */
export function rightSideDoorZone(sideRibbon: { frontZ: number; backZ: number } | null): RightSideDoorZone | null {
  if (!sideRibbon) return null;
  const doorZ = sideRibbon.backZ - 0.5 - RIGHT_SIDE_DOOR_W / 2;
  const halfZ = (RIGHT_SIDE_DOOR_W + 0.4) / 2; // matches the interior frame's DOOR_W+0.4 span below
  const signTopY = RIGHT_SIDE_DOOR_H + 0.75 + (0.73 + 0.06) / 2; // housing center + half its height
  return { z0: doorZ - halfZ, z1: doorZ + halfZ, yTop: Math.max(RIGHT_SIDE_DOOR_H + 0.16, signTopY) };
}

export function buildStorefrontFacade(params: FacadeBuildParams): StorefrontFacade {
  const { storeWidth, backWallZ, ceilingY, entryHalfWidth, entryOpeningHalfWidth, brickMaterial, stripeColor, sideRibbon, frontCornerMargin } = params;
  const group = new THREE.Group();
  group.name = 'storefrontFacade';

  const leftEdgeX = CX - storeWidth / 2;
  const rightEdgeX = CX + storeWidth / 2;

  const style = facadeStyle();
  const dimensions = facadeDimensions(ceilingY, entryHalfWidth, style);
  const { parapetTop, massHalf, gableBase, gableHeight: gableH, stripeHeight: stripeH, stripeTop } = dimensions;
  const fasciaBot = ceilingY - .15;
  const stripeCY = stripeTop - stripeH / 2;
  const towerFrontZ = FRONT_Z + dimensions.frontProjection;

  const glazedTile = createFacadeTileMaterial(stripeColor);
  const unsubscribe = onBrandChange(() => {
    const palette = getActiveTheme().palette;
    glazedTile.color.set(palette.primary);
  });
  group.addEventListener('removed', () => {
    unsubscribe();
    glazedTile.map?.dispose(); glazedTile.bumpMap?.dispose();
  });
  const coping = new THREE.MeshStandardMaterial({ color: 0x26282b, roughness: 0.55, metalness: 0.35 });

  const addBox = (
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    mat: THREE.Material, shadows = true,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (mat === glazedTile) mapFacadeUV(m.geometry, m.position);
    m.castShadow = shadows;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const masonry = brickMaterial(1, 1);
  const brickBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = addBox(w, h, d, x, y, z, masonry);
    mapFacadeUV(mesh.geometry, mesh.position);
    return mesh;
  };

  // ── Wing parapet fascia ──────────────────────────────────────────────────
  const fasciaH = parapetTop - fasciaBot;
  const fasciaCY = (fasciaBot + parapetTop) / 2;
  // Front: one full-width brick band from just below the window heads to the
  // parapet (the entrance close-up shows solid brick above the glazing line),
  // with the glazed stripe riding on it. The tower stands proud of all of it.
  // Band, stripe and coping all run 0.75 past each corner so they die flush
  // into the side elevations' outer faces — the corner is a plain 90° brick
  // arris now (the old proud corner piers are gone, per user direction:
  // nothing may protrude at the corner).
  const frontBandBot = WINDOW_HEAD_Y - 0.1;
  brickBox(storeWidth + 1.5, parapetTop - frontBandBot, 0.7, CX, (frontBandBot + parapetTop) / 2, FRONT_Z + 0.4);
  if (style === 'gabled-brick') {
    addBox(storeWidth + 1.82, stripeH, 0.16, CX, stripeCY, FRONT_Z + 0.83, glazedTile);
  } else {
    const stone = new THREE.MeshStandardMaterial({ color: 0xd8cfb7, roughness: .8 });
    addBox(storeWidth + 1.8, .40, .96, CX, parapetTop-.30, FRONT_Z+.48, stone);
    addBox(storeWidth + 1.6, .16, .88, CX, parapetTop-.64, FRONT_Z+.44, stone);
  }
  addBox(storeWidth + 1.8, 0.3, 1.0, CX, parapetTop + 0.15, FRONT_Z + 0.4, coping);

  // Brick returns filling the front-wall corner margins from the ground to the
  // parapet band: the window row stops frontCornerMargin ft short of each
  // corner, and these read as pure flat wall — same 0.7 depth as the band
  // above, overlapping the side veneers' 0.625 thickness so the corner closes
  // solid with no freestanding pier.
  if (frontCornerMargin > 0.05) {
    ([[leftEdgeX, 1], [rightEdgeX, -1]] as [number, number][]).forEach(([edgeX, s]) => {
      const w = frontCornerMargin + 0.625;
      // Top out flush at frontBandBot so this butt-joints the full-width band
      // above instead of overlapping into it: the two are the same brick at the
      // identical z-center/depth, so a shared y-band was a coplanar depth tie
      // (a shimmering seam-strip at each front corner). A clean butt at 8.9 has
      // no overlap to fight and no visible gap (continuous brick).
      brickBox(w, frontBandBot, 0.7, edgeX + s * (frontCornerMargin - 0.625) / 2, frontBandBot / 2, FRONT_Z + 0.4);
    });
  }

  // Side elevations, both walls: brick veneer everywhere the interior glazing
  // isn't (rear span, front-corner margin, band above the ribbon, knee under
  // it — or the whole wall when there's no ribbon), then the same parapet
  // fascia + stripe + coping treatment as the front, wrapping the corners.
  const sideLen = FRONT_Z - backWallZ;
  const sideCZ = (FRONT_Z + backWallZ) / 2;
  ([[leftEdgeX, -1], [rightEdgeX, 1]] as [number, number][]).forEach(([wallX, s]) => {
    const vx = wallX + s * 0.35; // veneer centre: 0.55 thick, 0.05..0.6 outside the wall plane
    const vBox = (z0: number, z1: number, y0: number, y1: number) => {
      if (z1 - z0 < 0.05 || y1 - y0 < 0.05) return;
      brickBox(0.55, y1 - y0, z1 - z0, vx, (y0 + y1) / 2, (z0 + z1) / 2);
    };
    if (!sideRibbon) {
      vBox(backWallZ, FRONT_Z, 0, fasciaBot + 0.1);
    } else {
      vBox(backWallZ, sideRibbon.backZ, 0, fasciaBot + 0.1);
      vBox(sideRibbon.frontZ, FRONT_Z, 0, fasciaBot + 0.1);
      vBox(sideRibbon.backZ, sideRibbon.frontZ, WINDOW_HEAD_Y, fasciaBot + 0.1);
      vBox(sideRibbon.backZ, sideRibbon.frontZ, 0, 2.0); // brick knee under the glass
    }
    brickBox(0.7, fasciaH, sideLen, wallX + s * 0.4, fasciaCY, sideCZ);
    if (style === 'gabled-brick') {
      // Meet the back of the front strip at z=FRONT_Z+.75. Ending at the
      // glass line leaves a visible untiled gap around the outside corner.
      addBox(0.16, stripeH, sideLen + .75, wallX + s * 0.83, stripeCY, sideCZ + .375, glazedTile);
    }
    // Side coping stops at the front coping's back face (FRONT_Z - 0.1) instead
    // of running 0.15 past the corner: the two run perpendicular at the same
    // top height (y = parapetTop + 0.15) in the same material, so the old
    // overlap left a coplanar depth tie on the coping top at each front corner.
    // The front coping already overhangs 0.9 past the corner and covers it.
    addBox(1.0, 0.3, sideLen + 0.05, wallX + s * 0.4, parapetTop + 0.15, sideCZ - 0.125, coping);
  });

  // ── Rear elevation ───────────────────────────────────────────────────────
  // The building's back wall. Plain brick + the same parapet fascia and
  // coping as the sides, and deliberately NO glazed stripe: the tile band
  // wraps the customer-facing elevations only, and a service rear was flat
  // brick. Nothing is signed here — this is envelope, not signage.
  //
  // It is also the fix for feedback pin 024 ("where is this light coming from
  // in this corner?"). The interior back wall (store-shell.ts) is a single
  // one-sided plane with receiveShadow but no castShadow, and until now it was
  // the ONLY thing standing at backWallZ — so with the sun rolled behind the
  // store (rollSunPlacement sweeps azimuth to +/-115 deg, i.e. past the back
  // corners on ~1 visit in 5) daylight went straight THROUGH the back wall and
  // painted hard-edged sun wedges high on the back-left corner's gold band,
  // where no fixture could put light and no window lets any in. Same class of
  // bug, same fix, as the opaque roof slab in store-shell.ts: interior sun
  // patches must only come in through the storefront glass.
  {
    const rearZ = backWallZ - 0.35;                   // 0.55 thick: 0.075..0.625 outside the wall plane
    const rearW = storeWidth + 1.25;                  // laps both side veneers' outer faces
    brickBox(rearW, fasciaBot + 0.1, 0.55, CX, (fasciaBot + 0.1) / 2, rearZ);
    brickBox(rearW + 0.15, fasciaH, 0.7, CX, fasciaCY, backWallZ - 0.4);
    addBox(rearW + 0.15, 0.3, 1.0, CX, parapetTop + 0.15, backWallZ - 0.4, coping);
  }

  // ── Right-wall side door (per the real building): a plain steel service
  // door tucked immediately BEHIND the last window pane of the right ribbon.
  // Non-interactable dressing — the wall stays solid; the door reads through
  // frame, leaf and hardware on the brick veneer outside, plus a matching
  // leaf with a crash bar and an EXIT sign on the interior face.
  if (sideRibbon) {
    const DOOR_W = RIGHT_SIDE_DOOR_W;
    const DOOR_H = RIGHT_SIDE_DOOR_H;
    const doorZ = sideRibbon.backZ - 0.5 - DOOR_W / 2; // right against the last pane's brick margin
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.5, metalness: 0.6 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x39404a, roughness: 0.6, metalness: 0.35 });
    const hardwareMat = new THREE.MeshStandardMaterial({ color: 0xb9bec5, roughness: 0.25, metalness: 0.9 });
    const stoopMat = new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 0.95, metalness: 0.0 });

    // Exterior, proud of the brick veneer (veneer outer face ≈ wall + 0.625).
    const exFrameX = rightEdgeX + 0.66;
    [-1, 1].forEach((s) => {
      addBox(0.14, DOOR_H + 0.16, 0.22, exFrameX, (DOOR_H + 0.16) / 2, doorZ + s * (DOOR_W / 2 + 0.11), frameMat);
    });
    addBox(0.14, 0.22, DOOR_W + 0.44, exFrameX, DOOR_H + 0.11, doorZ, frameMat);       // head
    addBox(0.3, 0.14, DOOR_W + 0.8, exFrameX, DOOR_H + 0.3, doorZ, coping, false);      // drip cap
    // Leaf face must sit PROUD of the brick veneer's outer face (≈ wall+0.63)
    // or the brick swallows it and only the frame reads.
    addBox(0.08, DOOR_H, DOOR_W, rightEdgeX + 0.68, DOOR_H / 2, doorZ, leafMat);         // leaf, a hair inside the frame face
    addBox(0.1, 0.5, 0.12, rightEdgeX + 0.78, 3.3, doorZ + DOOR_W / 2 - 0.4, hardwareMat); // pull handle
    addBox(1.8, 0.22, DOOR_W + 1.4, rightEdgeX + 0.9, 0.11, doorZ, stoopMat, false);     // concrete stoop

    // Interior face (inside the store, on the right gold wall).
    const inFrameX = rightEdgeX - 0.1;
    [-1, 1].forEach((s) => {
      addBox(0.12, DOOR_H + 0.16, 0.2, inFrameX, (DOOR_H + 0.16) / 2, doorZ + s * (DOOR_W / 2 + 0.1), frameMat);
    });
    addBox(0.12, 0.2, DOOR_W + 0.4, inFrameX, DOOR_H + 0.1, doorZ, frameMat);            // head
    addBox(0.08, DOOR_H, DOOR_W, rightEdgeX - 0.06, DOOR_H / 2, doorZ, leafMat);          // leaf
    addBox(0.1, 0.14, DOOR_W - 0.7, rightEdgeX - 0.16, 3.3, doorZ, hardwareMat);          // crash bar

    // EXIT sign above the door, built to real US exit-sign proportions: a
    // 15.5in x 8.75in face (aspect ~1.78) carrying RED "EXIT" at the NFPA 101 /
    // IBC minimum 6in cap height — i.e. letters filling ~69% of the face height
    // and nearly its full width, which is what makes one read as an exit sign
    // at a glance. It used to be a 2.36:1 letterbox with ~3.9in green letters
    // floating in the middle, which read as a printed placard.
    // Self-luminous like the real thing: the emissiveMap carries only the
    // glyphs, so they glow well above the surrounding face without blooming it.
    const SIGN_W = 1.3, SIGN_H = 0.73;
    const drawExitFace = (bg: string, fg: string): THREE.CanvasTexture => {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 144; // matches SIGN_W/SIGN_H, no stretch
      const c = canvas.getContext('2d')!;
      c.fillStyle = bg;
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = fg;
      // 99px caps on a 144px face = 6in on an 8.75in sign (code minimum).
      c.font = '900 99px Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      // Wide letter-spacing, drawn per-glyph (canvas letterSpacing support varies).
      const word = 'EXIT';
      const step = 60;
      const x0 = canvas.width / 2 - ((word.length - 1) * step) / 2;
      for (let i = 0; i < word.length; i++) c.fillText(word[i], x0 + i * step, canvas.height / 2 + 4);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };
    const exitFaceMat = selfLit(new THREE.MeshStandardMaterial({
      map: drawExitFace('#f2f4f1', '#cf142b'),          // white acrylic face, safety-red lettering
      emissive: 0xffffff,
      emissiveMap: drawExitFace('#000000', '#ff3b30'),  // only the letters glow (backlit red)
      emissiveIntensity: 2.0,                            // reads as self-luminous, not printed
      roughness: 0.55,
      metalness: 0.0,
    }), 'light-source');
    addBox(0.12, SIGN_H + 0.06, SIGN_W + 0.08, rightEdgeX - 0.16, DOOR_H + 0.75, doorZ, frameMat, false); // housing
    const exitFace = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_H), exitFaceMat);
    exitFace.position.set(rightEdgeX - 0.225, DOOR_H + 0.75, doorZ);
    exitFace.rotation.y = -Math.PI / 2; // face -X, into the store
    group.add(exitFace);
  }

  group.add(buildFacadeEntryModel(params.context, {
    style, entryHalfWidth, openingHalfWidth: entryOpeningHalfWidth,
    frontCornerMargin, brickMaterial, primary: stripeColor,
  }));

  // The brand cabinet sits over the entry, below the peak. Separate gable
  // and fascia bounds also keep optional freestanding letters inside the wall.
  const logoWidth = Math.min(9.0, entryHalfWidth * 1.05);
  const logoHeight = logoWidth * 0.6;
  const logoAnchor: FacadeLogoAnchor = {
    x: CX,
    y: dimensions.logoY,
    z: towerFrontZ + 0.05,
    width: logoWidth,
    height: logoHeight,
    gable: style === 'gabled-brick'
      ? { baseY: gableBase, halfWidth: massHalf-1, height: gableH }
      : { baseY: 13.4, halfWidth: massHalf, height: dimensions.pierTop-13.4 },
    fascia: { width: storeWidth, bottomY: WINDOW_HEAD_Y, topY: parapetTop },
  };

  return { group, logoAnchor };
}
