#!/usr/bin/env node
// Gate for the trusted cloud-preview job: the policy must allow a fixture preview for this exact
// source, and the bundle must still match its seal. Prints only the site directory to upload.
import {readFile,appendFile} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {verifyBundle} from '../src/deployment/artifact.ts';
import {deploymentDecision,validatePolicy} from '../src/deployment/policy.ts';
const [bundle,expected]=process.argv.slice(2);
try{
  if(!bundle||!expected||process.argv.length!==4)throw Error('Usage: cloud-preview-gate <bundle-directory> <exact-source-commit>');
  const policy=validatePolicy(JSON.parse(await readFile('deployment/policy.json','utf8')));
  const decision=deploymentDecision(policy,'cloud-preview',expected);if(!decision.allowed)throw Error(decision.reasons.join(' '));
  const directory=resolve(bundle),receipt=await verifyBundle(directory,basename(directory));
  if(receipt.sourceCommit!==expected)throw Error('Bundle was built from a different source commit');
  if(receipt.snapshot.source!=='fixture')throw Error('Cloud preview publishes only the committed fixture catalog');
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Cloud preview gate\n\nSource: ${receipt.sourceCommit}\n\nBundle: ${receipt.id}\n\nSnapshot: ${receipt.snapshot.hash} (fixture), checked ${receipt.snapshot.checkedAt}\n\nProduction publishing remains disabled.\n`);
  console.log(join(directory,'site'));
}catch(error){console.error(error instanceof Error?error.message:'Cloud preview gate failed');process.exitCode=75;}
