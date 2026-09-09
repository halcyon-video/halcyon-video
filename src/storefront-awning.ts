import * as THREE from 'three';
import { ensureBundledFont } from './bundled-fonts';
import { onBrandChange } from './brand-live';
import type { FixtureContext } from './fixtures';
import { installDisplayModel } from './fixtures/display-model';
import { drawLogo } from './logo-renderer';
import { getActiveLogoSpec } from './logo-spec';
import { selfLit } from './material-lighting';
import { FRONT_GLASS_Z, STORE_CENTER_X } from './store-layout';
import { entryMassSolidHalfWidth, WINDOW_HEAD_Y } from './storefront-facade';
import type { OutsideMode } from './outdoor-lighting';
import { getActiveTheme } from './themes';

/** A fitted canopy over each window wing; the masonry portico keeps its opening. */
export function buildWindowAwnings(ctx: FixtureContext, entryHalfWidth: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'storefrontWindowAwnings';
  const primary = new THREE.Color(ctx.activeTheme.palette.primary);
  const fabric = selfLit(new THREE.MeshStandardMaterial({
    color: primary, emissive: primary, emissiveIntensity: 0,
    roughness: .65, metalness: 0, envMapIntensity: .2,
  }), 'light-source');
  const binding = new THREE.MeshStandardMaterial({ color: primary.clone().multiplyScalar(.22), roughness: .7, envMapIntensity: .2 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x343a42, roughness: .4, metalness: .5, envMapIntensity: .2 });
  const soffit = selfLit(new THREE.MeshStandardMaterial({
    color: 0xe7dfc8, emissive: 0xffe9b4, emissiveIntensity: 0, roughness: .7, envMapIntensity: .2,
  }), 'light-source');
  const lettering = selfLit(new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0,
    transparent: true, alphaTest: .04, depthWrite: false, roughness: .65, envMapIntensity: .2,
  }), 'light-source');
  const finishes = { AwningFabric: fabric, AwningBinding: binding, AwningFrame: frame, AwningSoffit: soffit };
  const releases: (() => void)[] = [];
  const labels: { mesh: THREE.Mesh; maxWidth: number }[] = [];
  let disposed = false;

  // Keep the canopy's full cross-section as stores grow: only the horizontal
  // run changes. Its lower hem clears the window head and its depth fits on
  // the existing sidewalk, just behind the front face of the entry portico.
  const inside = entryMassSolidHalfWidth(entryHalfWidth) + .12;
  const outside = ctx.storeWidth / 2 + .28;
  const width = outside - inside;
  if (width <= 1) {
    [fabric, binding, frame, soffit, lettering].forEach(material => material.dispose());
    return group;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 512;
  const c = canvas.getContext('2d')!;
  const letterTexture = new THREE.CanvasTexture(canvas);
  letterTexture.colorSpace = THREE.SRGBColorSpace;
  letterTexture.anisotropy = 8;
  lettering.map = lettering.emissiveMap = letterTexture;
  for (const sign of [-1, 1]) {
    const wing = new THREE.Group();
    wing.name = sign < 0 ? 'leftWindowAwning' : 'rightWindowAwning';
    wing.position.set(STORE_CENTER_X + sign * (inside + outside) / 2, WINDOW_HEAD_Y + .25, FRONT_GLASS_Z + .8);
    group.add(wing);
    const fallback = new THREE.Group();
    // A deliberately plain, fully shaded canopy while the fitted mesh loads.
    // This geometry also owns the shared finishes through normal scene teardown.
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 2.8, 3.1), fabric);
    body.position.set(0, 1.65, 1.6);
    body.castShadow = body.receiveShadow = true;
    fallback.add(body);
    const hem = new THREE.Mesh(new THREE.BoxGeometry(width, .08, .08), binding);
    hem.position.set(0, .08, 3.23);
    fallback.add(hem);
    const underside = new THREE.Mesh(new THREE.BoxGeometry(width, .04, 3.15), soffit);
    underside.position.set(0, .04, 1.62);
    fallback.add(underside);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(width, .08, .08), frame);
    bracket.position.set(0, 3.2, .08);
    fallback.add(bracket);
    wing.add(fallback);
    releases.push(installDisplayModel(ctx, wing, fallback, 'models/storefront-awning.glb', finishes, new THREE.Vector3(width / 30, 1, 1)));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lettering);
    label.name = 'awningBrandLettering';
    label.position.set(0, 1.32, 3.273);
    wing.add(label);
    labels.push({ mesh: label, maxWidth: width * .70 });
  }

  // Use the normal brand painter and its bundled face, then crop to the ink.
  // That keeps short and long names in proportion without stretching letters
  // or baking a rectangular signboard over the fabric.
  const paint = () => {
    if (disposed) return;
    const theme = getActiveTheme();
    const spec = getActiveLogoSpec(theme);
    fabric.color.set(theme.palette.primary);
    fabric.emissive.copy(fabric.color);
    binding.color.copy(fabric.color).multiplyScalar(.22);
    const name = [spec.mainText, spec.subText].filter(Boolean).join(' ');
    if (!name) { labels.forEach(({ mesh }) => { mesh.visible = false; }); return; }
    c.clearRect(0, 0, canvas.width, canvas.height);
    drawLogo(c, { ...spec, shape: 'none', innerBorder: false }, {
      x: 0, y: 0, w: canvas.width, h: canvas.height,
      layer: 'text', textOverride: name,
      shadow: { color: 'transparent', blur: 0, ox: 0, oy: 0 },
    });
    const pixels = c.getImageData(0, 0, canvas.width, canvas.height).data;
    let x0 = canvas.width, y0 = canvas.height, x1 = -1, y1 = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] < 8) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x1 < x0) return;
    const inkWidth = x1 - x0 + 5, inkHeight = y1 - y0 + 5;
    letterTexture.offset.set((x0 - 2) / canvas.width, (canvas.height - y1 - 3) / canvas.height);
    letterTexture.repeat.set(inkWidth / canvas.width, inkHeight / canvas.height);
    letterTexture.needsUpdate = true;
    const aspect = inkWidth / inkHeight;
    for (const { mesh, maxWidth } of labels) {
      const height = Math.min(1.46, maxWidth / aspect);
      mesh.scale.set(height * aspect, height, 1);
      mesh.visible = true;
    }
    ctx.requestRender();
  };
  paint();
  ensureBundledFont(getActiveLogoSpec(ctx.activeTheme).fontFamily, paint);
  const unsubscribe = onBrandChange(() => {
    paint();
    ensureBundledFont(getActiveLogoSpec().fontFamily, paint);
  });
  group.userData.setOutsideMode = (mode: OutsideMode) => {
    const level = mode === 'night' ? 1 : mode === 'sunset' ? .32 : 0;
    fabric.emissiveIntensity = level * .85;
    soffit.emissiveIntensity = level * .75;
    lettering.emissiveIntensity = level * 1.45;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    releases.forEach(release => release());
    letterTexture.dispose();
  };
  group.userData.dispose = dispose;
  group.addEventListener('removed', dispose);
  return group;
}

/** Retuned on a visit/time-of-day change, with no animation-loop work. */
export function setWindowAwningLighting(scene: THREE.Scene, mode: OutsideMode): void {
  scene.getObjectByName('storefrontWindowAwnings')?.userData.setOutsideMode?.(mode);
}

export function disposeWindowAwnings(scene: THREE.Scene): void {
  scene.getObjectByName('storefrontWindowAwnings')?.userData.dispose?.();
}
