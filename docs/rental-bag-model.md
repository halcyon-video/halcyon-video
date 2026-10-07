# Deformable rental-bag source

The checkout bag now consumes an authored Blender rest mesh while retaining its
340-node cloth lattice, live print, item collisions, pickup and exit choreography.
The side gussets leave the central print panel relatively clean. The die-cut
handle keeps its existing position and alpha mask. A sealed bottom film adds
22 triangles, for 646 total; no interior hardware or additional simulation nodes
are introduced.

Source: `tools/models/rental-bag.py` and `rental-bag.blend`. Preview/export:
`public/models/rental-bag-rest.glb` (18,884 bytes). Runtime binding:
`src/model-data/rental-bag-rest.json`. The runtime uses that small compiled data
file instead of loading a rigid GLB. Data is applied before constraint rest
lengths are calculated. A dimension/node mismatch retains the built-in shape.

One unit is one foot. Blender `(x,-store_z,height)` maps to runtime Y-up. The
bag is 1.6 feet wide and 1.76 high; bottom pins remain at .02 and the mouth at
1.42. Node IDs 0–168 are the front grid, 169–311 the back-sheet interiors, and
312–339 the two handle flaps. Side seams share solver nodes; runtime UV seams
use separate render vertices. The live print UVs remain unchanged.

Run Blender in background mode with two threads, `--python-exit-code 1` and
the absolute script path. To export sculpted source positions, append
`-- --from-blend /absolute/path/to/rental-bag.blend`. Preserve the 340
`solver_node` identities, topology and anchor dimensions. The exporter extracts
the runtime positions from the actual mesh. The unbranded GLB preview includes
a generated white handle-cutout mask; the application retains its own print.

Two existing issues found during verification were corrected. Sleep now measures
the final constrained pose instead of temporary integration movement cancelled
by pins. Its original maximum-displacement threshold is unchanged. Tilted item
colliders now account for their padded extents and actual geometry centre when
seated above the bottom weld, preventing impossible floor contacts.

Verification covers empty, DVD, off-centre VHS, two-DVD, candy, mixed and full
payloads, visible-item containment, handle lift, laydown, reset and resource
ownership. Sleeping, checkout-frozen and hidden states make zero geometry writes.
All seven payloads, including the two-DVD stress load, now settle naturally.
Standing edge-midpoint contacts exclude edges incident to the bottom weld:
translating both ends of those edges fought the counter pin each solver step.
Lifting and repinning retain their existing contact coverage. The maximum-node
sleep threshold remains .0016 feet for more than 30 quiet steps; no collision
envelope change, forced resting freeze or relaxed sleep threshold is used.

In-store before/after and lifted views, physics reports and build output are
retained in `scratch/publicity-kits/rental-bag` and
`scratch/publicity-kits/bag-contact-253`. These are desktop-rendered captures,
not physical-device performance measurements.
