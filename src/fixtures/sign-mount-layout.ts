import * as THREE from 'three';

/** Feet, sign-local X/Z and store Y. The printed body remains independently owned. */
export interface SignMountSpec {
  width: number;
  topY: number;
  ceilingY: number;
  rigid: boolean;
  skew?: number;
  /** Visible ceiling underside at the left/right support (tiles sit below the deck). */
  contactYs?: [number, number];
}

/** Assemble canonical Blender parts without stretching eyes, clips or connectors. */
export function prepareSignMount(model: THREE.Group, spec: SignMountSpec): void {
  const parts = new Map<string, THREE.Mesh>();
  model.traverse(o => { if (o instanceof THREE.Mesh) parts.set(o.name, o); });
  const required = ['TopChannel', 'CeilingClip', 'AttachmentEye', 'WireConnector', 'SuspensionWire', 'RigidDrop', 'Fastener'];
  for (const name of required) if (!parts.has(name)) throw new Error(`Missing sign mount part: ${name}`);
  // Clones share resources within one sign; discard unused variant geometry.
  parts.forEach(o => o.removeFromParent());
  const used = new Set<string>();
  const put = (name: string, x: number, y: number, sx = 1, sy = 1) => {
    used.add(name);
    const part = parts.get(name)!.clone();
    part.visible = true; part.position.set(x, y, 0); part.quaternion.identity();
    part.scale.set(sx, sy, 1); model.add(part); return part;
  };
  const { width, topY, ceilingY } = spec;
  const rigid = spec.rigid || ceilingY - topY < .22;
  const shift = spec.skew ?? 0;
  put('TopChannel', shift, topY, rigid ? width * .55 : width * .86);
  const spread = rigid ? width * .24 : Math.max(.05, width / 2 - .4);
  for (const [index, side] of [-1, 1].entries()) {
    const contactY = spec.contactYs?.[index] ?? ceilingY;
    const x = side * spread + shift;
    put('CeilingClip', x, contactY);
    put('Fastener', x, contactY - .025);
    if (rigid) {
      put('RigidDrop', x, topY + .026, 1, Math.max(.001, contactY - .008 - topY - .026));
    } else {
      put('AttachmentEye', x, topY);
      put('Fastener', x, topY + .014);
      put('WireConnector', x, topY);
      put('SuspensionWire', x, topY + .15, 1, contactY - .008 - topY - .15);
    }
  }
  parts.forEach((part, name) => { if (!used.has(name)) part.geometry.dispose(); });
  model.userData.signMount = spec;
}

/** Resolve the actual underside, including recessed tile/troffer and soffit faces.
 * Search from .25 ft below to .5 ft above the nominal deck, including the
 * exposed structural roof. Hidden surfaces and the sign itself are excluded.
 * The nominal deck remains the fallback for empty rigs.
 */
export function signCeilingContacts(scene: THREE.Scene, parent: THREE.Group, spec: SignMountSpec): [number, number] {
  scene.updateMatrixWorld(true);
  const rigid = spec.rigid || spec.ceilingY - spec.topY < .22;
  const spread = rigid ? spec.width * .24 : Math.max(.05, spec.width / 2 - .4);
  const surfaces = scene.children.filter(o => o !== parent);
  return [-1, 1].map(side => {
    const origin = parent.localToWorld(new THREE.Vector3(side * spread + (spec.skew ?? 0), spec.ceilingY - .25, 0));
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, 1, 0), 0, .75);
    const hit = ray.intersectObjects(surfaces, true).find(hit => {
      let object: THREE.Object3D | null = hit.object;
      while (object) { if (!object.visible) return false; object = object.parent; }
      return true;
    });
    return hit ? parent.worldToLocal(hit.point.clone()).y : spec.ceilingY;
  }) as [number, number];
}
