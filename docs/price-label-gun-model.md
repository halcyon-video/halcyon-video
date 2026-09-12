# Resting mechanical price labeler (#192)

Original unbranded counter dressing for the **bb-1993 corporate shield** counter.
This is a proposed addition, **not attested in the store photographs**.

Reference inspected on 2026-09-11: Avery Dennison's [Identification Solutions
History](https://www.identificationsolutions.averydennison.com/en/home/about-us/history.html),
particularly its [gold 1110 product photograph](https://www.identificationsolutions.averydennison.com/content/printer1/na/en/home/about-us/history/_jcr_content/parsys_main/column_control_1966746715/1/parsys_column/image.img.jpg/1484161421436.jpg).
The manufacturer dates the plastic Econoply 1110 introduction to 1972–73.
That establishes a plausible pre-1993 construction family, not evidence of a
particular store's inventory. The image was downloaded to ignored
`scratch/reference/monarch-1110-history.jpg` and visually inspected before
modeling. It shows an ochre shell, curved grip, separate dark squeeze trigger,
red partial roll hood, selector and front feed mouth.

The model uses those mechanical construction cues with original proportions,
blank paper, no logo, and no copied image pixels. It is not a manufacturer-exact
replica. Overall dimensions, hidden construction, hardware positions and the
resting pose are authored estimates (LOW confidence); no measured historical
unit was available. Period suitability is an inference from the dated family.

## Asset contract

- Script: `tools/models/price-label-gun.py`; editable source:
  `tools/models/price-label-gun.blend`; runtime: `public/models/price-label-gun.glb`.
- Rebuild from repository root:
  `blender -b -t 2 -P "$PWD/tools/models/price-label-gun.py"`.
- Halcyon units are feet, deliberately exported without SI rescaling. Blender
  uses Imperial display and scale length 0.3048. Blender X/Y is the tool's side
  profile, Z its thickness; Y-up export maps to store `(X, Z, -Y)`.
- Resting origin is the lower shell's contact plane, runtime Y=0; nose points
  +X, grip toward +Z. Overall bounds: X -0.3400..0.40194, Y 0..0.2850,
  Z -0.31366..0.29481 feet. Approximately **8.90 × 7.30 × 3.42 inches**
  long/deep/high including protruding selector and emerging label.
- Named anchors: `anchor_worktop`, `anchor_trigger_pivot`, `anchor_label_exit`.
  Static dressing; no animation, interaction, stock slot or navigation proxy.
  Trigger/cover remain independently editable but have no runtime mechanism.
- 46 named source solids: paired body/grip shells, parting seam, curved trigger,
  roll and partial curved cover, arbor, service panel/latch, selector stem and
  knurls, six mechanical wheel edges, mouth jaws, recessed roller, steel peel
  blade, blank emerging label and slotted fasteners. Molded radii are applied
  for predictable normals; mesh parts retain intentional topology and names.
- Every source solid passes a bmesh manifold-edge check. Smart-projected UV
  islands on every mesh, finite normals and positions verified from the export.
- Material roles: `LabelerOchreABS`, `LabelerGraphite`, `LabelerPaper`,
  `LabelerSteel`, `LabelerRollCover`. These physical material roles are independent
  of store branding. Runtime meshes join by role; source retains physical parts.
- Seven embedded 128×128 original PNG images: five color/grain maps plus shared
  tangent normal and roughness maps. Deterministic NumPy-generated fine stipple;
  no external art or texture dependencies. Color values are converted from
  linear reflectance to sRGB for portable glTF albedo. Minimum authored diffuse
  reflectance exceeds 0.08. Roughness factors: ABS .52, graphite .62, paper .90,
  steel .32, cover .58, modulated by the shared .78–.98 map. Steel metallic .8;
  normal strength .3 (.12 paper/steel), with UVs tiled 4× for fine grain. Seven RGBA maps occupy 448 KiB decoded base
  levels, approximately 597 KiB with mipmaps, before driver overhead.
- Runtime cost: **539,604 bytes, 5,892 triangles, five mesh/material draw
  batches**, no per-frame work. `public/models/price-label-gun.json` records cost.

## Placement and ownership

`priceLabelGunAnchor()` in `src/store-fixtures-config.ts` uses the actual
Entrance back datum: `(cx - 3.9, 3.54, backZ - .75)`. Entrance installs it only
when counter dressing is enabled, theme is bb-1993 and shape is shield. Desk and
U-square have different available surfaces and deliberately receive no prop;
other eras are excluded pending a separate dressing decision. Existing
`counter-anchors.ts` camera/interaction frame is unchanged.

In the default store the loaded bounds are X 6.760..7.502, Y 3.540..3.825,
Z 7.536..8.145 feet. This occupies the left end of the rear band, fully within
its navigation footprint. It clears the rear sign by at least .290 feet in Z
and is remote from both terminals and the office kit. Both shield finishes
share Y=3.54. No walking or checkout/stock anchor changes are needed.

The loader uses `assetUrl`, retains an extruded tool silhouette if loading
fails, replaces/disposes that fallback after success, and refreshes shadows and
render-on-demand. Entrance removal disposes unique geometries, materials and
shared textures once. Late results are disposed without reattaching the prop.

## Verification and photographs

`tests/price-label-gun.test.ts` checks the actual GLB's bounds, dimensions,
contact plane, anchors, finite geometry/UVs/normals, image sizes, material texture
bindings and cost. Downward raycasts at nine footprint points verify contact
with both shipped shield millwork finishes at Y=3.54. `tests/price-label-gun-lifecycle.test.ts` exercises failure,
success, fallback replacement, render/shadow refresh, shared texture disposal
and late-load rejection through the production loader.

`tools/verify-price-label-gun.mjs` adapts the existing office-kit real-app
photograph harness. Run Vite on port 4279 and invoke the tool with Node 22.
It starts with cleared settings, corporate/bb-1993/day/low, requires a clean
public user-assets directory, measures installed bounds and neighboring objects,
and checks unsupported era/shape gates plus the shifted back datum. Outputs:
`before.png`, `installed-eye.png`, `front.png`, `side.png`, `rear.png`,
`footprint-photo.png`, and `installed-metrics.json`. Before is the same loaded
store/camera with only this addition hidden. These are app photographs, not
claims of historical source photographs. Close side/rear views expose the
mouth, roll cover, seam and trigger; overhead establishes the resting footprint.

Final evidence is copied to `/home/devin/mognet-workers/out/astra-halcyon-192/`.
`npm test && npm run build`: 737 tests pass; build succeeds. Vite retains the
existing large-chunk warning. Capture uses Chromium SwiftShader at low quality;
material maps and relief are inspected in the actual store lighting, but this
is not a hardware performance benchmark.
