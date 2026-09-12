# Entrance walk-off mats (#222)

Original generic rubber-backed compressed-pile mat, authored with Blender 5.2.0 LTS. The issue #151 delivery contract and checkout-counter pipeline were reviewed. This is an intentional generic improvement of the existing surfaces, not a measured historical replica. All geometry and baked imagery are original procedural work; no owner assets, external photographs, logos or downloaded meshes are used.

## Editable delivery and dimensions

Regenerate with `blender -b -t 2 -P "$PWD/tools/models/entrance-mat.py"`. The script saves `tools/models/entrance-mat.blend`, `public/models/entrance-mat.glb` and `tools/models/entrance-mat-metrics.json`.

Blender X is width, -Y is store depth and Z is height; export maps to Three.js X/Y-up/Z at scale 1. Coordinate values are feet, with Blender unit metadata set to 0.3048 m. The origin is the center of the flat underside at floor Y=0. The source has a unit footprint that the consumer scales in X/depth only. Height never scales.

Two named closed manifold solids define the family:

- `Rubber_backing_molded_ramps` / `RubberBacking`: rounded corners, flat floor contact, 0.0015 ft outer lip, multi-band molded transition to 0.017 ft backing height. A localized rear-right corner lift of at most 0.0008 ft (0.24 mm) stays below the pile crest; the underside remains flat. There is no visibly raised curled corner in a walking path.
- `Compressed_pile_inset` / `CompressedPile`: inset seating with a compressed shoulder and 0.024 ft (7.32 mm) maximum height. Fine fiber and rib relief is baked, not modeled as individual strands.

The packed 512×512 color and tangent-normal images are Cycles bakes from the retained `Pile_procedural_authoring` noise/wave/bump material. The script recreates its bake target. Named planar UVs cover both solids; runtime map repetition maintains a 1.5 ft detail tile across changing footprints. The rubber has no texture dependency. Both material roles remain separately identifiable and replaceable. There are no moving parts, signage, stock slots or interaction attachments.

## Consumer and clearance

`src/entrance/index.ts` calls `buildWalkOffMats` in its existing vestibule/single-door branches. It retains the original footprint arithmetic and locations:

| Format | Footprint per mat (ft) | Center X / Z (ft) | Count |
| --- | --- | --- | --- |
| Corporate vestibule | 5.94 × 5.3 | X 14.85 and 7.15; Z 11.8 | 2 |
| Single storefront door | 4 × 2.2 | X 11; Z 13.8 | 1 |

Other sizes continue to derive from the live door width and chamber geometry. The corporate chamber is 15.4 ft wide, not just its 9 ft inner-width parameter. Mats have 0.55 ft clearance to the front/back chamber boundaries and 0.88 ft on each side of each chamber half. Single-door placement retains the 0.1 ft setback from the front door plane. The real moving leaf frame bottoms at 0.049 ft after beveling, leaving 0.025 ft / 7.62 mm above the pile throughout horizontal swing or sliding motion. Glass and handles are higher. Mats do not register collision or navigation shapes; door animation, interaction and checkout anchors are unchanged.

The original textured 0.025 ft box surfaces remain the loading/error fallback and are hidden only when a live model is installed. The loader uses `assetUrl`, checks scene attachment, refreshes shadows/render on adoption, and rejects late results after teardown. Repeated mats clone transforms and share imported geometry/materials/textures. Removing the entrance releases the imported tree and retained fallback resources exactly once, including both sets of texture maps. No change to the shared display loader was needed.

## Cost and verification

The GLB is **657,848 bytes**, with **440 triangles**, **784 exported vertices**, two meshes/materials and two embedded 512×512 PNG textures. The pair renders 880 triangles in four draws; the single mat uses 440 triangles in two draws. Imported buffers/maps are shared between the pair. Two RGBA8 maps require approximately 2.67 MiB including mipmaps; the retained fallback also owns its existing two canvas maps and one shared box geometry (12 triangles per visible fallback). Mats receive shadows but add no shadow-casting draws.

`tests/entrance-mat-model.test.ts` reads the actual GLB and checks closed welded topology, finite UVs/positions, unit normals, embedded image dimensions, geometry/resource limits, floor datum, maximum height and clearance against the actual door-frame generator. `tools/check-mat-lifecycle.mjs` exercises both footprint sizes, shared resources, exactly-once disposal including maps, missing assets, late loads and parent detachment in a browser.

`npm test && npm run build` passed with exit code 0: **718 tests passed**, file-budget/provider-boundary/slot checks passed, TypeScript passed and Vite built successfully. Vite reports its existing large-chunk advisory.

## Inspected in-store photographs

The StoreScene harness uses synthetic catalog data, no private user-assets, cleared localStorage, day lighting, bb-2000 theme and low rendering quality. The matching original/replacement cameras were captured before and after integration; dynamic resolution is reset for each saved snapshot. Doors animate normally, so their opening angles can differ between captures.

- [Original passages](screenshots/entrance-mats/before-passages.png) / [replacement passages](screenshots/entrance-mats/after-passages.png): matching crops show the rounded border and inset pile on both sides of the divider.
- [Original low side](screenshots/entrance-mats/before-side.png) / [replacement low side](screenshots/entrance-mats/after-side.png): floor contact and the tapered rubber transition, with the store-side door visible.
- [Original rear](screenshots/entrance-mats/before-rear.png) / [replacement rear](screenshots/entrance-mats/after-rear.png): rear border and pile detail, with the street door visible.

The floor hides the underside in-store; its flat closed construction is established by the editable mesh and topology checks. Camera crops alone are not used to establish clearance. Supplemental whole-mat and single-door photographs and integration bounds are generated by `node tools/verify-mats.mjs docs/screenshots/entrance-mats details` and the same command with `single`; the default `after` captures the matching comparison cameras and lifecycle checks. `before` requires a checkout of the original entrance implementation.
