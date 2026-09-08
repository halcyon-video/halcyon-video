# Storefront architecture

Choose **Store Look → Building & Storefront → Building facade** to change the
large store's exterior independently of its era, brand, doors, and counter.
Window awnings have their own toggle. The small shop keeps its own facade.

| Facade | Architectural character |
| --- | --- |
| Gabled Brick | Low parapet, small central gable, stepped entrance piers, and two levels of glazed tile |
| Flat Parapet | Shallow entry, framed sign field, and a simple molded cornice |
| Arcaded Brick | Broad entrance, dentil cornice, domed entry canopy, and trimmed window arches |

The gabled elevation keeps the proportions of a freestanding Louisiana
storefront. Its peak is approximately 23 feet above grade in the standard
store, the parapet is 16.8 feet, and the entry stripe sits below the wing
stripe. The structural roof stays inside the masonry envelope, eliminating
the dark slab that previously protruded through the front wall.

These are adaptable store designs, not architectural surveys. Windows remain
four-foot modules and the building grows with the library. The arcade spans
pairs of those modules. Doors and the walkable entrance retain their existing
footprints; the masonry is an exterior skin.

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

See [Window awning model](storefront-awning-model.md) for canopy construction,
lighting, and material details. Reference photographs are retained privately;
the runtime assets contain original meshes and no photographic signage.
