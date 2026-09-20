import * as THREE from 'three';
import type { FixtureContext } from './fixtures';
import { installDisplayModel } from './fixtures/display-model';
import { FRONT_GLASS_Z, STORE_CENTER_X } from './store-layout';
import { facadeDimensions, coneCanopyFinish, type FacadeStyle } from './storefront-architecture';

export function getCanopyAccentColor(primary: string | number | THREE.Color): THREE.Color {
  const c = new THREE.Color(primary);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.max(0, hsl.s * 0.75), Math.max(0.06, hsl.l * 0.80));
  return c;
}
import { fitFacadeEntryVertex } from './storefront-entry-fit';
import { selfLit } from './material-lighting';
import type { OutsideMode } from './outdoor-lighting';
import { onBrandChange } from './brand-live';
import { getActiveTheme } from './themes';
import { createFacadeTileMaterial, mapFacadeUV } from './facade-masonry';
import { createBrickTexture } from './canvas-textures';
import { createFacadeSlateMaterial } from './facade-slate-material';
import { buildConeCanopyFallback } from './storefront-cone-canopy';
import { addStorefrontParkingPlaques } from './storefront-parking-plaques';
import { DOWNLIGHT_APERTURE_RADIUS, installDownlightModels } from './downlight-model';

interface EntryParams {
  style: FacadeStyle;
  entryHalfWidth: number;
  openingHalfWidth: number;
  frontCornerMargin: number;
  brickMaterial: (x: number, y: number) => THREE.MeshStandardMaterial;
  primary: string;
}

/** Fitted masonry and metalwork; the entrance still owns doors and collisions. */
export function buildFacadeEntryModel(ctx: FixtureContext, p: EntryParams): THREE.Group {
  const group = new THREE.Group();
  group.name = 'storefrontEntryModel';
  group.position.set(STORE_CENTER_X, 0, FRONT_GLASS_Z);
  const d = facadeDimensions(ctx.ceilingY, p.entryHalfWidth, p.style);
  const brick = p.brickMaterial(1, 1);
  const tile = createFacadeTileMaterial(p.primary);
  const soldier = new THREE.MeshStandardMaterial({ ...createBrickTexture('soldier'), roughness: 1, envMapIntensity: .2 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd8cfb7, roughness: .75, envMapIntensity: .2 });
  const coping = new THREE.MeshStandardMaterial({ color: 0x292d31, metalness: .35, roughness: .52, envMapIntensity: .2 });
  const soffit = new THREE.MeshStandardMaterial({ color: 0xb8b6ad, roughness: .72, metalness: .15, envMapIntensity: .2 });
  const finishMode = coneCanopyFinish();
  const canopyColor = getCanopyAccentColor(p.primary);
  const canopy = selfLit(new THREE.MeshStandardMaterial({
    color: canopyColor,
    emissive: canopyColor,
    emissiveIntensity: 0,
    roughness: .68,
    metalness: .05,
    envMapIntensity: .2
  }), 'light-source');
  const slateHandle = createFacadeSlateMaterial({ onChange: () => ctx.requestRender() });
  const slate = slateHandle.material;
  const downlight = selfLit(new THREE.MeshStandardMaterial({ color: 0xffefd4, emissive: 0xffdfab, emissiveIntensity: 0 }), 'light-source');
  const finishes = {
    FacadeSlate: slate,
    FacadeCanopy: p.style === 'cone-canopy' && finishMode === 'full-slate' ? slate : canopy,
    FacadeDownlight: downlight,
    FacadeBrick: brick,
    FacadeSoldierBrick: soldier,
    FacadeTile: p.style === 'flat-parapet' ? brick : tile,
    FacadeTrim: trim,
    FacadeCoping: coping,
    // The early brick portal continues its masonry under the header.
    FacadeSoffit: p.style === 'gabled-brick' ? brick : soffit,
  };
  const releases: (() => void)[] = [];
  const fallback = new THREE.Group();
  const m = d.massHalf, o = p.openingHalfWidth;

  // The deep masonry portals shelter the two door passages and their central
  // brick pier. Recessed cans in the soffit make that architecture legible
  // after dark; three fixtures align with exit, divider and entrance rather
  // than washing the whole facade indiscriminately. Cone-canopy already owns
  // its dedicated fittings in the authored model.
  const parapetSpots: THREE.SpotLight[] = [];
  const lightContext = ctx as FixtureContext & { effectiveQuality?: 'high' | 'medium' | 'low'; softwareGL?: boolean };
  const parapetShadows = lightContext.effectiveQuality !== 'low' && !lightContext.softwareGL;
  const parapetRoot = new THREE.Group();
  parapetRoot.name = 'parapet recessed downlights';
  group.add(parapetRoot);
  if (p.style !== 'cone-canopy') {
    const passageOffset = o * .38;
    const lightZ = d.frontProjection * .54;
    const positions = [-passageOffset, 0, passageOffset].map(x => ({
      x, y: d.headerBottom, z: lightZ,
    }));
    const trimGeo = new THREE.RingGeometry(DOWNLIGHT_APERTURE_RADIUS, DOWNLIGHT_APERTURE_RADIUS + .09, 28);
    const lensGeo = new THREE.CircleGeometry(DOWNLIGHT_APERTURE_RADIUS, 28);
    const hardwareFallback = new THREE.Group();
    hardwareFallback.name = 'parapet downlight fallback';
    for (const position of positions) {
      const ring = new THREE.Mesh(trimGeo, trim);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(position.x, position.y - .005, position.z);
      hardwareFallback.add(ring);
      const lens = new THREE.Mesh(lensGeo, downlight);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(position.x, position.y - .02, position.z);
      hardwareFallback.add(lens);

      const spot = new THREE.SpotLight(0xffdfab, 0, 15, Math.PI / 4, .72, 2);
      spot.name = 'parapet jamb illumination';
      spot.position.set(position.x, position.y - .18, position.z);
      spot.target.position.set(position.x, 2.8, .25);
      spot.castShadow = parapetShadows;
      spot.shadow.mapSize.set(512, 512);
      spot.shadow.camera.near = .25;
      spot.shadow.camera.far = 16;
      spot.shadow.normalBias = .025;
      spot.shadow.bias = -.0002;
      spot.shadow.autoUpdate = false;
      spot.shadow.needsUpdate = true;
      parapetRoot.add(spot, spot.target);
      parapetSpots.push(spot);
    }
    parapetRoot.add(hardwareFallback);
    releases.push(installDownlightModels(parapetRoot, positions, hardwareFallback, () => {
      group.userData.setOutsideMode?.(group.userData.outsideMode ?? 'day');
      ctx.requestShadowRefresh();
      ctx.requestRender();
    }));
    releases.push(() => {
      trimGeo.dispose();
      lensGeo.dispose();
      parapetSpots.forEach(light => light.shadow.dispose());
    });
  }
  if (p.style === 'cone-canopy') {
    buildConeCanopyFallback(fallback, finishes, ctx.ceilingY, p.entryHalfWidth, p.openingHalfWidth);
  } else {
    const shape = new THREE.Shape();
    const top = p.style === 'gabled-brick' ? d.gableBase : d.pierTop;
    shape.moveTo(-m, d.headerBottom);
    if (p.style === 'arcaded-brick') {
      for (let k = 1; k <= 48; k++) {
        const angle = k * Math.PI / 48;
        shape.lineTo(-m * Math.cos(angle), d.headerBottom + 4 * Math.sin(angle));
      }
    } else shape.lineTo(m, d.headerBottom);
    shape.lineTo(m, top);
    if (p.style === 'gabled-brick') {
      shape.lineTo(m-1, top); shape.lineTo(0, top+d.gableHeight); shape.lineTo(-m+1, top);
    }
    shape.lineTo(-m, top); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d.frontProjection-.1, bevelEnabled: false });
    mapFacadeUV(geo, new THREE.Vector3(STORE_CENTER_X, 0, FRONT_GLASS_Z + .1));
    const portal = new THREE.Mesh(geo, brick);
    portal.position.z = .1; portal.castShadow = portal.receiveShadow = true;
    fallback.add(portal);
    const box = (w: number, h: number, depth: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), material);
      mesh.position.set(x, y, z);
      mapFacadeUV(mesh.geometry, mesh.position.clone().add(group.position));
      mesh.castShadow = mesh.receiveShadow = true;
      fallback.add(mesh);
      return mesh;
    };
    for (const sign of [-1, 1]) {
      const width = d.pierWidth;
      const front = d.pierFront, back = d.pierBack;
      if (p.style === 'gabled-brick') {
        for (const [bottom, top, material] of [[0, 2, soldier], [2, 14.4, brick], [14.4, 15.45, tile], [15.45, d.pierTop, soldier]] as const) {
          const courseBack = bottom >= 14.4 ? .1 : back;
          const step = bottom === 0 ? .2 : 0;
          box(width+step, top-bottom, front-courseBack+step, sign*(m+width/2), (bottom+top)/2, (front+courseBack)/2, material);
        }
        box(width, 14.4-d.headerBottom, back-.1, sign*(m+width/2), (14.4+d.headerBottom)/2, (back+.1)/2, brick);
        box(m-o, d.headerBottom, .59, sign*(m+o)/2, d.headerBottom/2, .455, brick);
      } else {
        box(width+.2, 1.6, front-back+.2, sign*(m+width/2), .8, (front+back)/2, soldier);
        box(width, d.pierTop-1.6, front-back, sign*(m+width/2), (d.pierTop+1.6)/2, (front+back)/2, brick);
        box(width, d.pierTop-d.headerBottom, back-.1, sign*(m+width/2), (d.pierTop+d.headerBottom)/2, (back+.1)/2, brick);
        box(m-o, d.headerBottom, .59, sign*(m+o)/2, d.headerBottom/2, .455, brick);
      }
    }
    if (p.style === 'gabled-brick') {
      for (const top of [d.headerTop, d.towerStripeTop]) box(m*2, 1.05, .07, 0, top-.525, d.frontProjection+.035, tile);
      box(m*2, 2.15, .025, 0, 11.275, d.frontProjection+.013, soldier);
      box(1.8, 9.1, .59, 0, 4.55, .455, brick);
      for (const sign of [-1, 1]) box(3.1, 1.82, .59, sign*(o-1.55), .91, .455, brick);
    }
  }
    const downlights = new THREE.Group();
  downlights.name = "coneCanopyDownlights";
  if (p.style === "cone-canopy") {
    const bottom = 9.15;
    for (const s of [-1, 1]) {
      const pl = new THREE.PointLight(0xffdfab, 0, 16, 2);
      pl.position.set(s * 4, bottom - 0.2, 6.2);
      pl.name = `canopyDownlight_${s < 0 ? "L" : "R"}`;
      downlights.add(pl);
    }
    group.add(downlights);
  }
  group.add(fallback);
  if (p.style === 'gabled-brick') releases.push(addStorefrontParkingPlaques(ctx, group, m+d.pierWidth/2, d.pierFront));
  // All finishes remain reachable by the normal scene cleanup, including
  // ones used only by the exported model or an optional style.
  group.userData.ownedFinishes = Object.values(finishes);
  const prepare = (model: THREE.Group) => {
    model.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const position = obj.geometry.getAttribute('position');
      for (let i=0; i<position.count; i++) {
        const [x, y] = fitFacadeEntryVertex(position.getX(i), position.getY(i),
          ctx.ceilingY, p.entryHalfWidth, p.openingHalfWidth, p.style);
        // Rear entrance masonry meets the wing veneer at the same outside plane.
        const z = position.getZ(i);
        const flushJamb = p.style !== 'cone-canopy' && position.getY(i) <= 9.15 && z >= -.181 && z <= .33;
        // Keep every rear face outside the interior liner and black frame.
        const jambZ = z <= 0 ? .16 + (z + .18) * .1 : z + .5;
        position.setXYZ(i, x, y, flushJamb ? jambZ : z);
      }
      position.needsUpdate = true;
      obj.geometry.computeVertexNormals();
      if (p.style !== 'cone-canopy') mapFacadeUV(obj.geometry, group.position);
      obj.geometry.computeBoundingBox(); obj.geometry.computeBoundingSphere();
    });
  };
  releases.push(installDisplayModel(ctx, group, fallback, `models/storefront-entry-${p.style}.glb`, finishes, new THREE.Vector3(1,1,1), prepare));

  if (p.style === 'arcaded-brick') {
    const outside = ctx.storeWidth/2-p.frontCornerMargin;
    const inside = d.massHalf+d.pierWidth+.1;
    const count = Math.max(0, Math.floor((outside-inside+.01)/8));
    for (const sign of [-1,1]) for (let i=0; i<count; i++) {
      const bay = new THREE.Group();
      bay.name = 'arcadeWindowBay';
      bay.position.x = sign*(outside-4-i*8);
      group.add(bay);
      const plain = new THREE.Group(); bay.add(plain);
      releases.push(installDisplayModel(ctx, bay, plain, 'models/storefront-arch-bay.glb', finishes));
    }
  }
  let disposed = false;
  const unsubscribe = onBrandChange(() => {
    const primary = getActiveTheme().palette.primary;
    tile.color.set(primary);
    const accent = getCanopyAccentColor(primary);
    canopy.color.copy(accent);
    canopy.emissive.copy(accent);
  });
  group.userData.setOutsideMode = (mode: OutsideMode) => {
    group.userData.outsideMode = mode;
    downlight.emissiveIntensity = mode === 'night' ? 3 : mode === 'sunset' ? .7 : 0;
    canopy.emissiveIntensity = mode === 'night' ? .65 : mode === 'sunset' ? .15 : 0;
    const parapetLevel = mode === 'night' ? 1 : mode === 'sunset' ? .3 : 0;
    parapetSpots.forEach(light => { light.intensity = 95 * parapetLevel; });
    parapetRoot.getObjectByName('recessed-downlights')?.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.userData.parapetNightEmissive ??= material.emissiveIntensity;
        material.emissiveIntensity = material.userData.parapetNightEmissive * parapetLevel;
      }
    });
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    releases.forEach(release => release());
    const geometries = new Set<THREE.BufferGeometry>();
    fallback.traverse(obj => { if (obj instanceof THREE.Mesh) geometries.add(obj.geometry); });
    geometries.forEach(geometry => geometry.dispose());
    fallback.clear();
    slateHandle.dispose();
    Object.values(finishes).forEach(material => material.dispose());
    [tile.map, tile.bumpMap, soldier.map, soldier.normalMap, soldier.roughnessMap].forEach(texture => texture?.dispose());
  };
  group.userData.dispose = dispose;
  group.addEventListener('removed', dispose);
  return group;
}

export function setFacadeEntryLighting(scene: THREE.Scene, mode: OutsideMode): void {
  scene.getObjectByName('storefrontEntryModel')?.userData.setOutsideMode?.(mode);
  // The facade sign is backlit after dusk, with no bloom obscuring its ink
  // in daylight. Store the authored night value once so toggles do not drift.
  const level = mode === 'night' ? .25 : mode === 'sunset' ? .08 : 0;
  for (const name of ['storefrontLogo3D', 'storefrontLayeredLogo']) {
    scene.getObjectByName(name)?.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.userData.facadeNightEmissive ??= material.emissiveIntensity;
        material.emissiveIntensity = material.userData.facadeNightEmissive * level;
      }
    });
  }
  const light = scene.getObjectByName('storefrontSignLight');
  if (light instanceof THREE.PointLight) light.intensity = 15 * level;
}

export function disposeFacadeEntry(scene: THREE.Scene): void {
  scene.getObjectByName('storefrontEntryModel')?.userData.dispose?.();
}
