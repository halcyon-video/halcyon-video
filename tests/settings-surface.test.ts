import { test } from 'node:test';
import assert from 'node:assert/strict';
import { terminalSettingsLines } from '../src/settings-surface.ts';
import { fitTerminalPitch } from '../src/counter-terminal.ts';

test('every settings choice stays reachable and fits the physical CRT', () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ label: `Choice ${i}`, value: 'A descriptive value' }));
  for (let i = 0; i < rows.length; i++) {
    const { lines, cursorLine } = terminalSettingsLines('Store Settings', rows, i);
    assert.ok(lines[cursorLine].startsWith(`> Choice ${i}`.toUpperCase()));
    assert.ok(lines.every((line) => line.length <= 40));
    const font = Math.floor((1024 * 0.86 / 40) / 0.6);
    const pitch = Math.round(font * 1.24);
    const body = 768 * 0.86 - Math.round(pitch * 1.3) - pitch * 2;
    assert.ok(fitTerminalPitch(lines.length, pitch, font, body).maxLines >= lines.length);
  }
});

test('short menus have no paging prompt and the selected value remains readable', () => {
  const { lines, cursorLine } = terminalSettingsLines('Store Look', [{ label: 'Shelf Arrangement', value: 'Herringbone' }], 0);
  assert.equal(lines[1], '');
  assert.equal(cursorLine, 2);
  assert.ok(lines.includes('SHELF ARRANGEMENT: HERRINGBONE'));
});
