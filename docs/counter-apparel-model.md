# Counter-wall apparel display (#205)

Original generic shirt and baseball-cap study, authored with Blender 5.2 scripted meshes. The 1993 walkthrough mentioned in #205 could not be located in the checked local reference/archive directories. This delivery is **not a measured historical replica**. All dimensions and the suction-hook arrangement are design choices. No third-party mesh, photograph, logo or branded print is included.

## Delivery and coordinates

- `tools/models/counter-apparel.py`: reproducible authoring, procedural texture generation, topology audit, export.
- `tools/models/counter-apparel.blend`: individually named editable garment, seam, visor, sweatband, strap, hook, clip and suction-pad parts; packed textures; useful inspection viewport.
- `public/models/counter-apparel.glb`: five meshes joined by material role, plus two optional artwork anchors.
- `counter-apparel-metrics.json` and `counter-apparel-topology.json` beside the script: measured costs and part-level manifold-edge audit.

Run `blender -b -P /absolute/path/to/tools/models/counter-apparel.py`. The ThinkPad wrapper needs an absolute script path. Numeric units are feet, with Blender unit scale 0.3048. Blender `(x, -store_z, height)` exports to runtime `(x, height, store_z)`. Origin is the glass attachment plane at garment-bottom height. Local +Z faces away from the glass. Envelope: **3.4694 × 2.383 × 0.7893 ft** (width × height × depth). The shirt spans approximately 2.49 × 2.04 ft, with 0.006 ft cloth thickness; cap crown thickness is 0.012 ft and visor thickness 0.025 ft. No animation or moving parts.

The shirt is a front/rear pattern with sewn shoulders/sides and open neck, sleeve cuffs and hem, closed around material thickness. Its folds relax away from two shoulder clips. Ribbing and hem/cuff trim are separate parts. The six-gore cap has a shaped crown, fitted curved visor, bound edge, internal sweatband and rear suspension strap. Welded tube ends and solidified garment surfaces pass the manifold-edge audit.

## Materials and artwork

`ShirtCotton`, `CapTwill`, `RibAndStitch`, `SatinNickel`, and `SuctionRubber` are independent material roles. Dyed cloth uses original periodic twisted-yarn albedo, tangent normal and roughness maps. UV islands repeat the weave at fine scale. Hardware uses restrained micrograin normals and calibrated roughness maps. Albedos stay above 0.08; cloth roughness ranges about 0.816–0.895, nickel about 0.275–0.325, rubber about 0.625–0.675. No emissive surfaces.

The `Optional_artwork_anchors` collection contains `Artwork_ShirtChest` and `Artwork_CapFront` empty anchors, exported with suggested print dimensions in extras. They have no rendered geometry or artwork. Local artwork can be authored separately at these guides and conformed to the garment; it is never baked into the neutral cloth. There is no automatic artwork download or public branded variant.

## Store anchor and lifecycle

`counter-apparel` is registered in `src/fixture-registry.ts` and placed by `src/store-fixtures-config.ts`. It builds only for corporate `bb-1993` with a vestibule. Other eras and the independent shop retain their prior undressed scene. Position is **x=15.5, y=4.8**, yaw π; Z follows the existing entrance datum, `15 - 2*doorWidth - 0.06`. The 0.06 offset is half the actual 0.12 ft glass thickness. Suction-pad lips contact that glass plane, and J hooks connect to the two shoulder clips and the cap's rear strap. Garments sit on the right side of the rear checkout glazing, above/beside the office kit and clear of both terminals and the information board.

Suction-pad centers in local runtime coordinates `(x, y, z)` are `(-1.42, 2.08, 0)`, `(0.12, 2.08, 0)` and `(1.15, 2.29, 0)`. Their 0.17 ft diameter lips share the mounting plane; hooks project to 0.21 ft in front of it.

No floor footprint, collider, stock slot, navigation or interaction is added. There was no prior runtime garment: the missing/loading fallback is the original empty space. The shared `installDisplayModel` loader handles base paths, successful installation, shadow/render refresh and cancellation. It now also releases unique imported textures, including those on replaced imported materials, without taking ownership of caller-supplied finishes. Fixture teardown is idempotent.

## Costs and verification

**19,600 triangles; five material draws; 676,184-byte GLB; eight embedded 256² PNGs** (three cloth albedos, two shared normals, three roughness maps). Approximate decoded RGBA texture allocation including full mip chains: 2.67 MiB. No texture compression or animation; no FPS claim.

`tests/counter-apparel.test.ts` checks the shipped GLB's finite positions/normals/UVs, material texture channels, embedded images, mesh/triangle/byte budget and the source topology audit. `tools/check-counter-apparel-lifecycle.mjs` runs the actual browser fixture/GLTF loader through successful installation, repeated disposal, delayed completion, detached parent, failed request and era/glass gates. All imported geometry, materials and textures must be disposed exactly once.

Start Vite on port 4205 (or `APPAREL_PORT`), then run:

```sh
APPAREL_OUT=/path/to/evidence node tools/verify-counter-apparel.mjs
node tools/check-counter-apparel-lifecycle.mjs /path/to/evidence/lifecycle.json
npm test && npm run build
```

The photo harness uses the actual StoreScene with an empty catalog and deliberate corporate/1993/day settings. It captures matching before/after, front, side, rear and hook views; the before view hides only the new fixture in the same scene and retains baked lighting. It checks actual garment triangles against neighboring object bounds, avoiding a false overlap caused by empty space between garments. This ThinkPad's headless renderer reports SwiftShader and forces low quality; photographs are 1200×900 and are not hardware-performance evidence. Public-safe photographs and measured installed bounds accompany the task report in `/home/devin/mognet-workers/out/astra-halcyon-205/`.

Inspected photographs: [before](screenshots/counter-apparel/before.png), [after](screenshots/counter-apparel/after.png), [front](screenshots/counter-apparel/front.png), [side](screenshots/counter-apparel/side.png), [rear](screenshots/counter-apparel/rear.png), [cap strap and hook](screenshots/counter-apparel/cap-rear.png), [shoulder attachment](screenshots/counter-apparel/hooks.png). Navigation markers are hidden in these captures.
