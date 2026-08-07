// Front entrance vestibule + walk-in checkout desk, modelled on the classic
// Entrance airlock. Self-contained fixture: owns the glazed chamber, the
// shield-pentagon counter, the desk CRT rental terminals (whose screen doubles
// as the live search terminal), and the rental bag the launch flourish drops
// movies into.
//
// T05 split this out of a single ~840-line entrance.ts into src/entrance/:
// doors.ts (door style variants), counter.ts (counter style/top variants),
// and this façade, which composes them and keeps its original public surface
// (bagMouthWorld, getSearchCameraPose(), dropIntoBag(), etc. — see
// three-scene.ts's call sites) unchanged so swapping StorefrontSpec doesn't
// ripple outward.
//
// Viewed from above (looking from outside, -Z into the store), the vestibule is
// a square box sitting against the front glass wall (Z = 15):
//
//                 store side (-Z)
//        +-----------------------------+   <- top wall = counter back (solid)
//        |              |              |
//   left |   EXIT       |   ENTRANCE   | right
//   door |  chamber     |   chamber    | door  ->  into store
//  (from |   (-X)       |    (+X)      |
//  store)|              |  glass       |
//        +--sl-[exit][entr]-sl---------+   <- front wall (Z = 15, street side)
//                 street side (+X = right when seen from outside)
//
//  - Front (street, +Z): the reference photo's composition — TWO full-glass
//    aluminum-framed doors ADJACENT at the store centreline, meeting at a
//    center stile, with a narrow (~2 ft) sidelight ("sl") flanking each, and
//    a continuous glass TRANSOM above doors and sidelights running up to the
//    storefront glazing head (WINDOW_HEAD_Y). Exit leaf on the left (-X),
//    entrance leaf on the right (+X).
//  - A glass pane down the centre (X = cx) splits entrance (right) from exit
//    (left).
//  - Right wall (+X): a door from the entrance chamber on into the store.
//  - Left wall (-X): a door letting exiters step from the store into the chamber.
//  - Top wall (-Z): solid; it doubles as the back of the trapezoidal checkout
//    counter (white body, blue top, yellow pinstripe) that faces the store.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGlassSurfaceNormalMap, createWalkOffMatTexture, createHvacVentTexture, useCheapMaterials } from '../canvas-textures';
import { getTubeMaskCanvas } from '../crt-tube';
import { makeCrtGlassMaterial, addGlassReflectionPane } from '../glass-reflection';
import { assetUrl } from '../asset-url';
import { FixtureContext, StoreFixture } from '../fixtures';
import { getActiveTheme, themeKneeGoldHex } from '../themes';
import { ENTRANCE_SIDELIGHT_WIDTH, CEILING_Y, mapWallSegmentUV } from '../store-layout';
import { vestibuleCeilingY } from '../ceiling-soffit';
import { WINDOW_HEAD_Y } from '../storefront-facade';
import { buildVestibuleDoor, updateVestibuleDoors, VestibuleDoor } from './doors';
import { buildCheckoutCounter, ClerkStanding } from './counter';
import { Footprint } from '../layout-validator';
import { CheckoutBag } from '../checkout-bag';
import { ReturnSlot } from './return-slot';
import type { Movie } from '../jellyfin';
import { CRT_BLACK, CRT_GOLD, CRT_INK, CRT_TEXT } from '../crt-theme';
import { brandString } from '../brand-pack';

export class EntranceCheckout implements StoreFixture {
  // The counter's store-facing point Z (used by StoreScene to frame the checkout camera move).
  public deskApexZ = 2.0;
  // Where the launch flourish drops the chosen movie case.
  public bagMouthWorld: THREE.Vector3 | null = null;
  // The bag's rest spot on the counter top (its group origin) — the launch
  // flourish's exit choreography drags the bag off from here toward the door.
  public bagBaseWorld: THREE.Vector3 | null = null;
  // The bag group's rest yaw (bagSpine.rotY) — the checkout hand-carry blends
  // from this to the walk heading so the pick-up-to-carry turn is seamless.
  public bagRestYaw = 0;

  // Real inner-counter-top geometry, kept around so StoreScene can register a
  // 'counter-top' MountSurface (src/mount-surfaces.ts) off actual build()
  // output rather than a second hardcoded copy of these numbers. Populated by
  // build(); null until then.
  private counterTopInfo: {
    cx: number;
    topY: number;
    depth: number;
    getSpine: (x: number) => { z: number; rotY: number };
  } | null = null;

  // Anchor for a counter-top MountSurface at world-X `x` (defaults to the
  // counter's own centreline): real top height + spine z/rotY, straight from
  // counter.ts's build() output. Null until build() has run.
  getCounterTopAnchor(x?: number): { x: number; y: number; z: number; rotY: number; depth: number } | null {
    if (!this.counterTopInfo) return null;
    const { cx, topY, depth, getSpine } = this.counterTopInfo;
    const atX = x ?? cx;
    const spine = getSpine(atX);
    return { x: atX, y: topY, z: spine.z, rotY: spine.rotY, depth };
  }

  // Everything the clerk's navigation needs from the entrance architecture:
  // exact counter footprints (band + inner island, real walk-through gap kept
  // open), the whole vestibule chamber as one keep-out rect, and her work
  // spots (register + a standing spot at each rental terminal). Populated by
  // build(); null until then.
  private clerkNavInfo: {
    footprints: Footprint[];
    register: ClerkStanding;
    terminals: ClerkStanding[];
  } | null = null;

  getClerkNav(): { footprints: Footprint[]; register: ClerkStanding; terminals: ClerkStanding[] } | null {
    return this.clerkNavInfo;
  }

  // Resolved vestibule chamber geometry (feet, world space) — the glass box's
  // extents, the centre divider, and the two store-side door lines. Published
  // so fixtures that must stand ON a door line (the EAS pedestals in
  // fixtures/storefront-dressing-93.ts) read the real doors instead of
  // re-deriving boxW/backZ/sideDoorZ from the storefront spec in another
  // module — the drift that put one pedestal of a "gate" in each chamber,
  // with the centre divider glass between them. Populated by build().
  private vestibuleInfo: {
    cx: number; xL: number; xR: number; frontZ: number; backZ: number;
    doorW: number; sideDoorZ: number;
  } | null = null;

  getVestibuleInfo(): {
    cx: number; xL: number; xR: number; frontZ: number; backZ: number;
    doorW: number; sideDoorZ: number;
  } | null {
    return this.vestibuleInfo;
  }

  // Soft-body checkout bag (src/checkout-bag.ts): a glossy white plastic
  // pillow-bag cloth sim that deforms around whatever dropIntoBag() puts in
  // it. Hidden and inert except during the checkout/exit flourish
  // (showBag/hideBag); it also sleeps itself the moment the plastic settles.
  private bag: CheckoutBag | null = null;
  // "RETURN TAPES HERE" chute on the counter band's in-store shoulder face,
  // just left of the walk-in door (bb-90s theme only — null otherwise). Owns
  // the drop-tapes-on-re-entry ritual.
  private returnSlot: ReturnSlot | null = null;
  private signAnchors: { id: string; pos: THREE.Vector3; yaw: number; category: string }[] = [];

  private group: THREE.Group | null = null;
  private terminalCanvas: HTMLCanvasElement | null = null;
  private terminalTex: THREE.CanvasTexture | null = null;
  private terminalLines: string[] | null = null; // null = idle screen
  private terminalCursorOn = true;
  private terminalLastBlink = 0;
  // Which line gets the blinking cursor block; null = last line (legacy idle
  // behaviour). The diegetic search terminal pins this to the query line (0)
  // so the cursor doesn't wander down into the result list.
  private terminalCursorLine: number | null = null;

  // The station-0 monitor screen doubles as the live search terminal. Its
  // world transform (once the CRT model has loaded) lets the camera dock
  // right in front of it; searchStationOrigin is the station's world origin
  // (known synchronously, before the GLTF resolves) so a camera move can be
  // requested immediately even on a cold start.
  private searchScreenMesh: THREE.Mesh | null = null;
  private searchStationOrigin = new THREE.Vector3();
  private searchStationRotY = 0;
  private doors: VestibuleDoor[] = [];
  private terminalStations: THREE.Vector3[] = [];

  // Fired on the frame a vestibule door starts opening for the player —
  // StoreScene rings the shop bell here (the walk-in "door entry" sound).
  public onDoorsOpen: (() => void) | null = null;

  constructor(private ctx: FixtureContext) {}

  build(): void {
    const group = new THREE.Group();
    this.group = group;
    this.ctx.scene.add(group);

    const spec = this.ctx.storefrontSpec;

    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      // Glass must not shadow as an opaque slab — the sun patches on the carpet
      // have to come straight through the vestibule glazing.
      const isGlass = mat instanceof THREE.MeshPhysicalMaterial && mat.transparent;
      m.castShadow = !isGlass;
      m.receiveShadow = true;
      group.add(m);
      this.ctx.addCollider(m);
      // Every glazed panel gets its reflection back (glass-reflection.ts): the
      // pane's 0.06 opacity was cutting the env reflection to 6% along with
      // the tint, which is why a full-height glazed chamber read as flat film.
      // FrontSide, not DoubleSide: these panels are SLABS, and outward normals
      // mean the far faces are depth-rejected behind the near one, so the
      // reflection adds exactly once instead of twice through the thickness.
      // No collider for the reflection — only `m` is solid.
      if (isGlass) addGlassReflectionPane(m, group, { side: THREE.FrontSide });
      return m;
    };

    // ----- Vestibule footprint -----
    const cx = 11.0;             // centred on the store
    const doorH = 7.0;
    const doorW = spec.doorWidth;
    const boxW = 9.0 + 2 * doorW; // widened by two door-widths
    const boxDepth = doorW * 2;  // depth = two door-widths (~6.4 ft)
    const frontZ = 15.0;         // street side (front glass wall)
    const backZ = frontZ - boxDepth; // store side (= counter back)
    const xL = cx - boxW / 2;    // -X (left) wall
    const xR = cx + boxW / 2;    // +X (right) wall
    // The chamber is capped at the cash-wrap soffit's height rather than
    // running the full height of the sales floor. A vestibule that opens
    // straight onto the 13.5 ft deck reads as a two-storey atrium — the doors
    // and their transom become a sliver at the bottom of a glass shaft. Capping
    // it puts the door head, transom and glazing head back into normal
    // storefront proportion, and taking the height from the soffit (rather than
    // a lower number of its own) means the front of the store carries ONE
    // dropped ceiling instead of two lids with a slot between them. Nothing is
    // left exposed outside: the facade's entry header already bricks in
    // everything above WINDOW_HEAD_Y + 0.15 (storefront-facade.ts).
    //
    // soffitCapY is that soffit height at the LIVE ceiling — on 'high' it
    // scales up right along with ceilingY, which used to carry the glass
    // transom up with it too. Real storefront glass doesn't grow with an
    // interior's ceiling height, and every extra foot of transom just
    // handed more of the entrance tower's exterior brick (which backs the
    // glass the whole way up — storefront-facade.ts's "solid face above
    // the entry") straight through to the sales floor (feedback/057:
    // "the yellow wall gives way to brick here... the vestibule should
    // never be this tall"). wallH now clamps to what the DEFAULT ceiling
    // height would produce, so the glass itself keeps a normal storefront
    // proportion no matter the preset; on a normal ceiling this clamp is a
    // no-op (soffitCapY already equals it) so today's look is unchanged.
    // The gap this opens up between the (now shorter) glass and the soffit
    // is closed by a solid, wall-colored capping soffit instead — see
    // "Solid soffit cap" below.
    const soffitCapY = vestibuleCeilingY(this.ctx.ceilingY);
    const wallH = Math.min(soffitCapY, vestibuleCeilingY(CEILING_Y));
    const wallT = 0.12;          // glazing thickness

    // ----- Materials -----
    // Frame + glass match the store's storefront windows: charcoal (or gray,
    // per StorefrontSpec.frameColor) mullions, clear glossy glass (no blue
    // tint), with frame members on the same levels.
    // Theme-driven frame color (frameColorOverride) wins over the storefront
    // preset's frameColor when the active theme defines one — see StoreTheme.frameColorOverride.
    const resolvedFrameColor = getActiveTheme().frameColorOverride ?? spec.frameColor;
    const frameMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(resolvedFrameColor), roughness: 0.5, metalness: 0.8 });
    // Matched to the store side-wall + storefront glass (was color 0xeef2f4 /
    // roughness 0.04, which read subtly different from the rest): same tint,
    // gloss, and the faint "living glass" clearcoat ripple. Shared by the
    // vestibule walls AND the door leaves, so this unifies both.
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xddf0ff, transparent: true, opacity: 0.06, roughness: 0.05, metalness: 0.0, envMapIntensity: 1.2,
      // Clearcoat ripple dropped on quality low (see setCheapMaterials).
      ...(useCheapMaterials() ? {} : { clearcoat: 0.4, clearcoatRoughness: 0.05, clearcoatNormalMap: createGlassSurfaceNormalMap(), clearcoatNormalScale: new THREE.Vector2(0.1, 0.1) }),
      side: THREE.DoubleSide }); // clear, fresnel-reflective (0.12 -> 0.06, see windows.ts — kill the gray veil)
    // Constant effective reflection strength across day/night display gains
    // (1.2 x the day gain 1.3) — the vestibule chamber runs full height, and
    // its fresnel-grazing panes overhead blew out white under night's 3.0 env
    // gain, reading as "the ceiling is way too bright". See
    // StoreScene.applyExteriorEnvClamp.
    glassMat.userData.envGainTarget = 1.56;
    const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd4da, roughness: 0.2, metalness: 0.9 });
    const frameT = 0.2;          // frame member thickness (matches window frameThickness)
    const frameD = 0.3;          // frame member depth

    // A framed glazed wall matching the store windows: clear glossy glass with a
    // black border and vertical mullions (no mid-height waist rail — the glazing
    // reads as one clean pane, matching the real building). `gaps` are the
    // X-or-Z centres of door openings (full height up to doorH) left in the glass.
    // orient 'X' = wall runs along X at constant Z (fixed); 'Z' = runs along Z at
    // constant X.
    //
    // `opts` shape the FRONT wall into the reference photo's storefront
    // composition: `transomY` adds full-width transom rails at the door head
    // and at the glazing head (the band between them reads as the continuous
    // transom), keeps interior mullions door-height only (nothing interrupts
    // the transom glass), and `extraMullions` adds door-height posts that
    // delineate the narrow sidelights beside the door pair.
    const buildGlazedWall = (
      orient: 'X' | 'Z', fixed: number, s0: number, s1: number, gaps: number[],
      opts?: { transomY?: number; extraMullions?: number[] },
    ) => {
      // place a box whose long axis lies along the wall's run direction
      const along = (center: number, lenAlong: number, y: number, h: number, thick: number, mat: THREE.Material) => {
        if (orient === 'X') box(lenAlong, h, thick, mat, center, y, fixed);
        else box(thick, h, lenAlong, mat, fixed, y, center);
      };
      const gapHalf = doorW / 2;
      const intervals = gaps.map((g) => [g - gapHalf, g + gapHalf] as [number, number]).sort((a, b) => a[0] - b[0]);
      // solid (glazed) panel intervals = complement of the door gaps
      const panels: [number, number][] = [];
      let cur = s0;
      intervals.forEach(([a, b]) => { if (a - cur > 0.01) panels.push([cur, a]); cur = Math.max(cur, b); });
      if (s1 - cur > 0.01) panels.push([cur, s1]);

      // glass: lower panels beside the doors + a full-width transom above the doors
      panels.forEach(([a, b]) => along((a + b) / 2, b - a, doorH / 2, doorH, wallT, glassMat));
      along((s0 + s1) / 2, s1 - s0, doorH + (wallH - doorH) / 2, wallH - doorH, wallT, glassMat);

      // vertical mullions at every panel/gap boundary (adjacent door gaps
      // dedupe into ONE post at their shared edge — the pair's center stile),
      // plus a mid-mullion in wide panels and any requested sidelight posts.
      // With a transom the interior posts stop at the door head so the transom
      // glass runs uninterrupted; only the wall's end posts run full height.
      const verts = new Set<number>([s0, s1]);
      intervals.forEach(([a, b]) => { verts.add(a); verts.add(b); });
      if (!opts?.transomY) panels.forEach(([a, b]) => { if (b - a > 4.5) verts.add((a + b) / 2); });
      opts?.extraMullions?.forEach((v) => verts.add(v));
      verts.forEach((v) => {
        const fullHeight = !opts?.transomY || Math.abs(v - s0) < 0.01 || Math.abs(v - s1) < 0.01;
        if (fullHeight) along(v, frameT, wallH / 2, wallH, frameD, frameMat);
        else along(v, frameT, doorH / 2, doorH, frameD, frameMat);
      });

      // horizontal rails: top (continuous), bottom (skips the door gaps),
      // and the door-head line. With a transom the head rail runs the FULL
      // width (one continuous bar over doors and sidelights alike) plus a
      // second full-width rail at the glazing head; otherwise a short head
      // rail across each door opening, as before.
      along((s0 + s1) / 2, s1 - s0, wallH - frameT / 2, frameT, frameD, frameMat);
      panels.forEach(([a, b]) => along((a + b) / 2, b - a, frameT / 2, frameT, frameD, frameMat));
      if (opts?.transomY) {
        along((s0 + s1) / 2, s1 - s0, doorH, frameT, frameD, frameMat);
        along((s0 + s1) / 2, s1 - s0, opts.transomY, frameT, frameD, frameMat);
      } else {
        intervals.forEach(([a, b]) => along((a + b) / 2, b - a, doorH, frameT, frameD, frameMat));
      }
    };

    const sideDoorZ = backZ + doorW / 2 + 0.4; // side doors sit on the store-side (inner) half
    this.vestibuleInfo = { cx, xL, xR, frontZ, backZ, doorW, sideDoorZ };

    // ----- Front wall (Z = frontZ): the reference photo's recessed-entry
    // composition — narrow sidelight | door | door | narrow sidelight. The two
    // full-glass leaves are ADJACENT at the store centreline, meeting at a
    // center stile; the exit leaf is on the left (-X, swings out to the
    // street), the entrance leaf on the right (+X, swings into the vestibule).
    // A continuous transom of glass runs above doors and sidelights up to the
    // storefront glazing head (WINDOW_HEAD_Y), where every window head across
    // the whole storefront aligns. -----
    const exitX = cx - doorW / 2;  // left leaf, hinged at its left jamb
    const entrX = cx + doorW / 2;  // right leaf, hinged at its right jamb
    buildGlazedWall('X', frontZ, xL, xR, [exitX, entrX], {
      transomY: WINDOW_HEAD_Y,
      extraMullions: [
        cx - doorW - ENTRANCE_SIDELIGHT_WIDTH, // left sidelight's outer post
        cx + doorW + ENTRANCE_SIDELIGHT_WIDTH, // right sidelight's outer post
      ],
    });
    const doorMats = { frameMat, glassMat, chrome };
    // The glazed wall above already frames the paired opening completely: the
    // full-width transom bar at the door head is the shared header, and the
    // posts at cx ± doorW (hinge jambs) and cx (the meeting stile) are the
    // uprights — so each leaf's own static frame parts are all suppressed
    // (duplicating them would coincide with those posts and z-fight).
    //
    // Swing leaves hinge at the OUTER jambs (exit swings out to the street,
    // entrance swings into the vestibule — both openAngle -1.4 given their
    // mirrored hinge sides). For the 'sliding' doorStyle the same flag is the
    // slide direction instead: the pair parts from the centre, each leaf
    // tucking into a pocket behind the sidelight glass on its own side.
    const sliding = spec.doorStyle === 'sliding';
    const noFrame = { header: false, jambLeft: false, jambRight: false };
    this.doors.push(buildVestibuleDoor(this.ctx, group, doorMats, spec, exitX, frontZ, doorH, true, !sliding, -1.4, noFrame));
    this.doors.push(buildVestibuleDoor(this.ctx, group, doorMats, spec, entrX, frontZ, doorH, true, sliding, -1.4, noFrame));

    // ----- Back wall (Z = backZ): glass too, so the whole chamber is glazed -----
    buildGlazedWall('X', backZ, xL, xR, []);

    // ----- Side walls (glass), each with one door on the inner (store-side) half -----
    buildGlazedWall('Z', xR, backZ, frontZ, [sideDoorZ]); // right wall -> into store
    buildGlazedWall('Z', xL, backZ, frontZ, [sideDoorZ]); // left wall  -> exiters enter
    this.doors.push(buildVestibuleDoor(this.ctx, group, doorMats, spec, xR, sideDoorZ, doorH, false, true, 1.4));
    this.doors.push(buildVestibuleDoor(this.ctx, group, doorMats, spec, xL, sideDoorZ, doorH, false, true, 1.4));

    // ----- Central glass divider splitting entrance (+X) from exit (-X) -----
    buildGlazedWall('Z', cx, backZ, frontZ, []);

    // ----- Solid soffit cap (opens up only when soffitCapY > wallH, i.e. the
    // 'high' ceiling preset) -----
    // Every wall above closed its glass at the clamped wallH, leaving a gap
    // up to the soffit's real height (soffitCapY) that used to be more
    // glass. Instead of glazing it, box it in solid and finish it in the
    // store's own wall material — "the vestibule top half should be a
    // solid soffit that extends from the upper soffit, [with] walls that
    // match the color of the store walls" (feedback/057). Reuses the same
    // wallSurface material + mapWallSegmentUV helper every other recycled
    // wall surface in the store goes through (store-shell.ts's knee walls,
    // the front window's kneeSurface, ...) so it carries the same mottle/
    // orange-peel/contact-AO as the rest of the room instead of a flat
    // patch of color, and falls back to the theme's knee-gold approximation
    // in a context with no live wall build (matching store-shell.ts's own
    // kneeMat fallback) rather than a hardcoded hex.
    const capH = soffitCapY - wallH;
    if (capH > 0.05) {
      const wallSurf = this.ctx.wallSurface;
      const capMat = wallSurf?.material
        ?? new THREE.MeshStandardMaterial({ color: new THREE.Color(themeKneeGoldHex()), roughness: 0.92, metalness: 0.0 });
      const capGeo = new THREE.BoxGeometry(boxW, capH, boxDepth);
      if (wallSurf) mapWallSegmentUV(capGeo, boxW, capH, wallH, wallSurf.storeWidth, wallSurf.roomHeight);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(cx, wallH + capH / 2, (frontZ + backZ) / 2);
      cap.castShadow = true;
      cap.receiveShadow = true;
      group.add(cap);
      this.ctx.addCollider(cap);

      // HVAC diffusers on the entrance (+X chamber) and exit (-X chamber)
      // sides — "maybe an AC vent on the entrance and exit sides" — set
      // into the cap's underside over each chamber, same spot the walk-off
      // mats below centre on (cx ± boxW/4), and the same slotted-diffuser
      // texture/material recipe the main ceiling's own vents use
      // (createHvacVentTexture, store-shell.ts).
      const ventTex = createHvacVentTexture();
      const ventMat = new THREE.MeshStandardMaterial({
        map: ventTex, roughness: 0.5, metalness: 0.06,
        emissive: 0xffffff, emissiveMap: ventTex, emissiveIntensity: 0.15,
      });
      const ventW = Math.min(boxDepth * 0.6, 2.0);
      const ventH = ventW / 2; // matches the texture's 256x128 (2:1) aspect
      [cx + boxW / 4, cx - boxW / 4].forEach((vx) => {
        const vent = new THREE.Mesh(new THREE.PlaneGeometry(ventW, ventH), ventMat);
        // Just BELOW the cap's own bottom face (which sits exactly at wallH) —
        // proud of it toward the chamber, or the solid box's opaque underside
        // wins the depth test and hides the vent plane entirely.
        vent.position.set(vx, wallH - 0.01, (frontZ + backZ) / 2);
        vent.rotation.x = Math.PI / 2; // normal points down, into the chamber below
        group.add(vent);
      });
    }

    // ----- Vestibule ceiling -----
    // There isn't one, and there are no fittings in it either. The cash-wrap
    // soffit's lid runs on past its fascia, over this chamber, and into the
    // storefront wall (frontSoffitLidPolygon in src/ceiling-soffit.ts), so the
    // front of the store carries ONE tile deck at vestibuleCeilingY ==
    // frontSoffitY with no joint over the entrance. A second lid here only ever
    // meant a seam to get wrong — at a different height it was a slot you could
    // see through, and at the same height it was coplanar overlap, i.e.
    // z-fighting.
    //
    // The two flush lenses that used to hang under it went with it. They were
    // there to keep the chamber off black after dark back when it had its own
    // low lid closing it off from the room; sitting proud of a deck that now
    // runs straight through, they read as two panels stuck on the ceiling for
    // no reason. The deck's own troffers and the marquee carry the entrance.

    // ----- Walk-off mats -----
    // Ribbed charcoal rubber mats on each half of the vestibule floor (entry
    // +X, exit -X) — every real retail vestibule has them, and they break up
    // what was pristine carpet running straight to the door line.
    {
      const { map: matTex, normalMap: matNorm } = createWalkOffMatTexture();
      const matW = (boxW / 2) - doorW * 0.55;
      const matD = boxDepth - 1.1;
      matTex.repeat.set(matW / 1.5, matD / 1.5);
      matNorm.repeat.copy(matTex.repeat);
      const matMat = new THREE.MeshStandardMaterial({
        map: matTex, normalMap: matNorm, normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.95, metalness: 0.0,
      });
      [cx + boxW / 4, cx - boxW / 4].forEach((mx) => {
        const mat = new THREE.Mesh(new THREE.BoxGeometry(matW, 0.025, matD), matMat);
        mat.position.set(mx, 0.0125, (frontZ + backZ) / 2);
        mat.receiveShadow = true;
        group.add(mat);
      });
    }

    // ----- Checkout counter: the classic shield pentagon, now a WALK-IN desk -----
    // Same inverted-shield footprint as before (wide flat edge at the vestibule
    // glass, flared shoulders, two long edges tapering to a point aimed into the
    // store), but instead of a solid slab the counter is a hollow band following
    // that outline, with a walk-through gap at the shoulder nearest the exit
    // door (the store-facing point stays closed, so the customer-facing front
    // reads as one continuous face) so people can step into the middle. Inside
    // sits a straight inner counter carrying the rental terminals (beige CRTs +
    // keyboards, gold-on-black screens) and the bag stand. See counter.ts for
    // the counterStyle/counterTop variants — the footprint below is identical
    // across styles so every anchor below is unaffected by which style is active.
    const counterResult = buildCheckoutCounter(this.ctx, group, cx, backZ, spec);
    this.deskApexZ = counterResult.deskApexZ;
    const { getInnerCounterSpine, innerH, innerDepth } = counterResult;
    this.counterTopInfo = { cx, topY: innerH + 0.12, depth: innerDepth, getSpine: getInnerCounterSpine };

    // Clerk nav data: counter rects + the vestibule chamber (glass box, never
    // walkable for her) + work spots at the register and the two terminals
    // (same cx±4 the terminal props are anchored at, below).
    this.clerkNavInfo = {
      footprints: [
        ...counterResult.navFootprints,
        {
          label: 'structure:vestibule', kind: 'structure',
          cx, cz: (frontZ + backZ) / 2, w: boxW + 0.24, d: boxDepth + 0.24, yaw: 0,
        },
      ],
      register: counterResult.registerStanding,
      terminals: [
        counterResult.getTerminalStanding(cx - 4.0),
        counterResult.getTerminalStanding(cx + 4.0),
      ],
    };

    // Anchor X offsets along the inner island. The usquare counter's island
    // is shorter (±5.0 vs the shield's ±6.0 — see counter.ts islandHalf), so
    // everything that parks ON it pulls proportionally toward the centre.
    const sq = spec.counterShape === 'usquare';
    const termOff = sq ? 3.5 : 4.0;
    const bagOff = sq ? 4.6 : 5.4;
    const term1 = getInnerCounterSpine(cx - termOff);
    const term2 = getInnerCounterSpine(cx + termOff);
    const bagSpine = getInnerCounterSpine(cx - bagOff);

    // Rental terminals on the inner counter, screens facing the clerk side
    // (away from the store) like a real register — the gold-on-black rental
    // system reads to whoever is working the register, not the customer.
    this.buildDeskTerminals(group, [
      { x: cx - termOff, y: innerH + 0.12, z: term1.z, rotY: term1.rotY },
      { x: cx + termOff, y: innerH + 0.12, z: term2.z, rotY: term2.rotY },
    ]);

    // Glossy white plastic rental bag waiting at the end of the counter
    // nearest the exit door (-X side) — the launch flourish drops your movie
    // into it before you leave.
    this.bag = new CheckoutBag(group, cx - bagOff, innerH + 0.12, bagSpine.z, bagSpine.rotY);
    this.bagMouthWorld = this.bag.mouthWorld;
    this.bagBaseWorld = new THREE.Vector3(cx - bagOff, innerH + 0.12, bagSpine.z);
    this.bagRestYaw = bagSpine.rotY;

    // "RETURN TAPES HERE" chute grown off the counter band INSIDE the store,
    // on the shoulder face nearest the entrance-side door — immediately on
    // your LEFT as you step out of the vestibule into the store, before you
    // pass the counter (it used to poke into the glass entrance chamber, where
    // the re-entry camera never framed it and the drop ritual played unseen).
    // 90s video stores only. The face is picked per counter shape from
    // the same outline constants counter.ts builds from (mirrored here like
    // the BAND_H trio below — that file stays layout-agnostic): the shield's
    // right shoulder edge runs (cx+9.8, zBackC-6.24) -> (cx+6.2, zBackC), the
    // usquare's right side sits flat at x = cx+6.8. Both faces clear the
    // vestibule glazing (z >= 8.6) and the store-side door's swing. The chute
    // protrudes into walkable floor now, so its footprint joins the clerk nav
    // rects below.
    // A RETURN TAPES chute belongs to the VHS-rental store — the tape eras
    // (1990 / 1993 / 2000), not the DVD-era 2010.
    const chuteTheme = getActiveTheme();
    if (chuteTheme.defaultMedium === 'vhs') {
      const zBackC = backZ - 0.1; // counter.ts's band outline datum
      let anchor: { x: number; z: number };
      let faceYaw: number;
      if (sq) {
        // Flat right side, facing +X; biased toward the back (door) end but
        // clear of the back corner's square cut.
        anchor = { x: cx + 6.8, z: zBackC - 3.2 };
        faceYaw = Math.PI / 2;
      } else {
        // Midpoint of the shield's right shoulder edge, facing its outward
        // normal (out toward the walk-in corridor along the vestibule).
        const ax = cx + 9.8, az = zBackC - 6.24; // shoulder vertex
        const bx = cx + 6.2, bz = zBackC;        // back-right vertex
        anchor = { x: (ax + bx) / 2, z: (az + bz) / 2 };
        // Edge tangent (t) -> outward normal (t.z, -t.x); yaw with n = (sin, cos).
        const tl = Math.hypot(bx - ax, bz - az);
        faceYaw = Math.atan2((bz - az) / tl, -(bx - ax) / tl);
      }
      this.returnSlot = new ReturnSlot(this.ctx, group, anchor, faceYaw);
      this.clerkNavInfo.footprints.push(this.returnSlot.getFootprint());
    }

    // Populate sign placement anchors on the register counter top spine
    const rightSignOff = sq ? 4.4 : 5.4;
    const leftAnchor = getInnerCounterSpine(cx - 1.8);
    const middleAnchor = getInnerCounterSpine(cx + 1.8);
    const rightAnchor = getInnerCounterSpine(cx + rightSignOff);

    // #37: the "Please Rewind" tent sign belongs on the BLUE band-top rim of
    // the outer shield counter (counter.ts's `counterTopBlue`, at height
    // bandH=3.4 + a 0.14 cap — both private to counter.ts and mirrored here
    // since that file is off-limits to edit), not on the inner service
    // counter's spine used above for the other two register signs, which is
    // WHITE by default (innerTopMat falls back to the plain counterWhite
    // finish for the default 'white' counterTop spec). The inner spine sits
    // (bandD/2 + innerDepth/2) further inward — along the same per-edge
    // normal used to build it in counter.ts — than the band-top's own
    // midline, so undo just that one offset (same x/z direction, same rotY:
    // parallel edges share a tangent) to land the sign on the band top.
    const BAND_H = 3.4, BAND_CAP = 0.14, BAND_D = 1.5;
    const bandShift = BAND_D / 2 + innerDepth / 2;
    const registerLeftOnBand = {
      x: (cx - 1.8) - Math.sin(leftAnchor.rotY) * bandShift,
      y: BAND_H + BAND_CAP,
      z: leftAnchor.z - Math.cos(leftAnchor.rotY) * bandShift,
    };

    // 1993 footage pack: the yellow "NEXT REGISTER PLEASE" tent stands on the
    // blue band top too, on the stretch between the middle and right register
    // positions — the lane no clerk is standing at.
    const nextSpine = getInnerCounterSpine(cx + 3.6);
    const registerNextOnBand = {
      x: (cx + 3.6) - Math.sin(nextSpine.rotY) * bandShift,
      y: BAND_H + BAND_CAP,
      z: nextSpine.z - Math.cos(nextSpine.rotY) * bandShift,
    };

    // A sign anchor's `yaw` is the direction the PRINT faces — the same
    // convention MountSurface.place() returns and FixturePlacement.yaw uses,
    // so fixtures/signage.ts can drop a fixture on it with
    // `rotation.y = slot.yaw` and have it read to the shopper.
    // getInnerCounterSpine()'s rotY is the counter edge's INWARD normal (it
    // points into the clerk's work strip — that's what getTerminalStanding
    // walks along), so every anchor takes the half-turn here, ONCE, instead
    // of each consumer remembering to. Without it the register snap frames
    // printed at the clerk's back (user report: "this sign is facing the
    // clerk. why?").
    const facing = (rotY: number) => rotY + Math.PI;
    this.signAnchors = [
      {
        id: 'register-left',
        pos: new THREE.Vector3(registerLeftOnBand.x, registerLeftOnBand.y, registerLeftOnBand.z),
        yaw: facing(leftAnchor.rotY),
        category: 'register'
      },
      {
        id: 'register-next',
        pos: new THREE.Vector3(registerNextOnBand.x, registerNextOnBand.y, registerNextOnBand.z),
        yaw: facing(nextSpine.rotY),
        category: 'register'
      },
      {
        id: 'register-middle',
        pos: new THREE.Vector3(cx + 1.8, innerH + 0.12, middleAnchor.z),
        yaw: facing(middleAnchor.rotY),
        category: 'register'
      },
      {
        id: 'register-right',
        pos: new THREE.Vector3(cx + rightSignOff, innerH + 0.12, rightAnchor.z),
        yaw: facing(rightAnchor.rotY),
        category: 'register'
      }
    ];
  }

  getSignAnchors(): { id: string; pos: THREE.Vector3; yaw: number; category: string }[] {
    return this.signAnchors;
  }

  // ===========================================================================
  // Front-desk rental terminals: real downloaded CRT-monitor + keyboard models
  // (CC-BY "CRT Monitor" by Jarlan Perez, CC0 "Computer Keyboard" by Kenney —
  // see public/models/ATTRIBUTION.md), tinted beige like a late-80s register,
  // each with a gold-on-black rental-system screen. The screen canvas doubles
  // as the live search terminal (setTerminalText mirrors the search overlay).
  // ===========================================================================
  private buildDeskTerminals(
    parent: THREE.Group,
    stations: { x: number; y: number; z: number; rotY: number }[]
  ) {
    this.terminalStations = stations.map((st) => new THREE.Vector3(st.x, st.y, st.z));
    // Real depth (ft) of the inner counter island the terminals sit on —
    // set synchronously above in build(), well before any of this method's
    // async GLTF callbacks run. Used below to size the monitor's overhang
    // off the ACTUAL counter geometry instead of a hardcoded half-depth.
    const islandDepth = this.counterTopInfo!.depth;
    // Shared terminal screen texture (one canvas drives every desk CRT).
    // Sized generously (2x the old 512x384) so the diegetic search terminal
    // reads crisply once the camera docks close in front of it.
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    this.terminalCanvas = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    this.terminalTex = tex;
    this.drawTerminal();

    const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const beige = new THREE.MeshStandardMaterial({ color: 0xd9cdb2, roughness: 0.62, metalness: 0.03 });
    const beigeDark = new THREE.MeshStandardMaterial({ color: 0xc4b89e, roughness: 0.68, metalness: 0.03 });
    // Dark tube face for the model's own screen primitives — beige-tinting
    // them painted the glass as shell plastic, which made the UI plane read as
    // a card stuck onto the monitor instead of its screen.
    const crtFaceMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.35, metalness: 0.05 });
    const loader = new GLTFLoader();

    // Fit a loaded model: uniform-scale to targetH tall, sit on y=0, centre x/z.
    const fitModel = (obj: THREE.Object3D, targetH: number) => {
      const bb = new THREE.Box3().setFromObject(obj);
      const size = bb.getSize(new THREE.Vector3());
      const s = targetH / Math.max(size.y, 1e-4);
      obj.scale.setScalar(s);
      bb.setFromObject(obj);
      const ctr = bb.getCenter(new THREE.Vector3());
      obj.position.x -= ctr.x;
      obj.position.z -= ctr.z;
      obj.position.y -= bb.min.y;
      // Detached models never get a renderer matrix pass — push the transforms
      // above into matrixWorld NOW or the boxes measured below describe where
      // the meshes USED to be, not where they render.
      obj.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(obj);
    };

    const tintBeige = (obj: THREE.Object3D, dark: boolean) => {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = dark ? beigeDark : beige;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    };

    const stationGroups = stations.map((st) => {
      const g = new THREE.Group();
      g.position.set(st.x, st.y, st.z);
      g.rotation.y = st.rotY;
      // Keep the whole terminal out of the GTAO G-buffer (feedback/004): the
      // screen/glass/bezel z-sandwich is thousandths of a foot deep — far
      // below the AO radius — so once the post-move AO settle fades in, the
      // pass paints hard black blotches over the screens.
      g.userData.excludeFromSSAO = true;
      // ...and knock the AO *blend* out of its pixels too, otherwise the AO of
      // the counter/shelves BEHIND the hidden terminal is multiplied straight
      // across the bezel and the lit screen (see the GTAO wrapper).
      g.userData.aoBlendMask = true;
      parent.add(g);
      return g;
    });
    // Station 0's world origin is known immediately (no GLTF round-trip
    // needed) so the search camera dock has somewhere to aim even before the
    // monitor model resolves.
    if (stationGroups[0]) {
      this.searchStationOrigin.copy(stationGroups[0].position);
      this.searchStationRotY = stations[0].rotY;
    }

    const MON_H = 1.55;
    loader.load(assetUrl('models/crt_monitor.glb'), (gltf) => {
      stationGroups.forEach((g, idx) => {
        const monitor = gltf.scene.clone(true);
        // Identify the model's screen primitives by their authored material
        // names BEFORE tintBeige clobbers every material: 'mat16' is the glass
        // pane (frontmost — the real bezel opening), 'mat17' the recessed tube
        // face behind it.
        let glassMesh: THREE.Mesh | null = null;
        const tubeMeshes: THREE.Mesh[] = [];
        monitor.traverse((child) => {
          if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
            const matName = (child.material as THREE.Material).name;
            if (matName === 'mat16') glassMesh = child;
            else if (matName === 'mat17') tubeMeshes.push(child);
          }
        });
        tintBeige(monitor, false);
        tubeMeshes.forEach((m) => { m.material = crtFaceMat; });
        // The model's own curved glass pane becomes REAL glass — an ADDITIVE
        // reflection of the store off the baked environment (glass-reflection.ts),
        // which slides across the dome as you move along the counter — instead
        // of opaque tube-black. This is what embeds the screen in the bezel.
        // One material PER STATION: the monitors face different ways, and
        // teardown disposes materials. Same rule as the vestibule glazing:
        // transparent glass must not shadow as an opaque slab (tintBeige set
        // castShadow on every mesh).
        if (glassMesh) {
          (glassMesh as THREE.Mesh).material = makeCrtGlassMaterial();
          (glassMesh as THREE.Mesh).castShadow = false;
          (glassMesh as THREE.Mesh).renderOrder = 1;
        }
        // The model's bezel faces its -Z; spin it so the face matches the
        // screen plane we add on the station's +Z side.
        monitor.rotation.y = Math.PI;
        const bb = fitModel(monitor, MON_H);
        // This station group's local +Z is the island's front->back offset
        // axis (matches getInnerCounterSpine's rotY: local Z = -islandDepth/2
        // is the island's FRONT face, i.e. the customer side — and it sits
        // FLUSH, zero clearance, against the solid outer counter band, for
        // both counter shapes (counter.ts builds pFront directly on the
        // band's own inner face line). Local Z = +islandDepth/2 is the BACK
        // face, the clerk side, opening onto the open counter well she works
        // in. This model is nearly as deep as the whole island even centered
        // (measured: ~1.55 ft of body on a 1.6 ft island, ~0.3 in of slack
        // total), so it has to overhang SOMEWHERE. The old
        // `monitor.position.z -= 0.3` overhung it toward the flush FRONT,
        // driving the tube ~0.27 ft into the solid band — the owner's "the
        // computer monitors are clipping with the front counter". Overhang
        // into the open well instead (the safe side), and size the shift off
        // the model's own measured bounding box rather than a fixed number:
        // keep a real clearance off the flush front plane, capped so the
        // back overhang stays well short of the clerk's stand point (~1.15 ft
        // beyond this edge — see counter.ts getTerminalStanding's standOff).
        const halfIslandD = islandDepth / 2;
        const FRONT_CLEARANCE = 0.12;
        const BACK_OVERHANG_CAP = 0.35;
        const shiftZ = THREE.MathUtils.clamp(
          (-halfIslandD + FRONT_CLEARANCE) - bb.min.z,
          0,
          (halfIslandD + BACK_OVERHANG_CAP) - bb.max.z,
        );
        monitor.position.z += shiftZ;
        monitor.updateMatrixWorld(true);
        bb.setFromObject(monitor);
        // Bezel-opening bounds must be measured while the monitor is still
        // detached (setFromObject uses world space; g already carries the
        // station transform).
        const glassBox = glassMesh ? new THREE.Box3().setFromObject(glassMesh) : null;
        // The actual picture area is the recessed tube face (mat17) — the
        // glass pane (mat16) spans the whole shell opening, bezel included,
        // and sizing the UI to it made the screen read as a sticker slapped
        // over the monitor's face.
        const tubeBox = tubeMeshes.length
          ? tubeMeshes.reduce((acc, m) => acc.union(new THREE.Box3().setFromObject(m)), new THREE.Box3())
          : null;
        g.add(monitor);
        // Gold-on-black screen plane fitted to the tube face and recessed
        // BEHIND the (now transparent, glossy) glass pane, with the old
        // whole-model heuristic as fallback if the glb's material names ever
        // change.
        let screenW = (bb.max.x - bb.min.x) * 0.62;
        let screenH = MON_H * 0.48;
        let sx = 0, sy = MON_H * 0.55, sz = bb.max.z + 0.012;
        const fitBox = tubeBox ?? glassBox;
        if (fitBox) {
          screenW = (fitBox.max.x - fitBox.min.x) * 0.94;
          screenH = (fitBox.max.y - fitBox.min.y) * 0.94;
          sx = (fitBox.min.x + fitBox.max.x) / 2;
          sy = (fitBox.min.y + fitBox.max.y) / 2;
          // Between the tube face and the back of the glass dome — never
          // inside the tube geometry itself.
          sz = glassBox
            ? Math.max(glassBox.min.z - 0.004, tubeBox ? tubeBox.max.z + 0.003 : -Infinity)
            : fitBox.max.z + 0.008;
        }
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenMat);
        screen.position.set(sx, sy, sz);
        g.add(screen);
        if (idx === 0) this.searchScreenMesh = screen; // this one doubles as the search terminal
      });
      this.ctx.requestShadowRefresh();
    }, undefined, () => {
      // Model unavailable (offline) — box-monitor fallback so the desk still works.
      stationGroups.forEach((g, idx) => {
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.2), beige);
        body.position.y = 0.7;
        body.castShadow = true;
        g.add(body);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.72), screenMat);
        screen.position.set(0, 0.72, 0.615);
        g.add(screen);
        const gloss = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.72), makeCrtGlassMaterial());
        gloss.position.set(0, 0.72, 0.619);
        gloss.renderOrder = 1;
        g.add(gloss);
        if (idx === 0) this.searchScreenMesh = screen;
      });
    });

    loader.load(assetUrl('models/keyboard.glb'), (gltf) => {
      // Key-panel material: a darker putty than the shell so the recessed
      // key field / numpad still read as such at desk distance — the flat
      // tintBeige pass turned the whole model into a featureless wedge
      // (feedback/046).
      const kbKeys = new THREE.MeshStandardMaterial({ color: 0x9a917c, roughness: 0.72, metalness: 0.03 });
      stationGroups.forEach((g) => {
        const kb = gltf.scene.clone(true);
        // Two-tone by the source model's material names: 'metalDark' is the
        // shell, 'metalMedium' the recessed key panels.
        kb.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const pick = (m: THREE.Material) => (m.name === 'metalMedium' ? kbKeys : beigeDark);
            child.material = Array.isArray(child.material) ? child.material.map(pick) : pick(child.material);
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        // The model's key field faces its -Z; spin it to face the clerk like
        // the monitor screen does (feedback/046 "looks backwards").
        kb.rotation.y = Math.PI;
        kb.position.set(0, 0, 0);
        kb.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(kb);
        const size = bb.getSize(new THREE.Vector3());
        const s = 0.85 / Math.max(size.x, 1e-4); // ~0.85 ft wide
        kb.scale.setScalar(s);
        kb.updateMatrixWorld(true);
        bb.setFromObject(kb);
        const ctr = bb.getCenter(new THREE.Vector3());
        // Seat ON the deck (bottom at y=0), back edge just inside the
        // island's clerk-side face (islandDepth/2, measured off the same
        // real counter geometry the monitor shift above uses — was a
        // hardcoded 0.8/0.78) with its back half tucked under the CRT's
        // bezel lip — the only strip of deck the monitor leaves free. The old
        // `-ctr.z + 0.95` push left the near half cantilevered past the
        // island edge, reading as a floating slab (feedback/046). This stays
        // safely inside [-islandDepth/2, islandDepth/2] (measured: z spans
        // ~0.42..0.78 on a +-0.8 island) — no counter-clipping here.
        kb.position.set(-ctr.x, -bb.min.y, (islandDepth / 2 - 0.02) - bb.max.z);
        g.add(kb);
      });
      this.ctx.requestShadowRefresh();
    }, undefined, () => { /* keyboardless fallback is fine */ });
  }

  // Redraw the desk-CRT terminal canvas to the 1993 POS reference look
  // (a 1993 rental POS terminal): GOLD phosphor on black, a solid
  // gold reverse-video TITLE BAR up top and FOOTER BAR along the bottom, faint
  // scanlines, blinking block cursor. Content is either the idle rental screen
  // or whatever setTerminalText mirrored from the search overlay.
  private drawTerminal() {
    const canvas = this.terminalCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = CRT_BLACK;
    ctx.fillRect(0, 0, W, H);

    // Safe area. The screen plane is fitted to the CRT tube's bounding box,
    // whose curved edges sit BEHIND the monitor bezel, so the outer ~10% of
    // this canvas is never visible on the model. Everything is laid out inside
    // the inset instead of against the canvas edge, which is why the first
    // column and the header used to be shaved off in a docked view.
    const PAD_X = W * 0.155;
    const PAD_Y = H * 0.12;
    const SAFE_W = W - PAD_X * 2;
    // 40 columns of Courier across the safe width (advance ≈ 0.6em) — matches
    // the 40-char clip below, so a full-width line exactly fills the screen.
    const CH = SAFE_W / 40;
    const FONT_PX = Math.floor(CH / 0.6);
    const LINE_H = Math.round(FONT_PX * 1.24);
    const BAR_H = Math.round(LINE_H * 1.3);

    // ── Title bar: solid gold, dark text (the DOS-era POS sandwich, top) ──
    ctx.textBaseline = 'top';
    ctx.fillStyle = CRT_GOLD;
    ctx.fillRect(PAD_X - CH * 0.5, PAD_Y, SAFE_W + CH, BAR_H);
    ctx.font = `bold ${FONT_PX}px "Courier New", monospace`;
    ctx.fillStyle = CRT_INK;
    ctx.fillText(brandString('pos-system-title', 'HALCYON RENTAL SYSTEM'), PAD_X, PAD_Y + (BAR_H - FONT_PX) / 2);

    // The idle screen is also the manager terminal's only in-world signpost
    // (UX pass 2026-08): the Left press at the counter was taught nowhere,
    // and "/" is keyboard-only advice — a remote user needs the other line.
    const lines = this.terminalLines ?? [
      'STORE #55746   GREEN BAY, WI',
      '',
      'READY.',
      '',
      'PRESS / TO SEARCH CATALOG',
      'AT COUNTER: LEFT = MANAGER MENU',
      '',
      '>',
    ];
    ctx.font = `${FONT_PX}px "Courier New", monospace`;
    ctx.fillStyle = CRT_TEXT;
    // Body starts one blank row below the title bar; the footer bar (drawn
    // below) reserves its own strip so text never collides with it. The tube's
    // curve eats more of the canvas at the BOTTOM than the side padding does
    // (verified against counterterm shots): anything below ~80% of the canvas
    // vanishes behind the bezel, so the footer bar is pinned above that line
    // rather than mirrored off PAD_Y.
    const bodyTop = PAD_Y + LINE_H * 2;
    const footTop = Math.round(H * 0.73);
    const maxLines = Math.max(1, Math.floor((footTop - LINE_H * 0.4 - bodyTop) / LINE_H));
    const shown = Math.min(lines.length, maxLines);
    const cursorIdx = this.terminalCursorLine ?? shown - 1;
    lines.slice(0, maxLines).forEach((line, i) => {
      const y = bodyTop + i * LINE_H;
      const text = line.slice(0, 40);
      ctx.fillText(text, PAD_X, y);
      if (i === cursorIdx && this.terminalCursorOn) {
        const w = ctx.measureText(text).width;
        ctx.fillRect(PAD_X + w + CH * 0.4, y + FONT_PX * 0.1, CH * 0.7, FONT_PX * 0.9);
      }
    });

    // ── Footer bar: solid gold status strip (the sandwich, bottom) ──
    ctx.fillStyle = CRT_GOLD;
    ctx.fillRect(PAD_X - CH * 0.5, footTop, SAFE_W + CH, BAR_H);
    ctx.font = `bold ${FONT_PX}px "Courier New", monospace`;
    ctx.fillStyle = CRT_INK;
    const footY = footTop + (BAR_H - FONT_PX) / 2;
    // feedback/037 (owner: reword all "be kind rewind" to "please rewind") —
    // was 'BE KIND' paired with the left-aligned 'REMEMBER TO REWIND'.
    ctx.fillText('REMEMBER TO REWIND', PAD_X, footY);
    const rightText = 'PLEASE REWIND';
    ctx.fillText(rightText, PAD_X + SAFE_W - ctx.measureText(rightText).width, footY);

    // Scanlines at the canvas's native pitch, then the shared curved-tube mask
    // (crt-tube.ts: rounded corners falling off dark, edge vignette). Nothing
    // here paints a highlight: the room reflection is a separate additive
    // glass pane on the monitor's own dome (glass-reflection.ts), so it moves
    // the camera instead of being frozen into this bitmap. The mask is inset
    // to the part of the canvas actually visible inside the CRT bezel — the
    // outer ~10% sits behind the frame (see the safe-area note above) — so the
    // rounded tube corners land where the glass meets the bezel. One cached
    // drawImage; the cursor-blink redraw cost is unchanged.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 4);
    const mx = W * 0.08, my = H * 0.055;
    ctx.drawImage(getTubeMaskCanvas(), mx, my, W - mx * 2, H - my * 2);

    if (this.terminalTex) this.terminalTex.needsUpdate = true;
  }

  // Mirror arbitrary text onto the desk CRTs (the diegetic search terminal
  // feeds its query + results through here every keystroke). Pass null to
  // fall back to the idle screen. `cursorLine` pins the blinking cursor block
  // to a specific line (e.g. 0 for the query line); omitted = last line.
  setTerminalText(lines: string[] | null, cursorLine?: number) {
    this.terminalLines = lines;
    this.terminalCursorLine = cursorLine ?? null;
    this.drawTerminal();
  }

  // Camera dock pose for the diegetic search terminal: stand on the far side
  // of the station-0 screen (the direction its face-normal points, i.e. the
  // clerk side) close enough that the screen fills most of the view. Falls
  // back to the station's known layout position if the CRT model hasn't
  // finished loading yet, so search can be triggered immediately on a cold
  // start without waiting on the GLTF.
  getSearchCameraPose(): { camPos: THREE.Vector3; lookAt: THREE.Vector3 } {
    const DIST = 1.3;
    let screenPos: THREE.Vector3;
    let normal: THREE.Vector3;
    if (this.searchScreenMesh) {
      screenPos = new THREE.Vector3();
      this.searchScreenMesh.getWorldPosition(screenPos);
      const quat = new THREE.Quaternion();
      this.searchScreenMesh.getWorldQuaternion(quat);
      normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    } else {
      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.searchStationRotY);
      const localOffset = new THREE.Vector3(0, 0.85, 0.6).applyQuaternion(quat);
      screenPos = this.searchStationOrigin.clone().add(localOffset);
      normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    }
    const camPos = screenPos.clone().addScaledVector(normal, DIST);
    return { camPos, lookAt: screenPos };
  }

  // ===========================================================================
  // Glossy white plastic rental bag on the inner counter — a soft-body cloth
  // sim that deforms around its contents (src/checkout-bag.ts). The launch
  // flourish drops the chosen movie into its mouth (bagMouthWorld); pickUpBag()
  // pinches the die-cut handle and lifts, the plastic drooping around the
  // tapes, before setting it back down for the exit walk.
  // ===========================================================================

  // Trigger the "you picked up the bag" flourish once the launched case has
  // landed inside it. (`_now` kept for call-site compatibility — the bag runs
  // on its own fixed-step clock.)
  pickUpBag(_now: number) {
    this.bag?.pickUp();
  }

  // Freeze the settled bag so the launch flourish can lay it on its side and
  // carry it off the counter as a rigid piece (see CheckoutBag.freeze).
  freezeBag(): void {
    this.bag?.freeze();
  }

  // Drive the frozen bag's exit pose: lay it flat (logo up) and drag it off the
  // counter toward the door (see CheckoutBag.setExitPose). `worldYaw`, when
  // given, is an absolute upright yaw — the checkout hand-carry uses it so
  // the bag turns with the walker rounding the counter.
  setBagExitPose(layT: number, carry: THREE.Vector3, tumble = 0, worldYaw?: number): void {
    this.bag?.setExitPose(layT, carry, tumble, worldYaw);
  }

  // Make the (single) bag appear and start simulating — called at the start of
  // the checkout flourish. Resets the cloth to its rest pose so each trip looks
  // the same, then the solver runs (sleeping whenever settled) until hideBag().
  showBag(): void {
    this.bag?.show();
  }

  // Hide + freeze the bag once the exit walk completes; it costs nothing until
  // the next checkout.
  hideBag(): void {
    this.bag?.hide();
  }

  // True while the checkout bag is visible (e.g. a prior harness staging left
  // it up) — debugStageCheckoutExit uses it to reset the cloth deterministically
  // when re-staged from the same boot.
  isBagShown(): boolean {
    return this.bag?.isShown ?? false;
  }

  // Reuse the bag's glossy plastic envMap for the scene's current reflection
  // probe, mirroring updateGlobalMaterialsEnvMap() in video-case.ts so the
  // bag visibly picks up store lighting/reflections.
  setEnvMap(envMap: THREE.Texture | null) {
    this.bag?.setEnvMap(envMap);
  }

  // Drop an item (movie case today, candy per T19) into the bag: it falls from
  // the mouth to a leaning rest pose inside, and the plastic collides with and
  // wraps around it. Caller owns the mesh's geometry/material lifetime — this
  // fixture never disposes them, only detaches once evicted.
  dropIntoBag(mesh: THREE.Object3D) {
    this.bag?.drop(mesh);
  }

  // The bag's physical material (glossy white + printed brand + alphaTest
  // hole) for StoreScene's boot-time GL program warm-up — its shader variant
  // otherwise compiles mid-checkout on first draw.
  getBagWarmupMaterial(): THREE.Material | null {
    return this.bag?.material ?? null;
  }

  // ===========================================================================
  // Tape-return chute (see ./return-slot.ts) — bb-90s theme only. StoreScene
  // triggers the drop ritual on every store re-entry that returns tapes
  // (playback return through the doors, rental back-room release).
  // ===========================================================================

  hasReturnSlot(): boolean {
    return this.returnSlot !== null;
  }

  /** Slide `movies`' cases into the return slot starting at `startAt` (ms). */
  dropReturnedTapes(movies: Movie[], startAt: number): void {
    this.returnSlot?.drop(movies, startAt);
  }

  /** True while the return-drop ritual is animating (pins ACTIVE tier). */
  isReturnDropActive(): boolean {
    return this.returnSlot?.isActive() ?? false;
  }

  /** Harness (`--state return --x <ms>`): pin the ritual at a fixed elapsed. */
  debugFreezeReturnDrop(elapsedMs: number): void {
    this.returnSlot?.debugFreeze(elapsedMs);
  }

  /** The slot opening's world centre (camera framing), or null. */
  getReturnSlotMouth(): THREE.Vector3 | null {
    return this.returnSlot?.mouthWorld ?? null;
  }

  /**
   * World yaw of the slot face's outward normal, n = (sin yaw, 0, cos yaw) —
   * cameras framing the ritual stand along n and look back at the mouth.
   */
  getReturnSlotYaw(): number | null {
    return this.returnSlot?.faceYaw ?? null;
  }

  // Harness hooks (--state bag / baglift): settle the cloth synchronously so
  // screenshots are deterministic, and freeze the carry mid-hold to
  // photograph the droop.
  debugSettleBag(ms: number): void {
    this.bag?.debugFastForward(ms);
  }

  debugHoldBagLift(): void {
    this.bag?.debugHoldLift();
  }

  /**
   * Does update() still have visible work to do this frame? Everything it
   * animates rides along on frames the scene was compositing anyway (it never
   * calls requestRender), so the partial-composite path — which re-draws ONLY
   * the ambient TV screens and leaves the rest of the frame cached (see
   * src/partial-composite.ts) — has to fall back to a full composite whenever
   * the answer is yes, or a due cursor blink / mid-swing door would freeze.
   * Conservative by construction: each clause is the same condition update()
   * itself uses to decide it has work.
   */
  wantsFrame(timeMs: number): boolean {
    if (this.terminalTex && timeMs - this.terminalLastBlink > 530) {
      const camPos = this.ctx.camera.position;
      for (const st of this.terminalStations) {
        if (camPos.distanceToSquared(st) < 144) return true; // a repaint is due
      }
    }
    if (this.bag?.isShown) return true; // soft-body solver may still be stepping
    // Doors: their lerp is geometric and never exactly lands, so the threshold
    // is perceptual, not numerical. DOOR_SETTLED rad of swing left to go moves
    // a 3 ft leaf by ~0.003 ft over the whole remaining travel — orders of
    // magnitude under a pixel. (At 1e-4 a leaf that shut minutes ago still
    // reported "moving" and blocked the partial composite forever.)
    const DOOR_SETTLED = 1e-3;
    for (const d of this.doors) {
      // Same proximity test updateVestibuleDoors() steers the lerp with.
      const open = this.ctx.camera.position.distanceTo(d.center) < 7.0;
      if (d.kind === 'slide') {
        const tx = open ? d.openOffset.x : 0;
        const tz = open ? d.openOffset.z : 0;
        if (Math.abs(d.currentOffset.x - tx) > DOOR_SETTLED ||
            Math.abs(d.currentOffset.z - tz) > DOOR_SETTLED) return true;
      } else if (Math.abs(d.currentAngle - (open ? d.openAngle : 0)) > DOOR_SETTLED) {
        return true; // mid-swing
      }
    }
    return false;
  }

  // Per-frame: blink the desk terminal cursor (~530 ms), a cheap 1024x768
  // canvas redraw, drive the bag's pick-up lift/settle and reactive wobble
  // if either is running, and swing/slide the vestibule doors for the player.
  update(timeMs: number): void {
    if (this.terminalTex && timeMs - this.terminalLastBlink > 530) {
      this.terminalLastBlink = timeMs;
      // Gate the redraw on camera distance to the nearest station (< 12.0 ft)
      const camPos = this.ctx.camera.position;
      let nearStation = false;
      for (const st of this.terminalStations) {
        if (camPos.distanceToSquared(st) < 144) {
          nearStation = true;
          break;
        }
      }
      if (nearStation) {
        this.terminalCursorOn = !this.terminalCursorOn;
        this.drawTerminal();
      }
    }
    // Soft-body bag: steps only while shown AND awake (see checkout-bag.ts).
    this.bag?.update(timeMs);

    // Return-chute drop ritual: no-op unless a drop is live.
    this.returnSlot?.update(timeMs);

    // Animate the vestibule doors (swing or slide, per StorefrontSpec.doorStyle)
    // based on player proximity; ring the shop bell the moment one starts opening.
    if (updateVestibuleDoors(this.doors, this.ctx.camera.position)) this.onDoorsOpen?.();
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    this.terminalTex?.dispose();
    this.terminalTex = null;
    this.terminalCanvas = null;
    this.searchScreenMesh = null;
    this.bagMouthWorld = null;
    this.bag?.dispose(); // dropped items' geometry/materials are caller-owned — only refs drop
    this.bag = null;
    this.returnSlot?.dispose();
    this.returnSlot = null;
    this.doors = [];
  }
}
