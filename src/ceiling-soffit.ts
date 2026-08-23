// Front-of-store dropped ceilings — the cash-wrap soffit and the vestibule cap.
//
// Real video stores never ran the open tile deck straight out to the storefront.
// The whole checkout zone sat under a LOWERED ceiling that echoed the counter
// below it — a shield over a shield — with a pair of troffers recessed into it
// and the store's mirrored cornice band wrapped around its edge. That wrap is
// the point: the perimeter mirror runs down both side walls, turns the front
// corners, and instead of dying at the vestibule it steps inward and traces the
// soffit, so the mirror reads as one unbroken ring around the sales floor.
//
// The vestibule itself gets a second, LOWER cap (plain, no mirror) — that is
// what pulls its door/window composition down to a normal storefront height
// instead of leaving a full-height glass shaft open to the deck.
//
// Geometry contract with three-scene.ts's buildCeilingFrame():
//   * the soffit's two back corners land exactly on the x where the front
//     cornice segments stop — BOTH read that x from soffitConnectHalf() below,
//     which is the single source of truth — at the z of the cornice's inner
//     face (15 - CORNICE_WALL_GAP - CORNICE_BAND)
//   * the fascia reuses the cornice's drop / band / mirror height / 20 deg tilt
// so the two meet as one continuous band. Changing either side without the
// other reopens the gap at the vestibule.

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { vestibuleHalfWidth, type StorefrontSpec, STORE_CENTER_X, FRONT_GLASS_Z } from './store-layout';
import { activeStoreFormat } from './store-format';

export interface SoffitPoint { x: number; z: number }

const CX = STORE_CENTER_X; // store centreline
const FRONT_Z = FRONT_GLASS_Z; // storefront glass line

// How far the soffit sits below the main deck. The cornice body hangs 2.7 ft,
// so at 2.0 the soffit underside lands just ABOVE the mirror band's bottom
// edge — the mirror keeps hanging a few inches proud of the dropped ceiling,
// which is what makes it read as a border rather than a flush trim.
export const FRONT_SOFFIT_DROP = 2.0;

export function frontSoffitY(ceilingY: number): number {
  return ceilingY - FRONT_SOFFIT_DROP;
}

// The vestibule caps at EXACTLY the cash-wrap soffit's height — the two are one
// dropped ceiling across the whole front of the store, not two lids at
// different levels.
//
// It used to sit 1.5 ft lower (a clamped 10 ft). The soffit's plan stops at the
// cornice line, z 10.1, while the vestibule runs on to the glass at z 15, so
// that difference left a 1.5 ft slot over the chamber open on both flanks:
// stand anywhere out on the floor past the soffit's edge and you looked
// straight over the vestibule's lid and through the gap to the front wall
// behind it. The chamber read as a glass box parked in the room with its top
// off rather than as part of the building.
export function vestibuleCeilingY(ceilingY: number): number {
  // ...unless this format builds no soffit at all (a standalone DESK counter —
  // see frontSoffitPolygon). Then there is no dropped front deck for the
  // chamber to line up WITH, and dropping it regardless would cap a 7 ft door
  // with a 7 ft lid: in a 9 ft room frontSoffitY lands exactly on the door
  // head. The chamber runs to the main ceiling instead, which is also how a
  // small shop's entry is actually built — a door in the front wall, not an
  // airlock under its own deck.
  if (activeStoreFormat().counterShape === 'desk') return ceilingY;
  return frontSoffitY(ceilingY);
}

// Half-width, from the centreline, of the soffit's back corners — and so of
// where the front cornice runs have to stop, since the two meet there.
//
// Deliberately WIDER than the vestibule needs. Pinning the corners at the
// minimum (vestibule + wall gap, ~9.9) left a wedge 19.8 ft across tapering
// over 17 ft of depth, which is too narrow to come to a point: the fascia eats
// `corniceBand` off each side, so the lid closed up and the front half became
// a solid chrome arrowhead. Spreading the corners makes the taper gradual
// enough that a real point still leaves a lit deck behind it.
export const SOFFIT_CONNECT_HALF_TARGET = 16.0;
const MIN_FRONT_CORNICE_RUN = 5.0;

export function soffitConnectHalf(
  spec: StorefrontSpec, storeWidth: number, corniceWallGap: number,
): number {
  // Never narrower than the vestibule clearance, and never so wide that the
  // front cornice run it hands off to is a stub (or, on a small shell,
  // disappears entirely and breaks the ring).
  const minHalf = vestibuleHalfWidth(spec) + corniceWallGap;
  const maxHalf = storeWidth / 2 - corniceWallGap - MIN_FRONT_CORNICE_RUN;
  return Math.max(minHalf, Math.min(SOFFIT_CONNECT_HALF_TARGET, maxHalf));
}

// Plan outline of the soffit, in feet, as the OUTER face of its fascia — i.e.
// the line the mirror band sits on. Convex, wound so consecutive points walk
// the perimeter; the LAST edge (closing point N-1 back to point 0) runs along
// the cornice line across the entrance and is the one edge that gets no
// mirror — it faces the vestibule's back wall, where nobody is standing to see
// a reflection.
//
// The outline is a WEDGE, not a copy of the counter's shield. Tracing the
// shield exactly meant arms running nearly straight back from the cornice ends
// (the counter's shoulders sit at x 1.2 / 20.8, within inches of the minimum
// connection width), so the band hit the existing run at a hard right angle
// and then doubled back on itself along a fifth edge buried against the
// entrance wall. Two long diagonals meet it at an obtuse angle instead — one
// continuous band that turns and converges to a point aimed into the store.
// The trade: the counter's flared shoulders sit slightly proud of the lid.
export function frontSoffitPolygon(
  spec: StorefrontSpec, storeWidth: number, corniceWallGap: number, corniceBand: number,
): SoffitPoint[] {
  // Where the front cornice runs stop, and the z of their inner (mirrored)
  // face. The soffit's back corners are pinned to exactly these so the two
  // bands meet at an outside corner instead of leaving a gap.
  // A standalone DESK counter has no cash wrap to hang a lid over. The soffit
  // exists because a chain's walk-in counter is a whole zone of the store with
  // its own dropped, lit ceiling; a mom-and-pop's register is a table with a
  // computer on it under a 9 ft ceiling, and a dropped deck reaching 8 ft down
  // the centreline toward it would be the biggest object in the room. Empty
  // polygon: every consumer (pointInSoffit, tileOverlapsSoffit,
  // soffitMirroredEdges, buildFrontSoffit) then does nothing, and the ordinary
  // ceiling grid simply runs all the way to the glass.
  if (spec.counterShape === 'desk') return [];

  const armHalf = soffitConnectHalf(spec, storeWidth, corniceWallGap);
  const backZ = FRONT_Z - corniceWallGap - corniceBand;

  if (spec.counterShape === 'usquare') {
    // The open-back rect counter (x = cx ± 6.8, z 8.5 .. -3.5) has no point to
    // converge on, so the wedge stops as a trapezoid across its front face —
    // same obtuse turn off the cornice, just truncated.
    return [
      { x: CX - armHalf, z: backZ },
      { x: CX - 7.0, z: -5.5 },
      { x: CX + 7.0, z: -5.5 },
      { x: CX + armHalf, z: backZ },
    ];
  }

  // Shield counter: a true point, aimed down the centreline past the counter's
  // own apex (z -5.5). With the corners spread to SOFFIT_CONNECT_HALF_TARGET
  // the taper is gradual enough that the lid stays open to within ~4 ft of the
  // tip, so the band converges on a point instead of the fascia closing over
  // the whole nose (which is what forced the earlier truncation, back when the
  // corners sat at the minimum width).
  return [
    { x: CX - armHalf, z: backZ },
    { x: CX, z: -8.0 },
    { x: CX + armHalf, z: backZ },
  ];
}

// The LID's outline, which is not the same as the band's.
//
// frontSoffitPolygon above is where the fascia and mirror run — pinned to the
// cornice hand-off, and closing across the entrance at backZ because that is
// where the visible band has to stop. The lid behind it has no such limit: it
// carries on past the band, over the vestibule, and dies into the storefront
// wall. That is how a real drop ceiling works — the trim rings the exposed
// edge, the tile deck runs on behind it to the building.
//
// The vestibule used to hang a second lid of its own out in this strip. Two
// lids meeting is a joint to get wrong, and while they sat at different heights
// it was a slot you could see through; once they were levelled it was 1.5 ft of
// coplanar overlap, i.e. z-fighting. One lid has neither problem.
export function frontSoffitLidPolygon(
  spec: StorefrontSpec, storeWidth: number, corniceWallGap: number, corniceBand: number,
): SoffitPoint[] {
  const band = frontSoffitPolygon(spec, storeWidth, corniceWallGap, corniceBand);
  if (band.length === 0) return []; // no soffit on this counter shape — see above
  const armHalf = soffitConnectHalf(spec, storeWidth, corniceWallGap);
  // Run both ends of the band's closing edge straight out to the glass. The
  // arms are always at least vestibuleHalfWidth + corniceWallGap from the
  // centreline (see soffitConnectHalf), so this covers the whole chamber.
  return [
    { x: CX - armHalf, z: FRONT_Z },
    ...band,
    { x: CX + armHalf, z: FRONT_Z },
  ];
}

// Centres of the troffers recessed into the lid. Both the fixtures and the
// soffit's tile texture are aligned to these (see the offset computed in
// buildStore): the lid is a ShapeGeometry whose UVs come out in world feet, so
// its tile grid is pinned to the world origin rather than to the main deck's
// grid, and a troffer dropped at an arbitrary z straddled two printed tiles.
// Every z here must therefore differ by a whole multiple of TILE_Z (2.5).
export function soffitTrofferCenters(): SoffitPoint[] {
  return [5.5, 0.5].map((z) => ({ x: CX, z }));
}

export interface SoffitEdge {
  a: SoffitPoint; b: SoffitPoint;
  /** Unit vector a -> b. */
  ux: number; uz: number;
  /** Unit normal pointing INTO the soffit (the mirror faces the other way). */
  nx: number; nz: number;
  len: number; midX: number; midZ: number;
}

// The mirrored runs: every edge except the closing one, which faces the
// vestibule. Shared so the fascia, the mirrors and the marquee bulb rim all
// trace the same line — buildMarqueeBulbs deriving its own copy of this is
// exactly how the bulb rim detached from the cornice once before
// (feedback/005), and the whole point of the soffit is that the bulbs and the
// mirror follow it together.
export function soffitMirroredEdges(poly: SoffitPoint[]): SoffitEdge[] {
  const centroid = poly.reduce(
    (a, p) => ({ x: a.x + p.x / poly.length, z: a.z + p.z / poly.length }),
    { x: 0, z: 0 },
  );
  const edges: SoffitEdge[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const midX = (a.x + b.x) / 2, midZ = (a.z + b.z) / 2;
    // The outline is convex, so "toward the centroid" is unambiguously inward
    // and independent of winding.
    let nx = -dz / len, nz = dx / len;
    if ((centroid.x - midX) * nx + (centroid.z - midZ) * nz < 0) { nx = -nx; nz = -nz; }
    edges.push({ a, b, ux: dx / len, uz: dz / len, nx, nz, len, midX, midZ });
  }
  return edges;
}

// How far the two end runs extend BACK past their corner, along their own axis.
//
// Each run's end face is cut perpendicular to its own diagonal, so it can never
// sit flush against the front cornice's square end — the two leave a wedge of
// open ceiling between them. Pushing the run back along its axis buries that
// end face inside the cornice body (which spans z from the cornice's inner face
// out to zFront), so the two bands read as one that simply turns the corner.
// Clamped so the extension stops short of the cornice's outer face rather than
// bursting through it toward the glass.
function endRunOverlap(
  poly: SoffitPoint[], corniceWallGap: number, corniceBand: number,
): number {
  const edges = soffitMirroredEdges(poly);
  if (edges.length === 0) return 0;
  const backZ = FRONT_Z - corniceWallGap - corniceBand;
  const limitZ = FRONT_Z - corniceWallGap - 0.1; // stay inside the cornice body
  let allowed = corniceBand;
  // Both end runs travel AWAY from the cornice line, so backing up along -u
  // moves toward +z on the first run and on the last (which is reversed).
  const rates = [-edges[0].uz, edges[edges.length - 1].uz];
  for (const rate of rates) {
    if (rate > 1e-6) allowed = Math.min(allowed, (limitZ - backZ) / rate);
  }
  return Math.max(0, allowed);
}

export function pointInSoffit(x: number, z: number, poly: SoffitPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// Does an axis-aligned tile centred at (cx,cz) touch the soffit footprint?
// Corner-and-centre sampling: the ceiling grid drops whole modules rather than
// clipping them (a cut module desyncs from the T-bar texture), so any overlap
// at all disqualifies the tile.
export function tileOverlapsSoffit(
  cx: number, cz: number, halfX: number, halfZ: number, poly: SoffitPoint[],
): boolean {
  return (
    pointInSoffit(cx, cz, poly) ||
    pointInSoffit(cx - halfX, cz - halfZ, poly) ||
    pointInSoffit(cx + halfX, cz - halfZ, poly) ||
    pointInSoffit(cx - halfX, cz + halfZ, poly) ||
    pointInSoffit(cx + halfX, cz + halfZ, poly)
  );
}

export interface FrontSoffitParams {
  scene: THREE.Scene;
  ceilingY: number;
  storefrontSpec: StorefrontSpec;
  /** Drives how far out the soffit's back corners (and the cornice hand-off) sit. */
  storeWidth: number;
  corniceWallGap: number;
  corniceBand: number;
  corniceDrop: number;
  /** Underside of the soffit slab — the ceiling tile material of the main deck. */
  tileMaterial: THREE.Material;
  trofferPanelMaterial: THREE.Material;
  trofferFrameMaterial: THREE.Material;
  /** TILE_X / TILE_Z of the main grid, so the recessed troffers match its module. */
  tileX: number;
  tileZ: number;
  softwareGL: boolean;
  /**
   * Reflector target size in PIXELS, already derived from the real drawing
   * buffer by the caller. Deliberately a w/h PAIR, not one number: a Reflector
   * renders the reflected VIEW into its target and samples it with SCREEN-space
   * projective coords, so the target has to track the drawing buffer's shape.
   * A square target squashed to 1:1 and stretched back out over this band's
   * ~20:1 run is the smeared, stair-stepped strip F8 pin 028 was filed on —
   * fixed for the ceiling-frame mirror at the time, missed here.
   */
  reflectorSize: { w: number; h: number };
  /**
   * bb-2000 look (user): a plain all-WHITE soffit with no chrome/mirror band and
   * INSET CIRCULAR (recessed can) lights instead of the rectangular troffers.
   * The mirrored ring is dropped for that era store, so its checkout soffit must
   * not carry the mirror either.
   */
  plainWhite?: boolean;
}

export interface FrontSoffitResult {
  group: THREE.Group;
  polygon: SoffitPoint[];
  soffitY: number;
  /** Centres of the troffers recessed into the soffit, for the key-light pass. */
  troffers: SoffitPoint[];
}

export function buildFrontSoffit(params: FrontSoffitParams): FrontSoffitResult {
  const {
    scene, ceilingY, storefrontSpec, storeWidth, corniceWallGap, corniceBand, corniceDrop,
    tileMaterial, trofferPanelMaterial, trofferFrameMaterial, tileX, tileZ,
    softwareGL, reflectorSize, plainWhite,
  } = params;

  // bb-2000: an all-white soffit body (no reflective ceiling-tile deck). The
  // underside faces DOWN into shadow, so a plain white would read grey — a soft
  // self-emissive lifts it to a lit-drywall white (the way a can-lit soffit
  // actually looks) without blowing past the bloom threshold.
  const whiteBodyMat = plainWhite
    ? new THREE.MeshStandardMaterial({
        // Toned off the pure-white blowout to a warm off-white that reads at the
        // same value as the ceiling panels (was 0xf3f2ee + emissive 0.5).
        color: 0xe6e3da, roughness: 0.95, metalness: 0.0,
        // Just enough self-lift to keep the shaded underside from going grey; a
        // subtle bump off the ceiling-tile texture gives it drywall tooth.
        emissive: new THREE.Color(0xece9df), emissiveIntensity: 0.09,
        bumpMap: (tileMaterial && (tileMaterial as THREE.MeshStandardMaterial).map) || null,
        bumpScale: 0.25,
      })
    : null;

  const group = new THREE.Group();
  group.name = 'frontSoffit';

  const poly = frontSoffitPolygon(storefrontSpec, storeWidth, corniceWallGap, corniceBand);
  const soffitY = frontSoffitY(ceilingY);
  // Nothing to build (see frontSoffitPolygon): hand back an empty group and an
  // empty polygon so the caller's own soffit-aware branches all fall through to
  // "plain ceiling" without needing to know why.
  if (poly.length === 0) {
    scene.add(group);
    return { group, polygon: poly, soffitY, troffers: [] };
  }

  // Same chrome as buildCeilingFrame's cornice — the two bands are one run of
  // trim, so they must not drift apart in colour or gloss.
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd6dbe2, metalness: 1.0, roughness: 0.12, envMapIntensity: 1.0,
  });
  // Painted closure board on the vestibule side — a plain drywall return, not
  // tile (a BoxGeometry would squash the tile map's 0..1 UVs anyway).
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xe9e9e4, roughness: 0.88, metalness: 0.0,
  });

  // ── The lid ──────────────────────────────────────────────────────────────
  // On the LID outline, not the band's — it runs on past the fascia, over the
  // vestibule, and dies into the storefront wall, so the whole front of the
  // store is one tile deck with no joint in it. See frontSoffitLidPolygon.
  //
  // Shape is authored in (x, z); rotation.x = +PI/2 lays it flat with its
  // normal pointing DOWN and maps the shape's y straight onto world z, exactly
  // like the main ceiling plane.
  const lidPoly = frontSoffitLidPolygon(storefrontSpec, storeWidth, corniceWallGap, corniceBand);
  const shape = new THREE.Shape();
  lidPoly.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.z) : shape.lineTo(p.x, p.z)));
  shape.closePath();
  const slab = new THREE.Mesh(new THREE.ShapeGeometry(shape), whiteBodyMat ?? tileMaterial);
  slab.position.y = soffitY;
  slab.rotation.x = Math.PI / 2;
  slab.receiveShadow = true;
  group.add(slab);

  // ── Flank returns over the entrance strip ────────────────────────────────
  // Where the lid runs on past the band it leaves the space above it open at
  // both ends: the main deck skips its tiles over this whole footprint, so
  // without these you can look in from the side, over the lid, and see the
  // plenum and the back of the storefront wall. Plain painted drywall, from
  // the lid up to the deck — the same board the lid's own cut used to be
  // closed with, moved to where the opening actually is.
  {
    const armHalf = soffitConnectHalf(storefrontSpec, storeWidth, corniceWallGap);
    const backZ = FRONT_Z - corniceWallGap - corniceBand;
    const runH = ceilingY - soffitY;
    const runD = FRONT_Z - backZ;
    if (runH > 0.05 && runD > 0.05) {
      const t = 0.16;
      for (const sx of [CX - armHalf, CX + armHalf]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(t, runH, runD), capMat);
        // Inset so the board sits under the lid rather than overhanging its cut.
        wall.position.set(sx + (sx < CX ? t / 2 : -t / 2), soffitY + runH / 2, backZ + runD / 2);
        group.add(wall);
      }
    }
  }

  const mirrorH = 1.9;
  const mirrorY = ceilingY - corniceDrop * 0.5;
  const tiltAngle = (20 * Math.PI) / 180;
  const localOffset = (mirrorH / 2) * Math.sin(tiltAngle);

  const edges = soffitMirroredEdges(poly);
  const fasciaCount = edges.length;
  // How far the two END runs push back past their corner, along their own axis,
  // to bury their end face inside the front cornice body they hand off to.
  const jointOverlap = endRunOverlap(poly, corniceWallGap, corniceBand);

  // ── Fascia: ONE mitred ring, not a box per edge ──────────────────────────
  // A box per edge is fine while the joints are square, but this outline meets
  // at ~75 deg at the point, and there two rectangles simply cross: each one's
  // far corner punches out through the other's outer face, so the tip reads as
  // an X of overshooting slabs rather than a mitre. Instead the band is a
  // single closed profile — the outer chain out along the polygon, the inner
  // chain back along the same edges offset inward by `band`, with each inner
  // joint placed where the two offset lines actually intersect — extruded down
  // through the drop. Same trick counter.ts uses for the counter's own band.
  {
    // The two chain ends push back along their own axis by jointOverlap so
    // their end faces bury inside the cornice body instead of leaving a wedge.
    const first = edges[0], last = edges[fasciaCount - 1];
    const startOuter = { x: first.a.x - first.ux * jointOverlap, z: first.a.z - first.uz * jointOverlap };
    const endOuter = { x: last.b.x + last.ux * jointOverlap, z: last.b.z + last.uz * jointOverlap };

    const inner: SoffitPoint[] = [];
    inner.push({ x: startOuter.x + first.nx * corniceBand, z: startOuter.z + first.nz * corniceBand });
    for (let i = 0; i < fasciaCount - 1; i++) {
      const e0 = edges[i], e1 = edges[i + 1];
      const p0x = e0.a.x + e0.nx * corniceBand, p0z = e0.a.z + e0.nz * corniceBand;
      const p1x = e1.a.x + e1.nx * corniceBand, p1z = e1.a.z + e1.nz * corniceBand;
      const den = e0.ux * e1.uz - e0.uz * e1.ux;
      if (Math.abs(den) < 1e-6) {
        // Collinear edges — no mitre to compute, the offset lines are the same.
        inner.push({ x: p1x, z: p1z });
      } else {
        const t = ((p1x - p0x) * e1.uz - (p1z - p0z) * e1.ux) / den;
        inner.push({ x: p0x + e0.ux * t, z: p0z + e0.uz * t });
      }
    }
    inner.push({ x: endOuter.x + last.nx * corniceBand, z: endOuter.z + last.nz * corniceBand });

    const profile: SoffitPoint[] = [startOuter];
    for (let i = 1; i < fasciaCount; i++) profile.push(poly[i]);
    profile.push(endOuter);
    for (let i = inner.length - 1; i >= 0; i--) profile.push(inner[i]);

    // ExtrudeGeometry wants the profile counter-clockwise or the side walls
    // come out inside-out. rotation.x = +PI/2 is a proper rotation, so getting
    // the winding right in shape space is enough.
    let area = 0;
    for (let i = 0; i < profile.length; i++) {
      const p = profile[i], q = profile[(i + 1) % profile.length];
      area += p.x * q.z - q.x * p.z;
    }
    const wound = area < 0 ? profile.slice().reverse() : profile;

    const bandShape = new THREE.Shape();
    wound.forEach((p, i) => (i === 0 ? bandShape.moveTo(p.x, p.z) : bandShape.lineTo(p.x, p.z)));
    bandShape.closePath();
    const bandGeo = new THREE.ExtrudeGeometry(bandShape, { depth: corniceDrop, bevelEnabled: false });
    if (plainWhite) {
      // bb-2000: taper the fascia to a carafe/funnel — full footprint where it
      // meets the ceiling, drawn in to a much smaller bottom lip — instead of a
      // straight-sided box whose bottom edge read as too wide. Pull each vertex
      // toward the ring centroid in proportion to how far down the drop it sits.
      let cx = 0, cy = 0;
      for (const p of wound) { cx += p.x; cy += p.z; }
      cx /= wound.length; cy /= wound.length;
      const pos = bandGeo.getAttribute('position');
      const BOTTOM_SCALE = 0.45; // bottom lip footprint vs. the top
      for (let i = 0; i < pos.count; i++) {
        const t = corniceDrop > 0 ? pos.getZ(i) / corniceDrop : 0; // 0 top → 1 bottom
        const s = 1 - (1 - BOTTOM_SCALE) * t;
        pos.setX(i, cx + (pos.getX(i) - cx) * s);
        pos.setY(i, cy + (pos.getY(i) - cy) * s);
      }
      pos.needsUpdate = true;
      bandGeo.computeVertexNormals();
    }
    // bb-2000: a plain white drop band (self-lit like the body), not chrome.
    const bandMesh = new THREE.Mesh(bandGeo, whiteBodyMat ?? chromeMat);
    // Local +Z maps to world -Y under this rotation, so the extrusion hangs
    // DOWN from the ceiling through exactly `drop`.
    bandMesh.position.y = ceilingY;
    bandMesh.rotation.x = Math.PI / 2;
    bandMesh.castShadow = true;
    bandMesh.receiveShadow = true;
    group.add(bandMesh);
  }

  // The mirror ring is dropped entirely in the bb-2000 plain-white soffit.
  for (let i = 0; !plainWhite && i < fasciaCount; i++) {
    const { nx, nz, ux, uz, len, midX, midZ } = edges[i];

    // The fascia body itself is the mitred ring built above; this loop only
    // hangs the mirror on each run's outer face.
    //
    // The two END runs carry their mirror back over the same jointOverlap the
    // body does. Stopping the strip at the corner while the chrome ran on left
    // a bare stub of body exactly where the two mirrors are supposed to meet —
    // the overlap continues INTO the cornice body, where it is hidden, so the
    // visible band is continuous through the turn.
    const extBack = i === 0 ? jointOverlap : 0;
    const extFwd = i === fasciaCount - 1 ? jointOverlap : 0;
    const mirrorW = len + extBack + extFwd;
    const cxm = midX + ux * (extFwd - extBack) / 2;
    const czm = midZ + uz * (extFwd - extBack) / 2;

    // The mirror rides the OUTER face, looking back out over the sales floor
    // (the cornice's mirrors look inward off the walls — same ring, and at an
    // outside corner "inward off the wall" and "outward off the soffit" are
    // the same direction of travel).
    const mirrorRotY = Math.atan2(-nx, -nz);
    const mx = cxm - nx * 0.02 + localOffset * Math.sin(mirrorRotY);
    const mz = czm - nz * 0.02 + localOffset * Math.cos(mirrorRotY);

    const placeMirror = (mesh: THREE.Object3D) => {
      mesh.position.set(mx, mirrorY, mz);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = mirrorRotY;
      mesh.rotation.x = tiltAngle;
      group.add(mesh);
    };

    if (softwareGL) {
      // Matches buildCeilingFrame: a live Reflector replays the whole scene per
      // mirror, which SwiftShader pays for in CPU. Static chrome keeps the look.
      placeMirror(new THREE.Mesh(new THREE.PlaneGeometry(mirrorW, mirrorH), chromeMat));
    } else {
      placeMirror(new Reflector(new THREE.PlaneGeometry(mirrorW, mirrorH), {
        clipBias: 0.003,
        textureWidth: reflectorSize.w,
        textureHeight: reflectorSize.h,
        color: 0xffffff,
      }));
    }
  }

  let troffers: SoffitPoint[];
  if (plainWhite) {
    // ── bb-2000: a grid of INSET CIRCULAR (recessed can) lights ─────────────
    // Small round downlights spaced along the white soffit body instead of the
    // two rectangular troffers. A dark trim ring around a bright emissive disc.
    troffers = [];
    const canR = 0.32, margin = canR + corniceBand + 0.1;
    const trimGeo = new THREE.RingGeometry(canR, canR + 0.09, 28);
    const lightGeo = new THREE.CircleGeometry(canR, 28);
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7, metalness: 0.15 });
    const canMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: new THREE.Color(0xfff3df), emissiveIntensity: 2.2,
      roughness: 1.0, metalness: 0.0,
    });
    // A can fits only where the whole disc (± margin) stays inside the soffit.
    const fits = (x: number, z: number) =>
      pointInSoffit(x, z, poly) &&
      pointInSoffit(x + margin, z, poly) && pointInSoffit(x - margin, z, poly) &&
      pointInSoffit(x, z + margin, poly) && pointInSoffit(x, z - margin, poly);
    // ~5 downlights spread evenly along the soffit's front chain (the V of the
    // cash-wrap), each set inboard of the fascia so it lands on the flat
    // underside — a spare row of cans following the soffit, not a dense grid.
    const N_CANS = 5;
    let chainLen = 0;
    for (let i = 0; i < fasciaCount; i++) chainLen += edges[i].len;
    for (let k = 0; k < N_CANS; k++) {
      const target = chainLen * (k + 0.5) / N_CANS; // biased off the two ends
      let acc = 0, e = edges[0], local = 0;
      for (let i = 0; i < fasciaCount; i++) {
        if (i === fasciaCount - 1 || acc + edges[i].len >= target) {
          e = edges[i]; local = Math.min(target - acc, edges[i].len); break;
        }
        acc += edges[i].len;
      }
      const gx = e.a.x + e.ux * local + e.nx * margin;
      const gz = e.a.z + e.uz * local + e.nz * margin;
      if (!fits(gx, gz)) continue;
      troffers.push({ x: gx, z: gz });
      const trim = new THREE.Mesh(trimGeo, trimMat);
      trim.position.set(gx, soffitY - 0.005, gz); trim.rotation.x = Math.PI / 2;
      group.add(trim);
      const light = new THREE.Mesh(lightGeo, canMat);
      light.position.set(gx, soffitY - 0.02, gz); light.rotation.x = Math.PI / 2;
      group.add(light);
    }
    if (troffers.length === 0) troffers = soffitTrofferCenters(); // never leave it dark
  } else {
    // ── Two troffers recessed into the lid ─────────────────────────────────
    // One over the register end of the counter, one forward over the island —
    // the pair the reference photos show. Same module as the main grid so they
    // read as the same fixture, just lower, and landing on whole printed tiles
    // rather than straddling a grid line (see soffitTrofferCenters).
    troffers = soffitTrofferCenters();
    const panelGeo = new THREE.BoxGeometry(tileX - 0.12, 0.04, tileZ - 0.12);
    const frameGeo = new THREE.BoxGeometry(tileX, 0.06, tileZ);
    for (const t of troffers) {
      const frame = new THREE.Mesh(frameGeo, trofferFrameMaterial);
      frame.position.set(t.x, soffitY - 0.03, t.z);
      group.add(frame);
      const panel = new THREE.Mesh(panelGeo, trofferPanelMaterial);
      panel.position.set(t.x, soffitY - 0.06, t.z);
      group.add(panel);
    }
  }

  scene.add(group);
  return { group, polygon: poly, soffitY, troffers };
}
