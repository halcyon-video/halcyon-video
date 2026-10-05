import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMER_IDS, customerRoster, customerCount, resolveClerkIdentity, customerAtlasRows, customerSpriteFacing } from '../src/cast-catalog.ts';

test('quiet visits rotate through the complete ten-person cast without duplicates', () => {
  const seen = new Set<string>();
  for (let visit = -10; visit < 31; visit++) {
    const roster = customerRoster('quiet', visit);
    assert.equal(roster.length, 3);
    assert.equal(new Set(roster).size, 3);
    roster.forEach(id => { assert.ok(CUSTOMER_IDS.includes(id as typeof CUSTOMER_IDS[number])); seen.add(id); });
  }
  assert.equal(seen.size, 10);
});
test('customer population settings remain bounded and can disable all loading', () => {
  assert.equal(customerCount('busy'), 10);
  assert.equal(new Set(customerRoster('busy')).size, 10);
  assert.deepEqual(customerRoster('off'), []);
  assert.equal(customerCount('invalid'), 3);
  assert.equal(resolveClerkIdentity('invalid'), 'clerk-a');
  assert.equal(resolveClerkIdentity('clerk-b'), 'clerk-b');
});

test('the one-sided tattoo uses a unique unmirrored view for every octant', () => {
  assert.equal(customerAtlasRows('customer-06'), 8);
  const facings = Array.from({ length: 8 }, (_, i) => customerSpriteFacing('customer-06', i));
  assert.deepEqual(facings.map(f => f.row), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(facings.every(f => !f.flip));
  for (const id of CUSTOMER_IDS.filter(id => id !== 'customer-06')) {
    assert.equal(customerAtlasRows(id), 5);
    assert.deepEqual(Array.from({ length: 8 }, (_, i) => customerSpriteFacing(id, i).row), [0, 1, 2, 3, 4, 3, 2, 1]);
    assert.deepEqual(Array.from({ length: 8 }, (_, i) => customerSpriteFacing(id, i).flip), [false, false, false, false, false, true, true, true]);
  }
});
