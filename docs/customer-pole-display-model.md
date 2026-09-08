# Customer VFD pole display

An original generic early customer-display design replaces the procedural pole
and box in `src/fixtures/counter-props-93.ts`. It is not an exact reproduction
of a named manufacturer. The existing scene envelope and message were the
proportion/placement reference; no external mesh, photograph, texture or brand
art is incorporated.

## Editable source and export

- `tools/models/customer-pole-display.blend`: named physical parts, editable
  meshes, UVs and triangulation modifiers.
- `tools/models/customer-pole-display.py`: reproducible scripted Blender mesh
  authoring. Run `blender -b -t 2 --python tools/models/customer-pole-display.py`.
- `public/models/customer-pole-display.glb`: one assembled object, five material
  primitives, 1,942 triangles and 112,152 bytes; no image textures.

The model has a weighted foot with an eased cover and non-slip sole,
telescoping pole, rolled adjustment collar, swivel neck, tapered split case,
recessed lens lip and gasket, rear screws and a rear-facing cable route seated in a counter-entry grommet.
The authoring script checks closed manifold solids. The case deliberately
retains the 20-edge lens aperture for the separate runtime display surface.
The cable is capped. Smart-projected UV islands suit the neutral solid finishes;
no texture is baked into the model. Parts remain separate in the Blender file
and are combined for export into five material batches.

Material roles are `VFDHousing`, `VFDPole`, `VFDRubber`, `VFDRecess` and
`VFDFasteners`. These neutral equipment finishes do not encode store branding.
The existing separately named `customer-vfd-message` plane retains its cached
1024 by 224 canvas and cyan promotional message. It contributes one draw call
in addition to the model's five; the GLB adds no texture allocations. The
procedural pole/head remain allocated as the loading/error fallback but stop
drawing after installation.

## Coordinate and attachment contract

Units are store feet. The origin is the bottom centre of the weighted foot;
X runs across the display, Y is up and local +Z faces the customer. Blender
coordinates `(x, -store_z, height)` export to those axes without runtime scaling.
The export bounds are 1.10 feet wide, 1.34 feet tall and 0.391 feet deep
(including the cable). Its top remains at the original head's height.
The case is 1.10 by 0.40 feet; the original 0.98 by 0.29-foot message surface
stays centred at local Y 1.14, Z 0.085. The rim is at Z 0.096, so the display
sits inside the lens recess rather than floating over the case.

Placement still uses `getCounterTopAnchor(cx - 1.5)` with `rotY + Math.PI`.
No counter, navigation, collision, printer, terminal or bag anchors change.
The parent format's existing `counterDressing` gate remains authoritative;
independent-shop format does not acquire a new pole display.

The standard base-path resolver loads the GLB. Success hides only the fallback
housing, refreshes shadows and requests a frame. Failure preserves the complete
procedural display. A model arriving after the parent was removed disposes its
owned geometries and materials immediately. Normal signage teardown owns both
loaded and fallback geometries/materials; the existing module-cached message
texture survives rebuilds. There are no GLB-owned textures to release.

## Verification

The project build (including TypeScript and repository guards) and all six
counter-terminal tests pass. Blender's manifold checks pass; inspection of the
export confirms five material primitives, UVs on every primitive and no images.
In-store front, side and rear photographs were inspected at high quality.
Shield, rounded shield and U-square placements were exercised; model bounds
remain disjoint from both terminals, the impact printer and a conservative
2.2-foot-wide envelope around the checkout bag. The closest horizontal
terminal clearance in these layouts is about 0.813 feet (U-square).

The local scene harness also exercised failed loading, successful replacement,
removal before loading completes, and normal signage teardown. The procedural
message/housing survive failure; late model geometries are released; success
hides the fallback; teardown releases model geometry without disposing the
shared message texture. The original procedural fallback supplies the before
photograph at the same anchor and camera as the authored model.
