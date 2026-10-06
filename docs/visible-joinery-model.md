# Visible architectural joinery

Original scripted Blender meshes replace the remaining rectangular window,
baseboard, door and screening-room stand surfaces. The kit follows the existing
store dimensions; it makes no claim to surveyed historical hardware. Only the
exposed construction is authored. No concealed stand backing, wiring, fasteners,
wall interiors or removed sliding-door system is introduced.

Source: `tools/models/visible-joinery.py` and `visible-joinery.blend`.
Runtime: `public/models/visible-joinery.glb`, 142,668 bytes, 1,956 triangles
across twelve reusable parts. All parts have UVs and finite normals. The source
checks manifold closed parts and positive volume. Material `ReplaceableFinish`
is substituted by each consumer's existing finish; no reference imagery,
external geometry or textures are embedded. Reproduce with Blender in background
mode, two threads, `--python-exit-code 1` and the absolute authoring script path.

Units are feet. Blender `(x,-store_z,height)` exports to the store's Y-up frame.
The baseboard is a one-foot section, .3 feet high and .04 deep, with a coved
toe. Window profiles retain .2-foot faces, .3-foot nominal depth and a recessed
glazing stop. Sill caps keep the existing .12 by .4 section with an eased lip.
The generic panel preserves its .006-foot corner easing when extended. The
stand is 3.2 by 1.6 by 1.8 feet: top support stays at 1.6, equipment support at
.66. Runtime width follows the installed television without changing support
heights. Separate, fitted stand panels remain editable in Blender and merge
to one draw for use in the screening room.

The two door rings retain the existing center and floor datum, open glazing
apertures, kick rails and independent moving leaves. Stretching changes flat
spans while retaining stile thickness and push-bar returns. Existing collision
objects, swing pivots, proximity animation and bell logic are unchanged.
Current supported door styles are double swing and single; historical sliding
wording in the backlog does not describe the current implementation.

`joinery-model.ts` batches pending consumers into one load, fits an owned copy
to each existing geometry object, and releases source buffers/materials once.
Failed loads retain the original surfaces. A disposed target cannot receive a
late replacement. Store subscriptions request a structural shadow refresh and
render after installation. Existing owners continue to dispose their geometry.
The optional column retains its original mirror/paint panels and reflection
policy; only its exposed cap and base receive eased meshes.

Verification: exported geometry, UVs, bounds, stand support rays, door aperture
rays, asynchronous success/failure/cancellation and imported-resource disposal;
normal build and full test suite; installed phone-viewport views of window,
baseboard, door and screening-room consumers. Private verification tooling and
photographs are under `scratch/publicity-kits/finish-models`. These are emulated
phone views, not physical-device performance measurements.

The second group adds folded metal coping with drip returns, a bent saddle
bracket for signs that already have feet, and a round-shouldered plaque.
Existing flush-mounted cards remain flush. The shared finished-panel adapter
retains all six BoxGeometry material lanes and their UV handedness, including
the collection plinth's white top and separate printed front. Plaque caps and
edges retain their existing two material lanes; no lettering is regenerated.
Roof caps keep the facade's original span and corner stops. Small-shop trim
keeps the existing fascia and sill anchors, dimensions and palette.
