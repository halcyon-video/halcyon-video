# Checkout queue glass vitrine (#196)

This is an original, unbranded cabinet construction study, distributed under the repository license. It is **not an authenticated reconstruction of the archived queue vitrine**. The `candy-queue-fixtures` and `queue-vitrine` leads were searched in the checkout, local Projects, worker tasks, and home-directory filenames; no original photograph or old elevation was recovered. All dimensions are design estimates. Rear sliding tracks, door frames, pulls and lock are explicitly inferred. Reference-specific fidelity remains unverified until the original photograph is recovered; no generated image is presented as reference evidence.

## Source and construction

- `tools/models/queue-vitrine.blend`: editable, individually named physical parts, packed texture images, useful viewport, provenance metadata.
- `tools/models/queue-vitrine.py`: reproducible Blender mesh authoring and GLB export. Closed solids are welded, normals recalculated and manifold edges asserted before export.
- `tools/models/queue-vitrine-print.py` and `.png`: original fictional cassette sleeve print; Pillow and system DejaVu Sans. No logo, borrowed artwork or downloaded mesh.
- `public/models/queue-vitrine.glb`: runtime asset with opaque parts batched by material and eight separate glass panes for transparency sorting.

Regenerate the print with `python3 tools/models/queue-vitrine-print.py`, then run `blender -b -t 2 -P "$PWD/tools/models/queue-vitrine.py"`. Absolute script paths are needed by the ThinkPad's Flatpak Blender wrapper. Blender 5.2 was used.

The base has a welded open carcass, fitted bottom and deck, recessed toe plinth and eased edges. Frame rails terminate at corner-post faces. Four vertical shelf standards connect the frame to eight brackets and rubber cushions; thin protective perimeter channels border the glass shelves. Two independently named rear sliding door panels have continuous welded frames, parallel tracks, attached pulls and a small lock. Door motion is not exposed as a new interaction. Twelve static blank-cassette cartons rest on the deck and two shelves, with printed paper sleeves and no rental stock slots.

## Coordinate and placement contract

Numeric units are feet, matching the store. Blender `(x, -store_z, height)` exports to Three.js `(x, height, store_z)`. The origin is floor level at the cabinet centre. Customer glazing faces local +Z; service doors face -Z. The body is 3.5 feet wide and 1.7 feet deep; the top reaches 3.4825 feet. Pulls extend the total depth to 1.754 feet. Empty nodes publish `floor_origin`, `merchandise_base` (0.64), `merchandise_shelf_1` (1.43), and `merchandise_shelf_2` (2.32). Carton bottoms equal those shelf tops.

`QueueVitrine` registers `queue-vitrine`. The default `queue-vitrine-checkout` placement is `(0, -3.6)`, yaw 0, beside the left checkout queue, forward of the shelf field and clear of the early catalog podium and service cart. Its conservative 3.5 × 1.8-foot collision footprint includes the pulls and rotates a -0.05-foot depth offset with placement yaw. It is excluded from formats without floor displays and standalone desk counters; no historical era claim is encoded as an invented date gate.

The fixture uses `installDisplayModel` and `assetUrl`. Supported procedural stock and furniture remain visible while loading or after an error. Successful installation hides only that fallback. The proxy remains registered for collision, is disabled on disposal, and retains the existing navigation and interaction contracts. Imported geometry, materials and textures belong to the loader; the fixture owns its fallback and replacement glass. Removal during loading cancels installation and releases the detached result. Installation/removal refresh shadows and request a frame.

## Surfaces and resource cost

Six roles: `VitrineLaminate`, `VitrineAnodizedAluminum`, `VitrineGasket`, `VitrineCarton`, `VitrinePaper`, `VitrineGlass`. All mesh primitives have normals and UVs. Opaque finishes contain deterministic albedo grain, calibrated roughness variation and tangent normal maps. The smallest authored albedo component remains above 0.08. Non-glass roles remain independently replaceable through the existing loader finish dictionary; the neutral case carries no theme-specific branding.

Glass uses the established storefront/floor-display `MeshPhysicalMaterial` path: low-opacity transparency, zero transmission, no depth writes, no opaque glass shadows, scene environment gain clamp, and `createGlassSurfaceNormalMap` for subtle clearcoat relief on higher quality settings. There is no Reflector, render target, new light or additional full-scene render pass. Low quality omits clearcoat detail as the storefront does.

| Resource | Delivered cost |
|---|---:|
| Triangles, including stock | 10,168 |
| Runtime mesh primitives / base-pass draws | 13 |
| Material roles | 6 |
| GLB bytes | 2,077,884 |
| Embedded images | 18 × 256 × 256 |
| Active runtime texture objects, high quality | 16 |
| Approximate active RGBA8 texture memory including mipmaps | 5.33 MiB |

Three embedded glass maps are superseded by the fixture's one glass normal map. They remain loader-owned for teardown and are not sampled by the rendered model. Source measurements are in `tools/models/queue-vitrine-metrics.json`. Runtime mesh bounds and resource/lifecycle measurements accompany the verification photographs.

## Verification

`tools/verify-queue-vitrine.mjs` uses the real StoreScene and GLTFLoader. Start Vite on port 4196 and run it with `VITRINE_OUT` pointing to an evidence directory. On the ThinkPad it uses headed Chromium with ANGLE/OpenGL on the AMD Radeon 860M and explicit high quality. It captures matched before/after in-store views (the previously absent case is hidden for before), front, side, rear and interior details. `VITRINE_PRESET=usquare-counter` exercises the alternative counter ground plan. The harness checks layout violations, UV/maps, zero transmission, glass shadow/depth behavior, missing-asset fallback, removal during loading, double disposal, collision retirement and small-store admission.

`tests/queue-vitrine-model.test.ts` verifies the delivered binary, resource budgets, material roles, UV/normal coverage, shelf anchor heights and metadata bounds. Required project verification is `npm test && npm run build`. Photographs are app captures, not archive photographs or historical-fidelity evidence.
