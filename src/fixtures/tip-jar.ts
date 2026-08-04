// The tip jar — a cup and a 5-inch card on the checkout counter's band top.
//
// This is a NEW sign for a fictional chain, so there is no reference photo to
// rectify against: nothing about it is a recreation of a real object, and the
// six signage rules' measure-the-reference machinery has nothing to measure.
// What still binds is the spirit of rule 1 — it was gated before the owner saw
// it (`npm run assetshot -- --kind fixture --name tip-jar`, and in place at the
// counter) — and the era-plausibility bar: a manager's card by the register in
// house colors, cup-sized, matte, unlit. A glowing "DONATE" panel would be the
// invented-exit-clock failure with a payment link attached.
//
// It is also the one fixture that can be switched off from settings
// (`bb_tip_jar`, default on): the same build runs on a family TV, and the owner
// gets to decide whether their living room carries an ask.
//
// Interaction lives on the fixture: `hitTest` answers "did this raycast hit
// me?" for walk-mode clicks (store-walk.ts), and the counter's Right press
// reaches it through StoreScene (store-checkout.ts). Both open the same overlay
// from src/tip-jar.ts.
import * as THREE from 'three';
import { FixturePlacement } from '../store-layout';
import { FixtureContext, StoreFixture } from '../fixtures';
import { Footprint } from '../layout-validator';
import { markSignMesh } from '../sign-builders';
import { getActiveTheme, themeTrimDarkHex } from '../themes';
import { ensureTipCardFont, paintTipCardCanvas, TIP_CARD_ASPECT, tipJarEnabled } from '../tip-jar';

type Disposable = { geo?: THREE.BufferGeometry; mat?: THREE.Material; tex?: THREE.Texture };

// Feet. A 4 in cup and a 5 x 4 in card — the card is the readable object, the
// cup is what makes it a tip jar rather than a poster.
const CUP_R_TOP = 0.165;
const CUP_R_BOT = 0.135;
const CUP_H = 0.36;
const CARD_W = 0.5;           // 6 in
const CARD_H = CARD_W / TIP_CARD_ASPECT;
const CARD_T = 0.012;
const CARD_LEAN = 0.20;       // rad — an easel card leans back about 11 deg
// They stand SIDE BY SIDE, not card-behind-cup: a 4 in card behind a 4.3 in
// cup is a card nobody can read (first build, caught in the counter shot).
const CUP_X = -0.34;
const CARD_X = 0.26;
const CARD_TEX_W = 1024;

export class TipJar implements StoreFixture {
  public placement: FixturePlacement;

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private disposables: Disposable[] = [];
  private cardTex: THREE.CanvasTexture | null = null;
  /** Everything a walk-mode raycast may legitimately land on. */
  private targets: THREE.Object3D[] = [];

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;
  }

  build(): void {
    if (!tipJarEnabled()) return;
    const options = this.placement.options || {};
    // Same convention as the rewinder and the cleaner display: the counter is
    // built after fixtures are placed, so the surface height is a constant, not
    // a live anchor. 3.4 ft band + 0.14 ft cap = the band top.
    const surfaceY = typeof options.surfaceY === 'number' ? options.surfaceY : 3.54;

    const theme = getActiveTheme();
    const group = new THREE.Group();
    group.position.set(this.placement.position.x, surfaceY, this.placement.position.z);
    group.rotation.y = this.placement.yaw;
    this.group = group;

    // ── The mug ────────────────────────────────────────────────────────────
    // Glazed stoneware in the house color with a brass band under the lip and
    // a HANDLE: a staff mug the store already owned, not a merchandised
    // object. The handle is what makes it read as a mug — the first pass was a
    // plain tapered cylinder and looked like a wastebasket on the counter.
    const cupGeo = new THREE.CylinderGeometry(CUP_R_TOP, CUP_R_BOT, CUP_H, 24, 1, true);
    const cupMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.palette.primary),
      roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide,
    });
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.position.set(CUP_X, CUP_H / 2, 0);
    cup.castShadow = true;
    cup.receiveShadow = true;
    group.add(cup);
    this.disposables.push({ geo: cupGeo, mat: cupMat });

    // Bottom, so the open cylinder isn't see-through from a low angle.
    const floorGeo = new THREE.CircleGeometry(CUP_R_BOT, 24);
    const floorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(themeTrimDarkHex(theme)), roughness: 0.9,
    });
    const cupFloor = new THREE.Mesh(floorGeo, floorMat);
    cupFloor.rotation.x = -Math.PI / 2;
    cupFloor.position.set(CUP_X, 0.012, 0);
    group.add(cupFloor);
    this.disposables.push({ geo: floorGeo, mat: floorMat });

    // Torus lies in XY by default and its arc starts at +X, so the gap
    // (1.15pi..2pi, centred at 1.575pi) is spun round to face the body.
    const handleGeo = new THREE.TorusGeometry(CUP_H * 0.30, 0.024, 8, 16, Math.PI * 1.15);
    const handle = new THREE.Mesh(handleGeo, cupMat);
    handle.position.set(CUP_X - CUP_R_TOP * 0.92, CUP_H * 0.52, 0);
    handle.rotation.set(0, 0, Math.PI * 0.425);
    handle.castShadow = true;
    group.add(handle);
    this.disposables.push({ geo: handleGeo });

    const bandGeo = new THREE.CylinderGeometry(CUP_R_TOP * 1.01, CUP_R_TOP * 1.01, CUP_H * 0.09, 24, 1, true);
    const bandMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(theme.palette.secondary),
      roughness: 0.4, metalness: 0.35, side: THREE.DoubleSide,
    });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(CUP_X, CUP_H * 0.82, 0);
    band.receiveShadow = true;
    group.add(band);
    this.disposables.push({ geo: bandGeo, mat: bandMat });

    // Two folded bills standing out of the mouth. Coins at the bottom of a
    // 4 in mug are invisible from standing height; this is the read that says
    // "someone already tipped" at a glance, and it is the whole reason the
    // fixture doesn't need a second line of copy explaining itself.
    const billGeo = new THREE.PlaneGeometry(0.12, 0.17);
    const billMat = new THREE.MeshStandardMaterial({
      color: 0xd9dcc4, roughness: 0.95, side: THREE.DoubleSide,
    });
    for (const [dx, dz, tilt, spin] of [[-0.05, 0.03, 0.34, 0.45], [0.045, -0.03, -0.40, -0.8]]) {
      const bill = new THREE.Mesh(billGeo, billMat);
      bill.position.set(CUP_X + dx, CUP_H * 1.02, dz);
      bill.rotation.set(tilt, spin, 0);
      bill.receiveShadow = true;
      group.add(bill);
    }
    this.disposables.push({ geo: billGeo, mat: billMat });

    // ── The card ───────────────────────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.width = CARD_TEX_W;
    canvas.height = Math.round(CARD_TEX_W / TIP_CARD_ASPECT);
    paintTipCardCanvas(canvas);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.cardTex = tex;
    // Archivo registers async; the first paint uses the fallback face and this
    // repaints in place when it lands (same contract as the fascia blades).
    ensureTipCardFont(() => {
      if (!this.group || !this.cardTex) return;
      paintTipCardCanvas(this.cardTex.image as HTMLCanvasElement);
      this.cardTex.needsUpdate = true;
      this.ctx.requestRender();
    });

    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.0 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.9 });
    const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T);
    // BoxGeometry face order (+x, -x, +y, -y, +z, -z): the print is on +Z, the
    // face the placement's yaw points at.
    const card = markSignMesh(
      new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, edgeMat]),
      { casts: true },
    );
    card.position.set(CARD_X, CARD_H / 2 * Math.cos(CARD_LEAN) + 0.01, 0);
    card.rotation.x = -CARD_LEAN;
    group.add(card);
    this.disposables.push({ geo: cardGeo, mat: faceMat, tex }, { mat: edgeMat });

    // A wire easel leg so the card isn't floating at a lean.
    const legGeo = new THREE.BoxGeometry(0.02, CARD_H * 0.72, 0.02);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.45, metalness: 0.6 });
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(CARD_X, CARD_H * 0.34, -CARD_H * 0.30);
    leg.rotation.x = 0.42;
    leg.castShadow = true;
    group.add(leg);
    this.disposables.push({ geo: legGeo, mat: legMat });

    this.targets = [cup, band, card];
    this.ctx.scene.add(group);
    this.ctx.requestShadowRefresh();
  }

  /** False when `bb_tip_jar` is off: the fixture exists, the jar does not. */
  hasArt(): boolean {
    return this.targets.length > 0;
  }

  /** True when a walk-mode raycast hit belongs to this fixture. */
  hitTest(object: THREE.Object3D): boolean {
    return this.targets.some((t) => t === object);
  }

  // Sits ON the counter band (see build()'s surfaceY), like the rewinder and
  // the cleaner display: no floor footprint of its own.
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
    this.targets = [];
    this.cardTex = null; // disposed via `disposables`
    for (const d of this.disposables) {
      d.geo?.dispose();
      d.mat?.dispose();
      d.tex?.dispose();
    }
    this.disposables = [];
  }
}
