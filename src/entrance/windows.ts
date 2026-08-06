// Storefront window-bay builder (T05): the customer-facing glazed front wall
// — a solid knee wall (a real video store never ran glass to the carpet) with
// glass and mullions above it. Generalizes three-scene.ts's old
// fixed-column `createWindowSection` into a per-pane layout so
// `StorefrontSpec.windowBays` (frame color, optional center mullion, per-bay
// width) is the single source of truth three-scene.ts's poster placement also
// reads from (see `panes` below).
//
// Pane spec (user direction): every pane is EXACTLY 4 ft wide
// (WINDOW_BAY_TARGET_WIDTH). With an entrance gap the bays split into two
// equal WINGS flanking the vestibule, each wing's panes flush against it —
// the glazing no longer runs across the vestibule span (the vestibule's own
// glazed front wall, with the doors/sidelights/transom, owns that stretch).
import * as THREE from 'three';
import { StorefrontSpec, mapWallSegmentUV } from '../store-layout';
import { getActiveTheme, themeKneeGoldHex } from '../themes';
import { createGlassSurfaceNormalMap, useCheapMaterials } from '../canvas-textures';
import { addGlassReflectionPane } from '../glass-reflection';

export interface WindowBaysResult {
  group: THREE.Group;
  // Full glazed-run span: outer pane edge to outer pane edge, entrance gap
  // included. The interior corner-margin fill and the exterior brick returns
  // start where this span ends.
  width: number;
  // Local-X interval of each pane, left -> right (a gap in the middle where
  // the entrance vestibule sits). Consumers (poster placement / mount
  // surfaces) read each pane's own [lo, hi] instead of assuming equal
  // division across one contiguous run.
  panes: { lo: number; hi: number }[];
}

export function buildWindowBays(
  spec: Pick<StorefrontSpec, 'windowBays' | 'frameColor'>,
  height: number,
  kneeGap?: { center: number; halfWidth: number },
  // The room's drywall material plus the storeWidth x roomHeight frame its
  // texture repeat is sized for, so the knee wall can be mapped onto the same
  // surface as the walls around it. Omitted (standalone/preview callers) the
  // knee falls back to its own flat theme-gold paint.
  kneeSurface?: { material: THREE.Material; storeWidth: number; roomHeight: number },
): WindowBaysResult {
  const bays = spec.windowBays;
  const group = new THREE.Group();
  const KNEE_H = 2.0; // knee-wall height (ft), matches three-scene.ts's KNEE_EXT_H

  // Wings: with an entrance gap, the bays split half/half around it and sit
  // flush against its edges; without one, they run as one contiguous strip.
  interface Wing { lo: number; hi: number; widths: number[] }
  const sum = (list: { width: number }[]) => list.reduce((s, b) => s + b.width, 0);
  const wings: Wing[] = [];
  if (kneeGap) {
    const half = Math.floor(bays.length / 2);
    const leftBays = bays.slice(0, half);
    const rightBays = bays.slice(half);
    const gLo = kneeGap.center - kneeGap.halfWidth;
    const gHi = kneeGap.center + kneeGap.halfWidth;
    if (leftBays.length) wings.push({ lo: gLo - sum(leftBays), hi: gLo, widths: leftBays.map((b) => b.width) });
    if (rightBays.length) wings.push({ lo: gHi, hi: gHi + sum(rightBays), widths: rightBays.map((b) => b.width) });
  } else {
    const total = sum(bays);
    wings.push({ lo: -total / 2, hi: total / 2, widths: bays.map((b) => b.width) });
  }
  const width = wings[wings.length - 1].hi - wings[0].lo;

  // Glass pane material — starts at the knee wall, not the floor.
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xddf0ff,
    transparent: true,
    // 0.12 -> 0.06 (matches three-scene.ts createWindowSection): the higher
    // opacity veiled the whole exterior in uniform gray.
    opacity: 0.06,
    roughness: 0.05,
    metalness: 0.0,
    envMapIntensity: 1.2,
    // Faint "living glass" surface (matches the store side-wall + vestibule
    // glass): a low-amplitude clearcoat normal so highlights ripple subtly like
    // real float glass, without frosting the transmitted image. Dropped on
    // quality low (see setCheapMaterials in canvas-textures.ts).
    ...(useCheapMaterials() ? {} : {
      clearcoat: 0.4,
      clearcoatRoughness: 0.05,
      clearcoatNormalMap: createGlassSurfaceNormalMap(),
      clearcoatNormalScale: new THREE.Vector2(0.1, 0.1),
    }),
    side: THREE.DoubleSide,
  });
  // Constant effective reflection strength across day/night display gains
  // (1.2 x the day gain 1.3) — see StoreScene.applyExteriorEnvClamp.
  glassMat.userData.envGainTarget = 1.56;

  // Theme-driven frame color (frameColorOverride) wins over the storefront
  // preset's frameColor when the active theme defines one — see StoreTheme.frameColorOverride.
  const resolvedFrameColor = getActiveTheme().frameColorOverride ?? spec.frameColor;
  const frameMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(resolvedFrameColor),
    roughness: 0.5,
    metalness: 0.8,
  });
  const frameThickness = 0.2;
  const frameDepth = 0.3;

  // Solid knee wall + trim, finished in the store's amber-gold with a navy cap
  // and base to match the interior trim. One segment per wing (the vestibule
  // gap keeps the doors on the floor; the corner margins beyond the glazed run
  // are solid wall handled by the room shell, not by this group).
  // Shares the room's drywall material when the caller supplies it, so the
  // band under the glazing carries the same paint, mottle and contact AO as
  // the wall segments it butts at either end (see kneeSurface). The standalone
  // fallback is theme-derived — this was the pre-theming hardcode 0xc39316,
  // which stayed the house trim color in every theme — at the wall's effective
  // roughness (wallMat's 0.92 scaled by its ~0.72 roughnessMap base).
  const kneeMat = kneeSurface?.material ?? new THREE.MeshStandardMaterial({
    color: new THREE.Color(themeKneeGoldHex()), roughness: 0.66, metalness: 0.0,
  });
  const kneeTrimMat = new THREE.MeshStandardMaterial({ color: 0x001030, roughness: 0.55, metalness: 0.05 });
  wings.forEach(({ lo, hi }) => {
    const segW = hi - lo;
    const cxSeg = (lo + hi) / 2;
    const kneeGeo = new THREE.BoxGeometry(segW, KNEE_H, 0.3);
    // Floor-mounted, so vBottom 0 — samples the wall texture's bottom rows
    // just like the full-height corner margins flanking this run.
    if (kneeSurface) {
      mapWallSegmentUV(kneeGeo, segW, KNEE_H, 0, kneeSurface.storeWidth, kneeSurface.roomHeight);
    }
    const wall = new THREE.Mesh(kneeGeo, kneeMat);
    wall.position.set(cxSeg, KNEE_H / 2, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.12, 0.4), kneeTrimMat);
    cap.position.set(cxSeg, KNEE_H + 0.06, 0);
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);
    // #134: 0.2ft tall, matching the solid walls' baseboardMat trim exactly
    // (three-scene.ts) so the two read as one continuous baseboard height
    // instead of stepping up/down at every corner where a window wall meets
    // a solid one.
    const kick = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.2, 0.34), kneeTrimMat);
    kick.position.set(cxSeg, 0.1, 0);
    kick.receiveShadow = true;
    group.add(kick);
  });

  // Per-wing glass + frames + dividers.
  const panes: { lo: number; hi: number }[] = [];
  const mullionGeo = new THREE.BoxGeometry(frameThickness * 0.7, height - KNEE_H, frameDepth * 0.7);
  wings.forEach((wing, wi) => {
    const wingW = wing.hi - wing.lo;
    const wingC = (wing.lo + wing.hi) / 2;

    // Glass — one sheet per wing, knee wall to head.
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(wingW, height - KNEE_H), glassMat);
    glass.position.set(wingC, KNEE_H + (height - KNEE_H) / 2, 0);
    glass.receiveShadow = true;
    group.add(glass);
    // ...and the reflection the pane above cannot show. Its 0.06 opacity is
    // load-bearing — it keeps the sheet from veiling the exterior — but three
    // multiplies the env reflection by that same alpha, so the fresnel mirror
    // this material's comments describe was arriving at 6% and reading as
    // flat grey film. The additive pane restores it without touching what the
    // glass transmits (glass-reflection.ts).
    addGlassReflectionPane(glass, group);

    // Outer border frames (per wing): sill on the knee wall, head, and the
    // two verticals. The vertical on the vestibule side sits just OUTSIDE the
    // pane run, bridging the small clearance sliver to the vestibule's own
    // glazed wall so the run terminates cleanly against the entrance.
    const horizGeo = new THREE.BoxGeometry(wingW, frameThickness, frameDepth);
    const bottomFrame = new THREE.Mesh(horizGeo, frameMat);
    bottomFrame.position.set(wingC, KNEE_H + frameThickness / 2, 0);
    const topFrame = new THREE.Mesh(horizGeo, frameMat);
    topFrame.position.set(wingC, height - frameThickness / 2, 0);
    // Vestibule-side verticals run the full height (they terminate against
    // the vestibule's floor-to-ceiling glazing); wall-side ends stop at the
    // sill like the dividers — they used to run to the floor, burying a
    // charcoal bar down the knee wall's face (feedback/041).
    const vertGeo = new THREE.BoxGeometry(frameThickness, height, frameDepth);
    const vertSillGeo = new THREE.BoxGeometry(frameThickness, height - KNEE_H, frameDepth);
    const sillVertY = KNEE_H + (height - KNEE_H) / 2;
    const isLeftWing = kneeGap ? wi === 0 : false;
    const innerAtHi = isLeftWing; // left wing's vestibule-side edge is its hi end
    const leftIsVestibule = !!kneeGap && !innerAtHi;
    const leftVert = new THREE.Mesh(leftIsVestibule ? vertGeo : vertSillGeo, frameMat);
    leftVert.position.set(
      leftIsVestibule ? wing.lo - frameThickness / 2 : wing.lo + frameThickness / 2,
      leftIsVestibule ? height / 2 : sillVertY, 0);
    const rightIsVestibule = !!kneeGap && innerAtHi;
    const rightVert = new THREE.Mesh(rightIsVestibule ? vertGeo : vertSillGeo, frameMat);
    rightVert.position.set(
      rightIsVestibule ? wing.hi + frameThickness / 2 : wing.hi - frameThickness / 2,
      rightIsVestibule ? height / 2 : sillVertY, 0);
    [bottomFrame, topFrame, leftVert, rightVert].forEach((f) => {
      f.castShadow = true;
      f.receiveShadow = true;
      group.add(f);
    });

    // Pane boundaries within the wing, in build order left -> right.
    const edges: number[] = [wing.lo];
    wing.widths.forEach((w) => edges.push(edges[edges.length - 1] + w));
    for (let i = 0; i < wing.widths.length; i++) panes.push({ lo: edges[i], hi: edges[i + 1] });

    // Grid vertical dividers between panes — only through the glazed span
    // above the knee wall.
    const dividerGeo = new THREE.BoxGeometry(frameThickness, height - KNEE_H, frameDepth);
    for (let i = 1; i < edges.length - 1; i++) {
      const divider = new THREE.Mesh(dividerGeo, frameMat);
      divider.position.set(edges[i], KNEE_H + (height - KNEE_H) / 2, 0);
      divider.castShadow = true;
      divider.receiveShadow = true;
      group.add(divider);
    }
  });

  // Optional center mullion within a pane — a thinner divider splitting that
  // pane's glass in two, per StorefrontSpec.windowBays[i].hasCenterMullion.
  bays.forEach((b, i) => {
    if (!b.hasCenterMullion || !panes[i]) return;
    const centerX = (panes[i].lo + panes[i].hi) / 2;
    const mullion = new THREE.Mesh(mullionGeo, frameMat);
    mullion.position.set(centerX, KNEE_H + (height - KNEE_H) / 2, 0);
    mullion.castShadow = true;
    mullion.receiveShadow = true;
    group.add(mullion);
  });

  // No waist rail: the real building's glazing runs as one clean pane per bay
  // from the knee wall to the head — only the outer frame + bay dividers.
  return { group, width, panes };
}
