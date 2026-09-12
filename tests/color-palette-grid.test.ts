import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_GRID_100, toHexColor } from '../src/settings-rows.ts';

test('COLOR_GRID_100 has exactly 100 valid 6-digit hex colors with distinct labels', () => {
  assert.equal(COLOR_GRID_100.length, 100, 'Palette must have exactly 100 colors (10x10 grid)');
  
  const hexRegex = /^#[0-9a-f]{6}$/i;
  for (let i = 0; i < COLOR_GRID_100.length; i++) {
    const item = COLOR_GRID_100[i];
    assert.ok(hexRegex.test(item.id), `Color at index ${i} (${item.id}) must be a valid #rrggbb hex`);
    assert.ok(typeof item.label === 'string' && item.label.length > 0, `Color at index ${i} must have a non-empty label`);
  }
});

test('COLOR_GRID_100 includes signature Halcyon branding and classic/Hollywood rental colors', () => {
  const ids = COLOR_GRID_100.map((c) => c.id.toLowerCase());
  const labels = COLOR_GRID_100.map((c) => c.label);

  assert.ok(ids.includes('#2544ae'), 'Must include House Blue');
  assert.ok(ids.includes('#f5f5f7'), 'Must include House White');
  assert.ok(ids.includes('#ffffff'), 'Must include Pure White');
  assert.ok(ids.includes('#000000'), 'Must include Pure Black');
  assert.ok(ids.includes('#ffd24a'), 'Must include CRT Gold');

  // Classic rental palette
  assert.ok(ids.includes('#001489'), 'Must include Classic Video Blue');
  assert.ok(ids.includes('#f6d42a'), 'Must include Classic Yellow');

  // Hollywood Video palette
  assert.ok(ids.includes('#e5a823'), 'Must include Hollywood Gold');
  assert.ok(ids.includes('#006666'), 'Must include Hollywood Teal');
  assert.ok(ids.includes('#660033'), 'Must include Hollywood Wine');
  assert.ok(ids.includes('#800040'), 'Must include Hollywood Magenta');

  // Ensure no labels are called Halcyon Gold or Halcyon Yellow
  for (const label of labels) {
    assert.ok(!/halcyon gold/i.test(label), 'Must not use Halcyon Gold label');
    assert.ok(!/halcyon yellow/i.test(label), 'Must not use Halcyon Yellow label');
  }
});

test('toHexColor normalizes hex codes and handles casing', () => {
  assert.equal(toHexColor('#FFFFFF'), '#ffffff');
  assert.equal(toHexColor('#2544AE'), '#2544ae');
  assert.equal(toHexColor('#123456'), '#123456');
  assert.equal(toHexColor('#aBcDeF'), '#abcdef');
});

