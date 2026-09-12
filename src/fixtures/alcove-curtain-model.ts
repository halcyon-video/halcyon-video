import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { installDisplayModel } from './display-model';

/** #231 attachment contract: feet, doorway centre X/Z, header underside Y=6.8.
 * Curtain owns rail/eyes/cords; partition owns header, jambs and colliders.
 * Reuse the existing bead matrices so deterministic strand offsets stay intact.
 */
export function installAlcoveCurtain(
  ctx: FixtureContext, parent: THREE.Group, fallback: THREE.InstancedMesh,
  planeX: number, doorCenterZ: number,
): () => void {
  const anchor = new THREE.Group();
  anchor.name = 'alcove-curtain';
  anchor.position.set(planeX, 0, doorCenterZ);
  parent.add(anchor);
  // The existing fallback has parent-space matrices and remains in that space.
  const fallbackGroup = new THREE.Group();
  parent.add(fallbackGroup);
  fallbackGroup.add(fallback);
  const instances: THREE.InstancedMesh[] = [];
  const remove = installDisplayModel(ctx, anchor, fallbackGroup, 'models/alcove-curtain.glb', {},
    new THREE.Vector3(1, 1, 1), model => {
      const matrices: THREE.Matrix4[][] = [[], []];
      const strands = new Map<number, { x: number; low: number }>();
      const m = new THREE.Matrix4();
      for (let i = 0; i < fallback.count; i++) {
        fallback.getMatrixAt(i, m);
        m.elements[12] -= planeX;
        m.elements[14] -= doorCenterZ;
        const [x, y, z] = m.elements.slice(12, 15);
        const strand = strands.get(z);
        if (strand) strand.low = Math.min(strand.low, y);
        else strands.set(z, { x, low: y });
        // Every fourth bead is a pointed spacer; all centres retain their old positions.
        matrices[i % 4 === 2 ? 1 : 0].push(m.clone());
      }
      const eyes: THREE.Matrix4[] = [], cords: THREE.Matrix4[] = [], knots: THREE.Matrix4[] = [];
      strands.forEach(({ x, low }, z) => {
        eyes.push(new THREE.Matrix4().makeTranslation(x, 0, z));
        knots.push(new THREE.Matrix4().makeTranslation(x, 6.638, z),
          new THREE.Matrix4().makeTranslation(x, low - .056, z));
        const bottom = low - .062, top = 6.652;
        cords.push(new THREE.Matrix4().compose(new THREE.Vector3(x, (top + bottom) / 2, z),
          new THREE.Quaternion(), new THREE.Vector3(1, top - bottom, 1)));
      });
      for (const [name, transforms] of [
        ['AlcoveBeadBarrel', matrices[0]], ['AlcoveBeadFacet', matrices[1]],
        ['AlcoveEyelet', eyes], ['AlcoveCord', cords], ['AlcoveCordKnot', knots],
      ] as const) {
        const source = model.getObjectByName(name) as THREE.Mesh;
        const mesh = new THREE.InstancedMesh(source.geometry, source.material, transforms.length);
        mesh.name = `${name}_instances`;
        transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        source.removeFromParent();
        model.add(mesh);
        instances.push(mesh);
      }
    });
  return () => {
    // InstancedMesh owns GPU instance buffers separately from geometry/material.
    instances.forEach(mesh => mesh.dispose());
    instances.length = 0;
    remove();
  };
}
