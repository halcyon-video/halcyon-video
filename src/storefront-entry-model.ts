import * as THREE from 'three';
import type { FixtureContext } from './fixtures';
import { installDisplayModel } from './fixtures/display-model';
import { FRONT_GLASS_Z, STORE_CENTER_X } from './store-layout';
import { facadeDimensions, type FacadeStyle } from './storefront-architecture';
import { selfLit } from './material-lighting';
import type { OutsideMode } from './outdoor-lighting';
import { onBrandChange } from './brand-live';
import { getActiveTheme } from './themes';
import { createFacadeTileMaterial, mapFacadeUV } from './facade-masonry';
import { createBrickTexture } from './canvas-textures';
import { addStorefrontParkingPlaques } from './storefront-parking-plaques';

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
  const soffit = p.style === 'gabled-brick' ? p.brickMaterial(1, 1)
    : new THREE.MeshStandardMaterial({ color: 0x32322f, roughness: .9, envMapIntensity: .2 });
  const canopy = selfLit(new THREE.MeshStandardMaterial({ color: p.primary, emissive: p.primary, emissiveIntensity: 0, roughness: .6, envMapIntensity: .2 }), 'light-source');
  const finishes = { FacadeBrick: brick, FacadeSoldierBrick: soldier, FacadeTile: tile, FacadeTrim: trim, FacadeCoping: coping, FacadeSoffit: soffit, FacadeCanopy: canopy };
  const releases: (() => void)[] = [];
  const fallback = new THREE.Group();
  const m = d.massHalf, o = p.openingHalfWidth;
  const shape = new THREE.Shape();
  const top = p.style === 'gabled-brick' ? d.gableBase : d.pierTop;
  if (p.style === 'gabled-brick') {
    shape.moveTo(-m, d.headerBottom); shape.lineTo(m, d.headerBottom);
  } else {
    shape.moveTo(-m, 0); shape.lineTo(-o, 0); shape.lineTo(-o, d.headerBottom);
    shape.lineTo(o, d.headerBottom); shape.lineTo(o, 0); shape.lineTo(m, 0);
  }
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
    const width = p.style === 'arcaded-brick' ? 8 : d.pierWidth;
    const front = d.pierFront, back = d.pierBack;
    if (p.style === 'gabled-brick') {
      for (const [bottom, top, material] of [[0, 2, soldier], [2, 14.4, brick], [14.4, 15.45, tile], [15.45, d.pierTop, soldier]] as const) {
        const courseBack = bottom >= 14.4 ? .1 : back;
        const step = bottom === 0 ? .2 : 0;
        box(width+step, top-bottom, front-courseBack+step, sign*(m+width/2), (bottom+top)/2, (front+courseBack)/2, material);
      }
      box(width, 14.4-d.headerBottom, back-.1, sign*(m+width/2), (14.4+d.headerBottom)/2, (back+.1)/2, brick);
      box(m-o, d.headerBottom, .65, sign*(m+o)/2, d.headerBottom/2, .425, brick);
    } else {
      box(width, d.pierTop, front-back, sign*(m+width/2), d.pierTop/2, (front+back)/2, brick);
    }
  }
  if (p.style === 'gabled-brick') {
    for (const top of [d.headerTop, d.towerStripeTop]) box(m*2, 1.05, .07, 0, top-.525, d.frontProjection+.035, tile);
    box(m*2, 2.15, .025, 0, 11.275, d.frontProjection+.013, soldier);
    box(1.8, 9.1, .43, 0, 4.55, .035, brick);
    for (const sign of [-1, 1]) box(3.1, 1.82, .43, sign*(o-1.55), .91, .035, brick);
  }
  group.add(fallback);
  if (p.style === 'gabled-brick') releases.push(addStorefrontParkingPlaques(ctx, group, m+d.pierWidth/2, d.pierFront));
  // All finishes remain reachable by the normal scene cleanup, including
  // ones used only by the exported model or an optional style.
  group.userData.ownedFinishes = Object.values(finishes);
  const prepare = (model: THREE.Group) => {
    const lift = d.parapetTop - 16.8;
    model.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const position = obj.geometry.getAttribute('position');
      const authoredOpening = p.style === 'gabled-brick' ? 7.2 : 5.55;
      const authoredMass = p.style === 'gabled-brick' ? 7.6 : 7.9;
      for (let i=0; i<position.count; i++) {
        const x = position.getX(i), y = position.getY(i), a = Math.abs(x);
        let newX = a <= authoredOpening ? a*o/authoredOpening
          : a <= authoredMass ? o+(a-authoredOpening)*(m-o)/(authoredMass-authoredOpening) : m+a-authoredMass;
        if (p.style === 'gabled-brick' && a <= authoredOpening) {
          const doorEdge = o-3.1;
          newX = a <= .9 ? a : a <= 4.1 ? .9+(a-.9)*(doorEdge-.9)/3.2 : doorEdge+(a-4.1);
        }
        const newY = y+lift*Math.max(0, Math.min(1, (y-9.15)/7.95));
        position.setXYZ(i, Math.sign(x)*newX, newY, position.getZ(i));
      }
      position.needsUpdate = true;
      obj.geometry.computeVertexNormals();
      mapFacadeUV(obj.geometry, group.position);
      obj.geometry.computeBoundingBox(); obj.geometry.computeBoundingSphere();
    });
  };
  releases.push(installDisplayModel(ctx, group, fallback, `models/storefront-entry-${p.style}.glb`, finishes, new THREE.Vector3(1,1,1), prepare));

  if (p.style === 'arcaded-brick') {
    const outside = ctx.storeWidth/2-p.frontCornerMargin;
    const inside = p.entryHalfWidth+8;
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
    tile.color.set(primary); canopy.color.set(primary); canopy.emissive.set(primary);
  });
  group.userData.setOutsideMode = (mode: OutsideMode) => {
    canopy.emissiveIntensity = mode === 'night' ? .65 : mode === 'sunset' ? .15 : 0;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    releases.forEach(release => release());
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
  const level = mode === 'night' ? 1 : mode === 'sunset' ? .2 : 0;
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
