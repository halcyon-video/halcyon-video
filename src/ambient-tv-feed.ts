import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from './asset-url';
import { disposeSceneMeshes } from './scene-mesh-disposal';
import type { FixtureContext } from './fixtures';

/**
 * Power feed for one suspended TV (#260): a ceiling box with a duplex outlet, the right-angle plug seated in it,
 * a clipped lead that ends in a strain-relief gland at the mounting plate, and (only where the roof underside is
 * visible) the conduit run that rises from the box to the roof. Authored in the plate's frame, so it is placed at
 * the plate position. A failed or late load simply leaves the mount as it was.
 */
export async function installTvFeed(ctx: FixtureContext, ceiling: THREE.Group, plateAt: THREE.Vector3,
  exposedRoof: boolean, alive: () => boolean): Promise<void> {
  let source: THREE.Group | null = null;
  try {
    source = (await new GLTFLoader().loadAsync(assetUrl('models/equipment-cabling.glb'))).scene;
    if (!alive()) { disposeSceneMeshes(source); return; }
    const feed = source.getObjectByName('TvCeilingFeed');
    const rise = source.getObjectByName('ExposedRise');
    if (!feed || !rise) throw new Error('Missing cabling part');
    rise.visible = exposedRoof;
    // Authored toward -z; the plain tile beside the plate lies toward +z (the -z side is where the troffers sit).
    feed.position.set(plateAt.x, 0, plateAt.z); feed.rotation.y = Math.PI;
    feed.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    ceiling.add(source);
    ceiling.userData.tvFeed = { exposedRise: exposedRoof, plate: plateAt.toArray() };
    ctx.requestShadowRefresh(); ctx.requestRender();
  } catch (error) {
    if (source) disposeSceneMeshes(source);
    if (alive()) console.warn('[ambient-tvs] cabling feed omitted', error);
  }
}
