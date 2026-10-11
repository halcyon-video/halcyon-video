# Blu-ray keepcase

A proposed physical case variant, not Blu-ray playback support. The medium switch
stays VHS/DVD. Source: `tools/models/packaging-bluray.blend`, authored by
`tools/models/packaging-bluray.py` (scripted bmesh/pydata authoring on the
`packaging.py` helpers; run `blender -b -t 2 --python tools/models/packaging-bluray.py`).
Exports `public/models/packaging-bluray-keepcase-{stock,hero}.glb`. No textures,
cover scans or lettering.

## Selection contract

`Title.packaging = 'bluray-keepcase'` selects it, via `isBluRayCase(movie, medium)`
(`src/packaging-formats.ts`). It applies only to DVD-medium movies: VHS stores,
games and series ignore it, and nothing infers it from genre, aspect or library.
Aisle and New Releases wall stock batch it as shape `bluray`
(`gameDimsForShape`), the inspected hero swaps to `BLURAY_KEEPCASE_DIMS`, and the
store copy behind it is the ordinary DVD-size keep case with a computed bottom
lift. Slotted fixtures do not split it out yet: a Blu-ray title there renders as
a DVD case. A later reference display only needs to set the metadata.

## Construction

Units are feet, centered, front +Z, spine -X. Closed size 0.445 x 0.6227 x 0.036
(DVD width, shorter and thinner than the 0.667 high DVD case). Two closed molded
halves with rounded shoulders, a hinge bridge, a dark tray visible only in the
seam, a recessed thumb latch (hero adds tabs and hinge teeth), a raised header
band on the front, and four thin ClearRim bars framing the art seat as the
clear-wrap lip. Paper surfaces are open sheets on the existing lanes.

Material lanes: the nine shared lanes plus new lane 9 `BlueShell`
(blue-tinted opaque plastic, defined in `caseConstructionMaterials`, kept in
stock meshes). Header band and shell use it, so the tint is a runtime material.

## Art fit

Shelf art is authored to the DVD face (0.445:0.667). The front art seat sits
under the header band and is wider than that, so its UVs crop the image equally
top and bottom (cover fit) rather than stretch. The band covers no art.

## Cost

Stock: 342 triangles, 33,160 bytes, 13 parts (10 closed solids). Hero: 1,430
triangles, 107,624 bytes, 29 parts. DVD keepcase for comparison: 254 / 23,496
and 886 / 63,844. One extra draw range per mesh for lane 9. Metrics in
`tools/models/packaging-bluray-metrics.json`.
