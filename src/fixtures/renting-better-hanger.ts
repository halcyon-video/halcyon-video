// RENTING IS BETTER THAN EVER — the 2010 campaign's ceiling cards, one over
// the front media shelf row of each field. Owner ask 2026-09-06: "something
// that would hang from the ceiling, maybe two of them in our normal store";
// owner ruling the same day: they hang lower than the first pass, "should
// only live over actual media shelf rows" (never the walkway), and only in
// the 2010 store.
//
// SIZE. Nothing on the card states its size, so it is read off the campaign
// reference photo (renting-better-banner/reference, the aisle shot): the cards
// hang from the ceiling grid over an aisle, several in a row receding down the
// run, all facing the same way, each on two short monofilament drops, sitting
// just above the genre blades on the gondola tops. The nearest spans about
// half a 4 ft bay — a 24 in wide stock card, which the render's own aspect
// makes 18.4 in tall. The art is the committed render
// (src/assets/signage/renting-better-banner.png), recoloured to the theme
// livery by bundled-sign-art.ts, printed both sides like the real card.
//
// PLACEMENT. The plan's shelving units are chained into lines (ShelvingUnit
// lineId); the ceiling-nav blade for each line hangs over the line's centroid
// at 9.75 ft. A card goes over the FRONT unit of the line flanking the centre
// walkway on each side (the front-most of them where several share that
// lane) — the first row a shopper reaches from the counter — turned to face
// the counter exactly as the nav blades are, so it sits over a real shelf
// row, ahead of and below that row's blade, and reads on the walk in. A
// one-unit line puts the card a quarter run ahead of the blade instead of
// straight under it.
//
// HEIGHT. Card centre 7.4 ft: the bottom at 6.6 ft rides a clear 1.5 ft above
// a corporate gondola's 4.6 ft frame plus its flush topper, and its top at
// 8.2 ft stays under the blade above it.
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import type { ShelvingUnit } from '../store-layout';
import { markSignMesh } from '../sign-builders';
import { campaignKit2010Visible } from '../pop-period';
import { STORE_CENTER_X, FIELD_Z_FRONT } from '../store-layout';
import { cachedSignArt, resolveSignArt, type SignArtSpec } from './bundled-sign-art';
import rentingBetterArt from '../assets/signage/renting-better-banner.png';

const CARD_W_FT = 24 / 12;
const CARD_H_FT = CARD_W_FT * (1475 / 1920); // the render's pixel aspect
const CARD_CENTER_Y = 7.4;
const DROP_U = 0.38;                          // drops at ±38 % of the width
const ART: SignArtSpec = {
  bundled: rentingBetterArt,
  userAsset: 'fixtures/renting-better-banner/front.png',
  // The render's own inks: white card, blue copy.
  inks: { primary: '#2041ae', text: '#ffffff' },
};

// Stand-in for the frames before the render decodes: a plain card with the
// headline, nothing more.
let fallback: THREE.Texture | null = null;
function fallbackTexture(): THREE.Texture {
  if (fallback) return fallback;
  const w = 768;
  const h = Math.round(w * CARD_H_FT / CARD_W_FT);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1c3f9e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${0.16 * h}px Arial, sans-serif`;
  ['RENTING IS', 'BETTER', 'THAN EVER'].forEach((line, i) => {
    ctx.fillText(line, w / 2, (0.28 + 0.22 * i) * h);
  });
  fallback = new THREE.CanvasTexture(canvas);
  fallback.colorSpace = THREE.SRGBColorSpace;
  return fallback;
}

interface CardSite { x: number; z: number; yaw: number }

// A unit's physical run length, recovered the way StorePlan.aisleZCenter()
// lays it out: the front edge sits at FIELD_Z_FRONT + zPos and the centre
// half a run behind it.
function unitRunLength(plan: StoreScene['plan'], u: ShelvingUnit): number {
  return 2 * (FIELD_Z_FRONT + u.zPos - plan.aisleZCenter(u));
}

// One site per field: over the front unit of the shelving line flanking the
// walkway on each side, facing the counter.
function cardSites(scene: StoreScene): CardSite[] {
  const plan = scene.plan;
  const lines = new Map<number, ShelvingUnit[]>();
  for (const u of plan.shelvingUnits) {
    const list = lines.get(u.lineId);
    if (list) list.push(u); else lines.set(u.lineId, [u]);
  }
  const counterZ = scene.deskApexZ();
  // The line flanking the walkway on each side (nearest the centreline), and
  // of those the front-most: the row a shopper reaches first from the counter.
  type Pick = { inset: number; zAvg: number; units: ShelvingUnit[] };
  const best: Record<'left' | 'right', Pick | null> = { left: null, right: null };
  for (const units of lines.values()) {
    const xAvg = units.reduce((s, u) => s + u.xCenter, 0) / units.length;
    const zAvg = units.reduce((s, u) => s + plan.aisleZCenter(u), 0) / units.length;
    const inset = Math.abs(xAvg - STORE_CENTER_X);
    const side = xAvg < STORE_CENTER_X ? 'left' : 'right';
    const cur = best[side];
    if (!cur || inset < cur.inset - 0.5 || (Math.abs(inset - cur.inset) <= 0.5 && zAvg > cur.zAvg)) {
      best[side] = { inset, zAvg, units };
    }
  }
  const sites: CardSite[] = [];
  for (const side of ['left', 'right'] as const) {
    const line = best[side];
    if (!line) continue;
    const front = line.units.find((u) => u.isLineFront)
      ?? line.units.reduce((a, b) => (a.posInLine <= b.posInLine ? a : b));
    const zc = plan.aisleZCenter(front);
    const localZ = line.units.length === 1 ? zc + unitRunLength(plan, front) / 4 : zc;
    const { x, z } = plan.unitToWorld(front, front.xCenter, localZ);
    sites.push({ x, z, yaw: Math.atan2(STORE_CENTER_X - x, counterZ - z) });
  }
  return sites;
}

/**
 * @param ceilingYAt Height of the ceiling the drops tie off to at (x, z) —
 * the dropped cash-wrap soffit near the counter, the tile deck elsewhere.
 */
export function buildRentingBetterHangers(
  scene: StoreScene,
  ceilingYAt?: (x: number, z: number) => number,
): void {
  if (!campaignKit2010Visible()) return;
  const sites = cardSites(scene);
  if (sites.length === 0) return; // no shelf rows to hang over

  const group = new THREE.Group();
  group.name = 'renting-better-hangers';
  scene.scene.add(group);
  scene.activeSignageObjects.push(group);

  const mat = new THREE.MeshStandardMaterial({
    map: cachedSignArt(ART) ?? fallbackTexture(),
    side: THREE.FrontSide,
    roughness: 0.6, // printed card stock
    metalness: 0.0,
  });
  const geo = new THREE.PlaneGeometry(CARD_W_FT, CARD_H_FT);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0x14141a, roughness: 0.4, metalness: 0.0, transparent: true, opacity: 0.35,
  });
  sites.forEach((site, i) => {
    // Each card is its own little rig: turned toward the counter as a whole,
    // so faces and drops stay put relative to each other.
    const rig = new THREE.Group();
    rig.name = `renting-better-${i + 1}`;
    rig.position.set(site.x, 0, site.z);
    rig.rotation.y = site.yaw;
    group.add(rig);
    for (const dz of [0.006, -0.006]) {
      const face = new THREE.Mesh(geo, mat);
      face.name = `renting-better-${i + 1}-${dz > 0 ? 'counter' : 'salesfloor'}`;
      face.position.set(0, CARD_CENTER_Y, dz);
      if (dz < 0) face.rotation.y = Math.PI;
      markSignMesh(face);
      rig.add(face);
    }
    // Two monofilaments from the card's top edge up to the ceiling.
    const anchorY = ceilingYAt ? ceilingYAt(site.x, site.z) : scene.ceilingY;
    const topY = CARD_CENTER_Y + CARD_H_FT / 2;
    const len = Math.max(0.05, anchorY - topY);
    for (const u of [-DROP_U, DROP_U]) {
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 4), lineMat);
      line.position.set(u * CARD_W_FT, topY + len / 2, 0);
      rig.add(line);
    }
  });

  resolveSignArt(ART, (tex) => {
    mat.map = tex; // harmless if this build was already torn down
    mat.needsUpdate = true;
    scene.requestRender();
  });
}
