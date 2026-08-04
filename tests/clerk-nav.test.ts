// Unit tests for the clerk's navigation grid (src/clerk-nav.ts — pure math,
// no THREE/DOM, so it runs under plain `node --test` like rental-clock).
//
//   npm run test:nav
//
// The in-scene end-to-end check lives in the harness instead:
//   npm run shot -- --state clerkpath --out audit.png
// which simulates minutes of the real clerk brain against the real store
// footprints and fails the checkpoint on any intrusion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClerkNavGrid, type NavRect } from '../src/clerk-nav.ts';

const BOUNDS = { minX: 0, maxX: 20, minZ: 0, maxZ: 20 };
const OPTS = { cellSize: 0.5, clearance: 0.8, wallMargin: 1.0 };

// Point-in-oriented-rect (no inflation) — the "did the path actually clip
// geometry" check, deliberately independent of the grid's own math.
function insideRect(x: number, z: number, r: NavRect, shrink = 0): boolean {
  const cos = Math.cos(r.yaw), sin = Math.sin(r.yaw);
  const dx = x - r.cx, dz = z - r.cz;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= r.w / 2 - shrink && Math.abs(lz) <= r.d / 2 - shrink;
}

function pathClipsRect(path: { x: number; z: number }[], start: { x: number; z: number }, r: NavRect): boolean {
  let prev = start;
  for (const p of path) {
    const len = Math.hypot(p.x - prev.x, p.z - prev.z);
    const steps = Math.max(1, Math.ceil(len / 0.1));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (insideRect(prev.x + (p.x - prev.x) * t, prev.z + (p.z - prev.z) * t, r, 0.02)) return true;
    }
    prev = p;
  }
  return false;
}

test('routes around an axis-aligned wall instead of through it', () => {
  // A wall across the middle of the room with a gap at neither end reachable
  // straight through: path must detour around it.
  const wall: NavRect = { cx: 10, cz: 10, w: 12, d: 1, yaw: 0 };
  const grid = new ClerkNavGrid(BOUNDS, [wall], OPTS);
  const path = grid.findPath(10, 4, 10, 16);
  assert.ok(path, 'expected a path around the wall');
  assert.ok(!pathClipsRect(path!, { x: 10, z: 4 }, wall), 'path must not pass through the wall');
  const end = path![path!.length - 1];
  assert.ok(Math.hypot(end.x - 10, end.z - 16) < 0.05, 'path must end at the exact target');
});

test('routes around a rotated obstacle', () => {
  const obb: NavRect = { cx: 10, cz: 10, w: 9, d: 2, yaw: 0.7 };
  const grid = new ClerkNavGrid(BOUNDS, [obb], OPTS);
  const path = grid.findPath(4, 4, 16, 16);
  assert.ok(path, 'expected a path around the rotated obstacle');
  assert.ok(!pathClipsRect(path!, { x: 4, z: 4 }, obb), 'path must not clip the rotated rect');
});

test('returns null when the goal is sealed off', () => {
  // A closed box around the goal: four walls, no gap.
  const walls: NavRect[] = [
    { cx: 10, cz: 7, w: 7, d: 1, yaw: 0 },
    { cx: 10, cz: 13, w: 7, d: 1, yaw: 0 },
    { cx: 7, cz: 10, w: 1, d: 7, yaw: 0 },
    { cx: 13, cz: 10, w: 1, d: 7, yaw: 0 },
  ];
  const grid = new ClerkNavGrid(BOUNDS, walls, OPTS);
  assert.equal(grid.findPath(3, 3, 10, 10), null);
});

test('seals a gap narrower than twice the clearance', () => {
  // 1.5 ft gap, 0.8 clearance: the inflated segments overlap across it, so no
  // cell in the channel can be walkable regardless of grid alignment.
  const walls: NavRect[] = [
    { cx: 4.4, cz: 10, w: 8.8, d: 1.5, yaw: 0 },
    { cx: 15.15, cz: 10, w: 9.7, d: 1.5, yaw: 0 },
  ];
  const grid = new ClerkNavGrid(BOUNDS, walls, OPTS);
  assert.equal(grid.findPath(10, 4, 10, 16), null);
});

test('a counter-style 2.2 ft gap stays open with the 0.5 clearance override', () => {
  // The counter band's walk-through gap is 2.2 ft; its rects carry a 0.5
  // clearance override so a 1.2 ft channel of walkable cells survives.
  const walls: NavRect[] = [
    { cx: 4.4, cz: 10, w: 8.8, d: 1.5, yaw: 0, clearance: 0.5 },
    { cx: 15.5, cz: 10, w: 9.0, d: 1.5, yaw: 0, clearance: 0.5 },
  ];
  const grid = new ClerkNavGrid(BOUNDS, walls, OPTS);
  const path = grid.findPath(10, 4, 10, 16);
  assert.ok(path, 'clearance 0.5 should keep the 2.2 ft gap walkable');
  for (const r of walls) {
    assert.ok(!pathClipsRect(path!, { x: 10, z: 4 }, r), 'gap route must not clip either wall segment');
  }
});

test('final hop reaches a tight stand point just inside the inflated zone', () => {
  // Target 1.35 ft off a shelf face — inside the 0.8+quantization inflation
  // shadow is fine, but the exact point must still be the path's last node.
  const shelf: NavRect = { cx: 10, cz: 10, w: 2.16, d: 7.4, yaw: 0 };
  const grid = new ClerkNavGrid(BOUNDS, [shelf], OPTS);
  const standX = 10 + 2.16 / 2 + 1.35;
  const path = grid.findPath(4, 4, standX, 10);
  assert.ok(path, 'expected a path to the stand point');
  const end = path![path!.length - 1];
  assert.ok(Math.hypot(end.x - standX, end.z - 10) < 0.05, 'must end exactly at the stand point');
  assert.ok(!pathClipsRect(path!, { x: 4, z: 4 }, shelf), 'approach must not clip the shelf');
});

test('nearestWalkable snaps out of an obstacle and respects maxR', () => {
  const block: NavRect = { cx: 10, cz: 10, w: 4, d: 4, yaw: 0 };
  const grid = new ClerkNavGrid(BOUNDS, [block], OPTS);
  const p = grid.nearestWalkable(10, 10, 4.0);
  assert.ok(p, 'expected a snap point');
  assert.ok(grid.isWalkable(p!.x, p!.z));
  assert.equal(grid.nearestWalkable(10, 10, 0.5), null, 'snap outside maxR must fail');
});
