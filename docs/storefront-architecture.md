# Storefront architecture

Choose **Store Look → Building & Storefront → Building facade** to change the
large store's exterior independently of its era, brand, doors, and counter.
Window awnings have their own toggle. The small shop keeps its own facade.

| Facade | Architectural character |
| --- | --- |
| Gabled Brick | Low parapet, central gable on freestanding pillars, tiled bands, and separate entry/exit doors |
| Flat Parapet | Raised rectangular entrance pavilion on freestanding pillars, framed sign field, and a returned cornice |
| Arcaded Brick | Open entrance arch on substantial pillars, dentil cornice, and trimmed window arches |
| Slate Cone Canopy | Deep charcoal panel canopy, inverted conical corner supports, ring capitals and narrow plinths |

The flat entrance rises to 22.2 feet in the standard store, with a rectangular
sign tower carried by 2.75-foot pillars. The arcaded entrance rises to 20.8 feet
and uses 3.25-foot pillars, with an elliptical arch springing at 9.15 feet and
rising another four feet. Both pavilions project 6.2 feet; their front pillars
leave the same clear rear passage as the gabled entrance. The arcade's former
six-foot solid shoulders and fabric dome are removed. Its window arches continue
along the wings, outside the narrower entrance footprint. Rear glazing jambs
remain shallow at the original door plane. Both cornices return to the wall.

The gabled elevation keeps the proportions of a freestanding Louisiana
storefront. Its peak is approximately 23 feet above grade in the standard
store, the parapet is 16.8 feet, and the entry stripe sits below the wing
stripe. The structural roof stays inside the masonry envelope, eliminating
the dark slab that previously protruded through the front wall.

These are adaptable store designs, not architectural surveys. Windows remain
four-foot modules and the building grows with the library. The arcade spans
pairs of those modules. The vestibule footprint stays fixed. In the gabled
front, the two 3.2-foot door leaves flank a 1.8-foot masonry divider with
2.8-foot sidelights outside them. The other fronts retain their paired doors. The gabled sidelights have no
waist rail or transom divider: each remains a single tall pane over its brick
sill. Individual door transoms sit below broad aluminum heads. The moving
leaves have continuous aluminum frames, bottom rails, and exterior pull bars;
these parts follow their leaf when it swings or slides.

## Masonry construction

The facade uses eight-inch stretchers in running bond, 2 2/3-inch courses,
and 3/8-inch mortar joints. The entry header and pier caps/bases use upright
soldier courses. Two-inch glazed squares form the blue bands: two across
the entrance, higher short bands on the piers, and a continuous band around
the wings. The entrance canopy projects 6.2 feet, supported by 2.75-foot-wide
freestanding pillars. Their shafts leave four feet clear of the finished wall; the soldier plinths
project 0.1 feet beyond each shaft face. Above the opening, continuous masonry
returns join the pillars to the wall. Below it, only short jambs remain at the
recessed door plane, flush with the masonry door divider instead of projecting
into the passage. The sidewalk extends 6.7 feet to support the pillar bases,
with its curb and drive-lane apron following the same dimension. The parking
stalls retain their positions.
The pillar bases, tile bands, and soldier caps wrap all four faces. These
adaptable dimensions are estimates, not surveyed measurements.
Tile abuts brick directly, without a contrasting metal strip above it. A
shallow step breaks the upper wing fascia, and brick rowlock sills finish the
front window knees. Permit-parking plates mount to both front pillar faces.

Each front window wing has one 1.25-foot masonry divider between its panes.
The glass and frames stop at the divider and resume beyond it; the divider
has matching exterior brick and interior wall finishes. Individual panes stay
four feet wide, with the baseline shell allowing room for all sixteen panes
plus both masonry breaks. Wider stores retain one symmetric break per wing.
The flat, arcaded, and small-shop facades keep their existing window layouts.

UVs use building coordinates at four feet per texture repeat, including the
window knees and corner returns. Resizing a wall or fitting an entrance does
not stretch its bricks or shift the mortar courses. Installed masonry maps
remain supported; the bundled scan is bypassed because its bond and physical
module differ from this surface. Tile color follows the active brand, and
the entrance sign's backlight switches off in daylight.

## Editable models

`tools/models/storefront-entrances.blend` contains the three entrance variants
and the window arch module. Rebuild them with:

```sh
blender -b --python tools/models/storefront-entrances.py
```

The exports are `public/models/storefront-entry-*.glb` and
`public/models/storefront-arch-bay.glb`. Named vertex groups retain the
individual masonry, coping, cornice, and canopy parts in the editable source.
The source script checks solid parts for manifold edges and writes a geometry
report beside the Blender file.

`src/storefront-architecture.ts` owns the dimensions and style selection.
`src/storefront-facade.ts` builds the adaptable envelope, and
`src/storefront-entry-model.ts` installs the fitted entrance and optional
arches. Higher ceilings retain roof clearance without moving the door head.
Named finish roles allow the active brand to recolor the tile and fabric;
the normal logo renderer supplies all lettering.

The gabled export contains 876 triangles across five material groups. The
source checks every solid part for manifoldness. Unit checks cover aligned
mortar courses and door clearance; the in-app navigation rig covers both roots.

See [Window awning model](storefront-awning-model.md) for canopy construction,
lighting, and material details. Reference photographs are retained privately;
the runtime assets contain original meshes and no photographic signage.


## Tower construction update (#254)

The gabled roof has two raised, mitered standing seams with finished ends,
a folded rear abutment apron, and eight recessed soffit pans. The soffit uses
neutral coated metal (`FacadeSoffit`) rather than a masonry texture overhead.
Existing piers, open passage, band positions and replaceable sign planes remain.
The wing awnings have corresponding wall flashing, mounting shoes, underside
access pans and folded end closures; see the awning notes.

The construction is original scripted mesh authoring, based on the existing
scene dimensions and inspected before views. New sheet thicknesses and join
sizes are design estimates, not a surveyed chain-store replica. No downloaded
geometry, owner imagery or real-chain artwork was added.
The existing facade silhouette is retained rather than claiming new historical
accuracy. Runtime artwork still comes from the normal brand renderer.

The source uses feet (`scale_length = 0.3048` for Blender's unit display).
Numeric Blender `(x, -depth, height)` exports as Three.js `(x, height, depth)`;
the loader uses these numeric feet directly. Origin is entrance ground center
at the glass line, installed at `(11, 0, 15)`. The authored gabled masonry
mass is 15.2 ft wide, with a 14.4 ft rear opening and 2.75 ft piers.
The header underside stays at 9.15 ft (soffit face 9.10 ft), front face at
6.2 ft, and the original masonry peak at 23.103 ft. Including the seams,
exported bounds are `[-10.45, 0, -0.18]` to `[10.45, 23.51632, 6.58]`
in Three.js axes. There are no moving parts or new navigation proxies.

`storefront-entry-fit.ts` fits the lower glazing independently from the upper
gable, preserving divider and sidelight widths. Roof slopes now remain straight
as vestibules change, with their peak following `facadeDimensions`, also used
by the sign envelope in `storefront-facade.ts` / `logo-storefront.ts`.
The sign builders and their disposal contracts need no changes.

The gabled GLB is 59,600 bytes, up from 33,524: 876 triangles instead of 436,
still five meshes/material draws. Its five roles are brick, soldier brick,
tile, coping and soffit. No embedded textures or additional runtime texture
allocations are introduced. UVs cover every vertex and masonry UVs are
regenerated in world feet after fitting. The Blender script checks every solid
for manifold edges, then batches by finish, retaining named part vertex groups.
Other entrance runtime exports are unchanged.

Verification uses `node tools/verify-storefront-tower.mjs OUT before|after|checks`.
Before/after labels capture the currently checked-out assets; they do not
simulate an old model using the fallback. The harness uses the real StoreScene,
with deliberate clean settings, and records front, side, roof, passage soffit,
rear roof and awning end/underside views. `checks` exercises all three entrance
styles, 70/86.8/110 ft wings, variable vestibules and ceiling heights,
UVs/normals, absent assets, removal during loading and repeated cleanup.
The two fit regression tests cover glazing anchors and the straight roof/sign
envelope. Inspected screenshots, cost JSON, integration results and successful
`npm test && npm run build` logs are delivered in the task outbox.

## Slate cone canopy

`bb_facade=cone-canopy` selects the new style. Its 11.5 ft projection is supported
by two turned inverted cones at depth 10 ft, on a 12.2 ft sidewalk. The underside
is 9.15 ft above grade; the standard canopy top is 18.2 ft. Each shaft grows
from radius .43 ft to 1.08 ft and ends in stepped concentric capitals up to
1.45 ft radius. The circular plinth radius is .58 ft. Room resizing preserves
these circular profiles and the door opening; only the overhead mass rises
with tall ceilings.

The active brand's ticket is anchored on the front at depth 11.55 ft and height
13.65 ft, with up to 13 × 7.8 ft of sign area. Channel-letter mode instead mounts
two rows directly on the upper building wall at depth .8 ft. The fields flank
the canopy, clear the actual front-corner margins, and begin at height 13.4 ft
to clear optional window awnings. Theme changes leave the charcoal finish intact;
existing sign lighting and warm soffit lenses respond to day/sunset/night.

Editable source: `tools/models/storefront-entry-cone-canopy.blend`; regenerate
with `blender -b -P <absolute-project-path>/tools/models/storefront-entry-cone-canopy.py`.
Runtime: `public/models/storefront-entry-cone-canopy.glb` (230,252 bytes,
6,780 exported triangles, 19 meshes, no image textures). Parts have manifold
closed geometry, mapped UVs, eased cladding edges, continuous folded corner
panels, recessed horizontal joints, and separate soffit pans. Material roles:
`FacadeSlate`, `FacadeCoping`, `FacadeSoffit`, `FacadeDownlight`. Feet and origin
follow the existing entry contract: Blender `(x, -depth, height)` exports to
Three.js `(x, height, depth)`, placed at store centre/glass line/ground.
The source includes editable sign-anchor empties; branding remains runtime-owned.
The shared profile JSON drives the Blender turnings and the Three.js fallback.

The taper, ring capitals, panel seams, and sign locations adapt a historical
storefront silhouette to the requested depth and live store. Dimensions are
design estimates, not surveyed measurements. No reference image, private source
locator, or chain artwork is embedded in the asset.

Verification: `npm test && npm run build`; browser geometry/lifecycle checks via
`node tools/verify-storefront-tower.mjs <outbox> checks`. In-scene views use
`node tools/verify-storefront-tower.mjs <outbox> canopy cone-canopy`, or `letters`
in place of `canopy` for both wall-mounted letter rows. These also photograph
night lighting and the procedural fallback.
