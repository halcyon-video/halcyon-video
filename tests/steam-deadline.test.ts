import test from 'node:test';
import assert from 'node:assert/strict';

const { withSteamDeadline } = await import('../src/steam-deadline.ts');

test('a Steam call that never answers rejects instead of holding store boot', async () => {
  await assert.rejects(withSteamDeadline(new Promise(() => {}), 20), (error: unknown) => typeof error === 'string' && error.includes('did not answer'));
});

test('a Steam call that answers in time passes its result through', async () => {
  assert.deepEqual(await withSteamDeadline(Promise.resolve({ games: [] }), 1000), { games: [] });
});
