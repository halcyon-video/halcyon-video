import * as THREE from 'three';
import type { StoreScene } from './three-scene';
import { captureCubeInSlices, captureSceneState } from './cube-capture';
import { setReflectionProbes } from './video-case';
import { yieldForPrograms } from './program-warmup';
import { getLastUserActivity } from './user-activity';
import { stockPlacementSettled } from './mirror-cubemap-lifecycle';
import { liveMirrorsAllowed, shouldCaptureMirrorRoomProbe } from './store-mirrors';
import { STORE_CENTER_X, FRONT_GLASS_Z } from './store-layout';

const running = new WeakSet<StoreScene>();
export const reflectionRefreshRunning = (store: StoreScene): boolean => running.has(store);
/** Keep the old generation visible until the complete replacement is captured. */
export function refreshStockedReflections(store: StoreScene): void {
  if (running.has(store)) return;
  running.add(store);
  const signal = store.programWarmupController.signal;
  const version = store.mirrorCubemap.version;
  const wait = async () => {
    do {
      await yieldForPrograms(signal);
      if (store.mirrorCubemap.version !== version) throw new Error('Reflection capture invalidated');
    } while (store.reflectionInteractionActive || performance.now() - getLastUserActivity() < 2500 ||
      !!store.launchAnim || !stockPlacementSettled(store.hadAnimatingSlots ? 1 : 0, store.dirtySlots));
  };
  void (async () => {
    const targets: THREE.WebGLCubeRenderTarget[] = [];
    let panorama: THREE.WebGLCubeRenderTarget | null = null;
    try {
      await store.outdoor.rebakeEnvironmentInSlices(wait, signal);
      const positions = [-2, 6, 14, 22].map(x => new THREE.Vector3(x, 5.5, store.scaleZ(-15)));
      positions.push(new THREE.Vector3(11, 5.5, store.backWallZ + 10));
      const state = captureSceneState(store.scene, store.selectionArrow ? [store.selectionArrow] : []);
      for (const position of positions) {
        const target = new THREE.WebGLCubeRenderTarget(store.softwareGL ? 64 : 512,
          {generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter});
        targets.push(target);
        const camera = new THREE.CubeCamera(.1, 1000, target); camera.position.copy(position);
        await captureCubeInSlices(store.renderer, store.scene, camera, wait, signal, state);
      }
      if (shouldCaptureMirrorRoomProbe(localStorage.getItem('bb_reflections'), liveMirrorsAllowed(store), true)) {
        panorama = new THREE.WebGLCubeRenderTarget(1024,
          {generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter});
        const camera = new THREE.CubeCamera(.1, 1000, panorama);
        camera.position.set(STORE_CENTER_X, Math.min(9, store.ceilingY - 1.5), FRONT_GLASS_Z - 15);
        await captureCubeInSlices(store.renderer, store.scene, camera, wait, signal, state);
      }
      await wait();
      const previous = store.probeRenderTargets;
      store.probeRenderTargets = targets;
      setReflectionProbes(targets.map(target => target.texture));
      previous.forEach(target => target.dispose());
      if (panorama) { store.mirrorCubemap.replace(panorama); panorama = null; }
      store.mirrorCubemap.settled();
      store.updateLOD(); store.requestRender();
    } catch (error) {
      targets.forEach(target => target.dispose()); panorama?.dispose();
      if (!signal.aborted && store.mirrorCubemap.version === version)
        { store.mirrorCubemap.pending = false; console.warn('Deferred reflection capture failed', error); }
    } finally { running.delete(store); }
  })();
}
