import * as THREE from 'three';
import type { FixtureContext } from './fixtures';
import { installDisplayModel } from './fixtures/display-model';

/** Where the three live sets sit, so a model can be checked against the real screens. */
export interface WallBankLayout { pitch: number; outset: number }

/**
 * Optional drop-in remodel: a model carrying a `wall-bank-remodel` node may reach the
 * floor, rise above the housing outline and overhang its ends a little, so it is admitted
 * by its own contract (apertures on the live screens, side limits, ceiling clearance) instead of the
 * generic casework's outline match. Absent or rejected, the generic casework stays.
 */
const REMODEL_FILE = 'user-assets/fixtures/tv-wall-bank-remodel/wall-bank.glb';

/** Visible casework only. Existing live pictures, glass and bezels keep their owner. */
export function installWallBankHousing(ctx: FixtureContext, housing: THREE.Mesh,
  bankY: number, layout: WallBankLayout): () => void {
  const parent = new THREE.Group(); parent.name = 'wall-bank-housing';
  const centerX = ctx.scene.userData.wallBankShelfPlan?.x ?? 11;
  parent.position.set(centerX, bankY, ctx.backWallZ);
  const fallback = new THREE.Group();
  // The established extrusion contains world X/Y coordinates. Reparenting
  // cancels the anchor exactly and keeps its collision/visible shape unchanged.
  housing.position.set(-centerX, -bankY, 0); fallback.add(housing); parent.add(fallback);
  ctx.scene.add(parent); parent.updateWorldMatrix(true, true);
  const original = new THREE.Box3().setFromObject(housing, true);
  const lowerFallback = ctx.scene.getObjectByName('wall-bank-shelf-fallback');
  const wasVisible = lowerFallback?.visible;
  const remove = installDisplayModel(ctx, parent, fallback, ctx.scene.userData.wallBankShelfPlan ? [REMODEL_FILE, 'models/tv-wall-bank.glb'] : 'models/tv-wall-bank.glb',
    { HousingAmber: housing.material as THREE.Material }, new THREE.Vector3(1, 1, 1), model => {
      parent.updateWorldMatrix(true, false);
      model.updateMatrixWorld(true);
      const remodel = model.getObjectByName('wall-bank-remodel');
      if (remodel) { fitRemodel(ctx, model, remodel, parent, bankY, layout, original); return; }
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
    }, model => {
      if (lowerFallback && model.getObjectByName('shelf-group')) lowerFallback.visible = false;
    });
  return () => { remove(); if (lowerFallback) lowerFallback.visible = wasVisible ?? true; };
}

function fitRemodel(ctx: FixtureContext, model: THREE.Group, remodel: THREE.Object3D,
  parent: THREE.Group, bankY: number, layout: WallBankLayout, original: THREE.Box3): void {
  const tolerance = .0001, overhang = .6; // raised lettering may overhang the old outline a little
  // Floor- and shelf-anchored pieces follow the world, not the bank, when the bank
  // is not at the height the model was authored for.
  const designY = Number(remodel.userData.design_bank_y);
  if (!Number.isFinite(designY) || Math.abs(Number(remodel.userData.pitch) - layout.pitch) > .001) {
    throw new Error('Wall-bank remodel was authored for a different screen layout');
  }
  for (const name of ['floor-group', 'shelf-group']) model.getObjectByName(name)?.position.setY(designY - bankY);
  model.updateMatrixWorld(true);
  // Every aperture must sit exactly on its live screen.
  const anchor = new THREE.Vector3();
  for (let i = 0; i < 3; i++) {
    const node = model.getObjectByName(`aperture-${i}`);
    if (!node) throw new Error('Wall-bank remodel lacks its aperture anchors');
    node.getWorldPosition(anchor);
    if (Math.abs(anchor.x - (i - 1) * layout.pitch) > .02 || Math.abs(anchor.y) > .02 || Math.abs(anchor.z - layout.outset) > .02) {
      throw new Error('Wall-bank remodel apertures do not meet the live screens');
    }
  }
  const bounds = new THREE.Box3().setFromObject(model, true).applyMatrix4(parent.matrixWorld);
  const housing = model.getObjectByName('housing-shell');
  const housingBounds = housing ? new THREE.Box3().setFromObject(housing, true).applyMatrix4(parent.matrixWorld) : null;
  if (!housingBounds || housingBounds.min.y < 8.1 || bounds.min.y < -.001 || bounds.max.y > ctx.ceilingY - .1 ||
      bounds.min.x < original.min.x - overhang || bounds.max.x > original.max.x + overhang ||
      bounds.min.z < original.min.z - tolerance || bounds.max.z > original.min.z + 1.65) {
    throw new Error('Wall-bank remodel does not fit the side/header/ceiling/floor clearance');
  }
  parent.userData.wallBankBounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
}
