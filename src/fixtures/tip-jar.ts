// The tip jar — a cup, and a 12-inch card in a slant-back acrylic sign holder,
// on the checkout counter's band top.
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
import { addGlassReflectionPane } from '../glass-reflection';
import { getActiveTheme, themeTrimDarkHex } from '../themes';
import { ensureTipCardFont, paintTipCardCanvas, TIP_CARD_ASPECT, tipJarEnabled } from '../tip-jar';

type Disposable = { geo?: THREE.BufferGeometry; mat?: THREE.Material; tex?: THREE.Texture };

// Feet. A 4 in cup and a 5 x 4 in card — the card is the readable object, the
// cup is what makes it a tip jar rather than a poster.
const CUP_R_TOP = 0.165;
const CUP_R_BOT = 0.135;
const CUP_H = 0.36;
// Feedback pin 060: "this tips thing needs to be bigger. it is too small to
// scan the code... maybe with an acryllic stand and face". So the print goes
// to 12 x 9.6 in (was 9 in wide after GH #10, 6 in before that) and the wire
// easel behind it becomes the object a register actually holds a notice in: a
// slant-back acrylic sign holder, the print sandwiched between a leaning back
// panel and a clear front face, standing on its own foot.
//
// 12 in is where this stops: it is the widest landscape insert the stock
// countertop holders take, and the fixture has to share the band top with the
// mug without either crowding the other (see CUP_X/CARD_X below). Scanning the
// QR off the TV is not what this size buys — no counter prop is scannable from
// a couch, which is what the full-screen overlay (► at the counter,
// src/tip-jar.ts) is for. What it buys is a notice you can READ from where a
// customer stands, which is what the pin asked of the object itself.
const CARD_W = 1.0;
const CARD_H = CARD_W / TIP_CARD_ASPECT;
const CARD_T = 0.012;
const CARD_LEAN = 0.20;       // rad — an easel card leans back about 11 deg
// The holder around the print: margin on each side, a deeper one at the
// bottom for the lip the insert rests on, and a foot running back under it.
const HOLDER_SIDE_PAD = 0.05;
const HOLDER_TOP_PAD = 0.03;
const HOLDER_LIP_H = 0.07;
const PANEL_W = CARD_W + HOLDER_SIDE_PAD * 2;
const PANEL_H = CARD_H + HOLDER_LIP_H + HOLDER_TOP_PAD;
const ACRYLIC_T = 0.022;      // 1/4 in sheet
const FOOT_D = 0.34;
// They stand SIDE BY SIDE, not card-behind-cup: a 4 in card behind a 4.3 in
// cup is a card nobody can read (first build, caught in the counter shot).
// Pushed further apart again as the print grew to 12 in (pin 060): the cup
// nudges left, the holder nudges right, so the gap between the cup's band and
// the holder's near edge stays ~3 in — wider than the 9 in card ever had.
const CUP_X = -0.46;
const CARD_X = 0.45;
const CARD_TEX_W = 1536;

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

    // ── The acrylic holder ─────────────────────────────────────────────────
    // A slant-back countertop sign holder (pin 060). Everything that leans
    // lives in one group tilted about X, so the panel, the print, the lip and
    // the front face share a frame and cannot drift apart: inside it +Y runs
    // up the panel and +Z out of its face, toward the customer.
    //
    // The acrylic is the store's ONE unlit-looking material by physical
    // right — clear plastic — so it is built the way the rest of the store's
    // glazing is: a nearly transmissive body carrying no diffuse colour of its
    // own, with the reflection added ON TOP as an additive pane
    // (glass-reflection.ts). A flat 50%-white slab was tried first and read as
    // fog over the print, which is exactly the failure that recipe exists to
    // prevent.
    const acrylicMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.14,
      roughness: 0.06,
      metalness: 0.0,
      ior: 1.49,               // acrylic, not glass (1.52)
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.disposables.push({ mat: acrylicMat });

    const holder = new THREE.Group();
    // Sits ON its own foot, hence the foot's thickness in Y.
    holder.position.set(CARD_X, ACRYLIC_T, 0);
    holder.rotation.x = -CARD_LEAN;
    group.add(holder);

    // Back panel: the sheet the print is held against.
    const backGeo = new THREE.BoxGeometry(PANEL_W, PANEL_H, ACRYLIC_T);
    const backPanel = new THREE.Mesh(backGeo, acrylicMat);
    backPanel.position.set(0, PANEL_H / 2, -ACRYLIC_T / 2 - 0.001);
    holder.add(backPanel);
    this.disposables.push({ geo: backGeo });

    // The print itself, resting on the lip.
    // BoxGeometry face order (+x, -x, +y, -y, +z, -z): the print is on +Z, the
    // face the placement's yaw points at.
    const card = markSignMesh(
      new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, edgeMat]),
      { casts: true },
    );
    card.position.set(0, HOLDER_LIP_H + CARD_H / 2, CARD_T / 2 + 0.001);
    holder.add(card);
    this.disposables.push({ geo: cardGeo, mat: faceMat, tex }, { mat: edgeMat });

    // Front face: the clear sheet over the print, and the reflection that
    // makes it read as one. Kept off the print's own +Z by a hair so the two
    // never z-fight at grazing angles.
    const faceGeo = new THREE.PlaneGeometry(CARD_W + 0.04, CARD_H + 0.04);
    const frontFace = new THREE.Mesh(faceGeo, acrylicMat);
    frontFace.position.set(0, HOLDER_LIP_H + CARD_H / 2, CARD_T + 0.006);
    frontFace.renderOrder = 2;
    holder.add(frontFace);
    addGlassReflectionPane(frontFace, holder, { envMapIntensity: 1.1, roughness: 0.04 });
    this.disposables.push({ geo: faceGeo });

    // The lip the insert stands on — the visible tell that this is a holder
    // with something slotted into it rather than a card glued to a sheet.
    const lipGeo = new THREE.BoxGeometry(PANEL_W, 0.016, 0.034);
    const lip = new THREE.Mesh(lipGeo, acrylicMat);
    lip.position.set(0, HOLDER_LIP_H - 0.008, 0.017);
    holder.add(lip);
    this.disposables.push({ geo: lipGeo });

    // Foot: the flat sheet the panel rises from, running back under the lean.
    // Flat on the band top, so it is NOT part of the leaning group.
    const footGeo = new THREE.BoxGeometry(PANEL_W, ACRYLIC_T, FOOT_D);
    const foot = new THREE.Mesh(footGeo, acrylicMat);
    foot.position.set(CARD_X, ACRYLIC_T / 2, -FOOT_D / 2 + 0.03);
    group.add(foot);
    this.disposables.push({ geo: footGeo });

    // The holder is as clickable as the card: in walk mode you point at the
    // object, not at the 12 in of print inside it.
    this.targets = [cup, band, card, backPanel, frontFace, foot];
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
