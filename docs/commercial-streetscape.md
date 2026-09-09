# Commercial streetscape

An original, approximate roadside shopping center for high render quality. This
is a shallow stage for views through the store windows and from the sidewalk,
not a surveyed reconstruction or an aerial world. Store coordinates are feet:
X runs along the frontage, Y is height, +Z points out through the front glass.
The asset is centered on STORE_CENTER_X. The existing road ends at Z=90; the
opposite storefronts start at Z=180–182, behind two parking rows. Side shops
sit outside the existing store lot. No collision or navigation bounds change.

Blender source and reproducible authoring script are in tools/models, with a
runtime GLB in public/models. Geometry is grouped into six opaque material
batches, about 4,000 triangles; no image textures, dynamic lights, shadow
casting or per-frame animation. Vertex colors provide static surface shading;
mode changes adjust the overall tint and windows. The sky uses a tiny generated
gradient rather than unrelated photographic ground. Exact costs are reported
in commercial-streetscape-metrics.json.

The resolved effectiveQuality must be high before the model request or sky
texture allocation. Medium and low keep their existing environment. Async
completion requests a render; disposal releases owned geometry and materials,
and an in-flight completion after teardown is discarded and released.

Publication captures use `--quality high --settle 1`. Useful street-level
poses: `--fly 1 --walk 11,8,180,0,5.5` (out the window),
`11,30,180,0,5.5` (lot toward shopping center), and `11,65,0,0,5.5`
(close storefront). Avoid distant aerial framing that exposes the stage edge.
