import { buildEntranceBollards } from './entrance-bollards';
import { selfLit } from './material-lighting';
import { setPhotographicGround } from './photographic-ground';
// Nearby physical walks, parking markings, bollards and light spill.
// The shared photographic panorama supplies pavement and distant scenery.
import * as THREE from 'three';
import { createLightPoolTexture, createConcreteSidewalkTexture } from './canvas-textures';
import { activeStoreFormat } from './store-format';
import { installExteriorReturnKiosk } from './exterior-return-kiosk';
import { parkingLayout } from './parking-layout';
import { buildParkingLot } from './parking-lot';
import { buildExteriorRoad } from './exterior-road';
import { tryLoadUserAssetTexture } from './user-assets';
import type { OutsideMode } from './outdoor-lighting';
import { STORE_CENTER_X, FRONT_GLASS_Z } from './store-layout';

export interface ExteriorEnvironment {
  group: THREE.Group;
  walkFarZ: number;
  parking: ReturnType<typeof parkingLayout>;
  setOutsideMode(mode: OutsideMode): void;
  setGroundColor(color: THREE.Color): void;
  setPhotographicGround(enabled: boolean): void;
  dispose(): void;
}

export function buildExteriorEnvironment(scene: THREE.Scene, storeWidth: number, sidewalkDepth = 4.7, _highQuality = false, requestRender: () => void = () => {}, backWallZ = -35): ExteriorEnvironment {
  const group = new THREE.Group();
  group.name = 'exteriorEnvironment';
  scene.add(group);

  const plan = parkingLayout(storeWidth, sidewalkDepth, backWallZ, STORE_CENTER_X, FRONT_GLASS_Z);
  const centerX = plan.centerX;
  const leftEdgeX = centerX - storeWidth / 2;
  const rightEdgeX = centerX + storeWidth / 2;
  const frontZ = FRONT_GLASS_Z; // matches the storefront glass line in three-scene.ts

  let disposed = false;
  const disposables = new Set<{ dispose(): void }>();
  const track = <T extends { dispose(): void }>(x: T): T => {
    if (disposed) x.dispose();
    else disposables.add(x);
    return x;
  };

  // ─── Curb + sidewalk band ────────────────────────────────────────────────
  // Flush with the interior floor (no trip hazard at the threshold), running
  // the width of the storefront plus the corner piers, from the glass line
  // out to just past the entrance tower's projection (storefront-facade.ts).
  // One texture tile = one ~4.5 ft slab, so the baked expansion joints repeat
  // at the real sidewalk rhythm (was a single flat color — front and center
  // in the view out the doors).
  const sidewalkTex = track(createConcreteSidewalkTexture());
  sidewalkTex.repeat.set((storeWidth + 8) / 4.5, 1);
  const sidewalkMat = track(new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.9, metalness: 0.0 }));
  // Optional real photo-scanned concrete (ambientCG Concrete048, CC0) from the
  // git-ignored user-assets tree. Loads asynchronously (lands in
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

  const parking = track(buildParkingLot(group, plan, sidewalkMat));

  // ─── Bollards flanking the entrance ─────────────────────────────────────
  track(buildEntranceBollards(scene, group, [leftEdgeX - 1.4, rightEdgeX + 1.4], frontZ + 1.6, requestRender));

  // ─── Exterior return kiosk: original prop retained as loading fallback ──
  if (activeStoreFormat().facadeStyle !== 'storefront') {
  const boxMat = track(new THREE.MeshStandardMaterial({ color: '#8a1f1f', roughness: 0.55, metalness: 0.1 }));
  const boxSlotMat = track(new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.8 }));
  const newsBox = new THREE.Mesh(track(new THREE.BoxGeometry(1.3, 3.2, 1.3)), boxMat);
  newsBox.position.set(rightEdgeX + 2.6, 1.6, frontZ + 1.3);
  newsBox.castShadow = true;
  newsBox.receiveShadow = true;
  group.add(newsBox);
  const slot = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.15, 0.05)), boxSlotMat);
  slot.position.set(rightEdgeX + 2.6, 2.5, frontZ + 1.3 + 0.66);
  group.add(slot);
  track(installExteriorReturnKiosk(scene, group, [newsBox, slot], rightEdgeX + 2.6, frontZ + 1.3, requestRender));

  }

  // ─── Storefront light spill: baked warm decal on the sidewalk at night ──
  const spillTex = track(createLightPoolTexture('#ffe6b0'));
  const spillMat = selfLit(new THREE.MeshBasicMaterial({
    map: spillTex, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }), 'light-spill');
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

  const road = track(buildExteriorRoad(group, {centerX,minX:plan.minX,maxX:plan.maxX,
    frontZ:plan.rearZ,farZ:plan.streetZ,customEdges:true,initialGroundColor:new THREE.Color('#80766b')}));
  function setGroundColor(color: THREE.Color) { parking.setGroundColor(color); road.setGroundColor(color); }

  // ─── Mode reactions (no per-frame work; called on day/night flips) ─────
  function setOutsideMode(mode: OutsideMode) {
    const night = mode === 'night';
    // Dusk: lot lamps come on before dark (photocells trip around sunset),
    // but their pools barely register against the remaining daylight.
    const dusk = mode === 'sunset';
    spillMat.opacity = night ? 0.55 : dusk ? 0.12 : 0.0;
  }
  setOutsideMode('day');

  function dispose() {
    if (disposed) return;
    disposed = true;
    disposables.forEach((d) => d.dispose());
    disposables.clear();
    scene.remove(group);
  }

  return { group, parking: plan, walkFarZ: plan.farZ - 1.5, setOutsideMode, setGroundColor, setPhotographicGround: enabled => setPhotographicGround(group, enabled), dispose };
}
