# Paper catalog table (#200)

An original unbranded early-style lookup table, separate from the electronic
manager/search terminal. The `videolog-podium` archive photograph/study is not
available in this worktree or the accessible local reference directories.
The issue's low table, inclined cradle and ring-bound catalog specify the
construction brief; **all dimensions, joinery, finishes, and placement are design
estimates, not a source-verified period replica**. No private photographs or
branded artwork are embedded. Later post-and-disc forms remain excluded because
their base reference is missing. The printed title index is original fictional
set dressing, not live library stock.

## Source and construction

- `tools/models/catalog-podium.blend`: editable named table, apron, legs, glides,
  cradle cheeks, rear brace, lip, covers, spine, page blocks, individual leaves,
  curved printed top leaves, and three metal rings. Images are packed.
- `tools/models/catalog-podium.py`: deterministic Blender authoring and export.
- `tools/models/catalog-podium-print.py` and `catalog-podium-print.png`: original
  typography source and generated paper texture (Pillow and DejaVu Sans).
- `public/models/catalog-podium.glb`: portable runtime with embedded PBR images.

Regenerate from the repository root:

```sh
python3 tools/models/catalog-podium-print.py
blender -b -t 2 -P "$PWD/tools/models/catalog-podium.py"
```

Numeric units are **feet**. Blender `(x, -store_z, height)` exports to runtime
`(x, height, store_z)` without a scale multiplier. Origin is the floor beneath
the tabletop center; the reader approaches from local +Z. No moving parts.

| Datum | Feet |
| --- | --- |
| Overall bounds | 3 W × 2 D × 3.23085 H |
| Tabletop top | 2.5 (30 inches); slab .09 thick |
| Cradle | 2.5 W × 1.5 slope length × .06 thick; 20° incline |
| Cradle center / `catalog_rest` | (0, 2.81, 0) |
| Cover bottom / cradle top | .03 above cradle center in its local normal |
| Cover top / page block bottom | .052 above cradle center in its local normal |
| `reader_stance` | (0, 0, 2.8) |
| Collider | 3 W × 2 D × 3.25 H |

Four legs meet the apron rails and underside of the top. Tapered side cheeks
bear on the tabletop and meet the underside of the inclined cradle. The rear
cross brace joins the cheeks; the front lip retains the binder. The covers rest
on the cradle, paper blocks rest on the covers, and curved top leaves rise at
the spine around the rings. Closed components are welded, outward-normal and
manifold checked during generation. Two printed top leaves are intentionally
open surfaces, wound upward. Solid leaf edges underneath supply page thickness.
Smart-projected UV islands cover solid parts; printed leaves use independent atlas halves for pages 12 and 13.

## Materials and cost

Six named material roles: `WarmAshLaminate`, `CradleLaminate`,
`BinderBookcloth`, `PaperEdges`, `CatalogPrint`, `BrushedNickel`. All have embedded
albedo, tangent-space micro-normal, and roughness images. Laminate has restrained
wood grain; cloth/paper and nickel have finer surface variation. Base finish
values are at least .12 linear; nickel is .85 metallic. Roughness centers are
.46/.49 laminate, .72 cloth, .86 paper, .27 nickel. No baked store lighting.
Materials remain separately addressable; none are tied to brand colors.

Runtime: **8,368 triangles, six material primitives/draws, 3,015,604 bytes**.
18 embedded textures: seventeen 256² images and one 1536×1024 spread image,
approximately 10.25 MiB decoded RGBA / 13.67 MiB including mipmaps. The runtime
export batches by material; the saved Blender file preserves individual parts.
Machine-readable bounds and geometry costs are in
`tools/models/catalog-podium-metrics.json`.

## Integration and verification

`CatalogPodium` is registered as `catalog-podium`, placed at **(-5, -3), yaw 0**
in the open left checkout area. It builds only for corporate / `bb-1990` fabric;
the format admission list also excludes it from stores without floor displays.
The 3 × 2 ft footprint reserves 1.5 ft clearance. The shelf front is 3 ft behind
its rear edge; the cart footprint starts over 4 ft beyond its front edge.

The shared `installDisplayModel` loader resolves base paths, hides the built-in
table/book fallback after loading, refreshes shadows/renders, and releases
loaded geometry, textures, and materials on disposal or late completion. A
separate invisible collision proxy stays active through fallback swaps and is
made non-raycastable on teardown. The fixture supplies no stock slots or menu
hit targets. Existing `counter-terminal-flow.ts` and terminal interactions are
unchanged; the paper catalog is a static physical lookup prop.

`tools/verify-catalog-podium.mjs` uses the actual StoreScene with synthetic stock,
public assets only, and cleared settings. It captures identical before/after
views (before hides the new fixture because there was no previous object),
standing working height, side, rear supports and bindings. It checks actual
layout violations for the podium, PBR maps, format/theme gates, resource disposal,
404 fallback and removal during an in-flight load. Run Vite on `PODIUM_PORT`
(default 4200), then run the script with `PODIUM_OUT` set to the evidence directory.
Use a worktree-local Vite cache when other workers share `node_modules`.

Node tests inspect the shipped GLB budget, UVs, normal maps, embedded textures,
material roles and attachment datum. Full verification: `npm test && npm run build`.

Inspected in-store photographs: [before](screenshots/catalog-podium/before.jpg),
[after](screenshots/catalog-podium/after.jpg),
[working height](screenshots/catalog-podium/working-height.jpg),
[side](screenshots/catalog-podium/side.jpg),
[rear support](screenshots/catalog-podium/rear.jpg),
[bindings and print](screenshots/catalog-podium/bindings.jpg).
Browser results are recorded in [verification JSON](screenshots/catalog-podium/verification.json).
