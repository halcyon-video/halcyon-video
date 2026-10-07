import * as THREE from 'three';
import type { FixtureContext } from './fixtures';
import { installDisplayModel } from './fixtures/display-model';

/** Visible casework only. Existing live pictures, glass and bezels keep their owner. */
export function installWallBankHousing(ctx: FixtureContext, housing: THREE.Mesh,
  bankY: number): () => void {
  const parent = new THREE.Group(); parent.name = 'wall-bank-housing';
  parent.position.set(11, bankY, ctx.backWallZ);
  const fallback = new THREE.Group();
  // The established extrusion contains world X/Y coordinates. Reparenting
  // cancels the anchor exactly and keeps its collision/visible shape unchanged.
  housing.position.set(-11, -bankY, 0); fallback.add(housing); parent.add(fallback);
  ctx.scene.add(parent); parent.updateWorldMatrix(true, true);
  const original = new THREE.Box3().setFromObject(housing, true);
  return installDisplayModel(ctx, parent, fallback, 'models/tv-wall-bank.glb',
    { HousingAmber: housing.material as THREE.Material }, new THREE.Vector3(1, 1, 1), model => {
      parent.updateWorldMatrix(true, false);
      const bounds = new THREE.Box3().setFromObject(model, true).applyMatrix4(parent.matrixWorld);
      const size = bounds.getSize(new THREE.Vector3());
      const oldSize = original.getSize(new THREE.Vector3());
      const tolerance = .0001;
      if (bounds.min.y < 8.1 || bounds.max.y > ctx.ceilingY - .1 ||
          bounds.min.x < original.min.x - tolerance || bounds.max.x > original.max.x + tolerance ||
          bounds.min.y < original.min.y - tolerance || bounds.max.y > original.max.y + tolerance ||
          bounds.min.z < original.min.z - tolerance || bounds.max.z > original.max.z + tolerance ||
          Math.abs(size.x - oldSize.x) > .04 || Math.abs(size.y - oldSize.y) > .04 || size.z < .45) {
        throw new Error('Wall-bank detail does not fit the existing outline/header/ceiling clearance');
      }
      parent.userData.wallBankBounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
    });
}
