import type { StoreScene } from './three-scene';
import { gumballPlacement, type GumballShelf } from './fixtures/gumball-layout';

export function storeGumballPlacement(scene: StoreScene) {
  const shelves: GumballShelf[] = scene.slottedFixtures.filter(f => f.placement.kind === 'game-section').flatMap(f => {
    const footprint=f.getFootprint?.();
    return footprint ? [{footprint,frontCap:f.placement.options?.hasFrontCap !== false,backCap:f.placement.options?.hasBackCap !== false}] : [];
  });
  // Games-only stores shelve their platform libraries in the ordinary floor plan.
  const footprints=scene.plan.getUnitFootprints();
  scene.plan.shelvingUnits.forEach((u,i) => {
    if (scene.libraries[u.libraryIdx]?.games) shelves.push({footprint:footprints[i]});
  });
  return gumballPlacement(shelves,scene.getStoreWidth(),scene.storefrontSpec);
}
