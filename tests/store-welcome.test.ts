// Unit tests for the hosted store first-visit welcome (issue #130).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Node shim for localStorage
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const {
  FIRST_VISIT_KEY,
  isFirstVisit,
  markFirstVisit,
  clearFirstVisit,
  isWelcomeActive,
  welcomeHUDText,
  triggerHostedWelcome,
  dismissWelcome,
} = await import('../src/store-welcome.ts');

beforeEach(() => {
  store.clear();
  dismissWelcome();
});

test('first-visit flag reads correctly from storage', () => {
  assert.equal(isFirstVisit(), true, 'Unset storage should report first visit');
  markFirstVisit();
  assert.equal(isFirstVisit(), false, 'Marked storage should report not first visit');
  assert.equal(localStorage.getItem(FIRST_VISIT_KEY), '1');
  clearFirstVisit();
  assert.equal(isFirstVisit(), true, 'Cleared storage should report first visit again');
});

test('welcomeHUDText returns appropriate copy for touch vs keyboard', () => {
  const touchText = welcomeHUDText(true);
  assert.match(touchText, /SWIPE/, 'Touch hint should teach swiping');
  assert.match(touchText, /TAP/, 'Touch hint should teach tapping');

  const kbText = welcomeHUDText(false);
  assert.match(kbText, /WALK THE AISLES|ARROWS/, 'Keyboard hint should teach arrows/walking');
  assert.match(kbText, /ENTER/, 'Keyboard hint should teach ENTER');
});

test('triggerHostedWelcome requires demo mode', () => {
  let toasted = false;
  const showToast = () => { toasted = true; };

  // Local install (isDemo: false) -> must NOT trigger welcome
  const resLocal = triggerHostedWelcome({ isDemo: false, showToast });
  assert.equal(resLocal, false);
  assert.equal(toasted, false);
  assert.equal(isWelcomeActive(), false);
  assert.equal(isFirstVisit(), true, 'Local install should leave first visit flag untouched');
});

test('triggerHostedWelcome runs on first demo visit and marks flag', () => {
  let toastMsg = '';
  let toastDuration = 0;
  const showToast = (msg: string, ms?: number) => {
    toastMsg = msg;
    toastDuration = ms || 0;
  };
  let dismissed = false;
  const onDismiss = () => { dismissed = true; };

  const res = triggerHostedWelcome({
    isDemo: true,
    isTouch: true,
    showToast,
    brandGreeting: 'Welcome test greeting!',
    onDismiss,
  });

  assert.equal(res, true);
  assert.equal(isWelcomeActive(), true);
  assert.equal(isFirstVisit(), false, 'First visit should now be marked');
  assert.equal(toastMsg, 'Welcome test greeting!');
  assert.equal(toastDuration, 6500);

  // A repeat trigger while active or after marked must return false
  const resSecond = triggerHostedWelcome({ isDemo: true, showToast });
  assert.equal(resSecond, false);

  // Dismiss on first input
  dismissWelcome();
  assert.equal(isWelcomeActive(), false);
  assert.equal(dismissed, true, 'onDismiss callback should be called on dismiss');
});
