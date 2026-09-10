# Original Halloween window kit

One molded pumpkin and a reusable bat/pumpkin/ghost cling family. Original
Halcyon designs, scripted mesh authoring and hand-authored SVG; no external
images, chain references, logos, or generated imagery.

## Asset contract

- Source: `tools/models/halloween-pumpkin.py` and editable
  `tools/models/halloween-pumpkin.blend`. Run
  `blender -b -t 2 --python tools/models/halloween-pumpkin.py`.
- Runtime: `public/models/halloween-pumpkin.glb`, 84,000 bytes, 2,752
  triangles, two meshes/materials: `PumpkinMoldedOrange`, `PumpkinStem`.
  UVs and normals exported. Authoring checks manifoldness and outward volume.
- Approximate dimensions: 1.34 ft diameter, 1.24 ft high (16 × 15 inches).
  Origin at the stable annular base; Blender Z exports to store Y; no animation.
  Eight ribs, subtle mold-plane parting seam, 0.025 ft wall thickness,
  underside access aperture, fitted stem socket, recessed inner return.
- Clings: `public/art/halloween-clings.svg`, transparent outside its paths,
  no backing rectangle. Runtime extrudes the three designs into thin gel-like
  pieces, enlarges them to roughly 0.9–1.3 ft, and merges all placements into
  one translucent, clear-coated, vertex-colored mesh. It deliberately avoids
  transmission's extra scene pass so the seasonal gloss stays phone-friendly.
  No raster textures.
  Reuse the SVG paths for other kits.
- Three visible draw calls total. The hidden sphere fallback retains its
  small allocation until shell disposal. No pumpkin request or decor geometry
  is allocated outside the season. No added animation or per-frame work.

## Placement and seasonal behavior

The pumpkin sits on the real checkout counter: on chain formats it occupies a
clear stretch of the outer blue band, away from register equipment; on the
standalone desk it uses that desk's own top. Both follow the counter's
shape-aware spine anchor rather than a fixed world position.
Clings form irregular three-piece clusters on every other front pane. Their
deterministic scatter varies position, tilt and scale while retaining at least
0.34 ft of clear glass at every pane edge. Placement follows the existing
window layout across store widths rather than hardcoded world coordinates.
No navigation anchors move.

The existing `inSeason('halloween')` calendar enables the kit October 1–31.
`bb_promo_date=2026-10-15` permits review; change to `2026-11-01` and rebuild
or reload the scene to remove it. This uses the existing build-time calendar
behavior, not a midnight timer. Empty stores use the same decoration gate.
Loader success hides fallback and refreshes structural shadows and rendering;
failure retains fallback. Window removal releases owned geometry/materials;
a late loader result is disposed without reattaching it.

## Verification and delivery evidence

`npm run build`, `npm run test:promo`, and
`node --experimental-strip-types --test tests/halloween.test.ts` pass.
The new tests cover September/October/November boundaries, December exclusion,
GLB validity, material names, normals/UVs and resource budgets. Browser checks
exercise out-of-season zero allocation/request, fallback, successful replacement
and refresh, normal disposal, and removal before asynchronous completion.

Inspected user-assets-free in-store day/night and exterior window photographs
are retained in `scratch/publicity-kits/issue-295/` in the working installation,
and copied to the dispatch conversation's pinned outbox. The day/night camera
is `--fly 1 --walk 49,7.4,180,-9,3.8` in the standard screenshot harness,
with `--quality high --settle 1 --set bb_promo_date=2026-10-15`.
These are development build photographs, not a master release.
