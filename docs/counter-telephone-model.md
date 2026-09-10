# Corded counter telephone

Original generic beige telephone, authored in Blender with intentional swept
handset sections, a fitted sloping enclosure, boolean keypad wells, cradle
saddles, rubber feet and a continuous 13-turn cord with strain reliefs.
No external artwork, mesh, trademark or owner photograph is used in this public
model. It is not an exact commercial-product replica.

## Source and runtime contract

- Rebuild: `blender -b -t 2 --python tools/models/counter-telephone.py`.
- Editable source: `tools/models/counter-telephone.blend`. Named physical parts,
  UV islands, triangulation modifiers and material roles remain editable.
- Runtime: `public/models/counter-telephone.glb`; measured cost is also in the
  adjacent JSON. Joined by material for four draw batches, no texture requests.
- Feet, origin at countertop; Blender `(x, -store_z, height)` exports to runtime
  X right / Y up / +Z toward the keys. Housing is 0.55 × 0.40 feet; complete
  assembly including cord is 0.6391 × 0.2786 × 0.4000 feet (runtime XYZ).
- 5,802 triangles, four materials, 300,896 bytes. Material roles are PhoneHousing,
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
