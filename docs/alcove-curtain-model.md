# Alcove bead curtain (#232)

Original generic acrylic bead curtain, authored with scripted Blender mesh construction.
The reference is the existing independent-shop fixture silhouette and dimensions, not a
measured commercial product or an asserted historical replica. No downloaded meshes,
photographs, branded artwork, or private user assets are included. Project license applies.

Editable source: `tools/models/alcove-curtain.blend`. Reproduce with
`blender -b -t 2 -P /absolute/path/to/tools/models/alcove-curtain.py`.
Runtime prototype pack: `public/models/alcove-curtain.glb`. The Blender file includes
a linked assembly preview; only the six original parts are exported. UVs are packed
per part, including the bores; all materials are untextured and independently named.
Closed parts are checked for manifold edges and outward normals during generation.
The eye and shank are Boolean-unioned into one continuous solid.

## Shared doorway attachment boundary (#231)

Issue #231 is still open at dispatch; no authored doorway parts are present in this
checkout. This implementation uses its existing consumer boundary without altering
partitions or signage. The curtain owns the mounting strip, screw eyes, cord and beads;
the doorway owns the header, jambs, signs and collision proxies. This documented
boundary is available to #231's later integration; it is not a claim of external approval.

Coordinates are numerical feet. Blender `(x, -store_z, height)` exports to runtime
`(x, height, store_z)`. Origin is the doorway centre on the floor. The consumer places
it at `(innerX, 0, doorCenterZ)` for either corner; neither bounds fitting nor scaling
is applied. Door width remains 3 ft, head underside 6.8 ft, partition thickness .34 ft.
The support strip is .18 ft deep × .12 ft tall × 3 ft wide, centred at Y=6.8;
its upper half embeds in the existing header. Screw shanks enter that strip from below.
The ±.07 ft original strand offset stays within the strip's .09 ft half-depth.

Fifteen strands retain their original Z spacing (.2 ft), deterministic X jitter,
ragged lower edge, and every original bead centre. Barrel and pointed beads are .1 ft
wide and .098/.102 ft tall, leaving visible cord at the .125 ft pitch. Their .018 ft
bores surround .009 ft cord. Cord runs from each bottom retaining knot to the eye at
Y=6.652; small faceted knots represent the tie and bottom stop. Minimum assembled
floor clearance is approximately .0039 ft. These are intentionally low-resolution
parts, with physical bores rather than opaque caps.

Material roles: `BeadAmberAcrylic`, `StrandBraidedCord`, `AttachmentAgedBrass`, and
`CurtainSupportWood`. Acrylic is opaque dielectric with specular highlights, avoiding
transparent sorting and transmission passes. The separate wood role is replaceable;
the existing theme-dependent header/sign finishes stay with the partition.

## Runtime and verification

`src/fixtures/alcove-curtain-model.ts` uses the existing `installDisplayModel` loader
and base-path resolver. Five instance batches plus one rail replace the fallback after
loading. The original sphere curtain stays visible on load failure. Geometry,
materials and instance buffers are released on teardown, including late completion.
Installation requests a render/shadow refresh; beads/cords do not cast tiny shadows.

The curtain remains static and non-colliding, as before. There was no displacement
behavior to retain. The existing walk-through passage, four partition colliders,
whole-room navigation footprint, format gate and ceiling-height gate are unchanged.
No simulation, update callback, or new interaction target is introduced.

`docs/alcove-curtain-cost.json` records authored part costs. The runtime pack is
40,192 bytes, six reusable meshes, four materials and zero textures. The installed
curtain contains 763 beads, 15 eyes, 15 cords and 30 knots: 83,892 submitted
triangles in six main-pass draw calls (the old sphere fallback: 36,624 triangles
in one draw call). Only 536 unique prototype triangles are stored. Instance matrices
occupy 52,672 bytes; the original hidden fallback is retained for its existing lifetime.
Counts and bounds, along with disposal/fallback checks, are recorded in
`docs/screenshots/alcove-curtain/verification.json`.

Run `node tools/verify-alcove-curtain.mjs docs/screenshots/alcove-curtain after` for
actual StoreScene photos plus both corner layouts, custom room sizes, low ceilings,
missing assets, late loads, bead-centre preservation and exact resource-disposal checks.
Use `fallback` instead of `after` to photograph deliberate asset failure. The `before`
photos were captured before the integration change. Front, side, rear and
under-header close-ups show the same anchor and camera settings. The existing plant
partially obscures the front view; side and attachment photos expose the construction.
These are local app views, not a live deployment. `npm test && npm run build` verifies
the repository; the asset contract regression also checks exported scale, named parts,
UVs, normals, spacing, and payload budget.
