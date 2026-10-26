import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HOSTED_BUILD } from './asset-url.ts';

/** Static hosts send .glb files uncompressed, and on a phone connection the
 * checkout counter alone was 410 KB of geometry the startup reveal waits for
 * (issue #401). The hosted build therefore writes a gzip twin beside every
 * bundled model (tools/compressed-models.mjs); geometry shrinks to about a
 * third. Local builds and browsers without DecompressionStream fetch the
 * plain file exactly as before. */
export const compressedModelsShipped = HOSTED_BUILD && typeof DecompressionStream !== 'undefined';

/** Bytes fetched from a gzip twin, as a glTF binary: gunzip them, pass them
 * through when the host already decoded a Content-Encoding: gzip response, or
 * null when they are neither (a host's HTML fallback page for a missing twin). */
export async function decodeModelBytes(bytes: ArrayBuffer): Promise<ArrayBuffer | null> {
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  if (head[0] === 0x1f && head[1] === 0x8b) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  // 'glTF' magic.
  return head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46 ? bytes : null;
}

/** Fetch a model's bytes, through its gzip twin when the build shipped one.
 * A missing or unreadable twin falls back to the plain file. */
export async function fetchModelBytes(url: string, init?: RequestInit, compressed = compressedModelsShipped): Promise<ArrayBuffer> {
  if (compressed && /\.glb$/i.test(url)) {
    try {
      const response = await fetch(url + '.gz', init);
      const decoded = response.ok ? await decodeModelBytes(await response.arrayBuffer()) : null;
      if (decoded) return decoded;
    } catch (error) {
      if (init?.signal?.aborted) throw error;
    }
  }
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.arrayBuffer();
}

let installed = false;

/** Route GLTFLoader.load of a .glb through its gzip twin on the hosted build,
 * with the loader's own bookkeeping: the same resource path, LoadingManager
 * item tracking and error callback. Everything else loads as before.
 * model-download-gate.ts installs this beneath its hold, so held decorative
 * downloads still wait for the counter. */
export function installCompressedModelLoads(): void {
  if (installed || !compressedModelsShipped) return;
  installed = true;
  const plain = GLTFLoader.prototype.load;
  GLTFLoader.prototype.load = function (this: GLTFLoader, ...args: Parameters<GLTFLoader['load']>) {
    const [url, onLoad, , onError] = args;
    if (!/\.glb$/i.test(url) || /^(blob|data):/i.test(url)) return plain.apply(this, args);
    const manager = this.manager;
    const resourcePath = this.resourcePath !== '' ? this.resourcePath
      : this.path !== '' ? THREE.LoaderUtils.resolveURL(THREE.LoaderUtils.extractUrlBase(url), this.path)
        : THREE.LoaderUtils.extractUrlBase(url);
    manager.itemStart(url);
    const failed = (error: unknown) => {
      if (onError) onError(error as ErrorEvent); else console.error(error);
      manager.itemError(url);
      manager.itemEnd(url);
    };
    fetchModelBytes(manager.resolveURL(this.path + url), {
      headers: this.requestHeader, credentials: this.withCredentials ? 'include' : 'same-origin',
    }).then(bytes => {
      try {
        this.parse(bytes, resourcePath, gltf => { onLoad(gltf); manager.itemEnd(url); }, failed);
      } catch (error) { failed(error); }
    }, failed);
  };
}
