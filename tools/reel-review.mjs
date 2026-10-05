#!/usr/bin/env node
// Local private preparation only. Never calls a publisher or the review queue.
import {execFileSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,lstat,open,rename,rm,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,validateReceipt,videoFacts,assessTake,reviewCopy,reviewHtml} from './reel-review-lib.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const args=process.argv.slice(2),options={};
const allowed=['--out','--clip','--receipt','--attestation','--released-revision'];
async function shaFile(file){const digest=createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');}
async function localJson(file,max=32000){const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('Invalid local review input');return JSON.parse(await readFile(file,'utf8'));}
async function privateDirectory(directory){
  const base=path.join(root,'scratch','publicity-kits'),target=path.resolve(directory);
  if(!target.startsWith(base+path.sep))throw Error('Review output must be a new child of this checkout scratch/publicity-kits');
  let current=root;
  for(const part of path.relative(root,target).split(path.sep)){current=path.join(current,part);try{const stat=await lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Unsafe review output');}catch(error){if(error.code!=='ENOENT')throw error;await mkdir(current,{mode:0o700});}}
  return target;
}
const ffprobe=process.env.HALCYON_FFPROBE||'ffprobe',ffmpeg=process.env.HALCYON_FFMPEG||'ffmpeg';
function probe(file){
  const text=execFileSync(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-count_frames','-show_frames','-show_entries','stream=codec_type,codec_name,width,height,pix_fmt,sample_aspect_ratio,nb_read_frames:stream_side_data=rotation:format=duration,format_name:frame=best_effort_timestamp_time','-of','json',file],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
  return videoFacts(JSON.parse(text));
}
function packetHash(file){return execFileSync(ffmpeg,['-v','error','-protocol_whitelist','file,pipe','-i',file,'-map','0:v:0','-c:v','copy','-f','streamhash','-hash','sha256','-'],{encoding:'utf8',timeout:180000,maxBuffer:32000,stdio:['ignore','pipe','pipe']}).trim();}
async function main(){
  for(let i=0;i<args.length;i+=2){if(!allowed.includes(args[i])||!args[i+1]||options[args[i]])throw Error('Invalid option pairs');options[args[i]]=args[i+1];}
  if(!options['--out']||!!options['--clip']!==!!options['--receipt']||options['--attestation']&&!options['--clip'])throw Error('A clip and its capture receipt must be supplied together');
  const released=options['--released-revision']||null;if(released&&!/^[a-f0-9]{40}$/.test(released))throw Error('Released source requires an observed full revision');
  const out=await privateDirectory(options['--out']);
  let assessment={reviewReady:false,publicationApproved:false,sourceLabel:'No qualifying owner take supplied; copy preparation only.',blockers:['Human-operated personal-library footage and its capture details have not been supplied.']};
  let clip=null,videoSha256=null,receiptSha256=null,attestationSha256=null;
  if(options['--clip']){
    clip=path.resolve(options['--clip']);const stat=await lstat(clip);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size<16||stat.size>600*1024*1024)throw Error('A bounded regular local video file is required');
    const handle=await open(clip,'r'),head=Buffer.alloc(16);try{await handle.read(head,0,16,0);}finally{await handle.close();}
    if(head.toString('ascii',4,8)!=='ftyp'&&head.subarray(0,4).toString('hex')!=='1a45dfa3')throw Error('Only native MP4/WebM capture input is accepted; playlists and remote protocols are refused');
    const receiptPath=path.resolve(options['--receipt']),receipt=validateReceipt(await localJson(receiptPath));
    videoSha256=await shaFile(clip);receiptSha256=await shaFile(receiptPath);
    const attestation=options['--attestation']?await localJson(path.resolve(options['--attestation'])):null;
    if(attestation)attestationSha256=hash(JSON.stringify(attestation));
    assessment=assessTake(receipt,probe(clip),{bytes:stat.size,videoSha256,attestation,releasedRevision:released});
    if(await shaFile(clip)!==videoSha256)throw Error('Video changed during inspection');
  }
  const report={schemaVersion:1,kind:'private-reel-review',...assessment,videoSha256,receiptSha256,attestationSha256,
    reviewQueueChanged:false,publicPostingPerformed:false,copy:reviewCopy};
  const staging=path.join(out,'.staging-'+randomUUID());
  await mkdir(staging,{mode:0o700});let mediaName=null;
  try{
    if(clip&&assessment.reviewReady){
      const target=path.join(staging,'media.mp4'),originalPackets=packetHash(clip);
      execFileSync(ffmpeg,['-v','error','-n','-protocol_whitelist','file,pipe','-i',clip,'-map','0:v:0','-c:v','copy','-an','-map_metadata','-1','-map_chapters','-1','-fflags','+bitexact','-movflags','+faststart',target],{timeout:180000,stdio:['ignore','ignore','pipe']});
      const output=probe(target);
      if(packetHash(target)!==originalPackets||output.decodedFrames!==assessment.mechanicalFacts.decodedFrames||output.width!==assessment.mechanicalFacts.width||output.height!==assessment.mechanicalFacts.height||await shaFile(clip)!==videoSha256)throw Error('Review remux did not preserve the exact encoded video stream');
      const outputHash=await shaFile(target);mediaName='media-'+outputHash+'.mp4';await rename(target,path.join(staging,mediaName));
      report.reviewMedia={name:mediaName,sha256:outputHash,containerMetadataStripped:true,transcoded:false,framesInterpolated:false};
    }
    const final=path.join(out,'review-'+hash(JSON.stringify(report)));
    const files={'review.json':JSON.stringify(report,null,2)+'\n','review.html':reviewHtml(report,mediaName),'captions.txt':reviewCopy.hooks.join('\n\n')+'\n','press-pitch.txt':reviewCopy.pitch+'\n','feature-sheet.txt':reviewCopy.features.join('\n')+'\n','publication-plan.txt':reviewCopy.sequence.join('\n')+'\n\n'+reviewCopy.measurement+'\n'};
    for(const [name,bytes] of Object.entries(files))await writeFile(path.join(staging,name),bytes,{flag:'wx',mode:0o600});
    try{await rename(staging,final);}catch(error){
      // Windows reports a populated destination directory as EPERM/EACCES.
      // Admit that case only for a real directory, then verify every byte below.
      const existing=await lstat(final).catch(()=>null);
      const existsCodes=['EEXIST','ENOTEMPTY',...(process.platform==='win32'?['EPERM','EACCES']:[])];
      if(!existsCodes.includes(error.code)||!existing?.isDirectory()||existing.isSymbolicLink())throw error;
      const expected=[...Object.keys(files),...(mediaName?[mediaName]:[])].sort();
      if(JSON.stringify((await readdir(final)).sort())!==JSON.stringify(expected))throw Error('Existing review inventory changed');
      for(const [name,bytes] of Object.entries(files)){const file=path.join(final,name),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||await readFile(file,'utf8')!==bytes)throw Error('Existing private review pack differs; it was not overwritten');}
      if(mediaName){const file=path.join(final,mediaName),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||await shaFile(file)!==report.reviewMedia.sha256)throw Error('Existing review media changed');}}
    console.log(JSON.stringify({directory:path.relative(root,final),reviewReady:report.reviewReady,publicationApproved:false,blockers:report.blockers.length,mediaIncluded:!!mediaName,reviewQueueChanged:false}));
  }finally{await rm(staging,{recursive:true,force:true});}
}
try{await main();}catch{console.error('Private reel preparation refused. Check local input, capture facts, decoded media and owner review; no publishing or review-queue action was performed.');process.exitCode=1;}
