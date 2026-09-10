# Commercial streetscape

An original, approximate roadside shopping center for high render quality.
Distant shops are flat opaque facade cards; the two nearby shops retain shallow
side returns, roofs and canopies. Broadleaf tree silhouettes use fixed cards,
with crossed cards at the sides. This is scenery for views from inside the
store, its sidewalk and service court, not a surveyed or aerial environment.

Store coordinates are feet: X runs along the frontage, Y is height, +Z points
out through the front glass. The asset is centered on STORE_CENTER_X. The road
ends at Z=90; opposite storefronts start at Z=180–182, behind two parking rows.
Side shops sit beyond the store lot. Collision and navigation bounds are unchanged.

The rear batch is authored around Z=0 and moved to backWallZ minus 24 feet when
loaded. It contains a seven-foot masonry service boundary, low utility-building
facades and trees beyond it. The ground sheet extends from backWallZ minus 80
feet to Z=255, so growing the store cannot leave the rear court off the pavement.

Blender source and the reproducible script are in tools/models; the runtime GLB
is in public/models. Four opaque batches group vertex-painted colors: Frontage,
Windows, Ground and Rear. There are no image textures, alpha blending, dynamic
lights, shadow casting or per-frame animation. Both sides of the intentional
open cards render. Mode changes tint the scenery and adjust front window glow.
The sky is a tiny generated gradient. Exact export counts are in
commercial-streetscape-metrics.json.

Effective quality must be high before requesting the model or allocating its
sky. Medium and low keep their existing environment. Async completion requests
a render; disposal releases owned geometry/materials and discards late loads.

Publication captures use `--quality high --settle 1` in a user-assets-free tree.
Useful street-level poses: `--fly 1 --walk -15,8,180,0,5.5` (out the window),
`11,30,180,0,5.5` (lot toward shopping center), and `11,65,0,0,5.5` (storefront).
For the rear, stand eight feet behind the current backWallZ, facing yaw zero.
Avoid distant aerial framing and views behind the scenery cards.
