# Countertop tape rewinder

`public/models/tape-rewinder.glb` is an original generic Halcyon model based on
the existing procedural rewinder's dimensions and layout. It is not an exact
manufacturer replica. No reference photographs, downloaded meshes, branding
art or other external assets were used in authoring the shell.

The editable source is `tools/models/tape-rewinder.blend`; the reproducible
script is `tools/models/tape-rewinder.py`. Run:

```sh
blender -b -t 2 --python tools/models/tape-rewinder.py
```

Named parts include the eased lower moulding, tapered ABS case, continuous
window-frame lid, lid seam gasket, rear hinges, front latch, eject track and
thumb slider, shoulder cooling flutes and four non-slip feet. These are
script-authored profile meshes, with welded manifold solids checked before
export. The source keeps the parts editable; export combines them into one
mesh with three material batches. Every batch has UVs. There are no embedded
image textures. The GLB is 105,460 bytes and 1,684 triangles.

Units are store feet. Local X is width, Y is up and +Z is the front LED/latch
edge. Blender `(x, -store_z, height)` maps directly to these axes. The origin
remains at the middle of the countertop plane. Bounds are 0.88 feet wide,
0.46 feet deep and 0.248 feet tall: the old footprint and lid height. The
window remains centred at X -0.12, Z 0. Its live glass, tape well, spinning
reel and amber hub are retained separately. The lid's right-hand logo plane
stays at Y 0.249 with its original dimensions, UV orientation, brand-aware
canvas and optional user texture path. The existing power LED also remains.
The lid hinge is modeled hardware, not a new open/close interaction.

The loader uses the existing base-path asset resolver and placement yaw plus
half-turn. `RewinderBody` and `RewinderTrim` receive the existing runtime body
and lower-rim materials. `RewinderRubber` is neutral non-slip hardware. Thus
the generic finishes and separately replaceable branding follow the original
material paths; the model contains no baked logo.

The original shell remains as a loading/error fallback, and its base remains
the unchanged collider. Successful loading hides only shell primitives;
reel animation, well, glass, logo and LED continue to render. Three model
batches replace nine shell draw calls, while the six live surfaces are retained.
No new texture images are allocated. The existing tape-era gate and null
floor footprint are unchanged. Normal fixture disposal releases both fallback
and model resources; a late load after disposal releases its owned model
immediately. Installation requests a render and shadow refresh.

## Verification

The project build passes, including TypeScript and repository guards. Blender
checks every source edge for manifoldness, and GLB inspection confirms three
material batches, UVs on every batch, no images and the stated bounds/cost.
Before/after front-oblique, rear and top photographs were inspected in the
actual store at counter distance. The lid frame clears the retained reel
window and logo surface, and the old footprint remains unchanged.

Focused scene-harness checks exercise a failed load (the original shell stays),
a load completing after disposal (model resources are released), successful
replacement (only the shell fallback hides), retained reel animation, and
normal model geometry disposal. The six original live surfaces remain present.
A separate DVD-era boot confirms that no rewinder is built. These tests retain
the existing layout, collider and brand/drop-in paths rather than adding new
interactions or configuration.
