// GH #125 — the address layer, and the connect-time probe built on it.
//
// The bug this covers has no visible failure mode to test for: on the hosted
// HTTPS build a plain-HTTP address is refused by the browser before a request
// is sent, so the app saw no status code, no error it could read as one, and
// nothing at all until the 45s boot watchdog called it a timeout. Everything
// below therefore pins the DECISIONS made before the network is touched (what
// scheme a bare address gets, which addresses are the same server, which are
// unusable from this page) plus the probe that turns an unreachable address
// into a sentence instead of a stall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  describePlexConnectFailure,
  isLoopbackHost,
  isMixedContentBlocked,
  normalizePlexUrl,
  plexConnectCandidates,
  plexDirectTarget,
  probePlexServer,
  samePlexEndpoint,
} from '../src/plex.ts';
import { PlexProvider } from '../src/providers/plex-provider.ts';
import { initialHomeScreen, setupScreenLines, wrapSetupError } from '../src/store-setup-screens.ts';

/** Pretend the page was served over `protocol` for the duration of `fn`. */
async function onPage<T>(protocol: string, fn: () => T | Promise<T>): Promise<T> {
  const had = 'location' in globalThis;
  const prev = (globalThis as any).location;
  (globalThis as any).location = { protocol };
  try {
    return await fn();
  } finally {
    if (had) (globalThis as any).location = prev;
    else delete (globalThis as any).location;
  }
}

/** A stand-in PMS answering /identity the way a real one does. */
function identityServer(body: unknown, status = 200): Promise<{ url: string; close: () => Promise<void>; hits: string[] }> {
  const hits: string[] = [];
  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      hits.push(req.url || '');
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        hits,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

const IDENTITY = { MediaContainer: { size: 0, claimed: true, machineIdentifier: 'abc123', version: '1.43.3' } };

// ─── The scheme a bare address gets ──────────────────────────────────────────

test('a bare address follows the PAGE scheme, not a hardcoded http://', async () => {
  await onPage('http:', () => {
    assert.equal(normalizePlexUrl('192.168.1.50:32400'), 'http://192.168.1.50:32400');
  });
  await onPage('https:', () => {
    // The whole #125 headline: http:// here is an address the browser refuses.
    assert.equal(normalizePlexUrl('192.168.1.50:32400'), 'https://192.168.1.50:32400');
  });
});

test('loopback keeps plain http even on an HTTPS page', async () => {
  // Browsers class a loopback origin as potentially trustworthy, so it is not
  // mixed content — and Plex answers it over plain HTTP.
  await onPage('https:', () => {
    assert.equal(normalizePlexUrl('localhost:32400'), 'http://localhost:32400');
    assert.equal(normalizePlexUrl('127.0.0.1:32400'), 'http://127.0.0.1:32400');
  });
});

test('a scheme with nothing after it is a BLANK address, not an address', async () => {
  // The setup terminal seeds its address row with the literal 'http://'. This
  // used to normalise to `http://http:/` — non-empty, so the Plex path's
  // "ask the account which servers it has" branch never fired.
  for (const v of ['http://', 'https://', 'http:///', '  http://  ', '']) {
    assert.equal(normalizePlexUrl(v), '', JSON.stringify(v));
  }
});

test('an explicit scheme is never rewritten', async () => {
  await onPage('https:', () => {
    assert.equal(normalizePlexUrl('http://192.168.1.50:32400/'), 'http://192.168.1.50:32400');
    assert.equal(normalizePlexUrl('https://example.plex.direct:32400'), 'https://example.plex.direct:32400');
  });
  assert.equal(normalizePlexUrl(''), '');
});

test('isLoopbackHost knows the local machine from the LAN', () => {
  for (const h of ['localhost', 'LOCALHOST', 'foo.localhost', '127.0.0.1', '127.1.2.3', '::1'])
    assert.equal(isLoopbackHost(h), true, h);
  for (const h of ['192.168.1.50', 'plex.example.com', '10.0.0.4'])
    assert.equal(isLoopbackHost(h), false, h);
});

// ─── What this page may fetch ────────────────────────────────────────────────

test('mixed content is only claimed when the browser would actually block', async () => {
  await onPage('https:', () => {
    assert.equal(isMixedContentBlocked('http://192.168.1.50:32400'), true);
    assert.equal(isMixedContentBlocked('https://192.168.1.50:32400'), false);
    assert.equal(isMixedContentBlocked('http://localhost:32400'), false);
  });
  await onPage('http:', () => {
    assert.equal(isMixedContentBlocked('http://192.168.1.50:32400'), false);
  });
});

// ─── One server, several addresses ───────────────────────────────────────────

test('a plex.direct hostname resolves back to the address it stands for', () => {
  assert.equal(plexDirectTarget('192-168-1-50.abc0def.plex.direct'), '192.168.1.50');
  assert.equal(plexDirectTarget('plex.example.com'), null);
  assert.equal(plexDirectTarget('nothex.abc.plex.direct'), null);
});

test('a typed LAN IP and its plex.direct twin are the same endpoint', () => {
  assert.equal(
    samePlexEndpoint('http://192.168.1.50:32400', 'https://192-168-1-50.abc0def.plex.direct:32400'),
    true,
  );
  // Plex's default port is filled in on both sides before comparing.
  assert.equal(samePlexEndpoint('192.168.1.50', 'http://192.168.1.50:32400'), true);
  assert.equal(samePlexEndpoint('http://192.168.1.50:32400', 'http://192.168.1.50:8096'), false);
  assert.equal(samePlexEndpoint('', 'http://192.168.1.50:32400'), false);
});

// ─── The probe ───────────────────────────────────────────────────────────────

test('a blocked address fails without a request ever being sent', async () => {
  // 192.0.2.x is TEST-NET-1: guaranteed unroutable, so a probe that actually
  // tried it would sit there until the timeout. Returning in a few
  // milliseconds is the proof that nothing left — which is exactly what the
  // browser does with mixed content, only silently.
  const started = Date.now();
  const probe = await onPage('https:', () =>
    probePlexServer('http://192.0.2.1:32400', undefined, { timeoutMs: 5000 }));
  assert.equal(probe.ok, false);
  assert.equal(probe.code, 'mixed-content');
  assert.match(probe.message!, /HTTPS/);
  assert.match(probe.message!, /plex\.direct/);
  assert.ok(Date.now() - started < 1000, 'must not have gone to the network at all');
});

test('a reachable server reports its machine identifier', async () => {
  const srv = await identityServer(IDENTITY);
  try {
    const probe = await probePlexServer(srv.url, 'tok');
    assert.equal(probe.ok, true);
    assert.equal(probe.machineIdentifier, 'abc123');
    assert.deepEqual(srv.hits, ['/identity']);
  } finally {
    await srv.close();
  }
});

test('something that answers but is not Plex is named as such', async () => {
  const srv = await identityServer('<html>router login</html>');
  try {
    const probe = await probePlexServer(srv.url);
    assert.equal(probe.ok, false);
    assert.equal(probe.code, 'not-plex');
  } finally {
    await srv.close();
  }
});

test('an HTTP error is reported as one, not as a timeout', async () => {
  const srv = await identityServer({}, 502);
  try {
    const probe = await probePlexServer(srv.url);
    assert.equal(probe.code, 'http-error');
    assert.match(probe.message!, /502/);
  } finally {
    await srv.close();
  }
});

test('nothing listening fails fast, and says so in words', async () => {
  // Port 1 refuses instantly — the point is that the caller gets a reason
  // rather than the 45s boot stall the issue reported.
  const probe = await probePlexServer('http://127.0.0.1:1');
  assert.equal(probe.ok, false);
  assert.match(probe.message!, /same computer/i, 'loopback deserves its own explanation');
});

test('a hung server is abandoned at the probe timeout', async () => {
  const server = createServer(() => { /* never answers */ });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const probe = await probePlexServer(`http://127.0.0.1:${port}`, undefined, { timeoutMs: 150 });
    assert.equal(probe.code, 'timeout');
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('the failure summary leads with the typed address and counts the rest', () => {
  const msg = describePlexConnectFailure([
    { ok: false, url: 'http://192.168.1.50:32400', code: 'mixed-content', message: 'Blocked by the browser.' },
    { ok: false, url: 'https://a.plex.direct:32400', code: 'timeout', message: 'No answer.' },
    { ok: false, url: 'https://b.plex.direct:32400', code: 'timeout', message: 'No answer.' },
  ]);
  assert.match(msg, /^Blocked by the browser\./);
  assert.match(msg, /2 other addresses for that server/);
  assert.match(describePlexConnectFailure([]), /No Plex server address/);
});

// ─── authenticate(): probe first, and fall through to what works ─────────────

/** plex.tv answers from a fixture; everything else goes to the real network. */
function stubPlexTv(resources: unknown): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? input);
    if (url.startsWith('https://plex.tv/')) {
      return new Response(JSON.stringify(resources), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return real(input, init);
  }) as typeof fetch;
  return () => { globalThis.fetch = real; };
}

test('authenticate falls through to an address that answers, and reports it', async () => {
  const srv = await identityServer(IDENTITY);
  const dead = 'http://127.0.0.1:1';
  const restore = stubPlexTv([
    {
      provides: 'server',
      name: 'Attic NAS',
      clientIdentifier: 'machine-1',
      accessToken: 'server-token',
      owned: true,
      connections: [
        { uri: dead, local: true },
        { uri: srv.url, local: true },
      ],
    },
  ]);
  try {
    const session = await new PlexProvider().authenticate(dead, { accountToken: 'account-token' });
    // The per-server token, not the account one — the endpoint match found it.
    assert.equal(session.accessToken, 'server-token');
    assert.equal(session.userId, 'machine-1');
    assert.equal(session.serverAddress, srv.url, 'the address that ANSWERED is the one to persist');
  } finally {
    restore();
    await srv.close();
  }
});

test('authenticate throws when nothing answered, instead of reporting success', async () => {
  const restore = stubPlexTv([
    {
      provides: 'server',
      name: 'Attic NAS',
      clientIdentifier: 'machine-1',
      accessToken: 'server-token',
      owned: true,
      connections: [{ uri: 'http://127.0.0.1:1', local: true }],
    },
  ]);
  try {
    await assert.rejects(
      () => new PlexProvider().authenticate('http://127.0.0.1:1', { accountToken: 'account-token' }),
      /same computer|Could not reach/i,
    );
  } finally {
    restore();
  }
});

// ─── The CRT has to be able to say it ────────────────────────────────────────

test('a long reason wraps into terminal rows instead of being clipped to 40', async () => {
  // Built through the real path, so the assertion below is about the message
  // people actually get rather than a sample sentence.
  const probe = await onPage('https:', () =>
    probePlexServer('http://192.168.1.50:32400', undefined, { timeoutMs: 200 }));
  const lines = wrapSetupError(describePlexConnectFailure([probe])).split('\n');
  assert.ok(lines.length > 1, 'must wrap, not clip');
  assert.ok(lines.length <= 5, 'must not overrun the screen');
  for (const l of lines) assert.ok(l.length <= 40, `row too wide: ${l}`);
  const shown = lines.join(' ');
  assert.match(shown, /HTTPS/, 'the cause has to be on screen');
  // The row budget exists so the ACTION survives the clip, not just the cause.
  assert.match(shown, /PICK THE SERVER FROM THE LIST/);
  assert.equal(wrapSetupError(''), '');
});

test('the home screen makes room for a real failure, and is untouched without one', () => {
  const clean = setupScreenLines(initialHomeScreen('http://'));
  assert.equal(clean.lines.length, 9);
  assert.equal(clean.cursorLine, 6, 'row 1 (ADDRESS) is where the cursor starts');
  assert.ok(clean.lines.includes('BARE SHELVES, NO STOCK. PICK A'));

  const failed = setupScreenLines({
    ...initialHomeScreen('http://192.168.1.50:32400'), row: 1,
    error: wrapSetupError('x '.repeat(120)),
  });
  assert.ok(failed.lines.length <= 12, 'drawTerminal seats 12 rows');
  assert.ok(!failed.lines.includes('BARE SHELVES, NO STOCK. PICK A'), 'intro copy steps aside');
  assert.equal(failed.lines[failed.cursorLine].includes('ADDRESS'), true,
    'the cursor still points at the row the person needs to edit');
});

test('the candidate list leads with the typed address and adds an https twin', async () => {
  await onPage('https:', () => {
    const c = plexConnectCandidates('http://192.168.1.50:32400', [
      'https://192-168-1-50.abc.plex.direct:32400',
      'http://192.168.1.50:32400', // the same one plex.tv also advertises
    ]);
    assert.equal(c[0], 'http://192.168.1.50:32400', 'the typed address must lead the report');
    assert.ok(c.includes('https://192-168-1-50.abc.plex.direct:32400'));
    // The https twin of a typed plain-HTTP address, last: right for a reverse
    // proxy with a real certificate, a fast failure otherwise.
    assert.equal(c[c.length - 1], 'https://192.168.1.50:32400');
    assert.equal(new Set(c).size, c.length, 'no address is probed twice');
  });
});

test('loopback gets no https twin — Plex answers it over plain http', async () => {
  await onPage('https:', () => {
    assert.deepEqual(plexConnectCandidates('http://localhost:32400'), ['http://localhost:32400']);
  });
});
