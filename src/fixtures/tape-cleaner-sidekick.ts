import * as THREE from 'three';
import { installCleanerCartons, CLEANER_CARTON } from './cleaner-carton';
import { createCleanerFaceTexture } from './period-fixtures';
import { installDisplayModel } from './display-model';
import { retailFixtureFootprint } from '../retail-fixture-specs';
import { getActiveTheme, themeTrimDarkHex } from '../themes';
import { inSeason } from '../promo-campaigns';
import type { FixtureContext, StoreFixture } from '../fixtures';
import type { FixturePlacement } from '../store-layout';
import type { Footprint } from '../layout-validator';

/**
 * Floor-standing head-cleaner sidekick (#199): slatwall riser, rounded posts,
 * clear carton trays and a chamfered base. Model: tools/models/tape-cleaner-sidekick.py.
 * Stock is the shared #181 carton, centred on TIER matrices (feet, local frame
 * mirrors the script's TIER metrics). In December a plain gift tag hangs on the
 * header, matching the holiday gate the collection endcap uses.
 */
const TIER_TRAY_Y = [0.9, 1.8, 2.7, 3.6];
const COLS_X = [-0.63, -0.21, 0.21, 0.63];
const CARTON_Z = -0.27;
const HEADER_Y = 4.675, HEADER_Z = -0.29 + 0.025 + 0.002;

export class TapeCleanerSidekick implements StoreFixture {
  private group: THREE.Group | null = null;
  private owned: Array<{ dispose(): void }> = [];
  private collider: THREE.Mesh | null = null;
  private removeModel: (() => void) | null = null;
  private removeCartons: (() => void) | null = null;

  constructor(public placement: FixturePlacement, private ctx: FixtureContext) {}

  build(): void {
    this.dispose();
    const group = this.group = new THREE.Group();
    group.name = this.placement.id;
    group.position.set(this.placement.position.x, 0, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    const own = <T extends { dispose(): void }>(o: T): T => { this.owned.push(o); return o; };
    const theme = getActiveTheme();

    // Loading fallback: plain boxes with the same envelope.
    const fallback = new THREE.Group();
    group.add(fallback);
    const darkMat = own(new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.6 }));
    const slatMat = own(new THREE.MeshStandardMaterial({ color: 0xe0ded6, roughness: 0.45 }));
    const trayMat = own(new THREE.MeshStandardMaterial({ color: 0xd8eaf2, roughness: 0.1, transparent: true, opacity: 0.3 }));
    const box = (p: [number, number, number], d: [number, number, number], m: THREE.Material) => {
      const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(...d)), m);
      mesh.position.set(...p); mesh.castShadow = mesh.receiveShadow = true; fallback.add(mesh);
    };
    box([0, 0.2, 0], [2.0, 0.4, 1.0], darkMat);
    box([0, 2.7, -0.42], [1.72, 4.6, 0.08], slatMat);
    for (const y of TIER_TRAY_Y) box([0, y - 0.02, -0.27], [1.56, 0.04, 0.22], trayMat);

    // Header: theme-colour board; the model's header role takes the same finish.
    const headerMat = own(new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.palette.primary), roughness: 0.5 }));
    headerMat.name = 'SidekickHeader';
    box([0, HEADER_Y, -0.29], [1.5, 0.65, 0.05], headerMat);

    // Collision proxy covers the whole envelope.
    const proxy = new THREE.Mesh(own(new THREE.BoxGeometry(2.1, 5.2, 1.0)),
      own(new THREE.MeshBasicMaterial({ visible: false })));
    proxy.name = `${this.placement.id}-collision`;
    proxy.position.y = 2.6;
    group.add(proxy);
    this.collider = proxy;

    // Cartons on the shared contract, instanced once for all tiers.
    const tex = createCleanerFaceTexture(() => this.ctx.requestRender());
    own(tex);
    const faceMat = own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    const caseMat = own(new THREE.MeshStandardMaterial({ color: new THREE.Color(themeTrimDarkHex(theme)), roughness: 0.55 }));
    const boxGeo = own(new THREE.BoxGeometry(CLEANER_CARTON.width, CLEANER_CARTON.height, CLEANER_CARTON.depth));
    const count = TIER_TRAY_Y.length * COLS_X.length;
    const inst = new THREE.InstancedMesh(boxGeo, [caseMat, caseMat, caseMat, caseMat, faceMat, caseMat], count);
    inst.name = 'cleaner-carton-fallback';
    inst.castShadow = inst.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (const ty of TIER_TRAY_Y) for (const x of COLS_X) {
      m4.makeTranslation(x, ty + CLEANER_CARTON.height / 2, CARTON_Z);
      inst.setMatrixAt(i++, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
    own({ dispose: () => inst.dispose() });

    // Holiday tag: December only (same gate as the collection endcap's kit).
    if (inSeason('holiday')) {
      const tag = new THREE.Mesh(own(new THREE.BoxGeometry(0.34, 0.2, 0.01)),
        own(new THREE.MeshStandardMaterial({ color: 0xb3202a, roughness: 0.6 })));
      tag.name = 'holiday-tag';
      tag.position.set(0.6, HEADER_Y - 0.05, HEADER_Z + 0.04);
      tag.rotation.z = -0.12;
      group.add(tag);
    }

    this.ctx.scene.add(group);
    this.ctx.addCollider(proxy);
    this.removeCartons = installCleanerCartons(group, inst, { front: tex },
      new THREE.Color(theme.palette.primary), () => { this.ctx.requestShadowRefresh(); this.ctx.requestRender(); });
    this.removeModel = installDisplayModel(this.ctx, group, fallback,
      'models/tape-cleaner-sidekick.glb', { SidekickHeader: headerMat });
    this.ctx.requestShadowRefresh();
    this.ctx.requestRender();
  }

  getFootprint(): Footprint | null {
    return retailFixtureFootprint('tape-cleaner-sidekick', this.placement);
  }

  update(): void {}

  dispose(): void {
    this.removeCartons?.(); this.removeCartons = null;
    this.removeModel?.(); this.removeModel = null;
    if (this.collider) this.collider.raycast = () => {};
    this.collider = null;
    this.group?.removeFromParent();
    this.group = null;
    this.owned.forEach(o => o.dispose());
    this.owned = [];
  }
}
