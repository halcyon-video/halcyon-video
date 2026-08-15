// Store shell builder — the room and its exterior, extracted from StoreScene
// (three-scene.ts keeps one-line delegating stubs): sky dome + facade + parking
// lot + storefront logo (buildStore), storefront glazing sections
// (createWindowSection), drop ceiling with troffers/vents/sprinklers, the
// chrome ceiling cornice (buildCeilingFrame), marquee bulb chase
// (buildMarqueeBulbs/setMarqueeAnimMode/updateMarqueeBulbs), wall decor, and
// the layout-validator hookup. Every function takes the StoreScene as its
// first parameter and reads/writes scene state exactly as the original
// methods did — behaviour-preserving move, not a redesign.
import * as THREE from 'three';
import { Movie } from './jellyfin';
import { assetUrl } from './asset-url';
import { posterQueue, loadDecorPosterTexture } from './video-case';
import { bakeFloorAO, makeWallContactAO } from './lightmap-bake';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { liveMirrorsAllowed, reflectorTargetSize } from './store-mirrors';
import { SlottedFixture } from './fixtures';
import { AmbientTvs } from './ambient-tvs';
import { EntranceCheckout } from './entrance';
import { buildWindowBays } from './entrance/windows';
import { addGlassReflectionPane } from './glass-reflection';
import { buildExteriorEnvironment, PARKING_STALLS } from './exterior-environment';
import { NR_WALL_SHELF_DEPTH, NR_WALL_CLEARANCE, NR_LEFT_UNIT_STANDOFF, WALL_SHELF_HEIGHTS, BOX_SPACING, SECTION_COLS, seededRandom01, getStorefrontSpec, vestibuleHalfWidth, posterBayIndices, entranceOpeningHalfWidth, mapWallSegmentUV, STORE_CENTER_X, FRONT_GLASS_Z } from './store-layout';
import { buildFrontSoffit, frontSoffitLidPolygon, frontSoffitPolygon, frontSoffitY, pointInSoffit, soffitConnectHalf, soffitMirroredEdges, soffitTrofferCenters, tileOverlapsSoffit } from './ceiling-soffit';
import { createFixture } from './fixture-registry';
import { CandyDisplay } from './fixtures/period-fixtures';
import { TipJar } from './fixtures/tip-jar';
import { DEFAULT_FIXTURE_PLACEMENTS, gameSectionPlacements, counterAnchoredPlacements, promoStandPlacements } from './store-fixtures-config';
import { validateLayout, Footprint } from './layout-validator';
import { buildAisleShelving } from './shelving';
import { buildCounterProps93 } from './fixtures/counter-props-93';
import { buildStorefrontDressing93 } from './fixtures/storefront-dressing-93';
import { buildStorefrontCampaignPoster, campaignBannerSpan } from './fixtures/storefront-campaign-poster';
import { buildSecurityCamera93 } from './fixtures/security-camera-93';
import { isEndcapKind } from './fixtures/genre-endcap';
import { collectionEndcapPlacements } from './fixtures/collection-endcap';
import { buildMembershipOvalHanger } from './fixtures/membership-oval-hanger';
import { buildJoinTodayRewardsRisers } from './fixtures/join-today-rewards-riser';
import { buildSummerSequelsShelfStrips } from './fixtures/summer-sequels-shelf-strip';
import { buildGameRentals2For10Signs } from './fixtures/game-rentals-2for10-signs';
import { buildPreownedPreorderGamesSigns } from './fixtures/preowned-preorder-games-signs';
import { buildNewReleaseToppers, type NrTopperRun } from './fixtures/new-release-toppers';
import { StoreClerk, ClerkDest } from './clerk';
import { ClerkNavGrid, NavRect } from './clerk-nav';
import { neutralizeScanTexture, createBrandLogoBodyTexture, createBrandLogoTextTexture, createNewReleasesSignTexture, createPromoSignTexture, createCeilingTileTexture, createCarpetTextures, createWallTextures, createBrickTexture, createStorefrontLogoYellowTexture, createAsphaltTexture, createParkingStainsTexture, createShelfTextures, createShelfBayShadeTexture, createWireMeshTexture, useCheapMaterials, createGlassSurfaceNormalMap, createAcousticPanelTexture, createTrofferLensTexture, createHvacVentTexture } from './canvas-textures';
import { getActiveTheme, themeTrimDarkHex, themeKneeGoldHex, WALL_PAINT_OPTIONS } from './themes';
import { getSetting } from './settings';
import { tryLoadUserAssetTexture, loadUserAssetSurface } from './user-assets';
import { buildStorefrontFacade, WINDOW_HEAD_Y, SIDE_RIBBON_PANE_W } from './storefront-facade';
import { buildStorefrontLogo3D } from './logo-storefront';
import { create3DDoubleLayeredSign, markSignMesh, auditSignMeshes } from './sign-builders';
import { retailAudio } from './audio';
import { buildSignage, SignSlot } from './fixtures/signage';
import { buildWallStripe1990 } from './wall-stripe-1990';
import { isJellyseerrAvailable } from './jellyseerr';
import type { StoreScene } from './three-scene';

// Chrome+mirror ceiling cornice intrusion (see buildCeilingFrame): standoff
// from every wall, and the horizontal depth of the band. The ceiling tile
// grid and marquee both keep clear of this envelope.
export const CORNICE_WALL_GAP = 2.0;
// 2.9 → 1.8 (feedback/044): the underside ledge read far too deep — a ~35 in
// soffit bottom — and pushed the mirror band ~5 ft off the wall. 1.8 ft is a
// believable retail cornice depth and moves the mirror in toward the wall.
export const CORNICE_BAND = 1.8;
// How far the chrome+mirror cornice body hangs below the true ceiling. The
// mirror cornice occupies the whole ring between wallTop and ceilY - CORNICE_DROP
// is the actual VISIBLE "ceiling line" as experienced from inside the store —
// anything painted on a wall above this is hidden behind the cornice from
// every normal viewing angle (wall-stripe-1990.ts positions off this).
export const CORNICE_DROP = 2.7;

export function createWindowSection(
scene: StoreScene,
  width: number,
  height: number,
  numCols: number,
  waistY: number = 3.3,
  kneeGap?: { center: number; halfWidth: number },
  frameColor: string = '#222222',
): THREE.Group {
  const group = new THREE.Group();

  const KNEE_H = 2.0; // knee-wall height (ft)

  // Glass pane — starts at the knee wall, not the floor
  const glassGeo = new THREE.PlaneGeometry(width, height - KNEE_H);
  // Physical (non-metal) glass: fresnel-driven reflectivity, so at grazing
  // angles the panes mirror the lit interior — the "lit store at dusk" look —
  // instead of the old metalness-faked uniform sheen (plan item D3).
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xddf0ff,
    transparent: true,
    // 0.12 -> 0.06: at 0.12 the panes laid a uniform gray veil over the whole
    // exterior — real float glass barely tints head-on; its presence should
    // come from the fresnel reflections, not a fog of opacity.
    opacity: 0.06,
    roughness: 0.05,
    metalness: 0.0,
    envMapIntensity: 1.2,
    // Faint "living glass" surface: a very low-amplitude clearcoat normal so
    // reflected highlights ripple subtly like real float glass, without
    // frosting or blurring the transmitted image (the glass analog of the
    // shrink-wrap wrinkle trick). Shared by all three glass materials.
    // Dropped on quality low (see setCheapMaterials): a second specular
    // lobe on DoubleSide transparent panes this large is real per-fragment
    // cost, and the ripple is invisible at that tier's resolution.
    ...(useCheapMaterials() ? {} : {
      clearcoat: 0.4,
      clearcoatRoughness: 0.05,
      clearcoatNormalMap: createGlassSurfaceNormalMap(),
      clearcoatNormalScale: new THREE.Vector2(0.1, 0.1),
    }),
    side: THREE.DoubleSide
  });
  // Keep the pane's effective reflection strength constant across day/night
  // display gains (1.2 x the day gain 1.3) — see applyExteriorEnvClamp.
  glassMat.userData.envGainTarget = 1.56;
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, KNEE_H + (height - KNEE_H) / 2, 0);
  glass.receiveShadow = true;
  group.add(glass);
  // The fresnel mirror this pane's own comment above promises ("at grazing
  // angles the panes mirror the lit interior") never actually reached the
  // screen: three multiplies the env reflection by diffuseColor.a, so the 0.06
  // opacity that keeps the glass from veiling the exterior was also cutting
  // the reflection to 6%. Restored on a separate additive pane, which leaves
  // what the glass transmits untouched (glass-reflection.ts).
  addGlassReflectionPane(glass, group);

  // Metal frame material
  const frameMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(frameColor), // sleek charcoal black by default; gray per StorefrontSpec.frameColor
    roughness: 0.5,
    metalness: 0.8
  });

  const frameThickness = 0.2;
  const frameDepth = 0.3;

  // Solid knee wall segments (skipping the door gap if any). These share the
  // room's drywall material — same paint, same mottle/orange-peel relief,
  // same contact AO — so the band under the glazing and the wall segments it
  // butts at either end read as ONE surface. It used to be flat untextured
  // amber-gold, which left a visible change of surface along the side walls
  // between the glazing and the front corner. The satin-roughness note that
  // lived here (a textureless box needs env sheen to react to light at all)
  // no longer applies: the wall material brings its own roughness map.
  const kneeMat = scene.wallSurface?.material
    ?? new THREE.MeshStandardMaterial({ color: new THREE.Color(themeKneeGoldHex()), roughness: 0.66, metalness: 0.0 });
  const kneeTrimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(themeTrimDarkHex()), roughness: 0.55, metalness: 0.05 });
  const kneeSegments: [number, number][] = [];
  if (kneeGap) {
    const a = kneeGap.center - kneeGap.halfWidth;
    const b = kneeGap.center + kneeGap.halfWidth;
    if (a - (-width / 2) > 0.05) kneeSegments.push([-width / 2, a]);
    if (width / 2 - b > 0.05) kneeSegments.push([b, width / 2]);
  } else {
    kneeSegments.push([-width / 2, width / 2]);
  }
  kneeSegments.forEach(([a, b]) => {
    const segW = b - a;
    const cxSeg = (a + b) / 2;
    const kneeGeo = new THREE.BoxGeometry(segW, KNEE_H, 0.3);
    // Sits on the floor, so vBottom 0 — the piece samples the wall texture's
    // bottom rows, exactly like the full-height wall beside it.
    if (scene.wallSurface) {
      mapWallSegmentUV(kneeGeo, segW, KNEE_H, 0, scene.wallSurface.storeWidth, scene.wallSurface.roomHeight);
    }
    const wall = new THREE.Mesh(kneeGeo, kneeMat);
    wall.position.set(cxSeg, KNEE_H / 2, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    // Navy sill cap on top of the knee wall
    const cap = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.12, 0.4), kneeTrimMat);
    cap.position.set(cxSeg, KNEE_H + 0.06, 0);
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);
    // Navy base kick — #134: matches baseboardMat's 0.2ft height exactly
    // (below, in the room-shell baseboards) so this window wall's trim
    // lines up with the solid walls' at every corner instead of stepping.
    const kick = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.2, 0.34), kneeTrimMat);
    kick.position.set(cxSeg, 0.1, 0);
    kick.receiveShadow = true;
    group.add(kick);
  });

  // Outer border frames
  // Bottom horizontal frame — the glazing sill sits on the knee wall
  const bottomFrameGeo = new THREE.BoxGeometry(width, frameThickness, frameDepth);
  const bottomFrame = new THREE.Mesh(bottomFrameGeo, frameMat);
  bottomFrame.position.set(0, KNEE_H + frameThickness / 2, 0);
  bottomFrame.castShadow = true;
  bottomFrame.receiveShadow = true;
  group.add(bottomFrame);

  // Top horizontal frame
  const topFrame = new THREE.Mesh(bottomFrameGeo, frameMat);
  topFrame.position.set(0, height - frameThickness / 2, 0);
  topFrame.castShadow = true;
  topFrame.receiveShadow = true;
  group.add(topFrame);

  // Left/right vertical end frames — like the dividers, they stop at the
  // sill. They used to run the full height to the floor, which buried a
  // charcoal strip down the face of the knee wall at every section end
  // (feedback/041's "strange black bars extending to the floor").
  const verticalFrameGeo = new THREE.BoxGeometry(frameThickness, height - KNEE_H, frameDepth);
  const leftFrame = new THREE.Mesh(verticalFrameGeo, frameMat);
  leftFrame.position.set(-width / 2 + frameThickness / 2, KNEE_H + (height - KNEE_H) / 2, 0);
  leftFrame.castShadow = true;
  leftFrame.receiveShadow = true;
  group.add(leftFrame);

  const rightFrame = new THREE.Mesh(verticalFrameGeo, frameMat);
  rightFrame.position.set(width / 2 - frameThickness / 2, KNEE_H + (height - KNEE_H) / 2, 0);
  rightFrame.castShadow = true;
  rightFrame.receiveShadow = true;
  group.add(rightFrame);

  // Grid vertical dividers — only through the glazed span above the knee wall
  const dividerGeo = new THREE.BoxGeometry(frameThickness, height - KNEE_H, frameDepth);
  for (let c = 1; c < numCols; c++) {
    const dividerX = -width / 2 + (width / numCols) * c;
    const divider = new THREE.Mesh(dividerGeo, frameMat);
    divider.position.set(dividerX, KNEE_H + (height - KNEE_H) / 2, 0);
    divider.castShadow = true;
    divider.receiveShadow = true;
    group.add(divider);
  }

  // Single waist-height horizontal frame member: large top pane, short bottom
  // pane. waistY <= 0 skips it — the side-window ribbons are single tall
  // sheets on the reference building, no mid-rail.
  if (waistY > 0) {
    const waistThickness = frameThickness * 1.6; // chunkier waist rail
    const horizDividerGeo = new THREE.BoxGeometry(width, waistThickness, frameDepth + 0.05);
    const waistDivider = new THREE.Mesh(horizDividerGeo, frameMat);
    waistDivider.position.set(0, waistY, 0);
    waistDivider.castShadow = true;
    waistDivider.receiveShadow = true;
    group.add(waistDivider);
  }

  return group;
}

export function buildStore(scene: StoreScene) {
  const storeWidth = scene.getStoreWidth();
  // T05 storefront options (doors/windows/counter) — computed once storeWidth
  // is known (window bay widths are sized in feet) and read by both the
  // storefront window build below and the EntranceCheckout fixture (via
  // fixtureContext()).
  scene.storefrontSpec = getStorefrontSpec(storeWidth);
  // Add sky dome sphere.
  //
  // The radius is DERIVED, not fixed, because the dome has to enclose the whole
  // built store however deep the library makes it. The dome is an ordinary
  // opaque, depth-tested mesh, so anywhere it intrudes into the room it simply
  // draws OVER the wall behind it and the store reads as open to the sky —
  // pale blue by day, black at night.
  //
  // A fixed 200 ft dome centred SKY_CENTER_Z toward the street reaches only
  // z = -80 on the centreline, and — being a sphere — far less off-axis. A
  // games-only store (the whole Romm library as aisles) is ~96 ft deep with its
  // back wall at z ≈ -81.6, so the dome landed ~12 ft IN FRONT of that wall at
  // the store's x edge and sliced the back of the shop open in an arc.
  //
  // The binding corner is the ROOF SLAB, the outermost geometry at the back: it
  // overhangs the room by ROOF_OVERHANG on every side (see roofGeo below) and
  // sits 0.85 ft above ceilingY. Note the dome centre is x = 0 while the store
  // centres on x = 11, so the +x corner is the far one. Everything beyond the
  // glass (lot, sidewalk, dressing) sits far nearer the dome centre than that
  // corner, so it never binds.
  //
  // The old fixed 200 was not arbitrary — it is almost exactly the corner
  // distance for a ~3000-title movie store (measured: 200.00), i.e. the dome was
  // sized to GRAZE that corner. Grazing is not actually safe: the dome is
  // tessellated, and a sphere's flat faces are chords that dip
  // R·(1−cos(π/segments)) INSIDE the true sphere between vertices (~1 ft at
  // these radii). So clear the corner by the chord sag (twice, since the corner
  // can fall mid-facet in both angular axes) plus a small constant, rather than
  // by a magic number.
  //
  // Consequence worth knowing: this does NOT leave the baseline store
  // pixel-identical. A 3000-title movie store goes 200 -> 203.9 because its
  // corner was already at the old radius. Verified visually indistinguishable
  // (building, lot and framing unchanged); note you cannot prove that by pixel
  // diffing, as the harness is not deterministic run-to-run — two identical runs
  // differ across ~92% of pixels.
  const SKY_CENTER_Z = 120.0;
  const SKY_MIN_RADIUS = 200.0;   // floor: never shrink the dome below its historical size
  const SKY_SEGMENTS = 32;
  const ROOF_OVERHANG = 2.0;      // must track roofGeo's storeWidth/floorCeilLen padding
  const skyCornerDist = Math.hypot(
    STORE_CENTER_X + (storeWidth + 2 * ROOF_OVERHANG) / 2,
    scene.ceilingY + 0.85,
    SKY_CENTER_Z - (scene.backWallZ - ROOF_OVERHANG),
  );
  const skyChordSag = skyCornerDist * (1 - Math.cos(Math.PI / SKY_SEGMENTS));
  const skyRadius = Math.max(SKY_MIN_RADIUS, skyCornerDist + 2 * skyChordSag + 2.0);
  const skyGeo = new THREE.SphereGeometry(skyRadius, SKY_SEGMENTS, SKY_SEGMENTS);
  // toneMapped: false — the panos are display-referred JPGs (already "tone mapped"
  // by the camera that shot them); running them through AgX a second time is what
  // made the sky read washed-out gray. Render them as authored.
  const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, toneMapped: false });
  const sky = new THREE.Mesh(skyGeo, skyMat);

  // Shift the center of the skybox sphere towards the front of the store/street (+Z)
  sky.position.set(0, 0, SKY_CENTER_Z);
  scene.scene.add(sky);
  scene.outdoor.skyMesh = sky;
  // Base rotation (street side at the storefront) + this visit's sun azimuth.
  scene.outdoor.applySunPlacement();
  
  // Load default skybox (which updates lights, fog, and texture asynchronously)
  scene.outdoor.updateSkybox();

  const theme = getActiveTheme();
  scene.activeTheme = theme;

  const BRICK_FEET = 4.0; // real-world size (ft) of one brick-texture tile
  const brickSrc = createBrickTexture();
  // Every material the factory produces is tracked so the optional real
  // photo-scan swap below can re-map all of them once the async load lands.
  const brickMats: THREE.MeshStandardMaterial[] = [];
  const brickMaterial = (repX: number, repY: number): THREE.MeshStandardMaterial => {
    const map = brickSrc.map.clone();
    const normalMap = brickSrc.normalMap.clone();
    const roughnessMap = brickSrc.roughnessMap.clone();
    [map, normalMap, roughnessMap].forEach((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repX, repY);
      t.needsUpdate = true;
    });
    const mat = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, roughness: 1.0, metalness: 0.0 });
    brickMats.push(mat);
    return mat;
  };

  // The baked scene.environment is an INTERIOR capture (mid-store, troffers
  // and all) and at night its display gain rises to 2.6 — every exterior
  // surface it touches was rendering noon-bright brick under a starry sky.
  // Exterior dressing takes only a whisper of it (real night facades are lit
  // by sign glow, window spill and the lamp pools, all of which are separate
  // meshes/decals). Day loses almost nothing: the sun dominates out there.
  const dimEnvOutside = (root: THREE.Object3D) => {
    scene.exteriorEnvRoots.push(root);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) m.envMapIntensity = 0.22;
      }
    });
  };

  const KNEE_EXT_H = 2.0; // matches createWindowSection's knee-wall height
  const extVestibuleGapHalf = vestibuleHalfWidth(scene.storefrontSpec); // matches the front window's kneeGap
  const kneeVeneerThick = 0.1;
  const kneeVeneerZ = FRONT_GLASS_Z + 0.15 + 0.02 + kneeVeneerThick / 2; // clear of the interior knee wall/frame (z=15±0.15)

  const frontKneeSegs: [number, number][] =
    storeWidth / 2 - extVestibuleGapHalf > 0.05
      ? [[-storeWidth / 2, -extVestibuleGapHalf], [extVestibuleGapHalf, storeWidth / 2]]
      : [[-storeWidth / 2, storeWidth / 2]];
  frontKneeSegs.forEach(([a, b]) => {
    const segW = b - a;
    const veneer = new THREE.Mesh(
      new THREE.BoxGeometry(segW, KNEE_EXT_H, kneeVeneerThick),
      brickMaterial(segW / BRICK_FEET, KNEE_EXT_H / BRICK_FEET));
    veneer.position.set(STORE_CENTER_X + (a + b) / 2, KNEE_EXT_H / 2, kneeVeneerZ);
    veneer.castShadow = true;
    veneer.receiveShadow = true;
    dimEnvOutside(veneer);
    scene.scene.add(veneer);
  });

  // Photo-matched exterior facade: brick parapet
  // fascia with the blue glazed-tile stripe band, capped corner piers, and
  // the gabled entrance tower whose face carries the storefront logo below.
  // Replaces the old curved awning + valance and the roofline corner piers.
  // ACTUAL corner margin left solid by the whole-pane front glazing (>= the
  // FRONT_WINDOW_CORNER_MARGIN minimum — pane quantization widens it): the
  // exterior brick returns must fill exactly what the glass doesn't reach.
  const frontGlazedSpan =
    scene.storefrontSpec.windowBays.reduce((s, b) => s + b.width, 0) + 2 * extVestibuleGapHalf;
  const actualFrontCornerMargin = Math.max(0, (storeWidth - frontGlazedSpan) / 2);
  const facade = buildStorefrontFacade({
    storeWidth,
    backWallZ: scene.backWallZ,
    ceilingY: scene.ceilingY,
    entryHalfWidth: extVestibuleGapHalf,
    entryOpeningHalfWidth: entranceOpeningHalfWidth(scene.storefrontSpec),
    brickMaterial,
    stripeColor: theme.palette.primary,
    trimColor: theme.palette.secondary,
    sideRibbon: scene.sideRibbon,
    frontCornerMargin: actualFrontCornerMargin,
  });
  dimEnvOutside(facade.group);
  scene.scene.add(facade.group);

  // Optional real photo-scanned facade masonry from the git-ignored user-assets
  // tree: brick (ambientCG Bricks051, CC0). Every material brickMaterial() cloned is now in
  // brickMats; when the real map loads we re-clone it onto each, preserving that
  // material's per-mesh repeat/offset/anisotropy. A 404 leaves the procedural
  // masonry up.
  {
    const brickAssetDir = 'store-brick';
    const swapBrickSlot = (
      slot: 'map' | 'normalMap' | 'roughnessMap', file: string, srgb: boolean,
    ) => {
      tryLoadUserAssetTexture(`surfaces/${brickAssetDir}/${file}`, (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        for (const mat of brickMats) {
          const ref = mat.map; // the existing clone carries this mesh's repeat
          if (!ref) continue;
          const clone = tex.clone();
          clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
          clone.repeat.copy(ref.repeat);
          clone.offset.copy(ref.offset);
          clone.anisotropy = ref.anisotropy;
          clone.needsUpdate = true;
          mat[slot] = clone;
          mat.needsUpdate = true;
        }
        scene.requestRender();
      }, { srgb });
    };
    swapBrickSlot('map', 'color.png', true);
    swapBrickSlot('normalMap', 'normal.png', false);
    swapBrickSlot('roughnessMap', 'roughness.png', false);
  }

  // ─── Parking lot (issue #58): ONE row of stalls plus a single drive lane
  // in front of the store, instead of the old 500-ft asphalt prairie. The
  // large scrub-grass ground plane that used to run out past the sky-dome
  // radius has been removed by request — only the asphalt parking lot remains,
  // and the sky sphere now shows beyond the ~47 ft lot edge (intended: no
  // green lawn).

  // Stall width/depth/row-origin are NOT redeclared here — they're consumed
  // straight from PARKING_STALLS (exterior-environment.ts), the single
  // source of truth also used to place the parked cars, so the painted
  // lines below can never drift out of alignment with them.
  const FRONT_Z = FRONT_GLASS_Z; // matches the storefront glass line (frontZ in exterior-environment.ts)
  const STALL_W = PARKING_STALLS.stallWidth; // stall width (one texture tile across)
  const STALL_DEPTH = PARKING_STALLS.depth;  // single stall row at the far side of the lot
  const LOT_APRON = 5.0;     // sidewalk + curb strip along the glass line
  const LANE_DEPTH = PARKING_STALLS.rowFrontZ - FRONT_Z - LOT_APRON; // drive lane between the sidewalk and the stalls
  const LOT_D = LOT_APRON + LANE_DEPTH + STALL_DEPTH; // 47 ft beyond the glass
  // Odd multiple of STALL_W so stall boundaries land at x = centerX ± 4.5,
  // ±13.5, ±22.5 … — the same phase PARKING_STALLS uses for the car row.
  const LOT_W = storeWidth + 8 <= STALL_W * 7 ? STALL_W * 7 : STALL_W * 9;
  // One V-repeat spans the whole lot depth: stall side-lines only inside the
  // far stall band (canvas-bottom fractions), plain asphalt in the lane.
  const asphaltTex = createAsphaltTexture((LOT_APRON + LANE_DEPTH) / LOT_D, 0.97);
  asphaltTex.repeat.set(LOT_W / STALL_W, 1);
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95, metalness: 0.0 });
  const parkingLot = new THREE.Mesh(new THREE.PlaneGeometry(LOT_W, LOT_D), asphaltMat);
  parkingLot.position.set(PARKING_STALLS.centerX, -0.03, FRONT_Z + LOT_D / 2);
  parkingLot.rotation.x = -Math.PI / 2;
  parkingLot.receiveShadow = true;
  dimEnvOutside(parkingLot);
  scene.scene.add(parkingLot);

  // A handful of faded oil stains on a smaller overlay patch in the drive
  // lane right in front of the store, where the player will actually look.
  const stainsTex = createParkingStainsTexture();
  const stainsMat = new THREE.MeshStandardMaterial({
    map: stainsTex, transparent: true, roughness: 0.92, metalness: 0.0,
    polygonOffset: true, polygonOffsetFactor: -1,
  });
  const parkingStains = new THREE.Mesh(new THREE.PlaneGeometry(40, 22), stainsMat);
  parkingStains.position.set(PARKING_STALLS.centerX, -0.02, FRONT_Z + LOT_APRON + LANE_DEPTH / 2);
  parkingStains.rotation.x = -Math.PI / 2;
  dimEnvOutside(parkingStains);
  scene.scene.add(parkingStains);

  // ─── T15: exterior environment dressing (sidewalk, lamps, cars, strip-mall
  // backdrop) — everything beyond the glass that only needs to exist for the
  // view outward. Synced to the current day/night mode immediately.
  scene.exterior = buildExteriorEnvironment(scene.scene, storeWidth);
  scene.exterior.setOutsideMode(scene.outdoor.outsideMode);
  dimEnvOutside(scene.exterior.group);

  // Initialize 3D wall signage textures and materials
  scene.nrTextTex = createNewReleasesSignTexture();
  scene.nrLogoBodyTex = createBrandLogoBodyTexture();
  scene.nrLogoYellowTex = createBrandLogoTextTexture();
  scene.entranceLogoYellowTex = createStorefrontLogoYellowTexture();

  // ─── Self-illuminated 3D ticket logo on the entrance tower's gable face ───
  // Anchor comes from the facade builder: centered in the gable just above
  // the spring line, exactly where the reference building wears its emblem.
  if (scene.nrLogoBodyTex && scene.entranceLogoYellowTex) {
    // LogoSpec Phase B1: a spec asking for a truly-3D sign (extruded emblem
    // or channel letters) builds through logo-storefront.ts; null means the
    // default flat layered sign below, byte-for-byte the legacy path.
    scene.storefrontLogo3D = buildStorefrontLogo3D(facade.logoAnchor);
    if (scene.storefrontLogo3D) {
      scene.scene.add(scene.storefrontLogo3D.group);
    } else {
      const logoW = facade.logoAnchor.width;
      const logoH = facade.logoAnchor.height;
      const bodyDepth = 0.6;
      const yellowDepth = 0.12;

      // Custom materials for the massive storefront sign
      const entranceLogoBodyMaterials: THREE.MeshStandardMaterial[] = [];
      const numBodyLayers = 20;
      for (let i = 0; i < numBodyLayers; i++) {
        const isFront = (i === numBodyLayers - 1);
        let colorFactor = 0.45;
        if (isFront) {
          colorFactor = 1.0;
        } else {
          colorFactor = 0.3 + (0.25 * i) / (numBodyLayers - 2);
        }

        entranceLogoBodyMaterials.push(new THREE.MeshStandardMaterial({
          map: scene.nrLogoBodyTex,
          transparent: true,
          alphaTest: 0.35,
          roughness: 0.2,
          metalness: 0.2,
          color: new THREE.Color(colorFactor, colorFactor, colorFactor),
          // Subtle emissive blue so the ticket body has a dark self-glow at night
          emissive: isFront ? new THREE.Color(0x020825) : new THREE.Color(0x000000),
          emissiveIntensity: 1.0,
          side: THREE.FrontSide
        }));
      }

      const entranceLogoYellowMaterials: THREE.MeshStandardMaterial[] = [];
      const numYellowLayers = 6;
      for (let i = 0; i < numYellowLayers; i++) {
        const isFront = (i === numYellowLayers - 1);
        let colorFactor = 0.5;
        if (isFront) {
          colorFactor = 1.0;
        } else {
          colorFactor = 0.4 + (0.3 * i) / (numYellowLayers - 2);
        }

        entranceLogoYellowMaterials.push(new THREE.MeshStandardMaterial({
          map: scene.entranceLogoYellowTex,
          transparent: true,
          alphaTest: 0.35,
          roughness: 0.1, // very glossy
          metalness: 0.9, // highly metallic gold feel
          color: new THREE.Color(colorFactor, colorFactor, colorFactor),
          // Warm self-glow for gold details (text + border)
          emissive: new THREE.Color(0xffaa00).multiplyScalar(colorFactor),
          emissiveIntensity: 3.5, // strong glow for bloom
          side: THREE.FrontSide
        }));
      }

      // Build the 3D double-layered ticket logo
      const entranceLogo = create3DDoubleLayeredSign(
        entranceLogoBodyMaterials,
        entranceLogoYellowMaterials,
        logoW,
        logoH,
        bodyDepth,
        yellowDepth
      );

      // Mount the logo on the gable face (its layered planes step outward from
      // the anchor's z, so the back plane sits just proud of the brick).
      entranceLogo.position.set(facade.logoAnchor.x, facade.logoAnchor.y, facade.logoAnchor.z);
      scene.scene.add(entranceLogo);
    }

    // Add a PointLight directly in front of the glowing sign to illuminate the tower and building front
    const logoLightColor = new THREE.Color(theme.palette.secondary);
    const logoLight = new THREE.PointLight(logoLightColor, 15, 30); // Warm theme light
    logoLight.position.set(facade.logoAnchor.x, facade.logoAnchor.y, facade.logoAnchor.z + 3.5);
    logoLight.castShadow = true;
    logoLight.shadow.bias = -0.002;
    logoLight.shadow.mapSize.width = 1024;
    logoLight.shadow.mapSize.height = 1024;
    // On-demand only (issue #111): a PointLight's shadow is 6 cube-face passes, and
    // its 30ft radius reaches into the store, so leaving this on default autoUpdate
    // means every interior-motion rebake (case-pop settle, clerk walk, launch
    // flourish, end-cap lerp — all of which only need the SUN's map refreshed) pays
    // for this too. autoUpdate=false opts it out of those. The paired one-shot
    // needsUpdate=true bakes it once during the boot-time bake just below (~line 638)
    // so the cube depth texture still gets allocated before anything samples it — see
    // that bake's comment for why a shadow-casting light that never renders once
    // leaves the sampler bound to nothing. Stored on the rig so day/night reroll can
    // re-flag it if the exterior ever actually changes.
    logoLight.shadow.autoUpdate = false;
    logoLight.shadow.needsUpdate = true;
    scene.scene.add(logoLight);
    scene.outdoor.logoLight = logoLight;
  }



  scene.promoSignTex = createPromoSignTexture();
  // F8-006: the promo cling must read as a LIT retail sticker, not a glowing
  // decal. No emissive (there never was one); the fix is a matte, non-metal
  // finish (high roughness, zero metalness) over the muted texture albedo, so
  // the cling takes the shelf's dim light instead of self-broadcasting. The
  // red end-panels match the toned-down sticker red (was 0xcc0000).
  scene.promoSignMat = new THREE.MeshStandardMaterial({
    map: scene.promoSignTex,
    roughness: 0.85,
    metalness: 0.0
  });
  scene.promoSignRedMat = new THREE.MeshStandardMaterial({
    color: 0x8f1e1e,
    roughness: 0.85,
    metalness: 0.0
  });

  const backWallZ = scene.backWallZ;
  const floorY = 0.0;
  const ceilingY = scene.ceilingY;
  const roomHeight = ceilingY - floorY;
  const wallCenterY = (floorY + ceilingY) / 2;

  const sideWallLen = FRONT_GLASS_Z - backWallZ; // goes from Z = 15 to Z = backWallZ
  const sideWallZ = (FRONT_GLASS_Z + backWallZ) / 2;
  const floorCeilLen = sideWallLen;

  // 1. Realistic office suspended (drop) ceiling: acoustic tiles in a T-bar
  // grid, with recessed fluorescent troffer panels providing the light.
  // Module is oriented long-axis-across-store (X): the main sightlines run
  // down the store along Z, and a tile whose long side points away from the
  // camera foreshortens hard into a near-square under perspective — that's
  // what made the old 2x4 (long side along Z) read as squarish (issue
  // #129). Also sized a notch bigger than a real 2x4 so it reads clearly
  // at store scale instead of disappearing into the grid.
  const TILE_X = 5.0;  // tile module width, across the store (ft) — long axis
  const TILE_Z = 2.5;  // tile module depth, into the store (ft) — short axis

  // NOTHING in the lighting model reaches a downward-facing surface, and the
  // entire ceiling is downward-facing. The hemisphere light hands a -Y normal
  // its GROUND colour (#1c1408 at 0.09 — a tint, not energy); the baked
  // environment's lower hemisphere is dark navy carpet; and the recessed
  // troffers are coplanar with everything else up here, so they contribute
  // ~nothing either (cos(89°) ≈ 0). Left alone, every ceiling surface renders
  // near-black with a brown cast — tiles, T-bar rails and HVAC diffusers
  // alike, whatever base colour they were authored with.
  //
  // So stand in for the room bounce a single-probe IBL can't deliver. Pass the
  // surface's own map so the emissive is MODULATED by it rather than being a
  // flat glow: a uniform wash over this much screen area is the "CG ceiling"
  // tell, and it's what drove the tile plane's value down to 0.12 (i.e. to
  // black) before this existed.
  //
  // bakeEmissiveOff is the load-bearing part: this is light the ceiling should
  // RECEIVE, so it must never feed bakeEnvironment(). Letting the capture
  // re-emit it manufactures energy from nothing, and since the ceiling is the
  // largest surface in the store it then rivals the troffers as a light source
  // — measured at +47% on the whole room. Suppressed, these values move only
  // the ceiling and never the room's light budget, which is what makes them
  // free to retune by eye.
  const ceilingBounce = (
    mat: THREE.MeshStandardMaterial,
    intensity: number,
    map: THREE.Texture | null,
  ) => {
    mat.emissive = new THREE.Color(0xf4f6fa);
    if (map) mat.emissiveMap = map;
    mat.emissiveIntensity = intensity;
    mat.userData.bakeEmissiveOff = true;
    // Grazing falloff. A flat emissive keeps FULL brightness at any view
    // angle, so from the pulled-back entrance overview — where the ceiling
    // fills the top third of the frame at a shallow angle — the whole field
    // fused into one glowing white plane (user: "ceiling way too bright in
    // the cursor view at the entrance"). A real tile field dims sharply
    // toward the horizon: T-bar rails self-shadow the tiles and the pile of
    // near-parallel surfaces reflects less energy your way. Scale the
    // stand-in by cos(view angle) so overhead tiles keep their tuned level
    // while the far field rolls off to a quarter of it.
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 0.25 + 0.75 * saturate( dot( normal, normalize( vViewPosition ) ) );`,
      );
    };
    return mat;
  };

  const ceilTex = createCeilingTileTexture();
  ceilTex.repeat.set(storeWidth / TILE_X, floorCeilLen / TILE_Z);

  const ceilGeo = new THREE.PlaneGeometry(storeWidth, floorCeilLen);
  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0xf4f4f0,
    map: ceilTex,
    roughness: 0.92,
    metalness: 0.0,
    bumpMap: ceilTex,
    bumpScale: 0.01,
  });
  // Mostly hidden BEHIND the instanced panels; what shows is the grid line
  // between them, so it has to sit at the panels' level. History: 0.22 flat
  // read uniform, 0.12 flat went dead — the fix for THAT was routing the glow
  // through the map (shading response returns). But 0.5 map-modulated then
  // overshot the other way: the acoustic field out-glowed the merchandise and
  // the ceiling became the brightest surface in the store (dark room "by
  // comparison"; the cornice mirror reflected the dark room and read black).
  // The plain tile field is a LIT surface, not a light — pulled to 0.24 so the
  // troffer lens panels (HDR 1.55) are unambiguously the fixtures. The map is
  // what keeps this dim value from flattening.
  ceilingBounce(ceilMat, 0.24, ceilTex);
  const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
  ceiling.position.set(STORE_CENTER_X, ceilingY, sideWallZ);
  ceiling.rotation.x = Math.PI / 2; // Facing down
  ceiling.receiveShadow = true;
  scene.scene.add(ceiling);

  // Opaque roof slab above the drop ceiling. The ceiling plane is a one-sided,
  // non-shadow-casting decoration, so without this the directional sun shone
  // straight through the "roof" and painted daylight across the whole floor —
  // interior sun patches must only come in through the storefront glass.
  const roofGeo = new THREE.BoxGeometry(storeWidth + 4.0, 0.5, floorCeilLen + 4.0);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x35383c, roughness: 0.95 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(STORE_CENTER_X, ceilingY + 0.6, sideWallZ);
  roof.castShadow = true;
  scene.scene.add(roof);

  // Recessed troffer light panels + plain acoustic panels on a dense T-bar
  // module grid. Every module in the safe interior gets a tile — either a
  // bright emissive troffer or a plain unlit panel — arranged light, panel,
  // panel, panel, light along every row AND column (issue #128: two lit
  // troffers must never sit adjacent in a line). Their positions are
  // recorded so the lighting rig can place real area lights directly
  // beneath them.
  scene.troffers = [];
  const trofferLensTex = createTrofferLensTexture();
  const trofferMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    // Prismatic-lens pattern on both channels: hot bands over the tubes and
    // a dot lattice, so the panel reads as a fixture, not a glowing quad.
    map: trofferLensTex,
    emissiveMap: trofferLensTex,
    emissive: 0xf3f6ff,
    // True HDR emitter (linear value well above 1.0). These panels are the
    // room's actual light source in the baked environment: at night the whole
    // interior is lit by what the env bake captures from them, so they must be
    // far brighter than any lit surface — like real fluorescent diffusers. AgX
    // rolls the panels themselves off to clean white instead of clipping, and
    // the 1.1 bloom threshold gives them the faint halo real diffusers have.
    // Was 3.5 — pulled back so the fixtures read lit, not glaring; the night
    // env display gain (updateSkybox) compensates for the lost bake energy.
    // Nudged 1.25 -> 1.4 to lift the whole baked interior ever so slightly.
    // 1.4 -> 1.55 with the lens emissiveMap: the map's edge falloff and dark
    // lattice cells absorb ~10% of the panel's average energy, and the night
    // bake leans on that energy — this keeps the room's light budget level.
    emissiveIntensity: 1.55,
    roughness: 0.4,
    metalness: 0.0
  });
  // The T-bar grid itself: the rail that borders EVERY module (plain tiles,
  // troffers and diffusers all hang their face inside one of these), so it
  // draws the whole visible lattice of the ceiling.
  //
  // Was metalness 0.7, which is why the grid read as a black lattice. A metal
  // has NO diffuse term — it is lit purely by environment specular — so a
  // downward-facing metal rail reflects the env's dark-carpet lower
  // hemisphere and renders black no matter what base colour it carries. The
  // authored 0xf0f0f0 white never had a chance. Real suspended-ceiling grid is
  // PAINTED steel: a dielectric with a satin finish, not bare metal. Describing
  // it that way (metalness ~0) is what lets the colour show at all, and the
  // bounce stand-in below is what supplies the light to show it with.
  const trofferFrameMat = new THREE.MeshStandardMaterial({
    color: 0xf0f0f0, roughness: 0.5, metalness: 0.04
  });
  // A hair under the tiles: a real rail sits slightly proud of the tile face
  // and catches marginally less of the room than the tile it borders, so the
  // grid stays legible instead of dissolving into the field. Tracks the tile
  // rebalance (was 0.42) — kept just below the plane's 0.24 so the lattice
  // still reads without the whole grid glowing.
  ceilingBounce(trofferFrameMat, 0.2, null);
  // Plain (unlit) acoustic panel — same recessed T-bar module as a troffer,
  // but a flat matte tile instead of an emissive diffuser. Shares the
  // troffer's frame material/geometry (same metal trim), just a different
  // face. Instanced: the panel count scales with the whole ceiling area
  // (hundreds at full store scale), so unlike the sparse troffers these
  // must not be individual THREE.Mesh objects.
  const acousticPanelTex = createAcousticPanelTexture();
  const panelMat = new THREE.MeshStandardMaterial({
    // Fissured mineral-fibre texture — flat color here was a loud CG tell
    // on the second-largest surface in view.
    map: acousticPanelTex,
    color: 0xfdfdfb, roughness: 0.92, metalness: 0.0
  });
  // Eyeballed against reference drop ceilings: the point where tile reads as
  // lit mineral fibre rather than storm-grey or lightbox. 0.5 tipped into
  // lightbox (out-glowed the merchandise); 0.24 sits on the lit-fibre side and
  // lets the troffers be the only true emitters.
  ceilingBounce(panelMat, 0.24, acousticPanelTex);
  const trofferPanelGeo = new THREE.BoxGeometry(TILE_X - 0.12, 0.04, TILE_Z - 0.12);
  const trofferFrameGeo = new THREE.BoxGeometry(TILE_X, 0.06, TILE_Z);
  const plainPanelGeo = new THREE.BoxGeometry(TILE_X - 0.12, 0.02, TILE_Z - 0.12);

  // Tiles must sit IN the T-bar grid, not float over it. The tile texture
  // is anchored at the plane's corner: tile boundaries run at
  // x = leftEdge + TILE_X*k and z = backWallZ + TILE_Z*m, so a legal module
  // occupies centre (leftEdge + TILE_X*(k+0.5), backWallZ + TILE_Z*(m+0.5)).
  // A tile is a lit troffer every 4th column AND every 4th row (k%4==0 &&
  // m%4==0) — one light per 16 modules — everything else is a plain panel;
  // that 4-module spacing on both axes is exactly light-panel-panel-panel
  // repeating along every line, and guarantees no two lights are ever
  // adjacent (issue #128). A second grid, offset by two modules on BOTH
  // axes (k%4==2 && m%4==2), sits in the gap between those lights,
  // doubling density without ever landing in the same row or column as a
  // first-grid light — the two grids are diagonal to each other, so
  // adjacency along a line (issue #128) still never happens.
  //
  // The grid must also stay clear of the chrome+mirror ceiling cornice
  // (buildCeilingFrame), which intrudes CORNICE_WALL_GAP + CORNICE_BAND
  // from every wall (issue #129b) — any tile whose footprint would cross
  // into that band is skipped entirely (partial tiles are not cut, just
  // dropped, since a clipped module would desync from the T-bar texture).
  const leftEdge = STORE_CENTER_X - storeWidth / 2;
  const rightWallX = STORE_CENTER_X + storeWidth / 2;
  const cornerMargin = CORNICE_WALL_GAP + CORNICE_BAND;
  const safeXMin = leftEdge + cornerMargin;
  const safeXMax = rightWallX - cornerMargin;
  const safeZMin = backWallZ + cornerMargin;
  const safeZMax = FRONT_GLASS_Z - cornerMargin;
  // Entrance vestibule volume (glass chamber runs full height to the ceiling,
  // see src/entrance/index.ts): skip any tile whose footprint would
  // intersect it rather than embedding ceiling tiles in the glass box.
  const vestHalfW = vestibuleHalfWidth(scene.storefrontSpec);
  const vestBackZ = FRONT_GLASS_Z - 2 * scene.storefrontSpec.doorWidth; // boxDepth = doorW * 2
  // The cash-wrap soffit (buildFrontSoffit, below) hangs its own lit deck
  // FRONT_SOFFIT_DROP under this one over the whole checkout zone. A troffer
  // left up here would be sealed above that lid — invisible, but still an
  // HDR emitter in the environment bake, double-lighting the counter from a
  // fixture nobody can see. Those modules revert to plain acoustic panel.
  // The LID outline, not the band's: the lid runs on past the fascia over the
  // vestibule to the storefront wall, and every module under THAT is the one
  // that must not be a light.
  const soffitPoly = frontSoffitLidPolygon(
    scene.storefrontSpec, storeWidth, CORNICE_WALL_GAP, CORNICE_BAND,
  );

  const numCols = Math.floor(storeWidth / TILE_X);
  const numRows = Math.floor(floorCeilLen / TILE_Z);
  const panelSpots: { x: number; z: number }[] = [];
  const ventSpots: { x: number; z: number }[] = [];
  const sprinklerSpots: { x: number; z: number }[] = [];
  for (let k = 0; k < numCols; k++) {
    const tx = leftEdge + TILE_X * (k + 0.5);
    if (tx - TILE_X / 2 < safeXMin || tx + TILE_X / 2 > safeXMax) continue;
    for (let m = 0; m < numRows; m++) {
      const tz = backWallZ + TILE_Z * (m + 0.5);
      if (tz - TILE_Z / 2 < safeZMin || tz + TILE_Z / 2 > safeZMax) continue;
      const inVestibule =
        tx + TILE_X / 2 > STORE_CENTER_X - vestHalfW &&
        tx - TILE_X / 2 < STORE_CENTER_X + vestHalfW &&
        tz + TILE_Z / 2 > vestBackZ;
      if (inVestibule) continue;

      const overSoffit = tileOverlapsSoffit(tx, tz, TILE_X / 2, TILE_Z / 2, soffitPoly);
      const isLight = !overSoffit &&
        (((k % 4 === 0) && (m % 4 === 0)) || ((k % 4 === 2) && (m % 4 === 2)));
      if (isLight) {
        const frame = new THREE.Mesh(trofferFrameGeo, trofferFrameMat);
        frame.position.set(tx, ceilingY - 0.03, tz);
        scene.scene.add(frame);
        const panel = new THREE.Mesh(trofferPanelGeo, trofferMat);
        panel.position.set(tx, ceilingY - 0.06, tz);
        scene.scene.add(panel);
        scene.troffers.push({ x: tx, z: tz });
      } else if (!overSoffit && (k % 4 === 2) && (m % 4 === 0) && (((k - 2) / 4 + m / 4) % 2 === 0)) {
        // A sparse diagonal of HVAC supply diffusers between the light
        // grids — a real drop ceiling is never 100% acoustic tile, and the
        // uniform grid was part of the CG read. Same module footprint.
        // The extra checkerboard term keeps only every OTHER candidate
        // module (diagonally staggered), halving the vent count — the full
        // k%4/m%4 grid read as far too many diffusers for one room.
        ventSpots.push({ x: tx, z: tz });
      } else {
        panelSpots.push({ x: tx, z: tz });
        // Sprinkler heads on their own module phase — (0,2), the one the
        // lights (0,0)/(2,2) and vents (2,0) don't use — so they run in
        // straight 20x10 ft rows across the WHOLE ceiling like a real piped
        // system. The old seeded scatter clumped several heads into one bay
        // and left the rest of the store bare (feedback pin 013). Constant
        // in-tile offset keeps them off dead-center without breaking the
        // row alignment.
        // (Same soffit guard as lights/vents: a head on a tile the front
        // soffit slices through would hang from the cut — feedback/045's
        // vent did exactly that.)
        if (!overSoffit && k % 4 === 0 && m % 4 === 2) {
          sprinklerSpots.push({ x: tx + TILE_X * 0.22, z: tz - TILE_Z * 0.18 });
        }
      }
    }
  }

  if (panelSpots.length > 0) {
    const panelFrameMesh = new THREE.InstancedMesh(trofferFrameGeo, trofferFrameMat, panelSpots.length);
    const panelFaceMesh = new THREE.InstancedMesh(plainPanelGeo, panelMat, panelSpots.length);
    panelFrameMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    panelFaceMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    panelFrameMesh.frustumCulled = false;
    panelFaceMesh.frustumCulled = false;
    const m4 = new THREE.Matrix4();
    const tileTint = new THREE.Color();
    panelSpots.forEach((spot, i) => {
      m4.makeTranslation(spot.x, ceilingY - 0.03, spot.z);
      panelFrameMesh.setMatrixAt(i, m4);
      m4.makeTranslation(spot.x, ceilingY - 0.06, spot.z);
      panelFaceMesh.setMatrixAt(i, m4);
      // Deterministic ±3% per-tile tone drift (aging is never uniform across
      // a grid). Seeded on the grid position so rebuilds don't shimmer.
      const drift = 0.97 + seededRandom01(`ceil_${spot.x.toFixed(1)}_${spot.z.toFixed(1)}`) * 0.06;
      tileTint.setScalar(drift);
      panelFaceMesh.setColorAt(i, tileTint);
    });
    panelFrameMesh.instanceMatrix.needsUpdate = true;
    panelFaceMesh.instanceMatrix.needsUpdate = true;
    if (panelFaceMesh.instanceColor) panelFaceMesh.instanceColor.needsUpdate = true;
    scene.scene.add(panelFrameMesh);
    scene.scene.add(panelFaceMesh);
  }

  // HVAC diffuser modules (see ventSpots above): T-bar frame + a slotted
  // metal face, hung a hair lower than the acoustic tiles like the real
  // thing. Instanced and static — costs one draw call.
  if (ventSpots.length > 0) {
    // Same story as the T-bar rail: metalness 0.35 on a downward face turned
    // a diffuser whose texture is light grey (#dfe1e3, dark louver slots) into
    // a black square. Painted steel, so ~dielectric. The bounce runs through
    // the vent map, which keeps the slots dark while the face reads lit —
    // exactly the contrast that makes it look like a diffuser.
    const ventTex = createHvacVentTexture();
    const ventMat = new THREE.MeshStandardMaterial({
      map: ventTex, roughness: 0.5, metalness: 0.06,
      // A small self-lit floor under the bounce: away from a troffer the
      // bounce field falls to tile-darkness, which erased the plate around
      // the slots — the louver rows then floated on bare tile and shimmered
      // like z-fighting (feedback/045). Modulated by the vent map so the
      // slots stay dark; far too dim to register as a lamp in the bake.
      emissive: 0xffffff, emissiveMap: ventTex, emissiveIntensity: 0.22,
    });
    ceilingBounce(ventMat, 0.42, ventTex);
    const ventFrameMesh = new THREE.InstancedMesh(trofferFrameGeo, trofferFrameMat, ventSpots.length);
    const ventFaceMesh = new THREE.InstancedMesh(trofferPanelGeo, ventMat, ventSpots.length);
    ventFrameMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    ventFaceMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    ventFrameMesh.frustumCulled = false;
    ventFaceMesh.frustumCulled = false;
    const vm4 = new THREE.Matrix4();
    ventSpots.forEach((spot, i) => {
      vm4.makeTranslation(spot.x, ceilingY - 0.03, spot.z);
      ventFrameMesh.setMatrixAt(i, vm4);
      vm4.makeTranslation(spot.x, ceilingY - 0.08, spot.z);
      ventFaceMesh.setMatrixAt(i, vm4);
    });
    ventFrameMesh.instanceMatrix.needsUpdate = true;
    ventFaceMesh.instanceMatrix.needsUpdate = true;
    scene.scene.add(ventFrameMesh);
    scene.scene.add(ventFaceMesh);
  }

  // Sprinkler heads: a short chrome drop with a brass deflector disc,
  // scattered sparsely across the plain tiles. Two instanced meshes total.
  if (sprinklerSpots.length > 0) {
    const dropGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6);
    const discGeo = new THREE.CylinderGeometry(0.07, 0.055, 0.03, 8);
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.35, metalness: 0.8 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xa8874a, roughness: 0.45, metalness: 0.75 });
    const dropMesh = new THREE.InstancedMesh(dropGeo, chromeMat, sprinklerSpots.length);
    const discMesh = new THREE.InstancedMesh(discGeo, brassMat, sprinklerSpots.length);
    dropMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    discMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    dropMesh.frustumCulled = false;
    discMesh.frustumCulled = false;
    const sm4 = new THREE.Matrix4();
    sprinklerSpots.forEach((spot, i) => {
      sm4.makeTranslation(spot.x, ceilingY - 0.12, spot.z);
      dropMesh.setMatrixAt(i, sm4);
      sm4.makeTranslation(spot.x, ceilingY - 0.24, spot.z);
      discMesh.setMatrixAt(i, sm4);
    });
    dropMesh.instanceMatrix.needsUpdate = true;
    discMesh.instanceMatrix.needsUpdate = true;
    scene.scene.add(dropMesh);
    scene.scene.add(discMesh);
  }

  // 1.5 Troffer key lights — the shadows the emissive panels can't cast.
  // The troffer panels above are pure emissive geometry folded into the
  // baked environment: that IBL is soft and omnidirectional, so it grounds
  // nothing, and the sun was the room's ONLY shadow caster — away from its
  // window rake (and at night, when it runs at intensity 0) no object in
  // the store cast any shadow at all, so everything read as floating. A
  // sparse grid of wide, soft, shadow-casting SpotLights aimed straight
  // down stands in for the aggregate troffer grid and pins every fixture
  // and case to the floor with a real downward shadow, day and night.
  // Spots rather than a second directional because the cone self-confines
  // the light to the interior: the exterior dressing (sign glow, lamp
  // pools, night darkness) is tuned separately and must never receive a
  // flat top light — and a shadow-skirt occluder big enough to protect it
  // would also block the sun.
  //
  // Shadow budget: these maps light STATIC fixtures. Like the logoLight
  // (issue #111), each spot runs per-light shadow.autoUpdate = false so the
  // hot-path rebakes — case-pop settles on every browse step, end-cap
  // lerps, the launch flourish — render the sun's map alone, not sun + one
  // pass per spot (a 7x depth-pass multiplier that landed as a hitch on
  // every shelf move). Structural changes re-flag them via
  // queueStructuralShadowRefresh(). Quality 'low' skips the shadows
  // entirely (the lights stay, so brightness balance holds).
  scene.trofferKeyLights = [];
  {
    const keyY = ceilingY - 0.2; // just under the tiles, below the roof slab
    const halfAngle = THREE.MathUtils.degToRad(62);
    const trofferShadows = scene.effectiveQuality !== 'low' && !scene.softwareGL;
    const trofferMapSize = scene.effectiveQuality === 'high' ? 1024 : 512;
    // FRAGMENT-SAMPLER BUDGET — why every troffer can't cast a shadow.
    //
    // three.js binds ONE fragment sampler per shadow-casting light into
    // EVERY lit material's program (spotShadowMap[NUM_SPOT_LIGHT_SHADOWS],
    // directionalShadowMap[…], pointShadowMap[…]) on top of that material's
    // own maps and the scene environment. The ceiling is
    // MAX_TEXTURE_IMAGE_UNITS, and ANGLE's D3D11 backend reports 16 — the
    // WebGL2 floor — even on a 4090 (measured: WebGL2RenderingContext,
    // capabilities.isWebGL2 true, MAX_TEXTURE_IMAGE_UNITS 16, unmasked
    // renderer "ANGLE (NVIDIA … RTX 4090 … D3D11)"). It is NOT a WebGL1
    // fallback and it cannot be raised.
    //
    // Unbudgeted this grid put 12 shadow-casting spots (more at --full,
    // where the count scales with the store footprint) + the sun + the
    // storefront logo point = 14 of those 16 units, leaving ONE for
    // map/normalMap/roughnessMap/aoMap/envMap. Every MeshStandard/
    // MeshPhysical program then failed to LINK ("FRAGMENT shader texture
    // image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)",
    // VALIDATE_STATUS false) and three.js drew nothing for those materials
    // — walls, carpet, shelf panels all rendered fully TRANSPARENT at
    // quality high and medium (low escaped only because it skips these
    // shadows entirely).
    //
    // So: cap the shadow CASTERS at what the GPU can actually link, derived
    // from the real capability so a 32-unit desktop-GL driver keeps the lot.
    // The lights themselves all stay — brightness and pool coverage are
    // unchanged, the uncast ones simply don't ground their own fixtures.
    // Fewer depth passes at bake time is a straight perf win too.
    const MATERIAL_SAMPLER_RESERVE = 7; // worst shell material is 4 maps + envMap, + headroom
    const OTHER_SHADOW_LIGHTS = 2;      // the sun (directional) + the storefront logo (point)
    const spotShadowBudget = Math.max(0,
      scene.renderer.capabilities.maxTextures - MATERIAL_SAMPLER_RESERVE - OTHER_SHADOW_LIGHTS);
    // Spacing is set by where a pool actually still reads, not by the cone's
    // nominal 62°. Penumbra 0.85 feathers the outer 85% of the cone away, and
    // illuminance on the floor falls as cos³ of the off-axis angle on top of
    // that, so a pool is down to half brightness by ~45° off axis — about one
    // ceiling height out, not the 25ft the angle suggests. The old 1.4
    // multiplier spaced the keys 35ft apart on that optimistic reading and
    // left the carpet between them receiving ~2% of pool centre: dark gutters
    // covering most of the floor. 0.9 puts them ~22ft apart, so the midpoint
    // between neighbours keeps roughly half its light from each.
    const spacing = keyY * Math.tan(halfAngle) * 0.9;
    const cols = Math.max(1, Math.ceil(storeWidth / spacing));
    const rows = Math.max(1, Math.ceil(floorCeilLen / spacing));
    // Which spots get to cast, within the sampler budget above. Spread the
    // picks evenly across the generation order (column-major, so a stride
    // walk naturally staggers the rows it takes from each column) — an even
    // scatter keeps the store's grounding uniform instead of leaving one
    // half of the floor shadowless.
    const trofferTotal = cols * rows;
    const shadowPicks = new Set<number>();
    if (trofferShadows) {
      if (spotShadowBudget >= trofferTotal) {
        for (let i = 0; i < trofferTotal; i++) shadowPicks.add(i);
      } else if (spotShadowBudget === 1) {
        shadowPicks.add((trofferTotal - 1) >> 1); // one caster: take the middle
      } else {
        for (let k = 0; k < spotShadowBudget; k++) {
          shadowPicks.add(Math.round((k * (trofferTotal - 1)) / (spotShadowBudget - 1)));
        }
      }
    }
    let trofferIndex = 0;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const kx = leftEdge + storeWidth * ((c + 0.5) / cols);
        const kz = backWallZ + floorCeilLen * ((r + 0.5) / rows);
        // A key that lands over the checkout zone belongs to the soffit's
        // troffers, not the deck's: left at deck height its cone would start
        // ABOVE the lid and be clipped by the fascia, leaving the counter —
        // the one spot in the store with a customer standing at it — the
        // only unlit floor. Drop it to the lower lid.
        const ky = pointInSoffit(kx, kz, soffitPoly) ? frontSoffitY(ceilingY) - 0.2 : keyY;
        // Physical units (candela, decay 2), and NO distance cutoff. The
        // cutoff is the trap here: three.js multiplies the inverse-square
        // term by pow2(saturate(1 - pow4(d / cutoff))), which is not a
        // far-clip but a window that bites across the whole range. With the
        // old cutoff of ky+4 (~17.3ft) the floor straight below (d=13.3) kept
        // only 42% of its light, and the cone's own rim — d = ky/cos(62°) ≈
        // 28ft, well past the cutoff — got exactly ZERO. Each pool died at a
        // ~11ft radius instead of the 25ft the cone angle promises, so the
        // carpet between fixtures never received any direct light at all and
        // three rounds of intensity bumps (110 -> 145 -> 180) only brightened
        // the small disc that did land. Unbounded range + pure inverse-square
        // lets the cones reach the floor and overlap into even coverage; the
        // shadow camera's far plane still clips the depth pass at the floor.
        const key = new THREE.SpotLight(0xf3f6ff, 110, 0, halfAngle, 0.85, 2);
        key.position.set(kx, ky, kz);
        // A hair off vertical: a perfectly straight-down lookAt runs
        // parallel to the shadow camera's up vector. Same offset on every
        // spot so all the pools lean the same way.
        key.target.position.set(kx + 0.7, floorY, kz - 0.5);
        key.castShadow = shadowPicks.has(trofferIndex++);
        key.shadow.mapSize.width = trofferMapSize;
        key.shadow.mapSize.height = trofferMapSize;
        key.shadow.bias = -0.0004;
        key.shadow.normalBias = 0.05; // wide cone grazes shelf tops — curb acne
        key.shadow.radius = 4.0; // soft diffuser-sized penumbra
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = ky + 4.0;
        // On-demand only — see the shadow-budget comment above. The one-shot
        // needsUpdate rides the boot-time bake so the depth texture is
        // allocated before anything samples it.
        key.shadow.autoUpdate = false;
        key.shadow.needsUpdate = true;
        scene.scene.add(key);
        scene.scene.add(key.target);
        scene.trofferKeyLights.push(key);
      }
    }
  }

  // 1.6 The cash-wrap soffit — the dropped lit ceiling over the checkout
  // zone, with the mirrored cornice band wrapped around its edge so the ring
  // crosses the front of the store instead of dying at the vestibule.
  // See src/ceiling-soffit.ts for the geometry contract with buildCeilingFrame.
  {
    // ShapeGeometry hands back UVs in the shape's own units (FEET here), not
    // 0..1 like the main ceiling's PlaneGeometry — so the tile map needs a
    // per-foot repeat instead of the plane-wide one ceilTex carries.
    const soffitTex = createCeilingTileTexture();
    soffitTex.wrapS = soffitTex.wrapT = THREE.RepeatWrapping;
    soffitTex.repeat.set(1 / TILE_X, 1 / TILE_Z);
    // ...which pins the printed grid to the WORLD origin, not to the main
    // deck's grid or to anything on the lid. Offset it so a tile CENTRE
    // (the half-integer, since the texture draws its T-bar at the border)
    // lands on the troffers — otherwise each fixture straddles a grid line
    // and reads as sitting on top of the tiles instead of replacing one.
    const soffitLights = soffitTrofferCenters();
    const frac = (v: number) => v - Math.floor(v);
    soffitTex.offset.set(
      frac(0.5 - soffitLights[0].x / TILE_X),
      frac(0.5 - soffitLights[0].z / TILE_Z),
    );
    const soffitMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f0, map: soffitTex, roughness: 0.92, metalness: 0.0,
      bumpMap: soffitTex, bumpScale: 0.01,
    });
    ceilingBounce(soffitMat, 0.24, soffitTex);

    // Same derivation as the ceiling-frame mirror below (see the long note on
    // F8 pin 028 there): track the drawing buffer's size AND shape, cap by
    // quality tier. What was here instead was a square res with a HEADLESS pin
    // at 64 — so every `shot.mjs` frame showed a smeared 64px band no matter
    // what --quality asked for, and no screenshot could gate the look. The
    // harness's own fast default is quality LOW, which still lands on the cheap
    // tier, so this costs nothing on ordinary shots.
    const soffitReflectorSize = reflectorTargetSize(scene.renderer);

    const soffit = buildFrontSoffit({
      scene: scene.scene,
      ceilingY,
      storefrontSpec: scene.storefrontSpec,
      storeWidth,
      corniceWallGap: CORNICE_WALL_GAP,
      corniceBand: CORNICE_BAND,
      corniceDrop: 2.7,
      tileMaterial: soffitMat,
      trofferPanelMaterial: trofferMat,
      trofferFrameMaterial: trofferFrameMat,
      tileX: TILE_X,
      tileZ: TILE_Z,
      softwareGL: !liveMirrorsAllowed(scene),
      reflectorSize: soffitReflectorSize,
      // bb-2000: all-white soffit body + inset circular can lights, no mirror
      // ring (the perimeter cornice is dropped for that store — user).
      plainWhite: getActiveTheme().id === 'bb-2000',
    });
    // Keep the register of panel centres complete. Nothing reads it today —
    // the emitters reach the bake as scene geometry, not through this list —
    // but it is the store's inventory of ceiling lights, and a future reader
    // wanting "every troffer" would silently miss the checkout zone entirely.
    scene.troffers.push(...soffit.troffers);
  }

  // 2. Photoreal loop-pile carpet in the theme's own color (albedo mottle +
  //    pile normal + wear roughness).
  const { map: carpetTex, normalMap: carpetNormTex, roughnessMap: carpetRoughTex } = createCarpetTextures();

  const carpetFeetPerTile = 6.0;
  [carpetTex, carpetNormTex, carpetRoughTex].forEach(t =>
    t.repeat.set(storeWidth / carpetFeetPerTile, floorCeilLen / carpetFeetPerTile));

  const floorGeo = new THREE.PlaneGeometry(storeWidth, floorCeilLen);
  const floorMat = new THREE.MeshStandardMaterial({
    map: carpetTex,
    normalMap: carpetNormTex,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: carpetRoughTex,
    roughness: 0.95, // scales the wear map: burnished lanes shimmer a touch sooner
    metalness: 0.0
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(STORE_CENTER_X, floorY, sideWallZ);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.scene.add(floor);
  // Baked floor AO (docs/lightmap-pipeline.md Phase 1) attaches to this
  // material later in buildStore, once the fixture/counter footprints are
  // assembled — see the bakeFloorAO call by the clerk-nav block.
  scene.floorMat = floorMat;

  // Real photo-scanned carpet (ambientCG Carpet012, CC0): a full-res set in
  // the git-ignored user-assets tree wins, else the 1K default shipped at
  // public/textures/surfaces/ (the tryLoadUserAssetTexture fallback chain).
  // Only a build missing both keeps the procedural maps above.
  {
    const maxAniso = scene.renderer.capabilities.getMaxAnisotropy();
    const configureCarpetMap = (tex: THREE.Texture) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(storeWidth / carpetFeetPerTile, floorCeilLen / carpetFeetPerTile);
      tex.anisotropy = maxAniso;
    };
    tryLoadUserAssetTexture('surfaces/store-carpet/color.png', (tex) => {
      configureCarpetMap(tex);
      // The scan is a PHOTO of one particular carpet, so using it raw pins the
      // floor to that carpet's color and the theme's palette.carpet silently
      // stops mattering. Neutralize it to luminance and let the palette be the
      // dye — the same "scan is the texture, theme is the paint" split the
      // wall surface uses.
      const neutral = neutralizeScanTexture(tex);
      // (allowKtx2: false below — neutralizeScanTexture reads pixels back via
      // canvas drawImage/getImageData, which only works on a CPU-decodable
      // image. A KTX2Loader texture is a GPU-native CompressedTexture with no
      // such image; see the allowKtx2 note in tryLoadUserAssetTexture.)
      if (neutral) {
        configureCarpetMap(neutral);
        floorMat.color.set(theme.palette.carpet);
        floorMat.map = neutral;
        tex.dispose();
      } else {
        floorMat.map = tex;
      }
      floorMat.needsUpdate = true;
      scene.requestRender?.();
    }, { allowKtx2: false });
    tryLoadUserAssetTexture('surfaces/store-carpet/normal.png', (tex) => {
      configureCarpetMap(tex);
      floorMat.normalMap = tex;
      floorMat.needsUpdate = true;
      scene.requestRender?.();
    }, { srgb: false });
    tryLoadUserAssetTexture('surfaces/store-carpet/roughness.png', (tex) => {
      configureCarpetMap(tex);
      floorMat.roughnessMap = tex;
      floorMat.needsUpdate = true;
      scene.requestRender?.();
    }, { srgb: false });
  }

  // 2.5 Store walls: amber-gold drywall with painted orange-peel relief.
  const { map: wallTex, normalMap: wallNormTex, roughnessMap: wallRoughTex } = createWallTextures();

  const wallFeetPerTile = 9.0;
  [wallTex, wallNormTex, wallRoughTex].forEach(t =>
    t.repeat.set(storeWidth / wallFeetPerTile, roomHeight / wallFeetPerTile));

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    normalMap: wallNormTex,
    normalScale: new THREE.Vector2(0.25, 0.25),
    roughnessMap: wallRoughTex, // sheen drift — see createWallTextures
    roughness: 0.92, // scales the sheen-drift map so raked paint shows its satin
    metalness: 0.0,
    // Baked wall-contact shading (docs/lightmap-pipeline.md Phase 1):
    // occlusion pools at the floor line and, faintly, under the ceiling
    // grid. Every wall segment keeps uv.v = worldY/roomHeight (see
    // scaleWallUV), so this one 1x256 gradient lands at the true
    // junction heights on all of them, via the default UV channel.
    aoMap: makeWallContactAO(roomHeight),
    aoMapIntensity: 0.8,
  });

  // Optional real photo-scanned warm painted plaster (ambientCG Plaster002,
  // CC0), multiplied by the "Wall Paint" setting (bb_wall_color) — 'auto'
  // (default) follows the era's own palette.wall (parchment for the Halcyon
  // eras, sage for bb-2000), or the user can
  // pin a fixed swatch (amber/white/blue/lime) regardless of theme. A 404
  // leaves the procedural amber map (tinted to palette.wall) untouched, and
  // the 0..1 aoMap is never replaced.
  const wallColorChoice = getSetting<string>('bb_wall_color');
  const wallTintHex = WALL_PAINT_OPTIONS[wallColorChoice]?.hex ?? theme.palette.wall;
  loadUserAssetSurface('surfaces/store-wall', (slot, tex) => {
    if (slot === 'map') wallMat.color.set(wallTintHex);
    if (slot === 'normalMap') wallMat.normalScale.set(0.35, 0.35);
    wallMat[slot] = tex;
    wallMat.needsUpdate = true;
    scene.requestRender();
  }, { repeat: [storeWidth / wallFeetPerTile, roomHeight / wallFeetPerTile], anisotropy: 8 });

  // Back wall (full-width outer shell at backWallZ)
  const backWallGeo = new THREE.PlaneGeometry(storeWidth, roomHeight);
  const backWall = new THREE.Mesh(backWallGeo, wallMat);
  backWall.position.set(STORE_CENTER_X, wallCenterY, backWallZ);
  backWall.receiveShadow = true;
  scene.scene.add(backWall);

  // Named mount surface for this wall (unrotated PlaneGeometry, so its
  // outward normal is world +Z — matches backWall's lack of a rotation.y
  // above). Bottom-left corner at floor level, spanning the full width.
  scene.surfaces.register({
    id: 'wall-back',
    origin: { x: STORE_CENTER_X - storeWidth / 2, y: floorY, z: backWallZ },
    uDir: { x: 1, y: 0, z: 0 },
    vDir: { x: 0, y: 1, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    width: storeWidth,
    height: roomHeight,
  });

  // Stepped back-right corner: the right section of the back wall is pulled
  // forward toward the viewer, creating two new right-angle corners.
  const rightEdgeX = STORE_CENTER_X + storeWidth / 2;
  const stepWallZ = backWallZ + scene.stepDepth;
  const rightSectionWidth = rightEdgeX - scene.stepX;

  // The shared wallMat texture repeat is sized for a storeWidth × roomHeight
  // plane; any other segment reusing it must rescale BOTH UV axes or its
  // texels get squeezed/stretched (a narrow step face crams the full-width
  // repeats into a few feet; a short band above a window squashes the full
  // wall height into it). vBottom (ft above the floor) keeps a partial-height
  // band sampling the same texture rows as the full-height wall beside it,
  // so the orange-peel pattern lines up across the glazing head.
  const scaleWallUV = (geo: THREE.PlaneGeometry, width: number, height = roomHeight, vBottom = 0) =>
    mapWallSegmentUV(geo, width, height, vBottom, storeWidth, roomHeight);

  // The knee walls under the glazing share the wall material through this
  // same mapping, so they carry the wall's mottle/orange-peel/contact-AO
  // instead of being flat paint that reads as a different surface where it
  // butts the wall segments beside it.
  scene.wallSurface = { material: wallMat, storeWidth, roomHeight };

  // Step faces only exist when there's a notch — with bb_corner === 'none' the
  // full-width backWall above already reads as the flat back-right wall, so
  // skip these (building them at stepDepth 0 would collapse to zero-area planes).
  if (scene.hasStep) {
    // Forward-facing wall of the stepped right section (faces +Z, into the store)
    const stepFrontGeo = new THREE.PlaneGeometry(rightSectionWidth, roomHeight);
    scaleWallUV(stepFrontGeo, rightSectionWidth);
    const stepFront = new THREE.Mesh(stepFrontGeo, wallMat);
    stepFront.position.set((scene.stepX + rightEdgeX) / 2, wallCenterY, stepWallZ);
    stepFront.receiveShadow = true;
    scene.scene.add(stepFront);

    // Connector wall closing the inner corner (runs in Z at stepX, faces -X)
    const stepSideGeo = new THREE.PlaneGeometry(scene.stepDepth, roomHeight);
    scaleWallUV(stepSideGeo, scene.stepDepth);
    const stepSide = new THREE.Mesh(stepSideGeo, wallMat);
    stepSide.position.set(scene.stepX, wallCenterY, backWallZ + scene.stepDepth / 2);
    stepSide.rotation.y = -Math.PI / 2; // normal points -X toward the interior
    stepSide.receiveShadow = true;
    scene.scene.add(stepSide);
  }

  // Side walls: BOTH sides carry the reference
  // building's banded window ribbon toward the front — brick knee below,
  // glazing up to WINDOW_HEAD_Y, solid gold wall above it, behind it
  // (where the right wall's back-aligned New Releases unit lives), and in
  // the front-corner margin. With no ribbon (very shallow store) a side
  // stays fully solid, like the right wall always was.
  const sideFrameColor = getActiveTheme().frameColorOverride ?? scene.storefrontSpec.frameColor;
  const buildSideWall = (side: 'left' | 'right'): { win: THREE.Group; len: number; cols: number } | null => {
    const wallX = side === 'left' ? STORE_CENTER_X - storeWidth / 2 : STORE_CENTER_X + storeWidth / 2;
    const inwardYaw = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    const ribbon = scene.sideRibbon;
    const addSolid = (z0: number, z1: number, yBottom: number, yTop: number) => {
      if (z1 - z0 < 0.05 || yTop - yBottom < 0.05) return;
      const geo = new THREE.PlaneGeometry(z1 - z0, yTop - yBottom);
      scaleWallUV(geo, z1 - z0, yTop - yBottom, yBottom - floorY);
      const seg = new THREE.Mesh(geo, wallMat);
      seg.position.set(wallX, (yBottom + yTop) / 2, (z0 + z1) / 2);
      seg.rotation.y = inwardYaw;
      seg.receiveShadow = true;
      scene.scene.add(seg);
    };
    if (!ribbon) {
      addSolid(backWallZ, FRONT_GLASS_Z, floorY, ceilingY);
      return null;
    }
    addSolid(backWallZ, ribbon.backZ, floorY, ceilingY);                    // rear span
    addSolid(ribbon.frontZ, FRONT_GLASS_Z, floorY, ceilingY);                        // front-corner margin
    addSolid(ribbon.backZ, ribbon.frontZ, WINDOW_HEAD_Y, ceilingY);    // band above the glazing
    const len = ribbon.frontZ - ribbon.backZ;
    // The ribbon span is already quantized to whole 4-ft panes (see the
    // sideRibbon computation in the constructor), so the column count is
    // exact — every pane is precisely SIDE_RIBBON_PANE_W wide, matching the
    // front storefront's pane rhythm (six panes on the baseline store).
    const cols = Math.max(1, Math.round(len / SIDE_RIBBON_PANE_W));
    // waistY 0 skips the waist rail: the reference ribbon is single tall
    // sheets on the knee wall, no mid-rail.
    const win = scene.createWindowSection(len, WINDOW_HEAD_Y, cols, 0, undefined, sideFrameColor);
    win.position.set(wallX, floorY, (ribbon.frontZ + ribbon.backZ) / 2);
    win.rotation.y = inwardYaw;
    scene.scene.add(win);
    return { win, len, cols };
  };
  const rightRibbon = buildSideWall('right');
  const leftRibbon = buildSideWall('left');

  // 2.7 Add storefront windows over a low knee wall (front wall + side ribbons)
  // Front window facade (at Z = 15.0): built from StorefrontSpec.windowBays
  // (T05) — frame color, per-bay width, and optional center mullions all
  // come from the spec instead of a hardcoded 10-column grid. The knee wall
  // gaps out around the entrance vestibule so the doors still reach the floor.
  // Glazing stops at WINDOW_HEAD_Y: the reference
  // building runs solid brick from the window heads to the parapet, so the
  // span above is interior gold wall (below) + exterior brick (facade).
  const frontVestibuleHalfWidth = vestibuleHalfWidth(scene.storefrontSpec); // matches buildEntrance's boxW
  const { group: frontWindow, panes: frontPanes, width: frontGlazedWidth } = buildWindowBays(
    scene.storefrontSpec, WINDOW_HEAD_Y, { center: 0, halfWidth: frontVestibuleHalfWidth },
    scene.wallSurface ?? undefined,
  );
  frontWindow.position.set(STORE_CENTER_X, floorY, FRONT_GLASS_Z);
  frontWindow.rotation.y = Math.PI; // Facing inwards
  scene.scene.add(frontWindow);

  // Interior wall band above the front glazing, flanking the vestibule
  // span (the vestibule's own transom glazing runs to the ceiling there;
  // a full-width plane would z-fight with it).
  [[-storeWidth / 2, -frontVestibuleHalfWidth], [frontVestibuleHalfWidth, storeWidth / 2]]
    .forEach(([a, b]) => {
      if (b - a < 0.05) return;
      const geo = new THREE.PlaneGeometry(b - a, ceilingY - WINDOW_HEAD_Y);
      scaleWallUV(geo, b - a, ceilingY - WINDOW_HEAD_Y, WINDOW_HEAD_Y - floorY);
      const band = new THREE.Mesh(geo, wallMat);
      band.position.set(STORE_CENTER_X + (a + b) / 2, (WINDOW_HEAD_Y + ceilingY) / 2, FRONT_GLASS_Z);
      band.rotation.y = Math.PI; // Facing inwards
      band.receiveShadow = true;
      scene.scene.add(band);
    });

  // Solid corner margins flanking the front window row: the whole-pane bays
  // stop at least FRONT_WINDOW_CORNER_MARGIN ft short of each corner
  // (store-layout.ts; pane quantization can leave more), so fill
  // floor-to-glazing-head with gold wall (the full-width band above
  // covers the rest; the exterior side is brick, from buildStorefrontFacade).
  const frontGlazedHalf = frontGlazedWidth / 2;
  // Satin, matching kneeTrimMat — see the "surfaces don't react" note there.
  const marginKickMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(themeTrimDarkHex()), roughness: 0.55, metalness: 0.05 });
  [[-storeWidth / 2, -frontGlazedHalf], [frontGlazedHalf, storeWidth / 2]].forEach(([a, b]) => {
    if (b - a < 0.05) return;
    const geo = new THREE.PlaneGeometry(b - a, WINDOW_HEAD_Y - floorY);
    scaleWallUV(geo, b - a, WINDOW_HEAD_Y - floorY);
    const seg = new THREE.Mesh(geo, wallMat);
    seg.position.set(STORE_CENTER_X + (a + b) / 2, (floorY + WINDOW_HEAD_Y) / 2, FRONT_GLASS_Z);
    seg.rotation.y = Math.PI; // Facing inwards
    seg.receiveShadow = true;
    scene.scene.add(seg);
    // Navy base kick matching the knee wall's (#134) so the baseboard line
    // runs unbroken from the knee wall across the margin into the side wall.
    const kick = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.2, 0.34), marginKickMat);
    kick.position.set(STORE_CENTER_X + (a + b) / 2, floorY + 0.1, FRONT_GLASS_Z);
    kick.receiveShadow = true;
    scene.scene.add(kick);
  });

  // Named mount surfaces for each front window bay (src/mount-surfaces.ts):
  // poster placement below reads these back via place() instead of
  // deriving pane centers inline. Each pane carries its own [lo, hi]
  // local-X interval (the run has a gap at the vestibule). Origin sits at
  // the bay's world-space left edge, at the old waist-rail height (Y = 3.3)
  // kept as the poster sill; normal faces into the store to match
  // the suspended posters' orientation ("Facing inwards" above).
  const bayWaistY = 3.3; // poster sill height (the physical waist rail is gone)
  const bayVisibleTop = WINDOW_HEAD_Y; // glazing head — same span the posters center in
  for (let i = 0; i < frontPanes.length; i++) {
    const { lo, hi } = frontPanes[i];
    // frontWindow is rotated 180 (rotation.y = Math.PI) about its own
    // (11.0, floorY, 15.0) origin, so local +X maps to world -X: a bay's
    // local upper edge (hi) is its world-space LEFT edge (u = 0).
    scene.surfaces.register({
      id: `window-bay-${i}`,
      origin: { x: STORE_CENTER_X - hi, y: floorY + bayWaistY, z: FRONT_GLASS_Z },
      uDir: { x: 1, y: 0, z: 0 },
      vDir: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: -1 },
      width: hi - lo,
      height: bayVisibleTop - bayWaistY,
    });
  }

  // --- ADD POSTERS TO WINDOWS ---
  const textureLoader = new THREE.TextureLoader();
  
  let movieIndex = 0;
  const getNextNewReleaseMovie = (): Movie | null => {
    while (movieIndex < scene.recentlyAddedMovies.length) {
      const m = scene.recentlyAddedMovies[movieIndex++];
      if (m.posterUrl) return m;
    }
    return null;
  };

  // Chrome poster-frame parts (issue #61), shared across every window
  // poster: one material + two bar geometries reused by all frames, matching
  // the ceiling cornice chrome (high metalness / low roughness).
  // Sized to leave visible glass around the frame: the pane is ~4.0 ft wide ×
  // 5.7 ft tall, so a 2.5 × 3.75 poster + 0.32 frame clears ~0.4 ft each side
  // and ~0.6 ft top/bottom instead of filling the whole window.
  const posterW = 2.5, posterH = 3.75;
  const frameT = 0.32, frameD = 0.22; // chunky marquee-style bar thickness / depth
  const posterFrameMat = new THREE.MeshStandardMaterial({
    color: 0xd6dbe2, metalness: 1.0, roughness: 0.12, envMapIntensity: 1.0,
  });
  const posterFrameHGeo = new THREE.BoxGeometry(posterW + 2 * frameT, frameT, frameD);
  const posterFrameVGeo = new THREE.BoxGeometry(frameT, posterH, frameD);

  const createSuspendedPosterGroup = (movie: Movie | null, paneCenterX: number): THREE.Group => {
    const posterGroup = new THREE.Group();

    // 1. Poster Mesh — fully opaque (issue #61): these are printed posters,
    // not translucent film, so nothing behind them should show through.
    const posterMat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide
    });

    // Poster plane matches the frame constants above (2:3 aspect ratio).
    const posterMesh = new THREE.Mesh(new THREE.PlaneGeometry(posterW, posterH), posterMat);

    // GH #5: the material is DoubleSide (issue #61 wanted it opaque from
    // both sides, since the poster hangs mid-pane with nothing to hide),
    // but DoubleSide draws the SAME uv on both faces — it doesn't mirror
    // one of them. A plane's default front face (the one that reads
    // correctly) pointed local +Z, which every caller's parent transform
    // (frontWindow's rotation.y=PI, each side ribbon's inward yaw) turns
    // into a normal aimed INTO the store. So the correct print always
    // faced the sales floor and the parking lot got the mirrored back.
    // A real poster faces the street: flip the plane 180 here so the
    // front face's normal points the other way (outside, for every
    // caller of this shared factory) and let the inside keep the
    // DoubleSide fallback — a mirrored read, same as the reference
    // footage shoots any poster through glass from the wrong side.
    posterMesh.rotation.y = Math.PI;

    // Center vertically in the GLAZED pane itself — knee wall top (2.0, the
    // window builders' KNEE_H) up to the glazing head. It used to center
    // between the waist rail and the head, which hung every poster high in
    // the pane (feedback/042: "more centered in the window pane").
    const paneBottom = 2.0;
    const posterCenterY = paneBottom + (WINDOW_HEAD_Y - paneBottom) / 2;

    posterMesh.position.set(0, posterCenterY, 0);
    posterGroup.add(posterMesh);

    // Thin chrome frame surrounding the pane (shared geometries/material).
    const frameBars: Array<[THREE.BoxGeometry, number, number]> = [
      [posterFrameHGeo, 0, posterCenterY + posterH / 2 + frameT / 2],
      [posterFrameHGeo, 0, posterCenterY - posterH / 2 - frameT / 2],
      [posterFrameVGeo, -(posterW / 2 + frameT / 2), posterCenterY],
      [posterFrameVGeo, posterW / 2 + frameT / 2, posterCenterY],
    ];
    for (const [geo, fx, fy] of frameBars) {
      const bar = new THREE.Mesh(geo, posterFrameMat);
      bar.position.set(fx, fy, 0);
      bar.receiveShadow = true;
      posterGroup.add(bar);
    }

    // Load movie poster or fallback
    if (movie && movie.posterUrl) {
      posterQueue.load(movie, 10, () => {
        // Fixture-pinned (#97): this framed poster hangs for the scene's
        // lifetime, so its texture is exempt from the hero LRU. Window art
        // is promo, not rental stock, so it takes the sticker-free decode.
        loadDecorPosterTexture(movie, (tex) => {
          posterMat.map = tex;
          posterMat.needsUpdate = true;
        });
      });
    } else {
      const fallbackTex = textureLoader.load(assetUrl('latest_movie_poster.png'));
      fallbackTex.colorSpace = THREE.SRGBColorSpace;
      posterMat.map = fallbackTex;
    }

    // (No suspension wires/clips — feedback/042: "don't need strings above
    // them". The framed lightbox reads as mounted, and the marquee-bulb ring
    // it anchors already carries the fixture look.)

    // Position the entire group in the pane
    // Z-offset is 0.16 to sit slightly inside the store (away from the glass at Z=0 and frames extending to Z=±0.15)
    posterGroup.position.set(paneCenterX, 0, 0.16);

    // T13: record this poster as a marquee-bulb frame anchor. posterGroup
    // itself carries no rotation of its own (only its parent window group
    // does), so once the parent's matrixWorld is up to date, decomposing
    // posterGroup.matrixWorld gives the poster's true world position + facing
    // — buildMarqueeBulbs() uses this to ring each poster with bulbs after
    // every window (and its posters) has been added to the scene.
    // Ring dimensions land on the centreline of the frame bars, so the bulbs
    // sit ON the frame rather than floating outside it.
    scene.posterMarqueeFrames.push({ anchor: posterMesh, width: posterW + frameT, height: posterH + frameT });

    return posterGroup;
  };

  // Poster bays come from the same posterBayIndices() store-layout.ts uses
  // to decide which bays keep an uninterrupted pane (no center mullion,
  // #135) — sharing the one function means these always agree, however
  // many bays defaultWindowBays() resolved to for this storeWidth (#136).
  // Poster centers come from the corresponding window-bay-<i> mount surface
  // (registered just above) rather than assuming equal division, so this
  // still lands correctly if StorefrontSpec.windowBays ever carries
  // variable-width bays.
  const frontPanelsWithPosters = posterBayIndices(frontPanes.length);
  // Bays under the era campaign banner (bb-2010; storefront-campaign-poster.ts)
  // stay lightbox-free — a suspended poster hanging IN FRONT of the banner is
  // the clash this shares placement math to prevent.
  const bannerSpan = campaignBannerSpan(scene);
  frontPanelsWithPosters.forEach((panelIdx) => {
    if (panelIdx >= frontPanes.length) return; // fewer bays than the preset list assumes
    const movie = getNextNewReleaseMovie();
    const surfaceId = `window-bay-${panelIdx}`;
    const surface = scene.surfaces.get(surfaceId);
    if (!surface) return;
    const pose = scene.surfaces.place(surfaceId, surface.width / 2, surface.height / 2, 0.16);
    if (!pose) return;
    if (bannerSpan
      && pose.position.x + surface.width / 2 > bannerSpan.x0
      && pose.position.x - surface.width / 2 < bannerSpan.x1) return;
    // createSuspendedPosterGroup positions its group in frontWindow's own
    // local space (rotation.y = Math.PI about (11.0, floorY, 15.0)), so
    // undo that transform (world x = 11.0 - local x) to recover the same
    // local pane-center X it always used — place()'s world-space pose is
    // otherwise unused here since the poster mesh itself still parents to
    // frontWindow, unchanged.
    const paneCenterX = STORE_CENTER_X - pose.position.x;
    const posterGroup = createSuspendedPosterGroup(movie, paneCenterX);
    frontWindow.add(posterGroup);
  });

  // Posters on every second pane of BOTH side-window ribbons (skipped
  // entirely when the store is too shallow to carry a ribbon). The right
  // ribbon used to go bare — feedback/042: "this window needs posters too".
  for (const ribbon of [leftRibbon, rightRibbon]) {
    if (!ribbon) continue;
    const paneW = ribbon.len / ribbon.cols;
    for (let panelIdx = 1; panelIdx < ribbon.cols; panelIdx += 2) {
      const movie = getNextNewReleaseMovie();
      const paneCenterX = -ribbon.len / 2 + (panelIdx + 0.5) * paneW;
      ribbon.win.add(createSuspendedPosterGroup(movie, paneCenterX));
    }
  }
  // ------------------------------

  // Add a dark blue baseboard along the bottom of the solid walls.
  //
  // #134: each straight run below sits its own small clearance off its own
  // wall plane (independently, to dodge z-fighting with that wall), which
  // means two perpendicular runs meeting at a corner both cover the same
  // little square of floor there and z-fight against EACH OTHER instead.
  // The insets below trim each run back to its neighbour's near edge so
  // every corner is a clean butt-join: no double coverage, no gap.
  // Satin painted millwork (see the kneeMat note) — matte navy trim read as
  // a dead flat fill from every angle.
  const baseboardMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(themeTrimDarkHex()), roughness: 0.55 });
  const BB_HALF = 0.02; // half the 0.04ft baseboard thickness

  // Back baseboard — full width; the side runs below start 0.04 ft off the
  // back wall so the corners butt cleanly against this run's front face.
  const bbBackGeo = new THREE.BoxGeometry(storeWidth, 0.2, 0.04);
  const bbBack = new THREE.Mesh(bbBackGeo, baseboardMat);
  bbBack.position.set(STORE_CENTER_X, floorY + 0.1, backWallZ + 0.02);
  scene.scene.add(bbBack);

  // Baseboards for the stepped right section. bbStepFront's left edge (at
  // stepX) and bbStepSide's far edge already clear each other with a
  // harmless ~0.01ft reveal; bbStepSide is inset off bbBack (near end) and
  // bbStepFront off the right-wall run (right end) so nothing overlaps.
  // Skipped when there's no notch — the flat back-right wall is covered by
  // bbBack (full storeWidth) and the right-wall run already.
  if (scene.hasStep) {
    const bbStepFrontRight = rightEdgeX - 2 * BB_HALF; // clears the right run's near edge (rightEdgeX-0.04)
    const bbStepFront = new THREE.Mesh(new THREE.BoxGeometry(bbStepFrontRight - scene.stepX, 0.2, 0.04), baseboardMat);
    bbStepFront.position.set((scene.stepX + bbStepFrontRight) / 2, floorY + 0.1, stepWallZ + 0.03);
    scene.scene.add(bbStepFront);

    const bbStepSideNear = backWallZ + 0.04; // clears bbBack's far edge (backWallZ+0.04)
    const bbStepSideFar = stepWallZ + 0.01; // touches bbStepFront's near edge (stepWallZ+0.01)
    const bbStepSide = new THREE.Mesh(new THREE.BoxGeometry(bbStepSideFar - bbStepSideNear, 0.2, 0.04), baseboardMat);
    bbStepSide.position.set(scene.stepX - 0.03, floorY + 0.1, (bbStepSideNear + bbStepSideFar) / 2);
    bbStepSide.rotation.y = Math.PI / 2;
    scene.scene.add(bbStepSide);
  }

  // Side-wall baseboards, BOTH walls, on the SOLID spans only: the window
  // ribbon's own base kick (createWindowSection, 0.34 ft deep) covers the
  // glazed span — running a baseboard behind it too made the two coplanar
  // 0.2 ft trims z-fight along the whole ribbon. Ends are trimmed so every
  // floor corner is a clean butt-join:
  //  - back end starts 0.04 off the back wall (clear of bbBack; on the
  //    stepped right wall, 0.05 off the step's front face, clear of
  //    bbStepFront's 0.01..0.05 z-span),
  //  - front end stops at the front corner-margin kick's inner face
  //    (z = 15 - 0.17; that kick is 0.34 ft deep, centered on the glass
  //    line) instead of running under it — the deeper kick reads as the
  //    corner return and this run butts into its side.
  const FRONT_KICK_INNER_Z = FRONT_GLASS_Z - 0.17;
  const buildSideBaseboards = (side: 'left' | 'right') => {
    const wallX = side === 'left' ? STORE_CENTER_X - storeWidth / 2 : STORE_CENTER_X + storeWidth / 2;
    const inward = side === 'left' ? 1 : -1;
    const rearStart = side === 'right' && scene.hasStep ? stepWallZ + 0.05 : backWallZ + 0.04;
    const segs: [number, number][] = scene.sideRibbon
      ? [[rearStart, scene.sideRibbon.backZ], [scene.sideRibbon.frontZ, FRONT_KICK_INNER_Z]]
      : [[rearStart, FRONT_KICK_INNER_Z]];
    segs.forEach(([z0, z1]) => {
      if (z1 - z0 < 0.05) return;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(z1 - z0, 0.2, 0.04), baseboardMat);
      seg.position.set(wallX + inward * BB_HALF, floorY + 0.1, (z0 + z1) / 2);
      seg.rotation.y = inward * Math.PI / 2;
      scene.scene.add(seg);
    });
  };
  buildSideBaseboards('left');
  buildSideBaseboards('right');

  // Data-driven wall displays (T07): framed poster groups + painted murals.
  scene.buildWallDecor(storeWidth, backWallZ);

  // 3. Populate back wall shelves (New Releases area)
  // -------------------------------------------------------------
  // BACK WALL SHELVING ("NEW RELEASES") - one continuous run spanning the
  // whole back wall (minus the left sliver), following the forward step.
  // -------------------------------------------------------------
  // Deepened from 0.2 -> 0.3 (1.5x) so the New Releases wall shelves and their
  // section dividers stick out as a real ledge boxes rest on, not a thin lip.
  const backWallShelfDepth = NR_WALL_SHELF_DEPTH; // Single sided depth in feet

  // Frosted shelf textures (laminate albedo + roughness map + micro-stipple normal map)
  const { map: shelfAlbedoTex, roughnessMap: shelfRoughnessTex, normalMap: shelfNormalTex } = createShelfTextures();
  // Tile the texture across shelf dimensions
  shelfAlbedoTex.repeat.set(6, 2);
  shelfRoughnessTex.repeat.set(6, 2);
  shelfNormalTex.repeat.set(6, 2);

  // Shared materials and geometries for back wall shelves (reused across all iterations)
  // MeshStandard, not Physical: every shelf board in the store shares this
  // material and it fills most of the screen while browsing, so the extra
  // clearcoat specular lobe (0.5 strength at 0.85 roughness — visually a
  // whisper on top of the 0.65-rough base) was a store-wide per-pixel cost
  // for nearly nothing. The maps carry the laminate read.
  const sharedShelfMat = new THREE.MeshStandardMaterial({
    color: 0xf8f2e8, // warm off-white melamine (reference-photo lit shelf reads ~#f2e8da)
    map: shelfAlbedoTex, // laminate blotch/streak/scuff — kills the flat-plastic read
    roughness: 0.55, // satin melamine: enough env sheen to shift with the view angle
    metalness: 0.1,
    roughnessMap: shelfRoughnessTex,
    normalMap: shelfNormalTex,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });
  // The 2000s wire-black frame reads the pale strip as a leftover white lip
  // on every shelf edge, so there it becomes a satin GUNMETAL front bar
  // matching the reworked wire frame (see shelving.ts) instead of flat
  // near-black; other themes keep the pale laminate strip.
  //
  // Satin, near-zero metal — same reasoning as nrClaspMat below, which fixed
  // this for the wall runs only. Untextured metalness (0.3, or 0.65 gunmetal)
  // mirrors the bright env bake straight down the lip, and because the merged
  // gondola strip mesh takes no shadows (shelving.ts) the result was a hot
  // white line running the length of every shelf edge that never dimmed with
  // the light around it. Aisle gondolas face the shopper head-on, so this was
  // the most visible instance of the bug, not the least.
  const sharedStripMat = theme.shelving.frame === 'wire-black'
    ? new THREE.MeshStandardMaterial({ color: 0x2e333a, roughness: 0.55, metalness: 0.2 })
    : new THREE.MeshStandardMaterial({ color: 0xd6d0c5, roughness: 0.55, metalness: 0.05 });

  // Back wall shelf geometries reused by the right gold-wall unit below.
  //
  // #130/#131/#132 all touch this same front-face profile, so they're
  // handled together:
  //  - WALL_CLEARANCE holds the whole assembly's back face a hair off the
  //    physical room wall (which sits at local Z=0) so the backing panel
  //    and the wall mesh don't exactly coincide and z-fight (#131).
  //  - NR_TAPER gives the uprights (end panels + dividers) and the shelf
  //    boards a shared, subtle taper — wider at the floor, narrower at the
  //    top shelf (#132) — real furniture detailing, kept small (~0.6"
  //    swing over the 6ft run from the bottom shelf to the top one).
  //  - The divider geometry no longer stops short of the shelf's own front
  //    lip (#130): it used to sit recessed backWallShelfDepth-0.1 deep
  //    while the shelf/end-panel used the full backWallShelfDepth, leaving
  //    a sliver gap at the front edge you could see straight through.
  const WALL_CLEARANCE = NR_WALL_CLEARANCE; // ft — keeps the backing off the room wall plane
  const NR_TAPER = 0.025; // ft — half-swing; ~0.6" wider at the floor than the top shelf
  const NR_TAPER_BOTTOM_Y = WALL_SHELF_HEIGHTS[0];
  const NR_TAPER_TOP_Y = WALL_SHELF_HEIGHTS[WALL_SHELF_HEIGHTS.length - 1];
  const nrTaperT = (yPos: number): number =>
    Math.min(1, Math.max(0, (yPos - NR_TAPER_BOTTOM_Y) / (NR_TAPER_TOP_Y - NR_TAPER_BOTTOM_Y)));
  // Depth (how far a shelf board sticks out from the wall) at a given shelf height.
  const nrDepthAt = (yPos: number): number => backWallShelfDepth + NR_TAPER * (1 - 2 * nrTaperT(yPos));
  // Local Z of a shelf board's own center, given its (tapered) depth.
  const nrCenterZAt = (yPos: number): number => WALL_CLEARANCE + nrDepthAt(yPos) / 2;
  // Local Z of a shelf board's front lip (where the pricing strip/promo tag mount).
  const nrFrontZAt = (yPos: number): number => WALL_CLEARANCE + nrDepthAt(yPos);
  // Full-height upright (end panel / divider) anchor: same back face as the
  // shelves (WALL_CLEARANCE off the wall); the taper itself is baked into
  // the geometry's front-face vertices below, not into this Z offset.
  const NR_ANCHOR_Z = WALL_CLEARANCE + backWallShelfDepth / 2;

  // Tapers the FRONT face (local +Z, the room-facing side) of a full-height
  // upright box: wider at the bottom (world Y = centerY - height/2),
  // narrower at the top, linearly in between. The back face (local -Z,
  // against the wall) is left alone so the taper never digs the upright
  // into the wall behind it.
  const taperUprightFront = (geo: THREE.BoxGeometry, centerY: number) => {
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const z = posAttr.getZ(i);
      if (z > 0) {
        const worldY = posAttr.getY(i) + centerY;
        posAttr.setZ(i, z + NR_TAPER * (1 - 2 * nrTaperT(worldY)));
      }
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  };

  // Uprights (and the backing panel below) span Y 0..8.0 — resting ON the
  // floor. They used to be 8.1 tall centered at 3.95 (Y -0.1..8.0), sinking
  // 0.1 ft through the carpet (user-reported clipping at the unit's foot).
  const NR_PANEL_H = 8.0;
  const NR_PANEL_CY = NR_PANEL_H / 2;
  const backSidePanelGeo = new THREE.BoxGeometry(0.04, NR_PANEL_H, backWallShelfDepth);
  const backDividerGeo = new THREE.BoxGeometry(0.04, NR_PANEL_H, backWallShelfDepth);
  taperUprightFront(backSidePanelGeo, NR_PANEL_CY);
  taperUprightFront(backDividerGeo, NR_PANEL_CY);


  // Left-wall unit shelf width, sized from the ADAPTIVE column count
  // (the layout calc already shrank it to fit behind the side-window
  // ribbon; a hardcoded 36 here would build shelves wider than the stocked
  // columns and poke them into the window zone).
  const leftWallCols = scene.nrLeftWallCols;
  const leftWallShelfWidth = leftWallCols * BOX_SPACING + 1.0;

  // Shared materials for aisle shelving units
  const sharedAisleSignSideMat = new THREE.MeshStandardMaterial({
    // 0.05 roughness made every signboard edge a near-mirror — big flat
    // plastic panels should have a satin sheen, not specular glare.
    color: new THREE.Color(theme.palette.primary), roughness: 0.35, metalness: 0.05
  });

  const wireShelfMat = new THREE.MeshStandardMaterial({
    map: createWireMeshTexture(),
    transparent: true,
    roughness: 0.3,
    metalness: 0.8,
    side: THREE.DoubleSide
  });

  scene.gondolaMaterials = {
    shelf: sharedShelfMat,
    strip: sharedStripMat,
    signSide: sharedAisleSignSideMat,
    wireShelf: wireShelfMat
  };

  // Backing-panel material with the baked per-bay shading (see the
  // backBacking comment inside buildShelfRun). Panel spans Y 0..8.0
  // (resting on the floor); shelf boards at WALL_SHELF_HEIGHTS.
  // MeshStandard for the same reason as sharedShelfMat above: the backing
  // spans the entire New Releases wall — a huge screen area — and the baked
  // bay-shade map does the visual work, not the clearcoat lobe.
  const nrBackingMat = new THREE.MeshStandardMaterial({
    color: 0xf8f2e8, // matches sharedShelfMat's warm off-white
    map: createShelfBayShadeTexture([...WALL_SHELF_HEIGHTS], 0, NR_PANEL_H),
    roughness: 0.65,
    metalness: 0.1,
    roughnessMap: shelfRoughnessTex,
    normalMap: shelfNormalTex,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });

  // Optional real photo-scanned white melamine laminate (ambientCG Plastic013A,
  // CC0). sharedShelfMat keeps its warm off-white tint (color 0xf8f2e8), so the
  // neutral scan reads as satin melamine. The New Releases backing panel shares
  // the shelf normal/roughness objects, so it takes the real normal + roughness
  // too (keeping its own baked bay-shade albedo). A 404 leaves both procedural.
  loadUserAssetSurface('surfaces/store-shelf', (slot, tex) => {
    sharedShelfMat[slot] = tex;
    sharedShelfMat.needsUpdate = true;
    if (slot === 'normalMap' || slot === 'roughnessMap') {
      nrBackingMat[slot] = tex;
      nrBackingMat.needsUpdate = true;
    }
    scene.requestRender();
  }, { repeat: [6, 2], anisotropy: 8 });

  // New Releases wall clasp/strip hardware — the wall fixture's OWN material,
  // not the shared gondola strip: the shared strip's untextured metalness
  // (0.3, or 0.65 gunmetal in the 2000s theme) mirrored the bright env bake
  // across every wall shelf lip, so the clasps read as a self-glowing white
  // line that never responded to local light. Satin painted hardware
  // (matching the interior satin pass: end caps / signage at ~0.55 rough,
  // near-zero metal) takes the troffer light and shelf shadows instead.
  const nrClaspMat = theme.shelving.frame === 'wire-black'
    ? new THREE.MeshStandardMaterial({ color: 0x2e333a, roughness: 0.55, metalness: 0.2 })
    : new THREE.MeshStandardMaterial({ color: 0xd6d0c5, roughness: 0.55, metalness: 0.05 });

  // Build a continuous run of wall shelving of the given length, centered at
  // `centerPos` and rotated about Y. Shelves are built in local space (run
  // spans local X, faces local +Z), so the same builder wraps around corners.
  // `globalColStart` is the ribbon column index of this run's first column
  // (see getNewReleasesSlotTransform's run order), used to skip the section
  // divider that would bisect a double-feature.
  //
  // Every run also hands itself to the topper builder after this loop, which
  // stands one "New Releases" ticket card on each of its sections (bb-1990
  // only — see fixtures/new-release-toppers.ts).
  const nrTopperRuns: NrTopperRun[] = [];
  const buildShelfRun =(length: number, centerPos: THREE.Vector3, rotationY: number, globalColStart: number) => {
    const group = new THREE.Group();

    WALL_SHELF_HEIGHTS.forEach((yPos) => {
      const depth = nrDepthAt(yPos);
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, depth), sharedShelfMat);
      shelf.position.set(0, yPos, nrCenterZAt(yPos));
      shelf.receiveShadow = true;
      shelf.castShadow = true;
      group.add(shelf);
      scene.shelves.push(shelf);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.03, 0.02), nrClaspMat);
      strip.position.set(0, yPos + 0.02, nrFrontZAt(yPos) + 0.01);
      // Lit hardware: without receiveShadow the clasp strip stayed uniformly
      // bright while the boards around it took shading — it read as emissive.
      strip.receiveShadow = true;
      group.add(strip);
      scene.shelves.push(strip);

      if (Math.abs(yPos - 4.7) < 0.01 && scene.promoSignMat && scene.promoSignRedMat) {
        const runCols = Math.floor((length - 1.0) / BOX_SPACING);
        const margin = (length - runCols * BOX_SPACING) / 2;
        const numSections = Math.ceil(runCols / SECTION_COLS);

        for (let s = 0; s < numSections; s += 2) {
          const startCol = s * SECTION_COLS;
          const endCol = Math.min(runCols - 1, s * SECTION_COLS + SECTION_COLS - 1);
          const centerCol = (startCol + endCol) / 2;
          const xCenter = -length / 2 + margin + (centerCol + 0.5) * BOX_SPACING;

          const signGeom = new THREE.BoxGeometry(1.2, 0.3, 0.001);
          const materials = [
            scene.promoSignRedMat,
            scene.promoSignRedMat,
            scene.promoSignRedMat,
            scene.promoSignRedMat,
            scene.promoSignMat,
            scene.promoSignRedMat
          ];
          const signMesh = markSignMesh(new THREE.Mesh(signGeom, materials)); // lit tag, not a glowing decal
          signMesh.position.set(xCenter, yPos, nrFrontZAt(yPos) + 0.021);
          group.add(signMesh);
          scene.shelves.push(signMesh);
        }
      }
    });

    // Solid backing panel behind the shelves. Its own material (not the
    // shared laminate): the map is a baked vertical bounce-occlusion
    // gradient — a soft dark pocket under every shelf board — because the
    // backing is the one surface the sun can't rake and GTAO's contact
    // radius can't reach, so with a flat material it rendered as a single
    // uniform sheet floating behind the cases.
    const backBacking = new THREE.Mesh(new THREE.BoxGeometry(length, NR_PANEL_H, 0.04), nrBackingMat);
    backBacking.position.set(0, NR_PANEL_CY, WALL_CLEARANCE);
    backBacking.receiveShadow = true;
    backBacking.castShadow = true;
    group.add(backBacking);
    scene.shelves.push(backBacking);

    // End panels — lit like the dividers (they had no shadow flags at all,
    // so they rendered as flat uniform slabs that ignored the room light).
    [-length / 2 - 0.02, length / 2 + 0.02].forEach((xEnd) => {
      const panel = new THREE.Mesh(backSidePanelGeo, sharedShelfMat);
      panel.position.set(xEnd, NR_PANEL_CY, NR_ANCHOR_Z);
      panel.receiveShadow = true;
      panel.castShadow = true;
      group.add(panel);
      scene.shelves.push(panel);
    });

    // Vertical dividers every section (6 columns) — aligned with the column
    // boundaries AND the movie-grouping sections so cases never straddle one.
    // Same front-face depth as the shelves/end-panels (#130 — used to sit
    // recessed 0.1ft behind the shelf's own front lip, leaving a gap you
    // could see straight through to the shelf/case behind it).
    const runCols = Math.floor((length - 1.0) / BOX_SPACING);
    const margin = (length - runCols * BOX_SPACING) / 2;
    for (let colDivider = SECTION_COLS; colDivider < runCols; colDivider += SECTION_COLS) {
      // A double-feature spans two sections as ONE display: skip the
      // divider that would bisect it (global boundary = run start + local).
      if (scene.nrSuppressedDividerCols.has(globalColStart + colDivider)) continue;
      const xDiv = -length / 2 + margin + colDivider * BOX_SPACING;
      const div = new THREE.Mesh(backDividerGeo, sharedShelfMat);
      div.position.set(xDiv, NR_PANEL_CY, NR_ANCHOR_Z);
      div.receiveShadow = true;
      div.castShadow = true;
      group.add(div);
      scene.shelves.push(div);
    }

    group.position.copy(centerPos);
    group.rotation.y = rotationY;
    scene.scene.add(group);
    nrTopperRuns.push({
      parent: group,
      length,
      topY: NR_PANEL_H,
      // The uprights taper in toward the top, so the deck the cards stand on
      // is the shelf profile's front lip AT that height, not at the floor.
      frontZ: nrFrontZAt(NR_PANEL_H),
      sideMaterial: sharedShelfMat,
    });
  };

  // Back-wall New Releases runs. Run 1 (far back wall) always exists — with a
  // notch it stops at stepX; with bb_corner === 'none' it spans the whole back
  // wall. The connector side wall (Run 2) and stepped-forward front wall (Run 3)
  // only exist when there's a notch; their lengths are 0 otherwise, so guard
  // them to avoid building zero/negative-length shelf runs.
  const midStepZ = (backWallZ + stepWallZ) / 2;
  buildShelfRun(scene.stepX - scene.nrBackLeftX,
    new THREE.Vector3((scene.nrBackLeftX + scene.stepX) / 2, 0, backWallZ), 0,
    scene.nrLeftWallCols);
  if (scene.hasStep) {
    buildShelfRun(scene.stepDepth,
      new THREE.Vector3(scene.stepX, 0, midStepZ), -Math.PI / 2,
      scene.nrLeftWallCols + scene.nrBackWallColsRun1);
    buildShelfRun(scene.nrBackRightEdgeX - scene.stepX,
      new THREE.Vector3((scene.stepX + scene.nrBackRightEdgeX) / 2, 0, stepWallZ), 0,
      scene.nrLeftWallCols + scene.nrBackWallColsRun1 + scene.nrBackWallColsRun2);
  }

  // LEFT-wall New Releases unit — the START of the ribbon. Back-aligned
  // into the back-left corner behind the side-window ribbon; its col order
  // runs front -> back (ascending local X under rotY = +PI/2), meeting
  // Run 1's leftmost column right at the corner. Same builder as every
  // other wall run: cols ascend along local X and globalColStart is 0, so
  // section dividers and double-feature suppression line up with the slot
  // transforms. Windows take priority (user direction): when the layout
  // calc zeroed its columns (the side ribbon claimed the wall), skip it —
  // the back-wall runs carry New Releases alone.
  const leftWallXCenter = STORE_CENTER_X - storeWidth / 2 + NR_LEFT_UNIT_STANDOFF;
  const leftWallZCenter = scene.nrLeftWallUnitCenterZ();
  if (scene.nrLeftWallCols > 0) {
    buildShelfRun(leftWallShelfWidth,
      new THREE.Vector3(leftWallXCenter, 0, leftWallZCenter), Math.PI / 2, 0);
  }

  // Section markers on top of every New Releases wall run: the 1990 store
  // names this wall with ticket cards, not paint (the wall itself carries only
  // the blue/gold stripe on that theme). No-ops on every other era, which name
  // the same wall through fixtures/signage.ts instead.
  buildNewReleaseToppers(nrTopperRuns).forEach((card) => scene.shelves.push(card));

  // 4. Freestanding aisle gondolas: structure + signage for every planned
  // unit (see shelving.ts — swap buildAisleShelving for a different
  // shelving-unit style).
  // Staff-picks genre endcaps are computed BEFORE the shelving build so each
  // hosting run can skip its own blue front cap — the endcap's back panel
  // mounts on the exact same plane and the two z-fight (feedback pin 010).
  // COLLECTION endcaps reserve their ends FIRST — capped at half the store's
  // run ends (collectionEndcapReservation), so the staff-picks deal that
  // follows always keeps the majority. None build when the media server
  // surfaced no collections: that is the gate, not a failure (see
  // fixtures/collection-endcap.ts).
  const collectionEndcaps = collectionEndcapPlacements(scene);
  const endcapHostLineIds = new Set<number>();
  for (const p of collectionEndcaps) {
    if (typeof p.options?.lineId === 'number') endcapHostLineIds.add(p.options.lineId);
  }
  const endcapPlacements = scene.staffPickEndcapPlacements(endcapHostLineIds);
  for (const p of endcapPlacements) {
    if (typeof p.options?.lineId === 'number') endcapHostLineIds.add(p.options.lineId);
  }
  buildAisleShelving({
    scene: scene.scene,
    plan: scene.plan,
    libraries: scene.libraries,
    materials: {
      shelf: sharedShelfMat,
      strip: sharedStripMat,
      signSide: sharedAisleSignSideMat,
      wireShelf: wireShelfMat
    },
    addCollider: (obj) => scene.shelves.push(obj),
    registerEndCap: (mesh) => scene.libraryEndCaps.push(mesh),
    // The clasp is a promise that asking gets you somewhere — only built
    // when the Jellyseerr integration is there to back it (demo/harness
    // count as synthetic). No clasps also empties the whole call-button
    // flow (hover/E/cursor selection, localRecommendPool) in one place.
    registerClasp: isJellyseerrAvailable()
      ? (placement) => scene.shelfClasps.add(placement)
      : undefined,
    suppressFrontCapLineIds: endcapHostLineIds,
  });

  // 4. (Mirrored Pillars removed)

  // 4.5 Add Dynamic Custom Fixtures
  // T18: the game section only joins the fixture list when Romm actually
  // returned stock -- unconfigured/unreachable => scene.gameMovies is [], no
  // fixture. (Discovery suggestions used to add a rack here too; they now
  // shelve inline with the regular stock — see the constructor's merge.)
  const fixturePlacements = [
    ...DEFAULT_FIXTURE_PLACEMENTS,
    // Promo floor stands: the third one exists only in a store deep enough for
    // it (see promoStandPlacements), and any stand whose campaign chain comes
    // up empty builds nothing.
    ...promoStandPlacements(scene.backWallZ),
    // Counter validator rects + counter-anchored props follow the active
    // counter SHAPE (shield or usquare) — see counterAnchoredPlacements.
    ...counterAnchoredPlacements(scene.storefrontSpec.counterShape),
    ...(scene.gameMovies.length > 0 ? gameSectionPlacements(scene.getStoreWidth()) : []),
    // Staff-picks genre endcaps at aisle-run ends — computed above, before
    // the shelving build; present only when the watch-history engine
    // produced stock.
    ...endcapPlacements,
    // ...and the franchise-collection ends, on whatever run ends were left.
    ...collectionEndcaps,
  ];
  scene.slottedFixtures = [];
  scene.candyDisplays = [];
  // Collected here (not read back off scene.slottedFixtures/candyDisplays
  // afterwards) because most fixture kinds — CandyDisplay aside — aren't
  // kept in any array once this loop ends; this is the only point with a
  // live reference to every fixture instance.
  const fixtureFootprints: Footprint[] = [];
  // Clerk stand points at browsable fixtures: one per ~4.5 ft of each face
  // of every slotted fixture's footprint, just off the face and turned to
  // face it (see StoreClerk's ClerkDest) — replaces the old single
  // fixture-centre anchor that parked her inside/facing away from stands.
  const clerkFloorDests: ClerkDest[] = [];
  const pushFixtureStandDests = (id: string, fp: Footprint) => {
    const cos = Math.cos(fp.yaw), sin = Math.sin(fp.yaw);
    const standOff = 1.25;
    // The footprint's two local axes in world space (layout-validator
    // convention), each with the half-extent along it and the length of the
    // faces it is normal to.
    const sides = [
      { nx: cos, nz: -sin, half: fp.w / 2, tx: sin, tz: cos, len: fp.d },
      { nx: sin, nz: cos, half: fp.d / 2, tx: cos, tz: -sin, len: fp.w },
    ];
    sides.forEach((s, si) => {
      for (const sign of [1, -1]) {
        const count = Math.max(1, Math.round(s.len / 4.5));
        for (let k = 0; k < count; k++) {
          const t = ((k + 0.5) / count - 0.5) * s.len;
          clerkFloorDests.push({
            x: fp.cx + sign * s.nx * (s.half + standOff) + s.tx * t,
            z: fp.cz + sign * s.nz * (s.half + standOff) + s.tz * t,
            yaw: Math.atan2(-sign * s.nx, -sign * s.nz), // face the fixture
            kind: 'stand',
            key: `stand:${id}:${si}:${sign}:${k}`,
          });
        }
      }
    });
  };
  fixturePlacements.forEach(placement => {
    const fixture = createFixture(placement, scene.fixtureContext());
    fixture.build();
    const footprint = fixture.getFootprint?.();
    if (footprint) fixtureFootprints.push(footprint);
    const slotted = 'getSlots' in fixture && typeof (fixture as any).getSlots === 'function'
      ? (fixture as SlottedFixture) : null;
    // A fixture that DECLINED to build is not on the floor: an era-gated POP
    // kit outside its period, a promo stand whose campaign chain came up
    // empty, a bargain bin with nothing to dump on opening day. Each reports
    // no slots AND no footprint. Keep those out of the browsable set entirely
    // — the entrance overview builds a floating cursor for every entry here,
    // so an unbuilt one parked a ticket over bare carpet (the empty
    // opening-day store showed "PROMO-STAND-BACK" hanging over nothing).
    if (slotted && (slotted.getSlots().length > 0 || footprint)) {
      scene.slottedFixtures.push(slotted);
      // No auto stand-points around an endcap: it abuts its aisle run, so
      // the ringed dests would park the clerk against (or inside) the
      // shelving it touches — she approaches it like the aisle itself.
      if (footprint && !isEndcapKind(placement.kind)) {
        pushFixtureStandDests(placement.id, footprint);
      }
    }
    if (fixture instanceof CandyDisplay) {
      scene.candyDisplays.push(fixture);
    }
    // A jar switched off by settings still builds a fixture object; it just
    // has no meshes and no hit targets, so keep it out of the interactive set.
    if (fixture instanceof TipJar && fixture.hasArt()) {
      scene.tipJars.push(fixture);
    }
  });
  scene.validateStoreLayout(fixtureFootprints, storeWidth, backWallZ);

  // 5. (Movie Poster Marquee removed)

  // --- Contiguous chrome + mirror cornice framing the entire ceiling ---
  // The 2000 store drops the mirrored perimeter cornice entirely (user): its
  // periwinkle room reads as a plain drop-ceiling shop, no chrome border.
  const is2000Store = getActiveTheme().id === 'bb-2000';
  if (!is2000Store) scene.buildCeilingFrame(storeWidth, backWallZ);

  // --- T13: optional old-cinema marquee bulbs (cornice rim + window posters) ---
  // Marquee bulbs are off in the 2000 store (user).
  if (!is2000Store) scene.buildMarqueeBulbs(storeWidth, backWallZ);

  // --- Front entrance/exit vestibule + walk-in checkout counter ---
  scene.entrance = new EntranceCheckout(scene.fixtureContext());
  // Walking up to the vestibule doors rings the shop bell (feedback follow-up:
  // the chime previously only fired on the launch/return teleports, so
  // physically walking through the doors was silent).
  scene.entrance.onDoorsOpen = () => scene.playDoorChime();
  scene.entrance.build();

  // Named 'counter-top' mount surface (src/mount-surfaces.ts), anchored off
  // EntranceCheckout's real counter geometry (top height + spine z) rather
  // than a second hardcoded copy of 2.82. The inner counter is actually a
  // bent V (see counter.ts) — this registers one flat rectangle centred on
  // its centreline (x = cx) spanning its real front-edge extent (cx ± 6,
  // matching counter.ts's pFront0X/pFront2X), approximating rather than
  // exactly tracing both angled arms. Only registered here (after build())
  // because the real geometry doesn't exist before then — see period-fixtures.ts's
  // TapeRewinder/TapeCleanerDisplay for the consumer this can't reach.
  const counterAnchor = scene.entrance?.getCounterTopAnchor();
  if (counterAnchor) {
    const counterRunHalfWidth = 6.0;
    scene.surfaces.register({
      id: 'counter-top',
      origin: {
        x: counterAnchor.x - counterRunHalfWidth,
        y: counterAnchor.y,
        z: counterAnchor.z - counterAnchor.depth / 2,
      },
      uDir: { x: 1, y: 0, z: 0 },
      vDir: { x: 0, y: 0, z: 1 },
      normal: { x: 0, y: 1, z: 0 },
      width: counterRunHalfWidth * 2,
      height: counterAnchor.depth,
    });
  }

  // --- Ceiling-hung CRT TVs playing a family movie ---
  scene.ambientTvs = new AmbientTvs(scene.fixtureContext());
  scene.ambientTvs.build();

  // --- Store Clerk (billboard sprite) ---
  // Her nav grid is built from the same ground-plan rectangles the layout
  // validator checks, plus the architecture the validator doesn't see as
  // fixtures: the exact counter band/inner island (from the built counter
  // geometry — the static counter-band config footprints trim their mitred
  // corners, which would read as fake walk-through gaps here, so they're
  // excluded in favour of the exact ones), the vestibule chamber, and the
  // stepped back corner.
  const entranceClerkNav = scene.entrance.getClerkNav();
  scene.clerkNavRects = [
    ...fixtureFootprints.filter(f => !f.label.startsWith('structure:counter-band')),
    ...scene.plan.getUnitFootprints(),
    // She may hug her own counter tighter than floor fixtures — the band's
    // 2.2 ft walk-through gap must stay wider than two clearance radii.
    ...(entranceClerkNav?.footprints ?? []).map(f =>
      f.label.startsWith('structure:counter-') ? { ...f, clearance: 0.5 } : f),
  ];
  {
    const rightEdge = STORE_CENTER_X + storeWidth / 2;
    if (scene.stepDepth > 0 && rightEdge - scene.stepX > 0) {
      scene.clerkNavRects.push({
        label: 'structure:stepped-corner', kind: 'structure',
        cx: (scene.stepX + rightEdge) / 2, cz: backWallZ + scene.stepDepth / 2,
        w: rightEdge - scene.stepX, d: scene.stepDepth, yaw: 0,
      } as NavRect);
    }
  }
  scene.clerkNavGrid = new ClerkNavGrid(
    { minX: STORE_CENTER_X - storeWidth / 2, maxX: STORE_CENTER_X + storeWidth / 2, minZ: backWallZ, maxZ: FRONT_GLASS_Z },
    scene.clerkNavRects,
    // Wall margin > clearance: the back/right walls carry the New Releases
    // shelving, which has no floor footprint of its own.
    { cellSize: 0.5, clearance: 0.8, wallMargin: 1.7 },
  );

  // Baked floor AO (docs/lightmap-pipeline.md Phase 1): project the same
  // ground-plan rectangles the clerk nav just consumed into the carpet's
  // aoMap — geometry-only, so no sun reroll / theme / day-night change
  // ever invalidates it. The vestibule chamber rect is excluded: it
  // represents a walkable glass box, not a solid base.
  if (scene.floorMat) {
    scene.floorAOTex?.dispose();
    scene.floorAOTex = bakeFloorAO(
      scene.clerkNavRects.filter(f => !(f.label ?? '').includes('vestibule')),
      { minX: STORE_CENTER_X - storeWidth / 2, maxX: STORE_CENTER_X + storeWidth / 2, minZ: backWallZ, maxZ: FRONT_GLASS_Z },
    );
    scene.floorMat.aoMap = scene.floorAOTex;
    scene.floorMat.aoMapIntensity = 0.85;
    scene.floorMat.needsUpdate = true;
  }
  // Wall-shelf stocking spots (back + right new-release walls) so her
  // destinations aren't limited to freestanding fixtures (#50) — placed
  // within reach of the wall shelves, facing them.
  const clerkWallZ = scene.plan.backWallZ + 2.2;
  const clerkHalfW = scene.plan.getStoreWidth() / 2 - 2.4;
  for (const fx of [-0.6, -0.2, 0.2, 0.6]) {
    clerkFloorDests.push({
      x: STORE_CENTER_X + fx * clerkHalfW, z: clerkWallZ,
      yaw: Math.PI, kind: 'wall', key: `wall:back:${fx}`,
    });
  }
  for (const fz of [0.25, 0.55]) {
    clerkFloorDests.push({
      x: STORE_CENTER_X + clerkHalfW, z: scene.plan.backWallZ * fz,
      yaw: Math.PI / 2, kind: 'wall', key: `wall:right:${fz}`,
    });
  }
  // Opening day (#41): no stock, no staff. The empty shell is a store that has
  // not taken delivery yet — a clerk working the floor of it reads as a bug,
  // and she has nothing to stock, recommend or check out (owner call
  // 2026-08-09). She arrives with the first shipment, i.e. with the very next
  // scene build, since a stocked store rebuilds this whole function.
  const storeHasStock = scene.libraries.some((lib) => lib.movies.length > 0)
    || scene.gameMovies.length > 0;
  if (storeHasStock) {
    const clerk = new StoreClerk(scene.plan, clerkFloorDests, scene.shelvingUnits, {
      // Only offer to chat while the player is free-roaming the floor.
      isAvailable: () => scene.mode === 'walk-around',
      getMovies: () => {
        const map = new Map<string, Movie>();
        scene.libraries.forEach((lib) => lib.movies.forEach((m) => map.set(m.id, m)));
        return Array.from(map.values());
      },
      getLocalContext: () => scene.localRecommendPool(),
      // "Order it for me": the clerk-dialog twin of the inspect-view request
      // press — the shared orderTitle flow, with her toast muted because
      // she's already talking to you in the dialog.
      onRequest: async (movie) => {
        const ok = await scene.orderTitle(movie, { clerkLine: false });
        if (ok) scene.onConsoleLog(`[Clerk] Ordered "${movie.title}" through Jellyseerr.`, 'system');
        return ok;
      },
      // Route through main.ts's openSearch() so ui.isSearchOpen is set and Back
      // can close it; the bare enterSearchMode() fallback is for hosts that
      // wire no handler (the harness), where a stuck dock is harmless.
      onSearch: () => (scene.onOpenSearch ? scene.onOpenSearch() : scene.enterSearchMode()),
      onLog: (msg) => scene.onConsoleLog(msg, 'system'),
      onBlip: () => retailAudio.playBoxPickup(),
    },
    scene.clerkNavGrid,
    entranceClerkNav
      ? { register: entranceClerkNav.register, terminals: entranceClerkNav.terminals }
      : null);
    // AO-excluded: she's a billboard sprite + blob-shadow plane — screen-space
    // AO on a flat sprite is a halo artifact, and excluding her means her
    // roaming never invalidates the frozen AO term (see the GTAO wrapper).
    // aoBlendMask: also knock the AO *blend* out of her pixels each frame, or
    // the shelf shadows behind her get multiplied straight across the sprite.
    clerk.group.userData.excludeFromSSAO = true;
    clerk.group.userData.aoBlendMask = true;
    scene.scene.add(clerk.group);
    scene.clerk = clerk;
  }

  // --- Dynamic Store Signage system ---
  const getLineGenreName = (lineId: number): string => {
    const lineUnits = scene.plan.shelvingUnits.filter(u => u.lineId === lineId);
    if (lineUnits.length === 0) return 'MOVIES';
    const firstUnit = lineUnits[0];
    const lib = scene.libraries[firstUnit.libraryIdx];
    if (!lib) return 'MOVIES';
    const layout = scene.plan.layoutFor(firstUnit.libraryIdx);
    if (!layout.categorized) {
      return lib.name;
    }
    const labels: string[] = [];
    lineUnits.forEach(u => {
      (['front', 'back'] as const).forEach(side => {
        // Labels are keyed by GLOBAL section index; each unit face holds
        // one entry block = two sections (see StorePlan.blockIndexOf).
        const block = scene.plan.blockIndexOf(u.libraryIdx, u.unitIdxInLibrary, side);
        for (let s = 0; s < 2; s++) {
          const label = layout.sectionLabels.get(String(block * 2 + s));
          if (label) labels.push(label);
        }
      });
    });
    if (labels.length === 0) return lib.name;
    const counts = new Map<string, number>();
    labels.forEach(l => counts.set(l, (counts.get(l) ?? 0) + 1));
    let bestLabel = labels[0];
    let maxCount = 0;
    counts.forEach((count, label) => {
      if (count > maxCount) {
        maxCount = count;
        bestLabel = label;
      }
    });
    return bestLabel;
  };

  const lineIds = Array.from(new Set(scene.plan.shelvingUnits.map(u => u.lineId)));
  // Each hanging sign turns its broad face toward the middle of the checkout
  // counter (centreline x=11, z=deskApexZ) so a customer standing at the
  // register reads every aisle sign head-on.
  const counterMidZ = scene.deskApexZ();
  const ceilingSlots: SignSlot[] = lineIds.map(lineId => {
    const lineUnits = scene.plan.shelvingUnits.filter(u => u.lineId === lineId);
    const xCenterAvg = lineUnits.reduce((sum, u) => sum + u.xCenter, 0) / lineUnits.length;
    const zCenterAvg = lineUnits.reduce((sum, u) => sum + scene.plan.aisleZCenter(u), 0) / lineUnits.length;
    const genreName = getLineGenreName(lineId);
    return {
      id: `ceiling-nav-line-${lineId}`,
      category: 'ceiling-nav',
      pos: new THREE.Vector3(xCenterAvg, 9.75, zCenterAvg),
      yaw: Math.atan2(STORE_CENTER_X - xCenterAvg, counterMidZ - zCenterAvg),
      genreName
    };
  });
  // GAMES wedge (owner, 2026-08-09): the games department gets its own
  // ceiling-nav hanger, centered over the game-section units (slotted
  // fixtures are installed earlier in this same build pass).
  const gameUnits = scene.slottedFixtures.filter(f => f.placement?.id?.startsWith('game-section'));
  if (gameUnits.length) {
    const gx = gameUnits.reduce((s, f) => s + f.placement.position.x, 0) / gameUnits.length;
    const gz = gameUnits.reduce((s, f) => s + f.placement.position.z, 0) / gameUnits.length;
    ceilingSlots.push({
      id: 'ceiling-nav-games-dept',
      category: 'ceiling-nav',
      pos: new THREE.Vector3(gx, 9.75, gz),
      yaw: Math.atan2(STORE_CENTER_X - gx, counterMidZ - gz),
      genreName: 'GAMES'
    });
  }

  const signageSlots: SignSlot[] = [
    ...ceilingSlots,
    ...scene.entrance.getSignAnchors(),
    {
      id: 'wall-newrelease-back-left',
      category: 'wall-newrelease',
      pos: new THREE.Vector3((scene.nrBackLeftX + scene.stepX) / 2, 9.4, backWallZ),
      yaw: 0,
      length: scene.stepX - scene.nrBackLeftX,
      localZ: 0.08,
      fit: true // bounded left by the window-corner sliver, right by the step jut
    },
    {
      id: 'wall-newrelease-back-right',
      category: 'wall-newrelease',
      pos: new THREE.Vector3((scene.stepX + scene.nrBackRightEdgeX) / 2, 9.4, stepWallZ),
      yaw: 0,
      length: scene.nrBackRightEdgeX - scene.stepX,
      localZ: 0.08,
      fit: true // short stepped-front run bounded by the corner jut and right wall
    },
    {
      // #41 back-wall coverage: the connector wall of the stepped corner
      // (runs in Z at stepX, faces -X — same face its shelf run uses) had
      // shelving but no sign band. Same slot mechanics as the other two
      // back-wall runs; short length takes the fitted single-sign fallback.
      id: 'wall-newrelease-back-step',
      category: 'wall-newrelease',
      pos: new THREE.Vector3(scene.stepX, 9.4, midStepZ),
      yaw: -Math.PI / 2,
      length: scene.stepDepth,
      localZ: 0.08,
      fit: true // bounded by the two corners of the notch
    },
    // The LEFT-wall run — the start of the New Releases ribbon. Position/
    // extent line up with the actual left-wall shelving (adaptive column
    // count, same X/Z/rotation used for its movie-box placement). No slot
    // at all when the side ribbon claimed the wall and the unit wasn't
    // built.
    ...(scene.nrLeftWallCols > 0 ? [{
      id: 'wall-newrelease-left-wall',
      category: 'wall-newrelease',
      pos: new THREE.Vector3(leftWallXCenter, 9.4, leftWallZCenter),
      yaw: Math.PI / 2,
      length: leftWallShelfWidth,
      localZ: 0.1
    }] : []),
    // (The red "$3 RENTAL / 2 EVENING NEW RELEASE" card that used to hang
    // here, in front of the New Releases back wall over the floor displays,
    // was removed entirely by owner request — GH #2. The slot construction
    // and its catalog entry are gone too, not just nulled in signage-config.)
    //
    // The yellow "INCREDIBLE VALUES / PREVIOUSLY VIEWED MOVIES" card
    // over the bargain bin (our previously-viewed tub). The bin RESOLVES its
    // own position at build time (relativeToBackWall + clamp — see
    // bargain-bin.ts), so read the built fixture's footprint, not the raw
    // config placement. Under the cash-wrap soffit the wires shorten to the
    // dropped lid instead of stabbing through it.
    ...(() => {
      const bin = fixtureFootprints.find(f => f.label.startsWith('fixture:bargain-bin'));
      if (!bin) return [] as SignSlot[];
      const underSoffit = pointInSoffit(bin.cx, bin.cz, soffitPoly);
      const hangCeil = underSoffit ? frontSoffitY(ceilingY) : ceilingY;
      return [{
        id: 'promo-previously-viewed',
        category: 'ceiling-promo',
        pos: new THREE.Vector3(bin.cx, hangCeil - 4.0, bin.cz),
        yaw: 0,
        ceilingY: hangCeil
      }] as SignSlot[];
    })()
  ];

  buildSignage(scene.fixtureContext(), signageSlots, scene.activeSignageObjects);

  // bb-1990 store fabric: the blue/yellow wall stripe riding near the top of
  // EVERY wall of the sales floor (see wall-stripe-1990.ts) — it reads the
  // room's own wall line, not the wall-bay slot set. Pure paint on a plain
  // wall; no lettering competes with it on this theme. No-ops on every other
  // theme.
  buildWallStripe1990(scene);

  // 1993 checkout dressing — VFD pole display, balloons, HOT PIX boxes,
  // receipt printer, hurricane standee, RENT A GAME card display (see
  // fixtures/counter-props-93.ts). After buildSignage: its group registers in
  // activeSignageObjects, which buildSignage clears at ITS start.
  buildCounterProps93(scene);

  // 1993 storefront dressing — QUIK DROP window vinyl, RETURN BY MIDNIGHT
  // posters, letterboard hours sign, EAS pedestals (see
  // fixtures/storefront-dressing-93.ts).
  buildStorefrontDressing93(scene);

  // Era campaign banner on the front glass (bb-2000 theme; sign-lab pilot —
  // see fixtures/storefront-campaign-poster.ts).
  buildStorefrontCampaignPoster(scene);

  // The camera the library-select "security cam" view shoots from (see
  // fixtures/security-camera-93.ts). Mounts to the dropped soffit lid when
  // its spot falls under the cash-wrap soffit.
  buildSecurityCamera93(scene, (px, pz) =>
    pointInSoffit(px, pz, soffitPoly) ? frontSoffitY(ceilingY) : ceilingY);

  // 2012 MEMBERSHIP SERVICES die-cut oval over the checkout counter (see
  // fixtures/membership-oval-hanger.ts) — same soffit-aware hang height.
  buildMembershipOvalHanger(scene, (px, pz) =>
    pointInSoffit(px, pz, soffitPoly) ? frontSoffitY(ceilingY) : ceilingY);

  // (The 2006 MOVIES IN THE MIDDLE / 99c two-tier hanger was wired over the
  // centre walkway here on 2026-08-02 and UNWIRED the same day: the owner saw
  // it in situ and called it "placed too high ... I don't think we need to
  // place this anywhere in the store as of now". The asset stays approved and
  // on disk (public/user-assets/fixtures/movies-middle-99-hanger/, with its
  // NOTES.md measurements); only the store placement is withdrawn. Re-wiring it
  // means restoring fixtures/movies-middle-hanger.ts from git history — see
  // commit df0a9ee — and deciding a lower hang height first.)

  // 2004-2008 REWARDS-relaunch JOIN TODAY riser cards, clipped to every
  // entrance-facing aisle-run end cap an endcap didn't claim (see
  // fixtures/join-today-rewards-riser.ts). The endcap reservation set is the
  // same one buildAisleShelving used to suppress those runs' front caps.
  buildJoinTodayRewardsRisers(scene, endcapHostLineIds);

  // 2007 SUMMER campaign shelf-edge talker, clipped into every aisle-shelf
  // label channel (see fixtures/summer-sequels-shelf-strip.ts). Double-gated:
  // the 2008 pop period AND the summer months on the promo calendar.
  buildSummerSequelsShelfStrips(scene);

  // 2008 games-bay promo pair — "what's NEW" pylon at each game run's aisle
  // mouth plus the "GAME RENTALS 2 for $10" shelf-edge strip (see
  // fixtures/game-rentals-2for10-signs.ts), and the 2009 pre-owned/pre-order
  // slat boards on the department's outward panel (see
  // fixtures/preowned-preorder-games-signs.ts). Both stand down when the VIDEO
  // GAMES department didn't build.
  buildGameRentals2For10Signs(scene);
  buildPreownedPreorderGamesSigns(scene);

  // Every sign in the store is now built; check none of them will read as
  // self-lit. A sign that skips receiveShadow keeps full brightness while the
  // fixture face behind it goes dark, which looks like the card is GLOWING —
  // and only on the faces the room's lights miss, so it is easy to ship
  // without noticing (it took a user report on the bargain bins and the floor
  // collection displays). Warn loudly rather than silently glow.
  const signProblems = auditSignMeshes(scene.scene);
  if (signProblems.length) {
    console.warn(`[signage] ${signProblems.length} sign(s) will read as self-lit:\n  ${signProblems.join('\n  ')}`);
  }

  // NOTE: this used to end by overwriting scene.environment with a PMREM of a
  // flat canvas gradient — which silently discarded the RoomEnvironment IBL set
  // up in initThree() and left the whole room lit by a featureless gradient (no
  // color bleed, no directional ambient, gradient-only reflections). The real
  // environment is now baked from the store itself in bakeEnvironment(), called
  // from the constructor once the scene exists.
}

export function validateStoreLayout(scene: StoreScene, fixtureFootprints: Footprint[], storeWidth: number, backWallZ: number) {
  const bounds = {
    minX: STORE_CENTER_X - storeWidth / 2,
    maxX: STORE_CENTER_X + storeWidth / 2,
    minZ: backWallZ,
    maxZ: FRONT_GLASS_Z, // front glass
  };
  const footprints = [...fixtureFootprints, ...scene.plan.getUnitFootprints()];
  const violations = validateLayout(footprints, bounds);
  violations.forEach((v) => {
    const pair = v.b ? ` <-> ${v.b}` : '';
    const line = `[layout] ${v.severity.toUpperCase()} ${v.a}${pair}: ${v.message}`;
    if (v.severity === 'error') console.error(line);
    else console.warn(line);
  });
  (window as any).__layoutViolations = violations;
}

export function buildCeilingFrame(scene: StoreScene, storeWidth: number, backWallZ: number) {
  const ceilY = scene.ceilingY;
  // The cornice keeps a 2 ft standoff from every wall (and from the stepped
  // corner and the vestibule glass, below) so the chrome body floats clear
  // of the shell instead of touching or clipping it. Shared with the
  // ceiling tile/troffer grid (buildStore) so tiles stay clear of this
  // whole intrusion — see CORNICE_WALL_GAP/CORNICE_BAND.
  const WALL_GAP = CORNICE_WALL_GAP;
  const wallLeft = STORE_CENTER_X - storeWidth / 2;
  const wallRight = STORE_CENTER_X + storeWidth / 2;
  const wallFront = FRONT_GLASS_Z;
  const leftEdge = wallLeft + WALL_GAP;
  const rightEdge = wallRight - WALL_GAP;
  const zFront = wallFront - WALL_GAP;
  const zBack = backWallZ + WALL_GAP;
  const drop = CORNICE_DROP; // how far the cornice body hangs below the ceiling
  const band = CORNICE_BAND; // horizontal depth of the cornice
  // Height of the mirror band on the inner face. 1.9 → 2.3 with the
  // shallower tilt below: on the narrower ring (feedback/044) the old short,
  // steeply-tilted strip went edge-on at wall-grazing views and the band
  // read as a dead dark chrome face down the whole run.
  const mirrorH = 2.3;
  const mirrorY = ceilY - drop * 0.5;
  const innerDepth = (zFront - zBack) - 2 * band; // left/right runs tuck between front/back

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd6dbe2, metalness: 1.0, roughness: 0.12, envMapIntensity: 1.0
  });

  // Chrome BODY: one mitred ring strip extruded from the cornice's plan
  // polyline, instead of the old per-run boxes + oversize square "weld"
  // patches at the stepped-corner seams. The boxes met the rotated diagonal
  // in axis-aligned overlaps, and the welds (band*2 squares) poked their
  // corners out past both faces — the "jutting out silver parts" of
  // feedback/043. An extruded strip mitres every corner by construction:
  // the runs meet in clean plane joins at whatever obtuse angle the plan
  // turns, and there is nothing extra to jut.
  const buildBodyRing = (outer: { x: number; z: number }[]) => {
    const interior = { x: STORE_CENTER_X, z: (zFront + zBack) / 2 };
    // Per-segment inward normal (toward the store interior).
    const segN: { x: number; z: number }[] = [];
    for (let i = 0; i < outer.length - 1; i++) {
      const ux = outer[i + 1].x - outer[i].x, uz = outer[i + 1].z - outer[i].z;
      const len = Math.hypot(ux, uz) || 1;
      let nx = uz / len, nz = -ux / len;
      const midx = (outer[i].x + outer[i + 1].x) / 2, midz = (outer[i].z + outer[i + 1].z) / 2;
      if (nx * (interior.x - midx) + nz * (interior.z - midz) < 0) { nx = -nx; nz = -nz; }
      segN.push({ x: nx, z: nz });
    }
    // Inner polyline: segment lines offset by `band`, adjacent lines
    // intersected for the mitre; square caps at the two open ends.
    const inner: { x: number; z: number }[] = [];
    for (let i = 0; i < outer.length; i++) {
      const prev = i > 0 ? i - 1 : null, next = i < segN.length ? i : null;
      if (prev === null || next === null) {
        const n = segN[prev ?? next!];
        inner.push({ x: outer[i].x + n.x * band, z: outer[i].z + n.z * band });
        continue;
      }
      const nA = segN[prev], nB = segN[next];
      const a0 = { x: outer[i - 1].x + nA.x * band, z: outer[i - 1].z + nA.z * band };
      const b0 = { x: outer[i].x + nB.x * band, z: outer[i].z + nB.z * band };
      const dA = { x: outer[i].x - outer[i - 1].x, z: outer[i].z - outer[i - 1].z };
      const dB = { x: outer[i + 1].x - outer[i].x, z: outer[i + 1].z - outer[i].z };
      const det = dA.x * -dB.z - dA.z * -dB.x;
      if (Math.abs(det) < 1e-6) {
        inner.push(b0); // collinear runs — no corner
        continue;
      }
      const t = ((b0.x - a0.x) * -dB.z - (b0.z - a0.z) * -dB.x) / det;
      inner.push({ x: a0.x + dA.x * t, z: a0.z + dA.z * t });
    }
    const shape = new THREE.Shape();
    shape.moveTo(outer[0].x, outer[0].z);
    for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i].x, outer[i].z);
    for (let i = inner.length - 1; i >= 0; i--) shape.lineTo(inner[i].x, inner[i].z);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: drop, bevelEnabled: false });
    // Shape (x, y=plan z) extruded along +z → rotateX(+90°) maps the
    // extrusion to hang straight down from the ceiling plane.
    geo.rotateX(Math.PI / 2);
    geo.translate(0, ceilY, 0);
    const body = new THREE.Mesh(geo, chromeMat);
    body.castShadow = true;
    body.receiveShadow = true;
    scene.scene.add(body);
    scene.shelves.push(body);
  };

  // edge: inset mirror plane using Reflector (the chrome body is the ring above).
  const addEdge = (
    mirrorW: number, mirrorPos: THREE.Vector3, mirrorRotY: number
  ) => {
    const group = new THREE.Group();

    // Short runs (stepped-corner notch, slivers beside the vestibule) can
    // leave no room for a mirror once the corner tucks are subtracted.
    if (mirrorW < 0.75) {
      scene.scene.add(group);
      scene.shelves.push(group);
      return;
    }

    const tiltAngle = 14 * Math.PI / 180; // downward tilt (20° went edge-on at grazing views)
    const localZOffset = (mirrorH / 2) * Math.sin(tiltAngle);

    // Software GL: a live Reflector re-renders the entire scene per mirror —
    // several extra full draw-call replays per boot that SwiftShader pays in
    // CPU. A static chrome plane keeps the band's look at zero render cost.
    // WebKitGTK pays the replay too (~14ms blocking per refresh), so it
    // takes the same static plane.
    if (!liveMirrorsAllowed(scene)) {
      const still = new THREE.Mesh(new THREE.PlaneGeometry(mirrorW, mirrorH), chromeMat);
      const stillPos = mirrorPos.clone();
      stillPos.x += localZOffset * Math.sin(mirrorRotY);
      stillPos.z += localZOffset * Math.cos(mirrorRotY);
      still.position.copy(stillPos);
      still.rotation.order = 'YXZ';
      still.rotation.y = mirrorRotY;
      still.rotation.x = tiltAngle;
      group.add(still);
      scene.scene.add(group);
      scene.shelves.push(group);
      return;
    }

    // Reflection resolution (F8 pin 028 — "this is ugly and messed up", filed
    // on the smeared, stair-stepped strip this band showed above the cornice):
    // a fixed 512x512 target stretched over a 20:1 band is the blocky smear in
    // that pin, and headless was pinned at 64 regardless of quality, so no
    // screenshot could gate a fix. reflectorTargetSize derives it from the real
    // drawing buffer instead — see store-mirrors.ts.
    const tex = reflectorTargetSize(scene.renderer);

    const mirror = new Reflector(new THREE.PlaneGeometry(mirrorW, mirrorH), {
      clipBias: 0.003,
      textureWidth: tex.w,
      textureHeight: tex.h,
      color: 0xffffff
    });
    
    // Calculate adjusted mirror position to prevent clipping at the bottom edge.
    const adjustedMirrorPos = mirrorPos.clone();
    adjustedMirrorPos.x += localZOffset * Math.sin(mirrorRotY);
    adjustedMirrorPos.z += localZOffset * Math.cos(mirrorRotY);
    
    mirror.position.copy(adjustedMirrorPos);
    mirror.rotation.order = 'YXZ';
    mirror.rotation.y = mirrorRotY;
    mirror.rotation.x = tiltAngle;
    group.add(mirror);

    scene.scene.add(group);
    scene.shelves.push(group);
  };

  // The cornice follows the real wall line: the stepped back-right corner
  // (walls at x = stepX and z = stepZ) and the entrance vestibule (a
  // floor-to-ceiling glass box at 11 +- vestHalfW, protruding in from the
  // front glass) would otherwise slice straight through the chrome + mirror.
  // With no stepped corner (bb_corner 'none', stepDepth 0) the back-right
  // wall is flat: the back run spans the full width and meets the right run
  // in a plain square corner, exactly like the front/left pair. The diagonal
  // seam math below would degenerate to 0/0 = NaN there (NaN-width mirror
  // geometry = the whole back-wall mirror band silently invisible), so the
  // diagonal run and its seam points only exist when the step does.
  const stepX = scene.hasStep ? scene.stepX - WALL_GAP : rightEdge;
  const stepZ = zBack + scene.stepDepth;

  const bo = band + 0.02;
  // Where the back run's mirror strip ends (x) and the right run's starts
  // (z). Flat corner: the plain band insets, matching the front/left corner.
  let seamBackX = rightEdge - band;
  let seamRightZ = zBack + band;
  if (scene.hasStep) {
    // The cornice turns the stepped corner the way the WALL turns it — back
    // run, connector, stepped-forward face — each run held off its own wall
    // face by WALL_GAP, exactly as the 1990 wall stripe traces it
    // (wall-stripe-1990.ts).
    //
    // This replaces a single hypotenuse from (stepX, zBack) to (rightEdge,
    // stepZ). That chord was cheaper by one Reflector, but the step does not
    // cut the corner off — it leaves a SOLID block at the back right, and the
    // chord ran straight through it. The block's inner corner stood 3.1 ft
    // proud of the chord on the 'wide' setting and 2.2 ft on the default,
    // both deeper than the 1.8 ft band, so the gold wall sheared clean
    // through chrome and mirror alike (feedback/062).
    seamBackX = stepX - bo;
    seamRightZ = stepZ + bo;
    // Connector (runs along Z at x = stepX, faces -X into the room).
    addEdge(
      stepZ - zBack,
      new THREE.Vector3(stepX - bo, mirrorY, (zBack + stepZ) / 2 + bo), -Math.PI / 2
    );
    // Stepped-forward face (runs along X at z = stepZ, faces +Z).
    addEdge(
      rightEdge - stepX,
      new THREE.Vector3((stepX + rightEdge) / 2 - bo, mirrorY, stepZ + bo), 0
    );
  }
  // Chrome body: the whole cornice as ONE mitred ring strip, front-left
  // connect point around left/back/(diagonal)/right to the front-right
  // connect point (the cash-wrap soffit fascia closes the loop across the
  // entrance — see ceiling-soffit.ts).
  {
    const connectHalfB = soffitConnectHalf(scene.storefrontSpec, storeWidth, WALL_GAP);
    const plan: { x: number; z: number }[] = [
      { x: STORE_CENTER_X - connectHalfB, z: zFront },
      { x: leftEdge, z: zFront },
      { x: leftEdge, z: zBack },
      { x: stepX, z: zBack },
    ];
    if (scene.hasStep) {
      plan.push({ x: stepX, z: stepZ });      // connector, along the step's -X face
      plan.push({ x: rightEdge, z: stepZ });  // the stepped-forward face
    }
    plan.push({ x: rightEdge, z: zFront });
    plan.push({ x: STORE_CENTER_X + connectHalfB, z: zFront });
    buildBodyRing(plan);
  }
  // Back edge mirror (runs along X, faces +Z) — stops at the stepped corner
  // when there is one, otherwise runs the full width of the flat back wall.
  const backMirrorW = seamBackX - (leftEdge + band);
  addEdge(
    backMirrorW,
    new THREE.Vector3((leftEdge + band + seamBackX) / 2, mirrorY, zBack + bo), 0
  );
  // Front edge (runs along X, faces -Z) — split around the vestibule so the
  // cornice never crosses the entrance zone.
  // Stop where the cash-wrap soffit's back corners are, so the two bands
  // hand off to each other. soffitConnectHalf() is the shared source of that
  // x — it sits well outside the vestibule clearance (vestHalfW + WALL_GAP)
  // so the soffit's wedge has room to taper to a point.
  const connectHalf = soffitConnectHalf(scene.storefrontSpec, storeWidth, WALL_GAP);
  const frontSegs: [number, number, 'x0' | 'x1'][] = [
    [leftEdge, STORE_CENTER_X - connectHalf, 'x0'],
    [STORE_CENTER_X + connectHalf, rightEdge, 'x1'],
  ];
  // Each segment insets its mirror by `band` at the WALL end only (the tuck
  // that keeps it from colliding with the side run around the corner). The
  // vestibule end runs the strip out to the full segment edge, because that
  // is where the cash-wrap soffit's fascia picks the band up and carries it
  // around the counter (src/ceiling-soffit.ts) — insetting both ends, as the
  // other runs do, left 2.9 ft of bare chrome on each side of the entrance
  // and broke the ring exactly where it now needs to be continuous.
  for (const [x0, x1, wallEnd] of frontSegs) {
    const w = x1 - x0;
    if (w < 0.5) continue;
    const mx0 = wallEnd === 'x0' ? x0 + band : x0;
    const mx1 = wallEnd === 'x1' ? x1 - band : x1;
    addEdge(
      mx1 - mx0,
      new THREE.Vector3((mx0 + mx1) / 2, mirrorY, zFront - band - 0.02), Math.PI
    );
  }
  // Left edge (runs along Z, faces +X)
  addEdge(
    innerDepth,
    new THREE.Vector3(leftEdge + band + 0.02, mirrorY, (zFront + zBack) / 2), Math.PI / 2
  );
  // Right edge (runs along Z, faces -X) — starts at the stepped corner. The
  // mirror strip runs all the way down to the diagonal seam point.
  addEdge(
    (zFront - band) - seamRightZ,
    new THREE.Vector3(rightEdge - bo, mirrorY, (seamRightZ + zFront - band) / 2), -Math.PI / 2
  );

  // --- Prebaked warm up-glow where the cornice meets the gold walls ---
  // The cornice's wall-facing back side throws a static warm wash down the
  // back wall and right wall (these never change, so it is baked as additive
  // emissive geometry rather than a real light). Skipped on bb-1990: that
  // wall is white (themes.ts), not the amber-gold this wash was tuned for,
  // and the owner asked for the glow gone there outright (2026-08-03) — it
  // was also what hue-bent the wall stripe's blue toward mauve above ~8.9 ft
  // in an earlier version of that stripe (wall-stripe-1990.ts).
  if (getActiveTheme().id === 'bb-1990') return;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 8;
  glowCanvas.height = 128;
  const gCtx = glowCanvas.getContext('2d')!;
  const gGrad = gCtx.createLinearGradient(0, 0, 0, 128);
  gGrad.addColorStop(0.0, 'rgba(255, 205, 120, 0.35)'); // faint warm gold at the cornice — the old
  gGrad.addColorStop(0.45, 'rgba(255, 180, 90, 0.14)'); // orange-red wash repainted the whole banana
  gGrad.addColorStop(1.0, 'rgba(255, 160, 70, 0.0)');   // wall band orange (reference-photo mismatch)
  gCtx.fillStyle = gGrad;
  gCtx.fillRect(0, 0, 8, 128);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, side: THREE.FrontSide, toneMapped: false
  });
  const glowH = 2.2;                 // warm spill reaches ~2.2 ft down the wall (less diffuse)
  const glowTopY = ceilY - drop;     // top of the glow sits at the cornice underside
  const glowCenterY = glowTopY - glowH / 2;

  // Back wall glow (faces +Z) — glows live ON the walls, not on the
  // stood-off cornice line, so they use the raw wall coordinates.
  const backGlow = new THREE.Mesh(new THREE.PlaneGeometry(storeWidth, glowH), glowMat);
  backGlow.position.set(STORE_CENTER_X, glowCenterY, backWallZ + 0.06);
  scene.scene.add(backGlow);

  // Right wall glow (faces -X)
  const rightGlow = new THREE.Mesh(new THREE.PlaneGeometry(wallFront - backWallZ, glowH), glowMat);
  rightGlow.position.set(wallRight - 0.06, glowCenterY, (wallFront + backWallZ) / 2);
  rightGlow.rotation.y = -Math.PI / 2;
  scene.scene.add(rightGlow);

  // Left wall glow (faces +X) — mirrors the right-wall run. The left wall's
  // window ribbon sits below the cornice (the wall above the window head is
  // solid up to the ceiling), so the full-length cornice-height wash is
  // correct here just like on the right wall.
  const leftGlow = new THREE.Mesh(new THREE.PlaneGeometry(wallFront - backWallZ, glowH), glowMat);
  leftGlow.position.set(wallLeft + 0.06, glowCenterY, (wallFront + backWallZ) / 2);
  leftGlow.rotation.y = Math.PI / 2;
  scene.scene.add(leftGlow);
}

export function buildMarqueeBulbs(scene: StoreScene, storeWidth: number, backWallZ: number) {
  const bulbsSetting = localStorage.getItem('bb_marquee_bulbs');
  const bulbsEnabled = bulbsSetting === null ? true : bulbsSetting === '1'; // default ON
  const quality = localStorage.getItem('bb_quality') || 'high';
  if (!bulbsEnabled || quality === 'low') {
    scene.marqueeBulbsMesh = null;
    return;
  }

  // Same cornice geometry constants as buildCeilingFrame(), kept independent
  // (not shared via closure) so toggling this feature can never regress the
  // mirror cornice itself. The frame MUST match the cornice's: inset
  // CORNICE_WALL_GAP from every wall and split around the vestibule, or the
  // bulb rim detaches from the mirror body (feedback/005) — most bulbs end
  // up buried inside the chrome box and the only visible ones float in air
  // across the vestibule glass and at the stepped-corner diagonal.
  const ceilY = scene.ceilingY;
  const WALL_GAP = CORNICE_WALL_GAP;
  const leftEdge = STORE_CENTER_X - storeWidth / 2 + WALL_GAP;
  const rightEdge = STORE_CENTER_X + storeWidth / 2 - WALL_GAP;
  const zFront = FRONT_GLASS_Z - WALL_GAP;
  const zBack = backWallZ + WALL_GAP;
  const drop = CORNICE_DROP;
  const band = CORNICE_BAND;
  const bulbY = ceilY - drop + 0.10; // just above the cornice's true bottom edge
  const bulbSpacing = 0.5;
  const bulbRadius = 0.045;

  const spots: THREE.Vector3[] = [];
  const addLine = (from: THREE.Vector3, to: THREE.Vector3) => {
    const len = from.distanceTo(to);
    const count = Math.max(2, Math.round(len / bulbSpacing));
    for (let i = 0; i < count; i++) {
      spots.push(from.clone().lerp(to, (i + 0.5) / count));
    }
  };

  // Cornice rim, all the way around: back/front runs span the full store
  // width (including the corners); left/right runs tuck into the remaining
  // inner depth between them — the same split buildCeilingFrame's mirror
  // strips use, so there's no gap and no double-covered corner.
  // Stepped back-right corner: the cornice runs diagonally between the back
  // and right runs there (see buildCeilingFrame's diagonal edge), so the
  // bulb rim follows the same three-segment path — back run to the diagonal
  // seam, the diagonal itself, then the right run — instead of blindly
  // spanning the full width straight through the stepped wall.
  const bo = band + 0.03; // bulb line's inward offset from the cornice's wall line
  // The seam math below divides by the diagonal's Z component, which is the
  // step depth — so with no stepped corner (bb_corner 'none') diagS1 goes
  // 0/0 = NaN and the BACK-WALL run collapses to NaN instances that render
  // nothing, i.e. bulbs everywhere except along the back-wall mirror. Guard
  // it exactly like buildCeilingFrame() already does for the mirror band.
  if (scene.hasStep) {
    const stepX = scene.stepX - WALL_GAP;
    const stepZ = zBack + scene.stepDepth;
    const diagDX = rightEdge - stepX;
    const diagDZ = stepZ - zBack;
    const diagLen = Math.hypot(diagDX, diagDZ);
    const diagNX = -diagDZ / diagLen;
    const diagNZ = diagDX / diagLen;
    const diagUX = diagDX / diagLen, diagUZ = diagDZ / diagLen;
    const diagS1 = (bo * (1 - diagNZ)) / diagUZ;
    const diagS2 = (diagDX - bo * (1 + diagNX)) / diagUX;
    const diagP1 = new THREE.Vector3(
      stepX + diagNX * bo + diagS1 * diagUX, bulbY, zBack + diagNZ * bo + diagS1 * diagUZ);
    const diagP2 = new THREE.Vector3(
      stepX + diagNX * bo + diagS2 * diagUX, bulbY, zBack + diagNZ * bo + diagS2 * diagUZ);
    addLine(new THREE.Vector3(leftEdge, bulbY, zBack + bo), diagP1);
    addLine(diagP1, diagP2);
    addLine(diagP2, new THREE.Vector3(rightEdge - bo, bulbY, zFront - band));
  } else {
    // Flat back-right wall: straight back run, then straight down the right.
    addLine(
      new THREE.Vector3(leftEdge, bulbY, zBack + bo),
      new THREE.Vector3(rightEdge - bo, bulbY, zBack + bo)
    );
    addLine(
      new THREE.Vector3(rightEdge - bo, bulbY, zBack + bo),
      new THREE.Vector3(rightEdge - bo, bulbY, zFront - band)
    );
  }
  // Front rim: split around the vestibule exactly like the cornice body —
  // a straight full-width run would cross the entrance glass with no chrome
  // behind it.
  // Split at the cash-wrap soffit's back corners, NOT at the vestibule — the
  // front runs now hand off to the soffit there, and the rim follows it
  // around rather than stopping short and leaving the soffit's own band
  // unlit while the wall band beside it glows.
  const connectHalf = soffitConnectHalf(scene.storefrontSpec, storeWidth, WALL_GAP);
  const frontBulbSegs: [number, number][] = [
    [leftEdge, STORE_CENTER_X - connectHalf],
    [STORE_CENTER_X + connectHalf, rightEdge],
  ];
  for (const [x0, x1] of frontBulbSegs) {
    if (x1 - x0 < 0.5) continue; // same skip threshold as buildCeilingFrame
    addLine(
      new THREE.Vector3(x0, bulbY, zFront - band - 0.03),
      new THREE.Vector3(x1, bulbY, zFront - band - 0.03)
    );
  }
  // ...and on around the soffit's mirrored runs. Same 0.03 stand-off past the
  // mirror plane the wall runs use, measured along each run's outward normal,
  // and the same bulbY — the soffit's fascia hangs the identical drop, so the
  // rim stays one unbroken line of bulbs through the corner.
  for (const e of soffitMirroredEdges(
    frontSoffitPolygon(scene.storefrontSpec, storeWidth, WALL_GAP, band)
  )) {
    addLine(
      new THREE.Vector3(e.a.x - e.nx * 0.03, bulbY, e.a.z - e.nz * 0.03),
      new THREE.Vector3(e.b.x - e.nx * 0.03, bulbY, e.b.z - e.nz * 0.03)
    );
  }
  addLine(
    new THREE.Vector3(leftEdge + band + 0.03, bulbY, zBack + band),
    new THREE.Vector3(leftEdge + band + 0.03, bulbY, zFront - band)
  );

  // Window poster frames: a bulb ring around each poster's rectangle, in the
  // poster's own world plane (front window posters face -Z, left window
  // posters face +X — decomposing each anchor's matrixWorld handles both
  // without special-casing which wall it's on).
  const framePos = new THREE.Vector3();
  const frameQuat = new THREE.Quaternion();
  const frameScale = new THREE.Vector3();
  for (const frame of scene.posterMarqueeFrames) {
    frame.anchor.updateWorldMatrix(true, false);
    frame.anchor.matrixWorld.decompose(framePos, frameQuat, frameScale);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(frameQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(frameQuat);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(frameQuat);
    const hw = frame.width / 2;
    const hh = frame.height / 2;
    const center = framePos.clone().addScaledVector(normal, 0.16); // sit proud of the frame bars (depth 0.22)
    const tl = center.clone().addScaledVector(right, -hw).addScaledVector(up, hh);
    const tr = center.clone().addScaledVector(right, hw).addScaledVector(up, hh);
    const bl = center.clone().addScaledVector(right, -hw).addScaledVector(up, -hh);
    const br = center.clone().addScaledVector(right, hw).addScaledVector(up, -hh);
    addLine(tl, tr);
    addLine(tr, br);
    addLine(br, bl);
    addLine(bl, tl);
  }

  if (spots.length === 0) return;

  const bulbGeo = new THREE.SphereGeometry(bulbRadius, 8, 6);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0x20140a,
    emissive: new THREE.Color(0xffd9a0),
    emissiveIntensity: 3.2, // above the bloom threshold (2.0) so lit bulbs actually glow
    roughness: 0.4,
    metalness: 0.0,
  });
  // Patch in emissive * instanceColor: vanilla three.js only multiplies the
  // diffuse color by instanceColor, which would be invisible on a material
  // this emissive-dominant. vColor is the varying three.js already declares
  // for USE_INSTANCING_COLOR (see color_fragment.glsl.js) — no extra uniform
  // or attribute needed.
  bulbMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
totalEmissiveRadiance *= vColor.rgb;
#endif`
    );
  };

  const mesh = new THREE.InstancedMesh(bulbGeo, bulbMat, spots.length);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false; // instances span the whole store perimeter
  mesh.name = 'marqueeBulbs'; // T13 marker (debugging/tests; not read at runtime)

  const m4 = new THREE.Matrix4();
  spots.forEach((pos, i) => {
    m4.makeTranslation(pos.x, pos.y, pos.z);
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;

  const colorArr = new Float32Array(spots.length * 3);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArr, 3);

  scene.scene.add(mesh);
  scene.marqueeBulbsMesh = mesh;

  const anim = (localStorage.getItem('bb_marquee_anim') || 'steady') as 'off' | 'steady' | 'chase';
  scene.setMarqueeAnimMode(anim);
}

export function setMarqueeAnimMode(scene: StoreScene, mode: 'off' | 'steady' | 'chase'): void {
  scene.marqueeAnimMode = mode;
  const mesh = scene.marqueeBulbsMesh;
  if (!mesh || !mesh.instanceColor) return;
  const arr = mesh.instanceColor.array as Float32Array;
  if (mode === 'off') {
    arr.fill(0.12);
  } else if (mode === 'steady') {
    arr.fill(1.0);
  } else {
    scene.marqueeChaseStep = 0;
    scene.marqueeLastChaseUpdate = 0;
    for (let i = 0; i < mesh.count; i++) {
      const on = (i % 3) === 0;
      const v = on ? 1.0 : 0.15;
      arr[i * 3] = v; arr[i * 3 + 1] = v; arr[i * 3 + 2] = v;
    }
  }
  mesh.instanceColor.needsUpdate = true;
  scene.requestRender(); // one-shot: reflect the settings change immediately
}

export function updateMarqueeBulbs(scene: StoreScene, timeMs: number): void {
  const mesh = scene.marqueeBulbsMesh;
  if (!mesh || !mesh.instanceColor || scene.marqueeAnimMode !== 'chase') return;
  if (timeMs - scene.marqueeLastChaseUpdate < 150) return;
  scene.marqueeLastChaseUpdate = timeMs;
  scene.marqueeChaseStep = (scene.marqueeChaseStep + 1) % 3;
  const arr = mesh.instanceColor.array as Float32Array;
  for (let i = 0; i < mesh.count; i++) {
    const on = (i % 3) === scene.marqueeChaseStep;
    const v = on ? 1.0 : 0.15;
    arr[i * 3] = v; arr[i * 3 + 1] = v; arr[i * 3 + 2] = v;
  }
  mesh.instanceColor.needsUpdate = true;
}

// Actor-portrait wall + film-strip ribbon décor moved to wall-decor.ts (pin
// 052 rebuild, 2026-08-06): the old version here hardcoded a fixed poster/
// mural rectangle that clipped straight through the EXIT door and the side
// window ribbon. See wall-decor.ts for the replacement (real Jellyfin actor
// data, computed wall exclusion zones, high-ceiling-only gating).
