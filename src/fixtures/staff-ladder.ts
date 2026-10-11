import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { installDisplayModel } from './display-model';

// Feet. Origin is the foot line on the ground, centred on the ladder; local -Z
// faces the wall it leans on, which sits WALL_OFFSET behind the origin
// (tools/models/staff-ladder.py: 14 degree lean, 7.2 ft rails).
export const STAFF_LADDER = { width: 1.44, wallOffset: 1.7583, lean: 14 * Math.PI / 180, railLength: 7.2 } as const;

/** Exterior dressing: a worn wooden ladder leaning on the service-door wall. */
export function buildStaffLadder(
  ctx: FixtureContext, facade: THREE.Group, wallFaceX: number, z: number,
): THREE.Group | null {
  if (ctx.activeTheme.id !== 'bb-1993') return null;
  const group = new THREE.Group(); group.name = 'staff-ladder';
  group.position.set(wallFaceX + STAFF_LADDER.wallOffset, 0, z);
  group.rotation.y = Math.PI / 2; // local -Z (wall side) -> world -X, toward the building
  const wood = new THREE.MeshStandardMaterial({ name: 'LadderRailWood', color: 0x6b5039, roughness: .78 });
  const rungWood = new THREE.MeshStandardMaterial({ name: 'LadderRungWood', color: 0x7a5c3f, roughness: .7 });
  const endGrain = new THREE.MeshStandardMaterial({ name: 'LadderEndGrain', color: 0x46321f, roughness: .9 });
  const iron = new THREE.MeshStandardMaterial({ name: 'LadderHardware', color: 0x8c8e92, roughness: .45, metalness: 1 });
  const materials = [wood, rungWood, endGrain, iron];
  const fallback = new THREE.Group(); group.add(fallback);
  const lean = new THREE.Group(); lean.rotation.x = -STAFF_LADDER.lean; fallback.add(lean);
  const railGeo = new THREE.BoxGeometry(.14, STAFF_LADDER.railLength, .11);
  const rungGeo = new THREE.CylinderGeometry(.038, .038, 1.4, 8); rungGeo.rotateZ(Math.PI / 2);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, wood); rail.position.set(s * .62, STAFF_LADDER.railLength / 2, 0); lean.add(rail);
  }
  for (let k = 0; k < 7; k++) {
    const rung = new THREE.Mesh(rungGeo, rungWood); rung.position.set(0, .8 + k, 0); lean.add(rung);
  }
  fallback.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true; });
  facade.add(group);
  const release = installDisplayModel(ctx, group, fallback, 'models/staff-ladder.glb', {
    LadderRailWood: wood, LadderRungWood: rungWood, LadderEndGrain: endGrain, LadderHardware: iron,
  });
  let cleaned = false;
  const dispose = () => {
    if (cleaned) return;
    cleaned = true; release();
    railGeo.dispose(); rungGeo.dispose(); materials.forEach(m => m.dispose());
  };
  group.userData.dispose = dispose;
  facade.addEventListener('removed', dispose);
  group.addEventListener('removed', dispose);
  return group;
}
