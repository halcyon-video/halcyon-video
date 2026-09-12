# Folded cardboard standee construction — #243

Original generic support geometry, authored with Blender 5.2 using intentional
sheet profiles, closed prisms, punched slots and continuous radiused foot folds.
This is a construction proposal behind the existing silhouette, not an exact
reconstruction of unseen period joinery.

## Evidence and scope

Inspected the original local photograph
`/home/devin/Downloads/2580265323_f355e24f61_o.jpg` (2721 × 4153), including the
checkout and HITS trees, before implementation. SHA-256:
`36bf51ad895a1bc9d0cf6052f95bf43a26114135881e57ba39a5b659893ce687`.
The tree rises flush from the fixture; the photograph does not reveal the rear
folds, fastening, board grade or thickness. Its artwork is not included in these
assets. The referenced study/archive directory is absent from this checkout.
No original 1993 promotional reference was found/used. Clerk and punch-card
placements remain reference-dependent; no promotional placement or character
sprite was added or changed.

## Delivery

- `tools/models/standee-support.py`: reproducible authoring script.
- `tools/models/standee-support.blend`: editable Header and Floor construction
  collections. Header visible initially; unhide Floor to edit the taller variant.
- `public/models/standee-support-header.glb`: installed shallow deck support.
- `public/models/standee-support-floor.glb`: reusable floor easel, delivered but
  deliberately not placed without a referenced promotional composition.
- `tools/models/standee-support-metrics.json`: per-part topology/UV/triangle audit.

Rebuild from the repository root with an absolute script path (the local Flatpak
Blender launcher does not preserve the shell working directory):

```sh
blender -b -P "$PWD/tools/models/standee-support.py"
```

## Physical and rendering contract

Coordinates are feet. Blender `(x, -store_z, height)` exports to glTF/store
`(x, height, store_z)`. Origin is the center of the cutout's base. Print faces
remain at local Z ±0.006 ft; construction projects into negative local Z.
The header mesh bounds are X ±0.58, Y 0–1.20, Z −0.078 to −0.006 ft.
The floor version is X ±0.58, Y 0–3.00, Z −0.858 to −0.006 ft.
These are designed dimensions, not photo measurements. Board web thickness is
0.012 ft (3.66 mm); score/foot stock is 0.008 ft (2.44 mm).

Two triangular easel webs join narrow glue flanges. Continuous scored returns
form feet at Y=0. A die-cut bridge's tongues pass through actual punched slots;
its wider central shoulders seat inside the webs. Exposed zigzag flute ribbons
under the foot edges communicate corrugation without a texture atlas. Separate
parts remain editable and are manifold; no photographic backgrounds or artwork
are baked into the GLBs. Smart-projected UV islands cover every exported part.
Material roles are `KraftLiner`, `CorrugatedCutEdge`, and `CompressedFold`.
All are unbranded, rough nonmetallic paper roles; no theme-colored finish needed.

At the existing collection-endcap consumer, the support origin sits at core
height 4.6 ft in the existing 180°-rotated kit group. The tree retains its
1.9008 × approximately 3.89 ft size and base at 4.6 ft. The shallow feet fit on
the existing 0.14 ft deep core within its approximately 1.348 ft top width:
world-in-fixture X ±0.58, Z −0.034 to +0.038 ft. No riser, floor collision,
navigation obstacle, stock slot, browse target or placement offset is added.
The taller floor variant is a separate asset, not a stretched header mesh.

The existing alpha-tested front and mirrored-back planes stay in place. A
runtime edge follows their alpha contour (including holes); the shared
`alpha-trace.ts` utilities receive a transparent apron so image-edge contours
close correctly. Three depth bands distinguish liners from core. The edge has
UVs along perimeter/depth, no texture, and no opaque rectangular backing.
User art replacement retraces the edge and disposes its predecessor. Empty or
tainted alpha yields no backing rather than filling the silhouette. The existing
face and gift-tag art loaders, texture ownership, and collection card remain.

`installDisplayModel` supplies the established base-URL resolution, load-error
fallback, cancellation, late/detached resource disposal, and render/shadow
refresh. The two original printed faces remain visible on load failure. The
construction cleanup runs before the endcap's normal mesh traversal, avoiding
double disposal; its own cleanup is idempotent. Seasonal eligibility and all
store-fixtures configuration remain unchanged.

## Cost and verification

Each GLB: 660 triangles, 9 named physical parts, 14 material draw primitives,
3 materials, zero textures, 49,404 bytes for the header and 49,308 for the floor. The installed header
plus traced edge costs 1,314 triangles / 15 draw primitives (654 edge triangles,
one extra material). Its contour-dependent cost is recorded in
`runtime-cost.json` with the inspected photographs. No new per-frame animation.

`tests/standee-model.test.ts` checks both exported assets' transformed bounds,
UVs/normals, named roles, feet contact and resource ceilings. The authoring script
checks manifoldness for every solid part. `tools/check-standee-lifecycle.mjs`
exercises successful loading, missing asset, teardown before arrival, detached
arrival, repeated disposal, silhouette replacement, and September/December gates.

In-store photography uses the existing StoreScene/verify-bollards harness pattern:

```sh
node tools/verify-standee.mjs /path/to/outbox after
```

Before views must be taken on the prior implementation. Both runs use deliberate
corporate / hv-90s / December settings, a synthetic unbranded Winter Tales
collection, and no private user assets. Front, rear, edge and deck-join views
show the actual consumer. Transparent front/edge/back assembly views and floor
rear/locking details supplement these; they do not replace in-store inspection.
The verification outbox/report is `/home/devin/mognet-workers/out/astra-halcyon-243`.

## Inspected views

[Before: deck join](screenshots/standee-construction/before-join.png) ·
[After: deck join](screenshots/standee-construction/after-join.png) ·
[In-store edge](screenshots/standee-construction/after-edge.png) ·
[In-store rear](screenshots/standee-construction/after-rear.png) ·
[Transparent front](screenshots/standee-construction/alpha-front.png) ·
[Transparent back](screenshots/standee-construction/alpha-back.png) ·
[Transparent edge](screenshots/standee-construction/alpha-edge.png) ·
[Floor easel](screenshots/standee-construction/floor-rear.png) ·
[Locking detail](screenshots/standee-construction/floor-lock.png).

The transparent kit views omit the separately mounted collection card so the
joinery can be inspected; the in-store views include the actual card. Transparent
floor views show the unplaced reusable support only, without a promotional print.
