// localZOffset + the asymmetric-footprint case it exists for (issue #38): two
// aisle-run units meeting flush reported overlapping by exactly one end cap,
// because each described itself with a box centred on its placement while its
// cap sat on ONE end only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localZOffset, validateLayout, type Footprint } from '../src/layout-validator.ts';

const close = (a: number, b: number, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} !== ${b}`);

test('local +Z maps to world per the module convention', () => {
  // yaw 0: local +Z is world +Z.
  let o = localZOffset(0, 1);
  close(o.dx, 0); close(o.dz, 1);
  // yaw -90deg (the game department's field-side row): local +Z is world -X.
  o = localZOffset(-Math.PI / 2, 1);
  close(o.dx, -1); close(o.dz, 0);
  // yaw +90deg (glass-side row): local +Z is world +X.
  o = localZOffset(Math.PI / 2, 1);
  close(o.dx, 1); close(o.dz, 0);
});

test('zero delta never moves anything', () => {
  for (const yaw of [0, 0.7, -Math.PI / 2, Math.PI]) {
    const o = localZOffset(yaw, 0);
    close(o.dx, 0); close(o.dz, 0);
  }
});

/** Two 12-col game-section units meeting end to end, each with ONE outer cap. */
function departmentRow(applyOffset: boolean): Footprint[] {
  const unitLength = 7.38, cap = 0.1, yaw = -Math.PI / 2;
  // Placements are spaced by the bare shelf length so the runs join flush.
  return [
    { pos: 43.36, capFront: 0, capBack: cap },   // east unit, cap on its outer (-Z) end
    { pos: 35.98, capFront: cap, capBack: 0 },   // west unit, cap on its outer (+Z) end
  ].map((u, i) => {
    const shift = applyOffset ? (u.capFront - u.capBack) / 2 : 0;
    const o = localZOffset(yaw, shift);
    return {
      label: `fixture:game-section-${i}`, kind: 'fixture' as const,
      cx: u.pos + o.dx, cz: 0.96 + o.dz,
      w: 2.0, d: unitLength + u.capFront + u.capBack, yaw,
    };
  });
}

const BOUNDS = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

test('without the offset, flush units report a phantom overlap of one cap', () => {
  const errs = validateLayout(departmentRow(false), BOUNDS).filter(v => v.severity === 'error');
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /overlaps by 0\.10 ft/);
});

test('with the offset they read as meeting, not overlapping', () => {
  const errs = validateLayout(departmentRow(true), BOUNDS).filter(v => v.severity === 'error');
  assert.deepEqual(errs, []);
});

test('a REAL overlap is still caught once the phantom is gone', () => {
  const row = departmentRow(true);
  row[1].cx += 0.5; // jam the west unit into the east one
  const errs = validateLayout(row, BOUNDS).filter(v => v.severity === 'error');
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /overlaps by 0\.50 ft/);
});
