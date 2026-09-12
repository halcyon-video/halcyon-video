# Entrance bollards (#263)

Original generic hardware, authored in Blender 5.2 by script. This is a construction improvement of the existing dark post/yellow-band silhouette, not a measured historical or branded replica. No imported geometry, photographs, logos, textures or private user-assets are used. Dimensions are design choices informed by the feet-based scene, not manufacturer measurements.

## Source and construction

- Editable source: `tools/models/entrance-bollard.blend`; regenerate with `blender -b -P "$PWD/tools/models/entrance-bollard.py"` (the Flatpak CLI needs an absolute script path).
- Runtime: `public/models/entrance-bollard.glb`.
- Blender coordinates: X width, -Y store depth, Z up; glTF maps these to store X/Y-up/Z. Coordinate values are feet, exported at scale 1. Origin is the center of the flange's underside.
- Dimensions: 3 ft / 36 in tall, 0.5 ft / 6 in post diameter, 0.75 ft / 9 in flange diameter. The 3/4-inch thick flange seats at Y=0. The yellow band covers Y=2.30–2.55 ft.

Ten named editable parts describe the continuous post/crown/weld foot, eased mounting flange, four washers and four chamfered hex anchor heads. The post has a continuous closed skin, a shallow domed crown, and a flared weld foot seated on the flange. The band is a face material on that same skin; there is no overlapping band mesh in the export. Washers have open bores and the seated heads imply buried anchors; unseen concrete anchors and flange bores beneath the heads are omitted. Each solid is checked for manifold edges, positive face area and outward normals. Cylindrical UVs follow the revolved surfaces; horizontal ends use planar UVs.

Material roles are `PostPaint`, `SafetyBand`, and `FixingSteel`. Runtime provides these named, replaceable finishes with the established charcoal/yellow palette. There are no printed or theme-specific graphics, moving parts, stock slots or interaction targets.

## Integration and ownership

`src/exterior-environment.ts` installs `buildEntranceBollards` at the original two anchors: store left edge minus 1.4 ft and right edge plus 1.4 ft, both at `FRONT_GLASS_Z + 1.6`. The complete flange contacts the sidewalk at Y=0. Its radius leaves 1.225 ft to the sidewalk's rear edge and remains within the sidewalk's 4 ft extension beyond each store edge. The posts remain decorative; collision/navigation assumptions are unchanged.

The previous posts were only 0.9 ft high. Both the authored model and the cylinder loading/error fallback now read at 3 ft. `installDisplayModel` loads through `assetUrl`, hides the fallback only after installation, and rejects late or detached loads. The existing exterior callback refreshes both structural shadows and the requested frame. Repeated posts clone transforms while sharing the imported geometry and materials. Idempotent teardown releases imported geometry once, supplied finishes and retained fallback geometry, and detaches the group. The loader context type now states the four fields it actually consumes, allowing this exterior consumer to reuse it without constructing an unrelated fixture context.

## Resource cost and verification

The GLB contains one mesh with three material primitives: **2,144 triangles, 76,348 bytes, three materials, no textures**. Both posts render **4,288 triangles in six draws** and share three runtime geometry buffers. The source has 1,084 vertices; UV/normal boundaries produce 1,880 runtime vertices. Hidden fallbacks retain two small shared cylinder geometries until disposal (192 triangles across both visible fallback posts/bands).

`tests/entrance-bollard-model.test.ts` parses the actual GLB and checks units/bounds, sidewalk datum, one reusable mesh, material roles, surface-band radius, finite UVs/positions, unit normals and resource limits. `tools/check-bollard-lifecycle.mjs`, called by `tools/verify-bollards.mjs`, checks sharing and exactly-once disposal at 32/46/70 ft anchor spacings, missing assets, disposal before load completion and parent detachment. These spacing checks exercise the same anchor arithmetic; they do not claim a full store-format screenshot sweep.

The photograph harness reuses the existing StoreScene/teleport workflow from `verify-hatchback.mjs`, with synthetic catalog data, cleared localStorage, corporate format, low rendering quality, day lighting, and no private user-assets. Before photographs were captured against the original exterior implementation, not a hidden replacement. Matching after cameras show installed scale and sidewalk contact; useful side/rear/base details are included. The interior window camera is obstructed by the existing poster/pier and is not used as proof of the model.

Inspected photographs: [before](screenshots/entrance-bollards/before-entrance.png), [after, same camera](screenshots/entrance-bollards/after-entrance.png), [original base](screenshots/entrance-bollards/before-base.png), [new base, same camera](screenshots/entrance-bollards/after-base.png), [clear side](screenshots/entrance-bollards/details-side.png), [rear fixing details](screenshots/entrance-bollards/details-rear.png), [base hardware](screenshots/entrance-bollards/details-base.png), [5.5 ft eye height](screenshots/entrance-bollards/details-eye.png). The supplemental detail captures reset the application's dynamic resolution before synchronous frame capture. The unchanged red box obscures the first side camera; the opposite-side detail resolves that occlusion. The rear detail crops the crown but shows the back of the band/post and base seating; the full crown is visible in the clear side view.

Verification: `npm test && npm run build` completed with exit code 0: **687 tests passed**, file-budget/provider-boundary/slot checks passed, TypeScript passed and Vite built successfully (existing large-chunk warning only). [Browser lifecycle results](screenshots/entrance-bollards/lifecycle.json) passed for the actual exported mesh. The hatchback harness now scopes its textured mock models to the five car requests; the untextured bollard has its own lifecycle checks.

The existing exterior car regression also passed: `node tools/verify-hatchback.mjs <out> after --lifecycle-only` exited 0, including textured car resource cleanup, failed-load fallback and idempotent exterior teardown.
