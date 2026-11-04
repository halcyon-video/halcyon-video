import { test } from 'node:test';
import assert from 'node:assert/strict';
import { padInputAllowed, setPadInputOccluded } from '../src/gamepad-tracker.ts';

test('a visible page on another desktop cannot accept local controller input', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const doc = { hidden: false, hasFocus: () => false };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  try {
    // A kiosk may report false here even while foreground: use the governor's
    // window/native focus events, not a per-poll hasFocus() veto.
    setPadInputOccluded(false);
    assert.equal(padInputAllowed(), true);
    setPadInputOccluded(true);
    for (let poll = 0; poll < 100; poll++) assert.equal(padInputAllowed(), false);
    // Merely becoming visible again does not clear the blur latch.
    doc.hidden = true;
    assert.equal(padInputAllowed(), false);
    doc.hidden = false;
    assert.equal(padInputAllowed(), false);
    // A real window/native focus event restores controller ownership.
    setPadInputOccluded(false);
    assert.equal(padInputAllowed(), true);
    doc.hidden = true;
    assert.equal(padInputAllowed(), false);
  } finally {
    setPadInputOccluded(false);
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
