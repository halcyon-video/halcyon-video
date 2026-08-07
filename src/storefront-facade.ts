// Photo-matched exterior facade: the classic
// early-90s freestanding video-store prototype building. Rust-red running-bond
// brick walls with a dark-capped flat parapet, one house-color glazed-tile
// stripe band wrapping the front and left elevations, and a central entrance
// tower — recessed glass entry under a blue tile header, brick jamb pillars,
// stepped flanking piers with vertical house-color stripes, and a steep gable
// ("steeple") whose face carries the storefront logo. Replaces the old curved
// awning + valance. Everything here is static exterior dressing: plain
// box/prism meshes built once, no per-frame work, no colliders (it all lives
// outside the walkable glass line at z = 15).
import * as THREE from 'three';
import { WINDOW_BAY_TARGET_WIDTH, FRONT_WINDOW_CORNER_MARGIN, STORE_CENTER_X, FRONT_GLASS_Z } from './store-layout';

export interface FacadeBuildParams {
  storeWidth: number;      // ft, front-wall span (store centreline is x = 11)
  backWallZ: number;       // ft, world z of the back wall (left fascia runs to it)
  ceilingY: number;        // ft, interior ceiling = storefront glazing head
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

// Where the storefront logo must sit: centered in the gable face, just above
// the spring line — exactly where the reference building wears its emblem.
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
const BRICK_FEET = 4.0; // must match three-scene.ts's brick-texture tile size

// Entrance-tower masonry, in feet from the store centreline. The gabled mass
// overhangs the vestibule glass by ENTRY_MASS_OVERHANG on each side, and a
// stepped flanking pier of ENTRY_PIER_W stands immediately outboard of it.
const ENTRY_MASS_OVERHANG = 1.2;
const ENTRY_PIER_W = 1.5;

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
export function entryMassSolidHalfWidth(entryHalfWidth: number): number {
  return entryHalfWidth + ENTRY_MASS_OVERHANG + ENTRY_PIER_W;
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
  const { storeWidth, backWallZ, ceilingY, entryHalfWidth, entryOpeningHalfWidth, brickMaterial, stripeColor, trimColor, sideRibbon, frontCornerMargin } = params;
  const group = new THREE.Group();
  group.name = 'storefrontFacade';

  const leftEdgeX = CX - storeWidth / 2;
  const rightEdgeX = CX + storeWidth / 2;

  // ── Vertical proportions (photo ratios re-anchored to the 13.5 ft glazing
  // head; the ratios are recorded in the constants below) ─────────────────
  const fasciaBot = ceilingY - 0.15;        // brick fascia overlaps the glass head frame
  const parapetTop = ceilingY + 4.6;        // wing parapet
  const stripeH = 1.45;                     // glazed-tile band height (thinned ~25% per user review)
  const stripeTop = parapetTop - 1.1;       // band rides just below the cap
  const stripeCY = stripeTop - stripeH / 2;

  // ── Tower proportions ────────────────────────────────────────────────────
  const massHalf = entryHalfWidth + ENTRY_MASS_OVERHANG; // gabled mass half-width (jambs overlap the vestibule glass edges)
  // Deep portico projection: the entry pillars stand well proud of the
  // building body (the close-up photo shows a covered WALKWAY between the
  // pillars and the doors), stopping at the sidewalk's outer edge (its 4.4 ft
  // depth in exterior-environment.ts) so the pillars keep their feet on it.
  const towerFrontZ = FRONT_Z + 4.2;
  // Entry recess half-width: frames EXACTLY the glazed composition behind it
  // (sidelight | door | door | sidelight — entranceOpeningHalfWidth in
  // store-layout.ts), so the brick jamb pillars read as the reference photo's
  // pilasters hugging the doors + sidelights.
  const openHalf = entryOpeningHalfWidth;
  // Walkway-opening top: right at the storefront glazing head — the vestibule's
  // continuous transom (doors up to WINDOW_HEAD_Y) fills the opening, and the
  // window heads across the whole storefront align with it.
  const headerBot = WINDOW_HEAD_Y + 0.15;
  const headerTop = headerBot + 1.9;        // blue tile entry header
  const gableBase = ceilingY + 4.9;         // spring line, a step above the wing parapet
  const gableH = 0.55 * (2 * massHalf);     // steep "steeple" rake per the photos
  const pierW = ENTRY_PIER_W;               // stepped flanking piers ("pillars")
  const pierTop = gableBase + 1.5;          // piers ride above the spring line
  const pierFrontZ = FRONT_Z + 2.4;         // middle relief plane: wall < pier < gabled mass

  const glazedTile = new THREE.MeshStandardMaterial({
    color: new THREE.Color(stripeColor),
    roughness: 0.32, // glazed tile: glossier than brick, duller than glass
    metalness: 0.0,
    envMapIntensity: 0.9,
  });
  // A single brass course capping the glazed band — the trim line that ties
  // the facade to the store's own livery. Derived from the trim color the
  // caller passes, so it follows the theme like everything else out here.
  const trimCourse = new THREE.MeshStandardMaterial({
    color: new THREE.Color(trimColor),
    roughness: 0.38,
    metalness: 0.25,
    envMapIntensity: 1.0,
  });
  const TRIM_H = 0.16; // ft — one course
  const coping = new THREE.MeshStandardMaterial({ color: 0x26282b, roughness: 0.55, metalness: 0.35 });
  const soffitDark = new THREE.MeshStandardMaterial({ color: 0x191a1c, roughness: 0.9, metalness: 0.0 });

  const addBox = (
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    mat: THREE.Material, shadows = true,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadows;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const brickBox = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    addBox(w, h, d, x, y, z, brickMaterial(Math.max(w, d) / BRICK_FEET, h / BRICK_FEET));

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
  addBox(storeWidth + 1.82, stripeH, 0.16, CX, stripeCY, FRONT_Z + 0.83, glazedTile);
  addBox(storeWidth + 1.82, TRIM_H, 0.17, CX, stripeTop + TRIM_H / 2, FRONT_Z + 0.835, trimCourse);
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
    addBox(0.16, stripeH, sideLen, wallX + s * 0.83, stripeCY, sideCZ, glazedTile);
    addBox(0.17, TRIM_H, sideLen, wallX + s * 0.835, stripeTop + TRIM_H / 2, sideCZ, trimCourse);
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
    const exitFaceMat = new THREE.MeshStandardMaterial({
      map: drawExitFace('#f2f4f1', '#cf142b'),          // white acrylic face, safety-red lettering
      emissive: 0xffffff,
      emissiveMap: drawExitFace('#000000', '#ff3b30'),  // only the letters glow (backlit red)
      emissiveIntensity: 2.0,                            // reads as self-luminous, not printed
      roughness: 0.55,
      metalness: 0.0,
    });
    addBox(0.12, SIGN_H + 0.06, SIGN_W + 0.08, rightEdgeX - 0.16, DOOR_H + 0.75, doorZ, frameMat, false); // housing
    const exitFace = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_H), exitFaceMat);
    exitFace.position.set(rightEdgeX - 0.225, DOOR_H + 0.75, doorZ);
    exitFace.rotation.y = -Math.PI / 2; // face -X, into the store
    group.add(exitFace);
  }

  // ── Entrance tower ───────────────────────────────────────────────────────
  const towerD = towerFrontZ - (FRONT_Z + 0.1);
  const towerCZ = (FRONT_Z + 0.1 + towerFrontZ) / 2;

  // Brick jamb pillars flanking the recessed entry (ground level).
  const jambW = massHalf - openHalf;
  [-1, 1].forEach((s) => {
    brickBox(jambW, headerBot, towerD, CX + s * (openHalf + jambW / 2), headerBot / 2, towerCZ);
  });
  // Solid face above the entry, up to the gable spring line.
  brickBox(2 * massHalf, gableBase - headerBot, towerD, CX, (headerBot + gableBase) / 2, towerCZ);
  // Dark soffit closing the recess overhead (hides the stretched box underside).
  addBox(2 * openHalf, 0.08, towerD, CX, headerBot - 0.04, towerCZ, soffitDark, false);
  // Blue tile entry header over the doors.
  addBox(2 * openHalf + 1.6, headerTop - headerBot, 0.14, CX, (headerBot + headerTop) / 2, towerFrontZ + 0.07, glazedTile);
  // The wing stripe continues across the tower face and around its returns.
  addBox(2 * massHalf, stripeH, 0.14, CX, stripeCY, towerFrontZ + 0.07, glazedTile);
  addBox(2 * massHalf, TRIM_H, 0.15, CX, stripeTop + TRIM_H / 2, towerFrontZ + 0.075, trimCourse);
  [-1, 1].forEach((s) => {
    addBox(0.14, stripeH, towerD, CX + s * (massHalf + 0.07), stripeCY, towerCZ, glazedTile);
  });

  // Gable: triangular brick prism springing from the spring line.
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-massHalf, 0);
  gableShape.lineTo(massHalf, 0);
  gableShape.lineTo(0, gableH);
  gableShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: towerD, bevelEnabled: false });
  // Extrude UVs are in shape units (feet) — scale to the shared brick tile.
  const gable = new THREE.Mesh(gableGeo, brickMaterial(1 / BRICK_FEET, 1 / BRICK_FEET));
  gable.position.set(CX, gableBase, FRONT_Z + 0.1);
  gable.castShadow = true;
  gable.receiveShadow = true;
  group.add(gable);

  // Dark coping up both raking edges (meets itself at the peak).
  const rakeLen = Math.hypot(massHalf, gableH);
  const rakeAngle = Math.atan2(gableH, massHalf);
  [-1, 1].forEach((s) => {
    const rake = addBox(rakeLen + 0.5, 0.32, towerD + 0.2, CX + s * massHalf / 2, gableBase + gableH / 2 + 0.1, towerCZ, coping);
    rake.rotation.z = -s * rakeAngle;
  });

  // Stepped flanking piers with their caps (plain brick — no vertical tile
  // stripes, per user review).
  [-1, 1].forEach((s) => {
    const px = CX + s * (massHalf + pierW / 2);
    brickBox(pierW, pierTop, pierFrontZ - (FRONT_Z + 0.1), px, pierTop / 2, (FRONT_Z + 0.1 + pierFrontZ) / 2);
    addBox(pierW + 0.35, 0.3, pierFrontZ - FRONT_Z + 0.35, px, pierTop + 0.15, (FRONT_Z + 0.1 + pierFrontZ) / 2, coping);
  });

  // ── Logo anchor: centered in the gable, just above the spring line ──────
  // Sized to sit INSIDE the gable triangle (user review: the previous 15ft
  // frame ran the visible ticket past the raking copings on both sides and
  // over the peak). Two-thirds of that frame, and the anchor dropped so the
  // emblem's bottom clears the spring line while its top corners stay under
  // the raking edges with a comfortable margin.
  const logoWidth = Math.min(9.0, massHalf * 1.05);
  const logoHeight = logoWidth * 0.6;
  const logoAnchor: FacadeLogoAnchor = {
    x: CX,
    y: gableBase + logoHeight * 0.58,
    z: towerFrontZ + 0.05,
    width: logoWidth,
    height: logoHeight,
    gable: { baseY: gableBase, halfWidth: massHalf, height: gableH },
    fascia: { width: storeWidth, bottomY: WINDOW_HEAD_Y, topY: parapetTop },
  };

  return { group, logoAnchor };
}
