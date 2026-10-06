# Twin-monitor wire merchandiser

The later display uses a six-row wire rack beneath two small CRT fronts, an
accent cove, four empty advertising pockets and an exposed front support foot.
It is original scripted Blender construction. Nominal proportions follow the
local scale study; the dimensions are approximate rather than a factory survey.
No photographic pixels, printed marks or new promotional copy are embedded.

Reproduce `twin-crt-tower.blend`, its GLB and metrics with
`tools/models/twin-crt-tower.py`. It reuses the existing display-family mesh
helpers/exporter and the visible components of the original `store-crts.blend`
ceiling television. Rear television casework is excluded because the enclosing
fixture hides it. Named physical parts remain editable before runtime batching.

The mesh is 2.66 feet across, 8.21 high and about 1.42 deep. Its navigation
envelope is 2.8 by 1.5 feet, with the established three-foot display clearance.
Six trays sit at .90, 1.79, 2.68, 3.57, 4.46 and 5.35 feet. The four middle rows
hold five cases each; top and bottom remain empty. Case support datums, row
spacing and the modest backwards lean are shared by the model and slot adapter.
Both inherited CRT fronts face local +Z. The source authors feet as Blender
`(x,-store_z,height)` and exports Y-up.

Runtime: `src/twin-crt-tower.ts`, registered as `twin-crt-tower`. The 2012 POP
period replaces the existing front promo stand at its existing resolved anchor.
It uses a smaller footprint, retains floor-format admission, and declines empty
catalogs or ceilings below 8.5 feet. Other periods keep their current fixtures.
Stock comes from existing movie records, twenty unique titles at most, without
creating catalog entries or requesting another playback backend. The existing
fixture navigation handles browsing and inspection.

The existing display loader retains a simple fallback, waits for GPU preparation
and supports cancellation and disposal. Finishes belong to the fixture; imported
CRT materials and their packed roughness texture belong to that model load.
The exported asset is 1,167,364 bytes, 16,796 triangles and ten material batches.
No per-frame fixture animation or polling is added.

Verification includes exported bounds and attributes, all six wire support
heights, outward-facing CRT rays, period placement, twenty unique stock slots,
five-column browsing and title inspection. Public photographs and command
receipts are retained in `scratch/publicity-kits/finish-models`. Phone viewport
captures are browser emulation, not physical-phone frame-rate measurements.
