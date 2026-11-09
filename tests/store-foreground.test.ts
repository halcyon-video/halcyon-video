import { test } from 'node:test';
import assert from 'node:assert/strict';

test('background startup, late audio, and focus transitions share ownership', async () => {
  const previous = ['document', 'window', 'AudioContext'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false, hasFocus: () => false, querySelectorAll: () => [] });
  class Context extends EventTarget {
    state = 'running';
    async suspend() { this.state = 'suspended'; this.dispatchEvent(new Event('statechange')); }
    async resume() { this.state = 'running'; this.dispatchEvent(new Event('statechange')); }
    async close() { this.state = 'closed'; this.dispatchEvent(new Event('statechange')); }
  }
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: win },
    document: { configurable: true, value: doc },
    AudioContext: { configurable: true, value: Context },
  });
  try {
    const foreground = await import('../src/store-foreground.ts');
    const { padInputAllowed } = await import('../src/gamepad-tracker.ts');
    const { setExternalGameActive } = await import('../src/external-game-state.ts');
    assert.equal(padInputAllowed(), false, 'visible background startup needs no blur event to block input');
    const late = foreground.createStoreAudioContext();
    assert.equal(late.state, 'suspended', 'audio created after the background transition must be parked');
    await late.resume();
    assert.equal(late.state, 'suspended', 'late asynchronous resume cannot reclaim the audio device');
    win.dispatchEvent(new Event('keydown'));
    assert.equal(padInputAllowed(), false, 'synthetic input cannot steal foreground ownership');
    win.dispatchEvent(new Event('focus'));
    assert.equal(padInputAllowed(), true, 'focus event is authoritative even with stale false hasFocus');
    await late.resume();
    assert.equal(late.state, 'running');
    win.dispatchEvent(new Event('blur'));
    assert.equal(padInputAllowed(), false);
    assert.equal(late.state, 'suspended');
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(padInputAllowed(), false, 'visible alone cannot wake a background window');
    doc.hasFocus = () => true;
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(padInputAllowed(), true);
    setExternalGameActive(true);
    win.dispatchEvent(new Event('focus'));
    assert.equal(padInputAllowed(), false, 'focus cannot reclaim input while a launched game owns it');
    setExternalGameActive(false);
    assert.equal(padInputAllowed(), true);
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(padInputAllowed(), false);
    await late.close();
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
