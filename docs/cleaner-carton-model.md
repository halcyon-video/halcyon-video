# Tape-cleaner retail carton (#181)

Original generic paperboard, authored with `tools/models/cleaner-carton.py` in
Blender 5.2. Editable source: `tools/models/cleaner-carton.blend`. Runtime:
`public/models/cleaner-carton.glb`. Three deterministic 128² PNGs are packed in
both deliverables; the PNG source files remain alongside the script. No imported
geometry, manufacturer artwork, or copied branding is included. Existing live
house-brand canvas artwork is applied only by the app.

Regenerate from the repository using an absolute script path (the ThinkPad's
Flatpak Blender starts in `/app/blender`):

```sh
blender -b -t 2 -P "$PWD/tools/models/cleaner-carton.py"
```

## Contract with #180 and future #199

The tray work order #180 remains deferred and its authored tray is not present
in this checkout. This change establishes its stock attachment contract without
changing that tray: centered cartons, X width, Y up, +Z front, -X spine, dimensions
0.365 × 0.667 × 0.082 feet. These are inherited scene dimensions, not a newly
measured manufacturer standard. Blender authors `(x, -store_z, store_y)` and
exports Y-up. There are no moving parts or new collision/interaction targets.

`CLEANER_CARTON` and `installCleanerCartons` in `src/fixtures/cleaner-carton.ts`
are the shared stock interface. Supply an InstancedMesh fallback containing
centered placement matrices, a parent attached to the scene, borrowed front and
optional back/spine CanvasTextures, a side tint, and a render/shadow refresh
callback. The returned disposer must run on consumer teardown. Each stock batch
shares one geometry, four material roles and texture references across all its
instances. There is no sidekick consumer in this checkout; #199 should call this
same helper, not commission or copy another carton asset.

The existing tray centers stay `x = -0.84 + column * 0.42`,
`z = 0.14 - row * 0.2`, `y = 0.35 + height / 2` (five columns). Bottoms remain
at tray top 0.35. Default counter support is 3.54 feet; custom `surfaceY`, count,
yaw, collider and no-footprint behavior are preserved. #180 can replace the tray
and provide equivalent centered matrices at its actual interior support height.

## Construction, UVs and physical finish

A continuous thin sleeve has compressed vertical folds, interior walls, and cut
end rims. Separate top/bottom sheets turn down into recessed tuck tabs, with a
real 0.0015-foot paperboard thickness; an interior glue lap completes the family.
All four named physical parts are closed manifold meshes, checked by the script.
The export retains their names and editable topology rather than baking detail
into a box silhouette. No hidden cassette or opening animation is modeled.

Material roles: `CartonFront`, `CartonBack`, `CartonSpine`, `CartonBoard`.
Front/back have opposite U direction; artwork fills their 0–1 face UVs. Spines
have horizontal depth and vertical height UVs. Closure board uses plan UVs.
The loader reverses glTF V for supplied CanvasTexture artwork, preserving the
existing front orientation. Back and spine presently have theme color only;
there was no existing back/spine artwork to replace. Their named UV roles accept
future art through the same interface. The retired owner-local front override
remains disabled.

Packed fibre normal relief (strength 0.45), paper-grain base color, and roughness
0.66–0.79 produce a matte printed-paper response. The live front replaces only
base color, retaining physical normal/roughness maps. Side tint is floored to
0.08 linear per channel to retain reflected light instead of pitch-black trim.

## Resources and verification

See `cleaner-carton-cost.json`: 132 triangles, 72 authored vertices, four parts,
83,956-byte GLB. The loader merges exported pieces into four material groups:
four draw calls and 1,320 submitted triangles for default ten-carton stock,
versus six groups and 120 triangles for its box fallback. Three 128² source maps
plus the existing 280 × 512 front canvas are shared by the whole batch. Geometry
and instance matrices do not duplicate per carton. Source pieces are disposed
after merge; owned textures/materials are released once, while borrowed artwork
is left to the fixture owner. Removed/retired loads release their resources;
failed requests leave the old box batch visible.

`tools/verify-cleaner-carton.mjs <out-directory> before|after` photographs the
real StoreScene at context, front, side, rear and closure angles. `before`
blocks the GLB request to capture the unchanged procedural fallback. `after`
checks loaded bounds, UVs, geometry costs, shared resources, idempotent teardown,
borrowed artwork ownership, late load and failure behavior. Use an isolated
output directory; the harness clears localStorage before booting.

Required checks: `npm test && npm run build` (745 tests passing). In-store PNGs,
runtime evidence, full check logs and inspection notes are delivered in the
MogNet outbox `/home/devin/mognet-workers/out/astra-halcyon-181/`.
