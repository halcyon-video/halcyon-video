import * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const preparedPrograms = new WeakSet<THREE.WebGLProgram>();

/** Yield between driver operations, and stop promptly on teardown or context loss. */
export async function yieldForPrograms(signal: AbortSignal): Promise<void> {
  do {
    signal.throwIfAborted();
    await new Promise<void>(resolve => setTimeout(resolve, 16));
    signal.throwIfAborted();
  } while (typeof document !== 'undefined' && document.hidden);
}

/** Three's compiler with cooperative batches and cancellable completion polling.
 * compileAsync polls materials that may already have been disposed on teardown.
 * Poll the submitted GL handles instead, checking cancellation before every query.
 * No shader source or cache key is generated here: Three still owns compilation.
 */
export async function compileProgramsInStages(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  target: THREE.WebGLRenderTarget | null, signal: AbortSignal,
  roots: THREE.Object3D = scene,
  progress?: (fraction: number, detail: string) => void,
  options: { batchSize?: number; beforeWork?: () => Promise<void>; flatRoots?: boolean } = {},
): Promise<void> {
  signal.throwIfAborted();
  const maxBatchSize = options.batchSize ?? 32;
  const beforeWork = options.beforeWork ?? (() => yieldForPrograms(signal));
  const gl = renderer.getContext();
  const extension = gl.getExtension('KHR_parallel_shader_compile');
  const objects: THREE.Object3D[] = [];
  const signatures = new Set<string>();
  const collect = (object: THREE.Object3D) => {
    // Some surfaces mirror another material's maps in onBeforeRender. Give
    // those surfaces their explicit, draw-free preparation hook before compile.
    object.userData.prepareProgram?.();
    const mesh = object as THREE.Mesh;
    if (!mesh.material) return;
    // Exact shared geometry/material pairs have the same shader inputs. Keep
    // special mesh kinds separate (skinning, instancing, batching).
    if (mesh.type === 'Mesh' && !(mesh as THREE.InstancedMesh).isInstancedMesh
        && !(mesh as THREE.SkinnedMesh).isSkinnedMesh && !(mesh as THREE.BatchedMesh).isBatchedMesh) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const key = mesh.geometry.uuid + ':' + mats.map(m => m.uuid).join(',');
      if (signatures.has(key)) return;
      signatures.add(key);
    }
    objects.push(object);
  };
  // An opening-view snapshot is already selected. Traversing its descendants
  // would pull hidden and off-camera fixture programs back onto the entry path.
  if (options.flatRoots) roots.children.forEach(collect);
  else roots.traverse(collect);
  const batch = new THREE.Group();
  const empty = new THREE.Scene();
  const batchSize = extension ? Math.max(1, Math.floor(maxBatchSize)) : 1;
  let submitted = 0;
  let lastYield = -Infinity;
  for (let i = 0; i < objects.length; i += batchSize) {
    // Background material warmups can submit one drawable at a time. Cached programs can
    // share a short task; a driver operation that exhausts the budget yields
    // before the next drawable, even when parallel compilation is available.
    if ((extension && maxBatchSize > 1) || performance.now() - lastYield >= 8) {
      await beforeWork();
      lastYield = performance.now();
    }
    signal.throwIfAborted();
    if (gl.isContextLost()) return;
    const previous = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const autoClear = renderer.autoClear;
    const localClipping = renderer.localClippingEnabled;
    const shadowUpdate = renderer.shadowMap.needsUpdate;
    try {
      renderer.setRenderTarget(target);
      // An empty render initializes Three's clipping state without touching the
      // scene or drawing. A prior reflection may have left one clipping plane.
      renderer.autoClear = false;
      renderer.localClippingEnabled = true;
      renderer.render(empty, camera);
      // A mesh can own child lights/meshes already present in targetScene.
      // Compiling its whole subtree counts those lights twice (or once per
      // ancestor), producing nonexistent shader variants and sampler overflow.
      // Draw-free shallow views preserve mesh flags without changing the live
      // hierarchy or copying large instancing buffers.
      batch.children = objects.slice(i, i + batchSize).map(object => {
        if (object.children.length === 0) return object;
        const view = Object.create(object) as THREE.Object3D;
        view.children = [];
        return view;
      });
      renderer.compile(batch, camera, scene);
      submitted = Math.min(objects.length, i + batchSize);
      progress?.((extension ? .5 : .9) * submitted / objects.length, `Preparing materials · ${Math.min(i + batchSize, objects.length)} of ${objects.length}`);
    } finally {
      batch.children = [];
      renderer.autoClear = autoClear;
      renderer.localClippingEnabled = localClipping;
      renderer.shadowMap.needsUpdate = shadowUpdate;
      renderer.setRenderTarget(previous, face, mip);
    }
    // Without completion polling, a status query can wait for EVERYTHING
    // already submitted to the driver. Drain each family before submitting
    // the next; merely splitting queries after submitting all links still stalls.
    // Background work must also drain each submitted family: some drivers
    // defer uniform reflection until first use even after parallel completion.
    // Queuing the room first makes that first query wait on the entire batch.
    if (!extension || maxBatchSize === 1) await prepareBindings();
  }
  await prepareBindings();
  progress?.(1, 'Graphics ready');

  async function prepareBindings() {
    const programs = (renderer.info.programs ?? []).filter(program => !preparedPrograms.has(program));
    // Keep the Three owner, not just its GL handle: an asynchronous model swap
    // can dispose its last material while this scene remains alive.
    const pending = programs.slice();
    if (extension) {
      while (pending.length) {
        await beforeWork();
        signal.throwIfAborted();
        if (gl.isContextLost()) return;
        for (let j = pending.length - 1; j >= 0; j--) {
          if (!pending[j].program || gl.getProgramParameter(pending[j].program as WebGLProgram, extension.COMPLETION_STATUS_KHR)) pending.splice(j, 1);
        }
        progress?.(.5 + .25 * (programs.length - pending.length) / Math.max(1, programs.length),
          `Compiling graphics · ${programs.length - pending.length} of ${programs.length}`);
      }
    }
    let bound = 0, bindingYield = -Infinity;
    for (const program of programs) {
      if (performance.now() - bindingYield >= 8) {
        await beforeWork(); bindingYield = performance.now();
      }
      signal.throwIfAborted();
      if (gl.isContextLost()) return;
      if (!program.program) continue; // Retired during a yielded completion/binding step.
      if (!extension) gl.getProgramParameter(program.program as WebGLProgram, gl.LINK_STATUS);
      // Drivers also defer uniform/attribute reflection until first use. Prime
      // Three's cached bindings one program per task, instead of doing every
      // first-use query in the first composite even after parallel linking.
      program.getUniforms();
      program.getAttributes();
      preparedPrograms.add(program);
      bound++;
      progress?.(extension ? .75 + .25 * bound / programs.length : .9 * submitted / Math.max(1, objects.length), `Preparing graphics · ${bound} of ${programs.length}`);
    }
  }
}

/** Prepare static room maps before a camera move exposes them together. Shader
 * compilation alone never uploads them. Keep each driver call behind the same
 * interaction gate as compilation, and never revive a texture retired in a yield.
 */
export async function prepareStaticTextures(
  renderer: THREE.WebGLRenderer, roots: THREE.Object3D, signal: AbortSignal,
  beforeWork: () => Promise<void> = () => yieldForPrograms(signal),
): Promise<void> {
  const textures = new Set<THREE.Texture>();
  const collect = (value: unknown) => {
    if (value instanceof THREE.Texture && !value.isRenderTargetTexture
        && !(value as THREE.VideoTexture).isVideoTexture) textures.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
  };
  roots.traverse(object => {
    const material = (object as THREE.Mesh).material;
    for (const mat of Array.isArray(material) ? material : material ? [material] : []) {
      Object.values(mat).forEach(collect);
      if ((mat as THREE.ShaderMaterial).uniforms) {
        Object.values((mat as THREE.ShaderMaterial).uniforms).forEach(uniform => collect(uniform.value));
      }
    }
  });
  const retired = new Set<THREE.Texture>();
  const onDispose = (event: { target: THREE.Texture }) => { retired.add(event.target); };
  textures.forEach(texture => texture.addEventListener('dispose', onDispose));
  try {
    for (const texture of textures) {
      // Three tracks the uploaded texture version; its normal draw may already
      // have paid this cost while we yielded. Live video/render targets have
      // separate owners and must never be initialized by background preparation.
      const pending = () => !retired.has(texture) && texture.version > 0
        && texture.image != null && (renderer.properties.get(texture) as { __version?: number }).__version !== texture.version;
      signal.throwIfAborted();
      if (!pending()) continue;
      await beforeWork();
      signal.throwIfAborted();
      if (renderer.getContext().isContextLost()) return;
      if (pending()) renderer.initTexture(texture);
    }
  } finally {
    textures.forEach(texture => texture.removeEventListener('dispose', onDispose));
  }
}

const SHADOW_SIDE: Record<number, THREE.Side> = {
  [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide,
};

/** Shadow casters wearing the depth material Three's shadow pass derives for
 * them (WebGLShadowMap.getDepthMaterial), one view per program signature.
 * renderer.compile never visits the shadow pass, so without these views its
 * depth programs link synchronously inside the first shadow bake. A disposed
 * material releases its program, so these live until `signal` aborts.
 * Directional/spot shadows only; point-light distance materials are not used.
 */
export function shadowDepthProgramViews(
  root: THREE.Object3D, shadowType: THREE.ShadowMapType, signal: AbortSignal,
): THREE.Group {
  const views = new THREE.Group();
  if (signal.aborted) return views;
  const owned: THREE.Material[] = [];
  const seen = new Set<string>();
  const vsm = shadowType === THREE.VSMShadowMap;
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material || !(mesh.isMesh || (object as THREE.Line).isLine || (object as THREE.Points).isPoints)) return;
    if (!(mesh.castShadow || (vsm && mesh.receiveShadow)) || (mesh as THREE.BatchedMesh).isBatchedMesh) return;
    const geometry = mesh.geometry;
    const kind = [(mesh as THREE.InstancedMesh).isInstancedMesh ? 'i' : '', (mesh as THREE.SkinnedMesh).isSkinnedMesh ? 's' : '',
      (mesh as THREE.InstancedMesh).instanceColor ? 'c' : '', mesh.isMesh ? 'm' : object.type,
      Object.keys(geometry?.morphAttributes ?? {}).join('+'), geometry?.morphAttributes?.position?.length ?? 0].join('');
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material?.visible) continue;
      const m = material as THREE.MeshStandardMaterial;
      const custom = mesh.customDepthMaterial;
      const side = custom ? custom.side : vsm ? (m.shadowSide ?? m.side) : (m.shadowSide ?? SHADOW_SIDE[m.side]);
      const signature = custom ? `custom:${custom.uuid}:${kind}` : [kind, side, m.map?.channel, (m.map as THREE.VideoTexture | null)?.isVideoTexture && m.map?.colorSpace,
        m.alphaMap?.channel, m.alphaTest > 0 || m.alphaToCoverage, m.displacementMap?.channel, m.wireframe,
        m.clipShadows && m.clippingPlanes?.length].join('|');
      if (seen.has(signature)) continue;
      seen.add(signature);
      let depth = custom;
      if (!depth) {
        const d = new THREE.MeshDepthMaterial();
        d.side = side; d.wireframe = m.wireframe;
        d.map = m.map ?? null; d.alphaMap = m.alphaMap ?? null;
        d.alphaTest = m.alphaToCoverage ? .5 : m.alphaTest;
        d.displacementMap = m.displacementMap ?? null;
        d.displacementScale = m.displacementScale ?? 1; d.displacementBias = m.displacementBias ?? 0;
        d.clipShadows = m.clipShadows; d.clippingPlanes = m.clippingPlanes; d.clipIntersection = m.clipIntersection;
        owned.push(d);
        depth = d;
      }
      const view = Object.create(object) as THREE.Mesh;
      view.material = depth;
      view.children = [];
      view.userData = {};
      views.children.push(view);
    }
  });
  signal.addEventListener('abort', () => owned.forEach(m => m.dispose()), { once: true });
  return views;
}

/** Submit the post-processing chain's programs to the driver alongside the
 * room's; the composer otherwise links each one synchronously in its first
 * frame. Each pass compiles against the target it draws to (the last enabled
 * pass draws to the screen). OutputPass derives its defines from renderer
 * state inside render(), so that runs once with its draw skipped.
 */
export function submitPostPrograms(renderer: THREE.WebGLRenderer, composer: EffectComposer, camera: THREE.Camera): void {
  // Like FullScreenQuad's triangle: no normals (they are part of the program key).
  const geometry = new THREE.PlaneGeometry(2, 2);
  geometry.deleteAttribute('normal');
  const quad = new THREE.Mesh(geometry);
  const previous = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
  try {
    composer.passes.forEach((pass, index) => {
      if (!pass.enabled) return;
      const toScreen = composer.renderToScreen && composer.isLastEnabledPass(index);
      if (pass instanceof OutputPass) {
        const fsQuad = (pass as unknown as { _fsQuad: { render: (r: THREE.WebGLRenderer) => void } })._fsQuad;
        const draw = fsQuad.render;
        fsQuad.render = () => {};
        try { pass.render(renderer, composer.writeBuffer, composer.readBuffer, 0, false); } finally { fsQuad.render = draw; }
      }
      // Full-screen materials sit on the pass itself or one level down
      // (e.g. a custom pass's { quad, mat } copy pair).
      const materials = new Set<THREE.Material>();
      for (const value of Object.values(pass)) {
        if (value instanceof THREE.Material) materials.add(value);
        else if (value && typeof value === 'object' && !(value instanceof THREE.Object3D)) {
          for (const inner of [(value as { mat?: unknown }).mat, (value as { material?: unknown }).material]) {
            if (inner instanceof THREE.Material) materials.add(inner);
          }
        }
      }
      renderer.setRenderTarget(toScreen ? null : composer.writeBuffer);
      for (const material of materials) {
        quad.material = material;
        renderer.compile(quad, camera);
      }
    });
  } finally {
    renderer.setRenderTarget(previous, face, mip);
    quad.geometry.dispose();
  }
}
