import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../asset-url';
import { stretchJoinery } from '../joinery-model';
import type { FixtureContext } from '../fixtures';

/** Source tree loaded once; every door clones geometry out of it and leaves it intact. */
let template: Promise<THREE.Group | null> | null = null;
function loadTemplate(): Promise<THREE.Group | null> {
  template ??= new Promise(resolve => {
    new GLTFLoader().load(assetUrl('models/vestibule-door.glb'), g => resolve(g.scene), undefined, () => resolve(null));
  }).then(t => { if (!t) template = null; return t as THREE.Group | null; });
  return template;
}

const NOMINAL = { Double: 3.2, Single: 3.0 } as const;
const STRETCHED = ['Frame', 'Bead', 'Seal', 'PushBar', 'PullBar'];
const HINGE_SIDE = ['Hinges', 'Closer'];
const LATCH_SIDE = ['PushHandle', 'PullHandle'];
const REQUIRED = ['Frame', 'Bead', 'Seal', 'Hinges', 'Closer', 'Jamb', 'JambSeal', 'Header', 'HeaderSeal'];

export interface DoorModelOpts {
  group: THREE.Group;          // static parent (jambs, header)
  doorGroup: THREE.Group;      // pivoting parent (leaf)
  frameMat: THREE.Material;
  chrome: THREE.Material;
  single: boolean;
  width: number;
  doorH: number;
  alongX: boolean;
  hingeOnLeftOrInner: boolean;
  localOffset: number;         // leaf centre relative to the pivot, along the opening
  doorX: number;
  doorZ: number;
  frame: { header: boolean; jambLeft: boolean; jambRight: boolean };
  fallbackLeaf: THREE.Object3D[];
  fallbackStatic: THREE.Object3D[];
}

/**
 * Fitted visual replacement for the procedural door; the procedural meshes stay as hidden collision
 * proxies, and as the visible fallback if the model never loads.
 */
export function installVestibuleDoorModel(ctx: FixtureContext, o: DoorModelOpts) {
  let disposed = false;
  const added: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  loadTemplate().then(tpl => {
    if (disposed || !tpl) return;
    const tag = o.single ? 'Single' : 'Double';
    const variant = tpl.getObjectByName('Door' + tag);
    if (!variant || Math.abs(o.doorH - 7) > .01) return;
    const part = (n: string) => variant.getObjectByName(tag + n) as THREE.Mesh | undefined;
    if (!REQUIRED.every(n => part(n))) return;

    const nominal = NOMINAL[tag];
    const delta = (o.width - nominal) / 2;
    const dress = (src: THREE.Mesh, name: string): THREE.Mesh => {
      const geo = src.geometry.clone();
      geometries.push(geo);
      const m = new THREE.Mesh(geo, src.material);
      const role = (src.material as THREE.Material).name;
      if (role === 'DoorAluminium') m.material = o.frameMat;
      else if (role === 'DoorChrome') m.material = o.chrome;
      m.name = name; m.castShadow = true; m.receiveShadow = true;
      return m;
    };

    // Leaf: mirrored so the hinge edge sits where the procedural pivot is, push face kept on the same side.
    const leaf = new THREE.Group(); leaf.name = 'vestibule-door-leaf-model';
    for (const suffix of [...STRETCHED, ...HINGE_SIDE, ...LATCH_SIDE]) {
      const src = part(suffix);
      if (!src) continue;
      const m = dress(src, 'door' + suffix);
      if (STRETCHED.includes(suffix)) stretchJoinery(m.geometry, 'x', nominal, o.width, .30);
      else m.geometry.translate((HINGE_SIDE.includes(suffix) ? -delta : delta), 0, 0);
      leaf.add(m);
    }
    const hingeAtPlusX = o.alongX ? !o.hingeOnLeftOrInner : o.hingeOnLeftOrInner;
    leaf.scale.set(hingeAtPlusX ? -1 : 1, 1, o.alongX ? 1 : -1);
    if (o.alongX) leaf.position.x = o.localOffset;
    else { leaf.rotation.y = Math.PI / 2; leaf.position.z = o.localOffset; }
    o.doorGroup.add(leaf); added.push(leaf);

    // Static jambs and header.
    const place = (m: THREE.Mesh, x: number, y: number, z: number) => {
      m.position.set(x, y, z);
      if (!o.alongX) m.rotation.y = Math.PI / 2;
      o.group.add(m); added.push(m);
    };
    const headerW = o.single ? o.width + .16 : o.width + .3;
    const hy = o.doorH + .10;
    const add = (suffix: string, x: number, y: number, z: number, sx = 1) => {
      const m = dress(part(suffix)!, 'door' + suffix); m.scale.x = sx; place(m, x, y, z);
    };
    if (o.frame.header) { add('Header', o.doorX, hy, o.doorZ, headerW); add('HeaderSeal', o.doorX, hy, o.doorZ, headerW); }
    const jamb = (sign: number) => {
      const x = o.alongX ? o.doorX + sign * o.width / 2 : o.doorX;
      const z = o.alongX ? o.doorZ : o.doorZ + sign * o.width / 2;
      add('Jamb', x, 0, z); add('JambSeal', x, 0, z);
    };
    if (o.frame.jambLeft) jamb(-1);
    if (o.frame.jambRight) jamb(1);

    o.fallbackLeaf.concat(o.fallbackStatic).forEach(f => { f.visible = false; });
    ctx.requestShadowRefresh(); ctx.requestRender();
  });
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      added.forEach(a => a.removeFromParent());
      geometries.forEach(g => g.dispose());
      added.length = 0;
    },
  };
}
