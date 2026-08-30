// Issue #132 — setup failure report unit tests:
// stage tracking and timings, server & library recording, sensitive string redaction,
// token scrubbing, and clipboard copy fallback.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initSetupReport,
  recordSetupServer,
  recordSetupLibraries,
  startSetupStage,
  endSetupStage,
  recordSetupFailure,
  scrubText,
  buildScrubbedSetupReport,
  getLastSetupReport,
  copySetupReportToClipboard,
  registerSensitiveString,
} from '../src/setup-failure-report.ts';

test('scrubText: scrubs Plex tokens, API keys, and Bearer tokens', () => {
  const input = 'Request failed with X-Plex-Token=abc123XYZ456 and api_key=secret-key-123 and Bearer eyJhbGciOiJIUzI1NiJ9';
  const scrubbed = scrubText(input);
  assert.ok(!scrubbed.includes('abc123XYZ456'));
  assert.ok(!scrubbed.includes('secret-key-123'));
  assert.ok(!scrubbed.includes('eyJhbGciOiJIUzI1NiJ9'));
  assert.ok(scrubbed.includes('X-Plex-Token=***'));
  assert.ok(scrubbed.includes('api_key=***'));
  assert.ok(scrubbed.includes('Bearer ***'));
});

test('scrubText: scrubs IP addresses and Plex direct domains while preserving localhost and ports', () => {
  const input = 'Failed to connect to 192.168.1.100:32400 or 10.0.0.5:8096 or 192-168-1-100.abcdef.plex.direct:32400, but http://localhost:32400 and 127.0.0.1 work.';
  const scrubbed = scrubText(input);
  assert.ok(!scrubbed.includes('192.168.1.100'));
  assert.ok(!scrubbed.includes('10.0.0.5'));
  assert.ok(!scrubbed.includes('abcdef.plex.direct'));
  assert.ok(scrubbed.includes('[redacted].plex.direct:32400'));
  assert.ok(scrubbed.includes('http://localhost:32400'));
  assert.ok(scrubbed.includes('127.0.0.1'));
});

test('scrubText: redacts registered sensitive strings and email addresses', () => {
  initSetupReport('plex');
  registerSensitiveString('SuperSecretServerName');
  registerSensitiveString('private_user_account');

  const input = 'User private_user_account on SuperSecretServerName (contact: owner@example.com) encountered error.';
  const scrubbed = scrubText(input);
  assert.ok(!scrubbed.includes('SuperSecretServerName'));
  assert.ok(!scrubbed.includes('private_user_account'));
  assert.ok(!scrubbed.includes('owner@example.com'));
  assert.ok(scrubbed.includes('[redacted]'));
  assert.ok(scrubbed.includes('[redacted-email]'));
});

test('report builder: formats app version, server info, library list, failing stage, and stage timings', () => {
  initSetupReport('plex');
  recordSetupServer({
    product: 'Plex Media Server',
    version: '1.40.2',
    isRelay: false,
    address: 'https://192-168-1-50.abc.plex.direct:32400',
    username: 'my_plex_user',
  });
  recordSetupLibraries([
    { name: 'Movies', type: 'movie', carried: true },
    { name: 'TV Shows', type: 'show', carried: true },
    { name: 'Home Videos', carried: false },
  ]);

  startSetupStage('Plex link (PIN)');
  endSetupStage('Plex link (PIN)', 'ok');

  startSetupStage('Looking up servers');
  endSetupStage('Looking up servers', 'ok');

  startSetupStage('Sync: Stocking Movies');
  recordSetupFailure('Failed to fetch item 451: Network connection lost', 'Sync: Stocking Movies');

  const report = getLastSetupReport();
  assert.match(report, /=== Halcyon Setup Failure Report ===/);
  assert.match(report, /App: Halcyon 0\.11\.1/);
  assert.match(report, /Server: Plex Media Server \(v1\.40\.2, relay: false\)/);
  assert.match(report, /Libraries \(3 found, 2 carried\):/);
  assert.match(report, /  - Movies, movie, carried/);
  assert.match(report, /  - TV Shows, show, carried/);
  assert.match(report, /  - Home Videos, excluded/);
  assert.match(report, /Failing stage: Sync: Stocking Movies/);
  assert.match(report, /Error: Failed to fetch item 451: Network connection lost/);
  assert.match(report, /Stage timings:/);
  assert.match(report, /  - Plex link \(PIN\): \d+ms \(ok\)/);
  assert.match(report, /  - Looking up servers: \d+ms \(ok\)/);
  assert.match(report, /  - Sync: Stocking Movies: \d+ms \(failed\) — Failed to fetch item 451: Network connection lost/);
  assert.match(report, /====================================/);
});

test('copySetupReportToClipboard: sets window.__lastSetupReport in simulated environments', async () => {
  initSetupReport('jellyfin');
  recordSetupFailure('Connection timeout to http://192.168.1.200:8096');

  const origWindow = (globalThis as any).window;
  (globalThis as any).window = {};

  try {
    const ok = await copySetupReportToClipboard();
    assert.ok(typeof (globalThis as any).window.__lastSetupReport === 'string');
    assert.match((globalThis as any).window.__lastSetupReport, /Halcyon Setup Failure Report/);
    assert.ok(!(globalThis as any).window.__lastSetupReport.includes('192.168.1.200'));
  } finally {
    (globalThis as any).window = origWindow;
  }
});
