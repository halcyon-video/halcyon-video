// Four-sided mirrored column — a clad structural pillar standing in the open
// sales floor, every face a mirror.
//
// These were a fixture of the real chains: a building's structural column is
// unavoidable and visually dead, so it gets clad floor-to-ceiling in mirror,
// which makes it read as a slot of open room instead of a post, and doubles the
// apparent depth of the aisles around it. Bigger stores carried two or three.
//
// The build is deliberately structural, not decorative: a plinth, four mirror
// panels, a cap band, and nothing else. It is a column, and a column that
// starts growing signage stops reading as part of the building.
//
// COLOURS come from the active theme (signage rule 2 — never hardcode a house
// colour into a fixture): the plinth and cap band take themeTrimDarkHex, so
// they follow the brand the day it moves instead of wearing the old house
// forever.
//
// MIRRORS: four Reflectors when this machine gets live ones at all
// (ctx.liveMirror, set from store-mirrors.ts's liveMirrorsAllowed), otherwise
// the same env-mapped chrome the cornice band falls back to. They cost nothing
// extra while off-camera: store-mirrors.ts skips any mirror that fails its
// frustum AND facing test, so the two faces pointing away from you never spend
// a refresh, and the store's whole reflection budget stays one re-render per
// stride tick no matter how many mirrors are standing.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { FixtureContext, StoreFixture } from '../fixtures';
import { FixturePlacement, FLOOR_FIXTURE_MAX_Z } from '../store-layout';
import { Footprint, FLOOR_DISPLAY_CLEARANCE } from '../layout-validator';
import { themeTrimDarkHex, scaleHex } from '../themes';

/** Clad width/depth of the column, feet. */
const SIDE = 2.0;
/** Plinth height and cap-band height, feet. */
const PLINTH_H = 0.55;
const CAP_H = 0.45;
/** How far the plinth and cap stand proud of the mirror face, feet. */
const REVEAL = 0.06;
/** Gap left at each end of a mirror panel so the panel edge is not pinched. */
const PANEL_INSET = 0.02;

export class MirrorColumn implements StoreFixture {
  public placement: FixturePlacement;

  private ctx: FixtureContext;
  private group: THREE.Group | null = null;
  private disposables: Array<{ dispose(): void }> = [];

  constructor(placement: FixturePlacement, ctx: FixtureContext) {
    this.placement = placement;
    this.ctx = ctx;

    // Back-wall-relative Z, same contract as the promo stands and the bargain
    // bin: the corridor these stand in is a fixed distance from the BACK of the
    // store, and the store's depth is derived from the library size, so a fixed
    // world Z lands mid-shelf-field on a shallow store.
    const options = this.placement.options || {};
    if (options.relativeToBackWall) {
      const zOffset = typeof options.zOffset === 'number' ? options.zOffset : this.placement.position.z;
      this.placement.position.z = Math.min(this.ctx.backWallZ + zOffset, FLOOR_FIXTURE_MAX_Z - 0.5);
    }
  }

  private side(): number {
    const s = this.placement.options?.side;
    return typeof s === 'number' && s > 0.5 ? s : SIDE;
  }

  build(): void {
    const side = this.side();
    const { x, z } = this.placement.position;
    const ceilingY = this.ctx.ceilingY;
    const panelH = ceilingY - PLINTH_H - CAP_H;
    if (panelH < 1.0) return; // absurdly low ceiling — no column rather than a stub

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = this.placement.yaw || 0;

    const trimHex = themeTrimDarkHex();
    const trimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(trimHex), roughness: 0.42, metalness: 0.25,
    });
    // The core is what shows in the hairline seams between panels and at the
    // corners; a shade off the trim so the corner arris catches a highlight
    // rather than disappearing into the mirror.
    const coreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(scaleHex(trimHex, 1.35)), roughness: 0.5, metalness: 0.2,
    });
    this.disposables.push(trimMat, coreMat);

    const box = (w: number, h: number, d: number, y: number, mat: THREE.Material) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      this.disposables.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, y + h / 2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    box(side + REVEAL * 2, PLINTH_H, side + REVEAL * 2, 0, trimMat);
    box(side, panelH, side, PLINTH_H, coreMat);
    box(side + REVEAL * 2, CAP_H, side + REVEAL * 2, ceilingY - CAP_H, trimMat);

    // Four faces, each rotated to look out along its own axis. The panel sits a
    // hair proud of the core so it never z-fights the box it is mounted on.
    const panelW = side - PANEL_INSET * 2;
    const half = side / 2 + 0.004;
    const faces: Array<{ dx: number; dz: number; rotY: number }> = [
      { dx: 0, dz: half, rotY: 0 },
      { dx: half, dz: 0, rotY: Math.PI / 2 },
      { dx: 0, dz: -half, rotY: Math.PI },
      { dx: -half, dz: 0, rotY: -Math.PI / 2 },
    ];
    const live = this.ctx.liveMirror;
    const chromeMat = live ? null : new THREE.MeshStandardMaterial({
      color: 0xd6dbe2, metalness: 1.0, roughness: 0.12, envMapIntensity: 1.0,
    });
    if (chromeMat) this.disposables.push(chromeMat);

    for (const f of faces) {
      const geo = new THREE.PlaneGeometry(panelW, panelH - PANEL_INSET * 2);
      this.disposables.push(geo);
      const panel = live
        ? new Reflector(geo, {
            clipBias: 0.003,
            textureWidth: live.textureWidth,
            textureHeight: live.textureHeight,
            color: 0xffffff,
          })
        : new THREE.Mesh(geo, chromeMat!);
      panel.position.set(f.dx, PLINTH_H + panelH / 2, f.dz);
      panel.rotation.y = f.rotY;
      group.add(panel);
      // A Reflector owns a render target of its own — that is the expensive
      // part, and its geometry dispose() would not touch it.
      if (panel instanceof Reflector) this.disposables.push(panel);
    }

    this.ctx.scene.add(group);
    this.ctx.addCollider(group);
    this.group = group;
  }

  getFootprint(): Footprint | null {
    if (!this.group) return null;
    const side = this.side() + REVEAL * 2;
    return {
      label: `fixture:${this.placement.id}`,
      kind: 'fixture',
      cx: this.placement.position.x,
      cz: this.placement.position.z,
      w: side,
      d: side,
      yaw: this.placement.yaw || 0,
      // Customers walk all the way around a column, exactly as they circle a
      // floor display, so it asks for the same berth.
      clearance: FLOOR_DISPLAY_CLEARANCE,
    };
  }

  update(_timeMs: number): void {
    // Static structure — the mirrors are driven by store-mirrors.ts.
  }

  dispose(): void {
    if (this.group) {
      this.ctx.scene.remove(this.group);
      this.group = null;
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
