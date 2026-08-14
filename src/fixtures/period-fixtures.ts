// T06 — period fixtures & props: candy display, previously-viewed bin, tape
// rewinder, tape-cleaner display. All primitive-geometry + canvas-texture,
// registered via fixture-registry.ts and placed through
// store-fixtures-config.ts, following the FourSidedDisplay reference pattern
// (src/fixtures/four-sided-display.ts).
import * as THREE from 'three';
import { Movie } from '../jellyfin';
import { FixturePlacement, seededRandom01 } from '../store-layout';
import { FixtureContext, StoreFixture } from '../fixtures';
import { Footprint, FLOOR_DISPLAY_CLEARANCE } from '../layout-validator';
import { createMovieInstancedMeshes, CASE_MEDIUM } from '../video-case';
import { getActiveTheme, scaleHex, themeTrimDarkHex } from '../themes';
import { catalogEntryFor } from '../candy-catalog';
import { tryLoadUserAssetTexture } from '../user-assets';
import { getActiveLogoSpec, type LogoSpec } from '../logo-spec';
import { drawLogo } from '../logo-renderer';
import { BB_ARCHIVO_BLACK, ensureBundledFont } from '../bundled-fonts';
import { ensureWrapFontsLoaded } from '../logo-wrap';
import { brandString } from '../brand-pack';

// A single row on the candy rack, with the real-product-shaped metadata T19
// needs to build a delivery search query (see candy-catalog.ts).
export interface CandyRow {
  id: string;
  label: string;
  name: string;
  size: string;
}

type Disposable = { geo?: THREE.BufferGeometry; mat?: THREE.Material; tex?: THREE.Texture };

function disposeAll(list: Disposable[]) {
  list.forEach((d) => {
    d.geo?.dispose();
    d.mat?.dispose();
    d.tex?.dispose();
  });
}

// Small canvas-texture label used for candy boxes / cleaner boxes — a solid
// color card with word-wrapped bold text, used as the single material on a
// tiny BoxGeometry (cheap, all six faces share the same card).
function createLabelTexture(text: string, bg: string, fg: string, w = 128, h = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = fg;
  c.lineWidth = 5;
  c.strokeRect(5, 5, w - 10, h - 10);
  c.fillStyle = fg;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const words = text.toUpperCase().split(' ');
  const fontSize = Math.max(14, Math.floor(w / 6));
  c.font = `bold ${fontSize}px sans-serif`;
  const lineHeight = fontSize + 6;
  const startY = h / 2 - ((words.length - 1) * lineHeight) / 2;
  words.forEach((word, i) => c.fillText(word, w / 2, startY + i * lineHeight));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Candy display — freestanding wire candy rack near the register.
// ═══════════════════════════════════════════════════════════════════════════
const DEFAULT_CANDY_LABELS = ['CHOCO BARS', 'GUMMY BEARS', 'POPCORN', 'MOVIE MINTS', 'SOUR RIBBONS'];

export class CandyDisplay implements StoreFixture {
  public placement: FixturePlacement;
  // Stable per-row ids so a future ticket (T19) can make candy rows
  // selectable/orderable at checkout without renumbering anything here.
  public rowIds: string[] = [];
  // T19: same rows, with real-product metadata attached (name/size) for the
  // delivery checkout screen. Populated alongside rowIds in build().
  public rows: CandyRow[] = [];

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private disposables: Disposable[] = [];

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
  }

  build(): void {
    const options = this.placement.options || {};
    const rows = (options.rows as number) || 5;
    const width = (options.footprintWidth as number) || 3.0;
    const depth = (options.footprintDepth as number) || 0.7;
    const labels = (options.labels as string[]) || DEFAULT_CANDY_LABELS;
    const palette = (options.palette as string[]) || ['#c81e2c', '#1a3fae', '#e08a00', '#1c8a4a', '#7a1cae'];

    const group = new THREE.Group();
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    this.group = group;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.45, metalness: 0.75 });
    const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 4.0, 8);
    const footGeo = new THREE.BoxGeometry(width - 0.1, 0.06, depth - 0.1);
    this.disposables.push({ geo: postGeo }, { geo: footGeo }, { mat: frameMat });

    const corners: [number, number][] = [
      [-width / 2 + 0.05, -depth / 2 + 0.05],
      [width / 2 - 0.05, -depth / 2 + 0.05],
      [-width / 2 + 0.05, depth / 2 - 0.05],
      [width / 2 - 0.05, depth / 2 - 0.05],
    ];
    corners.forEach(([x, z]) => {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(x, 2.0, z);
      post.castShadow = true;
      post.receiveShadow = true;
      group.add(post);
    });

    const foot = new THREE.Mesh(footGeo, frameMat);
    foot.position.set(0, 0.03, 0);
    foot.receiveShadow = true;
    group.add(foot);

    const shelfGeo = new THREE.BoxGeometry(width - 0.1, 0.03, depth - 0.1);
    const boxGeo = new THREE.BoxGeometry(0.32, 0.42, 0.18);
    this.disposables.push({ geo: shelfGeo }, { geo: boxGeo });

    for (let r = 0; r < rows; r++) {
      const y = 0.6 + r * 0.7;
      const shelf = new THREE.Mesh(shelfGeo, frameMat);
      shelf.position.set(0, y, 0);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      group.add(shelf);

      const label = labels[r % labels.length];
      const bg = palette[r % palette.length];
      const tex = createLabelTexture(label, bg, '#ffffff');
      const boxMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65, metalness: 0.05 });
      this.disposables.push({ mat: boxMat, tex });

      const perRow = Math.max(3, Math.floor((width - 0.3) / 0.36));
      const inst = new THREE.InstancedMesh(boxGeo, boxMat, perRow);
      inst.castShadow = true;
      inst.receiveShadow = true;
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < perRow; i++) {
        const bx = -width / 2 + 0.3 + i * ((width - 0.6) / Math.max(1, perRow - 1) || 0.36);
        m4.makeTranslation(bx, y + 0.24, 0);
        inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);

      const rowId = `${this.placement.id}_row_${r}_${label.replace(/\s+/g, '-').toLowerCase()}`;
      this.rowIds.push(rowId);
      const catalogEntry = catalogEntryFor(label);
      this.rows.push({ id: rowId, label, name: catalogEntry.name, size: catalogEntry.size });
    }

    this.ctx.scene.add(group);
    this.ctx.addCollider(group);
    this.ctx.requestShadowRefresh();
  }

  // Bounding footprint of the wire rack frame: the four corner posts + foot
  // all sit within (width, depth) centered on the placement — see build().
  getFootprint(): Footprint {
    const options = this.placement.options || {};
    const width = (options.footprintWidth as number) || 3.0;
    const depth = (options.footprintDepth as number) || 0.7;
    return {
      label: `fixture:${this.placement.id}`,
      kind: 'fixture',
      cx: this.placement.position.x,
      cz: this.placement.position.z,
      w: width,
      d: depth,
      yaw: this.placement.yaw,
    };
  }

  update(_timeMs: number): void {
    // Static prop — no per-frame work.
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    disposeAll(this.disposables);
    this.disposables = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Previously-viewed bin — waist-high dump bin, jumbled real movie cases.
// ═══════════════════════════════════════════════════════════════════════════
export class PreviouslyViewedBin implements StoreFixture {
  public placement: FixturePlacement;

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private binGeo: THREE.BufferGeometry | null = null;
  private binMat: THREE.Material | null = null;
  private caseMeshes: THREE.InstancedMesh[] = [];

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
  }

  build(): void {
    const options = this.placement.options || {};
    const count = (options.count as number) || 24;
    const sideFt = (options.footprintSize as number) || 3.0;
    const height = (options.height as number) || 2.2;

    const group = new THREE.Group();
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    this.group = group;

    // Tapered (angled-side) bin body: a 4-sided "cylinder" reads as a square
    // tub with sloped walls once its radial segments are rotated 45deg to put
    // flats — not corners — facing the cardinal axes.
    const topR = (sideFt * Math.SQRT2) / 2;
    const botR = (sideFt * 0.72 * Math.SQRT2) / 2;
    const geo = new THREE.CylinderGeometry(topR, botR, height, 4, 1, false);
    geo.rotateY(Math.PI / 4);
    this.binGeo = geo;
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
    this.binMat = mat;
    const bin = new THREE.Mesh(geo, mat);
    bin.position.y = height / 2;
    bin.castShadow = true;
    bin.receiveShadow = true;
    group.add(bin);

    // Jumbled contents: N random library titles, seeded so the pick and each
    // case's tilt/rotation is stable across reloads (seededRandom01, see
    // store-layout.ts). Rendered with the same createMovieInstancedMeshes used
    // on shelves so posters load through the normal cache/queue.
    //
    // TODO(future ticket, browse-bin follow-up to T19): these cases are
    // decorative only, not a SlottedFixture. Wiring bin contents into the
    // browse/select flow needs each case in its resting (non-jumbled) pose
    // plus a shared per-shelf InstancedMesh, neither of which the random-tilt
    // jumble here provides — deferred rather than half-implemented.
    const allMovies: Movie[] = [];
    const seen = new Set<string>();
    this.ctx.libraries.forEach((lib) =>
      lib.movies.forEach((m) => {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          allMovies.push(m);
        }
      })
    );
    allMovies.sort((a, b) => seededRandom01(a.id + this.placement.id) - seededRandom01(b.id + this.placement.id));
    const picked = allMovies.slice(0, Math.min(count, allMovies.length));

    const spread = Math.min(topR, botR) * 1.3;
    picked.forEach((movie) => {
      const { front, loadShelfDetails } = createMovieInstancedMeshes(movie, 1);
      const seed = `${this.placement.id}_${movie.id}`;
      const rx = (seededRandom01(seed + 'x') - 0.5) * spread * 1.6;
      const rz = (seededRandom01(seed + 'z') - 0.5) * spread * 1.6;
      const ry = seededRandom01(seed + 'y') * Math.PI * 2;
      const tiltX = (seededRandom01(seed + 'tx') - 0.5) * 0.6;
      const tiltZ = (seededRandom01(seed + 'tz') - 0.5) * 0.6;
      const stackY = height * 0.55 + seededRandom01(seed + 'h') * 0.4;

      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, ry, tiltZ));
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(rx, stackY, rz), quat, new THREE.Vector3(1, 1, 1));
      front.setMatrixAt(0, m4);
      front.instanceMatrix.needsUpdate = true;
      front.castShadow = true;
      front.receiveShadow = true;
      group.add(front);
      this.caseMeshes.push(front);
      loadShelfDetails(2);
    });

    this.ctx.scene.add(group);
    this.ctx.addCollider(bin);
    this.ctx.requestShadowRefresh();
  }

  // The bin tapers from a wider top rim (topR) to a narrower base (botR) —
  // see build()'s CylinderGeometry(topR, botR, ...). A regular-4-gon (square)
  // inscribed in radius R and rotated 45deg so its flats face the cardinal
  // axes has face-to-face width R*sqrt(2); since topR = sideFt*sqrt(2)/2,
  // that works out to exactly `sideFt` at the (wider) top rim, which is the
  // true collision-relevant footprint.
  getFootprint(): Footprint {
    const options = this.placement.options || {};
    const sideFt = (options.footprintSize as number) || 3.0;
    return {
      label: `fixture:${this.placement.id}`,
      kind: 'fixture',
      cx: this.placement.position.x,
      cz: this.placement.position.z,
      w: sideFt,
      d: sideFt,
      yaw: this.placement.yaw,
      // Dump bins are floor displays: double-walkway clearance to everything.
      clearance: FLOOR_DISPLAY_CLEARANCE,
    };
  }

  update(_timeMs: number): void {
    // Static jumble — no per-frame work.
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    // The bin body's own geometry/material are unique to this fixture and must
    // be freed. The jumbled movie-case meshes reuse video-case.ts's shared
    // singleton box geometry and cached (movie-id-keyed) materials/textures —
    // those live for the app's lifetime and must NOT be disposed here.
    this.binGeo?.dispose();
    this.binGeo = null;
    this.binMat?.dispose();
    this.binMat = null;
    this.caseMeshes = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Tape rewinder — the countertop store-branded single-tape rewinder.
//    VHS-era only; the tape reel spins behind the tinted lid window.
// ═══════════════════════════════════════════════════════════════════════════
// Modelled off photos of a REAL store-branded unit (see the measured
// reference in public/user-assets/fixtures/tape-rewinder/reference + NOTES.md):
// a flat, wide, glossy-black TOP-LOADING slab — a low base box with a shallow
// lid, a big smoked viewing window (the tape lies flat under it, reel hub
// visible), a comb of cooling ridges down one shoulder, a STOP/EJECT slider on
// the other, an amber power light on the front, and a thin house-color rim
// along the base. The brand mark on the lid is the REAL emblem (drawLogo from
// the active LogoSpec — the painter the storefront/signage/box-wraps use), so
// it's never hand-rolled; a photo-traced skin under user-assets can override it.
const RW_W = 0.88;       // ft — long axis (~10.5"); x
const RW_D = 0.46;       // ft — depth (~5.5"); z          → top face ≈ 1.9:1
const RW_BLUE_H = 0.028; // ft — house-color base rim
const RW_BASE_H = 0.17;  // ft — black base box above the rim
const RW_LID_H = 0.05;   // ft — shallow lid slab on top
const RW_BASE_TOP = RW_BLUE_H + RW_BASE_H; // 0.198
const RW_LID_TOP = RW_BASE_TOP + RW_LID_H; // 0.248

// The lid-top brand plaque: the store's own wordmark over its sub-line, set in
// the emblem's display face (the same one the box wraps and storefront use).
// Colours are the
// specific product's, not the emblem's, so they're literal here. Drawn onto a
// canvas whose aspect the lid plane matches; the caller redraws once the
// webfont resolves (ensureWrapFontsLoaded) so the harness never bakes fallback
// glyphs. NOT hand-rolled art — it's the real typeface.
function drawRewinderLogo(canvas: HTMLCanvasElement, spec: LogoSpec): void {
  const c = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height;
  c.clearRect(0, 0, w, h);
  c.fillStyle = '#0c0c0c';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = '#242424'; // recessed plaque edge
  c.lineWidth = 5;
  c.strokeRect(6, 6, w - 12, h - 12);
  const fam = spec.fontFamily.includes(',') ? spec.fontFamily
    : `"${spec.fontFamily}", "Arial Narrow", sans-serif`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  // Single ink, single size (the real plaque). The reference's plaque is all
  // yellow; the ink itself comes from the emblem knockout like every other
  // wordmark in the store, so this plaque follows a brand change instead of
  // wearing the old house forever (signage rule 2 — the sibling painter below
  // already does this).
  c.fillStyle = spec.textColor;
  const baseY = 84;
  let x = 22;
  const main = brandString('brand-wordmark', 'HALCYON');
  const sub = brandString('brand-subword-video', 'VIDEO');
  c.font = `700 52px ${fam}`;
  c.fillText(main, x, baseY);
  x += c.measureText(main).width + 16;
  c.fillText(sub, x, baseY);
  x += c.measureText(sub).width + 3;
  c.font = `700 22px ${fam}`;
  c.fillText('®', x, baseY - 26);
}

function createRewinderLogoTexture(spec: LogoSpec): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 620;
  canvas.height = 120;
  drawRewinderLogo(canvas, spec);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class TapeRewinder implements StoreFixture {
  public placement: FixturePlacement;

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private reel: THREE.Mesh | null = null;
  private logoMat: THREE.MeshStandardMaterial | null = null;
  private disposables: Disposable[] = [];
  private active = false;

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
  }

  build(): void {
    this.active = CASE_MEDIUM === 'vhs' || getActiveTheme().defaultMedium === 'vhs';
    if (!this.active) return; // DVD-era stores simply don't get this prop.

    const options = this.placement.options || {};
    // NOTE on positioning: EntranceCheckout doesn't expose a resolved
    // counter-anchor point (its getSignAnchors() anchors are computed only
    // once EntranceCheckout.build() runs), and fixture placement runs BEFORE
    // `new EntranceCheckout(...)` in three-scene.ts (see the
    // DEFAULT_FIXTURE_PLACEMENTS.forEach loop vs the entrance construction
    // further down buildStore()). These coordinates approximate the inner
    // counter top using the same constants EntranceCheckout computes
    // internally — cx = 11.0, counter top height innerH(2.7) + 0.12 — see
    // src/entrance.ts's build(). If T05 (or later) formalizes a live counter
    // anchor API, swap this placement to read it instead.
    const surfaceY = typeof options.surfaceY === 'number' ? options.surfaceY : 2.82;

    const group = new THREE.Group();
    group.position.set(this.placement.position.x, surfaceY, this.placement.position.z);
    // +z is the FRONT (amber light + open lid lip, faces the shopper); -z is
    // the back. The placement yaw faces the counter segment's OUTWARD normal
    // (toward the entrance), so add a half-turn to point the front at the floor.
    group.rotation.y = this.placement.yaw + Math.PI;
    this.group = group;

    // Glossy black plastic, shared across base/lid/ridges/slider.
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.34, metalness: 0.12 });
    this.disposables.push({ mat: bodyMat });

    // ── house-color base rim ──────────────────────────────────────────────
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x0a3aa0, roughness: 0.45, metalness: 0.1 });
    const blueGeo = new THREE.BoxGeometry(RW_W, RW_BLUE_H, RW_D);
    const blue = new THREE.Mesh(blueGeo, blueMat);
    blue.position.y = RW_BLUE_H / 2;
    blue.receiveShadow = true;
    group.add(blue);
    this.disposables.push({ geo: blueGeo, mat: blueMat });

    // ── Base box ──────────────────────────────────────────────────────────
    const baseGeo = new THREE.BoxGeometry(RW_W, RW_BASE_H, RW_D);
    const base = new THREE.Mesh(baseGeo, bodyMat);
    base.position.y = RW_BLUE_H + RW_BASE_H / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    this.disposables.push({ geo: baseGeo });

    // ── Lid built as a FRAME around the window opening (a solid slab would
    //    bury the recessed well). Covers the centre; the base's left ridge
    //    shoulder and right eject shoulder stay exposed. ────────────────────
    const lidCx = -0.02, lidD = RW_D * 0.9;
    const winCx = lidCx - 0.1, winW = 0.34, winD = 0.30; // window opening
    const lidY = RW_BASE_TOP + RW_LID_H / 2;
    const lidBar = (w: number, d: number, x: number, z: number) => {
      const geo = new THREE.BoxGeometry(w, RW_LID_H, d);
      const bar = new THREE.Mesh(geo, bodyMat);
      bar.position.set(x, lidY, z);
      bar.castShadow = true;
      group.add(bar);
      this.disposables.push({ geo });
    };
    const zBack = -lidD / 2 + (lidD / 2 - winD / 2) / 2;  // strip behind window
    const zFront = lidD / 2 - (lidD / 2 - winD / 2) / 2;  // strip in front
    const barD = lidD / 2 - winD / 2;
    lidBar(0.64, barD, lidCx, zBack);                     // back strip
    lidBar(0.64, barD, lidCx, zFront);                    // front strip
    lidBar(0.05, winD, winCx - winW / 2 - 0.025, 0);      // left strip
    lidBar(0.25, winD, 0.175, 0);                         // right strip (holds logo)

    // ── Cooling-ridge comb down the LEFT shoulder (InstancedMesh: one draw
    //    call). Fins run front-to-back along z. ────────────────────────────
    const ridgeCount = 8;
    const ridgeGeo = new THREE.BoxGeometry(0.012, 0.02, RW_D * 0.66);
    const ridges = new THREE.InstancedMesh(ridgeGeo, bodyMat, ridgeCount);
    ridges.castShadow = true;
    const m = new THREE.Matrix4();
    for (let i = 0; i < ridgeCount; i++) {
      const rx = -RW_W / 2 + 0.05 + i * 0.0165;
      m.makeTranslation(rx, RW_BASE_TOP + 0.01, 0);
      ridges.setMatrixAt(i, m);
    }
    ridges.instanceMatrix.needsUpdate = true;
    group.add(ridges);
    this.disposables.push({ geo: ridgeGeo });

    // ── STOP/EJECT slider on the RIGHT shoulder: a recessed channel with a
    //    raised button. ────────────────────────────────────────────────────
    const channelMat = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.6 });
    const channelGeo = new THREE.BoxGeometry(0.05, 0.014, RW_D * 0.62);
    const channel = new THREE.Mesh(channelGeo, channelMat);
    channel.position.set(RW_W / 2 - 0.075, RW_BASE_TOP + 0.007, 0);
    group.add(channel);
    const sliderGeo = new THREE.BoxGeometry(0.045, 0.022, 0.09);
    const slider = new THREE.Mesh(sliderGeo, bodyMat);
    slider.position.set(RW_W / 2 - 0.075, RW_BASE_TOP + 0.011, 0.07);
    slider.castShadow = true;
    group.add(slider);
    this.disposables.push({ geo: channelGeo, mat: channelMat }, { geo: sliderGeo });

    // ── Tape well recessed into the opening, with the spinning reel hub ────
    const wellMat = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.75 });
    const wellGeo = new THREE.BoxGeometry(winW, 0.012, winD);
    const well = new THREE.Mesh(wellGeo, wellMat);
    well.position.set(winCx, RW_BASE_TOP + 0.006, 0); // floor near the base top
    group.add(well);
    this.disposables.push({ geo: wellGeo, mat: wellMat });

    const reelMat = new THREE.MeshStandardMaterial({ color: 0x5a5a53, roughness: 0.5, metalness: 0.15 });
    const reelGeo = new THREE.CylinderGeometry(0.078, 0.078, 0.016, 24);
    const reel = new THREE.Mesh(reelGeo, reelMat);
    reel.position.set(winCx, RW_BASE_TOP + 0.02, 0);
    group.add(reel);
    this.reel = reel;
    this.disposables.push({ geo: reelGeo, mat: reelMat });
    // Amber reel-hub centre (the orange spindle dot in the reference).
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xd08a2a, roughness: 0.5 });
    const hubGeo = new THREE.CylinderGeometry(0.019, 0.019, 0.022, 12);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.position.set(winCx, RW_BASE_TOP + 0.03, 0);
    group.add(hub);
    this.disposables.push({ geo: hubGeo, mat: hubMat });

    // Smoked glass flush with the lid top (tape visible faintly through it).
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0c1016, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.4,
    });
    const glassGeo = new THREE.BoxGeometry(winW, 0.006, winD);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(winCx, RW_LID_TOP - 0.004, 0);
    group.add(glass);
    this.disposables.push({ geo: glassGeo, mat: glassMat });

    // ── The wordmark, printed flat on the lid RIGHT of the
    //    window, reading front→back like the real unit. ─────────────────────
    const spec = getActiveLogoSpec();
    const logoTex = createRewinderLogoTexture(spec);
    const logoMat = new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.3, metalness: 0.1 });
    this.logoMat = logoMat;
    const logoGeo = new THREE.PlaneGeometry(0.26, 0.05);
    const logo = new THREE.Mesh(logoGeo, logoMat);
    logo.position.set(lidCx + 0.19, RW_LID_TOP + 0.001, 0);
    logo.rotation.set(-Math.PI / 2, 0, Math.PI / 2); // lie flat, reading front→back
    group.add(logo);
    this.disposables.push({ geo: logoGeo, mat: logoMat, tex: logoTex });
    // The display face loads async; redraw once it resolves so the
    // harness (which doesn't link styles.css) never bakes fallback glyphs.
    ensureWrapFontsLoaded(spec, () => {
      if (!this.logoMat) return;
      drawRewinderLogo(logoTex.image as HTMLCanvasElement, spec);
      logoTex.needsUpdate = true;
      this.ctx.requestRender();
    });
    tryLoadUserAssetTexture('fixtures/tape-rewinder/top.png', (userTex) => {
      if (!this.logoMat) { userTex.dispose(); return; } // disposed while loading
      this.logoMat.map = userTex;
      this.logoMat.needsUpdate = true;
      this.disposables.push({ tex: userTex });
      this.ctx.requestRender(); // render-on-demand: poke a frame
    });

    // ── Amber power light on the FRONT face ───────────────────────────────
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0xffb020, emissive: 0xff8a00, emissiveIntensity: 1.5, roughness: 0.4,
    });
    const ledGeo = new THREE.SphereGeometry(0.014, 12, 10);
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(RW_W / 2 - 0.14, RW_BLUE_H + RW_BASE_H * 0.4, RW_D / 2 + 0.006);
    group.add(led);
    this.disposables.push({ geo: ledGeo, mat: ledMat });

    this.ctx.scene.add(group);
    this.ctx.addCollider(base);
    this.ctx.requestShadowRefresh();
  }

  // Sits ON the checkout counter (see build()'s surfaceY note above) — not a
  // floor footprint, so there's nothing for the ground-plan validator to check.
  getFootprint(): Footprint | null {
    return null;
  }

  update(timeMs: number): void {
    // Zero-allocation per-frame animation: spin the reel hub in place.
    if (this.reel) this.reel.rotation.y = timeMs * 0.004;
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    disposeAll(this.disposables);
    this.disposables = [];
    this.reel = null;
    this.logoMat = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Tape-cleaner display — countertop cardboard tray of VHS head-cleaner
//    clamshells, standing on the checkout counter band's blue top.
// ═══════════════════════════════════════════════════════════════════════════
// A real tape head cleaner ships in a standard VHS clamshell, so each display
// box uses exact VHS-case dimensions. These match CASE_DIMS.vhs in
// video-case.ts but are hardcoded on purpose: this prop is a fixed-era VHS
// product and must not resize if the store's live case medium is DVD.
const CLEANER_W = 0.365; // ft — VHS clamshell width
const CLEANER_H = 0.667; // ft — VHS clamshell height
const CLEANER_D = 0.082; // ft — VHS clamshell depth

// The box front. Owner F8 pin 030 saw a real chain's wordmark on this set of
// tape cleaners and ruled: strip it, "make it the primary store color" — so
// the whole face is the ACTIVE BRAND's primary, the mark on it is the ACTIVE
// emblem (drawLogo over getActiveLogoSpec, never a wordmark typed in here),
// and every other colour is derived from the same palette. Nothing about a
// house is written into this function; installing a brand pack repaints the
// counter display with it.
//
// Layout follows the measured one in
// public/user-assets/fixtures/tape-head-cleaner/NOTES.md — emblem across the
// top, the giant system word rotated 90° down the left edge, the product
// copy stacked in the right column — with the COPY kept generic (it names a
// product category, not a programme). The retired override redrew the real
// 1993 box; this is that box's layout wearing the store's own identity.
//
// Canvas aspect is the face's own 0.365 : 0.667 (0.547) — the retired art's
// 512x936 at half scale. Drawn once and shared by every instance (see
// build()); repainted in place when the bundled display face resolves.
const CLEANER_FACE_H_PX = 512;

function paintCleanerFace(canvas: HTMLCanvasElement): void {
  const w = canvas.width, h = canvas.height;
  const theme = getActiveTheme();
  const spec = getActiveLogoSpec(theme);
  const c = canvas.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);

  // House-colour board with the slight top-to-bottom fall a printed carton
  // has under a counter light.
  const field = c.createLinearGradient(0, 0, 0, h);
  field.addColorStop(0, theme.palette.primary);
  field.addColorStop(1, scaleHex(theme.palette.primary, 0.78));
  c.fillStyle = field;
  c.fillRect(0, 0, w, h);

  // The mark: the real emblem, top of the face, on the reference's own 0.063 H
  // margin. WORDMARK ALONE — the NOTES.md measurement pass settled that this
  // box prints the word, not the lockup (the measured emblem is 6.3 : 1, the
  // wordmark's ratio, and the photo resolves no plate above or below the
  // caps); and a plate in the house colour on a field of the house colour
  // would read as an empty box anyway. Same one-ink spec-clone move
  // gold-clamshell.ts makes: shape only, everything else is still canon.
  drawLogo(c, { ...spec, shape: 'none' }, { x: w * 0.06, y: h * 0.045, w: w * 0.88, h: h * 0.17 });

  // Trim rule under the emblem, in the house's own secondary.
  c.fillStyle = theme.palette.secondary;
  c.fillRect(w * 0.08, h * 0.235, w * 0.84, Math.max(1, h * 0.007));

  // The system word down the left edge, reading bottom→top, in the knockout
  // the emblem letters in — the reference's single loudest element.
  const knock = spec.textColor;
  c.save();
  c.translate(w * 0.155, h * 0.90);
  c.rotate(-Math.PI / 2);
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.font = `italic 900 ${Math.round(h * 0.135)}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  c.globalAlpha = 0.9;
  c.fillText('DRY', 0, 0);
  c.globalAlpha = 1;
  c.restore();

  // Right column: product copy. Generic by construction — this names a
  // product category, not a programme, so it needs no genericizing.
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const colX = w * 0.30;
  c.fillStyle = knock;
  c.font = `900 ${Math.round(h * 0.062)}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  c.fillText('VHS HEAD', colX, h * 0.365);
  c.fillText('CLEANER', colX, h * 0.435);
  c.font = `italic 600 ${Math.round(h * 0.040)}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  c.fillText('non-abrasive', colX, h * 0.500);
  c.fillStyle = theme.palette.secondary;
  c.font = `900 ${Math.round(h * 0.031)}px ${BB_ARCHIVO_BLACK}, sans-serif`;
  c.fillText('GOOD FOR', colX, h * 0.585);
  c.fillText('25 CLEANINGS', colX, h * 0.625);

  // Base bar: the carton's own foot, a deep shade of the same house colour.
  c.fillStyle = themeTrimDarkHex(theme);
  c.fillRect(0, h * 0.90, w, h * 0.10);
}

function createCleanerFaceTexture(onRepaint: () => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.height = CLEANER_FACE_H_PX;
  canvas.width = Math.round(CLEANER_FACE_H_PX * (CLEANER_W / CLEANER_H));
  paintCleanerFace(canvas);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // The emblem and the copy both set in the bundled display face; it registers
  // async, so the first pass can land on a system fallback. Repaint in place.
  ensureBundledFont(BB_ARCHIVO_BLACK, () => {
    paintCleanerFace(canvas);
    tex.needsUpdate = true;
    onRepaint();
  });
  return tex;
}

export class TapeCleanerDisplay implements StoreFixture {
  public placement: FixturePlacement;

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private disposables: Disposable[] = [];

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
  }

  build(): void {
    const options = this.placement.options || {};
    // Y of the surface this display rests on. Defaults to the checkout
    // counter band's TOP surface: 3.4 ft white band body + 0.14 ft blue top
    // slab = 3.54 (see entrance/counter.ts's bandH / counterTopBlue). Like
    // TapeRewinder, this is a constant rather than a live anchor because
    // fixture placement runs before EntranceCheckout builds the counter.
    const surfaceY = typeof options.surfaceY === 'number' ? options.surfaceY : 3.54;
    const count = (options.count as number) || 10;

    const group = new THREE.Group();
    group.position.set(this.placement.position.x, surfaceY, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    this.group = group;

    // Cardboard tray the clamshells stand in — sized so two rows of five
    // upright VHS boxes fit inside its lip.
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xcabf9e, roughness: 0.85 });
    const baseGeo = new THREE.BoxGeometry(2.2, 0.35, 0.5);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.175;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    this.disposables.push({ geo: baseGeo, mat: baseMat });

    // Cleaner boxes: the house-colour face texture on the front (+Z) and the
    // carton's own sides — a deep shade of the SAME house colour, so a brand
    // pack repaints the whole box, not just its front. One texture and two
    // materials for the whole instanced batch.
    //
    // No user-asset swap here any more: the branded override that used to
    // land on this material was retired on the owner's F8 pin 030 (see
    // public/user-assets/fixtures/tape-head-cleaner/NOTES.md), and re-dropping
    // that file must not put the mark back on the counter.
    const tex = createCleanerFaceTexture(() => this.ctx.requestRender());
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    const caseMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(themeTrimDarkHex()), roughness: 0.55,
    });
    const boxGeo = new THREE.BoxGeometry(CLEANER_W, CLEANER_H, CLEANER_D);
    this.disposables.push({ geo: boxGeo, mat: faceMat, tex }, { mat: caseMat });

    // BoxGeometry group order: +X, -X, +Y, -Y, +Z, -Z — label on +Z.
    const inst = new THREE.InstancedMesh(
      boxGeo,
      [caseMat, caseMat, caseMat, caseMat, faceMat, caseMat],
      count
    );
    inst.castShadow = true;
    inst.receiveShadow = true;
    const cols = 5;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = -0.84 + col * 0.42;
      const z = 0.14 - row * 0.2;
      // Standing upright on the tray, bottom edge resting on its top face.
      m4.makeTranslation(x, 0.35 + CLEANER_H / 2, z);
      inst.setMatrixAt(i, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);

    this.ctx.scene.add(group);
    this.ctx.addCollider(base);
    this.ctx.requestShadowRefresh();
  }

  // Sits ON the checkout counter band (see build()'s surfaceY) — like
  // TapeRewinder, no floor footprint of its own for the ground-plan
  // validator; the counter band it stands on is registered as 'structure'
  // footprints in store-fixtures-config.ts.
  getFootprint(): Footprint | null {
    return null;
  }

  update(_timeMs: number): void {
    // Static prop — no per-frame work.
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    disposeAll(this.disposables);
    this.disposables = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Structure-footprint marker — an invisible, geometry-less "fixture" whose
//    only job is to hand src/layout-validator.ts a footprint for architecture
//    that is built OUTSIDE the fixture pipeline. Today that's the walk-in
//    checkout counter's band: entrance/counter.ts builds it AFTER fixtures are
//    placed and validated (see three-scene.ts's buildStore() ordering), so
//    without these markers the validator simply never saw the counter.
//    Rectangles are declared as plain placement data in
//    store-fixtures-config.ts like every other fixture.
// ═══════════════════════════════════════════════════════════════════════════
export class StructureFootprint implements StoreFixture {
  constructor(public placement: FixturePlacement) {}

  build(): void {
    // Nothing to build — footprint only; the real geometry is owned elsewhere.
  }

  update(_timeMs: number): void {
    // Static marker — no per-frame work.
  }

  dispose(): void {
    // No GPU/DOM resources.
  }

  getFootprint(): Footprint {
    const options = this.placement.options || {};
    return {
      label: `structure:${this.placement.id}`,
      kind: 'structure',
      cx: this.placement.position.x,
      cz: this.placement.position.z,
      w: (options.footprintWidth as number) || 1.0,
      d: (options.footprintDepth as number) || 1.0,
      yaw: this.placement.yaw,
    };
  }
}
