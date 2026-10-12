import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildCatalogArtifacts } from '../artifacts.ts';
import { validatePromotion } from '../promotion.ts';
import { snapshotSchema, type Snapshot } from '../schema.ts';
import { requireLiveApproval } from './decision.ts';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const encode = (value: unknown) => `${JSON.stringify(value)}\n`;
const safeRoot = /^[a-z0-9][a-z0-9-]{0,79}-[a-f0-9]{12}(?:-a2)?$/;
interface Pointer { schemaVersion: 1; root: string; snapshotHash: string }
async function readPointer(directory: string): Promise<Pointer | undefined> {
  let text: string;
  try { text = await readFile(join(directory, 'current.json'), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  const value = JSON.parse(text);
  if (value.schemaVersion !== 1 || typeof value.root !== 'string' || !safeRoot.test(value.root) || !/^[a-f0-9]{64}$/.test(value.snapshotHash)) throw new Error('Invalid publication pointer');
  return value;
}
async function verifyVersion(directory: string, root: string, expectedHash: string): Promise<Snapshot> {
  if (!safeRoot.test(root) || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Invalid immutable artifact identity');
  const folder = join(directory, 'data', root);
  const bytes = await readFile(join(folder, 'snapshot.json'), 'utf8');
  if (hash(bytes) !== expectedHash) throw new Error('Immutable snapshot hash mismatch');
  const snapshot = snapshotSchema.parse(JSON.parse(bytes));
  // Old retained artifacts remain readable/rollbackable; new writes always use
  // the current format's distinct immutable URL namespace.
  const artifacts = buildCatalogArtifacts(snapshot, expectedHash,root.endsWith('-a2')?2:1);
  if (artifacts.dataRoot !== `/data/${root}`) throw new Error('Immutable artifact path mismatch');
  const expected = new Map<string, unknown>([['snapshot.json', snapshot], ['manifest.json', artifacts.manifest], ['search.json', artifacts.search], ...artifacts.pages.map(page => [`page-${page.page}.json`, page] as [string, unknown])]);
  const names = await readdir(folder);
  if (names.length !== expected.size || names.some(name => !expected.has(name))) throw new Error('Incomplete immutable artifact set');
  for (const [name, value] of expected) {
    if (await readFile(join(folder, name), 'utf8') !== encode(value)) throw new Error('Artifact envelope or content mismatch');
  }
  return snapshot;
}
export async function readCurrent(directory: string) {
  const pointer = await readPointer(directory);
  if (!pointer) return undefined;
  return { pointer, snapshot: await verifyVersion(directory, pointer.root, pointer.snapshotHash) };
}
async function exclusive<T>(directory: string, action: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true });
  const lock = join(directory, '.publisher-lock');
  try { await mkdir(lock); } catch { throw new Error('Publisher lock unavailable; inspect the prior job before retrying'); }
  try { return await action(); } finally { await rm(lock, { recursive: true }); }
}
async function switchPointer(directory: string, pointer: Pointer) {
  const temporary = join(directory, `.current-${randomUUID()}.json`);
  try {
    await writeFile(temporary, encode(pointer), { flag: 'wx' });
    await rename(temporary, join(directory, 'current.json'));
  } finally { await rm(temporary, { force: true }); }
}

/** Local artifact promotion only, not a hosting deployment. The final pointer
 * rename is the sole publication point. Existing immutable paths are verified,
 * never overwritten. A failed attempt cannot edit the previous pointer/data.
 */
export async function publishSnapshot(directory: string, candidate: unknown, options: { now?: number; decision?: unknown; beforePromotion?: () => Promise<void> } = {}) {
  directory = resolve(directory);
  return exclusive(directory, async () => {
    const previous = await readCurrent(directory);
    const now = options.now ?? Date.now();
    const snapshot = validatePromotion(candidate, previous?.snapshot, now);
    // Only a committed owner approval (decision.ts) admits live data.
    if (snapshot.source !== 'fixture') requireLiveApproval(options.decision, now);
    // No provider-host evidence registry is approved yet. Only the supplied
    // source watch page can leave this publisher, even if an input claims proof.
    if (snapshot.titles.some(title => title.offers.some(offer => offer.link.kind !== 'tmdb-watch-page'))) throw new Error('Provider deep-link authorization is not configured');
    const bytes = encode(snapshot);
    const snapshotHash = hash(bytes);
    const artifacts = buildCatalogArtifacts(snapshot, snapshotHash);
    const root = artifacts.dataRoot.slice('/data/'.length);
    const data = join(directory, 'data');
    await mkdir(data, { recursive: true });
    const staging = join(data, `.staging-${randomUUID()}`);
    await mkdir(staging);
    try {
      await writeFile(join(staging, 'snapshot.json'), bytes, { flag: 'wx' });
      await writeFile(join(staging, 'manifest.json'), encode(artifacts.manifest), { flag: 'wx' });
      await writeFile(join(staging, 'search.json'), encode(artifacts.search), { flag: 'wx' });
      for (const page of artifacts.pages) await writeFile(join(staging, `page-${page.page}.json`), encode(page), { flag: 'wx' });
      try { await rename(staging, join(data, root)); }
      catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        // An existing version is reusable only if every byte matches its hash.
      }
      await verifyVersion(directory, root, snapshotHash);
      await options.beforePromotion?.();
      const pointer: Pointer = { schemaVersion: 1, root, snapshotHash };
      await switchPointer(directory, pointer);
      return pointer;
    } finally { await rm(staging, { recursive: true, force: true }); }
  });
}
/** Explicit rollback picks an already validated retained version. It does not
 * rewrite checkedAt or bypass integrity/source checks; normal refresh drop gates
 * intentionally do not apply to an operator choosing an older good artifact.
 */
export async function rollbackSnapshot(directory: string, root: string, snapshotHash: string) {
  return exclusive(resolve(directory), async () => {
    const current = await readCurrent(directory);
    if (!current) throw new Error('No current artifact to roll back');
    const snapshot = await verifyVersion(directory, root, snapshotHash);
    if (snapshot.source !== current.snapshot.source || snapshot.region !== current.snapshot.region) throw new Error('Rollback source or region mismatch');
    await switchPointer(directory, { schemaVersion: 1, root, snapshotHash });
  });
}
