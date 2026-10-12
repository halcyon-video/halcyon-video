import * as THREE from 'three';
import type { FixtureContext } from '../fixtures';
import { installDisplayModel } from './display-model';

/** One straight moulding run, in the fixture's world frame (feet). */
export interface AlcoveMouldingRun {
  kind: 'skirting' | 'crown';
  /** Centre of the run on the wall face it sits against. */
  x: number; z: number;
  /** Length along the wall. */
  length: number;
  /** Yaw that points the profile's +X (its projection) away from the wall. */
  yaw: number;
}

export interface AlcovePartitionPlacement {
  planeX: number; doorCenterZ: number;
  /** Which store corner; the sales-floor face is at -side in X. */
  side: 1 | -1;
  ceilingY: number;
  runs: AlcoveMouldingRun[];
}

/** #231 trim: authored door surround, jamb linings, rail brackets, header cap and
 * partition mouldings, added over the procedural partitions. The partitions keep
 * their box meshes and colliders, so a failed load leaves the plain walls. The
 * door pieces are authored about the doorway centre (sales face -X); the unit
 * mouldings are cloned and stretched along their length only.
 */
export function installAlcovePartition(
  ctx: FixtureContext, parent: THREE.Group, trimMaterial: THREE.Material, at: AlcovePartitionPlacement,
): () => void {
  const anchor = new THREE.Group();
  anchor.name = 'alcove-partition';
  anchor.position.set(at.planeX, 0, at.doorCenterZ);
  parent.add(anchor);
  const fallback = new THREE.Group();
  anchor.add(fallback);
  const remove = installDisplayModel(ctx, anchor, fallback, 'models/alcove-partition.glb',
    { AlcoveTrimTimber: trimMaterial }, new THREE.Vector3(1, 1, 1), model => {
      const part = (name: string) => model.getObjectByName(name) as THREE.Mesh | undefined;
      const door = new THREE.Group();
      door.name = 'alcove-door-trim';
      door.rotation.y = at.side > 0 ? 0 : Math.PI;
      for (const name of ['AlcoveDoorSurround', 'AlcoveJambLining', 'AlcoveRailBracket', 'AlcoveBracketScrew', 'AlcoveHeaderCap']) {
        const mesh = part(name);
        if (!mesh) throw new Error(`alcove-partition.glb is missing ${name}`);
        mesh.removeFromParent();
        // Sign board and cap need head room under the ceiling.
        if (name === 'AlcoveHeaderCap' && at.ceilingY < 8) { mesh.geometry.dispose(); continue; }
        door.add(mesh);
      }
      const sources = { skirting: part('AlcoveSkirting'), crown: part('AlcoveCrown') };
      if (!sources.skirting || !sources.crown) throw new Error('alcove-partition.glb is missing a moulding');
      const used = { skirting: false, crown: false };
      for (const run of at.runs) {
        if (run.kind === 'crown' && at.ceilingY < 8.3) continue; // would meet the header cap
        if (run.length < 0.05) continue;
        const src = sources[run.kind]!;
        // The first run reuses the loaded mesh; the rest share its geometry/material.
        const mesh = used[run.kind] ? src.clone() : src;
        used[run.kind] = true;
        mesh.position.set(run.x - at.planeX, run.kind === 'crown' ? at.ceilingY : 0, run.z - at.doorCenterZ);
        mesh.rotation.y = run.yaw;
        mesh.scale.set(1, 1, run.length);
        model.add(mesh);
      }
      // Unused sources would leak their geometry: only run meshes stay in the model.
      for (const kind of ['skirting', 'crown'] as const) {
        if (!used[kind]) { sources[kind]!.geometry.dispose(); sources[kind]!.removeFromParent(); }
      }
      model.add(door);
    });
  return remove;
}
