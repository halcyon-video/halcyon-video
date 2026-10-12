import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireLiveApproval, TMDB_NOTICE } from '../src/catalog/publisher/decision.ts';
import { publishSnapshot, readCurrent } from '../src/catalog/publisher/storage.ts';

const fixturePath = fileURLToPath(new URL('../fixtures/catalog.json', import.meta.url));
const committed = fileURLToPath(new URL('../deployment/source-decision.json', import.meta.url));
const cli = fileURLToPath(new URL('../tools/publish-live.ts', import.meta.url));
const now = Date.parse('2026-10-10T12:00:00Z');
const approval = () => ({
  schemaVersion: 1, source: 'tmdb', status: 'approved', decidedBy: 'devbjackson',
  decidedAt: '2026-10-01T00:00:00Z', reviewBy: '2027-04-01T00:00:00Z',
  reference: 'https://example.com/agreement', agreement: 'Synthetic test agreement', permittedPurpose: 'Synthetic test purpose',
  publicRedistribution: true, imagePresentation: 'Synthetic test image terms', cacheRetentionDays: 7, monthlyCostUsd: 0,
  attribution: { tmdbNotice: TMDB_NOTICE, tmdbLogo: true, justWatch: true },
});
async function liveCandidate() {
  const value = JSON.parse(await readFile(fixturePath, 'utf8'));
  value.source = 'tmdb';
  for (const title of value.titles) for (const offer of title.offers) offer.provenance = 'tmdb-justwatch';
  return value;
}

test('the committed record keeps live publication closed', async () => {
  const record = JSON.parse(await readFile(committed, 'utf8'));
  assert.equal(record.status, 'unresolved');
  assert.throws(() => requireLiveApproval(record, now), /project-specific permission/);
});
test('only a complete, current owner approval opens the gate', () => {
  assert.equal(requireLiveApproval(approval(), now).decidedBy, 'devbjackson');
  const broken: [string, (d: any) => void][] = [
    ['another approver', d => { d.decidedBy = 'someone-else'; }],
    ['no redistribution', d => { d.publicRedistribution = false; }],
    ['altered notice', d => { d.attribution.tmdbNotice = 'Uses TMDB.'; }],
    ['missing JustWatch credit', d => { d.attribution.justWatch = false; }],
    ['insecure reference', d => { d.reference = 'http://example.com/a'; }],
    ['unknown field', d => { d.override = true; }],
    ['missing agreement', d => { delete d.agreement; }],
  ];
  for (const [label, mutate] of broken) { const d = approval(); mutate(d); assert.throws(() => requireLiveApproval(d, now), Error, label); }
  const lapsed = approval(); lapsed.reviewBy = '2026-10-09T00:00:00Z';
  assert.throws(() => requireLiveApproval(lapsed, now), /review date has passed/);
  const future = approval(); future.decidedAt = '2026-11-01T00:00:00Z';
  assert.throws(() => requireLiveApproval(future, now), /inconsistent/);
});
test('storage refuses live data without approval and keeps the last good artifact', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'halcyon-live-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const candidate = await liveCandidate();
  const checked = Date.parse(candidate.checkedAt) + 3600000;
  await assert.rejects(publishSnapshot(dir, candidate, { now: checked }), /project-specific permission/);
  await assert.rejects(publishSnapshot(dir, candidate, { now: checked, decision: { ...approval(), status: 'unresolved' } }));
  assert.equal(await readCurrent(dir), undefined);
  const decision = approval(); decision.decidedAt = new Date(checked - 86400000).toISOString(); decision.reviewBy = new Date(checked + 86400000).toISOString();
  const pointer = await publishSnapshot(dir, candidate, { now: checked, decision });
  const before = await readFile(join(dir, 'current.json'), 'utf8');
  const next = structuredClone(candidate); next.snapshotVersion = 'live-next';
  await assert.rejects(publishSnapshot(dir, next, { now: checked }), /project-specific permission/);
  assert.equal(await readFile(join(dir, 'current.json'), 'utf8'), before);
  assert.equal((await readCurrent(dir))?.pointer.root, pointer.root);
});
test('live CLI exits blocked before reading a credential and writes nothing', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'halcyon-live-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const token = 'synthetic-credential-sentinel';
  const out = join(dir, 'out');
  const run = (decisionPath: string, env: Record<string, string>) => spawnSync(process.execPath, ['--experimental-strip-types', cli, out, decisionPath], { encoding: 'utf8', env });
  const blocked = run(committed, { TMDB_READ_ACCESS_TOKEN: token });
  assert.equal(blocked.status, 75, blocked.stderr);
  assert.match(blocked.stderr, /Live catalog publication blocked/);
  assert.ok(!blocked.stdout.includes(token) && !blocked.stderr.includes(token));
  await assert.rejects(readdir(out));
  const approvedPath = join(dir, 'approved.json');
  const decision = approval(); decision.decidedAt = new Date(Date.now() - 86400000).toISOString(); decision.reviewBy = new Date(Date.now() + 86400000).toISOString();
  await writeFile(approvedPath, JSON.stringify(decision));
  const missing = run(approvedPath, {});
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /TMDB_READ_ACCESS_TOKEN is not configured/);
  await assert.rejects(readdir(out));
});
test('publish workflow is dormant until approved, pinned, master-only and saves only success', async () => {
  const { parseDocument } = await import('yaml');
  const text = await readFile(new URL('../../.github/workflows/catalog-publish.yml', import.meta.url), 'utf8');
  const document = parseDocument(text); assert.deepEqual(document.errors, []);
  const workflow = document.toJS();
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.ok(workflow.on.schedule?.length && 'workflow_dispatch' in workflow.on);
  assert.equal(workflow.on.pull_request_target, undefined); assert.equal(workflow.on.pull_request, undefined);
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  const { gate, publish } = workflow.jobs;
  assert.doesNotMatch(JSON.stringify(gate), /secrets\./);
  assert.match(publish.if, /needs\.gate\.outputs\.approved == 'true'/); assert.match(publish.if, /refs\/heads\/master/);
  for (const step of [...gate.steps, ...publish.steps]) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
  assert.equal(publish.steps[0].with['persist-credentials'], false);
  const secretSteps = publish.steps.filter((step: any) => JSON.stringify(step).includes('secrets.'));
  assert.equal(secretSteps.length, 1); assert.equal(secretSteps[0].shell, 'bash');
  assert.match(secretSteps[0].run, /tools\/publish-live\.ts/);
  assert.equal(publish.steps.find((step: any) => step.uses?.startsWith('actions/cache/save@')).if, 'success()');
  assert.doesNotMatch(text, /VITE_|upload-artifact|pages: write|id-token:|deployments:/);
});
