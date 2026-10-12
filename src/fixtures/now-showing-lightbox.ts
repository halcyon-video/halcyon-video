// Hanging double-sided NOW SHOWING poster lightbox (#242). Gold moulded frame with
// real bulb sockets, a hollow lit box, rods to the ceiling and a separate header
// plaque on straps. Geometry: tools/models/now-showing-lightbox.py (Blender source
// .blend beside it); contract in docs/now-showing-lightbox-model.md.
// Posters are caller-owned planes inside the model's window, so the GLB carries
// no artwork. The frame hangs clear of the floor; nothing sits beneath it.
import * as THREE from 'three';
import { FixturePlacement } from '../store-layout';
import { FixtureContext, StoreFixture } from '../fixtures';
import { installDisplayModel } from './display-model';
import { assetUrl } from '../asset-url';
import { loadDecorPosterTexture } from '../video-case';
import { themeTrimDarkHex } from '../themes';

export const LIGHTBOX_POSTER_W = 1.8;
export const LIGHTBOX_POSTER_H = 2.7;
/** Poster window centre height: the frame's lowest edge clears 6.9 ft. */
export const LIGHTBOX_ORIGIN_Y = 8.57;
/** Rod start (top of the frame) above the origin; rods stretch from here to the ceiling. */
const ROD_BASE = 1.67;
const POSTER_Z = .17;

export class NowShowingLightbox implements StoreFixture {
  private root: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  private disposed = false;
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}

  build(): void {
    this.dispose(); this.disposed = false;
    const { ceilingY, activeTheme } = this.ctx;
    const rodLen = ceilingY - LIGHTBOX_ORIGIN_Y - ROD_BASE;
    if (rodLen < 1.2) return; // no room to hang the plaque and rods
    const themes = this.placement.options?.themes as string[] | undefined;
    if (themes?.length && !themes.includes(activeTheme.id)) return;
    const own = <T extends { dispose(): void }>(v: T): T => { this.owned.push(v); return v; };
    const root = this.root = new THREE.Group(); root.name = this.placement.id;
    root.position.set(this.placement.position.x, LIGHTBOX_ORIGIN_Y, this.placement.position.z);
    root.rotation.y = this.placement.yaw;

    const gold = own(new THREE.MeshStandardMaterial({ color: 0x9e6b1e, metalness: .85, roughness: .32 }));
    const steel = own(new THREE.MeshStandardMaterial({ color: 0x737378, metalness: .8, roughness: .35 }));
    const shell = own(new THREE.MeshStandardMaterial({ color: 0x121010, roughness: .6 }));
    // Header plaque face: theme-keyed field with the house secondary as lettering.
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const g = canvas.getContext('2d')!;
    g.fillStyle = themeTrimDarkHex(); g.fillRect(0, 0, 512, 96);
    g.fillStyle = activeTheme.palette.secondary; g.font = 'bold 58px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NOW SHOWING', 256, 52);
    const plaqueTex = own(new THREE.CanvasTexture(canvas)); plaqueTex.colorSpace = THREE.SRGBColorSpace; plaqueTex.flipY = false; // glTF UV convention
    const plaque = own(new THREE.MeshStandardMaterial({ name: 'PlaqueFace', map: plaqueTex, roughness: .5 }));

    // Built-in fallback: shown until the GLB arrives (or forever if it never does).
    const fallback = new THREE.Group(); root.add(fallback);
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z = 0) => {
      const geo = own(new THREE.BoxGeometry(w, h, d)); const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z); mesh.castShadow = true; fallback.add(mesh); return mesh;
    };
    box(2.44, .27, .5, gold, 0, 1.535); box(2.44, .27, .5, gold, 0, -1.535);
    box(.27, 3.4, .5, gold, -1.075, 0); box(.27, 3.4, .5, gold, 1.075, 0);
    box(1.9, 2.8, .01, shell, 0, 0);
    for (const sx of [-1, 1]) box(.036, rodLen, .036, steel, sx, ROD_BASE + rodLen / 2);
    box(1.8, .42, .07, plaque, 0, 2.28);

    const group = new THREE.Group(); group.name = 'now-showing-posters'; root.add(group);
    const posterMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const posterGeo = own(new THREE.PlaneGeometry(LIGHTBOX_POSTER_W, LIGHTBOX_POSTER_H));
    const front = new THREE.Mesh(posterGeo, posterMat); front.position.z = POSTER_Z;
    const back = new THREE.Mesh(posterGeo, posterMat); back.position.z = -POSTER_Z; back.rotation.y = Math.PI;
    front.name = 'poster-front'; back.name = 'poster-back';
    group.add(front, back);
    const movie = this.ctx.libraries.flatMap(l => l.movies).find(m => m.posterUrl);
    if (movie) {
      loadDecorPosterTexture(movie, tex => {
        if (this.disposed) return;
        posterMat.map = tex; posterMat.needsUpdate = true; this.ctx.requestRender();
      });
    } else {
      new THREE.TextureLoader().load(assetUrl('latest_movie_poster.png'), tex => {
        if (this.disposed) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace; posterMat.map = tex; posterMat.needsUpdate = true;
        this.owned.push(tex); this.ctx.requestRender();
      });
    }

    this.ctx.scene.add(root);
    this.removeModel = installDisplayModel(this.ctx, root, fallback, 'models/now-showing-lightbox.glb',
      { PlaqueFace: plaque }, new THREE.Vector3(1, 1, 1), model => {
        model.traverse(o => {
          if (o.name === 'Rod_L' || o.name === 'Rod_R') o.scale.y = rodLen;
          if (o.name === 'Canopy_L' || o.name === 'Canopy_R') o.position.y = ceilingY - LIGHTBOX_ORIGIN_Y - .025;
        });
      });
    root.addEventListener('removed', this.onRemoved);
    this.ctx.requestShadowRefresh(); this.ctx.requestRender();
  }

  private onRemoved = () => this.dispose();
  update(): void { /* static */ }
  getFootprint() { return null; }

  dispose(): void {
    this.disposed = true;
    this.removeModel?.(); this.removeModel = null;
    const root = this.root; this.root = null;
    if (root) { root.removeEventListener('removed', this.onRemoved); root.removeFromParent(); }
    this.owned.forEach(o => o.dispose()); this.owned = [];
  }
}
