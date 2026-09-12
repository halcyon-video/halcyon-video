import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { activeStoreFormat } from '../store-format';
import { installDisplayModel } from './display-model';

// Feet. Origin is the center of the backplate on the interior wall surface.
// Local +Z faces the room; cord remains above floor, outside the exit opening.
export const WALL_COURTESY_PHONE = { height: 4.65, doorGap: .35, halfWidth: .285 } as const;

export function buildWallCourtesyTelephone(
  ctx: FixtureContext, facade: THREE.Group, wallX: number, doorBackZ: number,
): THREE.Group | null {
  if (ctx.activeTheme.id !== 'bb-1993' || activeStoreFormat().id !== 'corporate') return null;
  const group = new THREE.Group(); group.name = 'wall-courtesy-telephone';
  group.position.set(wallX, WALL_COURTESY_PHONE.height,
    doorBackZ - WALL_COURTESY_PHONE.doorGap - WALL_COURTESY_PHONE.halfWidth);
  group.rotation.y = -Math.PI / 2;
  const fallback = new THREE.Group(); group.add(fallback);
  // This was an absent fixture: preserve absence on failure/in-flight loading.
  facade.add(group);
  const release = installDisplayModel(ctx, group, fallback, 'models/wall-courtesy-telephone.glb', {});
  group.userData.dispose = release;
  facade.addEventListener('removed', release);
  group.addEventListener('removed', release);
  return group;
}
