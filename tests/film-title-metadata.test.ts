import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMediaBrowserClient } from '../src/media-browser-client.ts';

for (const dialect of ['jellyfin', 'emby'] as const) {
  test(`${dialect} maps optional transparent title artwork in global and library catalogs`, async t => {
    const client = createMediaBrowserClient(dialect);
    const items = [
      { Id: 'with-logo', Name: 'With artwork', Type: 'Movie', ImageTags: { Logo: 'revision+1&2' } },
      { Id: 'without-logo', Name: 'Without artwork', Type: 'Movie', ImageTags: { Primary: 'poster' } },
    ];
    t.mock.method(globalThis, 'fetch', async (input: string) => {
      const url = new URL(input);
      const data = url.pathname.endsWith('/Views')
        ? { Items: [{ Id: 'films', Name: 'Films', Type: 'CollectionFolder', CollectionType: 'movies' }] }
        : url.searchParams.get('IncludeItemTypes') === 'BoxSet'
          ? { Items: [], TotalRecordCount: 0 }
          : { Items: items, TotalRecordCount: items.length };
      return new Response(JSON.stringify(data));
    });
    const global = await client.fetchMediaCatalog('https://server.test/proxy', 'token+&', 'user');
    const libraries = await client.fetchJellyfinLibrariesAndMovies('https://server.test/proxy', 'token+&', 'user');
    for (const movies of [global.movies, libraries[0].movies]) {
      const logo = new URL(movies.find(m => m.id === 'with-logo')!.titleLogoUrl!);
      assert.equal(logo.pathname, '/proxy/Items/with-logo/Images/Logo');
      assert.equal(logo.searchParams.get('format'), 'png');
      assert.equal(logo.searchParams.get('maxWidth'), '1024');
      assert.equal(logo.searchParams.get('tag'), 'revision+1&2');
      assert.equal(logo.searchParams.get(dialect === 'jellyfin' ? 'ApiKey' : 'api_key'), 'token+&');
      assert.equal(movies.find(m => m.id === 'without-logo')!.titleLogoUrl, undefined);
    }
  });
}
