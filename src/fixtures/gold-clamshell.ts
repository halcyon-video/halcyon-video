// The BRASS "NEW RELEASE" clamshell — the case that stands behind every New
// Releases wall item, so a new title is visibly a different object on the
// shelf from a catalog one.
//
// User direction (2026-07-22): this case stands behind EVERY New Releases wall
// item — the wall's instanced back-box meshes wear these materials (see
// buildAllMovieBoxes in store-stock.ts), replacing the old per-rented-title
// filler group, whose 0.16ft behind-gap sank it inside the NR wall's backing
// panel anyway.
//
// The print is drawn PROCEDURALLY from the active brand (it used to be a
// per-pixel remap of the standard wrap scan, which tied a fixture to one
// chain's artwork and broke the moment the scans left the tree): a warm brass
// insert, the rental terms in the house ink, and the emblem printed one-ink so
// the lettering knocks out to the brass underneath.
//
// Viewable alone: `npm run assetshot -- --kind fixture --name gold-clamshell`.
import * as THREE from 'three';
import type { StoreScene } from '../three-scene';
import { FixturePlacement } from '../store-layout';
import { FixtureContext, StoreFixture } from '../fixtures';
import { getRentalCaseGeometry } from '../video-case';
import { getActiveLogoSpec } from '../logo-spec';
import { drawLogo } from '../logo-renderer';
import { getActiveTheme } from '../themes';
import { brandString } from '../brand-pack';
import { ensureVarsityFont } from './genre-fascia';
import { BB_ANTON, BB_ARCHIVO_BLACK } from '../bundled-fonts';

const GROUP_NAME = 'gold-clamshell-fillers';
// The insert stock: warm brass card, printed in the house emerald.
const INSERT_BRASS = '#b98f2c';
const INSERT_EDGE = '#8f6c1d';

interface GoldSet {
  mats: THREE.Material[];
  repaint: () => void;
}
let goldSet: GoldSet | null = null;

// Shrink-to-fit one line of caps at (x, baseline).
function fitLine(
  c: CanvasRenderingContext2D, text: string, family: string, startPx: number, maxW: number,
): number {
  let em = startPx;
  c.font = `${em}px ${family}`;
  while (em > 8 && c.measureText(text).width > maxW) {
    em -= 1;
    c.font = `${em}px ${family}`;
  }
  return em;
}

function getGoldMaterials(): GoldSet {
  if (goldSet) return goldSet;
  ensureVarsityFont(() => { goldSet?.repaint(); });
  const theme = getActiveTheme();
  const spec = getActiveLogoSpec(theme);
  const ink = spec.bodyColor;
  // One-ink print: the emblem's field is the ink and its lettering knocks out
  // to the brass card, so the whole thing is a single pass of emerald.
  const oneInk = { ...spec, bodyColor: ink, textColor: INSERT_BRASS, borderColor: ink };
  const family = `${BB_ANTON}, ${BB_ARCHIVO_BLACK}, sans-serif`;

  const makeFace = (key: 'spine' | 'front' | 'back', fw: number, fh: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = fw;
    canvas.height = fh;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const paint = () => {
      const c = canvas.getContext('2d')!;
      const W = canvas.width, H = canvas.height;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = INSERT_BRASS;
      c.fillRect(0, 0, W, H);
      // Printed border rule, inset like a card's trim.
      c.strokeStyle = INSERT_EDGE;
      c.lineWidth = Math.max(1, H * 0.006);
      c.strokeRect(W * 0.04, H * 0.02, W * 0.92, H * 0.96);
      c.fillStyle = ink;
      c.textBaseline = 'alphabetic';

      if (key === 'spine') {
        // The rental line reading bottom→top up the spine.
        const line = brandString('clamshell-spine-line', 'NEW RELEASE');
        c.save();
        c.translate(W * 0.62, H * 0.94);
        c.rotate(-Math.PI / 2);
        c.textAlign = 'left';
        fitLine(c, line, family, Math.round(W * 0.5), H * 0.86);
        c.fillText(line, 0, 0);
        c.restore();
      } else if (key === 'front') {
        // The terms, then the emblem under them.
        c.textAlign = 'left';
        const hx = Math.round(W * 0.11);
        const maxW = W * 0.78;
        const l1 = brandString('clamshell-lid-line', '2-EVENING NEW RELEASE RENTAL');
        const l2 = brandString('clamshell-lid-sub', 'DUE BACK TOMORROW, MIDNIGHT');
        fitLine(c, l1, family, Math.round(H * 0.05), maxW);
        c.fillText(l1, hx, Math.round(H * 0.15));
        fitLine(c, l2, family, Math.round(H * 0.031), maxW);
        c.fillText(l2, hx, Math.round(H * 0.19));
        drawLogo(c, oneInk, { x: W * 0.06, y: H * 0.28, w: W * 0.88, h: H * 0.44 });
      } else {
        // Back: the house line, small, centred under the trim rule.
        c.textAlign = 'center';
        const line = brandString('brand-wordmark-video', 'HALCYON VIDEO');
        fitLine(c, line, family, Math.round(H * 0.035), W * 0.7);
        c.fillText(line, W / 2, Math.round(H * 0.12));
      }
      tex.needsUpdate = true;
    };
    paint();
    return { tex, paint };
  };

  const spine = makeFace('spine', 64, 512);
  const front = makeFace('front', 512, 1024);
  const back = makeFace('back', 512, 1024);

  const gloss = { roughness: 0.22, metalness: 0.0 };
  // Black molded clamshell edges, same as the standard rental case — only the
  // printed insert changes.
  const edge = new THREE.MeshStandardMaterial({ color: 0x141417, roughness: 0.5, metalness: 0.0 });
  const mats: THREE.Material[] = [
    edge,
    new THREE.MeshStandardMaterial({ map: spine.tex, ...gloss }),
    edge,
    edge,
    new THREE.MeshStandardMaterial({ map: front.tex, ...gloss }),
    new THREE.MeshStandardMaterial({ map: back.tex, ...gloss }),
  ];
  goldSet = {
    mats,
    repaint: () => { spine.paint(); front.paint(); back.paint(); },
  };
  return goldSet;
}

/**
 * The shared insert-case material array ([edge, spine, edge, edge, front,
 * back]) — same group order as getGlobalBackMaterials, so the NR wall's
 * instanced back-box meshes (and the hero rental copy) can wear it directly.
 */
export function getGoldCaseMaterials(): THREE.Material[] {
  return getGoldMaterials().mats;
}

/** Repaint the printed faces (the display face may resolve late). */
export function repaintGoldCase(): void {
  if (goldSet) goldSet.repaint();
}

/** One brass clamshell mesh (shared printed materials). */
export function createGoldCaseMesh(): THREE.Mesh {
  const set = getGoldMaterials();
  const mesh = new THREE.Mesh(getRentalCaseGeometry(false), set.mats);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Legacy no-op. The gold case used to spawn only behind the NR display box
 * of each title in the active rental record; per user direction the case now
 * stands behind EVERY New Releases item (the wall back-box meshes wear the
 * gold materials — see store-stock.ts), which also removes the old filler's
 * clip into the wall backing. Kept as a callable stub so stock rebuilds and
 * the return-chute teardown keep their existing call sites.
 */
export function buildGoldClamshellFillers(scene: StoreScene): void {
  removeGoldClamshellFillers(scene); // clear any legacy group from an older boot
}

/** The tapes are dropping back into the chute — clear their shelf markers. */
export function removeGoldClamshellFillers(scene: StoreScene): void {
  const group = scene.scene.getObjectByName(GROUP_NAME) as THREE.Group | null;
  if (!group) return;
  group.parent?.remove(group);
  // Geometry + materials are SHARED (video-case rental geo, module gold set)
  // — nothing to dispose per teardown; the group just leaves the graph.
  const idx = scene.activeSignageObjects.indexOf(group);
  if (idx >= 0) scene.activeSignageObjects.splice(idx, 1);
  scene.requestRender();
}

// ── Void-viewer fixture (assetshot --kind fixture --name gold-clamshell) ────
export class GoldClamshellDisplay implements StoreFixture {
  public placement: FixturePlacement;
  private ctx: FixtureContext;
  private mesh: THREE.Mesh | null = null;

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
  }

  build(): void {
    const p = this.placement.position;
    this.mesh = createGoldCaseMesh();
    this.mesh.position.set(p.x, 0.4, p.z);
    this.mesh.rotation.y = this.placement.yaw;
    this.ctx.scene.add(this.mesh);
  }

  update(_timeMs: number): void { /* static prop; repaints are self-scheduled */ }

  dispose(): void {
    if (this.mesh) {
      this.mesh.parent?.remove(this.mesh);
      this.mesh = null;
    }
  }

  getFootprint(): null { return null; }
}
