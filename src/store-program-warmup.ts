import { getLastUserActivity } from './user-activity';
import { updateStoreLoading } from './store-loading';
import { initialProgramObjects } from './initial-programs';
import { createInspectionProgramProbe } from './inspection-mesh';
import * as THREE from 'three';
import type { StoreScene } from './three-scene';
import type { Movie } from './providers/media-source-provider';
import { CASE_MEDIUM, posterPixelCache, createProgramWarmupMaterials } from './video-case';
import { isWhiteClamshell } from './packaging-formats';
import { retailAudio } from './audio';
import { isPublicDemo } from './demo-mode';
import { mobileStoreActive } from './mobile-store';
import { mirrorCubeWarmupMaterial } from './store-mirrors';
import { compileProgramsInStages, prepareStaticTextures, yieldForPrograms } from './program-warmup';

const stagedInitialRooms = new WeakSet<StoreScene>();
const preparing = new WeakSet<StoreScene>();
export const runtimeProgramsPreparing = (scene: StoreScene): boolean => preparing.has(scene);

/** Resolve the real initial pose before deciding which colour programs block entry. */
export async function prepareInitialViewPrograms(scene: StoreScene): Promise<void> {
  // Returning rentals and saved alternate roots can move through other views
  // before entry; retain their full-room preparation instead of guessing a frame.
  if (!['overview', 'walk-around'].includes(scene.mode) || scene.returnDropWatch) {
    await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
      scene.composer?.readBuffer ?? null, scene.programWarmupController.signal);
    return;
  }
  stagedInitialRooms.add(scene);
  if (!scene.isWalkAroundMode) scene.snapCamera();
  const roots = new THREE.Group();
  roots.children = initialProgramObjects(scene.scene, scene.camera);
  try {
    await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
      scene.composer?.readBuffer ?? null, scene.programWarmupController.signal, roots,
      (fraction, detail) => updateStoreLoading(70 + 14 * fraction, detail));
  } finally { roots.children = []; }
}

export async function warmupRuntimePrograms(scene: StoreScene) {
  if (scene.warmedPrograms || preparing.has(scene)) return;
  preparing.add(scene);
  const signal = scene.programWarmupController.signal;
  // Explicit High keeps the complete depth-of-field/hero draw preparation.
  // Automatic phone tiers can prepare inspection materials after room entry.
  const background = (isPublicDemo || mobileStoreActive()) && scene.effectiveQuality !== 'high';
  const options = background ? backgroundOptions(scene, signal) : undefined;
  const instancedProbes: THREE.InstancedMesh[] = [];
  let firstInspectionProbe: THREE.InstancedMesh | undefined;
  let geo: THREE.BoxGeometry | undefined;
  let warmScene: THREE.Group | undefined;
  const bokehEnabled = scene.bokehPass?.enabled;
  try {
    // Paint the interactive view, then respect held input before making canvases
    // or probes too. Driver operations retain this same gate below.
    if (background) {
      await options?.beforeWork();
    }
    geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    warmScene = new THREE.Group();
    // The public animation loop is already running. Probe objects must never
    // enter a visible render while Three compiles them cooperatively.
    warmScene.visible = !background;
    let firstWithPoster: Movie | null = null;
    let firstSeries: Movie | null = null;
    let firstAnimated: Movie | null = null;
    for (const lib of scene.libraries) {
      for (const m of lib.movies) {
        if (!firstWithPoster && posterPixelCache.has(m.id)) firstWithPoster = m;
        if (!firstSeries && m.isSeries) firstSeries = m;
        if (!firstAnimated && isWhiteClamshell(m,CASE_MEDIUM)) firstAnimated = m;
        if (firstWithPoster && firstSeries && firstAnimated) break;
      }
    }
    const movie = firstWithPoster ?? scene.libraries[0]?.movies[0];
    if (!movie) {
      if (background) { await prepareRemainingRoom(); return; }
      await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
        scene.composer?.readBuffer ?? null, signal);
      return;
    }
    const warm = createProgramWarmupMaterials(movie, firstAnimated, firstSeries);
    scene.disposeWarmedPrograms = () => {
      if (warmScene) scene.scene.remove(warmScene);
      geo?.dispose();
      geo = undefined;
      warm.dispose();
    };
    const directPrograms = warm.unmodifiedMaterials.map(material => ({
      material, compile: material.onBeforeCompile, key: material.customProgramCacheKey,
    }));
    // Keep real material hooks and object flags. Compile into the composer's
    // linear target after resetting clipping, then let the driver finish before
    // the first draw. Using the canvas here warms a different program variant.
    for (const mats of warm.materialSets) {
      const mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
      mesh.frustumCulled = false;
      warmScene.add(mesh);
      // Factory fronts keep the room's bay-wash decoration. Heroes now use
      // identity instancing too; the undecorated poster probes below cannot
      // prepare that distinct program. Keep ordinary variants for carried cases.
      if (!mats.every(material => warm.unmodifiedMaterials.includes(material))) {
        const probe = createInspectionProgramProbe(geo, mats);
        firstInspectionProbe ??= probe;
        instancedProbes.push(probe);
        warmScene.add(probe);
      }
    }
    // Shelf batches need the instanced variant of the same undecorated
    // poster finishes. Zero instances prepare it without drawing a probe.
    for (const material of warm.unmodifiedMaterials) {
      const probe = new THREE.InstancedMesh(geo, material, 1);
      probe.count = 0;
      instancedProbes.push(probe);
      warmScene.add(probe);
    }
    // The checkout bag's glossy-plastic variant (map + alphaTest + clearcoat
    // + DoubleSide) otherwise compiles mid-checkout on its first draw.
    const bagMat = scene.entrance?.getBagWarmupMaterial();
    if (bagMat) {
      const bagWarm = new THREE.Mesh(geo, bagMat);
      bagWarm.frustumCulled = false;
      warmScene.add(bagWarm);
    }
    const mirrorMat = mirrorCubeWarmupMaterial(scene);
    if (mirrorMat) {
      const mirrorWarm = new THREE.Mesh(geo, mirrorMat);
      mirrorWarm.frustumCulled = false;
      warmScene.add(mirrorWarm);
    }
    warmScene.position.set(11, -60, 0);
    scene.scene.add(warmScene);
    // Scene-add decoration applies bay lighting to the probes. The asynchronous
    // high-detail poster swap uses undecorated materials, so warm that exact
    // variant too; factory-owned hero materials retain their normal decoration.
    for (const { material, compile, key } of directPrograms) {
      material.onBeforeCompile = compile;
      material.customProgramCacheKey = key;
      material.needsUpdate = true;
    }
    if (background && stagedInitialRooms.has(scene)) {
      // The first factory case is the next likely view. Prepare its existing
      // identity-instance variant before off-camera room families, not at entry.
      if (firstInspectionProbe) await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
        scene.composer?.readBuffer ?? null, signal, firstInspectionProbe, undefined, options);
      // Keep dummy poster maps out of the room's texture-upload snapshot. The
      // detached probes retain decoration and can still compile against its lights.
      scene.scene.remove(warmScene);
      await prepareRemainingRoom();
    }
    const t0 = performance.now();
    await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
      scene.composer?.readBuffer ?? null, signal, background ? warmScene : scene.scene, undefined, options);
    if (background) {
      // Do not bind, show or hide the visitor's hero cases, or force a composer
      // draw: they may already be browsing or inspecting while this completes.
      console.log(`[warmup] background inspection programs compiled in ${(performance.now() - t0).toFixed(0)}ms`);
      return;
    }
    await yieldForPrograms(signal);
    if (scene.composer) {
      if (scene.bokehPass) scene.bokehPass.enabled = true; // DOF programs compile on first inspect otherwise
      scene.composer.render();
      if (scene.bokehPass) scene.bokehPass.enabled = false;
    } else {
      scene.renderer.render(scene.scene, scene.camera);
    }
    scene.scene.remove(warmScene);
    geo.dispose();
    geo = undefined;
    // Retain the dummy materials: disposing their last reference deletes the
    // warmed GL programs and makes the first detailed inspection compile again.
    retailAudio.prewarm(); // first sound otherwise pays AudioContext setup mid-keypress
    // First-bind AND first-swap dry runs: the first real selection *change*
    // pays hero mesh creation, a second title's four cover-canvas draws +
    // texture uploads and the first hero-visible composite (a ~50ms
    // GPU-pipeline blip even with all programs warm) — pay both binds here,
    // each with its own composite, exactly like two real selection moves.
    const swapTo = scene.libraries[0]?.movies[1] ?? null;
    for (const bind of swapTo ? [movie, swapTo] : [movie]) {
      await yieldForPrograms(signal);
      scene.ensureHeroCases(bind);
      if (scene.heroFrontMesh && scene.heroBackMesh) {
        scene.heroFrontMesh.visible = true;
        scene.heroBackMesh.visible = true;
        const heroes = new THREE.Group();
        heroes.children = [scene.heroFrontMesh, scene.heroBackMesh];
        await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
          scene.composer?.readBuffer ?? null, signal, heroes);
        if (scene.composer) scene.composer.render();
        else scene.renderer.render(scene.scene, scene.camera);
      }
    }
    scene.hideHeroCases();
    console.log(`[warmup] hero material programs drawn+compiled in ${(performance.now() - t0).toFixed(0)}ms`);
  } catch (e) {
    if (!signal.aborted) console.warn('[warmup] runtime program warmup failed:', e);
  } finally {
    scene.warmedPrograms = true;
    preparing.delete(scene);
    instancedProbes.forEach(probe => probe.dispose());
    if (warmScene) scene.scene.remove(warmScene);
    geo?.dispose();
    if (!background && scene.bokehPass && bokehEnabled !== undefined) scene.bokehPass.enabled = bokehEnabled;
    if (!background) scene.hideHeroCases();
  }

  async function prepareRemainingRoom() {
    if (!stagedInitialRooms.has(scene)) return;
    // Preserve all room preparation and the existing full-readiness/fixture
    // release promise, including an opening-day store with no titles to inspect.
    await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
      scene.composer?.readBuffer ?? null, signal, scene.scene, undefined, options);
    await prepareStaticTextures(scene.renderer, scene.scene, signal, options?.beforeWork);
    stagedInitialRooms.delete(scene);
  }
}

/** Keep the textured fallback visible while an arriving fixture prepares its
 * actual room-lighting variants and uploads its maps, one operation at a time.
 * The hidden model is already attached so surface finishes have been applied.
 */
export async function prepareDetailModel(scene: StoreScene, model: THREE.Group, lifetime: AbortSignal): Promise<void> {
  const signal = AbortSignal.any([scene.programWarmupController.signal, lifetime]);
  await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
    scene.composer?.readBuffer ?? null, signal, model, undefined, backgroundOptions(scene, signal));
  await prepareStaticTextures(scene.renderer, model, signal, backgroundOptions(scene, signal).beforeWork);
}

function backgroundOptions(scene: StoreScene, signal: AbortSignal) {
  return { batchSize: 1, beforeWork: async () => {
    do { await yieldForPrograms(signal); }
    while ((!scene.attractTour && scene.reflectionInteractionActive) || performance.now() - getLastUserActivity() < 500);
  } };
}
