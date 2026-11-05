import { test } from 'node:test';
import assert from 'node:assert/strict';

test('private Remote Play stays active without granting local controller ownership', async () => {
  const previous = ['document', 'window', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: new EventTarget() },
    document: { configurable: true, value: Object.assign(new EventTarget(), {
      hidden: true, hasFocus: () => false, querySelectorAll: () => [],
    }) },
    location: { configurable: true, value: { search: '?remoteId=regression-viewer' } },
  });
  try {
    const { isStoreForeground, localInputAllowed, setWindowForeground } = await import('../src/store-foreground.ts');
    assert.equal(isStoreForeground(), true);
    assert.equal(localInputAllowed(), false);
    setWindowForeground(false);
    assert.equal(isStoreForeground(), true, 'a headless viewer does not need physical focus');
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
