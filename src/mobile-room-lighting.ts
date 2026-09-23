import * as THREE from 'three';
import { assetUrl } from './asset-url';
import { compactAssets } from './mobile-assets';
import { getActiveTheme } from './themes';

const rooms = new WeakMap<THREE.Scene, {original: THREE.Texture | null; texture: THREE.DataTexture; intensity: number}>();
export function updateMobileRoomLighting(scene: THREE.Scene, mode: string): void {
  const room = rooms.get(scene); if (!room) return;
  if (scene.environment !== room.texture && scene.environment !== room.original) { rooms.delete(scene); return; }
  scene.environment = mode === 'day' ? room.texture : room.original;
  scene.environmentIntensity = mode === 'day' ? room.intensity : .55;
}

/** Offline Three.js PMREM bake of the shipped daytime room, including its real
 * ceiling lights, shelving and finishes. Mobile samples this prefiltered map;
 * it never renders six room views or recompiles the store to bake reflections.
 * Floor/wall contact AO and static cast shadows remain layout-specific.
 */
export function loadMobileRoomLighting(scene: THREE.Scene, signal: AbortSignal, render: () => void, mode: () => string): () => void {
  let texture: THREE.DataTexture | undefined, disposed = false;
  const era = getActiveTheme().id;
  if (!compactAssets() ||
      (localStorage.getItem('bb_outside') || 'day') !== 'day' || typeof DecompressionStream === 'undefined') return () => {};
  const original = scene.environment;
  void Promise.all([
    fetch(assetUrl(`lighting/${era}/store-environment.json`), {signal}).then(r => { if (!r.ok) throw Error('Lighting metadata unavailable'); return r.json(); }),
    fetch(assetUrl(`lighting/${era}/store-environment.bin.gz`), {signal}).then(async r => {
      if (!r.ok) throw Error('Lighting map unavailable');
      const bytes = await r.arrayBuffer();
      // Some static hosts send Content-Encoding: gzip for .gz files, so fetch
      // has already decoded them. Others deliver the compressed bytes verbatim.
      const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
      return signature[0] === 31 && signature[1] === 139
        ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
        : bytes;
    }),
  ]).then(([meta, buffer]) => {
    if (disposed || signal.aborted || scene.environment !== original) return;
    if (!Number.isInteger(meta.width) || !Number.isInteger(meta.height) || meta.width * meta.height * 8 !== buffer.byteLength) throw Error('Invalid baked lighting');
    texture = new THREE.DataTexture(new Uint16Array(buffer), meta.width, meta.height, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.name = `Offline daytime ${era} store lighting`;
    texture.mapping = THREE.CubeUVReflectionMapping;
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false; texture.needsUpdate = true;
    rooms.set(scene, {original, texture, intensity: meta.intensity});
    updateMobileRoomLighting(scene, mode());
    render();
  }).catch(error => { if (!signal.aborted && !disposed) console.warn('[lighting] Keeping fallback room lighting:', error); });
  return () => { disposed = true; rooms.delete(scene); if (scene.environment === texture) scene.environment = original; texture?.dispose(); };
}
