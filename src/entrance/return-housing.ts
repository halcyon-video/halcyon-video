// Single-slot tape-return housing (GH #403) — the SECOND return-station
// style, beside the two-mouth "RETURN TAPES HERE" chute of #219. A blue
// laminate saddle caps the counter band: a lettered front panel hanging
// almost to the floor, a rolled crown over the counter top, side cheeks and
// a short clip over the staff-side band top. One opening a little bigger
// than a VHS case sits below the "TAPE RETURN" lettering, with a tapered
// pale-metal throat behind it and a smaller lettered plate beneath. The
// proportions are read off the owner's close-up (reference record
// lenneth-tape-return-20261012, circa 2000 by the owner's estimate): the
// face is ~0.78 as wide as it is tall, the opening sits a third of the way
// down and spans ~0.4 of the width, the lower label sits 0.55–0.76 down.
// The photo's decal on the crown carries a chain mark, so it stays off.
//
// Same local frame as return-slot.ts: housing centred on x=0, customer face
// toward +Z, the counter band's outer face at z=0 and its inner face at
// z=-1.5. ReturnSlot owns the group, materials, drop ritual and disposal;
// this module only grows the fallback geometry and paints the two labels.
// The fitted GLB (tools/models/single-slot-return.py) replaces the boxes
// when it arrives; the painted labels stay on top of either.
import * as THREE from 'three';
import { BB_ARCHIVO_BLACK, ensureBundledFont } from '../bundled-fonts';
import type { ReturnSlotModelSpec } from './return-slot-model';

export const HOUSING_W = 2.7;
export const HOUSING_H = 3.9;    // crown top, just over the 3.54 band top
export const HOUSING_BOT = 0.35; // the front panel hangs almost to the floor
export const HOUSING_FACE = 1 / 3; // proud of the band face, as the chute
const SKIN = 0.14;
const ROLL = 0.33;               // quarter-round crown along the top-front edge
const REAR = -1.49;              // tucks to the band's inner face, as the chute
const CLIP_Y = 2.55;             // the staff-side leg stops here
export const MOUTH_W = 1.0, MOUTH_H = 0.62, MOUTH_Y = 2.41;
const LABEL_Y0 = 1.22, LABEL_Y1 = 1.95, LABEL_HALF_W = 0.56;
const LETTER_Y = 3.08;           // main lettering centre line
const LETTER_INK_W = 2.08;       // "TAPE RETURN" ink run across the face

export const SINGLE_SLOT_MODEL: ReturnSlotModelSpec = {
  url: 'models/single-slot-return.glb', name: 'single-slot-return-model',
  min: [-HOUSING_W / 2, HOUSING_BOT, REAR], max: [HOUSING_W / 2, HOUSING_H, HOUSING_FACE + .012],
  roles: ['ChuteLaminate', 'ChuteSteel', 'ChuteReveal'], flap: false,
};

/** What ReturnSlot lends the builder: its group, box helper and owned pools. */
export interface HousingKit {
  group: THREE.Group;
  box: (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, collide?: boolean) => THREE.Mesh;
  blueMat: THREE.Material;
  metalMat: THREE.Material;
  darkMat: THREE.Material;
  ownGeometry: (g: THREE.BufferGeometry) => void;
  ownMaterial: (m: THREE.Material) => void;
  ownTexture: (t: THREE.Texture) => void;
  requestRender: () => void;
}

/**
 * Grow the procedural housing and paint its labels. Returns the fallback
 * meshes the fitted model hides when it installs (the labels are not among
 * them — they ride on top of either).
 */
export function buildSingleSlotHousing(kit: HousingKit, goldHex: string): THREE.Object3D[] {
  const { box, blueMat, metalMat, darkMat } = kit;
  const zFace = HOUSING_FACE;
  const faceZ = zFace - SKIN / 2;
  const depth = zFace - REAR;
  const midZ = (REAR + zFace) / 2;
  const mouthBot = MOUTH_Y - MOUTH_H / 2, mouthTop = MOUTH_Y + MOUTH_H / 2;
  const wallTop = HOUSING_H - ROLL;
  // Front panel: solid above and below the opening, narrow stiles beside it.
  box(HOUSING_W, wallTop - mouthTop, SKIN, 0, (mouthTop + wallTop) / 2, faceZ, blueMat);
  box(HOUSING_W, mouthBot - HOUSING_BOT, SKIN, 0, (mouthBot + HOUSING_BOT) / 2, faceZ, blueMat);
  const stileW = HOUSING_W / 2 - MOUTH_W / 2;
  for (const sx of [-1, 1]) box(stileW, MOUTH_H, SKIN, sx * (MOUTH_W / 2 + stileW / 2), MOUTH_Y, faceZ, blueMat);
  // Side cheeks, full counter depth, down to the panel's hem.
  for (const sx of [-1, 1]) box(SKIN, wallTop - HOUSING_BOT, depth, sx * (HOUSING_W - SKIN) / 2, (wallTop + HOUSING_BOT) / 2, midZ, blueMat);
  // Crown: flat slab behind the bullnose, plus the quarter-round nose itself.
  box(HOUSING_W, ROLL, depth - ROLL, 0, HOUSING_H - ROLL / 2, (REAR + zFace - ROLL) / 2, blueMat);
  const noseG = new THREE.CylinderGeometry(ROLL, ROLL, HOUSING_W, 24, 1, false, 0, Math.PI / 2);
  noseG.rotateZ(Math.PI / 2);
  kit.ownGeometry(noseG);
  const nose = new THREE.Mesh(noseG, blueMat);
  nose.position.set(0, HOUSING_H - ROLL, zFace - ROLL);
  nose.castShadow = nose.receiveShadow = true;
  kit.group.add(nose);
  // Staff-side clip over the band top.
  box(HOUSING_W, wallTop - CLIP_Y, SKIN, 0, (wallTop + CLIP_Y) / 2, REAR + SKIN / 2, blueMat, false);
  // Throat liner (the fitted model tapers it) and the dark baffle it ends on.
  const LINER = 0.02, throatD = zFace - 0.05;
  box(MOUTH_W, LINER, throatD, 0, mouthTop - LINER / 2, zFace - throatD / 2, metalMat, false);
  box(MOUTH_W, LINER, throatD, 0, mouthBot + LINER / 2, zFace - throatD / 2, metalMat, false);
  for (const sx of [-1, 1]) box(LINER, MOUTH_H, throatD, sx * (MOUTH_W - LINER) / 2, MOUTH_Y, zFace - throatD / 2, metalMat, false);
  box(MOUTH_W, MOUTH_H, 0.02, 0, MOUTH_Y, 0.04, darkMat, false);
  // Lower label plate.
  box(LABEL_HALF_W * 2, LABEL_Y1 - LABEL_Y0, 0.012, 0, (LABEL_Y0 + LABEL_Y1) / 2, zFace + 0.006, metalMat, false);
  const fallback = [...kit.group.children];

  // "TAPE RETURN" across the face, theme gold on body blue; a smaller repeat
  // on the pale plate below the opening. Both in the bundled black grotesque,
  // sized by the measured ink run — never squeezed to fit.
  paintLabel(kit, goldHex, 'Single slot lettering', 2.4, 0.6, LETTER_INK_W, 0, LETTER_Y, zFace + 0.004);
  paintLabel(kit, goldHex, 'Single slot plate lettering', LABEL_HALF_W * 2, LABEL_Y1 - LABEL_Y0, 0.82, 0, (LABEL_Y0 + LABEL_Y1) / 2, zFace + 0.016);
  return fallback;
}

function paintLabel(kit: HousingKit, goldHex: string, name: string, w: number, h: number, inkW: number, x: number, y: number, z: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(1024 * h / w);
  const c = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  kit.ownTexture(tex);
  const paint = () => {
    const W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = goldHex;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    // Probe the face's real metrics, then solve the size that lays the ink
    // run across exactly inkW feet of the w-foot-wide plane.
    const PROBE = 100;
    c.font = `900 ${PROBE}px ${BB_ARCHIVO_BLACK}, Arial Black, sans-serif`;
    const probe = c.measureText('TAPE RETURN');
    const ink = probe.actualBoundingBoxLeft + probe.actualBoundingBoxRight;
    const px = PROBE * (inkW / w) * W / Math.max(1, ink);
    c.font = `900 ${px}px ${BB_ARCHIVO_BLACK}, Arial Black, sans-serif`;
    const m = c.measureText('TAPE RETURN');
    // Caps only: centre the ink box, not the em box.
    c.fillText('TAPE RETURN', W / 2, H / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    tex.needsUpdate = true;
    kit.requestRender();
  };
  paint();
  ensureBundledFont(BB_ARCHIVO_BLACK, paint);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: .08, roughness: .35, metalness: .03 });
  kit.ownMaterial(mat);
  const g = new THREE.PlaneGeometry(w, h);
  kit.ownGeometry(g);
  const plane = new THREE.Mesh(g, mat);
  plane.position.set(x, y, z);
  plane.castShadow = false;
  plane.receiveShadow = true;
  plane.name = name;
  kit.group.add(plane);
}
