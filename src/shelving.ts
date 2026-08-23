// Freestanding aisle shelving (the double-sided gondola islands): white
// shelves with pricing strips, trapezoid section dividers, centre backing
// wall, per-section category signboards, and the blue/white end caps at the
// two true ends of each run. Placement and orientation come entirely from the
// StorePlan's units; this module only builds the structure geometry for them.
// Swap this builder out for a completely different shelving-unit style — the
// movie boxes bake their resting transforms from the plan, not from these
// meshes, so any structure that respects the plan's dimensions works.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { JellyfinLibrary } from './jellyfin';
import {
  FIELD_Z_FRONT, AISLE_SHELF_HEIGHTS, BOX_SPACING, SECTION_COLS,
  UNIT_SECTIONS,
  UNIT_DEPTH, UNIT_SIDE_CAPACITY, UNIT_FRAME_HEIGHT, unitDepthAtHeight,
} from './store-layout';
import { StorePlan } from './store-plan';
import { createFlushTopperLabelTexture, createArchedTopperLabelTexture, BB2000_PLAQUE_RED } from './canvas-textures';
import {
  createTicketBoardLabelMaterial, TICKET_BOARD_W, TICKET_BOARD_H, TICKET_BOARD_T,
} from './fixtures/ticket-board-sign';
import { createTrapezoidGeometry, splitTrapezoidGroups, createLibraryEndCapMaterial, markSignMesh } from './sign-builders';
import { createFasciaBladeFactory, FASCIA_BLADE_H } from './fixtures/genre-fascia';
import { bb93SignageOn } from './genre-colors';
import { getActiveTheme } from './themes';
import { CASE_WIDTH, CASE_HEIGHT } from './video-case';
import type { ClaspPlacement } from './fixtures/shelf-clasp';

// Cached replacement for the theme-supplied wire-mesh grid texture, used only
// for the 2000s ('wire-black') shelving frame — see issue #49b. The stock
// texture (created in canvas-textures.ts, owned elsewhere) draws a flat
// 10px '#121212' border per 128x128 tile; the old local override widened it
// to a flat pure-black 32px band, which read as cheap printed grid rather
// than metal. This version draws a DUAL-GAUGE GUNMETAL grid instead: a
// heavier support wire around the tile (2 in pitch at the ×6/ft repeat) plus
// finer cross wires halving the cell to a 1 in mesh, each stroked as a dark
// body with a lighter core line so the wires read as round metal catching
// light rather than flat ink. Built once and cloned per shelf (each shelf
// needs its own `repeat` for its own depth/length), same pattern as before.
let cachedThickWireGridTexture: THREE.Texture | null = null;
function getThickWireGridTexture(): THREE.Texture {
  if (!cachedThickWireGridTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 128);
    // Heavy support wire: gunmetal body + specular core ridge.
    ctx.strokeStyle = '#2b2f35';
    ctx.lineWidth = 18;
    ctx.strokeRect(0, 0, 128, 128);
    ctx.strokeStyle = '#6a717c';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, 128, 128);
    // Fine cross wires (1 in mesh pitch), thinner gauge, same two-tone.
    const cross = (width: number, style: string) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(64, 0); ctx.lineTo(64, 128);
      ctx.moveTo(0, 64); ctx.lineTo(128, 64);
      ctx.stroke();
    };
    cross(9, '#24282d');
    cross(3, '#5b626c');
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8; // shelves are seen at grazing angles; keep the grid crisp
    cachedThickWireGridTexture = tex;
  }
  return cachedThickWireGridTexture;
}

// Local slatwall for the 2000s gondola SPINE, replacing the shared
// sign-builders panel material there: same warm-tan family as the end caps'
// slatwall (so runs still read as one fixture) but with deeper groove
// contrast — a soft shadow falling into the slot, a darker slot, and a lit
// lip under it — plus a faint vertical grain so the big flat panel doesn't
// read as one untextured card. Painted once, cached; cheap albedo only.
let cachedSpineSlatwallMat: THREE.MeshStandardMaterial | null = null;
function getSpineSlatwallMaterial(panelHeightFt: number): THREE.MeshStandardMaterial {
  if (!cachedSpineSlatwallMat) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e7d8b4'; // warm tan base (end caps use #eadcbc — same family)
    ctx.fillRect(0, 0, 64, 64);
    // Faint vertical grain streaks.
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(120, 100, 66, ${0.03 + Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 64, 0, 1 + Math.random() * 2, 64);
    }
    // Groove: shadow ramp into the slot, dark slot, lit lip below it.
    const grad = ctx.createLinearGradient(0, 42, 0, 54);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 42, 64, 12);
    ctx.fillStyle = '#7d6a49';
    ctx.fillRect(0, 54, 64, 7);
    ctx.fillStyle = '#f6ecd3';
    ctx.fillRect(0, 61, 64, 3);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // One V tile per 4-inch slat course (same spacing as the end caps'
    // slatwall); a handful of U tiles across the run for the grain.
    tex.repeat.set(6, panelHeightFt / (4 / 12));
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    // Same reasoning as getThickWireGridTexture() above: this backing wall is
    // read from down the length of the aisle, a grazing angle the isotropic
    // default blurs (the end caps' matching slatwall, sign-builders.ts, gets
    // the same fix for the same reason).
    tex.anisotropy = 8;
    cachedSpineSlatwallMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.8,
      metalness: 0.0,
    });
  }
  return cachedSpineSlatwallMat;
}

export interface GondolaMaterials {
  shelf: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  strip: THREE.MeshStandardMaterial;
  signSide: THREE.MeshStandardMaterial;
  wireShelf?: THREE.Material;
}

export interface AisleShelvingDeps {
  scene: THREE.Scene;
  plan: StorePlan;
  libraries: JellyfinLibrary[];
  materials: GondolaMaterials;
  // Register a mesh for the walk-mode collision/raycast set.
  addCollider: (obj: THREE.Object3D) => void;
  // End caps are also click targets for library select — the scene tracks them.
  registerEndCap: (mesh: THREE.Mesh) => void;
  // Acrylic recommendation clasps on the eye-level shelf lip (see
  // fixtures/shelf-clasp.ts). Optional so a caller that doesn't want them
  // simply omits it.
  registerClasp?: (placement: ClaspPlacement) => void;
  // Runs (by lineId) whose front end hosts a genre endcap fixture: the
  // fixture's back panel mounts on the same plane the run's own blue front
  // cap occupies, so the cap is skipped there — two coplanar panels z-fight.
  suppressFrontCapLineIds?: Set<number>;
}

/**
 * Which shelf lip carries the clasps: the band just ABOVE the top row — at the
 * walk-mode eye height (5.5ft) the one you read without moving your head, and
 * the one the browse cursor reaches by pressing Up off the top shelf.
 *
 * This was written against the OLD 4-row heights ([1.0, 2.1, 3.2, 4.3], where
 * 4.3 was the top row itself); the measured pitch (2e4eadf) moved the top row
 * to AISLE_SHELF_HEIGHTS's last entry and left this literal floating. The
 * clearance below keeps the current position exactly where it is today while
 * making sure a future pitch change can never sink the clasp BELOW the top row
 * and bury it in that row's stock.
 */
const CLASP_SHELF_Y = Math.max(4.3, AISLE_SHELF_HEIGHTS[AISLE_SHELF_HEIGHTS.length - 1] + 0.45);

// Populate shelves dynamically for each library's freestanding shelving units.
// Each island is parented to its own pivot group, positioned at the island's
// centre and rotated by its arrangement yaw, with an inner group translated
// back so children added at their natural (un-rotated) world coordinates spin
// in place about that centre. Movie boxes and the camera spin about the same
// centre via the plan's unitToWorld(), so boxes and camera always track the
// structure. The room shell and New Releases wall stay square.
export function buildAisleShelving(deps: AisleShelvingDeps): void {
  const { scene, plan, libraries, materials } = deps;

  const makeAisleGroup = (angle: number, px: number, pz: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(px, 0, pz);
    pivot.rotation.y = angle;
    const inner = new THREE.Group();
    inner.position.set(-px, 0, -pz);
    pivot.add(inner);
    scene.add(pivot);
    return inner;
  };

  const theme = getActiveTheme();
  // Which genre topper this era wears (data field — see TopperStyle in
  // themes.ts — not id checks). 'flush' (2010 / Night Owl) and 'arched-plaque'
  // (2000) are both rounded-top plaques mounted on the shelf top and share the
  // extrude/label machinery below, differing only in height, corner radius,
  // body color and label face. 'ticket-board' (1990) and 'fascia-blade' (1993,
  // or the legacy bb_93_signage overlay) take their own paths further down.
  const plaqueTopper = theme.topperStyle === 'flush' || theme.topperStyle === 'arched-plaque';
  const archedTopper = theme.topperStyle === 'arched-plaque';
  const fasciaFactory = createFasciaBladeFactory();

  // Signboard label materials, shared across every section that carries the
  // same category (or library) name.
  const sectionLabelMats = new Map<string, THREE.MeshPhysicalMaterial>();
  const getSectionLabelMat = (label: string): THREE.MeshPhysicalMaterial => {
    let mat = sectionLabelMats.get(label);
    if (!mat) {
      // The 1990 ticket standard — the same card the New Releases wall
      // toppers wear, cut and finished in fixtures/ticket-board-sign.ts. The
      // brand torn-ticket emblem it replaced still serves the library
      // ENTRANCE labels via createLibraryLabelTexture.
      mat = createTicketBoardLabelMaterial(label);
      sectionLabelMats.set(label, mat);
    }
    return mat;
  };

  // Flush-topper shared resources (modern themes only). Label materials are
  // shared per label text; geometries per width (sections are near-uniform, so
  // this is a handful of geometries store-wide); one side-band material total.
  const flushLabelMats = new Map<string, THREE.MeshStandardMaterial>();
  const getFlushLabelMat = (label: string): THREE.MeshStandardMaterial => {
    let mat = flushLabelMats.get(label);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        map: archedTopper
          ? createArchedTopperLabelTexture(label)
          : createFlushTopperLabelTexture(label, theme),
        roughness: archedTopper ? 0.55 : 0.4,
        metalness: 0.05
      });
      flushLabelMats.set(label, mat);
    }
    return mat;
  };
  const flushSideMat = new THREE.MeshStandardMaterial({
    // arched-plaque (2000) is a brick-red plaque; the flush banner takes the
    // theme's primary blue.
    color: archedTopper ? BB2000_PLAQUE_RED : theme.palette.primary,
    roughness: archedTopper ? 0.55 : 0.4,
    metalness: 0.05
  });
  // Plaque height (ft). The 2000 arched plaque is measured off the boxes it
  // sits over (footage/user: 0.6 of a box's height); 2010's banner runs a touch
  // shorter than HV's (the full 0.62 read too tall against that theme's
  // lower-contrast styling).
  const FLUSH_TOPPER_H = archedTopper ? 0.6 * CASE_HEIGHT : theme.id === 'bb-2010' ? 0.55 : 0.62;
  // Corner radius of the rounded top (proportional to the smaller arched plaque).
  const TOPPER_CORNER_R = archedTopper ? 0.11 : 0.15;
  const FLUSH_TOPPER_DEPTH = 0.03; // ft — one thin extrusion per face
  const flushTopperGeos = new Map<string, THREE.ExtrudeGeometry>();
  // Rounded-TOP-corner rectangle (bottom corners square), extruded thin. Built
  // in the XY plane with its base on y=0 so meshes sit flush on the shelf top.
  const getFlushTopperGeo = (w: number): THREE.ExtrudeGeometry => {
    const key = w.toFixed(2);
    let geo = flushTopperGeos.get(key);
    if (!geo) {
      const h = FLUSH_TOPPER_H;
      const r = Math.min(TOPPER_CORNER_R, w / 4);
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(w / 2, 0);
      shape.lineTo(w / 2, h - r);
      shape.quadraticCurveTo(w / 2, h, w / 2 - r, h);
      shape.lineTo(-w / 2 + r, h);
      shape.quadraticCurveTo(-w / 2, h, -w / 2, h - r);
      shape.closePath();
      geo = new THREE.ExtrudeGeometry(shape, { depth: FLUSH_TOPPER_DEPTH, bevelEnabled: false });
      // Extrude cap UVs are raw shape coordinates — normalize them so the
      // label texture fills the face exactly. The side-wall UVs get remapped
      // too but the side material carries no map, so that's harmless.
      const pos = geo.getAttribute('position');
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h);
      }
      flushTopperGeos.set(key, geo);
    }
    return geo;
  };

  // #118: each unit's same-material structure (shelf boards, pricing strips,
  // dividers, backing wall, sign feet) is merged into one Mesh per material
  // per unit instead of ~20 separate shadow-casting Meshes — same triangles,
  // same materials, far fewer draw calls per walk-mode frame and per shadow
  // rebake at production scale. Box templates are cached by dimension (they
  // repeat across units) and stamped into each unit's merge lists.
  const boxTemplates = new Map<string, THREE.BoxGeometry>();
  const getBoxTemplate = (w: number, h: number, d: number): THREE.BoxGeometry => {
    const key = `${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`;
    let geo = boxTemplates.get(key);
    if (!geo) {
      geo = new THREE.BoxGeometry(w, h, d);
      boxTemplates.set(key, geo);
    }
    return geo;
  };
  // Stamp a template into a merge list at a world position. The trapezoid
  // dividers are non-indexed extrusions, so indexed templates are de-indexed
  // to keep every list mergeGeometries-compatible.
  const stamp = (list: THREE.BufferGeometry[], template: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const geo = template.index ? template.toNonIndexed() : template.clone();
    geo.translate(x, y, z);
    list.push(geo);
  };

  // The 2000s wire-black frame is EXCLUDED from the merge: its wire material
  // is transparent, so the parts rely on three's per-object depth sorting
  // (merged, their triangle order would occlude grid lines behind alpha-0
  // texels), and each part carries its own texture repeat. Those parts stay
  // one mesh each, but share cached geometries and repeat-keyed materials
  // instead of allocating per-part clones.
  const wireBlackFrame = theme.shelving.frame === 'wire-black';
  const wireFrame = wireBlackFrame && !!materials.wireShelf;
  const wireMats = new Map<string, THREE.MeshStandardMaterial>();
  const getWireMat = (rx: number, ry: number): THREE.MeshStandardMaterial => {
    const key = `${rx.toFixed(2)}_${ry.toFixed(2)}`;
    let mat = wireMats.get(key);
    if (!mat) {
      mat = materials.wireShelf!.clone() as THREE.MeshStandardMaterial;
      // Override with the thicker/darker grid (#49b) rather than cloning the
      // theme-supplied texture — see getThickWireGridTexture() above.
      const thickWireTex = getThickWireGridTexture().clone();
      thickWireTex.repeat.set(rx, ry);
      thickWireTex.needsUpdate = true;
      mat.map = thickWireTex;
      mat.needsUpdate = true;
      wireMats.set(key, mat);
    }
    return mat;
  };

  // Store-wide constant geometries, shared by every unit (#118). The vertical
  // divider runs bottom to top as ONE CONTINUOUS PIECE; wire-black swaps the
  // trapezoid for a slim box, as before. End caps: the 2000s theme's are
  // rectangular, not tapered (#48) — top depth equals bottom depth; other
  // themes keep the tapered trapezoid look.
  //
  // Everything here stops at UNIT_FRAME_HEIGHT, the crown the stock actually
  // needs (see the constant) — the taper SLOPE is unchanged, so the frame is
  // simply cut off where it is still unitDepthAtHeight(UNIT_FRAME_HEIGHT) deep
  // rather than run on to the old 5.1.
  const frameTopDepth = unitDepthAtHeight(UNIT_FRAME_HEIGHT);
  const frameCenterY = UNIT_FRAME_HEIGHT / 2;
  const dividerTemplate: THREE.BufferGeometry = wireBlackFrame
    ? getBoxTemplate(0.8, UNIT_FRAME_HEIGHT, 0.04)
    : createTrapezoidGeometry(UNIT_FRAME_HEIGHT, UNIT_DEPTH - 0.05, frameTopDepth - 0.05, 0.04);
  const capTopDepth = wireBlackFrame ? UNIT_DEPTH : frameTopDepth;
  const capTrapezoidGeo = createTrapezoidGeometry(UNIT_FRAME_HEIGHT, UNIT_DEPTH, capTopDepth, 0.1);
  splitTrapezoidGroups(capTrapezoidGeo);


  plan.shelvingUnits.forEach((unit) => {
    const lib = libraries[unit.libraryIdx];
    if (!lib) return;

    const unitZCenter = plan.aisleZCenter(unit);
    // Spin this island in place about its own (xCenter, zCenter) by its arrangement yaw.
    const aisleParent = makeAisleGroup(unit.yaw, unit.xCenter, unitZCenter);
    const cols = unit.cols;
    const shelfLength = (cols - 1) * BOX_SPACING + 1.0; // 0.5 ft margin on each end

    const xCenter = unit.xCenter;
    const zCenter = FIELD_Z_FRONT + unit.zPos - shelfLength / 2;

    // Same-material structure parts collect here and merge into one mesh per
    // material at the end of the unit (see the #118 note above).
    const structureParts: THREE.BufferGeometry[] = []; // materials.shelf
    const stripParts: THREE.BufferGeometry[] = [];     // materials.strip

    // Draw horizontal shelves (solid boards or wire mesh depending on theme)
    AISLE_SHELF_HEIGHTS.forEach((yPos) => {
      const shelfDepth = unitDepthAtHeight(yPos);

      if (wireFrame) {
        const shelf = new THREE.Mesh(
          getBoxTemplate(shelfDepth, 0.04, shelfLength),
          getWireMat(shelfDepth * 6, shelfLength * 6)
        );
        shelf.position.set(xCenter, yPos, zCenter);
        shelf.receiveShadow = true;
        shelf.castShadow = true;
        aisleParent.add(shelf);
        deps.addCollider(shelf);
      } else {
        stamp(structureParts, getBoxTemplate(shelfDepth, 0.04, shelfLength), xCenter, yPos, zCenter);
      }

      // Pricing strips along the left and right lips. Inset from the shelf edge
      // (rather than centered ON it) so the strip's outer face sits flush with
      // shelfDepth/2 -- the same depth-vs-height taper the end cap trapezoid uses --
      // instead of overhanging past the end cap at the ends of a run.
      // The wire-black frame gets a chunkier bar (it reads as the wire shelf's
      // solid gunmetal front rail — see sharedStripMat in store-shell.ts);
      // laminate themes keep the slim pale pricing strip.
      // "Flush with shelfDepth/2" above meant EXACTLY coplanar with the board's
      // front face, and the full-length template made the strip's end faces
      // coplanar with the board's ends too. Coincident faces z-fight: the lip
      // shimmered along its whole length and flared where a run ends. Nudge the
      // outer face a hair proud and pull the ends a hair short so no face shares
      // a plane with the board. 0.003 ft is 1/28" — far below the end-cap
      // overhang the inset was protecting, far above the depth buffer's
      // resolution at browse distance.
      const STRIP_EPS = 0.003;
      const stripW = wireBlackFrame ? 0.035 : 0.02;
      const stripH = wireBlackFrame ? 0.06 : 0.03;
      const stripTemplate = getBoxTemplate(stripW, stripH, shelfLength - 2 * STRIP_EPS);
      const stripY = wireBlackFrame ? yPos + 0.03 : yPos + 0.02; // laminate placement unchanged
      // Left and right lip pricing strips
      const stripOffset = shelfDepth / 2 - stripW / 2 + STRIP_EPS;
      stamp(stripParts, stripTemplate, xCenter - stripOffset, stripY, zCenter);
      stamp(stripParts, stripTemplate, xCenter + stripOffset, stripY, zCenter);

    });

    // Vertical dividers between sets of 7 columns - ONE CONTINUOUS PIECE FROM BOTTOM TO TOP
    const addDivider = (zDiv: number) => {
      if (wireFrame) {
        const div = new THREE.Mesh(dividerTemplate, getWireMat(0.8 * 6, UNIT_FRAME_HEIGHT * 6));
        div.position.set(xCenter, frameCenterY, zDiv);
        div.receiveShadow = true;
        div.castShadow = true;
        aisleParent.add(div);
        deps.addCollider(div);
      } else {
        stamp(structureParts, dividerTemplate, xCenter, frameCenterY, zDiv);
      }
    };

    for (let colDivider = SECTION_COLS - 1; colDivider < cols - 1; colDivider += SECTION_COLS) {
      // Divider intersecting both sides
      addDivider(FIELD_Z_FRONT + unit.zPos - 0.5 - (colDivider + 0.5) * BOX_SPACING);
    }

    // Divider where conjoined/contiguous shelf units meet (at the back of the unit if not the end of the line)
    if (!unit.isLineBack) {
      addDivider(FIELD_Z_FRONT + unit.zPos - shelfLength);
    }

    // Solid backing wall in the center (divider along Z). The wire theme gets
    // a SOLID slatwall spine — matching the end caps' warm tan — rather than a
    // see-through wire panel, so a run can't be seen straight through and the
    // renderer gets real occlusion out of each aisle.
    //
    // Length is `shelfLength - 0.04` (0.02 shy at EACH Z end), not `- 0.1`. At an
    // interior seam two conjoined units' backing walls each reach Z_seam ± 0.02,
    // meeting the flush edges of the 0.04-ft-thick seam divider that sits at
    // Z_seam. Backing + divider + backing then tile the seam with no gap (the old
    // `- 0.1` left a 0.1-ft Z void that the 0.04 divider only half-covered → two
    // ~0.03 ft slivers you could see straight through to the opposite aisle face,
    // F8 pin 007) and no coplanar overlap (full `shelfLength` would duplicate the
    // divider's top/bottom faces). At line ends the 0.02 shy end tucks behind the
    // full-width end cap, so nothing shows through there either.
    if (wireFrame) {
      const backingWall = new THREE.Mesh(
        getBoxTemplate(0.5, UNIT_FRAME_HEIGHT, shelfLength - 0.04),
        getSpineSlatwallMaterial(UNIT_FRAME_HEIGHT)
      );
      backingWall.position.set(xCenter, frameCenterY, zCenter);
      backingWall.receiveShadow = true;
      backingWall.castShadow = true;
      aisleParent.add(backingWall);
      deps.addCollider(backingWall);
    } else {
      stamp(structureParts, getBoxTemplate(0.5, UNIT_FRAME_HEIGHT, shelfLength - 0.04), xCenter, frameCenterY, zCenter);
    }

    // Section toppers. Each 6-column section carries the classic
    // category of the stock actually shelved there — per FACE, since the two
    // sides of a unit can hold different categories.

    const layout = plan.layoutFor(unit.libraryIdx);
    // Entry blocks flow in customer walk order (see StorePlan.entryBlockOrder);
    // blockIndexOf says which block each of this unit's faces holds.
    const sideEntryCount = (side: 'front' | 'back') => {
      const startIdx = plan.blockIndexOf(unit.libraryIdx, unit.unitIdxInLibrary, side) * UNIT_SIDE_CAPACITY;
      return Math.max(0, Math.min(UNIT_SIDE_CAPACITY, layout.entries.length - startIdx));
    };
    // `p` is the PHYSICAL section index from the unit's front end. Faces whose
    // column order is mirrored (see aisleColZ: -X-browsed fronts, and the
    // reverse of that on backs) have logical section 0 at the far end, so
    // reflect over the unit's full section count. Labels are keyed by GLOBAL
    // section index: one block = UNIT_SECTIONS sections (two on the corporate
    // box, one on a format whose units are a single signboard bay wide).
    const sectionLabelFor = (side: 'front' | 'back', p: number): string => {
      const cnt = sideEntryCount(side);
      if (cnt <= 0) return lib.name;
      const totalSecs = Math.ceil(cols / SECTION_COLS);
      const mirrored = (unit.browseSign < 0) !== (side === 'back');
      const s = mirrored ? (totalSecs - 1 - p) : p;
      const block = plan.blockIndexOf(unit.libraryIdx, unit.unitIdxInLibrary, side);
      return layout.sectionLabels.get(String(block * UNIT_SECTIONS + s)) ?? lib.name;
    };

    // Create signboards running long ways above each shelf section at the top
    const fasciaRuns: { plusXLabel: string; minusXLabel: string; z: number; span: number }[] = [];
    // 2000 arched plaques don't mount per-section on the aisle faces; they sit
    // on the dividers + endcaps facing DOWN the aisle (see the post-loop
    // placement). Collect each section's genre here, ordered front→back (p=0 is
    // the +Z / front section).
    const archedSections: { genre: string }[] = [];
    for (let startCol = 0; startCol < cols; startCol += SECTION_COLS) {
      const endCol = Math.min(cols - 1, startCol + SECTION_COLS - 1);
      const zSecCenter = FIELD_Z_FRONT + unit.zPos - 0.5 - (startCol + endCol) / 2 * BOX_SPACING;
      const p = startCol / SECTION_COLS;

      // The unit's browse-front side sits at +X when browseSign > 0.
      const plusXLabel = sectionLabelFor(unit.browseSign >= 0 ? 'front' : 'back', p);
      const minusXLabel = sectionLabelFor(unit.browseSign >= 0 ? 'back' : 'front', p);

      // Recommendation clasps (fixtures/shelf-clasp.ts): clipped to the
      // eye-level board's front lip and centred on it vertically, the way a
      // real price-rail clasper straddles the shelf edge. It sits proud of the
      // lip (x offset below), so the half that rises above the board is in
      // FRONT of the cases standing there rather than behind them.
      //
      // ONE PER SECTION, both lips. An earlier version deduped these down to
      // one physical plaque per genre across the whole store, which is what
      // "one per genre" sounds like — but a genre spans several units, so the
      // nearest clasp to wherever you were browsing measured ~22ft away. It
      // lit up, off in the distance, and the feature read as broken. Each
      // clasp still speaks for exactly one genre (the label below); there is
      // simply one on every run of that genre rather than one in the building.
      if (deps.registerClasp) {
        const claspShelfDepth = unitDepthAtHeight(CLASP_SHELF_Y);
        const claspY = CLASP_SHELF_Y;
        const place = (label: string, sign: 1 | -1) => {
          deps.registerClasp!({
            x: xCenter + sign * (claspShelfDepth / 2 + 0.012),
            y: claspY,
            z: zSecCenter,
            rotY: sign > 0 ? 0 : Math.PI, // printed face points out of the lip
            parent: aisleParent,
            // An uncategorized library labels every section with its own name,
            // which is exactly the "one clasp for the library" case.
            category: label === lib.name ? null : label,
            libraryIdx: unit.libraryIdx,
          });
        };
        place(plusXLabel, 1);
        place(minusXLabel, -1);
      }

      if (archedTopper) {
        // 2000 arched plaque: NOT per-section on the aisle face. Just record
        // this section's genre; the plaques mount on the dividers + endcaps
        // facing down the aisle, placed after this loop.
        archedSections.push({ genre: plusXLabel });
        continue;
      }

      if (plaqueTopper) {
        // Flush banner topper (2010 / Night Owl): an elongated rounded-top
        // banner mounted directly on the shelf top (no feet). Two thin
        // back-to-back extrusions, one per face, so the two sides can carry
        // different category labels without mirrored text; the outward cap of
        // each extrusion always shows the shape's un-mirrored front UVs.
        const sectionSpan = (endCol - startCol + 1) * BOX_SPACING;
        // Half the section span: a compact centered plaque, not a full banner.
        const w = Math.max(1.2, (sectionSpan - 0.16) * 0.5);
        const geo = getFlushTopperGeo(w);
        ([1, -1] as const).forEach(dir => {
          const label = dir > 0 ? plusXLabel : minusXLabel;
          const mesh = new THREE.Mesh(geo, [getFlushLabelMat(label), flushSideMat]);
          // rotation.y = ±π/2 turns the extrusion axis (+Z) onto ±X, so the
          // two meshes occupy x∈[xCenter, xCenter+depth] / [xCenter-depth,
          // xCenter] — a flush pair centered on the gondola spine.
          mesh.rotation.y = dir * Math.PI / 2;
          mesh.position.set(xCenter, UNIT_FRAME_HEIGHT, zSecCenter); // base y=0 → flush on the frame top
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.layers.set(1); // keep the mirror-skip behavior of the classic toppers
          aisleParent.add(mesh);
          deps.addCollider(mesh);
        });
        continue;
      }

      // 1993-footage OPTION (bb_93_signage): fascia blades. Sections are
      // only COLLECTED here — the real boards are long planks spanning a
      // whole same-genre run (SUSPENSE ≈ 8ft x 10in, ~9:1 wide), so after
      // the loop contiguous sections sharing both face labels merge into
      // one blade instead of a row of stubby 4:1 per-section tiles
      // (user-flagged ratio).
      if (bb93SignageOn()) {
        const sectionSpan = (endCol - startCol + 1) * BOX_SPACING;
        fasciaRuns.push({ plusXLabel, minusXLabel, z: zSecCenter, span: sectionSpan });
        continue;
      }

      // Classic bb-90s ticket signboard (the store's own look) — the shared
      // card, cut and finished in fixtures/ticket-board-sign.ts (which also
      // carries the no-feet ruling: it sits FLUSH on the shelf frame's top).
      const signWidth = TICKET_BOARD_W;
      const signHeight = TICKET_BOARD_H;
      const signGeo = getBoxTemplate(TICKET_BOARD_T, signHeight, signWidth);
      const signMesh = new THREE.Mesh(signGeo, [
        getSectionLabelMat(plusXLabel),  // +X
        getSectionLabelMat(minusXLabel), // -X
        materials.signSide,  // +Y
        materials.signSide,  // -Y
        materials.signSide,  // +Z
        materials.signSide   // -Z
      ]);
      // Shelf frame tops out at UNIT_FRAME_HEIGHT; the card's BOTTOM edge lands there.
      signMesh.position.set(xCenter, UNIT_FRAME_HEIGHT + signHeight / 2, zSecCenter);
      markSignMesh(signMesh, { casts: true }); // free-hanging board: it does cast
      signMesh.layers.set(1);
      aisleParent.add(signMesh);
      deps.addCollider(signMesh);
    }

    // Emit the collected 1993 fascia boards: one per contiguous same-label
    // run, CENTERED on it (span-weighted so a shorter tail section doesn't
    // skew it). Sized by the user's count against the footage: the board
    // covers THREE displayed boxes, floating centered with shelf showing
    // past both ends — a compact genre marker, not a fascia.
    const BOARD_LEN_MAX = 3 * BOX_SPACING + 0.12; // 3 slots + the END_GAP blade() shaves
    for (let i = 0; i < fasciaRuns.length;) {
      let j = i + 1;
      while (j < fasciaRuns.length &&
             fasciaRuns[j].plusXLabel === fasciaRuns[i].plusXLabel &&
             fasciaRuns[j].minusXLabel === fasciaRuns[i].minusXLabel) j++;
      const run = fasciaRuns.slice(i, j);
      const span = run.reduce((s, r) => s + r.span, 0);
      // Snap to the SECTION center nearest the run's middle — a board
      // straddling the bay seam reads misplaced (user-flagged).
      const zMid = run.reduce((s, r) => s + r.z * r.span, 0) / span;
      const z = run.reduce((best, r) => Math.abs(r.z - zMid) < Math.abs(best.z - zMid) ? r : best, run[0]).z;
      const blade = fasciaFactory.blade(run[0].plusXLabel, run[0].minusXLabel, Math.min(span, BOARD_LEN_MAX));
      blade.position.set(xCenter, UNIT_FRAME_HEIGHT + FASCIA_BLADE_H / 2, z);
      blade.layers.set(1); // keep the classic toppers' mirror-skip behavior
      aisleParent.add(blade);
      deps.addCollider(blade);
      i = j;
    }

    // 2000 arched plaques: mount at the very top of the run on the FRONT (+Z)
    // edge of each section — that edge is the run's front ENDCAP for section 0
    // and a section DIVIDER for the rest — each turned to face DOWN the aisle
    // toward the store entrance (+Z), the footage orientation (rotated 90° from
    // the flush banner). rot 0 points the label's un-mirrored front cap at +Z,
    // so every plaque reads correctly as you walk in; the plaque is a compact
    // 2.2-box-wide marker centered on the gondola top (~1.35 ft across there).
    if (archedTopper && archedSections.length) {
      const plaqueGeo = getFlushTopperGeo(2.2 * CASE_WIDTH);
      archedSections.forEach((sec, p) => {
        // Front (+Z) edge of section p: col (p*SECTION_COLS - 0.5).
        const zFrontEdge = FIELD_Z_FRONT + unit.zPos - 0.5 - (p * SECTION_COLS - 0.5) * BOX_SPACING;
        const labelMat = getFlushLabelMat(sec.genre);
        // Two thin back-to-back extrusions (one per aisle direction) so BOTH
        // faces read their own un-mirrored front cap. A single mesh painted the
        // label on its -Z back cap too, which — sharing the extrude-cap UVs —
        // showed the genre word mirrored (backwards) from the far side.
        ([1, -1] as const).forEach(dir => {
          const mesh = new THREE.Mesh(plaqueGeo, [labelMat, flushSideMat]);
          mesh.rotation.y = dir > 0 ? 0 : Math.PI; // faces +Z / -Z; caps meet at zFrontEdge
          mesh.position.set(xCenter, UNIT_FRAME_HEIGHT, zFrontEdge);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.layers.set(1);
          aisleParent.add(mesh);
          deps.addCollider(mesh);
        });
      });
    }

    // Merge and emit the unit's collected structure — one draw call per
    // material per unit instead of one per part (#118). Shadow flags match
    // the old per-part meshes: structure and feet cast+receive. Strips now
    // RECEIVE (they used to set neither): an unshadowed lip stays uniformly
    // lit while the boards behind it shade, which is half of why the front
    // edge read as self-glowing — see sharedStripMat/nrClaspMat in
    // store-shell.ts. Still no castShadow: a 1/4" bar casts nothing worth a
    // shadow-map slot. The merged meshes join the collider set in place of
    // their parts (identical triangles, so identical raycast hits).
    if (structureParts.length) {
      const structure = new THREE.Mesh(mergeGeometries(structureParts), materials.shelf);
      structure.receiveShadow = true;
      structure.castShadow = true;
      aisleParent.add(structure);
      deps.addCollider(structure);
    }
    const strips = new THREE.Mesh(mergeGeometries(stripParts), materials.strip);
    strips.receiveShadow = true;
    aisleParent.add(strips);
    deps.addCollider(strips);

    // Skeuomorphic End Caps. A run is a chain of units joined short-end to
    // short-end, so caps only belong at the TWO true ends of the chain: the blue
    // label cap facing into the store, the white cap at the back end. Interior joints
    // get nothing, so the run reads as one continuous shelf. The trapezoid
    // geometry (capTrapezoidGeo) is shared store-wide — see #48/#118 above.

    // Find the front unit and back unit of this line to determine the absolute ends of the line
    const frontUnit = deps.plan.shelvingUnits.find(u => u.lineId === unit.lineId && u.isLineFront) || unit;
    const backUnit = deps.plan.shelvingUnits.find(u => u.lineId === unit.lineId && u.isLineBack) || unit;

    const frontUnitShelfLength = (frontUnit.cols - 1) * BOX_SPACING + 1.0;
    const backUnitShelfLength = (backUnit.cols - 1) * BOX_SPACING + 1.0;

    const halfLengthFront = frontUnitShelfLength / 2 + 0.05;
    const halfLengthBack = backUnitShelfLength / 2 + 0.05;

    const x_front = frontUnit.xCenter + halfLengthFront * Math.sin(frontUnit.yaw);
    const x_back = backUnit.xCenter - halfLengthBack * Math.sin(backUnit.yaw);

    const dist_front = Math.abs(x_front - 11.0);
    const dist_back = Math.abs(x_back - 11.0);

    const isFrontCapFacingStore = dist_front <= dist_back;

    // Trapezoid-cap themes paint BOTH ends' broad faces blue — a white outward
    // cap face reads as unfinished from the far side of the store. The 2000s
    // wire theme keeps its slatwall on the end away from the store centre.
    // isBlue still decides which cap carries the library label (userData.isFront).
    if (unit.isLineFront && !deps.suppressFrontCapLineIds?.has(unit.lineId)) {
      // Front End Cap (built to UNIT_FRAME_HEIGHT, flush with the run top)
      const isBlue = isFrontCapFacingStore;
      const capMats = createLibraryEndCapMaterial(wireBlackFrame ? !isBlue : false);
      const leftCap = new THREE.Mesh(capTrapezoidGeo, capMats);
      leftCap.position.set(xCenter, frameCenterY, FIELD_Z_FRONT + unit.zPos + 0.05);
      leftCap.rotation.y = 0; // Face pointing towards +Z
      leftCap.castShadow = true;
      leftCap.receiveShadow = true;
      leftCap.userData = {
        libraryIdx: unit.libraryIdx,
        restingZ: FIELD_Z_FRONT + unit.zPos + 0.05,
        lineId: unit.lineId,
        isFront: isBlue
      };
      aisleParent.add(leftCap);
      deps.addCollider(leftCap);
      deps.registerEndCap(leftCap);
    }

    if (unit.isLineBack) {
      // Back End Cap (built to UNIT_FRAME_HEIGHT, flush with the run top)
      const isBlue = !isFrontCapFacingStore;
      const capMats = createLibraryEndCapMaterial(wireBlackFrame ? !isBlue : false);
      const rightCap = new THREE.Mesh(capTrapezoidGeo, capMats);
      rightCap.position.set(xCenter, frameCenterY, FIELD_Z_FRONT + unit.zPos - shelfLength - 0.05);
      rightCap.rotation.y = Math.PI; // Face pointing towards -Z
      rightCap.castShadow = true;
      rightCap.receiveShadow = true;
      rightCap.userData = {
        libraryIdx: unit.libraryIdx,
        restingZ: FIELD_Z_FRONT + unit.zPos - shelfLength - 0.05,
        lineId: unit.lineId,
        isFront: isBlue
      };
      aisleParent.add(rightCap);
      deps.addCollider(rightCap);
      deps.registerEndCap(rightCap);
    }
  });
}
