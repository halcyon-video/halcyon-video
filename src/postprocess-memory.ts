import type { WebGLRenderTarget } from 'three';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** These targets only receive fullscreen quads; they never test scene depth.
 * Keep HDR colour, dimensions, filtering and all effect settings unchanged.
 * Call before first render: changing attachments on a live target needs disposal.
 */
export function omitPostprocessDepth(target: WebGLRenderTarget): void {
  target.depthBuffer = false;
  target.stencilBuffer = false;
}

export function omitBloomDepth(pass: UnrealBloomPass): void {
  // Bound the bloom input, preserving the original HDR scene and highlight hue.
  // A sharp sunset reflection must not turn into an unbounded blurred fireball.
  pass.materialHighPassFilter.fragmentShader = pass.materialHighPassFilter.fragmentShader.replace(
    'float v = luminance( texel.xyz );',
    'texel.rgb *= min(1.0, 4.0 / max(max(texel.r, texel.g), max(texel.b, 0.0001))); float v = luminance( texel.xyz );',
  );
  omitPostprocessDepth(pass.renderTargetBright);
  pass.renderTargetsHorizontal.forEach(omitPostprocessDepth);
  pass.renderTargetsVertical.forEach(omitPostprocessDepth);
}
