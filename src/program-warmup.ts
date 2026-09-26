import * as THREE from 'three';

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
  options: { batchSize?: number; beforeWork?: () => Promise<void> } = {},
): Promise<void> {
  const maxBatchSize = options.batchSize ?? 32;
  const beforeWork = options.beforeWork ?? (() => yieldForPrograms(signal));
  const gl = renderer.getContext();
  const extension = gl.getExtension('KHR_parallel_shader_compile');
  const objects: THREE.Object3D[] = [];
  const signatures = new Set<string>();
  roots.traverse(object => {
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
  });
  const batch = new THREE.Group();
  const empty = new THREE.Scene();
  const batchSize = extension ? Math.max(1, Math.floor(maxBatchSize)) : 1;
  let submitted = 0;
  let lastYield = -Infinity;
  for (let i = 0; i < objects.length; i += batchSize) {
    // Background callers submit one drawable at a time. Cached programs can
    // share a short task; a driver operation that exhausts the budget yields
    // before the next drawable, even when parallel compilation is available.
    if ((extension && maxBatchSize > 1) || performance.now() - lastYield >= 8) {
      await beforeWork();
      lastYield = performance.now();
    }
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
