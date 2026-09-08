import * as THREE from 'three';
import type { FixtureContext } from './fixtures';
import { installDisplayModel } from './fixtures/display-model';
import { FRONT_GLASS_Z, STORE_CENTER_X } from './store-layout';
import { facadeDimensions, type FacadeStyle } from './storefront-architecture';
import { selfLit } from './material-lighting';
import type { OutsideMode } from './outdoor-lighting';
import { onBrandChange } from './brand-live';
import { getActiveTheme } from './themes';

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
  const tile = new THREE.MeshStandardMaterial({ color: p.primary, roughness: .34, envMapIntensity: .2 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd8cfb7, roughness: .75, envMapIntensity: .2 });
  const coping = new THREE.MeshStandardMaterial({ color: 0x292d31, metalness: .35, roughness: .52, envMapIntensity: .2 });
  const soffit = new THREE.MeshStandardMaterial({ color: 0x32322f, roughness: .9, envMapIntensity: .2 });
  const canopy = selfLit(new THREE.MeshStandardMaterial({ color: p.primary, emissive: p.primary, emissiveIntensity: 0, roughness: .6, envMapIntensity: .2 }), 'light-source');
  const finishes = { FacadeBrick: brick, FacadeTile: tile, FacadeTrim: trim, FacadeCoping: coping, FacadeSoffit: soffit, FacadeCanopy: canopy };
  const releases: (() => void)[] = [];
  const fallback = new THREE.Group();
  const m = d.massHalf, o = p.openingHalfWidth;
  const shape = new THREE.Shape();
  const top = p.style === 'gabled-brick' ? d.gableBase : d.pierTop;
  shape.moveTo(-m, 0); shape.lineTo(-o, 0); shape.lineTo(-o, d.headerBottom);
  shape.lineTo(o, d.headerBottom); shape.lineTo(o, 0); shape.lineTo(m, 0);
  shape.lineTo(m, top);
  if (p.style === 'gabled-brick') {
    shape.lineTo(m-1, top); shape.lineTo(0, top+d.gableHeight); shape.lineTo(-m+1, top);
  }
  shape.lineTo(-m, top); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d.frontProjection-.1, bevelEnabled: false });
  const uv = geo.getAttribute('uv');
  for (let i=0; i<uv.count; i++) uv.setXY(i, uv.getX(i)/4, uv.getY(i)/4);
  const portal = new THREE.Mesh(geo, brick);
  portal.position.z = .1; portal.castShadow = portal.receiveShadow = true;
  fallback.add(portal);
  for (const sign of [-1, 1]) {
    const width = p.style === 'arcaded-brick' ? 8 : d.pierWidth;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(width, d.pierTop, 2.3), brick);
    pier.position.set(sign*(m+width/2), d.pierTop/2, 1.25);
    pier.castShadow = pier.receiveShadow = true;
    fallback.add(pier);
  }
  group.add(fallback);
  // All finishes remain reachable by the normal scene cleanup, including
  // ones used only by the exported model or an optional style.
  group.userData.ownedFinishes = Object.values(finishes);
  const prepare = (model: THREE.Group) => {
    const lift = d.parapetTop - 16.8;
    model.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const position = obj.geometry.getAttribute('position');
      const uv = obj.geometry.getAttribute('uv');
      for (let i=0; i<position.count; i++) {
        const x = position.getX(i), y = position.getY(i), a = Math.abs(x);
        const newX = a <= 5.55 ? a*o/5.55
          : a <= 7.9 ? o+(a-5.55)*(m-o)/2.35 : m+a-7.9;
        const newY = y+lift*Math.max(0, Math.min(1, (y-9.15)/7.95));
        position.setXYZ(i, Math.sign(x)*newX, newY, position.getZ(i));
        if (uv && y > 9.15) uv.setY(i, uv.getY(i)+(newY-y)/4);
      }
      position.needsUpdate = true;
      if (uv) uv.needsUpdate = true;
      obj.geometry.computeVertexNormals();
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
  };
  group.userData.dispose = dispose;
  group.addEventListener('removed', dispose);
  return group;
}

export function setFacadeEntryLighting(scene: THREE.Scene, mode: OutsideMode): void {
  scene.getObjectByName('storefrontEntryModel')?.userData.setOutsideMode?.(mode);
}

export function disposeFacadeEntry(scene: THREE.Scene): void {
  scene.getObjectByName('storefrontEntryModel')?.userData.dispose?.();
}
