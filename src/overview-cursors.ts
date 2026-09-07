import { selfLit } from './material-lighting';
// T21 — floating labeled shelf cursors for the entrance-overview browsing mode.
//
// One billboarded chevron marker + signboard label per LIBRARY (plus New
// Releases / Checkout waypoints), sourced from StorePlan by
// StoreScene.buildOverviewCursorTargets(); genre sections are browsed by
// walking the aisle, not from the overview. The
// markers are ONE InstancedMesh sharing ONE chevron geometry; labels are pooled
// planes sharing ONE unit geometry (each with its own small canvas texture,
// painted once at build time). update() writes matrices/positions with
// preallocated scratch objects — no per-frame allocations — and is only called
// on ACTIVE-tier frames (see StoreScene.animate()), so the bob/pulse freezes
// (rather than waking the renderer) whenever the scene idles.
import * as THREE from 'three';
import { getActiveTheme } from './themes';
import { getActiveLogoSpec } from './logo-spec';
import { registerBrandRepaint } from './brand-live';
import {
  getLogoFontString, buildLogoShapePath, logoShapeInnerBox, logoShapeFitRect,
} from './logo-renderer';

export const NEW_RELEASES_CURSOR_LIB = -1;
// T22: the front-counter checkout waypoint, present only while carry mode is on.
export const CHECKOUT_CURSOR_LIB = -2;
// Floor fixtures (four-sided collection displays, bargain bins). These live in
// `StoreScene.slottedFixtures`, and the overview is the only browse entry point
// in the default configuration — without a cursor apiece they are unreachable.
// The fixture's index into slottedFixtures rides in `unitIdxInLibrary`.
export const FIXTURE_CURSOR_LIB = -3;
export const FLAT_MODE_CURSOR_LIB = -4;

export interface OverviewCursorTarget {
  /** Library name shown on the board (uppercase). */
  label: string;
  /** World position the marker floats at (y is already above the toppers). */
  x: number;
  y: number;
  z: number;
  /** Library the run belongs to, or NEW_RELEASES_CURSOR_LIB for the back wall. */
  libraryIdx: number;
  /** Browse-selection target when this cursor is confirmed. */
  unitIdxInLibrary: number;
  side: 'front' | 'back';
  col: number;
}

const LABEL_W = 3.3;            // world width of an unfocused label plane (ft)
const LABEL_FOCUS_SCALE = 1.22; // focused label/chevron grow by this factor
const LABEL_CANVAS_W = 640;
const LABEL_CANVAS_H = 256;
const _UP = new THREE.Vector3(0, 1, 0);

// Paint one floating signboard label — the same board the store's title signs
// wear (brand field, trim rule, brand lettering), scaled to the cursor canvas.
// Colors AND silhouette come from the active brand: a pack that brings its own
// emblem outline (LogoSpec shape 'path') gets cursors die-cut to that outline,
// with the label re-centred on the shape's ink-safe box rather than on a
// bounding rectangle a notch or a ragged end has pulled off-centre.
function paintTicketLabel(ctx: CanvasRenderingContext2D, text: string): void {
  const W = LABEL_CANVAS_W, H = LABEL_CANVAS_H;
  const theme = getActiveTheme();
  const spec = getActiveLogoSpec(theme);
  const outline = (spec.shape === 'path' || spec.shape === 'image') && spec.pathD ? spec : null;
  ctx.clearRect(0, 0, W, H);

  // Field: a board filling the canvas, with room for its drop shadow.
  const m = H * 0.06;
  const fx = m, fy = m, fw = W - 2 * m, fh = H - 2 * m;
  const fieldPath = outline ? buildLogoShapePath(outline, fw, fh) : null;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = theme.palette.primary;
  if (fieldPath) {
    ctx.translate(fx, fy);
    ctx.fill(fieldPath);
  } else {
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, H * 0.09);
    ctx.fill();
  }
  ctx.restore();

  // Ink-safe box: the whole field on the house board, the largest rectangle
  // inside the outline on a die-cut one.
  const ib = outline ? logoShapeInnerBox(outline) : null;
  const fit = outline ? logoShapeFitRect(outline, fw, fh) : null;
  const bx = ib && fit ? fx + fit.x + ib.x * fit.w : fx;
  const by = ib && fit ? fy + fit.y + ib.y * fit.h : fy;
  const bw = ib && fit ? ib.w * fit.w : fw;
  const bh = ib && fit ? ib.h * fit.h : fh;

  // Single trim rule inside the field edge, clipped to the shape so it stops
  // at a ragged edge instead of closing across it.
  ctx.save();
  if (fieldPath) {
    ctx.translate(fx, fy);
    ctx.clip(fieldPath);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  const ri = H * 0.055;
  ctx.strokeStyle = theme.palette.secondary;
  ctx.lineWidth = H * 0.018;
  ctx.beginPath();
  ctx.roundRect(bx + ri, by + ri, bw - 2 * ri, bh - 2 * ri, H * 0.06);
  ctx.stroke();

  // Category name in the brand's own typography, shrunk to fit inside the rule.
  const maxTextW = (bw - 2 * ri) * 0.84;
  ctx.fillStyle = spec.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = Math.round(Math.min(H * 0.34, bh * 0.42));
  ctx.font = getLogoFontString(spec, fontSize);
  while (ctx.measureText(text).width > maxTextW && fontSize > 16) {
    fontSize -= 4;
    ctx.font = getLogoFontString(spec, fontSize);
  }
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.fillText(text, bx + bw / 2, by + bh / 2 + 4);
  ctx.restore();
}

export class OverviewCursors {
  public readonly targets: OverviewCursorTarget[];
  public focusedIdx = -1;

  private group = new THREE.Group();
  private chevrons: THREE.InstancedMesh;
  private chevronGeo: THREE.ExtrudeGeometry;
  private chevronMat: THREE.MeshBasicMaterial;
  private labelGeo: THREE.PlaneGeometry;
  private labels: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; tex: THREE.CanvasTexture }[] = [];

  // Chevron tints derived from the active theme's palette. Built once in the
  // constructor — setColorAt reuses these, no per-frame allocs.
  private readonly chevronFocus: THREE.Color;
  private readonly chevronIdle: THREE.Color;

  // Scratch objects reused by update()/pickFocused() — no per-frame allocations.
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();

  constructor(scene: THREE.Scene, targets: OverviewCursorTarget[]) {
    this.targets = targets;

    const palette = getActiveTheme().palette;
    const white = new THREE.Color(0xffffff);
    // Focus: the brand's trim color, lifted toward white so it pops as "selected".
    this.chevronFocus = new THREE.Color(palette.secondary).lerp(white, 0.18);
    // Idle: the brand primary, desaturated/dimmed to a muted marker tint.
    this.chevronIdle = new THREE.Color(palette.primary).lerp(white, 0.3).multiplyScalar(0.78);

    // Shared chevron geometry: a downward-pointing "V" band, extruded thin.
    const shape = new THREE.Shape();
    shape.moveTo(-0.62, 0.52);
    shape.lineTo(-0.62, 0.18);
    shape.lineTo(0.0, -0.45);
    shape.lineTo(0.62, 0.18);
    shape.lineTo(0.62, 0.52);
    shape.lineTo(0.0, -0.10);
    shape.closePath();
    this.chevronGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
    this.chevronGeo.translate(0, 0, -0.07); // centre the extrusion
    this.chevronMat = selfLit(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 'overlay');
    this.chevrons = new THREE.InstancedMesh(this.chevronGeo, this.chevronMat, Math.max(1, targets.length));
    this.chevrons.frustumCulled = false; // instance matrices bob; a dozen quads is cheaper than re-bounding
    this.group.add(this.chevrons);

    // Pooled label planes (one shared unit geometry, one small texture each,
    // painted once here — never per frame).
    this.labelGeo = new THREE.PlaneGeometry(1, LABEL_CANVAS_H / LABEL_CANVAS_W);
    targets.forEach((t, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = LABEL_CANVAS_W;
      canvas.height = LABEL_CANVAS_H;
      const ctx2d = canvas.getContext('2d')!;
      const paint = () => paintTicketLabel(ctx2d, t.label);
      paint();
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      registerBrandRepaint(tex, paint);
      const mat = selfLit(new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        toneMapped: false,
        depthWrite: false,
      }), 'overlay');
      const mesh = new THREE.Mesh(this.labelGeo, mat);
      mesh.position.set(t.x, this.labelY(i), t.z);
      mesh.scale.setScalar(LABEL_W);
      mesh.renderOrder = 998;
      this.group.add(mesh);
      this.labels.push({ mesh, mat, tex });

      // Park the chevron at its resting pose so the first composited frame is
      // correct even before the first update() call.
      this._q.identity();
      this._s.setScalar(1);
      this._p.set(t.x, t.y, t.z);
      this._m.compose(this._p, this._q, this._s);
      this.chevrons.setMatrixAt(i, this._m);
      this.chevrons.setColorAt(i, this.chevronIdle);
    });
    this.chevrons.count = targets.length;
    this.chevrons.instanceMatrix.needsUpdate = true;
    if (this.chevrons.instanceColor) this.chevrons.instanceColor.needsUpdate = true;

    this.group.visible = false;
    this.group.renderOrder = 998;
    // Floating UI: no AO contact halo, no mirror reflections (layer 1 is
    // excluded from Reflector cameras, matching the seccam selection arrow).
    this.group.userData.excludeFromSSAO = true;
    this.group.traverse((child) => {
      child.userData.excludeFromSSAO = true;
      child.layers.set(1);
    });
    scene.add(this.group);
  }

  private labelY(i: number): number {
    return this.targets[i].y + 0.62 + (LABEL_W * (LABEL_CANVAS_H / LABEL_CANVAS_W)) / 2;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  get focusedLabel(): string {
    return this.targets[this.focusedIdx]?.label ?? '';
  }

  /** Index of the cursor nearest the aim direction (max angular alignment). */
  pickFocused(eye: THREE.Vector3, forward: THREE.Vector3): number {
    let best = -1;
    let bestDot = -Infinity;
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      this._dir.set(t.x - eye.x, t.y - eye.y, t.z - eye.z).normalize();
      const d = this._dir.dot(forward);
      if (d > bestDot) {
        bestDot = d;
        best = i;
      }
    }
    return best;
  }

  /** Swap the highlighted cursor (brighter/larger chevron, solid label). */
  setFocused(idx: number): void {
    if (idx === this.focusedIdx) return;
    if (this.focusedIdx >= 0 && this.focusedIdx < this.targets.length) {
      this.chevrons.setColorAt(this.focusedIdx, this.chevronIdle);
      const prev = this.labels[this.focusedIdx];
      if (prev) {
        prev.mat.opacity = 0.8;
        prev.mesh.scale.setScalar(LABEL_W);
      }
    }
    this.focusedIdx = idx;
    if (idx >= 0 && idx < this.targets.length) {
      this.chevrons.setColorAt(idx, this.chevronFocus);
      const cur = this.labels[idx];
      if (cur) {
        cur.mat.opacity = 1.0;
        cur.mesh.scale.setScalar(LABEL_W * LABEL_FOCUS_SCALE);
      }
    }
    if (this.chevrons.instanceColor) this.chevrons.instanceColor.needsUpdate = true;
  }

  /**
   * Billboard + bob/pulse. Called only on ACTIVE-tier rendered frames — on
   * VIDEO/IDLE frames the cursors simply hold their last pose. No allocations.
   */
  update(timeMs: number, camera: THREE.PerspectiveCamera): void {
    const t = timeMs * 0.0022;
    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i];
      const yaw = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
      const bob = Math.sin(t + i * 0.9) * 0.12;
      const focused = i === this.focusedIdx;
      const scale = focused ? 1.28 + Math.sin(timeMs * 0.004) * 0.06 : 1.0;
      this._p.set(target.x, target.y + bob, target.z);
      this._q.setFromAxisAngle(_UP, yaw);
      this._s.setScalar(scale);
      this._m.compose(this._p, this._q, this._s);
      this.chevrons.setMatrixAt(i, this._m);

      const label = this.labels[i];
      label.mesh.position.y = this.labelY(i) + bob * 0.5;
      label.mesh.rotation.y = yaw;
    }
    this.chevrons.instanceMatrix.needsUpdate = true;
  }

  /** Detach from the scene and release every GPU resource this class created. */
  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.chevronGeo.dispose();
    this.chevronMat.dispose();
    this.chevrons.dispose(); // frees the instance matrix/color attributes
    this.labelGeo.dispose();
    this.labels.forEach(({ mat, tex }) => {
      tex.dispose();
      mat.dispose();
    });
    this.labels.length = 0;
  }
}
