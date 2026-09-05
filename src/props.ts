import { selfLit } from './material-lighting';
// T24 — Prop asset registry: real GLB models for the CRT/VCR-era set dressing
// (ceiling ambient TVs, back-room hero TV, coffee table, VCR, DVD player).
//
// Design:
//  - Each slot maps to a GLB under public/models/ plus prep metadata (target
//    real-world width in feet, yaw fix so the prop faces -Z, and a regex that
//    identifies the screen/glass material for TVs).
//  - loadProp() fetches + parses ONCE per slot (cached promise) and prepares a
//    template: uniform-scaled to targetWidth, bounding-box centred on X/Z, and
//    seated so bbox.min.y === 0 (drop it at floor height and it sits flush).
//    instantiate() hands out clones that SHARE the template's geometry and
//    materials — repeated props (the ceiling TVs) cost one geometry upload.
//  - Original Blender decks and attributed downloaded props ship in
//    public/models/ — see its ATTRIBUTION.md. Every consumer has a
//    missing-file path: loadProp() resolves null (bad fetch OR bad magic
//    bytes) and getPropOrFallback() substitutes a correctly-sized primitive
//    so a fresh checkout never breaks.
//  - TVs expose their screen rectangle (prop-local corners + normal) so the
//    back room (T23) / ambient TVs can align a video plane to the glass
//    without knowing anything about the source model's structure.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url';

export type PropSlot = 'tv_ceiling' | 'tv_hero' | 'coffee_table' | 'vcr' | 'dvd_player' | 'balloon';

// The face of a TV tube or deck display in PROP-LOCAL space (the space of the group
// returned by instantiate(), before you position/rotate it). Transform through
// the placed instance's matrixWorld — screenRectWorld() below — to get the
// world-space rect T23's video plane needs.
export interface PropScreenRect {
  center: THREE.Vector3;
  width: number;
  height: number;
  // Unit vector the screen faces along (prop-local; -Z for all registry props).
  normal: THREE.Vector3;
  // bl, br, tr, tl as seen looking AT the screen from along `normal`.
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

export interface PropHandle {
  slot: PropSlot;
  // Prepped bounding-box size in feet (x = targetWidth by construction).
  size: THREE.Vector3;
  screenRect: PropScreenRect | null;
  // Clone of the prepped template. Geometry/materials are SHARED with the
  // template (and all other instances); only the Object3D tree is new.
  // hideScreen: turn off the model's own glass meshes so a video plane can be
  // parked on the screen rect without z-fighting.
  instantiate(opts?: { hideScreen?: boolean }): THREE.Group;
}

export interface PropInstance {
  object: THREE.Group;
  // true = real GLB; false = primitive stand-in (asset unavailable).
  real: boolean;
  size: THREE.Vector3;
  screenRect: PropScreenRect | null;
}

interface PropSpec {
  file: string;
  // Real-world width (X extent) in feet after prep.
  targetWidth: number;
  // Rotation applied before measuring, so the prepped prop faces -Z. The
  // Sketchfab models aren't downloadable in-agent, so these start at 0 and get
  // tuned once the human drops the files in (a wrong yaw shows up immediately
  // in the harness prop line-up: `npm run shot -- --props 1 ...`).
  yawFix: number;
  // Matches the screen/glass mesh or material NAME inside the GLB.
  screenMatch: RegExp | null;
  // Manual glass placement for single-material exports where no mesh/material
  // name can identify the tube: fractions of the estimated front-face rect
  // (x grows viewer-left→right, y bottom→top), plus how far (feet) the glass
  // sits behind the face's front-most point. Tuned visually per model —
  // paint the consumer's screen material magenta and iterate.
  glassFrac: { x0: number; x1: number; y0: number; y1: number; inset: number } | null;
  // Primitive stand-in dimensions (w, h, d feet) + colour for the missing-file
  // path, sized per the ticket so T23 layout work holds up before downloads.
  fallback: { w: number; h: number; d: number; color: number; screen?: { w: number; h: number; yOffset: number; xOffset?: number } };
}

const SCREEN_MATCH_DEFAULT = /glass|screen|display|crt|ecran/i;

const PROP_SPECS: Record<PropSlot, PropSpec> = {
  // "Old Television from 90's" — Zgon, CC-BY 4.0 (separate Glass material slot).
  tv_ceiling: {
    file: 'tv_ceiling.glb', targetWidth: 2.6, yawFix: 0, screenMatch: SCREEN_MATCH_DEFAULT,
    glassFrac: { x0: 0.10, x1: 0.90, y0: 0.14, y1: 0.90, inset: -0.02 },
    fallback: { w: 2.6, h: 2.2, d: 2.2, color: 0xb8bcc0, screen: { w: 2.1, h: 1.575, yOffset: 0 } },
  },
  // "TV Sony Trinitron" — LiuMeowMeow, CC-BY 4.0. ≈2.2ft wide per ticket.
  tv_hero: {
    file: 'tv_hero.glb', targetWidth: 2.2, yawFix: 0, screenMatch: SCREEN_MATCH_DEFAULT,
    glassFrac: { x0: 0.10, x1: 0.90, y0: 0.14, y1: 0.90, inset: -0.02 },
    fallback: { w: 2.2, h: 1.85, d: 1.9, color: 0x2b2b30, screen: { w: 1.75, h: 1.3, yOffset: 0.12 } },
  },
  // "Table Coffee Glass" — Kenney, CC0 (committed).
  coffee_table: {
    file: 'coffee_table.glb', targetWidth: 3.5, yawFix: 0, screenMatch: null, glassFrac: null,
    fallback: { w: 3.5, h: 1.35, d: 1.8, color: 0x7a5636 },
  },
  // Original Halcyon Blender deck; named lens also anchors the live clock.
  vcr: {
    file: 'vcr.glb', targetWidth: 1.4, yawFix: 0, screenMatch: /^DeckDisplay$/, glassFrac: null,
    fallback: { w: 1.4, h: 0.32, d: 0.95, color: 0x1c1c1f,
      screen: { w: 0.45, h: 0.07, xOffset: -0.28, yOffset: -0.054 } },
  },
  // Original Halcyon silver deck, sharing the same screen/ownership contract.
  dvd_player: {
    file: 'dvd_player.glb', targetWidth: 1.4, yawFix: 0, screenMatch: /^DeckDisplay$/, glassFrac: null,
    fallback: { w: 1.4, h: 0.18, d: 0.85, color: 0xc3c6cb,
      screen: { w: 0.245, h: 0.05, xOffset: -0.36, yOffset: 0.015 } },
  },
  // "Balloon" — Poly by Google, CC-BY 3.0. Single 11-inch latex balloon with
  // knot + curly string below; consumers tint per instance (counter-props-93).
  balloon: {
    file: 'balloon.glb', targetWidth: 0.9, yawFix: 0, screenMatch: null, glassFrac: null,
    fallback: { w: 0.9, h: 2.6, d: 0.9, color: 0xd23036 },
  },
};

// One in-flight/settled promise per slot — repeated loadProp() calls (two
// ceiling TVs, settings rebuilds) never refetch or reparse.
const cache = new Map<PropSlot, Promise<PropHandle | null>>();
// Prepped template trees (owners of the shared geometry/materials), kept
// separately so disposePropCache() can free them without exposing the
// template through the public handle.
const templates = new Map<PropSlot, THREE.Group>();

export function loadProp(slot: PropSlot): Promise<PropHandle | null> {
  let p = cache.get(slot);
  if (!p) {
    p = fetchAndPrep(slot);
    cache.set(slot, p);
  }
  return p;
}

async function fetchAndPrep(slot: PropSlot): Promise<PropHandle | null> {
  const spec = PROP_SPECS[slot];
  const url = assetUrl('models/' + spec.file);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    // Magic-byte sanity: a real GLB starts "glTF". A dev server can answer a
    // missing public asset with 200 + index.html, which would otherwise blow
    // up deep inside the parser.
    const m = new Uint8Array(buf.slice(0, 4));
    if (buf.byteLength < 12 || m[0] !== 0x67 || m[1] !== 0x6c || m[2] !== 0x54 || m[3] !== 0x46) {
      throw new Error('not a GLB (bad magic bytes)');
    }
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) =>
      new GLTFLoader().parse(buf, assetUrl('models/'), resolve, reject));
    return prepTemplate(slot, spec, gltf.scene);
  } catch (e) {
    console.info(`[props] ${slot} (${url}) unavailable — using fallback: ${(e as Error).message}`);
    return null;
  }
}

function prepTemplate(slot: PropSlot, spec: PropSpec, model: THREE.Object3D): PropHandle {
  const template = new THREE.Group();
  template.name = `prop:${slot}`;
  model.rotation.y = spec.yawFix;
  template.add(model);
  template.updateMatrixWorld(true);

  // Fit-to-bbox (same approach as the exterior cars): never trust source scale.
  let box = new THREE.Box3().setFromObject(template);
  const size = new THREE.Vector3();
  box.getSize(size);
  model.scale.multiplyScalar(spec.targetWidth / (size.x || 1));
  template.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(template);
  const center = new THREE.Vector3();
  box.getCenter(center);
  // Centre on X/Z, seat the bbox bottom on y=0 so placement is floor-flush.
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  template.updateMatrixWorld(true);
  box.setFromObject(template);
  box.getSize(size);

  // Shadow flags + tag screen meshes (clone() carries userData along).
  const screenMeshes: THREE.Mesh[] = [];
  template.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (slot === 'vcr' || slot === 'dvd_player') {
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (m.name === 'DeckPowerLamp') selfLit(m, 'light-source');
      }
    }
    if (spec.screenMatch) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const isScreen = spec.screenMatch.test(mesh.name) ||
        mats.some((mt) => !!mt && spec.screenMatch!.test(mt.name));
      if (isScreen) {
        mesh.userData.propScreen = true;
        screenMeshes.push(mesh);
      }
    }
  });

  // Screen rect: bbox of the glass meshes; the picture plane is its -Z face
  // (all registry props are prepped to face -Z).
  let screenRect: PropScreenRect | null = null;
  if (screenMeshes.length > 0) {
    const sb = new THREE.Box3();
    for (const mesh of screenMeshes) sb.expandByObject(mesh);
    screenRect = makeScreenRect(
      (sb.min.x + sb.max.x) / 2, (sb.min.y + sb.max.y) / 2, sb.min.z,
      sb.max.x - sb.min.x, sb.max.y - sb.min.y);
  } else if (spec.screenMatch) {
    screenRect = estimateFrontFaceRect(template, box, spec.glassFrac === null);
  }

  // Manual per-model refinement: carve the tuned glass region out of the raw
  // face rect (single-material exports give the code nothing better to go on).
  if (screenRect && spec.glassFrac) {
    const gf = spec.glassFrac;
    const minX = screenRect.center.x - screenRect.width / 2;
    const minY = screenRect.center.y - screenRect.height / 2;
    screenRect = makeScreenRect(
      minX + screenRect.width * (gf.x0 + gf.x1) / 2,
      minY + screenRect.height * (gf.y0 + gf.y1) / 2,
      screenRect.center.z + gf.inset,
      screenRect.width * (gf.x1 - gf.x0),
      screenRect.height * (gf.y1 - gf.y0));
  }

  templates.set(slot, template);
  return {
    slot,
    size: size.clone(),
    screenRect,
    instantiate(opts?: { hideScreen?: boolean }): THREE.Group {
      const inst = template.clone(true) as THREE.Group;
      if (opts?.hideScreen) {
        inst.traverse((o) => { if (o.userData.propScreen) o.visible = false; });
      }
      return inst;
    },
  };
}

// Screen-rect fallback for single-material exports (common on Sketchfab):
// no mesh or material name ever matches screenMatch, so there is nothing to
// tag. On a CRT the tube face is the foremost geometry — its whole bulk hangs
// behind the screen — so the bounds of the vertices in the front slab of the
// model's depth are a good stand-in for the glass rect, and unlike the full
// bbox they ignore antennas and the rear bulge. Load-time only.
function estimateFrontFaceRect(template: THREE.Group, box: THREE.Box3, clampAspect: boolean): PropScreenRect | null {
  const depth = box.max.z - box.min.z;
  if (depth <= 0) return null;
  const zSlab = box.min.z + depth * 0.08;
  const r = new THREE.Box3();
  const v = new THREE.Vector3();
  let hits = 0;
  template.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.z <= zSlab) { r.expandByPoint(v); hits++; }
    }
  });
  // A believable tube face is a decent share of the front; a handful of hits
  // means the foremost thing was a knob or an antenna tip — no rect then.
  if (hits < 24) return null;
  // The slab bounds measure the cabinet face (bezel, control panel), not the
  // glass, so they run tall on boxy console sets. When no hand-tuned glassFrac
  // will refine this rect, clamp toward 4:3 — real tubes are 4:3.
  let w = r.max.x - r.min.x;
  let h = r.max.y - r.min.y;
  if (clampAspect) {
    if (w / h < 4 / 3) h = w / (4 / 3);
    else if (w / h > 16 / 9) w = h * (16 / 9);
  }
  return makeScreenRect(
    (r.min.x + r.max.x) / 2, (r.min.y + r.max.y) / 2, box.min.z, w, h);
}

// Rect on the z = zFace plane facing -Z. Corner order: bl, br, tr, tl as seen
// looking at the screen from -Z (i.e. from in front of the TV).
function makeScreenRect(cx: number, cy: number, zFace: number, w: number, h: number): PropScreenRect {
  const hw = w / 2, hh = h / 2;
  return {
    center: new THREE.Vector3(cx, cy, zFace),
    width: w,
    height: h,
    normal: new THREE.Vector3(0, 0, -1),
    corners: [
      new THREE.Vector3(cx + hw, cy - hh, zFace), // bl (viewer's left = prop +X)
      new THREE.Vector3(cx - hw, cy - hh, zFace), // br
      new THREE.Vector3(cx - hw, cy + hh, zFace), // tr
      new THREE.Vector3(cx + hw, cy + hh, zFace), // tl
    ],
  };
}

// Transform a prop-local screen rect through a placed instance's world matrix.
// Allocates fresh vectors — call at placement time, not per-frame.
export function screenRectWorld(rect: PropScreenRect, instance: THREE.Object3D): PropScreenRect {
  instance.updateWorldMatrix(true, false);
  const m = instance.matrixWorld;
  const corners = rect.corners.map((c) => c.clone().applyMatrix4(m)) as PropScreenRect['corners'];
  const scale = new THREE.Vector3();
  m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  return {
    center: rect.center.clone().applyMatrix4(m),
    width: rect.width * scale.x,
    height: rect.height * scale.y,
    normal: rect.normal.clone().transformDirection(m),
    corners,
  };
}

// GLB when available, correctly-sized primitive stand-in when not — callers
// (T23 back room, harness prop line-up) get the same floor-flush, -Z-facing
// contract either way.
export async function getPropOrFallback(slot: PropSlot, opts?: { hideScreen?: boolean }): Promise<PropInstance> {
  const handle = await loadProp(slot);
  if (handle) {
    return { object: handle.instantiate(opts), real: true, size: handle.size.clone(), screenRect: handle.screenRect };
  }
  return makeFallback(slot);
}

function makeFallback(slot: PropSlot): PropInstance {
  const { fallback } = PROP_SPECS[slot];
  const group = new THREE.Group();
  group.name = `prop-fallback:${slot}`;
  group.userData.propFallback = true;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(fallback.w, fallback.h, fallback.d),
    new THREE.MeshStandardMaterial({ color: fallback.color, roughness: 0.6, metalness: 0.1 }),
  );
  body.position.y = fallback.h / 2; // floor-flush, same contract as GLB prep
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  let screenRect: PropScreenRect | null = null;
  if (fallback.screen) {
    const s = fallback.screen;
    const cy = fallback.h / 2 + s.yOffset;
    // Dead-glass front face so the stand-in reads as a TV, not a crate.
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(s.w, s.h),
      new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.15, metalness: 0.1 }),
    );
    glass.rotation.y = Math.PI; // face -Z like the prepped GLBs
    glass.position.set(s.xOffset ?? 0, cy, -fallback.d / 2 - 0.005);
    group.add(glass);
    screenRect = makeScreenRect(s.xOffset ?? 0, cy, -fallback.d / 2 - 0.005, s.w, s.h);
  }
  return {
    object: group,
    real: false,
    size: new THREE.Vector3(fallback.w, fallback.h, fallback.d),
    screenRect,
  };
}

// Free every cached template's GPU resources and forget the cache. Clones
// handed out earlier share these geometries/materials — three re-uploads them
// if such a clone is rendered again, so a late disposePropCache() degrades to
// a re-upload, never a crash. Fallback primitives are NOT cached here; they
// own their geometry/material and are disposed with the scene they joined.
export function disposePropCache(): void {
  for (const [, template] of templates) {
    const seenGeo = new Set<THREE.BufferGeometry>();
    const seenMat = new Set<THREE.Material>();
    template.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry) seenGeo.add(mesh.geometry);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mt of mats) if (mt) seenMat.add(mt);
    });
    seenGeo.forEach((g) => g.dispose());
    seenMat.forEach((mt) => {
      const anyMat = mt as THREE.MeshStandardMaterial;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
        const tex = anyMat[key] as THREE.Texture | null | undefined;
        if (tex) tex.dispose();
      }
      mt.dispose();
    });
  }
  templates.clear();
  cache.clear();
}
