# Later checkout till housing

Issue #188 delivers a static reference-derived housing in the local collection at
`public/user-assets/fixtures/late-era-fixtures-2012/checkout-hardware/`.
Per #151, the owner-reference derivative and its editable source are intentionally
excluded from Git. The public fallback remains the clear desktop. A fresh clone
requires that local collection to display this optional equipment.

## Identification and confidence

The original checkout-hardware photograph was inspected at dispatch. It shows
light putty-colored equipment beneath a keyboard, a fitted rectangular front,
two narrow horizontal slots and a central circular lock-like fitting. Confidence
is high in this visible arrangement, moderate in relative proportions and low
in absolute measurements. Manufacturer, precise date, moving-drawer construction,
keyway and internal mechanism are not established. No slides, handle, opening
animation, keyway or rear connectors have been invented. The rear enclosure,
bottom pan, wall thickness and four rubber feet are estimated supporting geometry.
The local NOTES.md identifies the actual source and rebuild commands. The supplied
historical recollection provides no measurements for this later hardware.

## Source and physical contract

- `original/housing.py` constructs continuous shell walls, a fitted bottom pan,
  genuinely cut front slots, circular recess, separate fitting and four feet.
- `correct-housing.py` improves the fitting rim, weighted normals, physical UVs,
  calibrated coatings and contact bake. Run the original script first, then this
  script, using absolute paths with the ThinkPad Blender wrapper.
- `housing.blend` is the final editable source; `model.glb` is the embedded runtime
  export. Named parts and five physical material roles survive export.
- Scene units are feet: width 1.5, height 0.35, depth 1.1265 (approximately
  457 × 107 × 343 mm). Origin is foot contact, runtime Y up, front +Z. Blender
  coordinates are `(x, -store_z, height)` with imperial display at 0.3048 m/unit.
- UV projection uses a 1/6-foot tile (50.8 mm), with 256-square coating maps.
  Seeded procedural orange-peel grain has measured 0.0196 mm RMS height, restrained
  color variation and tangent-space normal relief. Shell and front roughness
  factors are 0.52 and 0.40 multiplied by a map averaging about 0.76. Lock metal
  is 0.75 metallic / 0.30 roughness; rubber 0.86 and slot interior 0.85 roughness.
  Rubber and interior linear albedo are at least 0.08. Every physical material
  has normal relief; no photograph pixels are used as surface textures.
- A 256-square geometry-baked AO receiver covers 2 × 1.7 feet. The loader removes
  that plane and projects its texture onto the real worktop as indirect occlusion.

## Integration and cost

Existing brand-pack then flat user-assets precedence is retained, as are the
`bb-2010` gate and desk exclusion. When supplied by an authored counter, mounts `mount_housing_0/1` place two
independent housings. The complete terminal groups are seated at housing-top
height through `Entrance.seatCounterTerminals`, retaining live screens and
interaction anchors. If authored mounts are unavailable, the existing +1.7-foot
counter-top anchor supplies position and yaw. Failed loads retain the clear
fallback. Late detached arrivals dispose their geometry, materials and textures;
attached geometry/materials remain owned by signage teardown, textures by the
loader. No navigation or interaction target is added.

The export is 279,092 bytes: 2,686 triangles including the disposable two-triangle
receiver; 2,684 live triangles and ten mesh draws per housing. Five physical
material roles plus the removed receiver material, five embedded 256-square
images, UVs and normals on every primitive. The paired-mount path is covered by a regression test; its two housings share textures and use
5,368 live triangles / twenty draws. The ten glTF texture bindings reference
five images; the in-store rig finds four shared mesh texture objects. With contact AO and the
512-square receiver atlas, estimated RGBA8 storage including mipmaps is 3 MiB.
This is a texture storage estimate, not a GPU memory measurement.
All ten physical source meshes have zero non-manifold edges. The bake plane is
intentionally open and is not a runtime object.

## Verification

`npm test && npm run build` passes: 740 tests, zero failures; TypeScript,
file-budget, provider-boundary and signage checks pass. Vite retains its existing
large-chunk and mixed-import warnings. Added loader regression coverage exercises
era/desk gates, subpath URLs, override precedence, exhausted fallback, placement,
render/shadow refresh, attached texture disposal, late disposal and stopped retries.

`tools/verify-cash-housing.mjs` adapts the existing counter-TV photograph harness
for this optional local collection. It captures before/after store views plus
side, rear and low foot detail, and measures loaded attributes and resource cost.
The public shield and U-shaped counters use the single +1.7-foot fallback anchor;
paired hardware mounts are optional local-counter metadata, not present in those
public meshes.
The raised customer ledge obscures the rear in context; a supplemental Blender
rear/underside inspection exposes the pan and feet. Private photographs and inspection notes are delivered in the issue outbox,
`/home/devin/mognet-workers/out/astra-halcyon-188/`. These are local development
verification, not a deployment or physical-mobile performance claim.
