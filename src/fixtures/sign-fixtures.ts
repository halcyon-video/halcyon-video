import * as THREE from 'three';
import { createExtrudedMaterials, create3DExtrudedSign } from '../sign-builders';

const backTextureCache = new WeakMap<THREE.Texture, THREE.Texture>();

// The already-built flipped twin of `tex`, if one exists — used by the
// user-asset sign-art swap (fixtures/signage.ts) to find which materials
// carry the back face without creating flips it doesn't need.
export function peekBackTexture(tex: THREE.Texture): THREE.Texture | undefined {
  return backTextureCache.get(tex);
}

// Helper to copy the canvas and create a distinct texture flipped horizontally for readable double-sided signs
export function getBackTexture(tex: THREE.Texture): THREE.Texture {
  if (backTextureCache.has(tex)) {
    return backTextureCache.get(tex)!;
  }

  let backTex: THREE.Texture;
  if (tex.image instanceof HTMLCanvasElement) {
    const originalCanvas = tex.image;
    const newCanvas = document.createElement('canvas');
    newCanvas.width = originalCanvas.width;
    newCanvas.height = originalCanvas.height;
    const ctx = newCanvas.getContext('2d');
    if (ctx) {
      // Draw horizontally flipped
      ctx.translate(newCanvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(originalCanvas, 0, 0);
    }
    backTex = new THREE.CanvasTexture(newCanvas);
    backTex.colorSpace = tex.colorSpace;
    backTex.minFilter = tex.minFilter;
    backTex.magFilter = tex.magFilter;
    backTex.generateMipmaps = tex.generateMipmaps;
    // Carry the front's anisotropy across — the back face of a hanging sign is
    // seen at exactly the same grazing angles, and dropping to the default 1
    // here would leave every double-sided sign shimmering from one side.
    backTex.anisotropy = tex.anisotropy;
  } else {
    backTex = tex.clone();
    backTex.wrapS = THREE.RepeatWrapping;
    backTex.repeat.x = -1;
    backTex.offset.x = 1;
  }

  backTextureCache.set(tex, backTex);
  return backTex;
}

export function acrylicTentSign(texture: THREE.Texture, width: number, height: number): THREE.Group {
  const group = new THREE.Group();

  const angle = 10 * Math.PI / 180; // 10 degrees tilt
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // Position center so the bottom of the sloped faces sits exactly at local Y = 0
  const centerY = (height / 2) * cosA;
  const zOffset = (height / 2) * sinA;

  // 1. Paper inserts (double sided)
  const paperMatFront = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  const paperMatBack = new THREE.MeshStandardMaterial({
    map: getBackTexture(texture),
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  const paperGeo = new THREE.PlaneGeometry(width, height);

  // #37: rotation signs below are intentionally the OPPOSITE of the naive
  // "tilt each panel away from centre" guess. With position.set(0,centerY,±zOffset)
  // fixed, rotating a panel by +angle pins its LOCAL-Y=-height/2 edge (the
  // bottom of the printed card) to world (y=0,z=0) and spreads its top edge
  // outward/up — i.e. the two panels' BOTTOMS meet at a point and the tops
  // fan out, an upside-down "Λ" resting on its apex. Using -angle for the
  // side placed at +zOffset (and +angle for -zOffset) instead pins each
  // panel's TOP edge to the shared ridge (z=0, high up) and spreads the
  // BOTTOM edges apart at y=0 — feet on the table, apex up, text upright.
  const paperFront = new THREE.Mesh(paperGeo, paperMatFront);
  paperFront.position.set(0, centerY, zOffset);
  paperFront.rotation.x = -angle;
  paperFront.castShadow = true;
  paperFront.receiveShadow = true;
  group.add(paperFront);

  const paperBack = new THREE.Mesh(paperGeo, paperMatBack);
  paperBack.position.set(0, centerY, -zOffset);
  paperBack.rotation.x = angle;
  paperBack.castShadow = true;
  paperBack.receiveShadow = true;
  group.add(paperBack);

  // 2. Clear acrylic outer sheets (folded A-frame)
  // #99: no `transmission` (see four-sided-display.ts's comment) -- these tent
  // signs are small but numerous and near-eye-level, so they were an easy way
  // to keep the transmission pass alive.
  //
  // The sleeve is CLEAR and must not tint the card inside it. A translucent
  // WHITE sheet (color 0xffffff at opacity 0.25) laid a quarter of a coat of
  // white over every tent card in the store: the Please Rewind insert's
  // royal blue came out pale lavender and its gold went chalk (user report:
  // "this sign is faded"). Same fault, same cure as the return chute's acrylic
  // plate (entrance/return-slot.ts): a near-black base under AdditiveBlending
  // contributes NO diffuse at all, leaving only the dielectric specular term
  // (F0 ~4%, Fresnel-boosted toward grazing) — so the print keeps its full
  // saturation and the sleeve is pure reflection. depthWrite off so an
  // additive layer can't punch a hole in the depth buffer.
  const acrylicMat = new THREE.MeshPhysicalMaterial({
    color: 0x04060a,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 1.0,
    roughness: 0.05,
    metalness: 0.0, // dielectric acrylic — the 0.1 metal term tinted the env glare
    side: THREE.DoubleSide,
    // Clamp the near-mirror pane's reflection across day/night display gains
    // (see StoreScene.applyExteriorEnvClamp) so the sleeves don't glow at night.
    envMapIntensity: 0.8,
  });
  acrylicMat.userData.envGainTarget = 0.76;

  const sheetGeo = new THREE.PlaneGeometry(width + 0.04, height + 0.04);

  const sheetFront = new THREE.Mesh(sheetGeo, acrylicMat);
  sheetFront.position.set(0, centerY, zOffset + 0.005);
  sheetFront.rotation.x = -angle;
  group.add(sheetFront);

  const sheetBack = new THREE.Mesh(sheetGeo, acrylicMat);
  sheetBack.position.set(0, centerY, -zOffset - 0.005);
  sheetBack.rotation.x = angle;
  group.add(sheetBack);

  // Bottom acrylic connection base
  const baseW = width + 0.04;
  const baseD = zOffset * 2 + 0.02;
  const baseGeo = new THREE.PlaneGeometry(baseW, baseD);
  const base = new THREE.Mesh(baseGeo, acrylicMat);
  base.position.set(0, 0.001, 0);
  base.rotation.x = -Math.PI / 2;
  group.add(base);

  return group;
}

export function ceilingHangingSign(
  texture: THREE.Texture,
  width: number,
  height: number,
  ceilingY: number,
  signY: number,
  opts: {
    /** Shear the panel into a parallelogram (x-offset per unit y). */
    skew?: number;
    /** Small rotated-square accent chip hung off the panel's left end. */
    accentColor?: string;
    /** The texture is a die-cut shape on a transparent field (bb-90s ribbon
     * genre panels): render as two back-to-back alpha-cut planes instead of
     * a framed box. */
    dieCut?: boolean;
  } = {}
): THREE.Group {
  const group = new THREE.Group();

  if (opts.dieCut) {
    // Ceiling-attached WEDGE (feedback/049): the pair of flat cards dangling
    // on long wires read as "floating and disconnected". The owner's spec:
    // a wedge-shaped body with real depth, attached to the ceiling, carrying
    // the artwork on each side. End-on it is a shallow ∇ — a flat mounting
    // cap on the ceiling, the two die-cut faces sloping down to a shared
    // bottom keel, each tilted a few degrees outward so it reads squarely
    // from a shopper's eye-line down the aisle.
    const mkMat = (tex: THREE.Texture) => new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.6,
      metalness: 0.0,
      transparent: true,
      alphaTest: 0.1,
    });
    const tilt = 13 * Math.PI / 180;
    const capT = 0.05;
    const capY = ceilingY - capT / 2; // mounting cap hugs the ceiling plane
    const keelY = ceilingY - capT - height * Math.cos(tilt);
    const planeGeo = new THREE.PlaneGeometry(width, height);
    const front = new THREE.Mesh(planeGeo, mkMat(texture));
    front.position.set(0, keelY + (height / 2) * Math.cos(tilt), (height / 2) * Math.sin(tilt));
    front.rotation.x = tilt;
    // No castShadow: an alpha-cut card would still throw its full-rectangle
    // silhouette without a custom depth material.
    front.receiveShadow = true;
    group.add(front);
    const back = new THREE.Mesh(planeGeo, mkMat(getBackTexture(texture)));
    back.position.set(0, keelY + (height / 2) * Math.cos(tilt), -(height / 2) * Math.sin(tilt));
    back.rotation.order = 'YXZ';
    back.rotation.y = Math.PI;
    back.rotation.x = tilt; // in the flipped frame this leans ITS top outward too
    back.receiveShadow = true;
    group.add(back);
    // Mounting cap: the "body attached to the ceiling". Kept inside the
    // die-cut banner's straight section so it never pokes past the rounded
    // ends; neutral fixture hardware, not brand color.
    const capMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.3 });
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.86, capT, height * Math.sin(tilt) * 2 + 0.06),
      capMat
    );
    cap.position.set(0, capY, 0);
    cap.receiveShadow = true;
    group.add(cap);
    return group;
  }

  // 1. Signboard double-sided box panel
  const panelThick = 0.04;
  const panelGeo = new THREE.BoxGeometry(width, height, panelThick);
  if (opts.skew) {
    // Shear x by y (x += skew·y): a leaning parallelogram. Applied directly
    // to positions — clearer than makeShear's argument-order trap.
    const pos = panelGeo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, pos.getX(i) + opts.skew * pos.getY(i));
    }
    pos.needsUpdate = true;
    panelGeo.computeVertexNormals();
  }

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x333333, // dark grey/charcoal frame border
    roughness: 0.5,
    metalness: 0.3
  });

  // Printed panel face: matte (0.6/0.0) so it takes the store light — at
  // 0.25/0.1 the baked env washed the face with a white sheen that read as
  // a glowing sign that never reacted to the room.
  const frontMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.6,
    metalness: 0.0
  });

  // #33: BoxGeometry's -Z face is built with udir=-1 (see three.js
  // BoxGeometry.buildPlane), which already mirrors U relative to +X compared
  // to the +Z face. That inherent mirror is exactly what makes the SAME
  // (unflipped) texture read forwards to someone standing behind the sign
  // looking at its back — getBackTexture()'s extra horizontal flip stacks a
  // second mirror on top and makes the back read backwards. Box panels use
  // the plain texture on both broad faces; getBackTexture (still flipped) is
  // reserved for single-sided Planes (e.g. acrylicTentSign) which have no
  // such per-face UV remap and so DO need the manual flip.
  const backMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.6, // matte print — see frontMat note
    metalness: 0.0
  });

  const materials = [
    frameMat, // +X
    frameMat, // -X
    frameMat, // +Y
    frameMat, // -Y
    frontMat, // +Z (faces the entrance, rotation.y=0 forced in signage.ts — see comment there)
    backMat   // -Z
  ];

  const panel = new THREE.Mesh(panelGeo, materials);
  panel.position.set(0, signY, 0);
  panel.castShadow = true;
  panel.receiveShadow = true;
  group.add(panel);

  // 1b. Diamond accent chip off the panel's left end (footage: a small
  // rotated square hanging beside each ceiling genre panel).
  if (opts.accentColor) {
    const chipSide = height * 0.42;
    const chipGeo = new THREE.BoxGeometry(chipSide, chipSide, panelThick);
    const chipMat = new THREE.MeshStandardMaterial({ color: opts.accentColor, roughness: 0.6, metalness: 0.0 });
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.set(-width / 2 - chipSide * 0.62, signY, 0);
    chip.rotation.z = Math.PI / 4;
    chip.castShadow = true;
    chip.receiveShadow = true;
    group.add(chip);
  }

  // 2. Twin ceiling hanger wires
  const wireMat = new THREE.MeshStandardMaterial({
    color: 0x666666, // metallic steel wire
    roughness: 0.3,
    metalness: 0.8
  });

  const wireRadius = 0.008; // very thin steel wire
  const signTopY = signY + height / 2;
  const wireHeight = Math.max(0.1, ceilingY - signTopY);
  const wireCenterY = signTopY + wireHeight / 2;

  const wireGeo = new THREE.CylinderGeometry(wireRadius, wireRadius, wireHeight, 6);

  // Left Wire
  const wireLeft = new THREE.Mesh(wireGeo, wireMat);
  wireLeft.position.set(-width / 2 + 0.4, wireCenterY, 0);
  wireLeft.castShadow = true;
  group.add(wireLeft);

  // Right Wire
  const wireRight = new THREE.Mesh(wireGeo, wireMat);
  wireRight.position.set(width / 2 - 0.4, wireCenterY, 0);
  wireRight.castShadow = true;
  group.add(wireRight);

  return group;
}

export function shelfTopperSign(texture: THREE.Texture, width: number, height: number): THREE.Group {
  const group = new THREE.Group();

  // Bottom feet have height 0.06. Center panel base is at Y = 0.06
  const panelThick = 0.03;
  const panelCenterY = 0.06 + height / 2;

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x222222, // black plastic border
    roughness: 0.6,
    metalness: 0.1
  });

  const frontMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.6, // matte print, not env-glossed — see ceilingHangingSign
    metalness: 0.0
  });

  // #33: same BoxGeometry -Z UV mirror as ceilingHangingSign — plain texture,
  // not getBackTexture (see comment there).
  const backMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.6,
    metalness: 0.0
  });

  const materials = [
    frameMat, // +X
    frameMat, // -X
    frameMat, // +Y
    frameMat, // -Y
    frontMat, // +Z
    backMat   // -Z
  ];

  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, panelThick), materials);
  panel.position.set(0, panelCenterY, 0);
  panel.castShadow = true;
  panel.receiveShadow = true;
  group.add(panel);

  // Metal mounting brackets/feet sitting at the bottom of the sign panel
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.3,
    metalness: 0.8
  });

  const footGeo = new THREE.BoxGeometry(0.04, 0.06, 0.08); // small bracket holding sign

  const footLeft = new THREE.Mesh(footGeo, metalMat);
  footLeft.position.set(-width / 2 + 0.15, 0.03, 0);
  footLeft.castShadow = true;
  group.add(footLeft);

  const footRight = new THREE.Mesh(footGeo, metalMat);
  footRight.position.set(width / 2 - 0.15, 0.03, 0);
  footRight.castShadow = true;
  group.add(footRight);

  return group;
}

export function wallSign(texture: THREE.Texture, width: number, height: number): THREE.Group {
  // Reuses three-scene's extruded sign builder.
  // We'll create standard 4-layer extruded materials and build the sign mesh.
  const mats = createExtrudedMaterials(texture, 4);
  const signGroup = create3DExtrudedSign(mats, width, height, 0.06);
  return signGroup;
}

export function wireSnapFrame(
  texture: THREE.Texture,
  width: number,
  height: number,
  hasPost: boolean = false
): THREE.Group {
  const group = new THREE.Group();

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xdddddd, // metallic chrome
    roughness: 0.15,
    metalness: 0.95
  });

  const posterMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    metalness: 0.0
  });

  // Calculate coordinates depending on whether it has a support post
  const postH = 0.4;
  const frameCenterY = hasPost ? (postH + 0.02 + height / 2) : (height / 2);

  // 1. Back plate
  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, height + 0.08, 0.02), chromeMat);
  backPlate.position.set(0, frameCenterY, 0);
  backPlate.castShadow = true;
  backPlate.receiveShadow = true;
  group.add(backPlate);

  // 2. Poster print (proud of backplate). The chrome backplate is 0.02 thick
  // (front face at z=0.01); the poster must clear it by enough to resolve in
  // the depth buffer. At 0.011 the two opaque coplanar planes sat 0.001 ft
  // apart and z-fought across the whole poster; 0.02 gives a solid 0.01 ft gap
  // while still tucking behind the frame rails (front face at z=0.03).
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(width, height), posterMat);
  poster.position.set(0, frameCenterY, 0.02);
  poster.receiveShadow = true;
  group.add(poster);

  // 3. Four thin border frame rails
  const railT = 0.04;
  const railD = 0.03;

  // Top
  const railTop = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, railT, railD), chromeMat);
  railTop.position.set(0, frameCenterY + height / 2 + railT / 2, 0.015);
  railTop.castShadow = true;
  group.add(railTop);

  // Bottom
  const railBot = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, railT, railD), chromeMat);
  railBot.position.set(0, frameCenterY - height / 2 - railT / 2, 0.015);
  railBot.castShadow = true;
  group.add(railBot);

  // Left
  const railLeft = new THREE.Mesh(new THREE.BoxGeometry(railT, height, railD), chromeMat);
  railLeft.position.set(-width / 2 - railT / 2, frameCenterY, 0.015);
  railLeft.castShadow = true;
  group.add(railLeft);

  // Right
  const railRight = new THREE.Mesh(new THREE.BoxGeometry(railT, height, railD), chromeMat);
  railRight.position.set(width / 2 + railT / 2, frameCenterY, 0.015);
  railRight.castShadow = true;
  group.add(railRight);

  // 4. Support post and base plate (optional for countertop display)
  if (hasPost) {
    // Metal Support Rod
    const postGeo = new THREE.CylinderGeometry(0.015, 0.015, postH, 8);
    const post = new THREE.Mesh(postGeo, chromeMat);
    post.position.set(0, postH / 2 + 0.01, 0);
    post.castShadow = true;
    group.add(post);

    // Weighted base plate
    const baseGeo = new THREE.BoxGeometry(0.24, 0.02, 0.24);
    const base = new THREE.Mesh(baseGeo, chromeMat);
    base.position.set(0, 0.01, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
  }

  return group;
}
