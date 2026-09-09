// Unit tests for release tools: release-notes.mjs and announce-fanout.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fanoutScript = path.join(root, 'tools/announce-fanout.mjs');
const releaseNotesScript = path.join(root, 'tools/release-notes.mjs');

test('announce-fanout: --help and -h print help and exit 0', () => {
  const res1 = spawnSync('node', [fanoutScript, '--help'], { encoding: 'utf8' });
  assert.equal(res1.status, 0);
  assert.match(res1.stderr + res1.stdout, /Usage: node tools\/announce-fanout\.mjs/);

  const res2 = spawnSync('node', [fanoutScript, '-h'], { encoding: 'utf8' });
  assert.equal(res2.status, 0);
  assert.match(res2.stderr + res2.stdout, /Usage: node tools\/announce-fanout\.mjs/);

  const res3 = spawnSync('node', [fanoutScript, 'discord', '--help'], { encoding: 'utf8' });
  assert.equal(res3.status, 0);
  assert.match(res3.stderr + res3.stdout, /Usage: node tools\/announce-fanout\.mjs/);
});

test('announce-fanout: missing arguments exit with code 2', () => {
  const res1 = spawnSync('node', [fanoutScript], { encoding: 'utf8' });
  assert.equal(res1.status, 2);

  const res2 = spawnSync('node', [fanoutScript, 'discord'], { encoding: 'utf8' });
  assert.equal(res2.status, 2);
  assert.match(res2.stderr, /--tag <vX\.Y\.Z> is required/);
});

test('announce-fanout: reddit-draft produces a valid draft for a known tag', () => {
  const tmpOut = path.join(os.tmpdir(), `test-reddit-draft-${Date.now()}.md`);
  try {
    const res = spawnSync('node', [fanoutScript, 'reddit-draft', '--tag', 'v0.8.1', '--out', tmpOut], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    assert.equal(fs.existsSync(tmpOut), true);
    const content = fs.readFileSync(tmpOut, 'utf8');
    assert.match(content, /\*\*Halcyon Video v0\.8\.1/);
    assert.match(content, /Try it in a browser, no server needed:/);
    assert.match(content, /Posting notes/);
  } finally {
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
});

test('release-notes: generates grouped release notes', () => {
  const res = spawnSync('node', [releaseNotesScript, '--to', 'v0.8.1', '--from', 'v0.8.0'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /VR headsets can enter VR without a keyboard/);
});
