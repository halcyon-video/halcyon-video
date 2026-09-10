# Corded counter telephone

Original generic beige telephone, authored in Blender with intentional swept
handset sections, a fitted sloping enclosure, boolean keypad wells, cradle
saddles, rubber feet and a continuous 13-turn cord with strain reliefs.
No external artwork, mesh, trademark or owner photograph is used in this public
model. It is not an exact commercial-product replica.

## Source and runtime contract

- Rebuild: `blender -b -t 2 --python tools/models/counter-telephone.py`.
- After rebuilding geometry, bake surfaces:
  `blender -b -t 2 --python tools/models/bake-telephone-surfaces.py -- tools/models/counter-telephone.blend public/models/counter-telephone.glb`.
- Editable source: `tools/models/counter-telephone.blend`. Named physical parts,
  UV islands, triangulation modifiers and material roles remain editable.
- Runtime: `public/models/counter-telephone.glb`; measured cost is also in the
  adjacent JSON. Joined by material for four live draw batches; two embedded occlusion images, with no separate texture requests.
- Feet, origin at countertop; Blender `(x, -store_z, height)` exports to runtime
  X right / Y up / +Z toward the keys. Housing is 0.55 × 0.40 feet; complete
  assembly including cord is 0.6391 × 0.2786 × 0.4000 feet (runtime XYZ).
- 5,802 live triangles, four live materials, 532,324 bytes. Material roles are PhoneHousing,
  PhoneHandset, PhoneKeys and PhoneRubber. UVs and normals exist on every
  exported primitive. All source mesh edges pass manifold checks.
- The existing counter-props-93 yaw and clerk-side offset are retained. The
  shorter U-shaped island uses +4.6 feet along its top instead of +5.3, which
  left the old phone beyond its edge. Shield placement stays at +5.3.
  No interaction, navigation, fixture registry or era gate changes. The phone
  remains static, and only appears where the existing counter dressing appears.
- Public handset connector: `(-0.25, 0.20854, -0.103)`; base connector:
  `(-0.273, 0.061, 0.10)`, runtime feet. The continuous cord centerline meets
  those sockets exactly; its coil amplitude tapers to zero at the ends.

## Optional local variant

The loader follows active brand-pack then flat user-assets precedence at
`fixtures/late-era-fixtures-2012/telephone/model.glb`, before trying the original
public model. This lets a local equipment variant occupy the same anchor;
installing it does not add a phone to other eras. The source-backed black
multi-line variant, authoring script, source and provenance are local-only.
Consult the local variant’s NOTES.md for its measurements and provenance.

## Verification

The build passes, including TypeScript, file-budget, provider-boundary and
signage checks. Loader checks exercised subpath URLs, missing optional and public
assets, fallback retention, successful placement and render/shadow refresh,
texture removal, disposal of a late result after detachment, and suppression of
retries after detachment. Source manifold checks and exported UV/normal/bounds
checks passed for both models.

Inspected before/after in-store views and close side/rear views are retained
locally in `scratch/publicity-kits/issue-178/`. Public beige-phone photos were
captured without local drop-ins; black-phone photographs are private evidence.
The side view resolves both cord joints and cradle contact, with visible space
between the phone and the register sign. No release or service restart is part
of this static fixture change.

## Material and contact bake

Cycles bakes the actual assembled mesh at 256 samples into a 512-square
occlusion image. A temporary 1.5-foot-square worktop receiver produces a
256-square contact image. The loader removes this receiver before attachment
and projects its AO onto the real counter's horizontal worktop using UV2.
Vertical edges and lower surfaces do not receive it. This is ambient occlusion,
not a sun shadow or painted albedo: the standard material applies it to indirect
light while direct scene lights remain active. Loading either model first is
supported; removing the phone restores the original counter finish and UVs.

Housing, handset, keys and rubber have roughness 0.40, 0.30, 0.43 and 0.82.
One shared 128-square procedural height map adds molded grain at 0.238 mm per
texel, using an independent, physically scaled UV1. Existing authored local
normal, bump, color and roughness maps are preserved. A local model without the
bake receiver still loads normally. The same bake command can process a local
source into its own user-assets directory; private derivatives stay there.

The counter's laminate maps now repeat isotropically at one foot per tile.
Its existing roughness map modulates the former satin finish (0.69 multiplier
on a map averaging 0.65, approximately 0.45); theme colors and alternate top
finishes remain intact. Normal strength remains 0.25. Neither store exposure
nor scene light intensity changes. Live phone/counter triangles and draws are
unchanged. Additional mipmapped RGBA texture storage is approximately 3.08 MiB:
phone AO, worktop AO, grain, and the previously unused laminate roughness map.

Issue 296 evidence is retained in `scratch/publicity-kits/issue-296/`: public
close/browsing day/night views, low and automatic-mobile quality, and independent
light-contribution captures. Build, projection/teardown checks and existing loader
lifecycle checks pass. The mobile path selects medium without screen-space AO;
its desktop Radeon trace recorded 16.7 ms median / 16.9 ms p99 and no hitches or
new programs. This is not physical-phone FPS evidence.
