import * as THREE from 'three';
import type { FixturePlacement } from '../store-layout';
import type { FixtureContext, StoreFixture } from '../fixtures';
import { installDisplayModel } from './display-model';
import { drawLogo } from '../logo-renderer';
import { getActiveLogoSpec } from '../logo-spec';
import { BB_OUTFIT, bundledFontsReady } from '../bundled-fonts';

/** #280: crop-relative study. No floor/counter placement until reference resolves it. */
export class CustomerInformationTerminal implements StoreFixture {
  private group: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private removeModel: (() => void) | null = null;
  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}

  build(): void {
    this.dispose();
    // Explicit viewer opt-in; a registry entry alone must never populate the store.
    if (this.placement.options?.assetViewer !== true) return;
    const group = this.group = new THREE.Group();
    group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    group.userData.placementConfirmed = false;
    const own = <T extends { dispose(): void }>(value: T): T => { this.owned.push(value); return value; };
    const material = (name: string, color: THREE.ColorRepresentation) => {
      const m = own(new THREE.MeshStandardMaterial({ color, roughness: .55 }));
      m.name = name; return m;
    };
    const shell = material('EnclosurePowderCoat', '#cdd0d1');
    const board = material('ProgramBackboard', this.ctx.activeTheme.palette.primary);
    const badge = material('PromotionalBadge', this.ctx.activeTheme.palette.secondary);
    const black = material('DisplayEnvelope', '#17191b');
    const fallback = new THREE.Group(); group.add(fallback);
    const box = (parent: THREE.Group, name: string, pos: number[], size: number[], m: THREE.Material) => {
      const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(size[0], size[1], size[2])), m);
      mesh.name = name; mesh.position.set(pos[0], pos[1], pos[2]); mesh.castShadow = true;
      parent.add(mesh); return mesh;
    };
    for (const x of [-.79, .79]) box(fallback, 'SideEnvelope', [x, .675, -.195], [.006, 1.35, .42], shell);
    box(fallback, 'RearEnvelope', [0, .675, -.408], [1.586, 1.35, .006], shell);
    box(fallback, 'ProgramBackboard', [-.07, 1.585, -.344], [1.58, .47, .025], board);
    const disc = new THREE.Mesh(own(new THREE.CylinderGeometry(.34, .34, .018, 48)), badge);
    disc.rotation.x = Math.PI / 2; disc.position.set(.59, 1.67, -.297); fallback.add(disc);

    // An explicitly generic display envelope, NOT #189's absent model and NOT
    // evidence of a monitor rather than laptop. The future device owns its base.
    const display = new THREE.Group(); display.name = 'mount_display';
    display.position.set(0, .76, -.035); group.add(display);
    box(display, 'UnconfirmedDisplayEnvelope', [0, 0, .012], [1.40, .93, .045], black);
    const screenMat = own(new THREE.MeshBasicMaterial({ color: '#162533' }));
    screenMat.name = 'CustomerInformationScreen';
    const screen = new THREE.Mesh(own(new THREE.PlaneGeometry(1.26, .79)), screenMat);
    screen.name = 'ReplaceableScreen'; screen.position.z = .036; display.add(screen);

    const makeFace = (name: string, width: number, height: number, pos: number[], round = false) => {
      const m = own(new THREE.MeshBasicMaterial({ transparent: true })); m.name = name;
      const geo = own(round ? new THREE.CircleGeometry(width / 2, 48) : new THREE.PlaneGeometry(width, height));
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(pos[0], pos[1], pos[2]); group.add(mesh);
      return m;
    };
    const programFace = makeFace('ProgramPrint', 1.56, .45, [-.07, 1.585, -.330]);
    const badgeFace = makeFace('BadgePrint', .66, .66, [.59, 1.67, -.286], true);
    this.ctx.scene.add(group);
    // Fonts load once; a stale callback must not allocate textures after teardown.
    void bundledFontsReady().then(() => {
      if (this.group !== group) return;
      const paint = (m: THREE.MeshBasicMaterial, w: number, h: number,
        draw: (c: CanvasRenderingContext2D) => void) => {
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const c = canvas.getContext('2d'); if (!c) return;
        draw(c);
        const texture = own(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace;
        m.map = texture; m.color.set('white'); m.needsUpdate = true;
      };
      paint(screenMat, 640, 400, c => {
        c.fillStyle = '#162533'; c.fillRect(0, 0, 640, 400);
        c.fillStyle = '#f0f3f5'; c.font = `36px ${BB_OUTFIT}`;
        c.fillText('Customer information', 36, 85);
        c.font = `24px ${BB_OUTFIT}`;
        c.fillText('Discover your next movie.', 36, 170);
        c.fillText('Ask our team for assistance.', 36, 220);
      });
      paint(programFace, 768, 220, c => {
        drawLogo(c, getActiveLogoSpec(this.ctx.activeTheme), { x: 20, y: 25, w: 260, h: 130 });
        c.fillStyle = '#ffffff'; c.font = `26px ${BB_OUTFIT}`; c.fillText('CUSTOMER', 300, 92); c.fillText('INFORMATION', 300, 134);
      });
      paint(badgeFace, 256, 256, c => {
        c.fillStyle = '#162533'; c.font = `32px ${BB_OUTFIT}`; c.textAlign = 'center';
        c.fillText('WELCOME', 128, 139);
      });
      this.ctx.requestRender();
    });
    this.removeModel = installDisplayModel(this.ctx, group, fallback,
      'models/customer-information-terminal.glb', {
        EnclosurePowderCoat: shell, ProgramBackboard: board, PromotionalBadge: badge,
      });
    this.ctx.requestShadowRefresh(); this.ctx.requestRender();
  }
  // This datum has no established floor relationship. No invisible floor obstacle.
  getFootprint(): null { return null; }
  update(): void {}
  dispose(): void {
    this.removeModel?.(); this.removeModel = null;
    const wasBuilt = this.group !== null;
    this.group?.removeFromParent(); this.group = null;
    this.owned.forEach(o => o.dispose()); this.owned = [];
    if (wasBuilt) { this.ctx.requestShadowRefresh(); this.ctx.requestRender(); }
  }
}
