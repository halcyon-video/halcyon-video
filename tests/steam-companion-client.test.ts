import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map<string, string>([['halcyon_steam_companion_pair', 'pair-secret']]);
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, configurable: true });
Object.defineProperty(globalThis, 'location', { value: { origin: 'https://halcyon.example', hostname: 'halcyon.example' }, configurable: true });
Object.defineProperty(globalThis, 'window', { value: { isSecureContext: true, setTimeout }, configurable: true });

const { companionInvoke } = await import('../src/steam-companion-client.ts');

test('fake loopback daemon never receives reusable pairing key and cannot forge response', async () => {
  let requestHeaders: Record<string, string> = {};
  let requestBody = '';
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/challenge')) return new Response(JSON.stringify({ nonce: 'fake-nonce' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    requestHeaders = Object.fromEntries(new Headers(init.headers).entries()); requestBody = String(init.body || '');
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', 'X-Halcyon-Response-Proof': '0'.repeat(64) } });
  }});
  await assert.rejects(companionInvoke('library'), /could not be authenticated/);
  assert.equal(requestHeaders.authorization, undefined);
  assert.ok(requestHeaders['x-halcyon-proof']);
  assert.doesNotMatch(JSON.stringify(requestHeaders) + requestBody, /pair-secret/);
});

test('plain HTTP LAN deployment refuses cryptographic downgrade', async () => {
  (window as any).isSecureContext = false;
  await assert.rejects(companionInvoke('library'), /HTTPS or localhost/);
  (window as any).isSecureContext = true;
});
