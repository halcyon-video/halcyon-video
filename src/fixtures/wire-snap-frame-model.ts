import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { installDisplayModel } from './display-model';

/** Keep live artwork outside the replaceable hardware, including during art loads. */
export function installWireSnapFrame(
  ctx: FixtureContext, root: THREE.Group, width: number, height: number, hasPost: boolean,
): void {
  root.name = 'wire-snap-frame';
  root.userData.hasPost = hasPost;
  const fallback = new THREE.Group();
  const poster = root.children.find(o => o instanceof THREE.Mesh && o.geometry.type === 'PlaneGeometry');
  for (const child of [...root.children]) if (child !== poster) fallback.add(child);
  root.add(fallback);
  const finish = (fallback.children[0] as THREE.Mesh).material as THREE.Material;
  const stop = installDisplayModel(ctx, root, fallback, 'models/wire-snap-frame.glb',
    { FrameFinish: finish }, new THREE.Vector3(1, 1, 1), model => {
      const frame = model.getObjectByName('FrameAssembly')!;
      frame.position.y = (hasPost ? .42 : 0) + height / 2;
      model.getObjectByName('AdjustableStand')!.visible = hasPost;
      model.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        switch (o.userData.snapFit) {
          case 'art':
            // The existing PlaneGeometry owns current procedural/user art and UVs.
            o.visible = false;
            break;
          case 'rail': {
            // Extend the straight runs; preserve the .04 ft section and 45° mitres.
            const p = o.geometry.getAttribute('position');
            for (let i = 0; i < p.count; i++) {
              p.setXY(i, p.getX(i) + Math.sign(p.getX(i)) * (width - 1) / 2,
                p.getY(i) + Math.sign(p.getY(i)) * (height - 1) / 2);
            }
            p.needsUpdate = true;
            o.geometry.computeBoundingBox();
            o.geometry.computeBoundingSphere();
            break;
          }
          case 'backing':
            o.scale.set((width + .064) / 1.064, (height + .064) / 1.064, 1);
            break;
          case 'bottom':
            o.position.y -= (height - 1) / 2;
            o.visible = hasPost;
            break;
        }
      });
    });
  // Removal fires before clearActiveSignage traverses/disposes the fallback.
  // It also cancels a load that finishes after a theme rebuild.
  root.addEventListener('removed', function cancel() {
    root.removeEventListener('removed', cancel);
    stop();
  });
}
