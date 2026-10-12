#!/usr/bin/env node
// Gate for the trusted cloud-preview job: the policy must allow the preview for this exact source.
// It writes the store entry (a redirect of every path to the hosted 3D store) into an empty
// directory and prints only that directory to upload. The flat catalog is never published.
import {readFile,writeFile,mkdir,readdir,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {deploymentDecision,validatePolicy} from '../src/deployment/policy.ts';
import {storeEntryFiles} from '../src/deployment/store-entry.ts';
import {HOSTED_STORE_URL} from '../../src/catalog-handoff.ts';
const [output,expected]=process.argv.slice(2);
try{
  if(!output||!expected||process.argv.length!==4)throw Error('Usage: cloud-preview-gate <empty-output-directory> <exact-source-commit>');
  const policy=validatePolicy(JSON.parse(await readFile('deployment/policy.json','utf8')));
  const decision=deploymentDecision(policy,'cloud-preview',expected);if(!decision.allowed)throw Error(decision.reasons.join(' '));
  const directory=resolve(output);await mkdir(directory,{recursive:true});
  if((await readdir(directory)).length)throw Error('The store entry directory must start empty');
  for(const [name,text] of Object.entries(storeEntryFiles()))await writeFile(join(directory,name),text,{flag:'wx'});
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Cloud preview gate\n\nSource: ${expected}\n\nEvery path redirects to the hosted 3D store: ${HOSTED_STORE_URL}\n\nThe flat catalog and production publishing remain unpublished.\n`);
  console.log(directory);
}catch(error){console.error(error instanceof Error?error.message:'Cloud preview gate failed');process.exitCode=75;}
