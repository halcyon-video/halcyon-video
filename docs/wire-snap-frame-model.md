# Freestanding snap-frame sign family (#235)

Original generic fixture, authored with scripted Blender 5.2 meshes. No external
geometry, textures, period photographs, or branded artwork were used. Construction
details are plausible estimates, not a replica of a named manufacturer's product.

- Editable source: `tools/models/wire-snap-frame.blend`.
- Authoring script: `tools/models/wire-snap-frame.py`.
- Runtime: `public/models/wire-snap-frame.glb`.
- Regenerate with `blender -b -t 2 -P "$PWD/tools/models/wire-snap-frame.py"`.

Store units are feet. Blender X/-Y/Z maps to store X/Z/Y, with artwork facing
store +Z. The root is the original counter anchor at Y=0. The reference artwork
is 1 × 1 ft, centered at Y=.92; runtime keeps all supported dimensions, including
the current .9 × .7 ft membership, rental-policy and candy signs. Frame center is
`height/2 + (hasPost ? .42 : 0)`. The border remains .04 ft wide, backing spans
`width+.064` by `height+.064`, and the foot retains the .24 × .24 × .02 ft envelope.
The no-post version preserves the legacy frame-bottom Y=-.04 relative to its
anchor. No placement, era, navigation, or interaction settings were changed.

Four closed clipped-channel snap lids have 45-degree mitres with a .001 ft
assembly seam. A removable backing, rear saddle and screw heads provide rear
construction. The bored lower post sleeve receives a narrower upper tube; a
separate collar and rear thumbwheel indicate height adjustment. The tube is
editable in Blender; no new runtime adjustment interaction is added. The weighted
foot has clipped corners, a sloped edge, a socket, and a separate nonslip sole.
All solid meshes pass manifold-edge checks; only the artwork is an open plane.

Named material roles are `FrameFinish`, `Backing`, `Fasteners`, `Rubber`, and
`Artwork`. Hardware has packed UV islands; the editable artwork plane uses full
0–1 UVs. There are no embedded image textures. The runtime retains the existing
live artwork plane, its original UVs, and procedural/user texture handling; the
exported placeholder is hidden. FrameFinish uses the existing fixture finish.
Straight rail runs extend by vertex offsets, preserving section width and mitres
instead of nonuniformly scaling the complete stand.

Integration lives in `fixtures/wire-snap-frame-model.ts`, called by the existing
wire-frame signage branch after collider registration. It uses `installDisplayModel`
and the base-path asset resolver. The original hardware stays as hidden collision
geometry and as loading/error fallback. Successful installation refreshes shadows
and rendering. Sign removal cancels pending loads and disposes loaded geometry and
owned materials before the existing signage teardown disposes its fallback. Artwork
is never captured in an asynchronous load callback, so either ordering of user-art
and GLB completion preserves the latest sign texture.

Measured current-size bounds are .98 × 1.16 × .24 ft with the post, and
.98 × .78 × .043 ft without it (the latter spans Y=-.04 to .74). The
1 × 1 ft authoring-size asset spans 1.08 × 1.46 × .24 ft.

The exported asset has 16 meshes, 1,234 triangles, 5 material roles, 0 textures, and
85,200 bytes. Visible post-equipped runtime hardware plus artwork uses 16 draws
and 1,234 triangles; the no-post version uses 6 draws and 158 triangles. The
unchanged post-equipped fallback uses 8 draws and 106 triangles. Hidden fallback
geometry remains allocated, as required by the collision convention. Export costs
and per-part topology are recorded in `tools/models/wire-snap-frame-metrics.json`.

Verification uses the existing StoreScene/Puppeteer photograph harness pattern in
`tools/verify-snap-frame.mjs`; `before` blocks this GLB to show the unchanged original
procedural object at the same anchor. `after` captures context, front, side, rear,
and foot views. The no-post variant is exercised by the exported-asset checks;
the default evidence layout has no candy sign slot. The after run also toggles the
retained fallback to capture matched before views without moving any fixtures.
`check-snap-frame-lifecycle.mjs` checks exported dimensions at four
sizes/post variants, live artwork retention, render/shadow refresh, missing-asset
fallback, removal disposal, and disposal of results arriving after removal.

Inspected store comparisons:

| View | Original fallback | Blender hardware |
| --- | --- | --- |
| Side | [Before](screenshots/wire-snap-frame/before-side.png) | [After](screenshots/wire-snap-frame/after-side.png) |
| Rear | [Before](screenshots/wire-snap-frame/before-rear.png) | [After](screenshots/wire-snap-frame/after-rear.png) |

The side comparison shows the shaped rail edge, nested post and collar; the rear
comparison shows the matte removable panel, saddle fasteners and thumbwheel. The
foot detail confirms the socket and clipped weighted shoe sit at the unchanged
counter anchor. Complete context/front/side/rear/foot photographs, test/build logs,
and lifecycle results are delivered in the issue's MogNet outbox.
