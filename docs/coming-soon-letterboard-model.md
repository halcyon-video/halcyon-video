# Counter coming-soon letterboard frame (#239)

Original generic hardware upgrade at the existing counter anchor. Scripted mesh
construction in Blender 5.2; no downloaded mesh, textures, logos or branded art.
This is not an authenticated reconstruction of a particular manufacturer's board.

## Evidence and scope

Inspected `src/fixtures/coming-soon-letterboard.ts`, its full measurement and
placement history, `src/fixtures/storefront-dressing-93.ts`, issue #151's delivery
contract.
The referenced local `NOTES.md`, original photo ending `828a835c-6482.png`, and
`front.png` are unavailable in this checkout and were not found in a local file
search. Original-photo fidelity is therefore unverified. Dimensions below are
existing scene specifications; groove pitch, folded rail cross-section and rear
rubber supports are explicitly inferred generic construction.

The hours sign has no matching frame reference. Its source records a separate
static sidelight notice and unresolved artwork provenance. It is left alone.
The rejected floor pedestal is not restored.

## Files and construction

- `tools/models/coming-soon-letterboard.py`: reproducible mesh authoring.
- `tools/models/coming-soon-letterboard.blend`: eight named editable solids,
  non-applied triangulation modifiers, UVs, material roles and provenance.
- `public/models/coming-soon-letterboard.glb`: runtime export.
- `public/models/coming-soon-letterboard.json`: generated part/triangle costs.

Four diagonal-ended rails sweep a folded profile around mitered corners, with
a rear return and faceted eased crown. A connected grooved insert includes its
rear sheet; grooves have actual 0.0015 ft relief at a 0.5 inch fixed pitch. The
textured front and plain back are separate material primitives. A tapered sole
forms a horizontal bearing surface after the 11 degree lean. Two fitted rear
pads terminate at the glass plane. No easel leg or floor support is invented.
All authored solids pass bmesh manifold checks and outward-normal recalculation.

## Coordinates and finishes

Feet in Three.js; Blender uses `(x, -store_z, height)` with Imperial units and
0.3048 metre unit scale. Export remains numerically in scene feet. Centered
board origin; front is local +Z, top +Y. Existing board envelope is 28 × 42 in,
carcass 1.4 in deep, frame band 0.875 in, proud lip approximately 0.192 in.

The fixture remains at `(9, 3.54, 7.75)`, yaw PI, with its established -11 degree
local X lean. The installed asset lifts 0.018 ft vertically in world space;
the sole fills this gap and contacts Y=3.54 exactly. Rear pads contact Z=8.54.
Precise transformed mesh bounds: X 7.833333–10.166667, Y 3.540000–7.004826,
Z 7.679704–8.540000 ft. The unchanged collision box and null floor footprint
continue to belong to the counter; no new navigation obstacle is introduced.

| Material role | Runtime finish / UV contract |
| --- | --- |
| LetterboardAluminium | Existing silver hardware, roughness .34 / metalness .72 |
| LetterboardBacking | Existing theme-derived dark field, roughness .55 |
| LetterboardLiveFace | Same live material and canvas as the fallback |
| LetterboardContact | Neutral rubber, roughness .85 |

Hardware uses packed UV islands. The entire front uses full-board planar UVs,
so installed user artwork retains its placement. Live rows end at 0.976 H,
slightly inset from the previous 0.986 H limit so row 22 clears the inner lip. The loader
converts glTF's V convention to the existing BoxGeometry/CanvasTexture convention
on the live insert only. No lettering is baked into the GLB; the model shares
the existing replaceable canvas, not a cloned texture.

`installDisplayModel` resolves the asset base path, leaves the procedural group
visible until load success, rejects detached/late results, refreshes shadows and
rendering, and disposes model-owned resources. The fixture owns the shared runtime
finishes and canvas. Existing user-art loading, feed subscription, collision proxy,
era gate and usquare exclusion remain intact.

## Cost and validation

Runtime: 103,916 bytes; 1,552 triangles; eight source objects / nine glTF material
primitives; four finish roles; zero embedded images. At most nine visible mesh
draws before shadow passes. The retained hidden fallback is 60 triangles with no
visible draw cost. The existing default 1024 × 1536 RGBA canvas remains shared
(6 MiB base level, approximately 8 MiB with mipmaps); no new texture allocation.

`tests/coming-soon-letterboard-model.test.ts` parses the real exported GLB and
checks finite normals/UVs, budget, dimensions, actual vertex contact with counter
and glass, full-face mapping, groove depth and front ray visibility.
`tools/check-letterboard-lifecycle.mjs` exercises the actual browser fixture:
loading failure, successful replacement, live feed refresh and texture ownership,
unchanged-row reuse, disposal twice, late completion, detached completion, era and
usquare gates, and teardown/rebuild. The browser checks pass. `npm test && npm run build` exits 0 with 701 tests
passing; the build emits only its existing large-chunk advisory. The saved Blender source also passes manifold,
positive-volume and UV-layer checks for all eight solids.

Photographs use the real store with cleared settings: bb-1990, corporate format,
day exterior, low quality, generic artwork. `tools/verify-letterboard.mjs` captures
store/front/side/rear/contact cameras, plus a rear-support close-up.
The original before capture used the full synthetic demo at 400 × 320; after
captures use the production StoreScene with a fixed 80-title catalog and the
public-demo startup path at 1000 × 800. Camera coordinates and counter geometry
match; background stock and environment-bake state differ. The frontend grooves
catch the light, the complete last row clears the lip, the side view shows the
rail depth/lean, and the close-ups show the level sole and rear contact pads. Set `BEFORE=1` only against the
unmodified source for true before photographs. Start Vite with `VITE_DEMO=1`; set `LETTERBOARD_PORT` for Vite
and `LETTERBOARD_OUT` for the evidence directory. The checked before/after files
are in `/home/devin/mognet-workers/out/astra-halcyon-239`.

Rebuild from repository root (absolute path supports the ThinkPad's Flatpak CLI):

```sh
blender -b -t 2 -P "$PWD/tools/models/coming-soon-letterboard.py"
npm test && npm run build
```
