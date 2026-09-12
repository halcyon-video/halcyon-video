import type { Footprint } from './layout-validator.ts';
import { NR_RUN_DEPTH } from './store-layout.ts';

/** Keep a four-foot customer aisle in front of the shelving on a wall notch.
 * The nominal rear aisle was measured to the wall, before the notch and its
 * shelf depth were deducted; a seven-foot notch could consume almost all of it. */
export function fitSteppedCornerDepth(requested: number, x: number, backZ: number, shelves: Footprint[]): number {
  let depth = requested;
  for (const shelf of shelves) {
    const hx = (Math.abs(Math.cos(shelf.yaw)) * shelf.w + Math.abs(Math.sin(shelf.yaw)) * shelf.d) / 2;
    const hz = (Math.abs(Math.sin(shelf.yaw)) * shelf.w + Math.abs(Math.cos(shelf.yaw)) * shelf.d) / 2;
    if (shelf.cx + hx < x - 4) continue;
    depth = Math.min(depth, shelf.cz - hz - backZ - NR_RUN_DEPTH - 4);
  }
  return Math.max(0, depth);
}
