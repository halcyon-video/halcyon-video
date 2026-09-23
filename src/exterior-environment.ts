import { makeSpotlightDiffuseOnly } from './diffuse-spotlight';
import { buildEntranceBollards } from './entrance-bollards';
import { selfLit } from './material-lighting';
// T15 exterior/environment pass: everything beyond the storefront glass that
// exists purely to be *seen* through it — sidewalk/curb, street furniture,
// street lamps with shadowed window spill and decorative light pools, a handful of parked cars, and a
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
import { installParkingLampModels } from './parking-lamp-model';
import { installCommercialStreetscape } from './commercial-streetscape';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createLightPoolTexture, createSoftShadowTexture, createConcreteSidewalkTexture } from './canvas-textures';
import { activeStoreFormat } from './store-format';
import { installExteriorReturnKiosk } from './exterior-return-kiosk';
import { parkingLayout } from './parking-layout';
import { buildParkingLot } from './parking-lot';
import { buildExteriorRoad } from './exterior-road';
import { tryLoadUserAssetTexture } from './user-assets';
import { assetUrl } from './asset-url';
import type { OutsideMode } from './outdoor-lighting';
import { STORE_CENTER_X, FRONT_GLASS_Z } from './store-layout';

export interface ExteriorEnvironment {
  group: THREE.Group;
  setOutsideMode(mode: OutsideMode): void;
  // GH #144: retarget the ground-blend ring's color to the active pano's
  // sampled ground (see ground-blend.ts) — called live as panos load/change.
  setGroundColor(color: THREE.Color): void;
  refreshShadows(): void;
  dispose(): void;
}

const CAR_COLORS = ['#0d0d0f', '#1a2338', '#2b1414', '#33342c', '#15181a', '#3a3a3e'];

export function buildExteriorEnvironment(scene: THREE.Scene, storeWidth: number, sidewalkDepth = 4.7, highQuality = false, requestRender: () => void = () => {}, backWallZ = -35): ExteriorEnvironment {
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

  track(buildParkingLot(group, plan, sidewalkMat));

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

  // Street lamps combine shadowed window spill with a decorative asphalt pool.
  const poleMat = track(new THREE.MeshStandardMaterial({ color: '#3a3d40', roughness: 0.6, metalness: 0.5 }));
  const lampHeadMat = track(selfLit(new THREE.MeshStandardMaterial({
    color: '#fff3d6', emissive: new THREE.Color('#ffdca0'), emissiveIntensity: 0.05, roughness: 0.4,
  }), 'light-source'));
  const poolTex = track(createLightPoolTexture('#ffdca0'));
  const poolMat = track(selfLit(new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }), 'light-spill'));

  // Lamp bases stand in the verge, clear of cars and the through aisle.
  const lampPositions: [number, number][] = [
    [centerX - 13.5, plan.farZ + 1.5],
    [centerX + 13.5, plan.farZ + 1.5],
  ];
  // Every head/pool shares one material each, so flipping lampHeadMat/poolMat
  // in setOutsideMode() below updates all of them at once — no per-instance
  // bookkeeping needed.
  const windowLights: THREE.SpotLight[] = [];
  const lampAnchors = lampPositions.map(([lx, lz], i) => {
    const root = new THREE.Group();
    root.name = `parking-lamp-${i}`;
    root.position.set(lx, 0, lz);
    group.add(root);
    const fallback = new THREE.Group();
    fallback.name = 'parking-lamp-fallback';
    root.add(fallback);
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.11, 13, 8)), poleMat);
    pole.position.y = 6.5;
    pole.castShadow = true; // prebaked shadow map — a static pole is free
    pole.receiveShadow = true;
    fallback.add(pole);

    const head = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.4, 0.7)), lampHeadMat);
    head.position.y = 13.1;
    fallback.add(head);

    const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(18, 18)), poolMat);
    pool.name = `parking-lamp-pool-${i}`;
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(lx, -0.02, lz);
    group.add(pool);
    // Sodium spill enters through glazing; static shadows keep it off solid walls.
    const light = new THREE.SpotLight('#ffb454', 0, 0, Math.PI / 3, .6, 2);
    light.name = 'parking-window-source';
    makeSpotlightDiffuseOnly(light);
    light.position.set(lx, 13.1, lz);
    light.target.position.set(lx, 0, frontZ - 6);
    light.castShadow = true;
    light.shadow.mapSize.set(highQuality ? 1024 : 512, highQuality ? 1024 : 512);
    light.shadow.camera.near = .5; light.shadow.camera.far = 120;
    light.shadow.normalBias = .03; light.shadow.bias = -.0002;
    light.shadow.autoUpdate = false; light.shadow.needsUpdate = true;
    group.add(light, light.target);
    windowLights.push(light);
    track(light.shadow);
    return { root, fallback };
  });
  track(installParkingLampModels(scene, lampAnchors, assetUrl('models/parking-lamp.glb'),
    poleMat, lampHeadMat, requestRender));

  // ─── Parked cars: real low-poly GLB models in a row of stalls ──────────
  // Original editable hatchback plus CC0 sedan/sports cars from Poly Pizza
  // (see public/models/ATTRIBUTION.md), cycled across the stalls for variety.
  // Loaded async; each is normalized to a fixed length, seated on the ground
  // and centered on its stall. A box fallback keeps a stall from going empty
  // if a model ever fails to fetch.
  const carGroup = new THREE.Group();
  carGroup.name = 'parked-cars';
  group.add(carGroup);
  // Keep five vehicles, distributed across actual front and side spaces.
  const farSpaces = plan.spaces.filter(s => s.z > plan.farRowZ);
  const sideSpaces = plan.spaces.filter(s => s.z < frontZ);
  const carSpaces = [farSpaces[1], farSpaces[farSpaces.length - 2],
    plan.spaces[0], sideSpaces[0], sideSpaces[3]].filter(Boolean);
  const carYaws = [0.03, -0.02, 0.015, -0.035, 0.01]; // barely-there parking-job imperfection
  // World units are feet, like the 9-by-18-foot bays. Keep the compact
  // hatchback shorter than the sedan, with each model's proportions intact.
  const CAR_MODELS = [
    { url: assetUrl('models/car_sedan.glb'), length: 16 },
    { url: assetUrl('models/car_hatchback.glb'), length: 14 },
    { url: assetUrl('models/car_sports.glb'), length: 15.5 },
  ];
  const carLoader = new GLTFLoader();

  // Shared soft contact-shadow under each car: the sun shadow alone left the
  // cars floating (they had castShadow off), and at night the sun is off
  // entirely. A draped dark blob grounds them in both modes for ~zero cost.
  const carShadowTex = track(createSoftShadowTexture());
  const carShadowMat = track(selfLit(new THREE.MeshBasicMaterial({
    map: carShadowTex, transparent: true, opacity: 0.55,
    depthWrite: false, fog: false,
  }), 'shadow'));

  carSpaces.forEach((space, i) => {
    const { url, length: carLength } = CAR_MODELS[i % CAR_MODELS.length];
    const stall = new THREE.Group();
    stall.name = `parked-car-${i}`;
    stall.position.set(space.x, -.09, space.z);
    stall.rotation.y = space.yaw + carYaws[i % carYaws.length];
    carGroup.add(stall);

    const carShadow = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), carShadowMat);
    carShadow.scale.set(carLength * .43 + .6, carLength + .4, 1);
    carShadow.rotation.x = -Math.PI / 2;
    carShadow.position.y = 0.01; // just proud of the asphalt plane
    stall.add(carShadow);

    carLoader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        // Normalize scale: fit the longer horizontal axis to its target length, and rotate
        // so that length runs along Z (nose pointing toward/away from the store).
        let box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const longAxisIsX = size.x >= size.z;
        const currentLen = Math.max(size.x, size.z) || 1;
        model.scale.setScalar(carLength / currentLen);
        if (longAxisIsX) model.rotation.y = Math.PI / 2;
        // Re-measure post-transform to seat on the ground and center on the stall.
        box = new THREE.Box3().setFromObject(model);
        box.getSize(size);
        carShadow.scale.set(size.x + .6, size.z + .4, 1);
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
            // GLTF textures belong to this load, including the legacy car atlas.
            Object.values(m).forEach((value) => {
              if (value instanceof THREE.Texture) track(value);
            });
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
        if (disposed) return; // late loads release resources without adoption
        stall.add(model);
        requestRender();
      },
      undefined,
      (err) => {
        if (disposed) return;
        console.warn('[exterior] car model failed to load, using box fallback:', url, err);
        const mat = track(new THREE.MeshStandardMaterial({
          color: CAR_COLORS[i % CAR_COLORS.length], roughness: 0.5, metalness: 0.3,
          envMapIntensity: 0.22, // async fallback — same exterior clamp as the GLB path
        }));
        const body = new THREE.Mesh(track(new THREE.BoxGeometry(carLength * .43, carLength * .3, carLength)), mat);
        body.position.y = carLength * .15;
        body.castShadow = true;
        body.receiveShadow = true;
        stall.add(body);
        requestRender();
      },
    );
  });

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

  // The street follows the public sidewalk; the lot module supplies its
  // shaped curbs and keeps the right-hand driveway unbroken.
  const exteriorRoad = track(buildExteriorRoad(group, {
    centerX, minX: plan.minX, maxX: plan.maxX, frontZ: plan.rearZ,
    farZ: plan.streetZ, customEdges: true,
    initialGroundColor: new THREE.Color(0x3a3a3a),
  }));

  function setGroundColor(color: THREE.Color) {
    exteriorRoad.setGroundColor(color);
  }

  const commercial = highQuality ? track(installCommercialStreetscape(group, centerX, backWallZ, requestRender, plan.streetZ + 28)) : null;

  // ─── Mode reactions (no per-frame work; called on day/night flips) ─────
  function setOutsideMode(mode: OutsideMode) {
    commercial?.setOutsideMode(mode);
    const night = mode === 'night';
    // Dusk: lot lamps come on before dark (photocells trip around sunset),
    // but their pools barely register against the remaining daylight.
    const dusk = mode === 'sunset';
    for (const light of windowLights) {
      light.intensity = night ? 2600 : 0;
      light.visible = light.intensity > 0;
      light.shadow.needsUpdate = true;
    }
    // Subpixel lenses must not cross the bloom threshold as coverage changes.
    // Actual sodium illumination comes from the unchanged window spotlights.
    lampHeadMat.emissiveIntensity = night ? 1.2 : dusk ? 1.0 : 0.05;
    lampHeadMat.userData.bakeEmissiveIntensity = night ? 3.2 : dusk ? 2.2 : .05;
    poolMat.opacity = night ? 0.5 : dusk ? 0.15 : 0.04;
    spillMat.opacity = night ? 0.55 : dusk ? 0.12 : 0.0;
  }
  setOutsideMode('day');

  function refreshShadows() {
    for (const light of windowLights) light.shadow.needsUpdate = true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    disposables.forEach((d) => d.dispose());
    disposables.clear();
    scene.remove(group);
  }

  return { group, setOutsideMode, setGroundColor, refreshShadows, dispose };
}
