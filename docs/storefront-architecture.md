# Storefront architecture

Choose **Store Look → Building & Storefront → Building facade** to change the
large store's exterior independently of its era, brand, doors, and counter.
Window awnings have their own toggle. The small shop keeps its own facade.

| Facade | Architectural character |
| --- | --- |
| Gabled Brick | Low parapet, central gable on freestanding pillars, tiled bands, and separate entry/exit doors |
| Flat Parapet | Raised rectangular entrance pavilion on freestanding pillars, framed sign field, and a returned cornice |
| Arcaded Brick | Open entrance arch on substantial pillars, dentil cornice, and trimmed window arches |

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

The gabled export contains 436 triangles across five material groups. The
source checks every solid part for manifoldness. Unit checks cover aligned
mortar courses and door clearance; the in-app navigation rig covers both roots.

See [Window awning model](storefront-awning-model.md) for canopy construction,
lighting, and material details. Reference photographs are retained privately;
the runtime assets contain original meshes and no photographic signage.
