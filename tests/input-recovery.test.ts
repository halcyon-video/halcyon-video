// Unit tests for input recovery, touch cancellation, and focused control guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasReachableFocusedControl } from '../src/text-entry-focus.ts';

test('hasReachableFocusedControl: returns false when activeElement is body or null', () => {
  assert.equal(hasReachableFocusedControl(), false);
});

test('hasReachableFocusedControl: recognizes reachable input and rejects unreachable input', () => {
  const prevDoc = (globalThis as any).document;
  const prevGCS = (globalThis as any).getComputedStyle;
  try {
    const mockInput = {
      tagName: 'INPUT',
      type: 'text',
      isConnected: true,
      getClientRects: () => [{ width: 100, height: 30 }],
      closest: () => null,
      blur: () => {},
    };

    (globalThis as any).document = {
      activeElement: mockInput,
    };
    (globalThis as any).getComputedStyle = () => ({
      visibility: 'visible',
      pointerEvents: 'auto',
    });

    assert.equal(hasReachableFocusedControl(), true, 'Reachable input should return true');

    // When pointer-events is none (overlay is down)
    (globalThis as any).getComputedStyle = () => ({
      visibility: 'visible',
      pointerEvents: 'none',
    });
    assert.equal(hasReachableFocusedControl(), false, 'Unreachable input (pointer-events: none) should return false');

    // When disconnected
    mockInput.isConnected = false;
    assert.equal(hasReachableFocusedControl(), false, 'Disconnected input should return false');
  } finally {
    (globalThis as any).document = prevDoc;
    (globalThis as any).getComputedStyle = prevGCS;
  }
});
