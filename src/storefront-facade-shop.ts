// The mom-and-pop format's own exterior (GH #110) — StoreFormatSpec.facadeStyle
// 'storefront'. What shipped in c55c93c narrowed the chain's own brick/glazed-
// tile/gabled-tower facade instead of building the format its own building:
// a real neighbourhood shop's front is a plain painted-block or stucco wall
// with a flat fascia board over the door for a hand-lettered wordmark, and
// no illuminated marquee band. No gable, no tower, no brass trim course.
//
// Same contract as storefront-facade.ts's buildStorefrontFacade (same params
// shape minus the chain-only ones, same StorefrontFacade return: a group plus
// a logoAnchor the existing brand-emblem code (store-shell.ts) mounts onto
// unchanged) — everything here is static exterior dressing, nothing at or
// inside the walkable glass line at z = 15 (see entrance/index.ts's
// storefront-door branch for the interior side of this same wall).
import * as THREE from 'three';
import { STORE_CENTER_X, FRONT_GLASS_Z } from './store-layout';
import { createStuccoTexture } from './canvas-textures';
import { WINDOW_HEAD_Y, type FacadeLogoAnchor, type StorefrontFacade } from './storefront-facade';

export interface ShopFacadeBuildParams {
  storeWidth: number;
  backWallZ: number;
  ceilingY: number;
  entryHalfWidth: number;   // vestibuleHalfWidth(spec) — half the door+jamb opening
  trimColor: string;        // fascia/coping trim (theme secondary)
  sideRibbon: { frontZ: number; backZ: number } | null;
  frontCornerMargin: number; // solid return the front glazing leaves at each corner
}

const CX = STORE_CENTER_X;
const FRONT_Z = FRONT_GLASS_Z;

export function buildShopfrontFacade(params: ShopFacadeBuildParams): StorefrontFacade {
  const { storeWidth, backWallZ, ceilingY, entryHalfWidth, trimColor, sideRibbon, frontCornerMargin } = params;
  const group = new THREE.Group();
  group.name = 'storefrontFacadeShop';

  const leftEdgeX = CX - storeWidth / 2;
  const rightEdgeX = CX + storeWidth / 2;

  // A short parapet — this format's own 9 ft ceiling doesn't want the chain's
  // 4.6 ft rise above the glazing head, just enough to close the roofline.
  const fasciaBot = WINDOW_HEAD_Y - 0.1;
  const parapetTop = ceilingY + 1.8;
  const fasciaH = parapetTop - fasciaBot;
  const fasciaCY = (fasciaBot + parapetTop) / 2;

  const stuccoSrc = createStuccoTexture();
  const stuccoMaterial = (repX: number, repY: number): THREE.MeshStandardMaterial => {
    const map = stuccoSrc.map.clone();
    const normalMap = stuccoSrc.normalMap.clone();
    const roughnessMap = stuccoSrc.roughnessMap.clone();
    [map, normalMap, roughnessMap].forEach((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repX, repY);
      t.needsUpdate = true;
    });
    return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1.0, metalness: 0.0 });
  };
  const STUCCO_FEET = 4.0; // tile scale, matches the chain facade's brick tiling convention
  const stuccoBox = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stuccoMaterial(Math.max(w, d) / STUCCO_FEET, h / STUCCO_FEET));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  const trimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(trimColor), roughness: 0.55, metalness: 0.05 });
  const coping = new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.6, metalness: 0.2 });
  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // ── Fascia band: the hand-lettered sign board, full width. No stripe, no
  // brass course, no self-illumination — a painted board, not a marquee. ────
  stuccoBox(storeWidth + 0.6, fasciaH, 0.6, CX, fasciaCY, FRONT_Z + 0.35);
  addBox(storeWidth + 0.65, 0.14, 0.65, CX, parapetTop + 0.07, FRONT_Z + 0.35, trimMat); // thin cap trim
  addBox(storeWidth + 0.6, 0.1, 0.62, CX, fasciaBot - 0.05, FRONT_Z + 0.35, trimMat);    // sill trim under the board

  // ── Solid returns filling the front-wall corner margins, floor to fascia —
  // the same idea as the chain's brick returns, in stucco. ───────────────────
  if (frontCornerMargin > 0.05) {
    ([[leftEdgeX, 1], [rightEdgeX, -1]] as [number, number][]).forEach(([edgeX, s]) => {
      const w = frontCornerMargin + 0.3;
      stuccoBox(w, fasciaBot, 0.5, edgeX + s * (frontCornerMargin - 0.3) / 2, fasciaBot / 2, FRONT_Z + 0.3);
    });
  }

  // ── Solid jamb returns flanking the door opening, floor to fascia — closes
  // the gap between the door's own interior surround (entrance/index.ts) and
  // this exterior cladding, flush (no portico, no recessed tower: a real
  // small shop's door sits right in the wall plane). ─────────────────────────
  {
    const w = 0.5;
    [-1, 1].forEach((s) => {
      stuccoBox(w, fasciaBot, 0.5, CX + s * (entryHalfWidth + w / 2), fasciaBot / 2, FRONT_Z + 0.3);
    });
  }

  // ── Side elevations: plain stucco everywhere the interior glazing isn't,
  // same short parapet cap as the front, wrapped around the corner. ─────────
  const sideLen = FRONT_Z - backWallZ;
  const sideCZ = (FRONT_Z + backWallZ) / 2;
  ([[leftEdgeX, -1], [rightEdgeX, 1]] as [number, number][]).forEach(([wallX, s]) => {
    const vx = wallX + s * 0.3;
    const vBox = (z0: number, z1: number, y0: number, y1: number) => {
      if (z1 - z0 < 0.05 || y1 - y0 < 0.05) return;
      stuccoBox(0.5, y1 - y0, z1 - z0, vx, (y0 + y1) / 2, (z0 + z1) / 2);
    };
    if (!sideRibbon) {
      vBox(backWallZ, FRONT_Z, 0, fasciaBot);
    } else {
      vBox(backWallZ, sideRibbon.backZ, 0, fasciaBot);
      vBox(sideRibbon.frontZ, FRONT_Z, 0, fasciaBot);
      vBox(sideRibbon.backZ, sideRibbon.frontZ, WINDOW_HEAD_Y, fasciaBot);
      vBox(sideRibbon.backZ, sideRibbon.frontZ, 0, 1.6); // stucco knee under the glass
    }
    stuccoBox(0.5, fasciaH, sideLen, wallX + s * 0.35, fasciaCY, sideCZ);
    addBox(0.6, 0.12, sideLen + 0.05, wallX + s * 0.35, parapetTop + 0.06, sideCZ, coping);
  });

  // ── Rear elevation: plain stucco, same short cap, no signage. ──────────────
  {
    const rearZ = backWallZ - 0.3;
    const rearW = storeWidth + 1.0;
    stuccoBox(rearW, fasciaBot, 0.5, CX, fasciaBot / 2, rearZ);
    stuccoBox(rearW + 0.1, fasciaH, 0.6, CX, fasciaCY, backWallZ - 0.35);
    addBox(rearW + 0.1, 0.12, 0.65, CX, parapetTop + 0.06, backWallZ - 0.35, coping);
  }

  // ── Logo anchor: centred on the fascia band. gable is a degenerate flat
  // shape sized to the fascia itself (never a real triangular gable on this
  // facade) so any brand LogoSpec that asks for freestanding 3D letters —
  // logo-storefront.ts reads anchor.gable/anchor.fascia interchangeably —
  // still resolves to sane geometry instead of dividing by a zero height. ────
  const fasciaWidth = storeWidth + 0.6;
  const logoHeight = Math.min(fasciaH * 0.62, 1.9);
  const logoWidth = Math.min(fasciaWidth * 0.58, logoHeight * 1.8);
  const logoAnchor: FacadeLogoAnchor = {
    x: CX,
    // Empirically, not geometrically, centred: create3DDoubleLayeredSign's
    // plane IS centred on this anchor, but the active brand's actual glyph
    // ink sits low within its own texture frame (there's transparent margin
    // above the wordmark), so anchoring at the band's true vertical centre
    // reads as sitting high — pinning near the sill instead keeps the
    // visible lettering clear of the coping cap above.
    y: fasciaBot + 0.1,
    z: FRONT_Z + 0.35 + 0.31,
    width: logoWidth,
    height: logoHeight,
    gable: { baseY: fasciaBot, halfWidth: fasciaWidth / 2, height: fasciaH },
    fascia: { width: fasciaWidth, bottomY: fasciaBot, topY: parapetTop },
  };

  return { group, logoAnchor };
}
