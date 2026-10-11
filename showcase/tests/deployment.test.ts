import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {parseDocument} from 'yaml';
import {snapshotSchema} from '../src/catalog/schema.ts';
import {buildCatalogArtifacts} from '../src/catalog/artifacts.ts';
import {createBundle,verifyBundle,digest,inspectStaticOutput} from '../src/deployment/artifact.ts';
import {switchLocal,readLocalCurrent,startLocalPreview} from '../src/deployment/local.ts';
import {validatePolicy,deploymentDecision} from '../src/deployment/policy.ts';
import {storeEntryFiles} from '../src/deployment/store-entry.ts';
import {HOSTED_STORE_URL} from '../../src/catalog-handoff.ts';
import {verifiedSource} from '../src/deployment/source.ts';
const toolchain={node:'v22.19.0',astro:'7.3.3'},sourceA='a'.repeat(40),sourceB='b'.repeat(40);
const encode=(value:unknown)=>JSON.stringify(value);
async function setup(t:any,variant='a'){
  const directory=await mkdtemp(join(tmpdir(),'halcyon-deployment-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const dist=join(directory,'dist'),store=join(directory,'store');await mkdir(dist);
  const snapshot=snapshotSchema.parse(JSON.parse(await readFile(new URL('../fixtures/catalog.json',import.meta.url),'utf8')));
  snapshot.snapshotVersion+='-'+variant;
  const hash=digest(encode(snapshot)),artifacts=buildCatalogArtifacts(snapshot,hash);
  const put=async(path:string,text:string)=>{await mkdir(join(dist,path,'..'),{recursive:true});await writeFile(join(dist,path),text);};
  const html=(text:string)=>`<!doctype html><html><head><meta name="robots" content="noindex, nofollow"><meta name="halcyon-snapshot" content="${hash}"></head><body>${text}</body></html>`;
  await put('index.html',html('Preview '+variant));await put('404.html',html('Not found'));
  for(const route of ['about','store','self-host','browse','browse/movies','browse/tv'])await put(route+'/index.html',html('Static '+route));
  for(const title of snapshot.titles)await put(`title/${title.mediaType}/${title.tmdbId}/index.html`,html(title.title));
  await put('_headers',await readFile(new URL('../public/_headers',import.meta.url),'utf8'));
  await put('robots.txt','User-agent: *\nDisallow: /\n');
  await put('build-provenance.json',encode({version:1,sourceCommit:variant==='b'?sourceB:sourceA,clean:true,toolchain}));
  await put('data/manifest.json',encode(artifacts.manifest));
  await put(artifacts.manifest.search.slice(1),encode(artifacts.search));
  for(const page of artifacts.pages)await put(`${artifacts.dataRoot.slice(1)}/page-${page.page}.json`,encode(page));
  return {directory,dist,store,put,hash,artifacts};
}
test('fixture-only policy cannot be opened by credentials, production or refresh inputs',async()=>{
  const policy=validatePolicy(JSON.parse(await readFile(new URL('../deployment/policy.json',import.meta.url),'utf8')));
  assert.equal(deploymentDecision(policy,'local-preview',sourceA).allowed,true);
  for(const target of ['production','data-refresh','unknown']){
    const result=deploymentDecision(policy,target,sourceA);assert.equal(result.allowed,false);assert.equal(result.publishes,false);
  }
  assert.throws(()=>validatePolicy({...policy,networkPublishingEnabled:true}),/not activated/);
  assert.throws(()=>validatePolicy({...policy,dailyRefreshEnabled:true}),/not activated/);
  assert.equal(deploymentDecision({...policy,approvedMasterSha:sourceA},'data-refresh',sourceB).allowed,false);
  assert.equal(deploymentDecision(policy,'local-preview','short').allowed,false);
});
test('cloud preview opens only for an enabled, recorded, owner-decided store redirect',async()=>{
  const policy=validatePolicy(JSON.parse(await readFile(new URL('../deployment/policy.json',import.meta.url),'utf8')));
  assert.deepEqual(deploymentDecision(policy,'cloud-preview',sourceA),{allowed:true,publishes:true,reasons:['Noindex redirect to the hosted 3D store on the provider preview address.']});
  assert.equal(policy.networkPublishingEnabled,false);assert.equal(policy.canonicalHost,null);assert.equal(policy.approvedMasterSha,null);
  for(const change of [{cloudPreviewEnabled:false},{previewProtection:'unconfigured'},{cloudflareProjectName:null},{cloudflareAccountId:null}])
    assert.equal(deploymentDecision({...policy,...change} as any,'cloud-preview',sourceA).allowed,false);
  assert.equal(deploymentDecision(policy,'cloud-preview','short').allowed,false);
  assert.throws(()=>validatePolicy({...policy,cloudPreviewEnabled:'yes'}),/explicitly/);
  assert.throws(()=>validatePolicy({...policy,cloudflareAccountId:'not-an-id'}),/account/);
  assert.throws(()=>validatePolicy({...policy,cloudflareProjectName:'https://example.pages.dev'}),/project name/);
});
test('bundle seals exact source, complete catalog and every public byte',async t=>{
  const f=await setup(t),first=await createBundle(f.dist,join(f.store,'bundles'),sourceA,toolchain);
  assert.equal(first.receipt.sourceCommit,sourceA);assert.equal(first.receipt.snapshot.hash,f.hash);
  assert.equal(first.receipt.mode,'fixture-local-preview');assert.equal(first.receipt.files.length,16);
  assert.deepEqual((await createBundle(f.dist,join(f.store,'bundles'),sourceA,toolchain)).receipt,first.receipt);
  await writeFile(join(first.directory,'site/index.html'),'changed');await assert.rejects(verifyBundle(first.directory),/snapshot|changed/);
});
for(const path of ['.env','user-assets/private.jpg','functions/index.js','_worker.js','assets/site.js.map','AGENT-RULES.md'])test('refuses forbidden output '+path,async t=>{
  const f=await setup(t);await f.put(path,'private fixture');await assert.rejects(inspectStaticOutput(f.dist,sourceA,toolchain),/path|asset|directory/i);
});
test('unregistered JSON cannot be hidden alongside the public catalog',async t=>{
  const f=await setup(t);await f.put('data/private-records.json','{}');await assert.rejects(inspectStaticOutput(f.dist,sourceA,toolchain),/Unexpected file/);
});
test('stale and dirty build provenance cannot be relabeled as the current source',async t=>{
  const f=await setup(t);
  await f.put('build-provenance.json',encode({version:1,sourceCommit:sourceB,clean:true,toolchain}));
  await assert.rejects(inspectStaticOutput(f.dist,sourceA,toolchain),/provenance/);
  await f.put('build-provenance.json',encode({version:1,sourceCommit:sourceA,clean:false,toolchain}));
  await assert.rejects(inspectStaticOutput(f.dist,sourceA,toolchain),/provenance/);
});
test('symbolic links, secret markers, canonical hosts and mixed snapshots fail closed',async t=>{
  const f=await setup(t);await writeFile(join(f.directory,'outside.json'),'outside');await symlink(join(f.directory,'outside.json'),join(f.dist,'linked.json'));
  await assert.rejects(inspectStaticOutput(f.dist,sourceA,toolchain),/Symbolic/);await rm(join(f.dist,'linked.json'));
  await f.put('secret.js','const key="TMDB_READ_ACCESS_TOKEN";');await assert.rejects(inspectStaticOutput(f.dist,sourceA,toolchain),/Sensitive/);await rm(join(f.dist,'secret.js'));
  const index=await readFile(join(f.dist,'index.html'),'utf8');await f.put('index.html',index.replace('</head>','<link rel="canonical" href="https://unapproved.example/"></head>'));
  await assert.rejects(inspectStaticOutput(f.dist,sourceA,toolchain),/canonical/);await f.put('index.html',index.replace(f.hash,'c'.repeat(64)));
  await assert.rejects(inspectStaticOutput(f.dist,sourceA,toolchain),/snapshot/);
});
test('local failed promotion preserves pointer; rollback restores the complete prior artifact and receipt',async t=>{
  const a=await setup(t,'a'),b=await setup(t,'b');
  const first=await createBundle(a.dist,join(a.store,'bundles'),sourceA,toolchain),second=await createBundle(b.dist,join(a.store,'bundles'),sourceB,toolchain);
  await switchLocal(a.store,first.receipt.id,'promote');const pointer=await readFile(join(a.store,'current.json'),'utf8');
  await assert.rejects(switchLocal(a.store,second.receipt.id,'promote',async()=>{throw Error('failed check');}),/failed check/);
  assert.equal(await readFile(join(a.store,'current.json'),'utf8'),pointer);
  await switchLocal(a.store,second.receipt.id,'promote');assert.equal((await readLocalCurrent(a.store))?.bundle.sourceCommit,sourceB);
  await switchLocal(a.store,first.receipt.id,'rollback');const selected=await readLocalCurrent(a.store);
  assert.equal(selected?.bundle.id,first.receipt.id);assert.equal(selected?.receipt.provider,'simulation');assert.equal(selected?.activation,'selected');
  assert.equal(selected?.receipt.state,'prepared','immutable records alone never claim a successful activation');
  console.log(JSON.stringify({case:'local-rollback',sourceCommit:selected?.bundle.sourceCommit,snapshotHash:selected?.bundle.snapshot.hash,receiptId:selected?.pointer.receiptId,provider:'simulation',published:false}));
});
test('concurrent local promotions serialize, while corruption cannot replace the current bundle',async t=>{
  const a=await setup(t,'a'),b=await setup(t,'b');const first=await createBundle(a.dist,join(a.store,'bundles'),sourceA,toolchain),second=await createBundle(b.dist,join(a.store,'bundles'),sourceB,toolchain);
  await switchLocal(a.store,first.receipt.id,'promote');let release!:()=>void,reached!:()=>void;
  const entered=new Promise<void>(r=>reached=r),held=switchLocal(a.store,second.receipt.id,'promote',async()=>{reached();await new Promise<void>(r=>release=r);});
  await entered;await assert.rejects(switchLocal(a.store,first.receipt.id,'rollback'),/lock/);release();await held;
  await writeFile(join(first.directory,'site/index.html'),'corrupt');await assert.rejects(switchLocal(a.store,first.receipt.id,'rollback'));
  assert.equal((await readLocalCurrent(a.store))?.bundle.id,second.receipt.id);
});
test('loopback preview has deep routes, genuine 404, noindex/cache isolation and old immutable data through rollback',async t=>{
  const a=await setup(t,'a'),b=await setup(t,'b');const first=await createBundle(a.dist,join(a.store,'bundles'),sourceA,toolchain),second=await createBundle(b.dist,join(a.store,'bundles'),sourceB,toolchain);
  await switchLocal(a.store,first.receipt.id,'promote');const preview=await startLocalPreview(a.store);
  t.after(()=>new Promise<void>(r=>preview.server.close(()=>r())));
  assert.equal((preview.server.address() as {address:string}).address,'127.0.0.1');
  const root=await fetch(preview.url+'/');assert.equal(root.status,200);assert.match(await root.text(),/Preview a/);assert.equal(root.headers.get('x-robots-tag'),'noindex, nofollow');
  assert.match(root.headers.get('cache-control')||'',/max-age=0/);
  assert.equal((await fetch(preview.url+'/title/tv/1/')).status,200);assert.equal((await fetch(preview.url+'/missing/')).status,404);
  assert.equal((await fetch(preview.url+'/%2eprivate')).status,400);assert.equal((await fetch(preview.url+'/',{method:'POST'})).status,405);
  await switchLocal(a.store,second.receipt.id,'promote');assert.match(await(await fetch(preview.url+'/')).text(),/Preview b/);
  const old=await fetch(preview.url+a.artifacts.manifest.search);assert.equal(old.status,200);assert.match(old.headers.get('cache-control')||'',/immutable/);
  await switchLocal(a.store,first.receipt.id,'rollback');assert.match(await(await fetch(preview.url+'/')).text(),/Preview a/);
});
test('explicit rollback recovers corrupted current bytes without erasing the failed artifact',async t=>{
  const a=await setup(t,'a'),b=await setup(t,'b');const first=await createBundle(a.dist,join(a.store,'bundles'),sourceA,toolchain),second=await createBundle(b.dist,join(a.store,'bundles'),sourceB,toolchain);
  await switchLocal(a.store,first.receipt.id,'promote');await switchLocal(a.store,second.receipt.id,'promote');
  await writeFile(join(second.directory,'site/index.html'),'failed deployment bytes');
  await assert.rejects(switchLocal(a.store,first.receipt.id,'promote'));
  await switchLocal(a.store,first.receipt.id,'rollback');assert.equal((await readLocalCurrent(a.store))?.bundle.id,first.receipt.id);
  assert.equal(await readFile(join(second.directory,'site/index.html'),'utf8'),'failed deployment bytes');
});
test('source provenance refuses dirty checkouts and shortened or mismatched commits',async t=>{
  const f=await setup(t),repo=join(f.directory,'source');await mkdir(repo);
  const git=(...args:string[])=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
  git('init','-q');git('config','user.name','devbjackson');git('config','user.email','90806411+devbjackson@users.noreply.github.com');
  await writeFile(join(repo,'source.txt'),'fixture');git('add','source.txt');git('commit','-qm','Fixture source');const sha=git('rev-parse','HEAD');
  assert.equal(verifiedSource(repo,sha),sha);assert.throws(()=>verifiedSource(repo,'short'),/full/);assert.throws(()=>verifiedSource(repo,sourceA),/differs/);
  await writeFile(join(repo,'source.txt'),'changed');assert.throws(()=>verifiedSource(repo,sha),/clean/);
});
test('artifact workflow is parseable, pinned, secret-free and cannot deploy',async()=>{
  const text=await readFile(new URL('../../.github/workflows/showcase-artifacts.yml',import.meta.url),'utf8');
  const document=parseDocument(text);assert.deepEqual(document.errors,[]);const workflow=document.toJS();
  assert.deepEqual(workflow.permissions,{contents:'read'});assert.equal(workflow.on.pull_request_target,undefined);assert.equal(workflow.on.schedule,undefined);
  assert.equal(workflow.concurrency['cancel-in-progress'],false);
  const steps=workflow.jobs.verify.steps;for(const step of steps)if(step.uses)assert.match(step.uses,/@[a-f0-9]{40}$/);
  assert.equal(steps[0].with['persist-credentials'],false);
  assert.doesNotMatch(text,/secrets\.|wrangler-action|pages deploy|id-token:|deployments:|pages: write|pull_request_target/);
  const upload=steps.find((step:any)=>step.uses?.startsWith('actions/upload-artifact@'));assert.match(upload.if,/event_name != 'pull_request'/);assert.match(upload.if,/actor == 'devbjackson'/);
  assert.deepEqual(upload.with.path.trim().split('\n'),['showcase/input/deployment/bundles/','showcase/input/readiness/metadata.json','showcase/input/readiness/reports/']);assert.equal(steps.find((step:any)=>step.env?.SOURCE_COMMIT)?.env.SOURCE_COMMIT,'${{ github.sha }}');
  const readiness=steps.find((step:any)=>step.name==='Write readiness receipts and prove the launch gate stays closed');assert.match(readiness.run,/--require-launch-ready/);assert.match(readiness.run,/-eq 75/);
  assert(steps.findIndex((step:any)=>step.run==='npm run test:browser')<steps.findIndex((step:any)=>step.name==='Package verified fixture output'));
});
test('preview workflow is trusted-dev-only, pinned, gated, uploads only the store entry and keeps production closed',async()=>{
  const text=await readFile(new URL('../../.github/workflows/showcase-preview.yml',import.meta.url),'utf8');
  const document=parseDocument(text);assert.deepEqual(document.errors,[]);const workflow=document.toJS();
  assert.deepEqual(workflow.permissions,{contents:'read'});assert.deepEqual(Object.keys(workflow.on).sort(),['push','workflow_dispatch']);
  assert.deepEqual(workflow.on.push.branches,['dev']);assert.equal(workflow.concurrency['cancel-in-progress'],false);
  const job=workflow.jobs.preview;assert.match(job.if,/github.ref == 'refs\/heads\/dev'/);assert.match(job.if,/github.actor == 'devbjackson'/);assert.match(job.if,/github.repository == 'halcyon-video\/halcyon-video'/);
  const steps=job.steps;for(const step of steps)if(step.uses)assert.match(step.uses,/@[a-f0-9]{40}$/);
  assert.equal(steps[0].with['persist-credentials'],false);assert.doesNotMatch(text,/pull_request|schedule:|wrangler-action|npx --yes|id-token:|package:preview|showcase\/dist/);
  const index=(name:string)=>steps.findIndex((step:any)=>step.run===name||step.name===name);
  const gate=index('Gate and write the store entry'),deploy=index('Upload the store entry as the dev preview and delete superseded uploads');
  assert(gate>0&&gate<deploy);assert.match(steps[gate].run,/deployment:cloud-preview-gate/);
  for(const [index,step] of steps.entries())if(index!==deploy)assert.doesNotMatch(JSON.stringify(step),/secrets\./);
  assert.equal(steps[deploy].env.SITE,'${{ steps.entry.outputs.site }}');
  assert.match(steps[deploy].run,/pages deploy "\$SITE"/);assert.match(steps[deploy].run,/--branch dev/);assert.doesNotMatch(steps[deploy].run,/--branch (master|main)/);
  assert.match(steps[deploy].run,/\.environment == "preview" and \.id != \$current/);
  const lock=JSON.parse(await readFile(new URL('../deployment/wrangler/package-lock.json',import.meta.url),'utf8'));
  const tools=JSON.parse(await readFile(new URL('../deployment/toolchain.json',import.meta.url),'utf8'));
  assert.equal(lock.packages['node_modules/wrangler'].version,tools.wrangler);
});
test('store entry sends every path straight to the hosted 3D store and nothing else',()=>{
  const files=storeEntryFiles();
  assert.deepEqual(Object.keys(files).sort(),['_headers','_redirects','index.html']);
  assert.equal(files._redirects,`/* ${HOSTED_STORE_URL} 302\n`);
  assert.match(files._headers,/^\/\*\n  X-Robots-Tag: noindex, nofollow\n/);
  assert.match(files['index.html'],/<meta name="robots" content="noindex, nofollow">/);
  assert(files['index.html'].includes(`<meta http-equiv="refresh" content="0; url=${HOSTED_STORE_URL}">`));
  assert.doesNotMatch(Object.values(files).join(''),/data\/|browse|catalog|<script/i);
  for(const bad of ['http://example.com/','https://example.com/?catalog=1','https://example.com/#x','https://user@example.com/','https://example.com/a"b','example.com'])
    assert.throws(()=>storeEntryFiles(bad));
});
