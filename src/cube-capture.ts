import * as THREE from 'three';
import { compileProgramsInStages } from './program-warmup.ts';

/** Capture one cube face per idle slice; keep the displayed scene intact between slices. */
export async function captureCubeInSlices(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.CubeCamera,
  wait: () => Promise<void>, signal: AbortSignal,
  captureState: (draw: () => void) => void = draw => draw(),
): Promise<void> {
  camera.coordinateSystem = renderer.coordinateSystem;
  camera.updateCoordinateSystem();
  camera.updateMatrixWorld(true);
  // Compilation sees the capture's lighting without leaving it installed while
  // asynchronous driver polling yields back to navigation and the visible frame.
  const compileScene = scene.clone(false);
  compileScene.children = scene.children;
  captureState(() => {
    compileScene.environment = scene.environment;
    compileScene.environmentIntensity = scene.environmentIntensity;
  });
  await wait();
  await compileProgramsInStages(renderer, compileScene, camera.children[0] as THREE.Camera,
    camera.renderTarget, signal);
  for (let face = 0; face < 6; face++) {
    await wait(); signal.throwIfAborted();
    const target = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const xr = renderer.xr.enabled, mipmaps = camera.renderTarget.texture.generateMipmaps;
    const autoClear = renderer.autoClear;
    try {
      renderer.xr.enabled = false;
      renderer.autoClear = true;
      camera.renderTarget.texture.generateMipmaps = face === 5 && mipmaps;
      renderer.setRenderTarget(camera.renderTarget, face, camera.activeMipmapLevel);
      captureState(() => renderer.render(scene, camera.children[face] as THREE.Camera));
    } finally {
      renderer.setRenderTarget(target, previousFace, mip);
      camera.renderTarget.texture.generateMipmaps = mipmaps;
      renderer.xr.enabled = xr;
      renderer.autoClear = autoClear;
    }
  }
  camera.renderTarget.texture.needsPMREMUpdate = true;
}

export function captureSceneState(scene: THREE.Scene, extraHidden: THREE.Object3D[],
  environment: () => THREE.Texture | null = () => scene.environment,
  intensity: () => number = () => scene.environmentIntensity,
  suppressEmission = false): (draw: () => void) => void {
  const hidden = new Set(extraHidden);
  const objects: THREE.Object3D[] = [];
  const materials = new Set<THREE.MeshStandardMaterial>();
  scene.traverse(object => {
    if ((object as any).isReflector || hidden.has(object)) objects.push(object);
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material?.userData.bakeEmissiveOff || Number.isFinite(material?.userData.bakeEmissiveIntensity))
        materials.add(material as THREE.MeshStandardMaterial);
    }
  });
  return draw => {
    const oldEnv = scene.environment, oldIntensity = scene.environmentIntensity;
    const visibility = objects.map(object => object.visible);
    const emission = [...materials].map(material => material.emissiveIntensity);
    try {
      scene.environment = environment(); scene.environmentIntensity = intensity();
      for (const object of objects) object.visible = false;
      if (suppressEmission) for (const material of materials)
        material.emissiveIntensity = material.userData.bakeEmissiveOff ? 0 : material.userData.bakeEmissiveIntensity;
      draw();
    } finally {
      objects.forEach((object, i) => { object.visible = visibility[i]; });
      let i = 0; for (const material of materials) material.emissiveIntensity = emission[i++];
      scene.environment = oldEnv; scene.environmentIntensity = oldIntensity;
    }
  };
}

export async function captureEnvironmentInSlices(renderer: THREE.WebGLRenderer, scene: THREE.Scene,
  pmrem: THREE.PMREMGenerator, position: THREE.Vector3, resolution: number, bounces: number,
  hidden: THREE.Object3D[], wait: () => Promise<void>, signal: AbortSignal): Promise<THREE.WebGLRenderTarget> {
  let result: THREE.WebGLRenderTarget | null = null;
  const state = captureSceneState(scene, hidden, () => result?.texture ?? null, () => .95, true);
  try {
    for (let bounce = 0; bounce < bounces; bounce++) {
      const cube = new THREE.WebGLCubeRenderTarget(resolution, {type: THREE.HalfFloatType});
      const camera = new THREE.CubeCamera(.5, 1000, cube);
      camera.position.copy(position);
      try {
        await captureCubeInSlices(renderer, scene, camera, wait, signal, state);
        await wait(); signal.throwIfAborted();
        const next = pmrem.fromCubemap(cube.texture);
        result?.dispose(); result = next;
      } finally { cube.dispose(); }
    }
    return result!;
  } catch (error) { result?.dispose(); throw error; }
}
