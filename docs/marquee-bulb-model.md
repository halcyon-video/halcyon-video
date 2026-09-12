# Marquee bulb and socket — #241

Original generic miniature marquee assembly, scripted mesh authoring in Blender
5.2. It follows the existing Halcyon lamp scale, rather than claiming an exact
commercial lamp replica.
No third-party geometry, textures, or branded artwork is used.

Source: `tools/models/marquee-bulb.blend`; reproducible authoring:
`blender -b -P "$PWD/tools/models/marquee-bulb.py"`.
Runtime: `public/models/marquee-bulb.glb`.

Coordinates are store feet (Blender unit scale 0.3048). Blender (x,-z,y)
exports to store (x,y,z). Origin remains the previous sphere's globe center.
Local +Z faces out of the mounting surface; socket back is Z=-0.085 ft.
Maximum envelope diameter is 0.09 ft (1.08 in); total depth is 0.13 ft (1.56 in).
The ten-sided silhouette measures 0.08560 ft on its other radial axis.
These dimensions are intentional scene-fit estimates.

Named closed parts/material roles:

- GlassEnvelope / BulbGlass: rounded envelope with narrowed shoulder, 100 triangles.
- LampNeck / NickelNeck: short seated neck, 60 triangles.
- Socket / PorcelainSocket: stepped collar, flared mounting foot and closed back,
  120 triangles.

Each part has welded pole/quad-band topology, outward normals, cylindrical UVs
with a seam, and manifold assertions in the authoring script. No subdivision,
textures, hidden collision meshes or lights are exported. The GLB is 10,868 bytes,
280 triangles and three source material primitives. Runtime merges the parts
into one geometry with vertex finishes and an emission mask: **one instanced draw
for the entire family**, unchanged from the 80-triangle sphere fallback. This
adds 200 triangles per lamp while avoiding per-lamp objects or material draws.

`src/store-shell.ts` retains the half-spacing path samples, stepped cornice and
soffit turns, poster anchors, theme/format/quality gates, count and chase order.
Each instance now points +Z along the inward cornice span normal or the poster's
world normal. Socket bases embed into the mounting trim behind the old globe
center. There are no navigation or interaction changes.

`src/marquee-bulb-model.ts` uses assetUrl and GLTFLoader. The sphere stays usable
on a missing/failed asset. Success disposes and replaces its geometry in place;
instance matrices, color buffers and animation remain owned by the existing
mesh. Glass alone responds to emissive chase; neck and socket keep their finish.
The existing off level (0.12), chase dim level (0.15), cadence and render request
behavior remain unchanged. Removed/disposed instances reject late loads, and
all detached source resources and merge intermediates are released. The scene's
normal traversal owns installed geometry/material disposal. No shadows are added.

Verification: `npm test && npm run build`; `node tools/verify-marquee.mjs <out>`
for actual StoreScene photographs and animation checks. Evidence and review notes
are in the task outbox report. Store capture uses low-cost room rendering with the
normal medium-quality marquee builder enabled explicitly, for software GL.
