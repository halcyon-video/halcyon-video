// T15 exterior/environment pass: everything beyond the storefront glass that
// exists purely to be *seen* through it — sidewalk/curb, street furniture,
// street lamps with fake light pools, a handful of parked cars, and a
// storefront light-spill decal.
//
// Deliberately dumb and cheap: every mesh here is a box/cylinder/plane with a
// canvas texture, nothing casts shadows unless it's right at the entrance
// (bollards) where it's cheap and visible, and nothing updates per frame —
// the whole group is built once and only reacts to day/night mode flips via
// setOutsideMode() (material color/opacity/texture swaps, not per-frame
// animation), keeping the exterior's steady-state cost ~zero while the
// player is deep in the store. See outdoor-lighting.ts for the sun/sky
// system this hooks into; this module owns no lighting of its own beyond a
// couple of purely cosmetic emissive materials (lamp heads, glow decals).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createLightPoolTexture, createSoftShadowTexture, createConcreteSidewalkTexture } from './canvas-textures';
import { tryLoadUserAssetTexture } from './user-assets';
import { assetUrl } from './asset-url';
import type { OutsideMode } from './outdoor-lighting';
import { STORE_CENTER_X, FRONT_GLASS_Z } from './store-layout';

export interface ExteriorEnvironment {
  group: THREE.Group;
  setOutsideMode(mode: OutsideMode): void;
  dispose(): void;
}

const CURB_COLOR = '#6d6a60';
const CAR_COLORS = ['#0d0d0f', '#1a2338', '#2b1414', '#33342c', '#15181a', '#3a3a3e'];

// ─── Parking-stall grid: single source of truth ─────────────────────────────
// Shared between the parked cars below and the painted stall lines on the
// asphalt (built separately in three-scene.ts, since the lot plane + its
// canvas texture are part of the store shell, not the exterior dressing).
// Both consumers derive their world positions from this one object so a car
// can never end up straddling a line or drift off a stall — see the
// "Parking lot" section of StoreScene's shell-building code for the paint
// side of this contract.
const LOT_APRON_FT = 5.0; // sidewalk + curb strip between the glass and the drive lane
const LOT_LANE_DEPTH_FT = 24.0; // drive lane between the apron and the stall row
export const PARKING_STALLS = {
  centerX: STORE_CENTER_X, // world x of the stall row's centerline (== store centerline)
  stallWidth: 9.0, // ft — x-span of one stall / one asphalt-texture tile
  count: 5, // stalls in the single row (keep odd: centers the middle stall on centerX,
  // which is what lets the painted-line phase — also centered on centerX with an
  // odd tile count — line up with every stall without any extra offset math)
  rowFrontZ: FRONT_GLASS_Z + LOT_APRON_FT + LOT_LANE_DEPTH_FT, // 44 — z where the stall row begins
  depth: 18.0, // ft — z-span (depth) of the stall row
} as const;

export function buildExteriorEnvironment(scene: THREE.Scene, storeWidth: number): ExteriorEnvironment {
  const group = new THREE.Group();
  group.name = 'exteriorEnvironment';
  scene.add(group);

  const centerX = PARKING_STALLS.centerX;
  const leftEdgeX = centerX - storeWidth / 2;
  const rightEdgeX = centerX + storeWidth / 2;
  const frontZ = FRONT_GLASS_Z; // matches the storefront glass line in three-scene.ts

  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T): T => { disposables.push(x); return x; };

  // ─── Curb + sidewalk band ────────────────────────────────────────────────
  // Flush with the interior floor (no trip hazard at the threshold), running
  // the width of the storefront plus the corner piers, from the glass line
  // out to just past the entrance tower's projection (storefront-facade.ts).
  const sidewalkDepth = 4.4;
  // One texture tile = one ~4.5 ft slab, so the baked expansion joints repeat
  // at the real sidewalk rhythm (was a single flat color — front and center
  // in the view out the doors).
  const sidewalkTex = track(createConcreteSidewalkTexture());
  sidewalkTex.repeat.set((storeWidth + 8) / 4.5, 1);
  const sidewalkMat = track(new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.9, metalness: 0.0 }));
  const sidewalk = new THREE.Mesh(
    new THREE.BoxGeometry(storeWidth + 8, 0.08, sidewalkDepth),
    sidewalkMat,
  );
  sidewalk.position.set(centerX, -0.04, frontZ + sidewalkDepth / 2);
  sidewalk.receiveShadow = true;
  group.add(sidewalk);

  // Optional real photo-scanned concrete (ambientCG Concrete048, CC0) from the
  // git-ignored user-assets tree. Loads async like the car GLBs below (lands in
  // the boot render window); a 404 leaves the procedural sidewalk up. The real
  // pack also adds normal + roughness the procedural map didn't carry.
  {
    const sw = sidewalkTex.repeat.x, sh = sidewalkTex.repeat.y;
    const configSidewalk = (tex: THREE.Texture) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(sw, sh);
      tex.anisotropy = 16;
      track(tex);
    };
    tryLoadUserAssetTexture('surfaces/store-sidewalk/color.png', (tex) => {
      configSidewalk(tex); sidewalkMat.map = tex; sidewalkMat.needsUpdate = true;
    });
    tryLoadUserAssetTexture('surfaces/store-sidewalk/normal.png', (tex) => {
      configSidewalk(tex); sidewalkMat.normalMap = tex;
      sidewalkMat.normalScale.set(0.6, 0.6); sidewalkMat.needsUpdate = true;
    }, { srgb: false });
    tryLoadUserAssetTexture('surfaces/store-sidewalk/roughness.png', (tex) => {
      configSidewalk(tex); sidewalkMat.roughnessMap = tex; sidewalkMat.needsUpdate = true;
    }, { srgb: false });
  }

  const curbMat = track(new THREE.MeshStandardMaterial({ color: CURB_COLOR, roughness: 0.85, metalness: 0.0 }));
  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(storeWidth + 8, 0.14, 0.4),
    curbMat,
  );
  curb.position.set(centerX, -0.03, frontZ + sidewalkDepth + 0.05);
  curb.receiveShadow = true;
  group.add(curb);

  // ─── Bollards flanking the entrance ─────────────────────────────────────
  const bollardMat = track(new THREE.MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.5, metalness: 0.4 }));
  const bollardBandMat = track(new THREE.MeshStandardMaterial({ color: '#ffcc33', roughness: 0.4, metalness: 0.2 }));
  [leftEdgeX - 1.4, rightEdgeX + 1.4].forEach((bx) => {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.9, 12), bollardMat);
    bollard.position.set(bx, 0.45, frontZ + 1.6);
    bollard.castShadow = true;
    bollard.receiveShadow = true;
    group.add(bollard);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.1, 12), bollardBandMat);
    band.position.set(bx, 0.65, frontZ + 1.6);
    group.add(band);
  });

  // ─── Newspaper/rental-return box prop, off to the side of the entrance ──
  const boxMat = track(new THREE.MeshStandardMaterial({ color: '#8a1f1f', roughness: 0.55, metalness: 0.1 }));
  const boxSlotMat = track(new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.8 }));
  const newsBox = new THREE.Mesh(new THREE.BoxGeometry(1.3, 3.2, 1.3), boxMat);
  newsBox.position.set(rightEdgeX + 2.6, 1.6, frontZ + 1.3);
  newsBox.castShadow = true;
  newsBox.receiveShadow = true;
  group.add(newsBox);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.05), boxSlotMat);
  slot.position.set(rightEdgeX + 2.6, 2.5, frontZ + 1.3 + 0.66);
  group.add(slot);

  // ─── Street lamps with fake pooled light ────────────────────────────────
  // "Fake" per the ticket: no real THREE.Light, just an emissive head plus a
  // radial-gradient decal on the asphalt. Intensity/opacity swap with mode.
  const poleMat = track(new THREE.MeshStandardMaterial({ color: '#3a3d40', roughness: 0.6, metalness: 0.5 }));
  const lampHeadMat = track(new THREE.MeshStandardMaterial({
    color: '#fff3d6', emissive: new THREE.Color('#ffdca0'), emissiveIntensity: 0.05, roughness: 0.4,
  }));
  const poolTex = track(createLightPoolTexture('#ffdca0'));
  const poolMat = track(new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));

  // Lamps stand on the stall boundary lines at the far edge of the one-row
  // lot (issue #58): lot asphalt ends at frontZ + 47, stall lines every 9 ft
  // from centerX, so poles at ±13.5 sit between parked cars.
  const lampPositions: [number, number][] = [
    [centerX - 13.5, frontZ + 47],
    [centerX + 13.5, frontZ + 47],
  ];
  // Every head/pool shares one material each, so flipping lampHeadMat/poolMat
  // in setOutsideMode() below updates all of them at once — no per-instance
  // bookkeeping needed.
  lampPositions.forEach(([lx, lz]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 13, 8), poleMat);
    pole.position.set(lx, 6.5, lz);
    pole.castShadow = true; // prebaked shadow map — a static pole is free
    pole.receiveShadow = true;
    group.add(pole);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), lampHeadMat);
    head.position.set(lx, 13.1, lz);
    group.add(head);

    const pool = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(lx, -0.02, lz);
    group.add(pool);
  });

  // ─── Parked cars: real low-poly GLB models in a row of stalls ──────────
  // CC0 low-poly cars from Poly Pizza (Quaternius / Kay Lousberg — see
  // public/models/ATTRIBUTION.md), cycled across the stalls for variety.
  // Loaded async; each is normalized to a fixed length, seated on the ground
  // and centered on its stall. A box fallback keeps a stall from going empty
  // if a model ever fails to fetch.
  const carGroup = new THREE.Group();
  group.add(carGroup);
  // One car centered per stall, positions derived from PARKING_STALLS so the
  // row can never drift out of alignment with the painted stall lines.
  const carZ = PARKING_STALLS.rowFrontZ + PARKING_STALLS.depth / 2; // depth-center of the stall row
  const stallMid = (PARKING_STALLS.count - 1) / 2;
  const carOffsets = Array.from({ length: PARKING_STALLS.count }, (_, i) => (i - stallMid) * PARKING_STALLS.stallWidth);
  const carYaws = [0.03, -0.02, 0.015, -0.035, 0.01]; // barely-there parking-job imperfection
  const CAR_MODELS = ['models/car_sedan.glb', 'models/car_hatchback.glb', 'models/car_sports.glb'].map(assetUrl);
  const CAR_LEN = 9.0; // target bounding-box length (longer horizontal axis) in scene units
  const carLoader = new GLTFLoader();

  // Shared soft contact-shadow under each car: the sun shadow alone left the
  // cars floating (they had castShadow off), and at night the sun is off
  // entirely. A draped dark blob grounds them in both modes for ~zero cost.
  const carShadowTex = track(createSoftShadowTexture());
  const carShadowMat = track(new THREE.MeshBasicMaterial({
    map: carShadowTex, transparent: true, opacity: 0.55,
    depthWrite: false, fog: false,
  }));

  carOffsets.forEach((dx, i) => {
    const stall = new THREE.Group();
    stall.position.set(PARKING_STALLS.centerX + dx, 0, carZ);
    stall.rotation.y = carYaws[i % carYaws.length];
    carGroup.add(stall);

    const carShadow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, CAR_LEN * 1.02), carShadowMat);
    carShadow.rotation.x = -Math.PI / 2;
    carShadow.position.y = 0.01; // just proud of the asphalt plane
    stall.add(carShadow);

    const url = CAR_MODELS[i % CAR_MODELS.length];
    carLoader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        // Normalize scale: fit the longer horizontal axis to CAR_LEN, and rotate
        // so that length runs along Z (nose pointing toward/away from the store).
        let box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const longAxisIsX = size.x >= size.z;
        const currentLen = Math.max(size.x, size.z) || 1;
        model.scale.setScalar(CAR_LEN / currentLen);
        if (longAxisIsX) model.rotation.y = Math.PI / 2;
        // Re-measure post-transform to seat on the ground and center on the stall.
        box = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          // Shadows are prebaked/on-demand (shadowMap.autoUpdate=false), so a
          // static car casting a real sun shadow costs nothing per frame.
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const mat = mesh.material as THREE.Material | THREE.Material[];
          (Array.isArray(mat) ? mat : [mat]).forEach((m) => {
            track(m);
            // Cars arrive async, after StoreScene's dimEnvOutside traversal —
            // apply the same exterior env clamp here (the baked environment is
            // an interior capture whose display gain is per-mode; divide it
            // out so the cars get the same constant faint fill as the facade —
            // see StoreScene.applyExteriorEnvClamp, which also retargets these
            // on every later rebake).
            if (m instanceof THREE.MeshStandardMaterial) {
              m.envMapIntensity = 0.2 / Math.max(0.2, scene.environmentIntensity);
            }
          });
          if (mesh.geometry) track(mesh.geometry);
        });
        stall.add(model);
      },
      undefined,
      (err) => {
        console.warn('[exterior] car model failed to load, using box fallback:', url, err);
        const mat = track(new THREE.MeshStandardMaterial({
          color: CAR_COLORS[i % CAR_COLORS.length], roughness: 0.5, metalness: 0.3,
          envMapIntensity: 0.22, // async fallback — same exterior clamp as the GLB path
        }));
        const body = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.2, CAR_LEN), mat);
        body.position.y = 1.1;
        body.castShadow = true;
        body.receiveShadow = true;
        stall.add(body);
      },
    );
  });

  // ─── Storefront light spill: baked warm decal on the sidewalk at night ──
  const spillTex = track(createLightPoolTexture('#ffe6b0'));
  const spillMat = new THREE.MeshBasicMaterial({
    map: spillTex, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  });
  track(spillMat);
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(storeWidth + 4, sidewalkDepth * 1.6), spillMat);
  spill.rotation.x = -Math.PI / 2;
  // Proud of the sidewalk top (y=0.0), not below it: at y=-0.01 the opaque
  // sidewalk (nearer to the eye) won the depth test and occluded the spill, so
  // the warm night pool never rendered where it was meant to — on the walk by
  // the doors. +0.01 matches the car contact-shadow convention (additive +
  // depthWrite:false, so no z-fight with the walk it now sits on).
  spill.position.set(centerX, 0.01, frontZ + sidewalkDepth * 0.4);
  group.add(spill);

  // ─── Mode reactions (no per-frame work; called on day/night flips) ─────
  function setOutsideMode(mode: OutsideMode) {
    const night = mode === 'night';
    // Dusk: lot lamps come on before dark (photocells trip around sunset),
    // but their pools barely register against the remaining daylight.
    const dusk = mode === 'sunset';
    lampHeadMat.emissiveIntensity = night ? 3.2 : dusk ? 2.2 : 0.05;
    poolMat.opacity = night ? 0.5 : dusk ? 0.15 : 0.04;
    spillMat.opacity = night ? 0.55 : dusk ? 0.12 : 0.0;
  }
  setOutsideMode('day');

  function dispose() {
    disposables.forEach((d) => d.dispose());
    scene.remove(group);
  }

  return { group, setOutsideMode, dispose };
}
