import * as THREE from 'three';
import { FixtureContext } from '../fixtures';
import { getSignDef } from '../signage-catalog';
import {
  DEFAULT_SIGNAGE_CONFIG,
  isKnownSignageSlotId,
  validateSignageConfig
} from '../signage-config';
import { buildCategoryPlate1993 } from './category-plate-1993';
import {
  acrylicTentSign,
  ceilingHangingSign,
  getBackTexture,
  peekBackTexture,
  shelfTopperSign,
  wallSign,
  wireSnapFrame
} from './sign-fixtures';
import { tryLoadUserSignArtTexture } from '../user-assets';
import {
  createBrandLogoBodyTexture,
  createBrandLogoTextTexture,
  createNewReleasesSignTexture,
  createNewReleasesStarBadgeTexture
} from '../canvas-textures';
import { dressing93Active } from '../genre-colors';
import { getActiveTheme } from '../themes';
import { createExtrudedMaterials, create3DDoubleLayeredSign, create3DExtrudedSign } from '../sign-builders';
import { SECTION_COLS, BOX_SPACING } from '../store-layout';

export interface SignSlot {
  id: string;
  category: string;
  pos: THREE.Vector3;
  yaw: number;
  genreName?: string; // resolved genre/library name for ceiling-nav
  length?: number; // length of wall run
  localZ?: number; // local Z offset for wall signs
  // #41: when true the rendered sign(s) must stay within `length` (wall run is
  // bounded by corners, e.g. the stepped back-right notch). When false/absent
  // the single-sign fallback may render wider than the shelf run because the
  // wall itself continues past it (e.g. the right wall).
  fit?: boolean;
  // Ceiling height the hanger wires reach up to, for ceiling-hanging slots
  // under the dropped cash-wrap soffit (default: the 13.5 ft main deck).
  ceilingY?: number;
}

export function clearActiveSignage(scene: THREE.Scene, activeSignageObjects: THREE.Object3D[]) {
  activeSignageObjects.forEach(obj => {
    scene.remove(obj);
    obj.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  });
  activeSignageObjects.length = 0;
}

// Bumped on every buildSignage() call so in-flight user sign-art loads from a
// previous store build (theme change, rebuild) discard themselves instead of
// swapping onto torn-down meshes.
let signArtGeneration = 0;

// Swap a loaded user sign-art texture onto every material under `root` that
// shows `procTex` (or its flipped back-face twin). Materials are CLONED
// before the swap: sign materials can be shared across slots (the New
// Releases wall runs share one extruded-material set), and a per-slot
// override must never bleed onto a sibling slot's meshes.
function swapSignArtOntoRoot(root: THREE.Object3D, procTex: THREE.Texture, artTex: THREE.Texture) {
  const procBack = peekBackTexture(procTex);
  let artBack: THREE.Texture | null = null;
  root.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let changed = false;
    const next = mats.map(m => {
      const mat = m as THREE.MeshStandardMaterial;
      if (!mat || !mat.isMaterial) return m;
      if (mat.map === procTex) {
        const clone = mat.clone();
        clone.map = artTex;
        changed = true;
        return clone;
      }
      if (procBack && mat.map === procBack) {
        if (!artBack) artBack = getBackTexture(artTex);
        const clone = mat.clone();
        clone.map = artBack;
        changed = true;
        return clone;
      }
      return m;
    });
    if (changed) {
      mesh.material = Array.isArray(mesh.material) ? next : next[0];
    }
  });
}

export function buildSignage(ctx: FixtureContext, slots: SignSlot[], activeSignageObjects: THREE.Object3D[]) {
  // Clear any existing signage first
  clearActiveSignage(ctx.scene, activeSignageObjects);

  const config = { ...DEFAULT_SIGNAGE_CONFIG };

  // Config typo guard (mirrored at build time by `npm run build` →
  // tools/list-slots.mjs --check): a key naming a slot nobody builds, or a
  // value naming a sign the catalog doesn't know, used to fall through the
  // slot loop below silently. Shipped-config problems are errors.
  for (const p of validateSignageConfig(DEFAULT_SIGNAGE_CONFIG, getSignDef)) {
    console.error(`[signage] DEFAULT_SIGNAGE_CONFIG: ${p}`);
  }
  // ...and the canonical slot-id list must track what actually gets built,
  // or the validation above (and tools/list-slots.mjs) silently drifts.
  for (const slot of slots) {
    if (!isKnownSignageSlotId(slot.id)) {
      console.error(
        `[signage] slot '${slot.id}' is built but not registered in ` +
        `STATIC_SIGNAGE_SLOT_IDS (signage-config.ts) — add it so config ` +
        `validation and tools/list-slots.mjs can see it`
      );
    }
  }

  // Support local storage overrides
  if (typeof localStorage !== 'undefined') {
    const customConfigStr = localStorage.getItem('bb_signage_config');
    if (customConfigStr) {
      try {
        const customConfig = JSON.parse(customConfigStr);
        // User overrides may reference slots of another arrangement — warn, not error.
        for (const p of validateSignageConfig(customConfig, getSignDef)) {
          console.warn(`[signage] bb_signage_config: ${p}`);
        }
        Object.assign(config, customConfig);
      } catch (e) {
        console.error('Failed to parse custom signage config:', e);
      }
    }
  }

  // ── User-asset sign art (public/user-assets/signs/ — see its README) ─────
  // Image-first override: every sign builds its procedural canvas art first,
  // then asynchronously tries user-assets/signs/<slotId|signId>/
  // {<themeId>|default}.png; the first file that exists replaces the canvas
  // texture in-place (per-slot dir wins over per-sign dir, theme variant over
  // default). No file installed = silent 404 = today's canvas art, untouched.
  const artGen = ++signArtGeneration;
  const artThemeId = getActiveTheme().id;
  // procedural texture → roots still showing it; when the last root swaps to
  // user art the canvas texture (and its back twin) is disposed.
  const artPendingRoots = new Map<THREE.Texture, Set<THREE.Object3D>>();

  const attemptUserSignArt = (root: THREE.Object3D, procTex: THREE.Texture, keys: string[]) => {
    let waiting = artPendingRoots.get(procTex);
    if (!waiting) artPendingRoots.set(procTex, waiting = new Set());
    waiting.add(root);
    tryLoadUserSignArtTexture(keys, artThemeId, (artTex) => {
      if (artGen !== signArtGeneration) {
        artTex.dispose(); // store was rebuilt while this loaded
        return;
      }
      // Match the procedural sign texture's sampling (toSignTexture: sRGB —
      // set by the loader — mipmapped linear filtering, anisotropy).
      artTex.anisotropy = procTex.anisotropy;
      swapSignArtOntoRoot(root, procTex, artTex);
      const set = artPendingRoots.get(procTex);
      if (set) {
        set.delete(root);
        if (set.size === 0) {
          peekBackTexture(procTex)?.dispose();
          procTex.dispose();
          artPendingRoots.delete(procTex);
        }
      }
      ctx.requestRender(); // render-on-demand: poke a frame
    });
  };

  // Texture and material caches to share across identical signs
  const textureCache = new Map<string, THREE.Texture>();
  const extrudedMatsCache = new Map<string, THREE.MeshStandardMaterial[]>();
  
  const getCachedTexture = (signId: string, textureFactory: () => THREE.Texture): THREE.Texture => {
    let tex = textureCache.get(signId);
    if (!tex) {
      tex = textureFactory();
      textureCache.set(signId, tex);
    }
    return tex;
  };
  
  let nrLogoBodyMats: THREE.MeshStandardMaterial[] | null = null;
  let nrLogoYellowMats: THREE.MeshStandardMaterial[] | null = null;

  const getLogoMaterials = () => {
    if (!nrLogoBodyMats || !nrLogoYellowMats) {
      const bodyTex = getCachedTexture('logo-body', () => createBrandLogoBodyTexture());
      const yellowTex = getCachedTexture('logo-yellow', () => createBrandLogoTextTexture());
      nrLogoBodyMats = createExtrudedMaterials(bodyTex, 4);
      nrLogoYellowMats = createExtrudedMaterials(yellowTex, 2);
    }
    return { bodyMats: nrLogoBodyMats, yellowMats: nrLogoYellowMats };
  };

  const getCachedExtrudedMats = (signId: string, textureFactory: () => THREE.Texture): THREE.MeshStandardMaterial[] => {
    let mats = extrudedMatsCache.get(signId);
    if (!mats) {
      const tex = getCachedTexture(signId, textureFactory);
      mats = createExtrudedMaterials(tex, 4);
      extrudedMatsCache.set(signId, mats);
    }
    return mats;
  };

  slots.forEach(slot => {
    console.log(`[Signage Debug] Processing slot: ${slot.id} category: ${slot.category}`);
    const signDefId = config[slot.id];

    // Explicitly omitted
    if (signDefId === null) {
      return;
    }

    // Determine target sign ID
    let activeSignId = signDefId;
    if (slot.category === 'ceiling-nav') {
      if (!activeSignId || activeSignId === 'auto') {
        activeSignId = `ceiling-nav-${slot.genreName || 'MOVIES'}`;
      }
    }

    if (!activeSignId) {
      return;
    }

    const signDef = getSignDef(activeSignId);
    if (!signDef) {
      console.warn(`Signage System: Sign definition not found for ID: ${activeSignId}`);
      return;
    }

    // Period-pack signs belong to the era they were measured from. A sign
    // tagged `dressing: '1993'` is part of the 1993 footage pack and deploys
    // on the 1993 era, full stop. DEFAULT_SIGNAGE_CONFIG places by SLOT
    // and has no era vocabulary of its own, so before this the closed-lane
    // counter tent stood on the 1990, 2000 and 2010 counters too: a 1993 prop
    // in three eras it never existed in. Gating on the def (data) rather than
    // on the slot (a special case in the placer) keeps the next period pack a
    // registry entry instead of another branch here.
    if (signDef.dressing === '1993' && !dressing93Active()) {
      return;
    }

    // Custom rendering path for New Releases Wall topper slots
    // This replicates the original alternating text/logo pattern along the wall run length.
    // (#41: no minimum length — short runs like the stepped-corner walls take
    // the single auto-sized fallback below instead of a fixed 11ft wallSign
    // that would overhang a run shorter than itself.)
    if (slot.category === 'wall-newrelease' && slot.length) {
      // 1990: no painted/lettered wall — owner ruling (2026-08-03). Genre
      // signage in that era lives on propped ticket cards on the gondola
      // tops (genre-signboard-1990), not this wall run; the
      // wall itself carries only the wall-stripe-1990.ts stripe.
      if (getActiveTheme().id === 'bb-1990') return;
      const wallGroup = new THREE.Group();
      wallGroup.position.copy(slot.pos);
      wallGroup.rotation.y = slot.yaw;
      ctx.scene.add(wallGroup);
      activeSignageObjects.push(wallGroup);

      const length = slot.length;
      const localZ = slot.localZ ?? 0.08;

      // 2000 theme: the footage New Releases wall carries GOLD-STAR BADGES (a
      // cream star on a gold disc, "New Releases" in purple across it), not the
      // ticket-logo + text band. Space badges along the run in place of the
      // repeating pairs below.
      if (getActiveTheme().id === 'bb-2000') {
        const badgeSize = 3.6; // ft — big emblem incl. its periwinkle backing halo
        const badgeY = 1.0;    // raised: more clear band above the shelf wall
        const badgeTex = getCachedTexture(`${activeSignId}#badge-2000`, () => createNewReleasesStarBadgeTexture());
        const badgeMat = new THREE.MeshStandardMaterial({
          map: badgeTex,
          transparent: true,
          alphaTest: 0.35,
          // Toned down (was full-white map, glossy): a muted diffuse + higher
          // roughness so the gold badges read printed on the wall instead of
          // glowing off it.
          color: 0xc6c1b4,
          roughness: 0.72,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });
        const badgeGeo = new THREE.PlaneGeometry(badgeSize, badgeSize);
        const pitch = 18.0; // ft between badge centers — sparse (halved from 9)
        const n = Math.max(1, Math.round(length / pitch));
        // Wider end inset so the outermost badges sit clear of the corners
        // instead of crowding right up against them.
        const endInset = 1.2;
        const usable = Math.max(0, length - badgeSize - 2 * endInset);
        for (let i = 0; i < n; i++) {
          const x = n > 1 ? -length / 2 + badgeSize / 2 + endInset + (usable * i) / (n - 1) : 0;
          const badge = new THREE.Mesh(badgeGeo, badgeMat);
          badge.position.set(x, badgeY, localZ);
          badge.layers.set(1);
          wallGroup.add(badge);
        }
        attemptUserSignArt(wallGroup, badgeTex,
          slot.id === activeSignId ? [slot.id] : [slot.id, activeSignId]);
        return;
      }

      const signW = 11.0;
      const signH = signW / 6.6666;
      const logoW = 2.6;
      const logoH = logoW / 1.6666;
      const margin = 0.2;

      // #143: the ticket logo and the "NEW RELEASES" lettering read as one
      // unit — logo, then the text close to its right — and that unit
      // repeats every two shelf-lengths of plain wall, on and on down the
      // run. The old design alternated individually-spaced text/logo
      // elements evenly across the whole run, so a logo sat the same
      // distance from the text on EITHER side of it and never read as
      // "logo followed by text"; it also meant just one logo+text combo
      // total on a long run (the rest of the elements were bare text).
      const logoTextGap = 0.15; // close together, per the filed feedback
      const pairWidth = logoW + logoTextGap + signW;
      // The 1993 footage shows the wall band's "NEW RELEASES" as FLAT paint
      // on the gold band, not dimensional letters — bb-90s drops the
      // extrusion to a print-thin skin; other themes keep the deep letters.
      const extrudeDepth = dressing93Active() ? 0.02 : 0.1667;
      const shelfLenUnit = SECTION_COLS * BOX_SPACING; // "one shelf length"
      const pairPitch = pairWidth + 2 * shelfLenUnit; // + two bare shelf-lengths before the next pair

      const logoMats = getLogoMaterials();
      const textMats = getCachedExtrudedMats('new-releases-wall', () => createNewReleasesSignTexture());

      if (pairWidth + 2 * margin <= length) {
        const cStart = -length / 2 + pairWidth / 2 + margin;
        const cEnd = length / 2 - pairWidth / 2 - margin;
        const availableSpan = cEnd - cStart;
        const numPairs = availableSpan > 0 ? Math.max(1, Math.floor(availableSpan / pairPitch) + 1) : 1;

        for (let i = 0; i < numPairs; i++) {
          const baseX = numPairs > 1 ? cStart + (cEnd - cStart) * i / (numPairs - 1) : (cStart + cEnd) / 2;

          const logoItem = create3DDoubleLayeredSign(logoMats.bodyMats, logoMats.yellowMats, logoW, logoH, extrudeDepth, Math.min(0.0417, extrudeDepth));
          logoItem.position.set(baseX - pairWidth / 2 + logoW / 2, 0, localZ);
          wallGroup.add(logoItem);

          const textItem = create3DExtrudedSign(textMats, signW, signH, extrudeDepth);
          textItem.position.set(baseX + pairWidth / 2 - signW / 2, 0, localZ);
          wallGroup.add(textItem);
        }
      } else {
        // #54: one canonical lettering size on every wall — the catalog's 11ft
        // sign, the same size each element of the multi-sign runs uses. The old
        // auto-sizer stretched the single-sign fallback to the wall run (up to
        // 24ft on the right wall), so every wall showed different-sized text.
        // Fit-bounded runs shorter than the canonical sign (the stepped-corner
        // notch walls) keep the canonical HEIGHT — identical letter height on
        // every wall — and only clamp the width to stay inside the run,
        // compressing the lettering horizontally rather than shrinking it.
        const maxW = slot.fit ? Math.max(2.0, length - 2 * margin) : signW;
        const signWAuto = Math.min(signW, maxW);
        const itemMesh = create3DExtrudedSign(textMats, signWAuto, signH, extrudeDepth);
        itemMesh.position.set(0, 0, localZ);
        wallGroup.add(itemMesh);
      }
      // User-asset override targets the repeating "NEW RELEASES" lettering
      // texture (the ticket logos beside it keep their own art). textMats
      // shares this exact texture instance via getCachedExtrudedMats above.
      attemptUserSignArt(
        wallGroup,
        getCachedTexture('new-releases-wall', () => createNewReleasesSignTexture()),
        slot.id === activeSignId ? [slot.id] : [slot.id, activeSignId]
      );
      return;
    }

    // Standard single-fixture rendering path
    const texture = getCachedTexture(activeSignId, () => signDef.texture());
    let fixtureMesh: THREE.Object3D | null = null;
    const { w, h } = signDef.size;

    switch (signDef.fixture) {
      case 'acrylic-tent':
        fixtureMesh = acrylicTentSign(texture, w, h);
        break;
      case 'ceiling-hanging': {
        // 1993 ceiling-nav category plates are SOLID rounded die-cut bodies
        // (fixtures/category-plate-1993.ts — owner rulings feedback/049 +
        // 2026-08-09). Promo hangers and other themes stay rectangular
        // framed boxes.
        const nav93 = dressing93Active() && slot.category === 'ceiling-nav';
        fixtureMesh = nav93
          ? buildCategoryPlate1993(texture, w, h, slot.ceilingY ?? 13.5)
          : ceilingHangingSign(texture, w, h, slot.ceilingY ?? 13.5, slot.pos.y);
        break;
      }
      case 'shelf-topper':
        fixtureMesh = shelfTopperSign(texture, w, h);
        break;
      case 'wall':
        fixtureMesh = wallSign(texture, w, h);
        break;
      case 'wire-frame':
        const hasPost = slot.category === 'register';
        fixtureMesh = wireSnapFrame(texture, w, h, hasPost);
        break;
    }

    if (fixtureMesh) {
      // Image-first art: swap in user-assets/signs/ art when installed
      // (per-slot dir wins over per-sign dir; silent fallback otherwise).
      attemptUserSignArt(fixtureMesh, texture,
        slot.id === activeSignId ? [slot.id] : [slot.id, activeSignId]);

      // Position and Rotate
      if (signDef.fixture === 'ceiling-hanging') {
        // ceilingHangingSign builds wires dynamically down from ceilingY to slot.pos.y.
        // The group is placed at Y=0.
        fixtureMesh.position.set(slot.pos.x, 0, slot.pos.z);
      } else {
        fixtureMesh.position.copy(slot.pos);
      }
      if (signDef.fixture === 'ceiling-hanging') {
        // Ceiling-nav panels are built with their broad axis on Z (width x
        // height in X/Y, thin depth on Z — see ceilingHangingSign's panelGeo).
        // Their slot yaw is computed at slot creation to aim the +Z broad face
        // (frontMat) at the middle of the checkout counter; any other
        // ceiling-hanging slot keeps the legacy entrance-facing yaw=0 (#33).
        fixtureMesh.rotation.y = slot.category === 'ceiling-nav' ? slot.yaw : 0;
      } else {
        fixtureMesh.rotation.y = slot.yaw;
      }

      ctx.scene.add(fixtureMesh);
      activeSignageObjects.push(fixtureMesh);

      // Register collision for interactable/obstacle countertop signs
      if (slot.category === 'register' || slot.category === 'shelf' || slot.category === 'candy') {
        fixtureMesh.traverse(child => {
          if (child instanceof THREE.Mesh) {
            ctx.addCollider(child);
          }
        });
      }
    }
  });
}
