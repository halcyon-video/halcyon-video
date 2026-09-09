// Generic jewel construction lives in packaging-model. Only the two clear lid
// reflection layers are additional draws; no transparent shell over shelf stock.
import * as THREE from 'three';
import { makeGlassReflectionMaterial } from './glass-reflection';
import type { Movie } from './jellyfin';
import { isJewelCasePlatform } from './packaging-formats';
export { isJewelCasePlatform, JEWEL_FAT_DEPTH_IN } from './packaging-formats';
function glossPane(w: number, h: number, intensity: number): THREE.Mesh {
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    makeGlassReflectionMaterial({
      envMapIntensity: intensity,
      // THE ACTUAL BUG behind the white-patch blowout: makeGlassReflectionMaterial
      // puts `clearcoat`/`specularIntensity` at `layerGain`, which DEFAULTS TO 1
      // when omitted — so every envMapIntensity value tried here (1.35, 0.8, 0.5,
      // down to 0.05) left a full-strength, near-mirror (clearcoatRoughness 0.05)
      // second specular layer completely unthrottled on top. envMapIntensity
      // alone was NEVER going to fix this; layerGain had to move too. Tie it to
      // the same intensity so both layers scale together.
      layerGain: intensity,
      // A FLAT plane's reflection sweeps the environment across the face as
      // view direction shifts pixel to pixel — a bright room feature can land
      // as a clean white band rather than a small highlight. Root cause of
      // just how HOT that band gets: RoomEnvironment.js bakes a PointLight at
      // intensity 900 (three/examples/jsm/environments/RoomEnvironment.js) —
      // built for soft diffuse IBL fill, never meant for a near-mirror to
      // stare straight into.
      roughness: 0.22,
      // Read head-on like the CRT tubes, and indoors besides — the night
      // clamp exists for exterior glazing at grazing angles (see
      // glass-reflection.ts on holdAtDayGain).
      holdAtDayGain: false,
    }),
  );
  pane.castShadow = false;
  pane.receiveShadow = false;
  return pane;
}

export function syncJewelDressing(mesh: THREE.Mesh, movie: Movie | null, dims?: {w:number;h:number;d:number}): void {
  const key = movie?.game && dims && isJewelCasePlatform(movie.platform) ? `${dims.w}:${dims.h}:${dims.d}` : null;
  if (mesh.userData.jewelKey === key) return;
  const old = mesh.userData.jewelGroup as THREE.Group | undefined;
  if (old) {
    old.removeFromParent(); old.traverse(o => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    });
  }
  mesh.userData.jewelKey = key; mesh.userData.jewelGroup = undefined;
  if (!key || !dims) return;
  if (!mesh.userData.jewelRemovalCleanup) {
    mesh.addEventListener('removed', () => syncJewelDressing(mesh, null));
    mesh.userData.jewelRemovalCleanup = true;
  }
  const g = new THREE.Group(); g.name = 'jewel-lid-reflections';
  for (const sign of [1, -1]) {
    const pane = glossPane(dims.w - .008, dims.h - .008, .035);
    pane.position.z = sign * (dims.d / 2 - .0015);
    if (sign < 0) pane.rotation.y = Math.PI;
    pane.renderOrder = mesh.renderOrder + 1; g.add(pane);
  }
  mesh.add(g); mesh.userData.jewelGroup = g;
}
