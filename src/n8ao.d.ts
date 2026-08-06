// Minimal typings for the n8ao package (ships no .d.ts). Only the surface
// this app touches — see https://github.com/n8python/n8ao for the full API.
declare module 'n8ao' {
  import type { Scene, Camera, Color, WebGLRenderer, WebGLRenderTarget } from 'three';
  import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

  export interface N8AOConfiguration {
    aoSamples: number;
    denoiseSamples: number;
    denoiseRadius: number;
    aoRadius: number;
    distanceFalloff: number;
    intensity: number;
    color: Color;
    halfRes: boolean;
    depthAwareUpsampling: boolean;
    accumulate: boolean;
    gammaCorrection: boolean;
    screenSpaceRadius: boolean;
    transparencyAware: boolean;
    renderMode: 0 | 1 | 2 | 3 | 4;
    /**
     * When false the pass does NOT draw the scene, and composites AO over
     * whatever `beautyRenderTarget` already holds. That's the hook the partial
     * composite (src/partial-composite.ts) uses to skip a redundant scene draw.
     */
    autoRenderBeauty: boolean;
  }

  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: N8AOConfiguration;
    /** Beauty (pre-AO scene draw) target, with its own depth texture. */
    beautyRenderTarget: WebGLRenderTarget;
    setQualityMode(
      mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra' |
        'Neural-Low' | 'Neural-Medium' | 'Neural-High'
    ): void;
    setSize(width: number, height: number): void;
    render(
      renderer: WebGLRenderer,
      writeBuffer: WebGLRenderTarget,
      readBuffer: WebGLRenderTarget,
      deltaTime?: number,
      maskActive?: boolean
    ): void;
    enableDebugMode(): void;
    disableDebugMode(): void;
    dispose(): void;
  }

  // pmndrs/postprocessing variant — unused here, typed for completeness.
  export class N8AOPostPass extends N8AOPass {}
}
