import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {gzipSync,constants} from 'node:zlib';

/** Hosted builds (VITE_DEMO=1) write `<model>.glb.gz` beside every .glb in the
 * output. Static hosts serve model/gltf-binary uncompressed; the client fetches
 * the twin and gunzips it (src/compressed-models.ts). Local builds are untouched. */
export function compressedModelsPlugin(){
  let outDir=null,enabled=false;
  return {name:'halcyon-compressed-models',apply:'build',
    configResolved(config){outDir=resolve(config.root,config.build.outDir);enabled=config.env.VITE_DEMO==='1';},
    closeBundle(){
      if(!enabled||!outDir)return;
      let files=0,before=0,after=0;
      const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){
        const file=join(dir,entry.name);
        if(entry.isDirectory())walk(file);
        else if(entry.name.toLowerCase().endsWith('.glb')){
          const bytes=readFileSync(file),packed=gzipSync(bytes,{level:constants.Z_BEST_COMPRESSION});
          writeFileSync(file+'.gz',packed);files++;before+=bytes.length;after+=packed.length;
        }
      }};
      walk(outDir);
      if(files)console.log(`[compressed-models] ${files} models: ${(before/1048576).toFixed(1)} MB -> ${(after/1048576).toFixed(1)} MB gzip twins`);
    },
  };
}
