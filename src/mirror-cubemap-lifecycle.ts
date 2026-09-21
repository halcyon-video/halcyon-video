import type { Texture, WebGLCubeRenderTarget } from 'three';

/** A room panorama is valid only after the stock-placement wave has settled. */
export function shouldCaptureMirrorRoomProbe(
  mode: string | null, liveMirrors: boolean, stockedReflectionReady: boolean
): boolean {
  return mode === 'cubemap' && liveMirrors && stockedReflectionReady;
}

export function stockPlacementSettled(
  movingSlots: number, dirtySlots: Iterable<{ needsInitialMatrixUpdate?: boolean }>
): boolean {
  if (movingSlots > 0) return false;
  for (const slot of dirtySlots) if (slot.needsInitialMatrixUpdate) return false;
  return true;
}

/** Owns the one retained, fully-stocked room panorama and its refresh state. */
export class MirrorCubemapLifecycle {
  pending = false;
  ready = false;
  probe: Texture | null = null;
  private target: WebGLCubeRenderTarget | null = null;

  beginStockBuild() { this.ready = false; this.pending = false; }
  finishStockBuild() { this.pending = true; }
  stockChanged() { this.ready = false; this.pending = true; }
  settled() { this.ready = true; this.pending = false; }
  replace(target: WebGLCubeRenderTarget) {
    const previous = this.target;
    this.target = target;
    this.probe = target.texture;
    previous?.dispose();
  }
  dispose() {
    this.target?.dispose();
    this.target = null;
    this.probe = null;
  }
}
