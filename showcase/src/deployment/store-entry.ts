// The public preview address never shows the flat catalog: every request goes straight to the
// hosted 3D store (owner decision 2026-10-11). These files are the whole upload, so nothing else
// can be served from the preview address or its per-deployment addresses.
import {HOSTED_STORE_URL} from '../../../src/catalog-handoff.ts';
export function storeEntryFiles(target:string=HOSTED_STORE_URL):Record<string,string>{
  const url=new URL(target);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.href!==target||/[\s"'<>&]/.test(target))
    throw Error('The store entry must be a plain https address');
  return {
    '_redirects':`/* ${url.href} 302\n`,
    '_headers':'/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cache-Control: public, max-age=0, must-revalidate\n',
    // Only reached if the edge ever serves a file instead of the redirect; it still leaves at once.
    'index.html':`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta http-equiv="refresh" content="0; url=${url.href}"><title>Halcyon Video</title></head><body><a href="${url.href}">Enter the Halcyon Video store</a></body></html>\n`,
  };
}
