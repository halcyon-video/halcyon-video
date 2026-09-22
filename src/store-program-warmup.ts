import { initialProgramObjects } from './initial-programs';
import * as THREE from 'three';
import type { StoreScene } from './three-scene';
import type { Movie } from './providers/media-source-provider';
import { CASE_MEDIUM, posterPixelCache, createProgramWarmupMaterials } from './video-case';
import { isWhiteClamshell } from './packaging-formats';
import { retailAudio } from './audio';
import { isPublicDemo } from './demo-mode';
import { mobileStoreActive } from './mobile-store';
import { compileProgramsInStages, yieldForPrograms } from './program-warmup';

const stagedInitialRooms = new WeakSet<StoreScene>();

/** Resolve the real initial pose before deciding which colour programs block entry. */
export async function prepareInitialViewPrograms(scene: StoreScene): Promise<void> {
  // Returning rentals and saved alternate roots can move through other views
  // before entry; retain their full-room preparation instead of guessing a frame.
  if (scene.mode !== 'overview' || scene.returnDropWatch) {
    await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
      scene.composer?.readBuffer ?? null, scene.programWarmupController.signal);
    return;
  }
  stagedInitialRooms.add(scene);
  scene.snapCamera();
  const roots = new THREE.Group();
  roots.children = initialProgramObjects(scene.scene, scene.camera);
  try {
    await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
      scene.composer?.readBuffer ?? null, scene.programWarmupController.signal, roots);
  } finally { roots.children = []; }
}

export async function warmupRuntimePrograms(scene: StoreScene) {
  if (scene.warmedPrograms) return;
  scene.warmedPrograms = true;
  const signal = scene.programWarmupController.signal;
  // Explicit High keeps the complete depth-of-field/hero draw preparation.
  // Automatic phone tiers can prepare inspection materials after room entry.
  const background = (isPublicDemo || mobileStoreActive()) && scene.effectiveQuality !== 'high';
  let geo: THREE.BoxGeometry | undefined;
  let warmScene: THREE.Group | undefined;
  const bokehEnabled = scene.bokehPass?.enabled;
  try {
    // Let the newly interactive public overview paint before allocating probes.
    if (background) {
      await yieldForPrograms(signal);
      // Preserve preparation for later browsing, without making off-camera room
      // materials part of the initial entrance gate. This never draws the scene.
      if (stagedInitialRooms.has(scene)) {
        await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
          scene.composer?.readBuffer ?? null, signal);
        stagedInitialRooms.delete(scene);
      }
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
      if (background) return;
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
    }
    // The checkout bag's glossy-plastic variant (map + alphaTest + clearcoat
    // + DoubleSide) otherwise compiles mid-checkout on its first draw.
    const bagMat = scene.entrance?.getBagWarmupMaterial();
    if (bagMat) {
      const bagWarm = new THREE.Mesh(geo, bagMat);
      bagWarm.frustumCulled = false;
      warmScene.add(bagWarm);
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
    const t0 = performance.now();
    await compileProgramsInStages(scene.renderer, scene.scene, scene.camera,
      scene.composer?.readBuffer ?? null, signal, background ? warmScene : scene.scene);
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
    if (warmScene) scene.scene.remove(warmScene);
    geo?.dispose();
    if (!background && scene.bokehPass && bokehEnabled !== undefined) scene.bokehPass.enabled = bokehEnabled;
    if (!background) scene.hideHeroCases();
  }
}
