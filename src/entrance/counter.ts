// Checkout counter builder (T05): the classic shield-pentagon walk-in desk,
// extracted out of the old entrance.ts monolith so `counterStyle`/`counterTop`
// can vary independently of the vestibule/doors. The outer band's shield
// footprint and the inner V-counter's footprint are IDENTICAL between styles
// — only the extrude bevel (sharp 90s laminate vs. rounded 2000s edges) and
// the inner counter-top material change. That keeps every anchor
// (getInnerCounterSpine, deskApexZ) computed from the same geometry
// regardless of style, so the desk terminals, bag, and register signs never
// need to know which style is active.
import * as THREE from 'three';
import { FixtureContext } from '../fixtures';
import { StorefrontSpec } from '../store-layout';
import { getActiveTheme } from '../themes';
import { createShelfTextures } from '../canvas-textures';
import { Footprint } from '../layout-validator';
import { deskGroundPlan, DeskGroundPlan, DESK_LENGTH, DESK_DEPTH } from './desk-plan';
import { installCounterModel } from './counter-model';

// A spot the clerk can stand at, with the world heading she should face while
// standing there (heading convention: atan2(dirX, dirZ), see clerk.ts).
export interface ClerkStanding { x: number; z: number; yaw: number }

// The counter's own frame in world space, published so nothing downstream has
// to know which SHAPE is active or which way it is turned. Every prop, camera
// vantage and walk waypoint the app anchors to the counter is expressible as
// "u feet along it, v feet into it" — and expressing them that way is what
// lets the standalone desk turn 90° onto a side wall (GH #116) without a
// single consumer carrying a second set of literals for the rotated case.
export interface CounterFrame {
  // Centre of the customer-facing face.
  fx: number; fz: number;
  // Unit vector ALONG the counter, +u. World +X on every front-facing shape,
  // so the historical `cx + off` anchors are literally `off` here.
  ux: number; uz: number;
  // Unit vector from the customer side INTO the counter body (toward the
  // clerk) — the direction getInnerCounterSpine's rotY points.
  nx: number; nz: number;
  // Heading the counter FACES (clerk.ts convention: atan2(dirX, dirZ)).
  facingYaw: number;
}

export interface CounterBuildResult {
  // The counter's store-facing point Z (frames the checkout camera move).
  // Kept for the front-facing shapes, whose "apex" really is a Z; a side-wall
  // desk faces across the room, so anything positional should read `frame`
  // instead of pairing this with a hardcoded x = 11.
  deskApexZ: number;
  cx: number;
  innerH: number;
  // Front-to-back depth (ft) of the inner rental counter — same `innerD` used
  // to build its body/top extrusion below. Exposed so callers (mount-surfaces
  // registration) can size a counter-top MountSurface off the real geometry
  // instead of a second hardcoded copy of this constant.
  innerDepth: number;
  // (z, rotY) on the inner counter's spine at world-X coordinate `x`, used to
  // anchor the desk terminals, the bag, and the register signs to the
  // counter's actual geometry rather than hardcoded constants.
  getInnerCounterSpine: (x: number) => { z: number; rotY: number };
  // The counter's world frame — see CounterFrame.
  frame: CounterFrame;
  // A point on the inner counter's SPINE (the mid-depth line of its top),
  // `u` feet along the counter from its centre. THE anchor accessor: on every
  // front-facing shape +u is world +X, so `spineAt(off)` is exactly the old
  // `getInnerCounterSpine(cx + off)` at x = cx + off, and on the side-wall
  // desk it follows the counter instead of walking off the end of it.
  spineAt: (u: number) => { x: number; z: number; rotY: number };
  // Where the clerk stands to work the counter at `u`: behind the spine on
  // her side, turned to face across the counter. `getTerminalStanding` is
  // this in world-X clothing.
  standingAt: (u: number) => ClerkStanding;
  // Exact ground-plan rectangles of the built counter for the clerk's nav
  // grid: the five mitred shield-band segments (with the real walk-through
  // gap — and ONLY that gap — left open) plus the two inner-island segments.
  // The static counter-band footprints in store-fixtures-config.ts trim their
  // mitred corners to satisfy the validator's SAT-overlap check, which reads
  // as fake gaps to a pathfinder; these trace the real geometry instead.
  navFootprints: Footprint[];
  // Where the clerk stands while working the register (inside the band,
  // behind the inner counter's apex, facing the customer side).
  registerStanding: ClerkStanding;
  // Standing spot at a rental terminal at world-X `x` (terminals are anchored
  // at cx±4 by entrance/index.ts): behind the inner counter's spine on the
  // clerk side, facing the terminal screen.
  getTerminalStanding: (x: number) => ClerkStanding;
}

function speckledTexture(base: string, fleck: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.fillStyle = base;
  c.fillRect(0, 0, size, size);
  c.fillStyle = fleck;
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    c.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function woodgrainTexture(): THREE.CanvasTexture {
  const w = 256, h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#8a5a34';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(70,40,20,0.35)';
  for (let i = 0; i < 18; i++) {
    c.beginPath();
    const y0 = Math.random() * h;
    c.moveTo(0, y0);
    for (let x = 0; x <= w; x += 16) c.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 3);
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Inner counter-top material per StorefrontSpec.counterTop. 'white' matches
// the original counterWhite finish exactly (the default spec value).
function counterTopMaterial(kind: StorefrontSpec['counterTop'], counterWhite: THREE.Material): THREE.Material {
  if (kind === 'woodgrain') {
    return new THREE.MeshStandardMaterial({ map: woodgrainTexture(), roughness: 0.4, metalness: 0.02 });
  }
  if (kind === 'speckled') {
    return new THREE.MeshStandardMaterial({ map: speckledTexture('#d8d8d0', '#3a3a3a'), roughness: 0.35, metalness: 0.02 });
  }
  return counterWhite;
}

export function buildCheckoutCounter(
  ctx: FixtureContext,
  parent: THREE.Group,
  cx: number,
  backZ: number,
  spec: Pick<StorefrontSpec, 'counterStyle' | 'counterTop' | 'counterShape' | 'entryStyle' | 'doorWidth'>,
  // Shell width (ft). Only the standalone desk needs it — it stands against a
  // side WALL, and the wall moves with the store's size (see desk-plan.ts).
  storeWidth: number,
): CounterBuildResult {
  // These simple solids are the collision rig and immediate loading fallback.
  // Visible joinery comes from the editable Blender model once it is loaded.
  const group = new THREE.Group();
  group.name = 'checkout-counter-fallback';
  parent.add(group);
  const rounded = spec.counterStyle === 'rounded-2000s';
  // 'usquare': a half-square of roughly the shield's size — three straight
  // band runs with square corners (two sides + a flat store-facing front),
  // OPEN toward the vestibule, so the open back is the clerk's walk-through
  // (no carved gap needed). All downstream anchors (spine, terminals,
  // standings) are computed from the same point lists, so nothing outside
  // this function knows which shape is active.
  const usquare = spec.counterShape === 'usquare';
  // 'desk': the mom-and-pop format's counter (GH #33) — "no front counter, just
  // a tiny counter that fits a single computer". There is NO walk-in band at
  // all: a store this cramped cannot spend a 20 ft pentagon of floor on its
  // register, so the counter IS the inner island, standing alone as a 6 ft
  // wooden desk with the register on it and room to stand behind. Everything
  // downstream still reads the same anchors (spine, apex, standings) because
  // they are all derived from the island, which every shape builds.
  //
  // GH #116: it stands ALONG A SIDE WALL now rather than across the entrance,
  // and its whole ground plan — which wall, how far off it, how far in from
  // the glass, which way +u runs — comes from desk-plan.ts, because the layout
  // validator has to declare the same rectangle before this function ever runs.
  const desk = spec.counterShape === 'desk';
  const deskPlan: DeskGroundPlan | null = desk
    ? deskGroundPlan({
        storeCenterX: cx, storeWidth, frontGlassZ: 15.0,
        entryStyle: spec.entryStyle, doorWidth: spec.doorWidth,
      })
    : null;

  const theme = getActiveTheme();
  // Laminate mottle/scuff albedo + micro-stipple normal (shared generator with
  // the shelving): the counter is the single biggest uniform-color slab in the
  // store, and bare material colors on it read as untextured CG.
  const { map: counterLamTex, normalMap: counterLamNorm } = createShelfTextures();
  counterLamTex.repeat.set(4, 2);
  counterLamNorm.repeat.set(4, 2);
  const counterWhite = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.palette.counterBody), map: counterLamTex,
    normalMap: counterLamNorm, normalScale: new THREE.Vector2(0.25, 0.25),
    // 0.55 -> 0.45: the big white laminate faces are the store's largest flat
    // panels — satin enough that the window/troffer sheen visibly travels
    // across them as the camera moves (user: "surfaces don't react to light").
    roughness: 0.45, metalness: 0.02,
  });
  const counterTopBlue = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.palette.counterTop), map: counterLamTex,
    normalMap: counterLamNorm, normalScale: new THREE.Vector2(0.25, 0.25),
    roughness: 0.28, metalness: 0.03,
  });
  const counterStripe = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.palette.secondary), roughness: 0.32, metalness: 0.05 });
  const innerTopMat = counterTopMaterial(spec.counterTop, counterWhite);

  const bandH = 3.4;
  const bandD = 1.5;
  // Front-to-back depth of the inner counter island (ft). Hoisted above the
  // outline so the standalone desk — whose outline IS the island — can size
  // itself from the same number the island is extruded with, and TAKEN from
  // desk-plan.ts because the layout validator has to declare that rect before
  // this function runs. One definition beats two that agree today.
  const innerD = DESK_DEPTH;
  const backHalf = 6.2;
  const shoulderHalf = 9.8;
  const zBackC = backZ - 0.1;
  const zShoulder = zBackC - 6.24;
  const zPoint = zBackC - 14.0;
  // usquare: flat front run instead of a point; slightly shallower, and
  // NARROWER than the shield's shoulder span — the shield's taper is what
  // threads it between the two shelf fields' front corners (measured worst
  // case: island corners reach x≈3.8/19.9 inside the counter's z-range), so
  // straight full-depth sides must stay inside that. 13.6 ft × 12 ft
  // encloses roughly the same area as the shield's tapering 19.6 ft span.
  const uHalf = 6.8;
  const zFrontU = zBackC - 12.0;
  // Standalone desk: a 6 ft run, one island-depth deep, standing along a side
  // wall with the clerk's work strip behind it (desk-plan.ts owns all four
  // numbers and the run's direction). `deskHalf` stays the island's half-span
  // below; the desk's own rect comes off the plan.
  const deskHalf = DESK_LENGTH / 2;
  // The counter's local frame: +u along the run, +n from the customer side
  // into the body. Every shape but the desk faces the store down −Z with its
  // run along +X, which is precisely why `cx + off` worked as an anchor for
  // as long as it did.
  const uVec = deskPlan
    ? new THREE.Vector2(deskPlan.ux, deskPlan.uz)
    : new THREE.Vector2(1, 0);
  const nVec = deskPlan
    ? new THREE.Vector2(deskPlan.nx, deskPlan.nz)
    : new THREE.Vector2(0, 1);
  // The WINDING axis, which is not always the anchor axis. Every polygon here
  // is wound so an edge tangent t yields an inward normal (−t.z, t.x), so the
  // front face's tangent is pinned by which side the customer stands on:
  // wind = (n.z, −n.x). +u, by contrast, means "along the counter, away from
  // the door" wherever the desk is parked, so on a left-wall desk the two run
  // opposite. The rect is symmetric about its centre, so only the front
  // line's ORDER cares — and it cares absolutely, because getting it backwards
  // builds the counter facing its own wall.
  const windU = new THREE.Vector2(nVec.y, -nVec.x);
  // Centre of the customer-facing face, and the centre of the body behind it.
  const deskFront = deskPlan ? new THREE.Vector2(deskPlan.frontX, deskPlan.frontZ) : null;
  const deskBack = deskFront ? deskFront.clone().addScaledVector(nVec, innerD) : null;
  const deskApexZ = deskFront ? deskFront.y : (usquare ? zFrontU : zPoint);

  // Outline points, wound so each edge's inward normal (-t.y, t.x) points
  // into the counter interior. For 'usquare' the loop still CLOSES across
  // the back (the offset/mitre math below needs a closed polygon) but that
  // closing edge is never built — it's the open walk-in side.
  const shield: { x: number; z: number }[] = deskFront && deskBack
    ? // The desk's own rect, wound back-of-run-start → front-of-run-start →
      // front-of-run-end → back-of-run-end so each edge's inward normal turns
      // inward exactly as the other shapes' do. No band is built from it
      // (bandSegDefs is empty below), but the offset/mitre ring wants a
      // closed polygon and the rect is the honest one to give it.
      [
        deskBack.clone().addScaledVector(windU, -deskHalf),
        deskFront.clone().addScaledVector(windU, -deskHalf),
        deskFront.clone().addScaledVector(windU, deskHalf),
        deskBack.clone().addScaledVector(windU, deskHalf),
      ].map((p) => ({ x: p.x, z: p.y }))
    : usquare
    ? [
        { x: cx - uHalf, z: zBackC },
        { x: cx - uHalf, z: zFrontU },
        { x: cx + uHalf, z: zFrontU },
        { x: cx + uHalf, z: zBackC },
      ]
    : [
        { x: cx - backHalf, z: zBackC },
        { x: cx - shoulderHalf, z: zShoulder },
        { x: cx, z: zPoint },
        { x: cx + shoulderHalf, z: zShoulder },
        { x: cx + backHalf, z: zBackC },
      ];

  const P_out = shield.map((p) => new THREE.Vector2(p.x, p.z));
  const n = P_out.length;

  const tangents: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const next = P_out[(i + 1) % n];
    const curr = P_out[i];
    tangents.push(new THREE.Vector2().subVectors(next, curr).normalize());
  }
  const normals = tangents.map((t) => new THREE.Vector2(-t.y, t.x));

  const P_in: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const N_in = normals[(i - 1 + n) % n];
    const N_out = normals[i];
    const B = new THREE.Vector2().addVectors(N_in, N_out).normalize();
    const cosAlpha = N_in.dot(B);
    const safeCos = Math.abs(cosAlpha) > 0.001 ? cosAlpha : 1.0;
    const offsetLen = bandD / safeCos;
    P_in.push(new THREE.Vector2().addVectors(P_out[i], B.clone().multiplyScalar(offsetLen)));
  }

  const extrudeSegment = (
    p0: THREE.Vector2, p1: THREE.Vector2, p2: THREE.Vector2, p3: THREE.Vector2,
    h: number, by: number, mat: THREE.Material,
    opts?: { noBevel?: boolean; noCollide?: boolean },
  ): THREE.Mesh => {
    const pts = [
      { x: p0.x, y: -p0.y },
      { x: p1.x, y: -p1.y },
      { x: p2.x, y: -p2.y },
      { x: p3.x, y: -p3.y },
    ];
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (area < 0) pts.reverse();

    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
    shape.closePath();

    // 'rounded-2000s' softens every extruded edge with a bevel; 'laminate-90s'
    // keeps the original sharp-edged 90s laminate look.
    const geom = new THREE.ExtrudeGeometry(shape, rounded && !opts?.noBevel
      ? { depth: h, bevelEnabled: true, bevelThickness: Math.min(0.06, h / 3), bevelSize: 0.05, bevelSegments: 3 }
      : { depth: h, bevelEnabled: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = by;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts?.noCollide) ctx.addCollider(mesh);
    return mesh;
  };

  // Trimmed end points of band segment `i`: outer edge A_out→B_out, inner
  // edge A_in→B_in (mitred into the neighbour where untrimmed). Shared by the
  // extrusion below and the nav footprints so both trace identical geometry.
  const segEnds = (i: number, trimA: number, trimB: number) => {
    const A = P_out[i];
    const B = P_out[(i + 1) % n];
    const T = tangents[i];
    const N = normals[i];

    const A_out = trimA > 0 ? A.clone().addScaledVector(T, trimA) : A.clone();
    const B_out = trimB > 0 ? B.clone().addScaledVector(T, -trimB) : B.clone();
    const A_in = trimA > 0 ? A_out.clone().addScaledVector(N, bandD) : P_in[i].clone();
    const B_in = trimB > 0 ? B_out.clone().addScaledVector(N, bandD) : P_in[(i + 1) % n].clone();
    return { A_out, B_out, A_in, B_in, T };
  };

  // Oriented ground rect between the quad's two end midpoints — the nav-grid
  // approximation of one band/island segment. Mitred corners skew the true
  // quad slightly off-rectangular; adjacent segments overlap there, so the
  // union still covers the built geometry.
  const segFootprint = (
    label: string,
    e: { A_out: THREE.Vector2; B_out: THREE.Vector2; A_in: THREE.Vector2; B_in: THREE.Vector2; T: THREE.Vector2 },
    depth: number,
  ): Footprint => {
    const a = e.A_out.clone().add(e.A_in).multiplyScalar(0.5);
    const b = e.B_out.clone().add(e.B_in).multiplyScalar(0.5);
    return {
      label, kind: 'structure',
      cx: (a.x + b.x) / 2, cz: (a.y + b.y) / 2,
      w: a.distanceTo(b), d: depth,
      // Footprint convention: local +X world direction is (cos yaw, -sin yaw).
      yaw: Math.atan2(-e.T.y, e.T.x),
    };
  };

  // Safety-stripe groove geometry (see the inlay comment further down): the
  // blue top is built as TWO extrusions with a horizontal channel left open
  // between them, and the stripe slab sits recessed inside that channel.
  const STRIPE_Y = 3.29;      // groove centre, ~3 in below the band top at y≈3.54
  const STRIPE_H = 0.14;      // visible stripe height (ft) — ~1.7 in
  const STRIPE_T = 0.08;      // stripe slab thickness normal to the face (ft)
  const STRIPE_RECESS = 0.01; // how far the stripe face sits BEHIND the band face
  // 'rounded-2000s' pieces grow a bevel along their extrusion caps (see
  // extrudeSegment); widen the groove so the two blue pieces' bevels don't
  // swallow the stripe band — the bevels fill the padding back in.
  const GROOVE_HALF = STRIPE_H / 2 + (rounded ? 0.06 : 0);

  const buildMiteredSegment = (e: ReturnType<typeof segEnds>) => {
    const { A_out, B_out, A_in, B_in } = e;
    // Three solid extrusions: white lower two-thirds, then the blue band top
    // split into a below-groove piece and an above-groove piece (which also
    // carries the 0.14 ft top slab, issue #56). The open horizontal channel
    // between the two blue pieces is the safety-stripe inlay groove. (The old
    // single-piece approach with a proud stripe box read as a bolted-on strip
    // and could z-fight; a real recessed channel can't.)
    const whiteH = bandH * (2 / 3);
    extrudeSegment(A_out, B_out, B_in, A_in, whiteH, 0, counterWhite);
    extrudeSegment(A_out, B_out, B_in, A_in, (STRIPE_Y - GROOVE_HALF) - whiteH, whiteH, counterTopBlue);
    extrudeSegment(A_out, B_out, B_in, A_in, (bandH + 0.14) - (STRIPE_Y + GROOVE_HALF), STRIPE_Y + GROOVE_HALF, counterTopBlue);
  };

  const GAP_TRIM = 2.2;
  // Band segment list as [edge index, trimA, trimB] — the edge index rides
  // along because one edge may contribute several built pieces (the usquare
  // left side below) and the safety stripe needs each piece's true normal.
  //
  // usquare builds edges 0..2 only (left side, front, right side); the
  // closing back edge is never built — but that open back faces the
  // vestibule keep-out, so on its own it would seal the clerk OUT of the
  // well (the narrowed sides sit fully inside the vestibule's x-range). The
  // walk-through gap is carved MID-way along the left side band (two pieces
  // with a GAP_TRIM opening between them, z≈3.3..5.5): a straight tunnel
  // through an axis-aligned band survives the clerk grid's 0.5 ft cells,
  // where a corner gap between two inflated band ends rasterizes shut. The
  // 0.01 pseudo-trims swap the phantom back edge's mitres for square cuts.
  const uSideLen = zBackC - zFrontU; // 12
  const bandSegDefs: [number, number, number][] = desk
    ? [] // no walk-in band on a standalone desk — see `desk` above
    : usquare
    ? [
        [0, 0.01, uSideLen - 2.9],   // left side, back piece (z 8.4..5.5)
        [0, 5.1, 0.01],              // left side, front piece (z 3.3..-3.6)
        [1, 0, 0],                   // front run
        [2, 0, 0.01],                // right side
      ]
    : [
        [0, 0, GAP_TRIM],
        [1, GAP_TRIM, 0],
        [2, 0, 0],
        [3, 0, 0],
        [4, 0, 0],
      ];
  const bandSegs = bandSegDefs.map(([edge, trimA, trimB]) =>
    ({ edge, trimA, trimB, e: segEnds(edge, trimA, trimB) }));
  bandSegs.forEach((s) => buildMiteredSegment(s.e));
  const navFootprints: Footprint[] = bandSegs.map((s, i) =>
    segFootprint(`structure:counter-band-nav-${i}`, s.e, bandD));

  // Theme-gold safety stripe wrapping the customer-facing front of the shield
  // band as a RECESSED INLAY, ~3 in below the band top: one slab per band
  // segment sits in the horizontal channel the split blue pieces leave open
  // (see buildMiteredSegment), its outer face STRIPE_RECESS behind the band
  // face — a real groove, so nothing is coplanar and nothing can z-fight. The
  // slab is 0.02 ft taller than the groove so it tucks into both blue pieces
  // (no hairline seam at the channel lips; the tucked-in portions sit behind
  // the band face and are never visible). At mitred corners (untrimmed ends)
  // each slab's end is cut ON the corner's bisector plane — the same mitre
  // math the band pieces themselves use, just at the stripe's own offsets —
  // so adjacent inlays meet edge-to-edge with no overlap and nothing pokes
  // past the neighbouring face (the old square-cut slabs extended past the
  // corner point and visibly clipped/stuck out on the shield's corners).
  // Trimmed ends (the walk-through gap, the usquare's open back) stay flush.
  // The walk-through gap is already carved by GAP_TRIM on segments 0/1, so
  // wrapping all segments respects it.
  //
  // Mitred stripe corner at vertex i for an inward offset d off the band
  // face — identical bisector construction to the P_in ring above.
  const stripeCorner = (i: number, d: number): THREE.Vector2 => {
    const N_in = normals[(i - 1 + n) % n];
    const N_out = normals[i];
    const B = new THREE.Vector2().addVectors(N_in, N_out).normalize();
    const cosAlpha = N_in.dot(B);
    const safeCos = Math.abs(cosAlpha) > 0.001 ? cosAlpha : 1.0;
    return new THREE.Vector2().addVectors(P_out[i], B.clone().multiplyScalar(d / safeCos));
  };
  const dFace = STRIPE_RECESS;            // stripe's visible face, just behind the band face
  const dBack = STRIPE_RECESS + STRIPE_T; // stripe slab's hidden back face
  const slabH = STRIPE_H + 0.02 + (rounded ? 0.12 : 0); // over-tall: tucks into the blue (and their bevels)
  bandSegs.forEach(({ edge, trimA, trimB, e }) => {
    const N = normals[edge];
    const T = tangents[edge];
    const A = P_out[edge];
    const B = P_out[(edge + 1) % n];
    // Each end: square cut at a trim, mitred bisector cut at a shared corner.
    const aFace = trimA > 0
      ? A.clone().addScaledVector(T, trimA).addScaledVector(N, dFace)
      : stripeCorner(edge, dFace);
    const aBack = trimA > 0
      ? A.clone().addScaledVector(T, trimA).addScaledVector(N, dBack)
      : stripeCorner(edge, dBack);
    const bFace = trimB > 0
      ? B.clone().addScaledVector(T, -trimB).addScaledVector(N, dFace)
      : stripeCorner((edge + 1) % n, dFace);
    const bBack = trimB > 0
      ? B.clone().addScaledVector(T, -trimB).addScaledVector(N, dBack)
      : stripeCorner((edge + 1) % n, dBack);
    if (aFace.distanceTo(bFace) < 1e-3) return;
    const mesh = extrudeSegment(aFace, bFace, bBack, aBack, slabH, STRIPE_Y - slabH / 2, counterStripe,
      { noBevel: true, noCollide: true }); // recessed trim, not a body piece: sharp cut, no collider
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    // ...and CLOSE the channel behind it. The groove is cut clean through the
    // band (it is the space between two extrusions), while the stripe slab
    // only fills the outer 0.09 ft of a 1.5 ft depth — so the counter had an
    // open slot running its whole length, plainly visible as a dark line under
    // the top edge from the clerk side and through the walk-through gap's cut
    // ends. This blue filler spans from the stripe's hidden back face to the
    // band's inner edge, leaving the recess a recess on the customer side only.
    extrudeSegment(aBack, bBack, e.B_in, e.A_in, GROOVE_HALF * 2, STRIPE_Y - GROOVE_HALF,
      counterTopBlue, { noBevel: true, noCollide: true }); // body pieces above/below already collide
  });

  // ----- Inner counter: angled V-shaped island inside the shield -----
  const innerH = 2.7;

  // Island front line: on the shield it follows the two edges tapering to the
  // apex (a V); on the usquare it runs straight along the front band's inner
  // face (all three points collinear — the V math below degenerates cleanly:
  // equal edge normals, unit bisector, mitre length = innerD).
  // Front line of the island. On the shield it follows the two tapering edges
  // (a V); on the usquare and the standalone desk all three points are
  // collinear along one straight front, and the V math below degenerates
  // cleanly (equal edge normals, unit bisector, mitre length = innerD).
  const innerFrontZ = zFrontU + bandD;
  const straightFront = usquare || desk;
  // Island half-span: the usquare's narrower well (inner half-width
  // uHalf−bandD = 5.3) takes a shorter island than the shield's ±6, and the
  // standalone desk is the whole counter, so it is exactly the desk.
  const islandHalf = desk ? deskHalf : (usquare ? 5.0 : 6.0);
  // The desk's front line is its own front face, stepped along the run; the
  // other shapes' is a Z at a world-X. Same three collinear points either
  // way, so the V math below degenerates identically and nothing after this
  // knows the desk is turned.
  const pFront1 = deskFront
    ? deskFront.clone()
    : straightFront ? new THREE.Vector2(cx, innerFrontZ) : P_in[2].clone();
  const pFront0X = cx - islandHalf;
  const pFront0Y = straightFront
    ? innerFrontZ
    : P_in[1].y + (pFront0X - P_in[1].x) * (P_in[2].y - P_in[1].y) / (P_in[2].x - P_in[1].x);
  const pFront0 = deskFront
    ? deskFront.clone().addScaledVector(windU, -islandHalf)
    : new THREE.Vector2(pFront0X, pFront0Y);
  const pFront2X = cx + islandHalf;
  const pFront2Y = straightFront
    ? innerFrontZ
    : P_in[2].y + (pFront2X - P_in[2].x) * (P_in[3].y - P_in[2].y) / (P_in[3].x - P_in[2].x);
  const pFront2 = deskFront
    ? deskFront.clone().addScaledVector(windU, islandHalf)
    : new THREE.Vector2(pFront2X, pFront2Y);

  const tLeft = new THREE.Vector2().subVectors(pFront1, pFront0).normalize();
  const nLeft = new THREE.Vector2(-tLeft.y, tLeft.x);
  const rotLeft = Math.atan2(nLeft.x, nLeft.y);

  const tRight = new THREE.Vector2().subVectors(pFront2, pFront1).normalize();
  const nRight = new THREE.Vector2(-tRight.y, tRight.x);
  const rotRight = Math.atan2(nRight.x, nRight.y);

  const bisector = new THREE.Vector2().addVectors(nLeft, nRight).normalize();
  const cosAlpha = nLeft.dot(bisector);
  const miterLen = innerD / (Math.abs(cosAlpha) > 0.001 ? cosAlpha : 1.0);

  const pBack0 = pFront0.clone().addScaledVector(nLeft, innerD);
  const pBack1 = pFront1.clone().addScaledVector(bisector, miterLen);
  const pBack2 = pFront2.clone().addScaledVector(nRight, innerD);

  extrudeSegment(pFront0, pFront1, pBack1, pBack0, innerH, 0, counterWhite);
  extrudeSegment(pFront0, pFront1, pBack1, pBack0, 0.12, innerH, innerTopMat);
  extrudeSegment(pFront1, pFront2, pBack2, pBack1, innerH, 0, counterWhite);
  extrudeSegment(pFront1, pFront2, pBack2, pBack1, 0.12, innerH, innerTopMat);

  const getInnerCounterSpine = (x: number): { z: number; rotY: number } => {
    const pSpine0 = new THREE.Vector2().addVectors(pFront0, pBack0).multiplyScalar(0.5);
    const pSpine1 = new THREE.Vector2().addVectors(pFront1, pBack1).multiplyScalar(0.5);
    const pSpine2 = new THREE.Vector2().addVectors(pFront2, pBack2).multiplyScalar(0.5);

    if (x <= cx) {
      const slope = (pSpine1.y - pSpine0.y) / (pSpine1.x - pSpine0.x);
      const z = pSpine1.y + (x - cx) * slope;
      return { z, rotY: rotLeft };
    } else {
      const slope = (pSpine2.y - pSpine1.y) / (pSpine2.x - pSpine1.x);
      const z = pSpine1.y + (x - cx) * slope;
      return { z, rotY: rotRight };
    }
  };

  // The inner V island's two segments, for the clerk nav grid (she works the
  // strip between this island and the back band, so it must be an obstacle).
  navFootprints.push(
    segFootprint('structure:counter-inner-left',
      { A_out: pFront0, B_out: pFront1, A_in: pBack0, B_in: pBack1, T: tLeft }, innerD),
    segFootprint('structure:counter-inner-right',
      { A_out: pFront1, B_out: pFront2, A_in: pBack1, B_in: pBack2, T: tRight }, innerD),
  );

  // Mid-depth centre of the island's top — the origin of the counter's own
  // (u, n) frame, and the point every anchor below is measured from.
  const spineCentre = new THREE.Vector2().addVectors(pFront1, pBack1).multiplyScalar(0.5);

  // A point on the spine `u` feet along the counter. On the front-facing
  // shapes +u is world +X, so this is bit-for-bit the old
  // `getInnerCounterSpine(cx + u)` at x = cx + u; on the side-wall desk it
  // steps along the desk instead, which the world-X accessor cannot do
  // (every point of that spine shares one x).
  const spineAt = (u: number): { x: number; z: number; rotY: number } => {
    if (deskFront) {
      return {
        x: spineCentre.x + uVec.x * u,
        z: spineCentre.y + uVec.y * u,
        rotY: rotLeft,
      };
    }
    const s = getInnerCounterSpine(cx + u);
    return { x: cx + u, z: s.z, rotY: s.rotY };
  };

  // Heading that faces back OUT across the counter, given a normal pointing
  // into its body. The epsilon snap is load-bearing: a symmetric counter's
  // bisector comes out of the normalize as x = ±1e-16 rather than a clean
  // zero, and atan2 turns the sign of that dust into +π or −π. Same
  // direction, not the same number — and the clerk's facing is interpolated,
  // so the wrong one of the two is a full spin on the spot.
  const faceOut = (v: THREE.Vector2) =>
    Math.atan2(Math.abs(v.x) < 1e-9 ? 0 : -v.x, -v.y);

  // Where the clerk stands to work the counter at `u`: behind the spine on
  // her side (the spine normal points into her work strip), turned to face
  // across the counter at whatever is anchored there.
  const standingAt = (u: number): ClerkStanding => {
    const s = spineAt(u);
    const nSide = u <= 0 ? nLeft : nRight;
    const standOff = innerD / 2 + 1.15;
    return {
      x: s.x + nSide.x * standOff,
      z: s.z + nSide.y * standOff,
      yaw: faceOut(nSide),
    };
  };

  // Register duty spot: centered in the counter well, a good step back from
  // the inner island's apex (into the work strip toward the back band) so she
  // stands clearly in the open rather than embedded in the white island.
  // On a standalone desk there is no well to stand in — the working side is
  // the strip of floor between the desk's back edge and the side wall, which
  // is the whole reason the desk stands off that wall (desk-plan.ts's
  // DESK_WALL_STRIP, sized so her nav grid leaves a lane there).
  //
  // Stepping along the island's own bisector rather than +Z is what turns
  // with the desk; on every front-facing shape the bisector IS +Z, so the
  // spot and its heading are unchanged.
  const registerBack = pBack1.clone().addScaledVector(bisector, desk ? 1.4 : 1.7);
  const registerStanding: ClerkStanding = {
    x: registerBack.x, z: registerBack.y, yaw: faceOut(bisector),
  };

  // Standing spot at a rental terminal anchored at world-X `x` — the
  // world-X clothing on standingAt(), kept for the front-facing shapes'
  // callers (a side-wall desk has no meaningful world-X anchor).
  const getTerminalStanding = (x: number): ClerkStanding => standingAt(x - cx);

  const frame: CounterFrame = {
    fx: deskFront ? deskFront.x : cx,
    fz: deskFront ? deskFront.y : deskApexZ,
    ux: uVec.x, uz: uVec.y,
    nx: nVec.x, nz: nVec.y,
    facingYaw: deskPlan ? deskPlan.facingYaw : Math.PI,
  };

  installCounterModel(ctx, parent, group, spec.counterShape, rounded,
    deskFront
      ? { x: deskFront.x, z: deskFront.y, yaw: Math.atan2(-windU.y, windU.x) }
      : { x: cx, z: backZ, yaw: 0 },
    { body: counterWhite, top: counterTopBlue, inlay: counterStripe, worktop: innerTopMat });

  return {
    deskApexZ, cx, innerH, innerDepth: innerD, getInnerCounterSpine,
    frame, spineAt, standingAt,
    navFootprints, registerStanding, getTerminalStanding,
  };
}
