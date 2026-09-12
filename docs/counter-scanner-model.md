# Optional later handheld scanner

The bb-2010 chain counter loads a decorative scanner from the active brand
pack's `fixtures/late-era-fixtures-2012/scanner/model.glb`, then the same path
under `public/user-assets`. Missing assets retain the empty desk. Earlier themes
and the independent shop's short desk do not load the scanner. There are no
interaction, navigation or stock anchors.

The issue-187 delivery contains `scanner.blend`, reproducible `scanner.py`,
`model.glb`, `metrics.json`, and `NOTES.md` with the original reference in that
ignored directory. The private outbox archive is `scanner-delivery.tar.gz` under
`/home/devin/mognet-workers/out/astra-halcyon-187`; extract at the project root.
Reference derivatives stay local under the shared #151 delivery contract.

The inspected checkout photograph 7476924322 supports the dark corded handheld
category and its resting relationship beside a keyboard. Exact dimensions,
underside/trigger, lens tint, seam and cable termination remain estimates.
The broad head and swept grip are intentional ring-loft geometry, with separate
fitted shells, gasket, recessed lens and protective rim, trigger, two contact
rests, strain relief, continuous eleven-turn cord and flush cable grommet.

Units are feet, Y up; contact is Y=0 and the grip points along +Z. The existing
counter-top anchor supplies height and yaw beside the left terminal: along-run
offset -2.75 ft on the shield or -2.50 ft on the half-square, plus 0.24 ft
toward the clerk. The shield offset increased 0.1 ft to clear the terminal
cable envelope; the half-square offset decreased 0.15 ft to clear the
pole-display base and cable. Routing is adapted to the worktop, ending inside
a grommet rather than hanging
into the clerk path. The slight negative cable bound (~0.001 ft) is confined
to that bore; both rest pads contact the desk exactly.

Blender 5.2.0 LTS output: 5,012 triangles, eleven mesh primitives, four named
material roles, six embedded 128×128 images, 296,324-byte GLB. Every primitive
has UVs and normals; all eleven authored solids pass manifold-edge checks.
Original albedo micrograin, roughness variation and tangent normal relief are
packed into both deliverables. Materials remain dielectric, with linear albedo
above .08 and distinct elastomer, ABS, trigger and coated optical finishes.

Installed geometry/materials follow signage cleanup. Detached asynchronous
arrivals release their resources; owned textures are released on removal.
Authored maps remain authoritative through finishEquipmentSurfaces.

Verification: start Vite on port 4287, then run
`node tools/verify-counter-scanner.mjs` with the local delivery installed.
`SCANNER_OUT`, `SCANNER_PORT` and `SCANNER_STOREFRONT=usquare-counter` select
output and the second counter shape. The harness uses the real store, captures
same-camera before/after plus front, side, rear and overhead details, measures
resources/contact, and exercises era/shape gates, failed loading and teardown.
The before view hides only this formerly absent asset in the same settled scene.
Private verification photographs belong in the outbox/scratch, not public
brand publicity. Run `npm test && npm run build` for project checks.
