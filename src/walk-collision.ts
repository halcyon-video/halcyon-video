import type { NavBounds, NavPoint, NavRect } from './clerk-nav.ts';

// Continuous motion against the same floor footprints used by the clerk.
// Inflate each oriented rectangle by the shopper's radius, stop at the first
// impact, then slide along its face. No allocations in the per-frame path.
export function constrainWalkObstacles(oldX: number, oldZ: number, newX: number, newZ: number,
  rects: readonly NavRect[], out: NavPoint, radius = .45, bounds?: NavBounds): NavPoint {
  let x = oldX, z = oldZ;
  // Camera checkpoints and a rebuilt floor can start inside an obstacle.
  // Resolve that overlap instead of trapping the shopper in the fixture.
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const rect of rects) {
      if (rect.label === 'structure:vestibule') continue; // door geometry owns this hollow room
      const c = Math.cos(rect.yaw), s = Math.sin(rect.yaw);
      const lx = (x - rect.cx) * c - (z - rect.cz) * s;
      const lz = (x - rect.cx) * s + (z - rect.cz) * c;
      const hx = rect.w / 2 + radius, hz = rect.d / 2 + radius;
      if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
      let bestX = x, bestZ = z, bestDistance = Infinity;
      for (let face = 0; face < 4; face++) {
        const alongX = face < 2;
        const push = alongX ? (face === 0 ? hx - lx + 1e-5 : -hx - lx - 1e-5)
          : (face === 2 ? hz - lz + 1e-5 : -hz - lz - 1e-5);
        const candidateX = x + push * (alongX ? c : s);
        const candidateZ = z + push * (alongX ? -s : c);
        if (bounds && (candidateX < bounds.minX || candidateX > bounds.maxX ||
          candidateZ < bounds.minZ || candidateZ > bounds.maxZ)) continue;
        // Joined cabinets overlap after radius inflation. Recover onto a
        // free face of the whole run, never into its neighboring cabinet.
        let clear = true;
        for (const other of rects) {
          if (other === rect || other.label === 'structure:vestibule') continue;
          const oc = Math.cos(other.yaw), os = Math.sin(other.yaw);
          const ox = (candidateX - other.cx) * oc - (candidateZ - other.cz) * os;
          const oz = (candidateX - other.cx) * os + (candidateZ - other.cz) * oc;
          if (Math.abs(ox) < other.w / 2 + radius && Math.abs(oz) < other.d / 2 + radius) { clear = false; break; }
        }
        if (!clear) continue;
        if (Math.abs(push) < bestDistance) {
          bestDistance = Math.abs(push); bestX = candidateX; bestZ = candidateZ;
        }
      }
      x = bestX; z = bestZ;
      moved = moved || Number.isFinite(bestDistance);
    }
    if (!moved) break;
  }
  let dx = newX - oldX, dz = newZ - oldZ;
  for (let impact = 0; impact < 4 && Math.hypot(dx, dz) > 1e-7; impact++) {
    let first = 1, normalX = 0, normalZ = 0, hit = false;
    for (const rect of rects) {
      if (rect.label === 'structure:vestibule') continue;
      const c = Math.cos(rect.yaw), s = Math.sin(rect.yaw);
      const px = (x - rect.cx) * c - (z - rect.cz) * s;
      const pz = (x - rect.cx) * s + (z - rect.cz) * c;
      const vx = dx * c - dz * s, vz = dx * s + dz * c;
      const hx = rect.w / 2 + radius, hz = rect.d / 2 + radius;
      if ((Math.abs(vx) < 1e-10 && Math.abs(px) >= hx) ||
          (Math.abs(vz) < 1e-10 && Math.abs(pz) >= hz)) continue;
      const tx1 = Math.abs(vx) < 1e-10 ? -Infinity : (-hx - px) / vx;
      const tx2 = Math.abs(vx) < 1e-10 ? Infinity : (hx - px) / vx;
      const tz1 = Math.abs(vz) < 1e-10 ? -Infinity : (-hz - pz) / vz;
      const tz2 = Math.abs(vz) < 1e-10 ? Infinity : (hz - pz) / vz;
      const nearX = Math.min(tx1, tx2), nearZ = Math.min(tz1, tz2);
      const enter = Math.max(nearX, nearZ), leave = Math.min(Math.max(tx1, tx2), Math.max(tz1, tz2));
      if (enter < 0 || enter > first || leave < enter) continue;
      first = enter; hit = true;
      if (nearX >= nearZ) {
        const sign = vx > 0 ? -1 : 1; normalX = sign * c; normalZ = -sign * s;
      } else {
        const sign = vz > 0 ? -1 : 1; normalX = sign * s; normalZ = sign * c;
      }
    }
    x += dx * first; z += dz * first;
    if (!hit) break;
    x += normalX * 1e-5; z += normalZ * 1e-5;
    dx *= 1 - first; dz *= 1 - first;
    const inward = Math.min(0, dx * normalX + dz * normalZ);
    dx -= inward * normalX; dz -= inward * normalZ;
  }
  out.x = x; out.z = z;
  return out;
}
