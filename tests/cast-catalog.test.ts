import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMER_IDS, customerRoster, customerCount, resolveClerkIdentity } from '../src/cast-catalog.ts';

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
