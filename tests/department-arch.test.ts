import test from 'node:test';
import assert from 'node:assert/strict';
import { fitDepartmentArch, departmentArchFeet, type DepartmentArchHost } from '../src/fixtures/department-arch-layout.ts';
import { validateHeadroom } from '../src/layout-validator.ts';

const host: DepartmentArchHost = { format: 'corporate', ceiling: 13.5, exposed: true,
  bay: { frontZ: -15, wallX: -12, depth: 1.8, length: 15 },
  bounds: { minX: -12, maxX: 34, minZ: -40, maxZ: 15 }, obstacles: [] };
test('portal needs a full-height concept-store bay and a genuinely clear opening', () => {
  const fit = fitDepartmentArch(host)!;
  assert.ok(fit);
  assert.equal(departmentArchFeet(fit.x, fit.z).length, 2);
  for (const changes of [{ ceiling: 9 }, { exposed: false }, { format: 'mom-and-pop' }, { bay: { ...host.bay, length: 0 } }])
    assert.equal(fitDepartmentArch({ ...host, ...changes }), null);
  assert.ok(fitDepartmentArch({ ...host, ceiling: 18 }));
  for (const cx of [fit.x, fit.x - 2.25, fit.x + 2.25])
    assert.equal(fitDepartmentArch({ ...host, obstacles: [{ label: 'obstruction', kind: 'shelving', cx, cz: fit.z, w: 1, d: 1, yaw: .3 }] }), null);
  assert.equal(fitDepartmentArch({ ...host, bounds: { ...host.bounds, maxX: fit.x } }), null);
});
test('vertical bounds reject low headroom, a roof intersection and invalid dimensions', () => {
  assert.deepEqual(validateHeadroom([{ label: 'arch', undersideY: 7.48, topY: 10.27 }], 13.5), []);
  assert.equal(validateHeadroom([{ label: 'arch', undersideY: 6, topY: 14 }], 13.5).length, 2);
  assert.equal(validateHeadroom([{ label: 'arch', undersideY: NaN, topY: 10 }], 13.5).length, 1);
});
