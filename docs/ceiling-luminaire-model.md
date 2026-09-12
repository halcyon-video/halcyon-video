# Hanging industrial luminaires — #285

Original generic geometry, authored with Blender 5.2 using `tools/models/ceiling-luminaire.py`; editable family in `tools/models/ceiling-luminaire.blend`; two independent exports in `public/models/ceiling-luminaire-{dome,directional}.glb`.

## Reference and uncertainty

Inspected the locally archived [Flickr photograph 243950517](https://www.flickr.com/photo.gne?id=243950517): repeated narrow-neck bells, separate upper ballast, short suspension, bright apertures below exposed framing. The issue's video frame descriptions inform the smaller directional variant; the linked video could not be fetched during this task, so its head proportions remain an interpretation, not a measured replica. No photographic textures, logos, private references or electrical-accuracy claims ship with these generic fixtures.

All dimensions have **LOW confidence**. The issue gives two incompatible ranges (8–18 inches and 1.5–2 feet). The initial bell diameter is their common boundary, 1.5 ft / 18 inches. Shade depth is .92 ft; overall ceiling-contact-to-rim drop is 1.96 ft. Directional mouth is .74 ft, overall drop about 1.317 ft. These are exploratory dimensions pending an anchored crop study. Mounts and reflector internals are plausible construction, not measured historical details.

## Model contract

- Feet: Blender Z up, coordinates `(store X, -store Z, store Y)`; Y-up GLB exports retain one coordinate unit per foot. Blender scene display is Imperial, scale length .3048.
- Every runtime export has its origin at the ceiling contact centre; lowest dome point is Y=-1.96. Source collections sit beside one another for editing; export origins are independent.
- Named contact plate, attachment stem, ballast/lid, socket, spun bell/rolled lip, recessed lamp, and directional yoke/arms/pivot bolts/head. All solid components pass manifold checks. Bell wall is explicitly connected to the inner bowl at the rolled edge; no single-sided silhouette or emissive disc substitutes for the shade.
- `OuterPaint`, `InnerReflector`, `Hardware`, `Lamp` are separate material roles. Neutral white paint and unbranded metal fit every active palette. No printed graphics or textures. Turned surfaces have seam-based cylindrical/profile UVs; fabricated parts have packed UV islands.
- Directional joint pivots at local Y=-.78 and pitches 25 degrees toward -Z in the store. Source joint remains editable. `dome_Lamp_anchor` and `directional_Lamp_anchor` match runtime light positions; aiming uses the same variant and ceiling anchor.

Exact measured bounds, triangle counts, and export byte costs are in `ceiling-luminaire-cost.json`. Dome: 3,108 triangles, 8 material primitives. Directional: 3,120 triangles, 10 primitives. Runtime uses one InstancedMesh per exported primitive, so both families together cost 18 draw calls regardless of repetition. No textures, new lights, or new shadow maps; existing key lights are repositioned and aimed. Lamp emission is 1.4 and follows the existing light-source material policy.

## Installation and lifecycle

Settings → Building & Storefront → Ceiling Structure → Exposed joists & pendants. Default remains acoustic tile. The option is accepted only by corporate layouts at 13.5 or 18 ft; independent shops retain their tile lighting even with a raised ceiling. The existing cash-wrap soffit and its recessed lighting remain installed.

`store-shell.ts` uses the existing budgeted key-light grid as the bay/fixture anchors. Roof and exposed joist undersides connect to fixture origins. Sales-floor tile/troffer meshes are omitted for this option. Exclusions retain the soffit, stepped corner and space around CRT mounts and genre-sign suspensions. Dome rims are at least 11.54 ft above floor (16.04 ft in high mode), above navigation, doors, shelf bodies and hanging sign panels. Existing world-space floor interaction/collision anchors are unchanged.

`src/ceiling-luminaire.ts` batches each part across the family. Each asynchronous family load hides only its matching hollow procedural fallback, requests structural-shadow refresh and a render, and disposes detached loader resources. Removal or scene geometry disposal invalidates pending loads and disposes instancing buffers, materials and geometry. Missing models retain visible hollow shades, lamps and supports.

## Reproduction and verification

From repository root (the ThinkPad Blender wrapper requires an absolute script path):

```sh
blender -b -t 2 -P "$PWD/tools/models/ceiling-luminaire.py"
node tools/verify-ceiling-luminaire.mjs /tmp/luminaire-verification
npm test && npm run build
```

Photographs use the existing public-demo rendering path (`VITE_DEMO=1`) at low quality on software GL, with synthetic catalogs; they are local verification, not deployment. The verification tool refuses to photograph a tree containing private user-assets. It photographs both loaded/fallback families from front, side, support and below, then boots the actual StoreScene with small/full synthetic catalogs at standard/high ceilings, with an acoustic-tile baseline and a forced failed-model case. Evidence is written outside the public asset library. Export tests check material/UV budgets, attachment bounds, headroom, format gate, and source/runtime lamp/beam agreement.
