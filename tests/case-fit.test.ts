// Regression tests for the two ways a retail case and its rental shell have
// drifted apart on the shelf. Both shipped; both are pure arithmetic, which is
// why they get an assertion rather than a collision system.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCaseFit, type CaseFitPair } from '../src/layout-validator.ts';

const IN = 1 / 12;

/** A correctly-seated pair: faces meet in Z, bottoms agree in Y. */
function seated(retailH: number, retailD: number, shellH: number, shellD: number): CaseFitPair {
  return {
    label: 'test',
    retailH, retailD, shellH, shellD,
    lift: (shellH - retailH) / 2,
    frontZ: retailD / 2,
    backZ: -shellD / 2,
  };
}

test('a correctly seated pair reports nothing', () => {
  // PlayStation jewel case (0.40 in) in a DVD-class shell (0.54 in).
  assert.deepEqual(validateCaseFit([seated(4.9 * IN, 0.4 * IN, 0.667, 0.045)]), []);
});

test('shells of every class seat cleanly', () => {
  const pairs = [
    seated(5.25 * IN, 1.1 * IN, 0.727, 0.104),  // SNES carton in a VHS clamshell
    seated(0.667, 0.092, 0.727, 0.104),         // VHS movie in its clamshell
    seated(0.667, 0.045, 0.667, 0.045),         // DVD movie: shell IS the retail box
  ];
  assert.deepEqual(validateCaseFit(pairs), []);
});

test('catches a shell straddling the parting plane', () => {
  // The shipped bug: backZ taken from the RETAIL depth, so the thicker shell
  // pushes its front face into the case standing in front of it.
  const retailD = 0.4 * IN, shellD = 0.045;
  const bad = { ...seated(4.9 * IN, retailD, 0.667, shellD), backZ: -retailD / 2 };
  const [v] = validateCaseFit([bad]);
  assert.equal(v.severity, 'error');
  assert.match(v.message, /interpenetrate/);
  // (0.045 - 0.0333) / 2 = 0.0058 ft = 0.07 in
  assert.match(v.message, /0\.07 in/);
});

test('catches a shell hanging through the shelf', () => {
  // The other shipped bug: both boxes took the slot's single Y while being
  // origin-centred, so the taller shell hung below by half the difference.
  const bad = { ...seated(5.25 * IN, 1.1 * IN, 0.727, 0.104), lift: 0 };
  const [v] = validateCaseFit([bad]);
  assert.equal(v.severity, 'error');
  assert.match(v.message, /sinks/);
  // (0.727 - 0.4375) / 2 = 0.145 ft = 1.74 in
  assert.match(v.message, /1\.7[0-9] in/);
});

test('a shell floating above the shelf is caught too, and named as such', () => {
  const bad = { ...seated(0.667, 0.092, 0.727, 0.104), lift: 0.2 };
  const [v] = validateCaseFit([bad]);
  assert.equal(v.severity, 'error');
  assert.match(v.message, /floats/);
});

test('sub-thousandth dims noise is not a defect', () => {
  const p = seated(0.667, 0.092, 0.727, 0.104);
  assert.deepEqual(validateCaseFit([{ ...p, lift: p.lift + 0.0004 }]), []);
});
