import * as THREE from 'three';
import type { FixtureContext } from './fixtures';
import { installDisplayModel } from './fixtures/display-model';
import { FRONT_GLASS_Z, STORE_CENTER_X } from './store-layout';

/** Proposed generic period equipment, not a photograph-verified store fixture.
 * Feet; curb bottom sits on store-shell's ceilingY + .85 structural slab.
 * Reserve the whole cabinet/service envelope inside the roof, away from entry.
 */
export function rooftopHVACAnchor(width: number, backZ: number, ceilingY: number) {
  if (![width, backZ, ceilingY].every(Number.isFinite) || width < 32 || FRONT_GLASS_Z - backZ < 24) return null;
  return { x: STORE_CENTER_X - width / 2 + 6.5, y: ceilingY + .85, z: FRONT_GLASS_Z - 5.5 };
}

export function buildRooftopHVAC(ctx: FixtureContext, width: number, backZ: number, ceilingY: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rooftopHVAC';
  const anchor = rooftopHVACAnchor(width, backZ, ceilingY);
  if (!anchor) return group;
  group.position.set(anchor.x, anchor.y, anchor.z);
  const finishes = {
    HVACCabinet: new THREE.MeshStandardMaterial({ color: 0xbab7a8, roughness: .72, metalness: .25 }),
    HVACCoil: new THREE.MeshStandardMaterial({ color: 0x42484a, roughness: .86, metalness: .35 }),
    HVACHardware: new THREE.MeshStandardMaterial({ color: 0x81898e, roughness: .48, metalness: .75 }),
    HVACCurb: new THREE.MeshStandardMaterial({ color: 0x6f7679, roughness: .83, metalness: .35 }),
  };
  const fallback = new THREE.Group();
  // Each role remains owned by this fallback through normal scene teardown.
  for (const [size, pos, mat] of [
    [[6.25,1.2,3.2],[0,.6,0],finishes.HVACCurb],
    [[6.42,2.48,3.58],[0,2.48,0],finishes.HVACCabinet],
    [[.04,1.9,3.3],[-3.23,2.5,0],finishes.HVACCoil],
    [[6.42,.12,3.64],[0,3.78,0],finishes.HVACHardware],
  ] as [number[], number[], THREE.Material][]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number, number, number]), mat);
    mesh.position.fromArray(pos); mesh.castShadow = mesh.receiveShadow = true; fallback.add(mesh);
  }
  group.add(fallback);
  const release = installDisplayModel(ctx, group, fallback, 'models/rooftop-hvac.glb', finishes);
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true; release();
  };
  group.addEventListener('removed', group.userData.dispose);
  return group;
}

export function disposeRooftopHVAC(scene: THREE.Scene): void {
  scene.getObjectByName('rooftopHVAC')?.userData.dispose?.();
}
