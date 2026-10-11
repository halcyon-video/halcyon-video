# Proposed roof drainage: scupper, conductor head and downpipe

An original, unbranded roof-drainage run now sits on the rear wall of every
facade family, near the left corner: the large store's three brick styles and the
independent shop. It was commissioned in #259, under #151, and is a **proposed
dressing, not a surveyed store detail**.

## Why a scupper and head, not a hung gutter

All facades are flat roofs behind a parapet, so there is no eave to hang a
gutter from. The period way to drain that is a scupper through the parapet into
a conductor (collector) head and a rectangular downpipe, and that is what is
modeled. The roof-edge outlet is a formed U-trough passing through the wall; the
head is a flared, open-topped sheet-metal box with a rolled hem; the downpipe is
a 3 × 4 in chamfered rectangular section.

## Evidence and provenance

No store photograph of drainage was supplied in this checkout, and no archive
certainty is claimed. The construction vocabulary (scupper, flared head, slip
joint sleeves, wall straps, 45° offset past a proud fascia, splash block) is
general commercial sheet-metal practice, authored from scratch as scripted mesh
work. Nothing is traced or downloaded, there is no maker's mark, and the dark
bronze-grey finish is an artist choice that matches the coping.

## Deliverables and contract

- `tools/models/gutter-downspout.py`: reproducible authoring and manifold audit.
- `tools/models/gutter-downspout.blend`: editable source, eight named parts and
  five connection empties (`Scupper_invert`, `Head_outlet`, `Offset_top`,
  `Discharge`, `Splash_top`).
- `public/models/gutter-downspout.glb`: runtime export.
- `tools/models/gutter-downspout-metrics.json`: measured bounds and cost.

Run `blender -b -P tools/models/gutter-downspout.py` from the checkout. Units are
feet. Origin: the veneer wall face (x = 0, outward +x) at the scupper invert
(y = 0), pipe centreline at z = 0; Blender `(x, -z, height)` exports to Three.js
`(x, height, z)`. Parts: `DownspoutHead` (scupper trough, back flange, flared
sides/front, floor, hem), `DownspoutOffset`, `DownspoutFoot`, `DownspoutRunPipe`
(one foot tall, scaled at runtime), `DownspoutSleeve`, `DownspoutStrap`,
`DownspoutFlangeScrews`, `DownspoutSplashBlock`. Roles: `DownspoutSheet`,
`DownspoutHardware`, `DownspoutSplash`. UVs are dominant-axis planar at one tile
per foot. 988 triangles, eight meshes before runtime repetition, three materials,
no textures, 67.7 KB. Every part is a closed manifold solid.

## Integration

`src/gutter-downspout.ts` is installed by `src/storefront-facade.ts` and
`src/storefront-facade-shop.ts` with the existing display-model loader, so the
four-box fallback, role-based finishes, shadow refresh, late-load cancellation
and idempotent release all behave as for the rooftop unit. A `prepare` hook
arranges the parts for the actual wall: the head and flange sit on the fascia
face, the run is scaled to length with a sleeve and strap at intervals, the
offset steps the pipe in to the veneer at the fascia's bottom edge (sheared for
the shop's smaller step), and the foot and splash block stand on grade. The
anchor is the rear wall at `leftEdge + 2`, which has no glazing, door or tile
band, and a layout that cannot fit the runs (very low roofs) omits the unit.
`StoreScene` teardown calls `disposeGutterDownspout`. Collision, navigation and
interaction are unchanged; this is static exterior dressing.

## Verification

`tools/verify-gutter-downspout.mjs` follows the rooftop capture harness: it boots
a real `StoreScene` per facade family, hides only the new group for the
"before" frames, and photographs rear, side, head and foot details plus the
interior. It asserts the splash block rests on grade, nothing enters the
building, the fallback hides once the model loads, and exercises late-load
disposal, failed-load fallback and placement limits. `tests/gutter-downspout-assets.test.ts`
checks the shipped GLB. The renderer samples are application captures from the
software-GL harness, not archival photographs.
