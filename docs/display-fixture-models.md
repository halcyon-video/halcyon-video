# Display fixture models

The endcap, four-sided campaign stand, and bargain tub use original Blender-authored furniture while the app continues to place and stock them dynamically. `tools/models/display-fixtures.py` reproduces the four public GLBs and matching editable Blender files. No photographs, reference graphics, or real-chain marks were used to author these public meshes.

## Coordinates and fitting

All dimensions are feet. Script helpers take `(x, height, store_z)` and author Blender `(x, -store_z, height)`; glTF's Y-up export returns the store coordinates. Origins, yaw, footprints, stock selection and sign surfaces remain owned by the existing fixture classes.

| Model | Bounds, W × H × D | Triangles | Runtime draws | GLB bytes |
|---|---:|---:|---:|---:|
| Endcap, tapered | 2.16 × 4.6 × 0.639 | 4,344 | 4 | 278,116 |
| Endcap, straight | 2.16 × 4.6 × 0.639 | 4,344 | 4 | 275,560 |
| Campaign stand | 2.995 × 3.98 × 2.995 | 6,320 | 4 | 440,876 |
| Bargain tub | 3 × 2.7 × 3 | 1,304 | 4 | 90,696 |

Counts exclude the unchanged signs, seasonal footer and stock. No textures are embedded. Detailed authoring metrics are in `tools/models/display-fixtures-metrics.json`; glTF may split vertices at normal/UV seams. Each physical part is checked for manifold edges before export. Runtime meshes are joined by finish role; the Blender sources retain separately named panels, caps, trays, brackets and feet.

The endcap is a continuous routed slatwall panel with finished base/crown caps, three eased trays at 1.5, 2.6 and 3.7 feet, and bracket upper edges fitted to the pitched deck underside. Tapered and straight variants follow the host run's silhouette. Collection headers, their material override and dressed seasonal footer are unchanged.

The campaign stand retains its 36 slots at the original three heights and case poses. It adds a fitted cabinet, raked backing cassettes, continuous retaining noses, seated brackets and a recessed plinth. Original fascia blades remain independent. Nonstandard placement dimensions/shelf lists retain procedural furniture.

The tub has a welded outside, continuous rounded rim return, interior walls and closed bottom, with a recessed product bed and four rubber glides. Its body stays within the existing three-foot square and 2.7-foot height. The sign cards, instanced pile and selectable slots remain fixture-owned.

## Finishes and lifecycle

`DisplayBody`, `DisplayShelf`, `DisplayTrim`, `DisplayHardware`, and `DisplayBed` name the replaceable roles. Body/shelf/trim finishes reuse the fixture's active theme and wood materials. The campaign stand keeps its existing acrylic finish. Box-projected UVs carry normalized endcap height for its collection/wood material overrides.

`src/fixtures/display-model.ts` resolves paths with `assetUrl`, hides the procedural furniture only after successful installation, refreshes shadows/render-on-demand, and owns the imported geometry/materials. The fixture retains its collision meshes and supplied finish ownership. Disposing during a pending load cancels installation and releases the orphan result; an unavailable model leaves the built-in furniture visible.

## Local model profiles

An optional per-stand dictionary in the existing local settings storage, `bb_floor_display_profiles`, can describe a local GLB with its matching `coreHeight`, `shelfHeights`, `shelfCenters`, `lean`, `dark`, and `topper` values. Profiles are explicit per fixture ID, accept only paths under `user-assets/`, and are validated before replacing the default. Shelf centers remain within the existing three-foot footprint. Capacity and campaign selection use the chosen row count, including five-tier displays. A missing local model retains a narrowed fallback core behind its stock. The standard stand is unchanged without a valid profile.

Reference-derived variants and their source, configuration, provenance and photographs remain private local assets. They are not part of the public model package.

## Verification

The delivery was checked in the real store with high-quality settled GPU photographs, including matching before/after corners, all campaign corners, the endcap-to-host joints, tub interior, full-store collection display and wooden straight-endcap variant. Browser checks covered stock counts, UV/normal coverage, repeated load/dispose, removal during loading, missing-GLB fallback and case inspection. The project build, campaign tests and local-profile validation tests passed. Detailed private harness evidence and public-safe photographs accompany the delivery in the publicity kit.
