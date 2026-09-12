# Editable counter balloons (#183)

Original generic latex balloon, authored with intentional mesh profiles and tube
sweeps in Blender 5.2. No downloaded geometry, reference-derived branding, or
external textures. Proportions are design estimates preserving the existing
store envelope, not a claimed replica of a photographed product. Replaces the
Poly by Google asset previously used in this slot.

Source: `tools/models/balloon.blend`; generator: `tools/models/balloon.py`;
runtime: `public/models/balloon.glb`. Rebuild with:

```sh
blender -b -t 2 -P "$PWD/tools/models/balloon.py"
```

Blender coordinates use feet, Z up; glTF exports Y up with Blender -Y mapping
to store +Z. Imperial unit scale is 0.3048 metres per unit. The prop loader
fits width to 0.9 feet (10.8 inches), centers X/Z, and seats the lowest geometry
at Y=0. Authored overall bounds are approximately 0.9 × 0.9 × 2.603 feet.
The inflated body runs from the tapered shoulder at 1.53 feet to the crown at
2.603 feet; the recessed mouth reaches 1.399 feet. Cord diameter is 0.0064 feet
(1.95 mm). Empty nodes publish `mount_tie` at the origin, `mount_neck` at
1.472 feet, and `mount_body` at 2.06 feet. There are no moving parts or collision
changes.

The editable parts are `LatexShell_Neck_RolledMouth`, `Latex_OverhandKnot`, and
`ContinuousCottonString`. The shell has a welded lathed profile, pinched neck,
rolled lip and recessed inner mouth. The tied fold is a separate swept latex
part seated around the neck. The string is a single capped sweep that continues
into its neck wrap. Its approach clears the outside of the rolled lip instead
of threading through the mouth opening; the generator checks that clearance. Closed parts are checked for manifold edges and outward
normals during generation. Circumferential UV seams unwrap across the seam;
cord UVs follow arc length. All exported primitives carry UVs and normals.

`BalloonLatex` is a tintable dielectric, roughness near 0.28 with restrained
clearcoat (0.22). `BalloonCord` is warm neutral cotton, roughness near 0.76.
Each has a deterministic 128² packed normal map and roughness map: subtle latex
bloom and fine twisted fiber relief. Shell UVs repeat the non-directional latex
grain eight times per circumference/height for sub-millimetre surface detail. Runtime material clones preserve these
maps and tint only latex; cotton remains neutral. All maps are original
procedural data, included in both the Blend and GLB, under the repository license.

The consumer retains six seeded ring spots, alternating heights, per-instance
colors and yaws. The ring radius increases from 0.52 to 0.66 feet to clear the
fuller authored shoulders across the two height tiers. These make six static pose variants from one shared shell/knot
mesh. Only the string geometry is copied: a smooth deformation fits its free
end to the existing counter tie point, leaving the neck wrap fixed. The body
mount seats the inflated shell at the existing spot. No new interaction target
or configuration is introduced; the store's counter-dressing format gate remains.

`loadProp` retains its shared cache and error fallback. The detached-group guard
runs before both success and failure paths. Signage removal detaches the cached
model instances before the generic disposal traversal, then disposes the six
owned cord geometries and six latex materials. The shared shell, knot, cotton
material and maps remain cache-owned until `disposePropCache`. Installation and
fallback both request shadow and render refresh.

The export metrics live in `tools/models/balloon-metrics.json`: 214,804 bytes,
6,360 triangles, three mesh primitives, two materials, four 128² images.
The cluster uses 18 draws and 38,160 triangles. Shell/knot buffers and maps are
shared; six cord buffers and six latex materials are instance-owned. The four
RGBA8 maps occupy 256 KiB decoded (about 341 KiB with mipmaps), shared across the
cluster. The previous asset had 1,048 triangles per instance and no normal or
roughness maps; the added geometry resolves neck, mouth, knot and cord joins.

`tools/verify-balloon.mjs OUT LABEL [STOREFRONT]` uses the actual public StoreScene
and counter consumer, adapted from the existing prop photography harness.
It captures context, side, rear and close details and checks tint/map retention,
shared ownership, anchor fit, separation from neighboring geometry, cache
rebuild and removal before resolution. `fallback` blocks the GLB request.
Use `usquare-counter` or `rounded-counter` to check the alternate chain counters.
`BALLOON_VIEWS=context,side` limits photography while retaining all geometry and
lifecycle assertions. `before` loads the original consumer and GLB from the
pinned pre-change Git revision; `BALLOON_BASE_REF` can override that revision.
The owner outbox contains the inspected before/after photographs and full check
logs; these are verification evidence, not a deployed build.
