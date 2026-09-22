# Mobile startup assets

The loading screen uses actual high-quality Halcyon renders, captured from the public assets at dev revision `862f47cf2d645d54bb030e053f3211b09227dc17` with this startup change applied. No private user assets appear in them. The existing Three.js renderer, high-quality mode, screen-space occlusion and reflection pipeline produced the views. The screenshots are compressed WebP stills, not a second live scene. Only the first view loads initially; later views load during the slideshow, which stops at entry. The three images total about 350 KB.

Phone surface maps are 512px WebP derivatives of the existing, attributed public surface textures. Color, normal and roughness maps retain their separate roles and color spaces. The clerk atlas keeps its exact 4096 by 1920 frame grid, using WebP compression; its coverage mask is lossless. Outdoor panorama derivatives are capped at 1024px. Original desktop textures and private drop-ins remain available. See the source assets' attribution files for provenance.

## Baked room lighting

`public/lighting/store-environment.bin.gz` contains little-endian RGBA half-float pixels in Three.js CubeUV PMREM layout, with dimensions and display intensity in its adjacent JSON file. It is a precomputed daytime environment from the default 1990 store, not a live ray-tracing effect or a per-surface lightmap. Layout-specific baked floor and wall contact occlusion, material surface maps and static shadow maps still provide grounding. Other themes and night lighting retain their existing environment path.

The source bake was read from the high-quality renderer's environment render target with `WebGLRenderer.readRenderTargetPixels`. To limit transfer and GPU memory, the stored atlas retains the existing 128px cube faces and their lower roughness mip levels: Three.js PMREMGenerator positions a level of size S at `y = 4 * (cubeSize - S)`. From the 1536 by 2048 source, retain x=0..383 and y=1536..2047, preserving the HDR half-float values. The resulting 384 by 512 atlas occupies 1.5 MiB after decompression and about 684 KiB over the wire. This deliberately uses softer reflections than desktop and approximates the shared room rather than rebaking every visitor's arrangement. Fetch handles both hosts that apply HTTP gzip decoding and hosts that return the gzip file verbatim. Invalid or unsupported data leaves the working fallback environment in place.

## Progress and data policy

The small classic loading script runs while the application modules download. Entry script and stylesheet completion, room construction, shelf batches, title placement, submitted materials, completed shader bindings and entrance preparation advance a monotonic weighted meter. These are completed-work stages, not an elapsed-time animation or a claim to know every future download. The stage label names the measured operation. The final 100 percent means the store is usable; nearby covers and decorative detail may continue afterward.

On touch phones, ambient televisions do not automatically fetch movie streams or the demo video. Deliberate media playback is unaffected. Surface image requests share decoded source images while individual materials retain their own texture transforms. Display-model detail is requested near the camera, through the existing sequential queue; distant fixtures retain their built-in geometry until approached. Models without a camera context retain their original scheduling.

The loading tips explain the desktop presentation, self-hosting Jellyfin or Plex, games via RomM, and phone movement. MOVE sits above its stick in metallic lettering. Back remains available during inspection and menus, and is hidden at the walking root.
