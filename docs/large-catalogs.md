# Large catalogs

The 3D store keeps all carried libraries and the video game department on the
same floor. Catalog size must not replace departments with a page of titles
or add a separate screen-level search form. Search remains at the counter.

Stock construction yields between mesh batches and every 96 aisle entries.
`StoreScene.ready` resolves after stock and interaction initialization; callers
must await it before using navigation or waiting on `texturesReadyPromise`.
Initial instance placement admits at most 96 slots or 2ms of work each frame.
Selected and animated cases continue independently of that initial-placement budget.

Artwork startup waits for at most 96 nearby previews. Browsing requests at most
24 additional artwork promotions per LOD update, from nearby projected-visible
slots. Every 100ms, aisle batches select detailed materials within 28 feet,
plain spine silhouettes farther away, or disappear beyond 80 feet. Distance is
measured from batch bounds; the selected batch remains detailed. Three.js also
frustum-culls individual batches. Rental backstock is hidden at the silhouette
level. These limits apply to phone and desktop browsing.

Verification must exercise a multi-library catalog larger than 600 titles,
including entry into later libraries, games, search, and repeated era changes.
The complete floor is no longer bounded to 600 titles; a 30k+ catalog still
needs measured memory, startup and frame-time validation on target hardware.
The batching and culling budgets above do not establish a hardware FPS result.
