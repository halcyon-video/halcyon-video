export interface DeploymentPolicy {
  schemaVersion:1;project:'halcyon-showcase';networkPublishingEnabled:false;cloudPreviewEnabled:boolean;
  canonicalHost:string|null;cloudflareAccountId:string|null;cloudflareProjectName:string|null;
  sourcePermissionReference:string|null;approvedMasterSha:string|null;
  monthlyHostingCeilingUsd:5;previewProtection:'unconfigured'|'owner-approved'|'public-noindex';dailyRefreshEnabled:false;
}
export function validatePolicy(value:unknown):DeploymentPolicy {
  if(!value||typeof value!=='object')throw Error('Deployment policy is missing');
  const row=value as DeploymentPolicy;
  if(typeof row.cloudPreviewEnabled!=='boolean')throw Error('Cloud preview must be explicitly enabled or disabled');
  if(row.schemaVersion!==1||row.project!=='halcyon-showcase'||row.networkPublishingEnabled!==false||row.dailyRefreshEnabled!==false||row.monthlyHostingCeilingUsd!==5)
    throw Error('Network publishing and scheduled refresh are not activated by this foundation');
  for(const key of ['canonicalHost','cloudflareAccountId','cloudflareProjectName','sourcePermissionReference','approvedMasterSha'] as const)
    if(row[key]!==null&&(typeof row[key]!=='string'||!row[key].trim()))throw Error('Invalid deployment decision record');
  if(row.canonicalHost&&!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(row.canonicalHost))throw Error('Canonical host must be a recorded hostname, not a URL');
  // The account ID itself stays in the protected CI environment; the policy records only where it lives.
  if(row.cloudflareAccountId&&row.cloudflareAccountId!=='environment-secret'&&!/^[a-f0-9]{32}$/.test(row.cloudflareAccountId))throw Error('Cloudflare account must be an account ID or environment-secret');
  if(row.cloudflareProjectName&&!/^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(row.cloudflareProjectName))throw Error('Invalid Cloudflare Pages project name');
  if(row.approvedMasterSha&&!/^[a-f0-9]{40}$/.test(row.approvedMasterSha))throw Error('Approved release requires a full source SHA');
  if(!['unconfigured','owner-approved','public-noindex'].includes(row.previewProtection))throw Error('Preview protection must be explicit');
  return row;
}
export function deploymentDecision(policy:DeploymentPolicy,target:string,sourceSha:string){
  validatePolicy(policy);
  if(!/^[a-f0-9]{40}$/.test(sourceSha))return {allowed:false,publishes:false,reasons:['A full verified source commit is required.']};
  if(target==='local-preview')return {allowed:true,publishes:false,reasons:['Loopback fixture simulation only. No hosting API is enabled.']};
  if(target==='cloud-preview'){
    // A noindex fixture preview on the provider's own preview address. It never needs the canonical
    // host or real-data permission, because it publishes only the committed fixture catalog.
    const reasons=[];
    if(!policy.cloudPreviewEnabled)reasons.push('Cloud preview is not enabled.');
    if(!policy.cloudflareAccountId||!policy.cloudflareProjectName)reasons.push('The intended Cloudflare account and project are not recorded.');
    if(policy.previewProtection==='unconfigured')reasons.push('Preview access needs an owner decision; noindex is not authentication.');
    return reasons.length?{allowed:false,publishes:false,reasons}:{allowed:true,publishes:true,reasons:['Fixture-only noindex preview on the provider preview address.']};
  }
  const reasons=['Network publishing is not activated.'];
  if(!policy.sourcePermissionReference)reasons.push('Project-specific source and image permission is unresolved.');
  if(!policy.canonicalHost)reasons.push('The owner has not recorded the canonical owned host.');
  if(!policy.cloudflareAccountId||!policy.cloudflareProjectName)reasons.push('The intended Cloudflare account and project are not recorded.');
  if(target==='production'||target==='data-refresh'){
    if(policy.approvedMasterSha!==sourceSha)reasons.push('Production and refresh require the exact owner-approved master SHA, not dev.');
    if(target==='data-refresh')reasons.push('Daily refresh is disabled.');
  }
  return {allowed:false,publishes:false,reasons};
}
