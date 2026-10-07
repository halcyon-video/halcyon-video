# Wooden bookcases and single-faced game shelving

The existing original shelf kit now includes closed positive-X half-depth
uprights, end panels and feet. These retain their full counterparts' outer
profiles and edge easing, with a capped centre cut authored in Blender.
`tools/models/shelf-components.py` reproduces the editable blend and the shared
runtime GLB. The loader continues to use local mesh coordinates; the spread-out
editor positions are not placement transforms.

Single-faced game units use the half-depth panels. The wire construction uses
its existing steel standard, shifted into the positive half, and the new half
foot. Full-depth units keep their existing components. Platform bays, shelf
heights, blade cards, capacity, case selection and collision anchors remain
owned by the existing layout and stocking code.

Independent-shop wall boards reuse the authored FinishedPanel profile and lower
backrests at the shop's actual dimensions. The asynchronous replacement retains
the existing taper and sloped support plane. A recessed toe fits below the
bottom deck. The corporate eight-tier model remains separate from the wooden
shop's own layout. Concealed routed joints and internal hardware are omitted.

Physical UVs put grain along deck spans and upright heights. Unprinted wooden
cap groups receive vertical grain; the printed front keeps its normalized UVs.
Indexed geometry is split before group-specific mapping so a shared corner
cannot alter the adjacent artwork. Backing boards use wood finish on physical
UV0 and the existing bay-shade image as linear AO on normalized UV1.

The shared kit is 104,988 bytes, with 19 parts and 1,348 template triangles.
The three added parts total 356 triangles: upright 104, end panel 236 and foot
16. No image assets are added. Repeated construction retains the existing
merged-mesh batching and ownership; missing or late loads retain the original
fallback and do not revive disposed geometry.

Verification covers source bounds, finite UVs and normals, positive-X half
parts, physical grain scale, unchanged printed UVs, independent backing shade
coordinates, and loaded/missing/disposed board replacements. In-store evidence
uses the existing synthetic packaging fixtures for a carton, a single-disc jewel
case and a PlayStation 2 keepcase; it does not present generated inserts as scans
of commercial artwork. The private shelf-completion publicity folder holds the
stocked phone views and exact runtime measurements.
