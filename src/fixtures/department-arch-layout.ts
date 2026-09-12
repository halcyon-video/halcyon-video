import { validateLayout, validateHeadroom, type Footprint } from '../layout-validator.ts';

/** Fit dimensions of the original portal; these are not surveyed dimensions. */
export const DEPARTMENT_ARCH = { centers: 4.5, footWidth: .64, depth: .5,
  postWidth: .30, spring: 7.5, apex: 10.25, minCeiling: 13.5 } as const;

export function departmentArchFeet(x: number, z: number, yaw = 0): Footprint[] {
  return [-1, 1].map((side) => ({ label: `structure:department-arch-${side < 0 ? 'left' : 'right'}`,
    kind: 'structure', cx: x + side * 2.25 * Math.cos(yaw),
    cz: z - side * 2.25 * Math.sin(yaw), w: .64, d: .5, yaw }));
}

export interface DepartmentArchHost {
  format: string; ceiling: number; exposed: boolean;
  /** Actual left-wall bay footprint, including end panels, in world feet. */
  bay: { frontZ: number; wallX: number; depth: number; length: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  obstacles: Footprint[];
}

export function fitDepartmentArch(host: DepartmentArchHost): { x: number; z: number } | null {
  if (host.format !== 'corporate' || !host.exposed || host.ceiling < DEPARTMENT_ARCH.minCeiling || host.bay.length < 4) return null;
  if (validateHeadroom([{ label: 'department-arch', undersideY: 7.48, topY: 10.27 }], host.ceiling).length) return null;
  // At the front END of the side-wall bay, not across its browse frontage.
  // The post stands beside the bay's depth; a .35 ft clear gap separates feet
  // from the end panel. The two supports bound a 3.86 ft floor opening (4.20 ft above the feet).
  const x = host.bay.wallX + host.bay.depth + .05 + 2.25;
  const z = host.bay.frontZ + .60;
  const feet = departmentArchFeet(x, z);
  const lane: Footprint = { label: 'structure:department-arch-opening', kind: 'structure',
    cx: x, cz: z, w: 3.86, d: 3.5, yaw: 0 };
  const candidates = [...feet, lane];
  // The opening is intentional empty space: test it independently so feet
  // aren't compared against their own access lane. All other objects must fit.
  for (const part of candidates) {
    const violations = validateLayout([part, ...host.obstacles], host.bounds);
    if (violations.some(v => (v.a === part.label || v.b === part.label) && v.severity === 'error')) return null;
  }
  return { x, z };
}
