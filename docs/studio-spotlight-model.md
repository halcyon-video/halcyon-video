# Studio spotlight source artwork investigation (#244)

Status: reference blocked. **Issue #244 is not complete.** No Blender model,
runtime mesh, alpha artwork or scene placement is delivered by this investigation.

## Reference findings

The work order identifies `fresnel-spotlight-studio` as a local archive/study
lead and requires comparison with the actual fascia artwork. The original
depiction is needed to identify the lamp, its proportions, pose and composition.
The requested ribbed housing, contiguous lens ring, yoke, adjustment hardware
and C-stand describe construction requirements, but do not identify a product.

- Read issues #244 and #151, including their comments. Neither supplies a
  photograph or original reference URL. #244's earlier completion comment was
  superseded by a reopening comment reporting no worker commit.
- Searched the checkout, local project/input copies and local filenames for
  the named lead. The checkout and nearby project user-assets directories each
  contain only their README. No matching source or study was found.
- Inspected the current recursive master tree of the archive repository
  `halcyon-video/media-server-video-store`: 429 entries, `truncated: false`.
  No matching spotlight study or source photograph was listed. This does not
  establish that ignored, private or historical reference material is absent.
- Web searches for the exact lead and fascia spotlight artwork
  did not identify the original depiction. Unrelated modern Fresnel products
  are not evidence for the commissioned lamp.

Requested the original study/artwork location from the owner. Before authoring,
inspect that image and establish any visible maker/model, housing and lens
diameters, depth, rib construction, yoke pivots, controls, stand arrangement,
pose, crop and lighting. Label inferred dimensions and unseen details as
uncertain. Supplementary product photographs can resolve side/rear construction
after the depicted product is identified.

## Current consumer findings

`src/storefront-facade.ts` builds the architectural envelope and sign anchors;
it currently has no Fresnel artwork consumer. `src/fixtures/genre-fascia.ts`
paints genre lettering. `src/wall-decor.ts` supplies film ribbon/portrait decor.
None establishes a lamp attachment point.

The existing flat-store awning in `src/flat/flat-store.ts` uses
`src/assets/awning-projection-reel.png`, falling back once on image-load failure
to `src/assets/awning-film-strip.png`. Visually inspected both raster assets:
the current collage contains reels and film strips; the older image contains
reel motifs and a small camera-like motif. Neither establishes the requested
Fresnel lamp and C-stand. Adding a lamp to either composition would require
the missing artwork evidence. Existing projection-reel delivery is documented
separately in `docs/projection-reel-model.md`.

## Resume and acceptance contract

Follow #151 and the build-3d-model workflow after reference inspection. Establish
units, dimensions, origin, axes, named parts/material roles and useful UVs;
author physical construction with clean topology and connected continuous
surfaces. Save editable `.blend`, reproducible authoring script and optimized
GLB. Owner-reference derivatives and branded art belong in local user-assets,
per #151 and `public/user-assets/README.md`.

Render isolated alpha poses matching the actual artwork and integrate them at
its confirmed consumer, preserving fallback, base-path resolution and resource
cleanup. This commissions a depicted product, not a shop-floor fixture.
Capture and inspect matching before/after in-store photographs and useful
side/rear model views. Compare the depiction against the original artwork;
measure exported bounds, triangles, material primitives, UVs, textures and
bytes. Run affected lifecycle checks and `npm test && npm run build`.

There are currently no new geometry or runtime resource costs, and no after
photographs. Passing baseline checks cannot validate an unbuilt model.
