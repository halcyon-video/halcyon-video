# Proposed period rooftop air conditioner

An original, unbranded packaged rooftop unit now sits on the large store's roof,
behind the left window wing. This is the proposed exterior detail commissioned
in #261, under #151, **not a photo-verified historical installation**.
The independent shop does not use this facade builder and receives no unit.

## Evidence and provenance

Inspected the original Carrier *48 Series Weathermaker I* installation manual,
Form 48H,L-9SI, printed **9-85**, pages 1–3. The manufacturer document is
[available as a scanned PDF](https://static-pt.com/modelManual/CRR-48H-L-9SI-English_im.pdf).
Page 1 describes support and downshot duct attachment; page 2 shows the curb,
flashing and separate supply/return openings; page 3 shows the cabinet, single
recessed top fan, segmented access panels, grilles and base rails. Its small-unit
outline is 6 ft 5 in × 3 ft 7 in × approximately 2 ft 5⅛ in. These drawings
support the period construction vocabulary, not the presence, exact equipment,
color, capacity or roof loading of any particular video store.

The issue's local archive/study lead did not supply a rooftop
photograph in this checkout. No claim of archive certainty is made. The model
is original scripted mesh authoring, not a downloaded or traced commercial
asset; no manufacturer logo, photograph or manual page ships in the runtime.
The warm gray paint, simplified coil guards, service enclosure, trap layout and
curb height are artist choices. This is a generic cooling package, not a replica
of the manual's gas/electric machine; its gas train/flue is not reproduced.

## Deliverables and contract

- `tools/models/rooftop-hvac.py`: reproducible authoring and manifold audit.
- `tools/models/rooftop-hvac.blend`: editable source, four meshes with named
  vertex groups for physical parts, plus four named connection empties.
- `public/models/rooftop-hvac.glb`: optimized runtime export.
- `tools/models/rooftop-hvac-metrics.json`: measured source bounds and cost.

Run `blender -b -P "$PWD/tools/models/rooftop-hvac.py"` from the checkout.
Scene units are feet; Blender `(x, -depth, height)` exports to Three.js
`(x, height, depth)`. Origin is the center of the curb at roof contact.
Cabinet nominal size is 6.42 × 3.58 ft; curb rise is 1.20 ft. Complete bounds
including service hardware are approximately 6.462 × 3.824 × 3.900 ft (X/Y/Z).

Named roles: `HVACCabinet` (painted folded sheet), `HVACCoil` (dark condenser
fins), `HVACHardware` (guard, fan, channels, conduit and collars), `HVACCurb`
(flashing and roof curb). UVs are dominant-axis planar surface coordinates at
four feet per tile; suitable for tiled finishes, not a unique baked lightmap.
The export has 4,920 triangles, four draw calls, four materials and zero textures,
using 277,924 bytes (271.4 KiB). All solid parts pass the manifold-edge audit.
There are no baked shadows, animation, sounds or interactions.
Named connection empties: `Supply downshot`, `Return downshot`, `Power inlet`,
`Drain outlet`. Supply/return collars terminate beneath openings in the base
pan. The fan has a real open throat, four pitched blades and welded wire rings.

## Integration and support

`src/storefront-facade.ts` installs `src/rooftop-hvac.ts`. Position is
`(STORE_CENTER_X - width/2 + 6.5, ceilingY + .85, FRONT_GLASS_Z - 5.5)`.
The curb bottom coincides with the **top of store-shell's existing 0.5-foot
structural roof slab**, not the drop-ceiling plane. The complete equipment
footprint stays inside the wall lines, with over 3.2 ft to the nearest side
wall and over 3.6 ft to the front wall; the wing location avoids the entry tower.
Width below 32 ft, depth below 24 ft or non-finite dimensions omit the unit.
The same anchor follows all three large-store facade styles and ceiling heights.
This establishes geometric support within the fictional scene; no actual
building framing or engineering load data exists to certify a real installation.

The existing display-model loader retains a four-part shaded fallback on fetch
failure, replaces finishes by role, and refreshes shadows/render after loading.
Removal cancels pending adoption and disposes the loaded geometry. Facade removal
and StoreScene teardown both cancel through the same idempotent release hook;
fallback geometry and shared finishes follow the normal scene teardown traversal.
Navigation, entry doors, fixture registry and interaction anchors are unchanged.

## Verification

`tools/verify-rooftop-hvac.mjs` follows the existing StoreScene capture harness.
It captures matching before/after photographs in all three facade styles;
“before” hides only the new rooftop group in the same live scene, controlling
camera and lighting. Ground-level exterior views establish real visibility;
elevated side/rear details inspect the fan, service panels, trap and roof contact.
An interior comparison checks the roof still occludes the equipment.
The capture harness lifts only the software-renderer resolution clamp after boot
for legible details; product quality settings and lighting code are unchanged.
These are application captures, not archival photographs or studio renders.

The harness checks footprint/roof contact, 18 layout combinations, undersized
roof omission, success refresh, failed-load fallback, late-load disposal and
idempotent release. `tests/rooftop-hvac-assets.test.ts` loads the shipped GLB to
check finite UVs/normals, bounds, material roles, named connections, resource
budgets and a ray through the fan recess. Full validation is `npm test && npm run
build`. Inspected photographs, logs and final results are in the task outbox:
`/home/devin/mognet-workers/out/astra-halcyon-261/`.
