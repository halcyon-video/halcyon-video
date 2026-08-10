// Tape-return chute: the classic "RETURN TAPES HERE" drop slot —
// a blue bumped-out section grown off the checkout counter's band, INSIDE the
// store. It sits on the band's right-shoulder face, immediately on your left
// as you step out of the vestibule's store-side door: the first thing a
// customer walking in passes, exactly like the real stores' walk-in return
// bins. Yellow lettering across the top ("↓ RETURN TAPES HERE ↓" — redrawn
// 2026-07-30 off the 1993 macro f0068, see the measured block below) and a
// horizontal slot a little longer than a VHS case in the middle.
//
// Tape eras only: EntranceCheckout gates construction on the active theme's
// defaultMedium, so the DVD-era store
// never build it. Colors come straight from the theme palette (counterTop
// blue body + secondary gold lettering), matching the counter it grows from.
//
// Geometry is built in the group's LOCAL frame — chute centred on x=0, slot
// face toward local +Z, back tucked into the band at local z≈0 — and the
// group is then positioned/yawed onto whichever band face the caller anchors
// it to (EntranceCheckout picks the face per counter shape). The drop-case
// meshes are children of the same group, so the ritual's choreography stays
// in local space and rides the transform for free.
//
// The chute also owns the drop-tapes-on-re-entry ritual: drop() takes the
// titles the player is returning (last night's rentals / the just-watched
// tape) and slides each case into the slot over ~1.5s, staggered — a short
// diegetic beat, fully non-blocking, with a plastic clatter-thunk as each
// case is swallowed. Event-time work allocates freely; update() is
// allocation-free (scratch objects only).
import * as THREE from 'three';
import type { Movie } from '../jellyfin';
import { FixtureContext } from '../fixtures';
import { getActiveTheme } from '../themes';
import { createShelfTextures } from '../canvas-textures';
import { Footprint } from '../layout-validator';
import { retailAudio } from '../audio';
import {
  CASE_MEDIUM,
  getRentalCaseGeometry,
  createHeroRentalMaterials,
} from '../video-case';

// Chute body (feet, LOCAL axes — slot face toward +Z, width along X).
const CHUTE_W = 2.4;
const CHUTE_H = 3.85;   // just proud of the band top (3.4 + 0.14 cap)
const CHUTE_D = 0.9;    // protrusion past the band face into the store
// How far the body runs BACK from the band face. Mirrors counter.ts's bandD
// (the same layout-agnostic mirroring entrance/index.ts does for BAND_H), so
// the chute's rear wall lands flush with the inside face of the blue band
// rather than stopping dead at its outer face — it is a bumped-out SECTION of
// the counter, not a box parked against it, and at 0.04 ft deep the crown
// used to leave the counter top running on behind it with a visible step
// (owner, 2026-08-09).
const CHUTE_BACK = 1.5;
const FRONT_T = 0.14;   // face/side wall thickness
const SLOT_W = 1.0;     // "a little bigger than a VHS length" (case is ~0.73 ft)
const SLOT_H = 0.3;
const SLOT_Y = 2.55;    // slot centre height — a natural drop-in height
const SLOT_X = -0.5;    // flap sits lower-LEFT on the shell (frames2/scene_011)
const TOP_R = 0.38;     // ~4.6in bullnose per the footage's fat top roll

// ── Sign plate, MEASURED off the 1993 return-station macro ──────────────────
// reference/video-store-stills-2026-07-30/rUhRHo44CIA/f0068.jpg (the
// corpus' Grade-A+ frame, CATALOG S10), perspective-rectified with
// tools/sign-lab to a 2580 x 302 px plate. Fractions below are of that plate;
// anything in CAP units is a multiple of the 144 px cap height. Letterform
// cross-check at the well-lit right end ("HERE", nearest the lens): H ink
// 0.79 cap, E 0.72 cap, stems 0.167 cap, letter gaps 0.20 cap — a
// normal-width BOLD grotesque at its own natural tracking (Helvetica/Arial
// Bold class), NOT the ultra-condensed face the 1993 wall bands use.
// Plate w:h. Zhang-He on the rectified quad says 8.58 (f-sweep 7.9-10.2, no
// EXIF); the cap-unit row below sums to 18.3 cap over a 2.10-cap-tall plate,
// i.e. 8.74 — two independent routes, so 8.7 it is.
const PLATE_AR = 8.7;
const CAP_CENTRE = 0.47;   // cap band centre, fraction of plate height
const SCREW_INSET = 0.10;  // finish-washer screws, in from every edge
// Row, left to right, in CAP units. Margins re-read 2026-08-02 off the SAME
// rectified plate (ink runs, in px of the 2580 x 300 rectification, cap =
// 157 px): leading arrow ink 58..172, "R" starts 218, "HERE" ends 2290,
// trailing arrow ink 2378..2516 — i.e. 0.37 cap of air before the leading
// arrow and 0.29 after it. The previous 0.20/0.20 pinched the left end so
// hard the arrow printed over the plate's own edge and its top-left mounting
// screw, and all but collided with the R.
const LEAD_IN = 0.37, GAP_ARROW_TEXT = 0.29, WORD_GAP = 0.90;
const GAP_TEXT_ARROW = 0.65, LEAD_OUT = 0.43;
// THE ARROWS ARE THE SAME OBJECT — corrected 2026-08-02 (owner, feedback/017
// "the arrows not matching. please fix"). A previous pass recorded the
// leading one as a slender DART (headW 0.38 / stemW 0.24 cap, i.e. 2.5x
// narrower than the trailing block) off letter-stem ratios taken at the raw
// frame's warped left end. Going back to the rectified plate settles it: the
// leading arrow measures 114 px head / 60 px stem and the trailing 138 / 68 —
// the same fat stem-and-triangle, ~15% apart, which is exactly the residual a
// homography leaves on a BOWED plate (it cannot rectify both ends at once).
// Nothing in the reference supports two different arrows, so both ends print
// the one measured profile.
// [headW, headH, stemW] in CAP units; [top, len] as plate-height fractions.
const ARROW = { headW: 0.95, headH: 0.83, stemW: 0.53, top: 0.01, len: 0.89 };
const ARROW_LEAD = ARROW;
const ARROW_TRAIL = ARROW;

// Drop ritual timing.
const DROP_DUR = 1500;     // one case: toss/tip (~58%) then slide into the dark
const DROP_STAGGER = 800;  // between cases
const DROP_PHASE = 0.58;   // fraction of DROP_DUR spent tipping to the mouth

interface Drop {
  mesh: THREE.Mesh;
  mats: THREE.Material[]; // clones — owned and disposed here
  offset: number;         // ms after dropStart this case begins
  from: THREE.Vector3;    // LOCAL-frame positions (meshes are group children)
  mid: THREE.Vector3;     // at the slot mouth, aligned flat
  to: THREE.Vector3;      // inside the chute (fully swallowed)
  fromQ: THREE.Quaternion;
  toQ: THREE.Quaternion;
  swallowed: boolean;     // sound fired for this case (crossing DROP_PHASE)
}

export class ReturnSlot {
  /** World position of the slot opening's centre (drop target). */
  public readonly mouthWorld: THREE.Vector3;
  /** World yaw of the slot's outward face normal: n = (sin yaw, 0, cos yaw). */
  public readonly faceYaw: number;

  private group = new THREE.Group();
  private drops: Drop[] = [];
  private dropStart = 0;
  // Harness (`--state return --x <ms>`): pin the ritual at a fixed elapsed.
  private frozenElapsed: number | null = null;

  private ownedGeoms: THREE.BufferGeometry[] = [];
  private ownedMats: THREE.Material[] = [];
  private ownedTex: THREE.Texture[] = [];
  private letterTex: THREE.CanvasTexture | null = null;

  // Local mouth position — the drop choreography anchors off this.
  private readonly mouthLocal = new THREE.Vector3(SLOT_X, SLOT_Y, CHUTE_D);

  // Scratch — update() allocates nothing.
  private readonly _p = new THREE.Vector3();

  constructor(private ctx: FixtureContext, parent: THREE.Group, anchor: { x: number; z: number }, faceYaw: number) {
    parent.add(this.group);
    this.group.position.set(anchor.x, 0, anchor.z);
    this.group.rotation.y = faceYaw;
    this.faceYaw = faceYaw;
    // parent (the entrance group) sits at the scene origin untransformed, so
    // local->world is just the group's own yaw + translation.
    this.mouthWorld = new THREE.Vector3(
      anchor.x + Math.cos(faceYaw) * this.mouthLocal.x + Math.sin(faceYaw) * this.mouthLocal.z,
      this.mouthLocal.y,
      anchor.z - Math.sin(faceYaw) * this.mouthLocal.x + Math.cos(faceYaw) * this.mouthLocal.z,
    );

    const theme = getActiveTheme();
    const blueHex = theme.palette.counterTop;
    const goldHex = theme.palette.secondary;

    // Same laminate mottle the counter band wears, so the chute reads as a
    // built-out piece of the counter rather than a bolted-on prop.
    const { map: lamTex, normalMap: lamNorm } = createShelfTextures();
    lamTex.repeat.set(2, 2);
    lamNorm.repeat.set(2, 2);
    this.ownedTex.push(lamTex, lamNorm);
    const blueMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(blueHex), map: lamTex,
      normalMap: lamNorm, normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.3, metalness: 0.03,
    });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.45, metalness: 0.0 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.95, metalness: 0.0 });
    this.ownedMats.push(blueMat, whiteMat, darkMat);

    // Rear a hair in FRONT of the band's inner face: flush to the eye, but
    // never coplanar with the band mesh (which would z-fight over the strip of
    // chute that stands proud of the counter top).
    const zRear = -(CHUTE_BACK - 0.01);
    const zFace = CHUTE_D;

    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, collide = true) => {
      const g = new THREE.BoxGeometry(w, h, d);
      this.ownedGeoms.push(g);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      if (collide) this.ctx.addCollider(m);
      return m;
    };

    const slotBot = SLOT_Y - SLOT_H / 2;
    const slotTop = SLOT_Y + SLOT_H / 2;
    const faceZ = zFace - FRONT_T / 2;
    const midZ = (zRear + zFace) / 2;
    const depth = zFace - zRear;

    // Front face: solid panels above and below the slot + narrow strips beside
    // it — a real rectangular opening, not a painted-on one. The top panel
    // stops short of the crown so the bullnose can take over the front edge.
    box(CHUTE_W, CHUTE_H - TOP_R - slotTop, FRONT_T, 0, (slotTop + CHUTE_H - TOP_R) / 2, faceZ, blueMat);
    box(CHUTE_W, slotBot, FRONT_T, 0, slotBot / 2, faceZ, blueMat);
    // Slot sits lower-left (SLOT_X), so the flanking panels are asymmetric.
    const leftW = CHUTE_W / 2 + SLOT_X - SLOT_W / 2;
    const rightW = CHUTE_W / 2 - SLOT_X - SLOT_W / 2;
    if (leftW > 0.01) box(leftW, SLOT_H, FRONT_T, -CHUTE_W / 2 + leftW / 2, SLOT_Y, faceZ, blueMat);
    if (rightW > 0.01) box(rightW, SLOT_H, FRONT_T, CHUTE_W / 2 - rightW / 2, SLOT_Y, faceZ, blueMat);
    // Brushed-metal slot frame (the footage flap unit reads stainless, not
    // white trim) + the flap plate itself resting tilted into the throat.
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.35, metalness: 0.85 });
    this.ownedMats.push(metalMat);
    const LINER = 0.03;
    box(SLOT_W, LINER, FRONT_T, SLOT_X, slotTop - LINER / 2, faceZ, metalMat, false);
    box(SLOT_W, LINER, FRONT_T, SLOT_X, slotBot + LINER / 2, faceZ, metalMat, false);
    box(LINER, SLOT_H, FRONT_T, SLOT_X - (SLOT_W - LINER) / 2, SLOT_Y, faceZ, metalMat, false);
    box(LINER, SLOT_H, FRONT_T, SLOT_X + (SLOT_W - LINER) / 2, SLOT_Y, faceZ, metalMat, false);
    const flap = box(SLOT_W - 0.06, SLOT_H - 0.04, 0.015, SLOT_X, SLOT_Y - 0.01, faceZ - 0.06, metalMat, false);
    flap.rotation.x = -0.24; // hinged at the top, resting swung slightly inward
    // Side walls stop where the crown band starts; the crown closes the top.
    box(FRONT_T, CHUTE_H - TOP_R, depth, -(CHUTE_W - FRONT_T) / 2, (CHUTE_H - TOP_R) / 2, midZ, blueMat);
    box(FRONT_T, CHUTE_H - TOP_R, depth, (CHUTE_W - FRONT_T) / 2, (CHUTE_H - TOP_R) / 2, midZ, blueMat);
    // Crown: flat top behind the bullnose...
    box(CHUTE_W, TOP_R, depth - TOP_R, 0, CHUTE_H - TOP_R / 2, (zRear + zFace - TOP_R) / 2, blueMat);
    // ...and a quarter-round nose along the top-front edge — the curve faces
    // the store (out and up); the sides and the band-side edge stay square.
    const noseG = new THREE.CylinderGeometry(TOP_R, TOP_R, CHUTE_W, 24, 1, false, 0, Math.PI / 2);
    noseG.rotateZ(Math.PI / 2); // axis along X; arc sweeps +Z (out) to +Y (up)
    this.ownedGeoms.push(noseG);
    const nose = new THREE.Mesh(noseG, blueMat);
    nose.position.set(0, CHUTE_H - TOP_R, zFace - TOP_R);
    nose.castShadow = true;
    nose.receiveShadow = true;
    this.group.add(nose);
    // Dark cavity behind the slot — the case visibly disappears into it.
    box(CHUTE_W - 0.2, CHUTE_H - 0.15, depth - FRONT_T - 0.1, 0, (CHUTE_H - 0.15) / 2, midZ - (FRONT_T + 0.1) / 2, darkMat, false);

    // "▼ RETURN TAPES HERE ▼" across the top panel, theme gold on body blue.
    this.buildLettering(zFace, slotTop, blueHex, goldHex);
  }

  /**
   * Ground-plan rect of the chute's protruding body, for the clerk nav grid:
   * unlike the old vestibule-side placement (which sat wholly inside rects
   * the grid already carried), the in-store chute pokes into walkable floor.
   * Footprint yaw convention: local +X world dir = (cos yaw, -sin yaw) —
   * exactly the group's own yaw here.
   */
  getFootprint(): Footprint {
    const cd = CHUTE_D / 2;
    return {
      label: 'structure:return-slot', kind: 'structure',
      cx: this.group.position.x + Math.sin(this.faceYaw) * cd,
      cz: this.group.position.z + Math.cos(this.faceYaw) * cd,
      w: CHUTE_W, d: CHUTE_D + 0.1,
      yaw: this.faceYaw,
    };
  }

  // The 1993 return-station plaque (f0068 — see the measured block up top): a
  // CLEAR ACRYLIC strip screwed over the blue fascia, YELLOW plain-bold caps,
  // upright, no outline, no shadow; a SMALL down-arrow before RETURN and a
  // LARGE one after HERE. The plate is a long 8.7:1 strip, not the squat 5.6:1
  // the previous pass drew from a lower-grade frame.
  private buildLettering(zFace: number, slotTop: number, _blueHex: string, goldHex: string): void {
    const stripW = CHUTE_W - 0.16;
    const stripH = stripW / PLATE_AR;
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = Math.round(2048 / PLATE_AR); // 238 — matches the plate aspect
    const c = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = goldHex;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    const words = ['RETURN', 'TAPES', 'HERE'];
    const face = (px: number) => `700 ${px}px Helvetica, Arial, sans-serif`;
    // Ink-justify: probe the face's REAL metrics (asset-fidelity rule — never
    // assume a cap/em ratio), then solve the cap height that makes
    // margins + arrows + gaps + copy span the plate exactly. On Arial Bold
    // that lands cap at ~0.477 of the plate — the height measured off f0068.
    const PROBE = 200;
    c.font = face(PROBE);
    const probes = words.map((w) => c.measureText(w));
    const probeCap = Math.max(1, probes[0].actualBoundingBoxAscent);
    const inkOf = (m: TextMetrics) => m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const inkPerCap = probes.reduce((s, m) => s + inkOf(m), 0) / probeCap;
    const fixed = LEAD_IN + ARROW_LEAD.headW + GAP_ARROW_TEXT + 2 * WORD_GAP
      + GAP_TEXT_ARROW + ARROW_TRAIL.headW + LEAD_OUT;
    const cap = W / (fixed + inkPerCap);
    c.font = face(PROBE * cap / probeCap);
    // Solid down-arrow: stem hanging from the plate's top edge + a triangular
    // head. Head/stem widths scale with the type, length with the plate.
    const arrow = (ax: number, a: typeof ARROW_LEAD) => {
      const top = H * a.top, len = H * a.len;
      const headH = cap * a.headH, headW = cap * a.headW, stemW = cap * a.stemW;
      c.fillRect(ax - stemW / 2, top, stemW, len - headH);
      c.beginPath();
      c.moveTo(ax - headW / 2, top + len - headH);
      c.lineTo(ax + headW / 2, top + len - headH);
      c.lineTo(ax, top + len);
      c.closePath();
      c.fill();
    };
    const baseline = H * CAP_CENTRE + cap / 2;
    let x = LEAD_IN * cap;
    arrow(x + cap * ARROW_LEAD.headW / 2, ARROW_LEAD);
    x += cap * (ARROW_LEAD.headW + GAP_ARROW_TEXT);
    words.forEach((w, i) => {
      const m = c.measureText(w);
      c.fillText(w, x + m.actualBoundingBoxLeft, baseline);
      x += inkOf(m) + (i < words.length - 1 ? WORD_GAP * cap : 0);
    });
    x += GAP_TEXT_ARROW * cap;
    arrow(x + cap * ARROW_TRAIL.headW / 2, ARROW_TRAIL);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.letterTex = tex;
    const stripY = (slotTop + CHUTE_H - TOP_R) / 2;

    // Clear plate first (acrylic sheen), lettering floated just proud of it,
    // standoff screws at the corners.
    //
    // The plate is CLEAR acrylic and must not tint the royal blue behind it.
    // The old translucent near-white sheet (opacity 0.16 over #dfe8ee) dropped
    // the body's saturation from ~85% to ~9-20%, so the sign read as a flat
    // pale "sky blue" card instead of glass. It now contributes NO diffuse at
    // all: a near-black base under AdditiveBlending leaves only the dielectric
    // specular term (F0 ~4%, Fresnel-boosted toward grazing), so the blue comes
    // through undimmed and the plate is pure reflection. Low roughness + a
    // raised envMapIntensity make the room's IBL a real, camera-tracking
    // highlight sliding across the sheet. depthWrite stays OFF on every
    // additive layer so they can't punch a hole in the depth buffer.
    // (NOT MeshPhysicalMaterial transmission — that forces a per-frame
    // scene-transmission render target, and frame time is the prime directive.)
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x04060a, roughness: 0.07, metalness: 0.0,
      envMapIntensity: 1.1,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glossTex = this.buildGlossTexture();
    // Fixed painted sheen on top: a whisper of ceiling-bank light off the top
    // edge and a thin bright line where the sheet is sawn. Additive, so it can
    // only ADD light — no amount of it can wash the blue back out.
    const glossMat = new THREE.MeshBasicMaterial({
      map: glossTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.85,
    });
    const screwMat = new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.3, metalness: 0.9 });
    const textMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, metalness: 0.03 });
    this.ownedMats.push(plateMat, glossMat, screwMat, textMat);
    const plateG = new THREE.PlaneGeometry(stripW, stripH);
    const textG = new THREE.PlaneGeometry(stripW, stripH);
    const glossG = new THREE.PlaneGeometry(stripW, stripH);
    const screwG = new THREE.CylinderGeometry(0.0095, 0.0095, 0.022, 10);
    screwG.rotateX(Math.PI / 2);
    this.ownedGeoms.push(plateG, textG, glossG, screwG);
    const plate = new THREE.Mesh(plateG, plateMat);
    plate.position.set(0, stripY, zFace + 0.012);
    plate.castShadow = false;
    plate.receiveShadow = false;
    plate.renderOrder = 1;
    this.group.add(plate);
    const plane = new THREE.Mesh(textG, textMat);
    plane.position.set(0, stripY, zFace + 0.016);
    plane.castShadow = false;
    plane.receiveShadow = true;
    plane.renderOrder = 2;
    this.group.add(plane);
    const gloss = new THREE.Mesh(glossG, glossMat);
    gloss.position.set(0, stripY, zFace + 0.02);
    gloss.castShadow = false;
    gloss.receiveShadow = false;
    gloss.renderOrder = 3;
    this.group.add(gloss);
    // Four finish-washer screws, inset the measured 0.10 of the plate height
    // from every edge (f0068 shows both right-hand ones plainly).
    const inset = stripH * SCREW_INSET;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const screw = new THREE.Mesh(screwG, screwMat);
        screw.position.set(sx * (stripW / 2 - inset), stripY + sy * (stripH / 2 - inset), zFace + 0.008);
        this.group.add(screw);
      }
    }
  }

  /**
   * The acrylic's painted highlight (additive layer above). f0068 says the
   * sheet is nearly invisible: a bright hairline where it is sawn, a hint of
   * ceiling bank off the top edge, and NOTHING over the copy — the broad
   * gradient + diagonal glint this used to carry greyed "RETURN" out, which is
   * precisely what the photograph does not do. Alpha only ever reads as ADDED
   * light, so the deep blue underneath stays at full saturation while the
   * plate still reads glossy in a still frame (the env reflection alone only
   * shows once the camera moves).
   */
  private buildGlossTexture(): THREE.CanvasTexture {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = Math.round(1024 / PLATE_AR);
    const g = cv.getContext('2d')!;
    const H = cv.height;
    g.clearRect(0, 0, cv.width, H);
    const sheen = g.createLinearGradient(0, 0, 0, H);
    sheen.addColorStop(0, 'rgba(226,240,255,0.07)');
    sheen.addColorStop(0.3, 'rgba(214,232,255,0.01)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, cv.width, H);
    g.strokeStyle = 'rgba(226,242,255,0.55)';
    g.lineWidth = 2.5;
    g.strokeRect(1.5, 1.5, cv.width - 3, H - 3);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.ownedTex.push(tex);
    return tex;
  }

  /**
   * Start the return ritual: each case tips into the slot and slides away
   * inside, staggered. `startAt` may sit slightly in the future (re-entry
   * fade-in). Case meshes reuse the shared rental-clamshell geometry with
   * per-title rental label materials (clones — owned/disposed here),
   * exactly like the carried-tapes stack. All choreography is in the group's
   * LOCAL frame (+Z out of the slot face, toward the customer).
   */
  drop(movies: Movie[], startAt: number): void {
    this.clearDrops();
    this.frozenElapsed = null;
    this.dropStart = startAt;
    movies.slice(0, 4).forEach((movie, i) => {
      const isAnimated = CASE_MEDIUM === 'vhs' && movie.libraryName === 'Animated Movies';
      const mats = createHeroRentalMaterials(movie).map((m) => m.clone());
      const mesh = new THREE.Mesh(getRentalCaseGeometry(isAnimated), mats);
      mesh.castShadow = false; // brief flourish — never dirties the baked shadow map
      mesh.receiveShadow = false;
      mesh.visible = false;
      mesh.userData.excludeFromSSAO = true;
      this.group.add(mesh);
      const jx = (i % 2 === 0 ? -1 : 1) * 0.06 * Math.ceil((i + 1) / 2);
      const m = this.mouthLocal;
      this.drops.push({
        mesh,
        mats,
        offset: i * DROP_STAGGER,
        // Held up in front of the slot (below the lettering line, so the sign
        // stays readable through the ritual), cover toward the customer...
        from: new THREE.Vector3(m.x + jx * 3, m.y + 0.95, m.z + 1.6),
        // ...tipped flat at the mouth...
        mid: new THREE.Vector3(m.x + jx, m.y + 0.03, m.z + 0.6),
        // ...and swallowed (fully behind the front face when it hides).
        to: new THREE.Vector3(m.x + jx, m.y - 0.02, m.z - 0.8),
        fromQ: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(-0.35, (i % 2 === 0 ? -1 : 1) * 0.14, 0.12, 'YXZ')),
        // Flat, cover up, top edge leading into the slot.
        toQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
        swallowed: false,
      });
    });
  }

  /** Harness: hold the ritual at a fixed elapsed ms (screenshot pinning). */
  debugFreeze(elapsedMs: number): void {
    this.frozenElapsed = elapsedMs;
  }

  /** True while the drop ritual runs (pins the ACTIVE render tier). */
  isActive(): boolean {
    return this.drops.length > 0 && this.frozenElapsed === null;
  }

  /** Per-frame (only does work while a ritual is live). Zero allocations. */
  update(now: number): void {
    if (this.drops.length === 0) return;
    const elapsed = this.frozenElapsed ?? (now - this.dropStart);
    let pending = 0;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      const t = (elapsed - d.offset) / DROP_DUR;
      if (t < 0) { d.mesh.visible = false; pending++; continue; }
      if (t >= 1) { d.mesh.visible = false; continue; }
      pending++;
      d.mesh.visible = true;
      if (t < DROP_PHASE) {
        const k = t / DROP_PHASE;
        const e = k * k * (3 - 2 * k); // smoothstep
        this._p.lerpVectors(d.from, d.mid, e);
        this._p.y += Math.sin(k * Math.PI) * 0.3; // small toss arc
        d.mesh.position.copy(this._p);
        d.mesh.quaternion.slerpQuaternions(d.fromQ, d.toQ, e);
      } else {
        // Crossing into the slide: the case enters the slot — clatter-thunk.
        // (Never during a harness freeze; that's a posed screenshot, not time.)
        if (!d.swallowed) {
          d.swallowed = true;
          if (this.frozenElapsed === null) retailAudio.playTapeReturn();
        }
        const k = (t - DROP_PHASE) / (1 - DROP_PHASE);
        d.mesh.position.lerpVectors(d.mid, d.to, k * k); // accelerating slide in
        d.mesh.quaternion.copy(d.toQ);
      }
    }
    if (pending === 0 && this.frozenElapsed === null) this.clearDrops();
  }

  private clearDrops(): void {
    for (const d of this.drops) {
      d.mesh.parent?.remove(d.mesh);
      for (const m of d.mats) m.dispose(); // clones only; textures stay cached
    }
    this.drops.length = 0;
  }

  dispose(): void {
    this.clearDrops();
    this.group.parent?.remove(this.group);
    for (const g of this.ownedGeoms) g.dispose();
    this.ownedGeoms.length = 0;
    for (const m of this.ownedMats) m.dispose();
    this.ownedMats.length = 0;
    for (const t of this.ownedTex) t.dispose();
    this.ownedTex.length = 0;
    this.letterTex?.dispose();
    this.letterTex = null;
  }
}
