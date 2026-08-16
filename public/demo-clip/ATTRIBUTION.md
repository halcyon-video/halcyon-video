# In-store promo loop — source & license

What plays on the store's CRTs when there is no media server attached to stream
from: the public demo, and any boot where the catalog has nothing playable. With
a server connected, the TVs stream from your own library instead and this file
is never fetched (`src/ambient-tvs.ts`).

| File | Work | Author | License | Source |
|---|---|---|---|---|
| `big-buck-bunny.webm` | *Big Buck Bunny* (2008), 00:55–01:25 | (c) copyright [Blender Foundation](https://www.bigbuckbunny.org/) / Peach Open Movie Project | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [Commons file page](https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm) |

Alterations: a 30-second extract, scaled to 640x360, resampled to 30 fps and
re-encoded (VP9 / Opus) from the Commons 480p VP9 transcode of the 4K master.
No other changes — no overlay, no recut, nothing added to the frame.

Reproduce it:

```sh
curl -L -o bbb480.webm \
  'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm'
ffmpeg -ss 55 -i bbb480.webm -t 30 \
  -vf "scale=640:360:flags=lanczos,fps=30" \
  -c:v libvpx-vp9 -b:v 500k -minrate 250k -maxrate 900k -crf 33 -row-mt 1 -cpu-used 2 \
  -g 60 -pix_fmt yuv420p -c:a libopus -b:a 64k -ac 2 \
  big-buck-bunny.webm
```

640 wide is not an arbitrary size: it is exactly the `MaxWidth` the app already
asks Jellyfin for when it transcodes a real title onto these screens, so the
bundled loop and a live stream land on the tube at the same resolution.

VP9/Opus rather than H.264/AAC: royalty-free, so a file this project ships
carries no codec-licensing question and still plays on the distro Chromium
builds that omit the proprietary codecs. The streamed path has no such choice —
H.264 is what a media server transcodes to.
