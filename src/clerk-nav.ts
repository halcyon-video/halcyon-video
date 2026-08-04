// Clerk navigation grid: a pure-math occupancy grid + A* pathfinder over the
// store's ground-plan footprints (the same oriented rectangles the layout
// validator checks — shelving islands, fixtures, the checkout counter band,
// the vestibule, the stepped corner). The clerk asks it for a path every time
// she picks a destination (every ~10-45 s), so nothing here runs per frame;
// the grid itself is built once per scene build.
//
// No THREE, no DOM — this module must stay importable from plain node so the
// pathfinder has real unit tests (see tests/clerk-nav.test.ts).
//
// Rect convention matches src/layout-validator.ts's Footprint: local X/Z axes
// carried into world space by yaw as
//   worldX = cx + localX*cos(yaw) + localZ*sin(yaw)
//   worldZ = cz - localX*sin(yaw) + localZ*cos(yaw)
// so a rect's local-X world direction is (cos yaw, -sin yaw) and its local-Z
// world direction is (sin yaw, cos yaw).

export interface NavRect {
  label?: string;
  cx: number; cz: number;   // world-space centre, feet
  w: number;                // extent along local X at yaw=0, feet
  d: number;                // extent along local Z at yaw=0, feet
  yaw: number;              // radians
  // Per-rect walking clearance override (feet). The checkout counter uses a
  // smaller value than the default so the 2.2 ft walk-through gap in its band
  // stays traversable — the clerk hugs her own desk tighter than she hugs
  // shelving on the open floor.
  clearance?: number;
}

export interface NavBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface NavPoint { x: number; z: number }

export interface NavGridOptions {
  cellSize?: number;    // feet per grid cell (default 0.5)
  clearance?: number;   // default obstacle inflation, feet (clerk body radius)
  wallMargin?: number;  // keep-out from the room bounds (walls carry shelves)
}

const SQRT2 = Math.SQRT2;

export class ClerkNavGrid {
  readonly cell: number;
  readonly clearance: number;
  readonly wallMargin: number;
  readonly cols: number;
  readonly rows: number;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly blocked: Uint8Array;

  // A* scratch, allocated once and reused across findPath calls.
  private readonly gScore: Float64Array;
  private readonly cameFrom: Int32Array;
  private readonly visitStamp: Int32Array;
  private stamp = 0;

  constructor(bounds: NavBounds, rects: NavRect[], opts: NavGridOptions = {}) {
    this.cell = opts.cellSize ?? 0.5;
    this.clearance = opts.clearance ?? 0.8;
    this.wallMargin = opts.wallMargin ?? this.clearance;
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / this.cell));
    this.rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / this.cell));
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.gScore = new Float64Array(n);
    this.cameFrom = new Int32Array(n);
    this.visitStamp = new Int32Array(n);

    // Wall keep-out band around the room perimeter.
    const marginCells = Math.ceil(this.wallMargin / this.cell);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (r < marginCells || c < marginCells || r >= this.rows - marginCells || c >= this.cols - marginCells) {
          this.blocked[r * this.cols + c] = 1;
        }
      }
    }

    // Rasterize every footprint, inflated by its clearance: a cell is blocked
    // when its centre lies inside the rect grown by `clr` on every side.
    for (const rect of rects) {
      const clr = rect.clearance ?? this.clearance;
      const cos = Math.cos(rect.yaw), sin = Math.sin(rect.yaw);
      const hw = rect.w / 2 + clr, hd = rect.d / 2 + clr;
      // Conservative world-AABB of the inflated rect to bound the scan.
      const ex = Math.abs(hw * cos) + Math.abs(hd * sin);
      const ez = Math.abs(hw * sin) + Math.abs(hd * cos);
      const c0 = Math.max(0, Math.floor((rect.cx - ex - this.minX) / this.cell));
      const c1 = Math.min(this.cols - 1, Math.ceil((rect.cx + ex - this.minX) / this.cell));
      const r0 = Math.max(0, Math.floor((rect.cz - ez - this.minZ) / this.cell));
      const r1 = Math.min(this.rows - 1, Math.ceil((rect.cz + ez - this.minZ) / this.cell));
      for (let r = r0; r <= r1; r++) {
        const pz = this.minZ + (r + 0.5) * this.cell;
        for (let c = c0; c <= c1; c++) {
          const px = this.minX + (c + 0.5) * this.cell;
          const dx = px - rect.cx, dz = pz - rect.cz;
          // Project the offset onto the rect's local axes (see convention above).
          const lx = dx * cos - dz * sin;
          const lz = dx * sin + dz * cos;
          if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) this.blocked[r * this.cols + c] = 1;
        }
      }
    }
  }

  private cellOf(x: number, z: number): number {
    const c = Math.floor((x - this.minX) / this.cell);
    const r = Math.floor((z - this.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private centreOf(idx: number): NavPoint {
    const r = Math.floor(idx / this.cols), c = idx % this.cols;
    return { x: this.minX + (c + 0.5) * this.cell, z: this.minZ + (r + 0.5) * this.cell };
  }

  isWalkable(x: number, z: number): boolean {
    const idx = this.cellOf(x, z);
    return idx >= 0 && this.blocked[idx] === 0;
  }

  /**
   * Nearest walkable point to (x, z) within `maxR` feet, or null. Used to snap
   * tight stand points (deliberately placed just outside the inflated shelf
   * rects) onto the grid, and to reject destinations inside solid geometry.
   */
  nearestWalkable(x: number, z: number, maxR = 3.0): NavPoint | null {
    if (this.isWalkable(x, z)) return { x, z };
    const c0 = Math.floor((x - this.minX) / this.cell);
    const r0 = Math.floor((z - this.minZ) / this.cell);
    const maxRing = Math.ceil(maxR / this.cell);
    let best: NavPoint | null = null;
    let bestD2 = maxR * maxR;
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue; // ring shell only
          const r = r0 + dr, c = c0 + dc;
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
          if (this.blocked[r * this.cols + c]) continue;
          const p = this.centreOf(r * this.cols + c);
          const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (d2 < bestD2) { bestD2 = d2; best = p; }
        }
      }
      if (best) return best; // closest ring wins; within it we took the best cell
    }
    return best;
  }

  /** True when the straight segment a→b stays on walkable cells (sampled). */
  segmentWalkable(a: NavPoint, b: NavPoint): boolean {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(a.x + dx * t, a.z + dz * t)) return false;
    }
    return true;
  }

  /**
   * A* path from (sx, sz) to (tx, tz). Returns a smoothed list of waypoints
   * ENDING at the exact target (the final hop may leave the walkable grid by a
   * short distance — stand points intentionally hug geometry tighter than the
   * grid clearance). Returns null when no route exists. Never called per
   * frame — only on destination changes.
   */
  findPath(sx: number, sz: number, tx: number, tz: number): NavPoint[] | null {
    const start = this.nearestWalkable(sx, sz, 4.0);
    const goal = this.nearestWalkable(tx, tz, 2.5);
    if (!start || !goal) return null;
    const sIdx = this.cellOf(start.x, start.z);
    const gIdx = this.cellOf(goal.x, goal.z);
    if (sIdx < 0 || gIdx < 0) return null;
    if (sIdx === gIdx) {
      const out: NavPoint[] = [];
      if (Math.hypot(tx - sx, tz - sz) > 0.05) out.push({ x: tx, z: tz });
      return out;
    }

    const cols = this.cols, rows = this.rows, blocked = this.blocked;
    const g = this.gScore, came = this.cameFrom, seen = this.visitStamp;
    const stamp = ++this.stamp;
    const gr = Math.floor(gIdx / cols), gc = gIdx % cols;

    // Binary min-heap of [f, idx] pairs packed as two parallel arrays.
    const heapF: number[] = [];
    const heapI: number[] = [];
    const push = (f: number, idx: number) => {
      let i = heapF.length;
      heapF.push(f); heapI.push(idx);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heapF[p] <= heapF[i]) break;
        [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
        [heapI[p], heapI[i]] = [heapI[i], heapI[p]];
        i = p;
      }
    };
    const pop = (): number => {
      const top = heapI[0];
      const lf = heapF.pop()!, li = heapI.pop()!;
      if (heapF.length > 0) {
        heapF[0] = lf; heapI[0] = li;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heapF.length && heapF[l] < heapF[m]) m = l;
          if (r < heapF.length && heapF[r] < heapF[m]) m = r;
          if (m === i) break;
          [heapF[m], heapF[i]] = [heapF[i], heapF[m]];
          [heapI[m], heapI[i]] = [heapI[i], heapI[m]];
          i = m;
        }
      }
      return top;
    };
    const hCost = (idx: number): number => {
      const r = Math.floor(idx / cols), c = idx % cols;
      const dr = Math.abs(r - gr), dc = Math.abs(c - gc);
      return (Math.max(dr, dc) + (SQRT2 - 1) * Math.min(dr, dc)) * this.cell;
    };

    seen[sIdx] = stamp;
    g[sIdx] = 0;
    came[sIdx] = -1;
    push(hCost(sIdx), sIdx);
    let found = false;
    while (heapF.length > 0) {
      const cur = pop();
      if (cur === gIdx) { found = true; break; }
      const cr = Math.floor(cur / cols), cc = cur % cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          const nIdx = nr * cols + nc;
          if (blocked[nIdx]) continue;
          // No corner cutting: a diagonal move needs both orthogonal
          // neighbours open, or the clerk clips the corner she rounds.
          if (dr !== 0 && dc !== 0 &&
              (blocked[cr * cols + nc] || blocked[nr * cols + cc])) continue;
          const step = (dr !== 0 && dc !== 0 ? SQRT2 : 1) * this.cell;
          const ng = g[cur] + step;
          if (seen[nIdx] === stamp && ng >= g[nIdx]) continue;
          seen[nIdx] = stamp;
          g[nIdx] = ng;
          came[nIdx] = cur;
          push(ng + hCost(nIdx), nIdx);
        }
      }
    }
    if (!found) return null;

    // Reconstruct cell-centre chain start→goal.
    const chain: NavPoint[] = [];
    for (let idx = gIdx; idx >= 0; idx = came[idx]) chain.push(this.centreOf(idx));
    chain.push({ x: sx, z: sz });
    chain.reverse();

    // String-pull: greedily skip to the furthest chain point still reachable
    // in a straight walkable line, so paths hug corners instead of stair-stepping.
    const out: NavPoint[] = [];
    let i = 0;
    while (i < chain.length - 1) {
      let j = chain.length - 1;
      while (j > i + 1 && !this.segmentWalkable(chain[i], chain[j])) j--;
      out.push(chain[j]);
      i = j;
    }
    // Final hop to the exact requested target (may be tighter than clearance,
    // e.g. a stocking stand point 1.35 ft off a shelf face). Capped so a badly
    // placed target deep inside solid geometry ends at the snapped cell
    // instead of walking the clerk into the obstacle.
    const last = out[out.length - 1] ?? { x: sx, z: sz };
    const hop = Math.hypot(tx - last.x, tz - last.z);
    if (hop > 0.05 && hop <= 1.25) out.push({ x: tx, z: tz });
    return out;
  }
}
