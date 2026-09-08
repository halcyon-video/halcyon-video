# Fitted ceiling cornice

The perimeter and checkout soffit now use one physical profile and one closed
plan. Each adjoining span ends on the same mitre plane at every profile height,
so the inside corners, stepped wall and checkout V meet without buried overlaps
or triangular holes. The existing layout supplies the plan; no room dimensions
or checkout footprints change.

## Editable source and runtime contract

- `tools/models/ceiling-cornice.blend` contains the original rolled section and
  hidden finished-end pieces. `tools/models/ceiling-cornice.py` reproduces it
  with Blender scripted mesh authoring.
- Run `blender -b -t 2 --python tools/models/ceiling-cornice.py` from the checkout.
- The GLB uses feet, X along its one-foot span, Y vertically below the ceiling,
  and positive Z toward the sales floor. Bounds are X 0–1, Y −2.7–−0.04,
  Z −1.8–0.62 feet. Mating ends intentionally remain open in the exported span;
  the installed closed loop has no exposed ends.
- The authored fascia, eased ledge and recessed mirror seat have separate
  material roles and profile UVs. The runtime supplies lit metal/seat finishes;
  no artwork, texture maps or baked illumination are included.
- Export cost: 5,328 bytes, 32 triangles, three material primitives. A fitted
  installation repeats this profile per run and adds a two-triangle mirror per
  eligible run. Detail does not grow with catalog size.

`cornice-plan.ts` fits the cross-section to shared corner bisectors without
stretching its depth or height. `ceiling-cornice.ts` installs the GLB and retains
a fitted simple loading/error fallback. Removed/disposed scenes reject late
loads; detached source resources are released after installation. The existing
scene owner disposes installed geometry, materials and reflector targets.

Mirrors retain the existing live-reflection eligibility, target sizing and
refresh policy. Their 2.3-foot height and 14-degree tilt now match around the
entire perimeter and soffit. The marquee bulbs follow that same plan and sit
outside the rolled lip, including at the stepped corner.

## Ceiling without the cornice

The suspended tile deck reserves the cornice border only when the format/theme
actually builds it. Mirror-free formats fill that former blank strip with the
same grid, tiles and light/vent spacing as the rest of the ceiling. The solid
stepped-wall notch remains excluded. Physical panels, frames and cornice parts
cast/receive shadows; light-emitting panels retain their distinct light role.

## Verification

- Build passed, including TypeScript, file budget, provider boundary and sign
  slot checks.
- 33 corner/asset and store-format tests passed. They cover different spans,
  stepped/flat plans, square/V corners, perpendicular offsets, GLB bounds, UVs,
  normals, material type and geometry/byte budgets.
- Inspected in-store pictures cover the joined V, its underside/front handoff,
  perimeter, wider square counter, stepped corner and mirror-free ceiling.
  Review captures and logs are retained in the local publicity-kit collection.
- The browser check verifies installed lit/shadowed profiles, rejection and
  resource disposal of a late load, and the visible fitted fallback after a 404.
- Desktop GPU captures establish appearance and placement, not physical-phone
  frame rate. This change does not commission separate new troffer, diffuser or
  acoustic-panel models.
