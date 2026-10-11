import * as THREE from 'three';
import type { FixtureContext } from './fixtures';
import { installDisplayModel } from './fixtures/display-model';

/** Proposed generic roof drainage, not a surveyed store detail.
 * Feet. A flat roof behind a parapet drains through a scupper into a conductor
 * head, then a rectangular downpipe steps in off the proud fascia to the veneer
 * face and discharges onto a splash block. Model frame: x outward from the veneer
 * face, y up from the scupper invert, z along the wall; see
 * docs/gutter-downspout-model.md.
 */
export interface DownspoutWall {
  /** World (x, z) of the pipe centreline on the wall's outer veneer face, and the
   * yaw that turns the model's +x (outward) onto the world: 0 faces +x, PI -x, PI/2 -z. */
  x: number; z: number; yaw: number;
  /** How far the fascia face stands proud of the veneer face. */
  step: number;
  /** Roof slab top (ceilingY + .85) and the y where the fascia meets the veneer. */
  roofY: number; stepY: number;
}

const HEAD_DROP = .4, OFFSET_H = .5, FOOT_H = 1.5, RUN_PX = .165;

export function downspoutAnchor(w: DownspoutWall) {
  if (![w.x, w.z, w.yaw, w.step, w.roofY, w.stepY].every(Number.isFinite)) return null;
  if (w.step < 0 || w.step > .3) return null;
  const y = w.roofY + .1;
  const upper = (y - HEAD_DROP) - w.stepY;
  const lower = w.stepY - OFFSET_H - FOOT_H;
  if (upper < .3 || lower < 1) return null;
  return { x: w.x, y, z: w.z, step: w.step, upper, lower, yaw: w.yaw };
}

export function buildGutterDownspout(ctx: FixtureContext, wall: DownspoutWall): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gutterDownspout';
  const a = downspoutAnchor(wall);
  if (!a) return group;
  group.position.set(a.x, a.y, a.z);
  group.rotation.y = a.yaw;
  const finishes = {
    DownspoutSheet: new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: .5, metalness: .45 }),
    DownspoutHardware: new THREE.MeshStandardMaterial({ color: 0x7b8387, roughness: .45, metalness: .8 }),
    DownspoutSplash: new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: .92, metalness: 0 }),
  };
  const { step, upper, lower } = a;
  const stepTop = -(HEAD_DROP + upper);
  const footTop = stepTop - OFFSET_H - lower;
  const fallback = new THREE.Group();
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; fallback.add(mesh);
  };
  box(.6, 1.15, .84, step + .3, -.02, 0, finishes.DownspoutSheet);
  box(.25, upper, .333, step + RUN_PX, -HEAD_DROP - upper / 2, 0, finishes.DownspoutSheet);
  box(.25, lower, .333, RUN_PX, stepTop - OFFSET_H - lower / 2, 0, finishes.DownspoutSheet);
  box(2.2, .2, .9, 1.25, footTop - FOOT_H + .1, 0, finishes.DownspoutSplash);
  group.add(fallback);

  const release = installDisplayModel(ctx, group, fallback, 'models/gutter-downspout.glb', finishes,
    new THREE.Vector3(1, 1, 1), model => arrangeDownspout(model, a, stepTop, footTop));
  let disposed = false;
  group.userData.dispose = () => { if (disposed) return; disposed = true; release(); };
  group.addEventListener('removed', group.userData.dispose);
  return group;
}

/** Place the authored parts: fixed assemblies once, straight runs scaled, hardware repeated. */
export function arrangeDownspout(model: THREE.Group, a: NonNullable<ReturnType<typeof downspoutAnchor>>, stepTop: number, footTop: number): void {
  const part = (name: string) => {
    const o = model.getObjectByName(name);
    if (!(o instanceof THREE.Mesh)) throw new Error(`gutter-downspout.glb is missing ${name}`);
    return o;
  };
  const place = (src: THREE.Mesh, x: number, y: number, scaleY = 1) => {
    const m = src.clone(false) as THREE.Mesh;
    m.geometry = src.geometry; m.material = src.material;
    m.castShadow = src.castShadow; m.receiveShadow = src.receiveShadow;
    m.position.set(x, y, 0); m.scale.set(1, scaleY, 1);
    model.add(m);
  };
  const head = part('DownspoutHead'), flange = part('DownspoutFlangeScrews'), offset = part('DownspoutOffset');
  const foot = part('DownspoutFoot'), run = part('DownspoutRunPipe'), sleeve = part('DownspoutSleeve');
  const strap = part('DownspoutStrap'), splash = part('DownspoutSplashBlock');
  const shift = a.step - .15; // the head and flange are authored for a .15 ft fascia step
  const sources = [head, flange, offset, foot, run, sleeve, strap, splash];
  // Straight run: one scaled tube, a slip-joint sleeve at each interval, straps between.
  const runs = (top: number, len: number, x: number) => {
    place(run, x, top, len);
    const n = Math.max(1, Math.round(len / 3.5));
    for (let i = 0; i < n; i++) place(strap, x, top - (i + .5) * len / n);
    for (let i = 1; i < n; i++) place(sleeve, x, top - i * len / n);
  };
  runs(-.4, a.upper, a.step);
  runs(stepTop - OFFSET_H, a.lower, 0);
  place(head, shift, 0); place(flange, shift, 0);
  // The offset's x-travel is authored for .15 ft; shear it linearly for other steps.
  const lost = .15 - a.step;
  const o = offset.clone(false) as THREE.Mesh;
  o.geometry = offset.geometry; o.material = offset.material;
  o.castShadow = offset.castShadow; o.receiveShadow = offset.receiveShadow;
  o.matrixAutoUpdate = false;
  o.matrix.set(1, -lost / OFFSET_H, 0, -lost, 0, 1, 0, stepTop, 0, 0, 1, 0, 0, 0, 0, 1);
  model.add(o);
  place(foot, 0, footTop); place(splash, 0, footTop);
  // Template meshes were only sources; the placed copies carry the model.
  for (const s of sources) s.removeFromParent();
}

export function disposeGutterDownspout(scene: THREE.Scene): void {
  scene.getObjectByName('gutterDownspout')?.userData.dispose?.();
}
