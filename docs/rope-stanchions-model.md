# Rope queue stanchions (#276)

Original, brand-free construction study informed by the silhouette in [Flickr photo 8278664783](https://www.flickr.com/photos/ryanrules/8278664783/), inspected on 2026-09-10. The photograph shows slim metallic posts, shallow bases, blue ropes and a separate blue runner in the open foreground. Dimensions, hidden construction and hardware details are estimates, **LOW confidence**, not a measured replica. No source pixels, printed graphics, reference files or faithful branded skins are included.

## Editable source and coordinates

- `tools/models/rope-stanchions.py`: reproducible scripted Blender mesh authoring.
- `tools/models/rope-stanchions.blend`: full editable three-post/two-rope assembly, linked post-part meshes, separate hardware, runner and named rope anchors.
- `public/models/rope-stanchions.glb`: reusable Post and Rope modules plus a plain Runner module. The fixture instances the first two modules.

Run `blender -b -P /absolute/path/to/tools/models/rope-stanchions.py`. The supplied ThinkPad wrapper requires an absolute script path. Blender 5.2 uses Imperial units, feet, `scale_length = 0.3048`; numeric coordinates export unchanged into Halcyon's foot-based scene. Blender `(x, -store_z, height)` exports to glTF `(x, height, store_z)`. Origin is the middle post's floor contact. Local +X follows the rope line, +Y is runtime up, +Z points toward the runner. No animation or per-frame simulation.

| Dimension | Feet |
| --- | ---: |
| Post height | 3.25 |
| Base diameter | 1.16667 (14 in) |
| Upright outer diameter / wall | 0.15 / 0.01 |
| Spun cover wall | 0.008 |
| Post centers | -5, 0, +5 on local X |
| Attachment-eye outer anchor | X = post center ±0.17, Y = 2.965, Z = 0 |
| Rope nominal diameter | 0.084 |
| Rope span / sag | 5 / 1.0 |
| Barrier footprint | 11.16667 × 1.16667 |
| Runner | 10.2 × 2.8 × 0.028, center Z = 2.1 |

The `.blend` retains named `anchor_rope_*` empties. Clasp hooks interlock with the post eyes; sleeves meet the rope ends at about 2.88 ft. The threaded collar seats the hollow upright into the weight and spun cover. The rubber sole reaches Y=0; the weight stays inside the cover. Closed radial profiles give the cover and tube actual wall thickness. Swept hooks have closed continuous rings. Each authored part is checked for manifold edges and normals are recalculated before export. Parts remain separately editable before the runtime merge by finish.

UV islands cover all metal, rubber and runner surfaces. Rope UVs use circumference U and axial Blender V (0–4.8, exported glTF V = 1–V); the runtime also uses axial V to adjust the sag while preserving the round cross-section. Fine braid/pile texture is intentionally omitted at this viewing scale. The rope is a smooth fabric envelope, not individual simulated fibers.

## Runtime contract

`src/fixtures/rope-stanchions.ts` registers as `rope-stanchions` through the normal fixture registry. Default placement `rope-queue-entrance` is centered at **(-4.9, 8.5)**, yaw 0: entrance-side open foreground, before aisle ends. It leaves both rope ends uncoupled. `floorDisplays: false` formats omit it through the existing admission filter. Larger custom spans need their own placement clearance check.

Options `span` (5–7 ft) and `sag` (0.15–0.25 of span) are finite-checked and clamped; defaults are 5 and 0.20. The authored post is never stretched. Clasp hardware translates with the span endpoints; rope centerline and section orientation are recomputed only at installation. The runner stays its standard size.

Material roles: `BrushedBrass`, `WeightedCore`, `FloorRubber`, `RopeFabric`, `RunnerPile`. Rope and runner take the active theme's primary palette color; there is no logo or text surface. The brand-free fallback uses the same finish and dimensions. No typeface or LogoSpec rendering is needed for unprinted furniture.

The existing `installDisplayModel` owns asset URL resolution, imported resources, late-load cancellation, fallback visibility and render/shadow refresh. The fixture owns supplied materials, fallback geometry, instance buffers and collision proxy. Disposal is idempotent and follows the scene-owned collider-list convention. There are no stock slots or new interaction handlers.

A stable invisible barrier proxy remains in the scene-owned collider registry across loading. Clerk navigation blocks the entire rope line rather than only the post bases; manual walk retains the application’s existing architecture-only clamps. Its footprint is derived from the same span/base dimensions; the low-profile runner is a walkable floor surface. The runner is physically separate from the posts and from #222's existing vestibule walk-off mats. This task does not replace door mats or install fixed guide rails/bollards.

## Cost and verification

| Module | Triangles | Runtime instances | Draws |
| --- | ---: | ---: | ---: |
| Post | 5,600 | 3 | 3 |
| Rope + clasps | 1,900 | 2 | 2 |
| Runner | 216 | 1 | 2 |

Total: **20,816 rendered triangles, seven draws, zero embedded textures**, 250,856-byte GLB. Construction metrics are in `tools/models/rope-stanchions-metrics.json`. Fallback resources stay allocated until fixture disposal; invisible colliders do not draw.

`tests/rope-stanchions-model.test.ts` loads the actual GLB and checks feet, datum, envelope, sag, UVs, finite normals/positions, material roles and resource budget. `tools/verify-rope-stanchions.mjs` exercises the actual browser fixture/loader across span and sag variants, missing assets, removal during pending loading, instancing and exactly-once geometry/material/instance disposal. Start Vite on port 4386 (or `ROPE_CHECK_PORT`) before running it. Its construction photographs are distinct from the installed store photographs.

Public evidence is captured only when `public/user-assets` contains `README.md` alone. Front, side, rear, eye-level, base and fallback construction photographs, installed before/after views, and navigation measurements accompany the delivery.


## Installed evidence

Inspected [installed eye-level view](screenshots/rope-stanchions/installed.png), [alternate eye-level view](screenshots/rope-stanchions/installed-eye.png), and [same-camera comparison with the new fixture hidden](screenshots/rope-stanchions/before.png). The hidden-fixture comparison retains the store's baked lighting; it is not a photograph of an older checkout. Construction views: [front](screenshots/rope-stanchions/front.png), [side](screenshots/rope-stanchions/side.png), [rear](screenshots/rope-stanchions/rear.png), [base](screenshots/rope-stanchions/supports.png), [fallback](screenshots/rope-stanchions/fallback.png).

The [navigation diagram](screenshots/rope-stanchions/footprint-navigation.png) uses the live store's actual fixture, counter and vestibule rectangles. The checked store reports zero layout violations. Its clerk route from (-4.9, 11.5) to (-1.15, -1.25) passes around the right-hand rope end; every segment is walkable. A point at (1.7, 7) is correctly blocked, so the route turns farther right instead of cutting the corner. The 13.5 ft ceiling leaves 10.25 ft overhead. The barrier clears the cart footprint by approximately 3.97 ft in Z and, even at the corporate format's 46 ft minimum width, clears the left wall by 1.517 ft. The runner is 0.117 ft beyond the base edge and does not intersect a post.

Verification: `npm test && npm run build` passes; 682 tests. Browser lifecycle/variant checks pass, with maximum rope radius error below 0.000003 ft. The installed photographs use the existing local store harness with synthetic catalog data, high render quality and a 5.5 ft camera; the harness waits for `StoreScene.ready` before setting the final pose. No private user-assets are present.
