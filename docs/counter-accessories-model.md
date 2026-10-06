# Original counter accessories

Issues #180, #182 and #234 retain their existing counter anchors and live paper
artwork. These are original designs, not replicas. No downloaded mesh, reference
imagery, brand graphics or external textures are embedded.

## Source and construction

Reproduce with `blender -b -t 2 --python-exit-code 1 -P /absolute/path/to/tools/models/counter-accessories.py`.
The standard Blender glTF exporter writes the runtime assets. The editable
`counter-accessories.blend` retains named collections, spread apart for inspection.
Profiles, ceramic and paper meshes have intentional topology and UVs. Every
solid passes a manifold-edge check. Units are feet; authoring maps store `(x,y,z)`
to Blender `(x,-z,y)`, exported Y-up. Per-part measurements are in
`tools/models/counter-accessories-metrics.json`.

| Export | Triangles | Bytes | Construction |
|---|---:|---:|---|
| tip-mug.glb | 3,898 | 142,012 | Hollow ceramic body, welded handle, rolled lip, foot ring, folded notes |
| acrylic-l-holder.glb | 368 | 27,704 | Bent rear sheet and foot, rounded insert seat |
| acrylic-tent-holder.glb | 244 | 18,156 | Continuous thick A-shaped sheet, open ends |
| cleaner-display-tray.glb | 720 | 52,656 | Folded deck, lips, raised back, cheeks and hollow riser |

## Runtime contracts

The mug stays at local X=-0.46 ft. Height is .362 ft, mouth radius .165 ft and
interior floor Y=.043 ft. Both folded generic notes remain inside its mouth.
`MugGlaze`, `MugAccent`, `MugInterior`, `MugFoot` and `TipPaper` separate finish
roles. Glaze and accent follow live store colors; no real currency art is used.

The L holder preserves the 1.0 by .8 ft print, .2-radian lean and X=.45 ft anchor.
QR paper and reflection stay independent. Descendants of the imported mug and
holder remain clickable. The previously unowned reflection material now has
fixture-owned cleanup. Tent cards retain both live outward prints and blank
inward faces. Synchronous `acrylic-holders.geometry.json` is exported from the
same Blender mesh; normal sign teardown owns each scaled copy.

The cleaner tray keeps its 2.2-ft width, Y=.35 ft carton deck and two rows of five
stock centers. Its original base remains the collision proxy. Carton artwork,
shared instancing and existing floor footprint stay unchanged. Head-cleaner
merchandise is dormant in the current production placements; this work upgrades
its registered consumer and editable asset without reinstating it. Its photographs
are fixture previews, not a claim of a new default store placement. The authored
hardware uses the established `installDisplayModel` fallback, cancellation,
detached-load cleanup, GPU preparation, shadow refresh and render-on-demand.
Opaque parts batch by material; clear sheets reuse the thin additive finish
without introducing a refraction or light pass. Brand subscriptions are removed
on teardown. Imported geometry is released before borrowed fallback finishes.

## Verification

`tests/counter-accessories.test.ts` loads the actual GLBs and checks finite
positions/normals/UVs, cost limits, counter contact, the hollow mug's inner floor
by raycast, contained notes and support beneath all ten unchanged carton anchors.
`tools/verify-counter-accessories.mjs` exercises successful, failed, late and
detached loads for both fixtures, exactly-once disposal and imported click
targets. It photographs front, side, rear, the mug interior and both tent faces.
It uses the shared development supervisor and browser environment.

The QR is checked from rendered imagery with ZXing-C++ using its
[official Python interface](https://github.com/zxing-cpp/zxing-cpp/tree/master/wrappers/python).
The production build, full suite and installed phone view are part of acceptance.
Evidence is retained in `scratch/publicity-kits/remaining-models/`. Phone viewport
captures establish integration and layout, not physical-device performance.
