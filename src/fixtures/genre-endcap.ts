// The staff-picks genre endcap: a shallow display shelf butted flush against
// the entrance-facing END of an aisle run, stocked by the staff-picks engine
// (staff-picks.ts) with watch-history recommendations for THAT run's genre —
// owned titles you haven't watched (rentable, wearing the STAFF PICK
// starburst) interleaved with not-in-library order candidates (empty boxes,
// orderable through the same requestMovie flow as collection gaps). The
// classic video-store endcap, aimed by TMDB's people-also-liked data.
//
// Placements are COMPUTED, not configured: StoreScene.staffPickEndcapPlacements()
// derives one per qualifying line-front shelving unit from the StorePlan, so
// every arrangement (straight/diagonal/herringbone) gets correctly-oriented
// endcaps for free. Three columns per shelf on purpose — the browse cursor's
// fixture path assumes 3 columns (see StoreScene.updateColsCount), so the
// whole rack is reachable without touching the nav code.
import * as THREE from 'three';
import { Movie } from '../jellyfin';
import { FixturePlacement, BOX_SPACING, UNIT_DEPTH, unitDepthAtHeight } from '../store-layout';

import { FixtureContext, SlottedFixture, FixtureSlot } from '../fixtures';
import { Footprint } from '../layout-validator';
import { markSignMesh, createTrapezoidGeometry } from '../sign-builders';
import { createCategorySignTexture } from '../canvas-textures';
import { CASE_HEIGHT, CASE_DEPTH } from '../video-case';
import { isDiscoveryRequested } from '../jellyseerr';
import { getActiveTheme } from '../themes';
import { formatShelfWood } from '../format-surfaces';
import { BB_ARCHIVO_BLACK } from '../bundled-fonts';

const COLS = 3;
const SHELF_HEIGHTS = [1.5, 2.6, 3.7];
const ROTATION_X = -0.2;
const SHELF_DEPTH = 0.5;

// Small canvas "REQUESTED" flag applied on top of a case once its request has
// gone through (or it arrived already-requested via Jellyseerr's own queue).
// Cheap: one shared texture, not per-title, since the text never varies.
// (Moved here from the retired discovery rack — the endcap is its only user.)
let requestedTagTexture: THREE.Texture | null = null;
export function getRequestedTagTexture(): THREE.Texture {
  if (requestedTagTexture) return requestedTagTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(20, 120, 40, 0.95)';
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = '#eafff0';
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, 500, 180);
  ctx.fillStyle = '#eafff0';
  ctx.font = `bold 92px ${BB_ARCHIVO_BLACK}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('REQUESTED', 256, 100);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  requestedTagTexture = tex;
  return tex;
}

// Core depth + shelf overhang = the footprint depth. Shared with
// StoreScene.staffPickEndcapPlacements(), which must place the core so the
// footprint's back edge lands EXACTLY on the shelving unit's end (touching
// within the validator's 1cm tolerance — a gap would trip the fixture-vs-
// shelving walkway warning, an overlap the collision error).
//
// The core is a thin pegboard BACK PANEL mounted on the aisle's end face, not
// a free-standing carcass: the display shelves come straight off the shelving
// unit's own end, so the whole fixture protrudes only a normal endcap's depth
// (panel + shelf overhang ≈ 0.64 ft) into the walkway.
export const ENDCAP_CORE_DEPTH = 0.14;
// GH #140: Standard endcap display height is 4.6 ft (matching corporate gondolas).
// In tall shelving formats (mom-and-pop 8.2 ft), the 4.6 ft fixture stands against
// the run's full-height end panel so the 3 display shelves fill the fixture
// proportionately and the header sign sits at comfortable eye level (~5 ft).
export const ENDCAP_CORE_HEIGHT = 4.6;


// ─── The terminal silhouette ────────────────────────────────────────────────
// An endcap does not sit BESIDE a run terminal, it REPLACES one: the run's own
// blue cap is suppressed on any line whose front end hosts an endcap
// (`suppressFrontCapLineIds`, src/shelving.ts), and this panel mounts on the
// exact plane that cap would have occupied. So it has to wear the terminal
// profile, and the terminal profile is the gondola's own section: a TRAPEZOID,
// UNIT_DEPTH at the carpet tapering to unitDepthAtHeight() at the crown.
//
// It used to be a plain rectangle ENDCAP_WIDTH wide at every height. That is
// flush with the run at the floor and 0.4 ft proud of it per side at the top —
// two different terminal silhouettes in one store, which is F8 pin 022 ("we
// seem to have a mixture of rectangular and A shaped shelves. that should
// never be the case. they should be uniform"). The taper is the canon side:
// it is what the run's own sails wear, it is what the gondola behind the panel
// actually is, and it is what the 1990 holiday POP unit in the owner's
// reference photo (2580265323, the Scotch and Bond instances) wears — that
// unit's printed slat panel is visibly wider at its base than at its top.
export const ENDCAP_WIDTH = UNIT_DEPTH;                             // at the carpet — flush with the run
export const ENDCAP_TOP_WIDTH = unitDepthAtHeight(ENDCAP_CORE_HEIGHT); // at the crown — ditto

// Narrowest a display shelf may get. The three stock columns sit at
// ±BOX_SPACING with a case up to CASE_WIDTH wide, so a board thinner than this
// would leave the outer two hanging off its ends; where the taper asks for
// less (the top shelf does) the board stays here and reads as a bracket shelf
// a finger's width proud of the panel, which is what a real one does.
const MIN_SHELF_WIDTH = 2 * (BOX_SPACING + 0.23);

// Every fixture kind that IS an aisle-run endcap. The endcap is one piece of
// furniture with swappable header + stock (the collection endcap is the same
// carcass under a different header card — see collection-endcap.ts), and the
// browse flow-through, the front-cap suppression and the clerk stand-point
// suppression all key on "is this an endcap", never on which variant. Adding a
// variant means adding it HERE, not editing four scene modules.
export const ENDCAP_KINDS = ['genre-endcap', 'collection-endcap'] as const;
export function isEndcapKind(kind: string | undefined): boolean {
  return kind === 'genre-endcap' || kind === 'collection-endcap';
}

// ─── The endcap footer plinth ───────────────────────────────────────────────
// The low base box the 80s stores ran under aisle-end displays — owner
// attestation 2026-07-30 ("i see that thing everywhere in the 80s"), with one
// dressed instance measured in photo 2580265323: height ~15.6 in off the
// Scotch head-cleaner box anchor (28 px/in at that depth; the floor edge is
// frame-cut on the near tower, so medium confidence), faces slightly proud of
// the fixture it sits under. Era-neutral furniture: the box itself carries no
// print — a seasonal kit dresses its FRONT face (see collection-endcap.ts).
export const ENDCAP_FOOTER_H = 1.30;
const FOOTER_LIP = 0.06;

// How far the plinth reaches into the walkway, measured from the run's end
// face (the plane the carcass mounts on, local z = -ENDCAP_CORE_DEPTH/2).
//
// Owner ruling 2026-08-01, F8 pin 021: "the green plinth needs to extend out
// about a foot and a half at the base of this endcap". It used to be
// ENDCAP_CORE_DEPTH + FOOTER_LIP = 0.20 ft — a card standing behind the
// display shelves, which overhang 0.57 ft, so the fixture read as shelves
// floating over nothing and the "plinth" showed only as a green stripe on the
// carcass. The reference agrees with the owner: in photo 2580265323 the green
// base of both holiday units is a deep box the panel stands ON, its front and
// side faces well proud of the panel and its white deck carrying stock (the
// Bond instance shows tapes standing on that deck).
export const ENDCAP_FOOTER_DEPTH = 1.50;

// The plinth's LIVERY, measured off IMG-A (1988 "NOW OPEN" commercial frame,
// /uploads/…064e0392-6484.png): the floor plinths standing under the white
// shelf towers are navy-sided boxes finished with a WHITE top lip. Sampled in
// the original frame with `magick`, plinth at px (1630..1970, 360..590):
//   • sides  mean rgb(19,33,90) = #13215a over px x1690-1870 y450-515 and
//     x1700-1850 y490-520 (two boxes, agreeing to ±2/255)
//   • top    mean rgb(231,228,221) = #e7e4dd over px x1710-1850 y395-420
// The frame carries no colour cast worth correcting (that top samples neutral
// to within 10/255), so those are usable numbers as-is.
//
// The SIDES stay `opts.color ?? theme primary` — theme-tracking, the rule
// shelving.ts follows — and bb-90s primary #0050d5 is what this store's navy
// already is. Only the +Y face is pinned: white, always, in every case. It is
// the shelf white (0xf4f6fa / MeshStandard 0.35 rough, 0.15 metal) taken
// straight off `shelfMat` in build() below, so the lip reads as the same
// laminate the store's shelves are made of rather than a second, invented white.
const FOOTER_TOP_WHITE = 0xf4f6fa;

/**
 * The endcap carcass panel: the run terminal's trapezoid (see ENDCAP_WIDTH),
 * extruded `depth` thick and centred on the origin the way BoxGeometry is, so
 * it is a drop-in for the rectangle this replaced.
 *
 * Cap UVs come out of ExtrudeGeometry as raw shape coordinates (feet). They
 * are renormalized to 0..1 here so materials written for the old box — the
 * collection endcap's slat sheet repeats itself over the panel HEIGHT — keep
 * mapping exactly as they did. `u` compresses toward the narrow top, which is
 * invisible on a texture whose rows are horizontal bands.
 *
 * Cached per (w, wTop, h, d): every endcap in the store shares one.
 */
const coreGeos = new Map<string, THREE.ExtrudeGeometry>();
function getEndcapCoreGeometry(w: number, wTop: number, h: number, d: number): THREE.ExtrudeGeometry {
  const key = `${w.toFixed(3)}_${wTop.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`;
  let geo = coreGeos.get(key);
  if (!geo) {
    geo = createTrapezoidGeometry(h, w, wTop, d);
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
    }
    coreGeos.set(key, geo);
  }
  return geo;
}

/** Display-shelf board width at height `y`: the taper, floored so 3 cases fit. */
export function endcapShelfWidth(y: number): number {
  return Math.max(unitDepthAtHeight(y) - 0.12, MIN_SHELF_WIDTH);
}

/**
 * Fixture-local Z of the plinth's FRONT face. The run's end face — the plane
 * the carcass mounts on, and the datum ENDCAP_FOOTER_DEPTH is measured from —
 * is at -ENDCAP_CORE_DEPTH/2, so this is that plus the ruled reach.
 */
function footerFrontZ(): number {
  return -ENDCAP_CORE_DEPTH / 2 + ENDCAP_FOOTER_DEPTH;
}

/**
 * Build the plinth under a fixture's base into `group`. Plain by default
 * (theme primary, or `opts.color`) with a WHITE top lip; `opts.dressFront`
 * paints the front face onto a canvas texture, which is returned so the caller
 * owns its disposal (null when the plinth is plain — nothing to dispose).
 */
export function buildEndcapFooter(
  group: THREE.Group,
  coreWidth: number,
  coreDepth: number,
  opts: { color?: string; dressFront?: (c: CanvasRenderingContext2D, W: number, H: number) => void } = {},
): THREE.CanvasTexture | null {
  const w = coreWidth + FOOTER_LIP;
  // Back edge stays a lip's-worth behind the carcass; the box then runs
  // FORWARD to ENDCAP_FOOTER_DEPTH off the run's end face (see that constant),
  // so the panel and its shelves stand ON the plinth rather than over its edge.
  const zBack = -(coreDepth / 2 + FOOTER_LIP / 2);
  const d = footerFrontZ() - zBack;
  const body = new THREE.MeshStandardMaterial({
    color: new THREE.Color((opts.color ?? getActiveTheme().palette.primary) as any),
    roughness: 0.8,
    metalness: 0.02,
  });
  const topLip = new THREE.MeshStandardMaterial({
    color: FOOTER_TOP_WHITE,
    roughness: 0.35,
    metalness: 0.15,
  });
  let tex: THREE.CanvasTexture | null = null;
  // BoxGeometry face order (+x, -x, +y, -y, +z, -z). A per-face array in ALL
  // cases — plain and dressed — so index 2 (+Y) is the white lip either way;
  // the plain plinth used to be one flat material and came out navy on top.
  let mats: THREE.Material[] = [body, body, topLip, body, body, body];
  if (opts.dressFront) {
    const W = 1024;
    const H = Math.round((W * ENDCAP_FOOTER_H) / w);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    opts.dressFront(canvas.getContext('2d')!, W, H);
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.02 });
    // Print on +Z only; the white lip on +Y survives the dressing.
    mats = [body, body, topLip, body, front, body];
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w, ENDCAP_FOOTER_H, d), mats);
  plinth.position.set(0, ENDCAP_FOOTER_H / 2, zBack + d / 2);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);
  return tex;
}

export class GenreEndcap implements SlottedFixture {
  public placement: FixturePlacement;
  public shelfHeights: number[] = SHELF_HEIGHTS;
  public capacity = SHELF_HEIGHTS.length * COLS;
  public genre = 'Related Movies';

  // Topper sign text — "Related Movies" or "Related Shows", chosen by
  // StoreScene.staffPickEndcapPlacements() from the aisle's library type.
  private title = 'Related Movies';

  protected ctx: FixtureContext;
  protected group: THREE.Group | null = null;
  private signTex: THREE.Texture | null = null;
  private placardTex: THREE.Texture | null = null;
  /** Set only when a footer plinth with a dressed front was built. */
  protected footerTex: THREE.Texture | null = null;
  private movies: Movie[] = [];
  private dismissedIds = new Set<string>();
  private requestedTagMeshes = new Map<string, THREE.Mesh>();

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
    const options = this.placement.options || {};
    if (typeof options.genre === 'string') this.genre = options.genre;
    if (typeof options.title === 'string') this.title = options.title;
  }

  build(): void {
    this.initMovies();

    const coreWidth = ENDCAP_WIDTH;
    const coreDepth = ENDCAP_CORE_DEPTH;
    const coreHeight = ENDCAP_CORE_HEIGHT;
    const palette = getActiveTheme().palette;

    this.group = new THREE.Group();
    this.group.position.set(this.placement.position.x, 0, this.placement.position.z);
    this.group.rotation.y = this.placement.yaw;

    const coreMat = this.coreMaterial(palette.primary);
    const core = new THREE.Mesh(
      getEndcapCoreGeometry(coreWidth, ENDCAP_TOP_WIDTH, coreHeight, coreDepth),
      coreMat
    );
    core.position.set(0, coreHeight / 2, 0);
    core.castShadow = true;
    core.receiveShadow = true;
    this.group.add(core);

    // Brand-gold kick stripe along the base, same read as the shelving strips.
    const stripeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.secondary),
      roughness: 0.5,
      metalness: 0.1,
    });
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(coreWidth + 0.04, 0.18, coreDepth + 0.04),
      stripeMat
    );
    stripe.position.set(0, 0.09, 0);
    this.group.add(stripe);

    // The endcap FOOTER plinth — the low base box the 80s stores ran under
    // their aisle-end displays (owner attestation 2026-07-30: "i see that
    // thing everywhere in the 80s"; dressed instance measured in photo
    // 2580265323). Armed by placement options so any era's placements can opt
    // in without a theme gate: `options.footer: true` (plain, theme primary)
    // or a CSS colour string. The collection endcap builds its own dressed
    // variant regardless — see collection-endcap.ts.
    const footerOpt = this.placement.options?.footer;
    if (footerOpt) {
      this.footerTex = buildEndcapFooter(this.group, coreWidth, coreDepth, {
        color: typeof footerOpt === 'string' ? footerOpt : undefined,
      });
    }

    // Three shallow display shelves off the front face, cases tilted back the
    // same way the discovery rack presents its stock.
    // Display boards: bright melamine on a chain endcap, the run's own timber
    // where the format's shelving is wood (see coreMaterial).
    const endcapWood = formatShelfWood();
    const shelfMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(endcapWood ? endcapWood.hex : 0xf4f6fa),
      map: endcapWood ? endcapWood.textures.map : null,
      roughness: endcapWood ? 0.62 : 0.35,
      metalness: endcapWood ? 0.0 : 0.15,
    });
    // One board per tier, each cut to the carcass's width AT ITS OWN HEIGHT so
    // the shelves narrow with the panel instead of flying past its tapered
    // edges (they shared one full-width geometry when the panel was a box).
    this.shelfHeights.forEach((yPos) => {
      const shelfGeo = new THREE.BoxGeometry(endcapShelfWidth(yPos), 0.03, SHELF_DEPTH);
      const shelf = new THREE.Mesh(shelfGeo, shelfMat);
      shelf.position.set(0, yPos, coreDepth / 2 + SHELF_DEPTH / 2);
      shelf.rotation.x = ROTATION_X;
      shelf.castShadow = true;
      this.group!.add(shelf);
    });

    this.buildHeader(coreWidth, coreHeight, coreDepth);

    // Order candidates already requested (this session past, or Jellyseerr's
    // own queue) come back restyled from boot.
    this.getSlots().forEach((slot) => {
      if (this.isRequested(slot.movie)) this.addRequestedTag(slot);
    });

    this.ctx.scene.add(this.group);
    this.ctx.addCollider(this.group);
    this.ctx.requestShadowRefresh();
  }

  /**
   * The carcass material. Overridable so a variant can dress the same panel
   * differently (the collection endcap slats it — see collection-endcap.ts)
   * without duplicating build(). Default: a thin brand-blue pegboard back
   * panel — unlike the discovery rack's frosted "not real stock" acrylic, an
   * endcap IS the aisle's furniture, so it reads as gondola: opaque, matte, in
   * the shelving palette.
   */
  protected coreMaterial(primary: string | number): THREE.Material {
    // "It reads as gondola: opaque, matte, in the shelving palette" — so when
    // the FORMAT's shelving is timber rather than painted steel, the endcap is
    // timber too. Following the house colour there would leave a chain-blue
    // slab standing at the end of a wooden run, which is what it looked like.
    const wood = formatShelfWood();
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color((wood ? wood.endPanelHex : primary) as any),
      map: wood ? wood.textures.map : null,
      roughness: wood ? 0.62 : 0.75,
      metalness: wood ? 0.0 : 0.05,
    });
  }

  /**
   * The endcap's HEADER — the one parameter of the endcap grammar that varies
   * by what the endcap is for (see collection-endcap.ts for the 1990
   * franchise-card variant). Called from build() with the carcass dimensions;
   * anything it adds goes on `this.group` and is disposed with it.
   *
   * Default: the "Related Movies"/"Related Shows" identity, with the genre on
   * a smaller placard below when the run is sectioned (a tiny library's endcap
   * is just the picks). Both signs live ABOVE the core: the top shelf stocks
   * at eye level, so a placard on the core face would hide behind the cases.
   */
  protected buildHeader(_coreWidth: number, coreHeight: number, coreDepth: number): void {
    if (!this.group) return;
    const genreLabel = typeof this.placement.options?.genreLabel === 'string'
      ? (this.placement.options.genreLabel as string)
      : null;
    // Card size first, then the texture cut to that card's aspect: the ticket
    // art carries a round stub notch and measured margins, so a sheet built for
    // some other aspect would show up as an oval and wrong borders.
    // Sized off the CROWN, not the base: the header is a topper sitting on the
    // carcass's top edge, and the carcass tapers (see ENDCAP_TOP_WIDTH), so a
    // card cut to the base width would overhang the crown it stands on.
    const isWood = !!formatShelfWood();
    const signW = Math.min(ENDCAP_TOP_WIDTH, 2.0), signH = 0.55;
    this.signTex = createCategorySignTexture(this.title, undefined, false, signW / signH);
    const signMat = new THREE.MeshStandardMaterial({ map: this.signTex, roughness: isWood ? 0.8 : 0.6, metalness: 0.0 });
    const sign = markSignMesh(
      new THREE.Mesh(new THREE.BoxGeometry(signW, signH, 0.06), signMat)
    );
    sign.position.set(0, coreHeight + (genreLabel ? 0.65 : 0.33), coreDepth / 2 + 0.03);
    this.group.add(sign);

    if (genreLabel) {
      const placW = Math.min(ENDCAP_TOP_WIDTH, 1.6), placH = 0.4;
      this.placardTex = createCategorySignTexture(genreLabel, undefined, false, placW / placH);
      const placardMat = new THREE.MeshStandardMaterial({ map: this.placardTex, roughness: isWood ? 0.8 : 0.6, metalness: 0.0 });
      const placard = markSignMesh(
        new THREE.Mesh(new THREE.BoxGeometry(placW, placH, 0.05), placardMat)
      );
      placard.position.set(0, coreHeight + 0.18, coreDepth / 2 + 0.03);
      this.group.add(placard);
    }

  }

  update(_timeMs: number): void {
    // Static furniture.
  }

  dispose(): void {
    this.disposeHeader();
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      this.group = null;
    }
    this.requestedTagMeshes.clear();
  }

  /** Release whatever buildHeader() allocated (paired override point). */
  protected disposeHeader(): void {
    this.signTex?.dispose();
    this.signTex = null;
    this.placardTex?.dispose();
    this.placardTex = null;
    this.footerTex?.dispose();
    this.footerTex = null;
  }

  /**
   * Does this endcap stand on a footer plinth? The plinth is the fixture's
   * DEEPEST part (see ENDCAP_FOOTER_DEPTH), so the footprint — and therefore
   * the clerk's nav grid and the layout validator's walkway checks — has to
   * know about it. Overridden true by the collection endcap, which always
   * builds one.
   */
  protected hasFooter(): boolean {
    return !!this.placement.options?.footer;
  }

  // Back edge = the core's back face, which staffPickEndcapPlacements() lands
  // exactly on the shelving unit's end; front edge = whichever reaches further
  // into the walkway, the shelf overhang or the footer plinth.
  getFootprint(): Footprint {
    const frontExtent = Math.max(
      ENDCAP_CORE_DEPTH / 2 + SHELF_DEPTH,
      this.hasFooter() ? footerFrontZ() : 0,
    );
    const backExtent = ENDCAP_CORE_DEPTH / 2;
    const centerLocalZ = (frontExtent - backExtent) / 2;
    const yaw = this.placement.yaw;
    return {
      label: `fixture:${this.placement.id}`,
      kind: 'fixture',
      cx: this.placement.position.x + centerLocalZ * Math.sin(yaw),
      cz: this.placement.position.z + centerLocalZ * Math.cos(yaw),
      w: ENDCAP_WIDTH,
      d: frontExtent + backExtent,
      yaw,
    };
  }

  getSlots(): FixtureSlot[] {
    const slots: FixtureSlot[] = [];
    const xPosBase = this.placement.position.x;
    const zPosBase = this.placement.position.z;
    const angle = this.placement.yaw;
    const baseLocalZ = ENDCAP_CORE_DEPTH / 2 + SHELF_DEPTH / 2;
    const halfCols = (COLS - 1) / 2;

    // Stock TOP shelf first — eye level gets the strongest picks, and a
    // sparsely-stocked endcap keeps its cases where the camera (and a
    // customer) actually looks instead of hiding them at ankle height.
    const shelfStockOrder = this.shelfHeights.map((_, i) => i).reverse();
    shelfStockOrder.forEach((shelfIdx, orderIdx) => {
      const shelfY = this.shelfHeights[shelfIdx];
      for (let col = 0; col < COLS; col++) {
        const slotIdx = orderIdx * COLS + col;
        if (slotIdx >= this.movies.length) continue;
        const movie = this.movies[slotIdx];
        if (this.dismissedIds.has(movie.id)) continue; // crossed off — empty spot

        // col 0 is the viewer's LEFT (world +localX is screen-right on every
        // face, so the browse nav's left = col-- reads the right way round).
        const localX = (col - halfCols) * BOX_SPACING;
        const localZ = baseLocalZ + (CASE_HEIGHT / 2 + 0.02) * Math.sin(ROTATION_X);
        const localY = shelfY + (CASE_HEIGHT / 2 + 0.02) * Math.cos(ROTATION_X);

        slots.push({
          movie,
          side: 'front',
          shelfIdx,
          col,
          restingX: xPosBase + localX * Math.cos(angle) + localZ * Math.sin(angle),
          restingY: localY,
          restingZ: zPosBase - localX * Math.sin(angle) + localZ * Math.cos(angle),
          restingRotY: angle,
          restingRotX: ROTATION_X,
          depth: CASE_DEPTH,
          key: `fixture_${this.placement.id}_side_front_shelf_${shelfIdx}_col_${col}`,
        });
      }
    });
    return slots;
  }

  private isRequested(movie: Movie): boolean {
    if (!movie.discovery) return false;
    return !!movie.discoveryRequested || isDiscoveryRequested(movie.tmdbId);
  }

  private addRequestedTag(slot: FixtureSlot): void {
    if (!this.group || this.requestedTagMeshes.has(slot.movie.id)) return;
    const mat = new THREE.MeshStandardMaterial({
      map: getRequestedTagTexture(),
      roughness: 0.4,
      metalness: 0.0,
      transparent: true,
    });
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), mat);
    // Recover local coords from the world-space slot pose (the group already
    // carries the world position/yaw, so undo the rotation getSlots applied).
    const localX = slot.restingX - this.placement.position.x;
    const localZ = slot.restingZ - this.placement.position.z;
    const angle = this.placement.yaw;
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    tag.position.set(
      localX * cos + localZ * sin,
      slot.restingY + CASE_HEIGHT / 2 + 0.12,
      -localX * sin + localZ * cos + 0.03
    );
    tag.rotation.x = ROTATION_X;
    this.group.add(tag);
    this.requestedTagMeshes.set(slot.movie.id, tag);
  }

  // Called by StoreScene (markDiscoveryRequested) after a live requestMovie()
  // success so the case restyles immediately, without a scene rebuild.
  public markRequested(movieId: string): void {
    const slot = this.getSlots().find((s) => s.movie.id === movieId);
    if (!slot) return;
    this.addRequestedTag(slot);
    this.ctx.requestShadowRefresh();
  }

  // Called by StoreScene (dismissGapTitle) when the player crosses an order
  // candidate off: forget the stock so nothing here restocks it, and drop any
  // REQUESTED tag hanging over its now-empty spot. Hiding the case itself is
  // the scene's job — it owns the instanced slots.
  public removeStock(movieId: string): void {
    if (this.dismissedIds.has(movieId) || !this.movies.some((m) => m.id === movieId)) return;
    // Marked, not spliced: getSlots() keys slots by their index into `movies`,
    // so removing an entry would re-key (and visually shuffle) every case
    // after it. The spot just goes empty.
    this.dismissedIds.add(movieId);
    const tag = this.requestedTagMeshes.get(movieId);
    if (tag) {
      tag.parent?.remove(tag);
      tag.geometry.dispose();
      (tag.material as THREE.Material).dispose();
      this.requestedTagMeshes.delete(movieId);
    }
    this.ctx.requestShadowRefresh();
  }

  // Stock comes as movie ids (clone-safe through createFixture's placement
  // deep-clone) resolved back to the LIVE Movie objects — endcap slots must
  // share identity with the library's own so rent/order state stays one fact.
  private initMovies(): void {
    const ids = Array.isArray(this.placement.options?.pickIds)
      ? (this.placement.options!.pickIds as string[])
      : [];
    const byId = new Map<string, Movie>();
    for (const lib of this.ctx.libraries) for (const m of lib.movies) byId.set(m.id, m);
    for (const m of this.ctx.staffPickMovies) byId.set(m.id, m);
    this.movies = ids
      .map((id) => byId.get(id))
      .filter((m): m is Movie => !!m)
      .slice(0, this.capacity);
  }
}
