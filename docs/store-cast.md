# Halcyon regulars and second clerk

Eleven new original identities join the existing chestnut-bob clerk. They use the
approved large-eyed, cel-shaded character direction. All live store characters
remain directional flat sprites, rendered from genuine skinned Blender models.
The store does not load these 3D source meshes.

## Cast

| Identity | Distinguishing design | Target height (feet) |
|---|---|---:|
| Clerk B | Black quiff, teal polo or pale Oxford, khakis | 5.65 |
| Customer 01 | Silver-streaked curls, orange jacket, charcoal trousers | 5.25 |
| Customer 02 | Older man, gray moustache, burgundy sweater vest | 5.65 |
| Customer 03 | Black bob and glasses, mustard sweater, red sneakers | 5.05 |
| Customer 04 | Stocky red-haired bearded man, plaid shirt, work boots | 5.65 |
| Customer 05 | High natural puff, plum bomber, white high-tops | 5.85 |
| Customer 06 | Long brown hair, thick stubble, maroon T-shirt, brown vest and jeans, low brown harness boots with chains, black flaming skull on left forearm | 5.90 |
| Customer 07 | Older woman, silver bun, rose cardigan | 5.05 |
| Customer 08 | Side-parted black hair, teal/navy windbreaker, cargo trousers | 5.40 |
| Customer 09 | Copper braid, green overshirt, brown trousers | 5.80 |
| Customer 10 | Dark moustache, blue/cream bowling shirt | 5.50 |

Store Look provides a clerk identity selector and the existing Polo/Oxford
uniform selector. Primary shirt and secondary trim colours follow the active
brand. Customer settings select three regulars, the full ten, or none; the quiet
roster rotates through all ten across calendar days. Small stores only populate
available safe browsing positions. Empty stores remain unstaffed and empty.

Customers share the established fixture-aware navigation grid. They pause near
the visitor, yield to other regulars, and stand at safe shelf/display stops.
Their simulation sleeps with store inactivity and while visiting the back room.
Textures arriving after teardown are disposed. A missing customer image produces
no opaque placeholder. The new cast adds no interactions that take keyboard or
touch focus away from browsing.

## Authoring and provenance

Each directory in `tools/models/cast/` contains its original reference, preserved
Meshy rigged base, editable packed `character.blend`, model metrics, and sanitized
receipts. The two approved customer identities and approved clerk B are retained;
the eight additional references are original generated designs in the same style.
No credentials or signed download URLs belong in these sources.

References were generated with the built-in image-generation tool. Meshy 7.1
created one textured 30,000-face target per identity and an initial body skeleton.
Blender welds coincident UV-seam vertices, rebinds continuous skin with automatic
weights where Blender can solve them, retains the welded source weights for
vertices whose heat binding fails, normalizes every weight, and corrects the imported bone display lengths.
These are generated bases with scripted Blender authoring, not hand-sculpted
characters. Faces and individual fingers do not have separate animation controls.

Standing and walking use the existing calibrated ACCAD capture retargeter. The neutral hand calibration measures each mesh's palm plane from its weighted skin, distributes wrist roll across forearm and hand, and points relaxed palms toward the thighs. The baked idle and walking checks inspect both palms and floor contact at all 41 samples in each clip.
See `tools/models/motion-sources/README.md` for CC BY 3.0 attribution and the
source captures. The per-character metrics report exactly how many vertices
retain source binding; every finished pose is visually reviewed. Male characters use the steady walk; female characters use the
compact walk. No new procedural leg-swing motion is introduced. Clerk working
poses are authored body poses. The editable file retains grounded idle/walk NLA tracks, and final skinned GLBs
include the same captured clips with their original durations.

The clerk's Oxford is fitted to the same mesh and rig, with long sleeves, a
separate surface-fitted placket, pocket, and buttons. Body, hair, shoes and khakis
remain fixed when the brand changes. A small rental case accompanies stocking.

## Reproduction

Blender 5.2 and the existing Node/browser sheet tooling are used:

```sh
blender -b -t 4 --python-exit-code 1 --python "$PWD/tools/models/build-cast.py" -- customer-01 --render
node tools/clerk-sheet.mjs stitch scratch/cast-render/customer-01/casual/color scratch/cast-render/customer-01/atlas.png --customer
node tools/clerk-sheet.mjs check scratch/cast-render/customer-01/atlas.png --customer
```

After rendering, finalize and validate the reusable animated model:

```sh
blender -b -t 4 --python-exit-code 1 --python "$PWD/tools/models/finalize-cast.py" -- customer-01
```

This saves editable NLA tracks, checks floor contact at every baked sample, and
exports `character-casual.glb` (or both clerk uniform GLBs) beside the Blender file.
Render the production cells from that checked rig and encode the delivery sheet:

```sh
blender -b -t 4 --python-exit-code 1 --python "$PWD/tools/models/render-customer-atlas.py" -- customer-01
node tools/clerk-sheet.mjs stitch scratch/cast-render/customer-01/casual/color scratch/cast-render/customer-01/atlas.png --customer
magick scratch/cast-render/customer-01/atlas.png -quality 92 -define webp:alpha-quality=100 public/textures/cast/customer-01/color.webp
node tools/clerk-sheet.mjs check public/textures/cast/customer-01/color.webp --customer
```

Repeat for customer-02 through customer-10. For `clerk-b`, stitch each of the
`polo` and `oxford` colour/livery directories without `--customer`, then check
both colour sheets. All characters face Blender -Y, Z is up, floor is Z=0. The
billboard canvas spans 6.4 feet; actual heights are recorded above. Most customer sheets
are 2048×1920: five directions and eight columns (idle 2, walk 4, browse 2), with
256×384 cells. Customer delivery sheets use WebP with full-quality alpha; decoded RGBA storage is
15 MiB per identity, except customer 06 as described below (45–54 MiB for the default three, 159 MiB for all ten), without
mipmaps. Clerk sheets retain the existing 4096×1920, 16-column contract.

Clerk A retains its original authored gait, clothing, dimensions and working cells; only neutral hand rotation in its idle and walking frames changes. Customer previews
and source metrics are generated under `scratch/cast-render`; public verification
photographs are retained with the development commit's publicity kit.

API reference: https://docs.meshy.ai/en/api/image-to-3d and
https://docs.meshy.ai/en/api/rigging. One generation cost 30 credits and one initial
rig cost five, for 385 existing credits across this eleven-character batch. No
subscription or additional credit purchase was made.

### Customer 06: left forearm tattoo

An original black-ink flaming skull decal is fitted to the anatomical left lower
forearm using the underlying body's identical skin weights. The packed Blender
source and animated GLB include the editable surface and transparent tattoo art.
`tools/models/customer-six-tattoo.py` reapplies it to an existing checked rig;
`build-cast.py` also reapplies it when rebuilding the character from its base.
Run `finalize-cast.py` afterward to refresh the GLB and animation checks.

Customer 06 has eight separately rendered directions to prevent the tattoo from
swapping arms when turning. Its atlas is 2048×3072 (24 MiB decoded RGBA); use
`--customer --full-directions` for both clerk-sheet stitch and check. Other
customers retain their five-direction 2048×1920 sheets. The generated reference
image and original Meshy base remain preserved as provenance, before the tattoo.

### Customer 06: wardrobe

`tools/models/customer-six-wardrobe.py` fits the brown vest and short maroon
sleeves to the preserved continuous body topology, eases the old rolled cuffs,
adds a surface-bound short beard, tapers brown jeans, and replaces sneakers with
editable leather boot vamps, low shafts, outsoles, stacked heels, harness straps,
side rings and linked metal chains. Every part carries normalized skin weights.
`build-cast.py` applies this wardrobe before fitting the original tattoo. Grounding
uses all actual outfit surfaces, including the new boot heels. The source and
generation references remain the original identity's provenance.

`render-customer-atlas.py` also accepts `clerk-b` to update idle/walking cells in
both uniforms while retaining existing working cells. Split the shipped atlases
into its render directories first, then stitch the complete sheets afterward. To preserve working pixels exactly, use ImageMagick crop and append to join the newly rendered first six columns (1536 pixels) to the original remaining ten columns (2560 pixels), for both color and livery; a browser canvas round trip can change transparent RGB values. Refresh the compressed phone clerk pair and its source receipt whenever the clerk A sources change.
Optional `--source-dir` and `--render-dir` support private installed identities
without mixing their source or sprites into the public character directories.

### Private clerk likenesses

An installed pair at `public/user-assets/clerk/<identity>/<uniform>/color.png`
and `livery.png` overrides only that clerk and uniform. Both atlases must be
4096×1920; an absent or invalid pair falls back to the complete shipped pair.
The coverage mask keeps the selected uniform's brand colors working. Existing
whole-clerk theme/default drop-ins retain their priority. Hosted builds skip
private asset probes through the existing user-assets loader.

Personal photographic references and derived models/atlases stay in the ignored
user-assets tree, never in the public character sources. To author one, use the
existing `build-cast.py -- clerk-b --source-dir <private-source-dir>` option,
optionally `--render-dir <working-render-dir>` and `--render`. Then run
`finalize-cast.py -- clerk-b --source-dir <private-source-dir>`. The source folder
contains its rigged `source.glb` and receives the editable Blender file, both
outfit GLBs and geometry/animation reports. Stitch each outfit's color and livery
passes with the existing `clerk-sheet.mjs` tool before installation.

### Rear collar brand coverage

The polo's raised rear collar uses secondary trim even above the neck joint;
the Oxford maps the same collar surface to its primary shirt material. The
authoring classifier includes that garment band. Shipped coverage includes
rear and oblique collar pixels across idle, walking and working frames, with
the color atlas retained. Private installed identities use the same coverage.
