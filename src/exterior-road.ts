// GH #145: models a street across the parking lot's front (street-facing)
// edge instead of letting the lot's asphalt plane end in a hard cut against
// the sky pano's photographed ground — or, per the #144 attempt this
// replaces, a wide gray alpha fade that read as a fog bank / under-lit halo
// rather than pavement. A modeled road (asphalt lane, curb + gutter, dashed
// centerline) gives the lot a plausible object to end AT; only the road's
// own outer edge, and (behind the bare curb) the lot's two side edges, still
// get a ground-blend.ts seam fade — narrowed way down from #144's 16 ft ring
// to a couple of feet, since blending a flat tinted quad over photo detail
// reads as haze at any width, it's just imperceptible once narrow enough.
//
// Every mesh here is static (materials swap on setGroundColor, nothing
// per-frame) and merges into whichever parent group the caller passes,
// riding that group's existing exterior env-map dimming pass for free.
import * as THREE from 'three';
import { createAsphaltTexture } from './canvas-textures';
import { buildGroundBlend } from './ground-blend';

export interface ExteriorRoad {
  group: THREE.Group;
  setGroundColor(color: THREE.Color): void;
  dispose(): void;
}

export interface ExteriorRoadOptions {
  centerX: number;
  minX: number; // lot's exposed left edge (world x)
  maxX: number; // lot's exposed right edge (world x)
  frontZ: number; // lot's near edge (against the building — not curbed, never seen)
  farZ: number; // lot's far/street-facing edge (world z) — the road starts here
  initialGroundColor: THREE.Color;
}

const CURB_COLOR = '#6d6a60'; // matches the entrance curb in exterior-environment.ts
const GUTTER_COLOR = '#5c584e'; // poured concrete gutter pan, a shade darker than the curb
const CENTERLINE_COLOR = '#d9bd49'; // worn traffic-paint yellow

const CURB_DEPTH = 0.4; // z-thickness of the raised curb, ft — matches the entrance curb
const CURB_HEIGHT = 0.14;
const GUTTER_DEPTH = 1.6; // flat drainage pan between the curb and the road surface, ft
const ROAD_DEPTH = 26; // two-lane road, ft (24-30 requested)
const ROAD_OVERHANG = 70; // road runs this far past the lot's side edges, ft — wide
// enough that its ends leave frame rather than terminating in the photo
const ROAD_TILE_FT = 9; // asphalt-texture tile scale, matches the lot's own stall-width tiling
const FAR_FADE_WIDTH = 6; // seam fade where the road's own outer edge meets the pano
const SIDE_FADE_WIDTH = 5; // seam fade behind the lot's side curbs, where no road covers

const DASH_LENGTH = 6;
const DASH_GAP = 10;
const DASH_WIDTH = 0.45;
const DASH_HEIGHT = 0.02;

export function buildExteriorRoad(parent: THREE.Object3D, opts: ExteriorRoadOptions): ExteriorRoad {
  const { centerX, minX, maxX, frontZ, farZ, initialGroundColor } = opts;
  const group = new THREE.Group();
  group.name = 'exteriorRoad';
  parent.add(group);

  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T): T => { disposables.push(x); return x; };

  const lotDepth = farZ - frontZ;
  const roadMinX = minX - ROAD_OVERHANG;
  const roadMaxX = maxX + ROAD_OVERHANG;
  const roadWidth = roadMaxX - roadMinX;

  // ─── Curbs on all three exposed lot edges (issue #145 rule: "a curb is
  // what a lot edge looks like"). The far curb runs the road's full width
  // (not just the lot's) so there's no gap at the corners where the side
  // curbs meet it.
  const curbMat = track(new THREE.MeshStandardMaterial({ color: CURB_COLOR, roughness: 0.85, metalness: 0.0 }));
  const farCurb = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, CURB_HEIGHT, CURB_DEPTH), curbMat);
  farCurb.position.set(centerX, -0.03, farZ + CURB_DEPTH / 2);
  farCurb.receiveShadow = true;
  group.add(farCurb);

  const sideCurbGeo = track(new THREE.BoxGeometry(CURB_DEPTH, CURB_HEIGHT, lotDepth + CURB_DEPTH));
  [minX, maxX].forEach((x) => {
    const sideCurb = new THREE.Mesh(sideCurbGeo, curbMat);
    sideCurb.position.set(x, -0.03, frontZ + lotDepth / 2);
    sideCurb.receiveShadow = true;
    group.add(sideCurb);
  });

  // ─── Gutter pan: flat concrete strip between the curb and the road surface.
  const gutterMat = track(new THREE.MeshStandardMaterial({ color: GUTTER_COLOR, roughness: 0.9, metalness: 0.0 }));
  const gutterZ = farZ + CURB_DEPTH;
  const gutter = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, GUTTER_DEPTH), gutterMat);
  gutter.rotation.x = -Math.PI / 2;
  gutter.position.set(centerX, -0.03, gutterZ + GUTTER_DEPTH / 2);
  gutter.receiveShadow = true;
  group.add(gutter);

  // ─── Road surface: the lot's own asphalt generator with the parking-stall
  // side lines suppressed (a through street has no stall markings).
  const roadStartZ = gutterZ + GUTTER_DEPTH;
  const roadEndZ = roadStartZ + ROAD_DEPTH;
  const roadTex = track(createAsphaltTexture(0, 0));
  roadTex.repeat.set(roadWidth / ROAD_TILE_FT, ROAD_DEPTH / ROAD_TILE_FT);
  const roadMat = track(new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95, metalness: 0.0 }));
  const road = new THREE.Mesh(new THREE.PlaneGeometry(roadWidth, ROAD_DEPTH), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(centerX, -0.03, roadStartZ + ROAD_DEPTH / 2);
  road.receiveShadow = true;
  group.add(road);

  // ─── Dashed centerline, one instanced box per dash spanning the road's
  // full width so it runs off both sides rather than stopping mid-frame.
  const dashGeo = track(new THREE.BoxGeometry(DASH_LENGTH, DASH_HEIGHT, DASH_WIDTH));
  const dashMat = track(new THREE.MeshStandardMaterial({ color: CENTERLINE_COLOR, fog: false }));
  const pitch = DASH_LENGTH + DASH_GAP;
  const dashCount = Math.max(1, Math.ceil(roadWidth / pitch));
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const dashZ = roadStartZ + ROAD_DEPTH / 2;
  const dashY = -0.03 + DASH_HEIGHT / 2 + 0.005; // proud of the road surface, no z-fight
  const m = new THREE.Matrix4();
  for (let i = 0; i < dashCount; i++) {
    const x = roadMinX + pitch / 2 + i * pitch;
    m.makeTranslation(x, dashY, dashZ);
    dashMesh.setMatrixAt(i, m);
  }
  dashMesh.instanceMatrix.needsUpdate = true;
  group.add(dashMesh);

  // ─── Seam fades (ground-blend.ts, narrowed): the road's own outer edge is
  // the only edge that meets the pano directly, so it always gets one. The
  // lot's two side edges (behind the bare curb, where no road covers) get a
  // second, since a thin curb alone can still read as a cut against a busy
  // photo — both stay far narrower than #144's 16 ft ring, since a flat
  // tinted quad blended over photo detail reads as haze at any width and the
  // fix is making the affected strip small enough not to register.
  const farBlend = track(buildGroundBlend(group, {
    minX: roadMinX,
    maxX: roadMaxX,
    frontZ: roadStartZ,
    farZ: roadEndZ,
    fadeWidth: FAR_FADE_WIDTH,
    initialColor: initialGroundColor,
  }));
  const sideBlend = track(buildGroundBlend(group, {
    minX,
    maxX,
    frontZ,
    farZ,
    fadeWidth: SIDE_FADE_WIDTH,
    initialColor: initialGroundColor,
  }));

  function setGroundColor(color: THREE.Color) {
    farBlend.setColor(color);
    sideBlend.setColor(color);
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
    parent.remove(group);
  }

  return { group, setGroundColor, dispose };
}
