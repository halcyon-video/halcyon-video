// The provider registry's contract (GH #32). Runs under `node --test` type
// stripping, which is why it registers a hand-rolled fake rather than the real
// JellyfinProvider: that one imports the Tauri core and DOM globals a test
// process can't load. The registry storing FACTORIES rather than instances is
// what makes that separation possible, so it's worth pinning here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerProvider,
  createProvider,
  listProviderKinds,
  hasProvider,
  resetProviderRegistry,
  DEFAULT_PROVIDER_KIND,
} from '../src/providers/provider-registry.ts';

/** Minimal stand-in — only the fields the registry itself touches. */
function fakeProvider(id: string): any {
  return { id, displayName: id, capabilities: {} };
}

test('registers and creates a provider by kind', () => {
  resetProviderRegistry();
  registerProvider('jellyfin', () => fakeProvider('jellyfin'));
  assert.equal(createProvider('jellyfin').id, 'jellyfin');
  assert.equal(hasProvider('jellyfin'), true);
});

test('an unknown kind throws, and names what IS known', () => {
  resetProviderRegistry();
  registerProvider('jellyfin', () => fakeProvider('jellyfin'));
  // Falling back to Jellyfin here would stock the store off the wrong server
  // after a downgrade — the throw is the point, not an oversight.
  assert.throws(() => createProvider('plex'), /Unknown media-source provider: plex.*jellyfin/s);
});

test('a fresh registry names none rather than throwing on an empty join', () => {
  resetProviderRegistry();
  assert.throws(() => createProvider('jellyfin'), /none registered/);
});

test('factories are lazy — nothing is constructed until asked for', () => {
  resetProviderRegistry();
  let built = 0;
  registerProvider('jellyfin', () => {
    built++;
    return fakeProvider('jellyfin');
  });
  assert.equal(built, 0, 'registering must not construct');
  createProvider('jellyfin');
  createProvider('jellyfin');
  assert.equal(built, 2, 'each create gets its own instance');
});

test('kinds list sorted, for a stable server picker', () => {
  resetProviderRegistry();
  registerProvider('plex', () => fakeProvider('plex'));
  registerProvider('emby', () => fakeProvider('emby'));
  registerProvider('jellyfin', () => fakeProvider('jellyfin'));
  assert.deepEqual(listProviderKinds(), ['emby', 'jellyfin', 'plex']);
});

test('the default kind is what a pre-boundary install has on disk', () => {
  // Every existing install predates provider_kind; if this stops being
  // jellyfin, they all silently point at a server they never configured.
  assert.equal(DEFAULT_PROVIDER_KIND, 'jellyfin');
});
