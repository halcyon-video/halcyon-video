# Recessed round downlight housing (#286)

Original Blender hardware modeling upgrades the procedural ring and circle downlights
in the front ceiling soffit (`plainWhite: true` / bb-2000 format) with an authentic
commercial recessed luminaire ("can light").

## Construction and coordinate contract

- **Units:** Imperial feet (`scale_length = 0.3048` m).
- **Origin:** Center of ceiling cutout aperture at the ceiling surface plane (`y = 0`).
- **Orientation:** glTF Y-up. Negative Y extends down into the customer sales floor
  space (`y = -0.015` ft trim flange drop); positive Y extends upward into the
  interstitial plenum space above the drywall slab (`y = +0.55` ft can depth).
- **Dimensions:**
  - Aperture diameter: 7.68 inches (`radius = 0.32` ft).
  - Trim outer flange diameter: 9.84 inches (`radius = 0.41` ft, providing a 0.09 ft flange lap over the drywall cut).
  - Trim lip drop: 0.015 ft (3/16 inch) proud of ceiling underside.
  - Recess depth: 0.28 ft (3.36 inches) from ceiling plane to lamp lens.
  - Upper housing plenum depth: 0.55 ft (6.6 inches) cylindrical enclosure.
  - Bar hanger channel span: 1.5 ft width for joist/T-bar mounting.
  - Junction box: 0.25 × 0.25 × 0.22 ft with service access cover plate.
  - Conduit whip: 0.03 ft diameter metallic flexible conduit with 90-degree bend into junction box.
- **Named Components:**
  - `Stepped_trim_ring`: Outer beveled flange, stepped baffle contour, and inner aperture lip.
  - `Recessed_reflector_bowl`: Deep parabolic reflector bowl recessing upward into housing.
  - `Lamp_seat`: Stepped cylindrical socket neck and lamp retainer ring.
  - `Bright_lamp`: Recessed parabolic lamp face and lens.
  - `Upper_housing_can`: Galvanized steel cylindrical enclosure with rolled top and wireway knockout.
  - `Mounting_frame`: Plaster mounting plate and dual bar-hanger channel guides.
  - `Junction_box`: Attached galvanized utility junction box with cover plate.
  - `Conduit_whip`: Curved flexible metallic armored whip routing into top of junction box.
- **Material Roles:**
  - `DownlightTrim`: Dark charcoal die-cast painted trim ring (`color = #2a2a2c`, roughness 0.65, metalness 0.15).
  - `DownlightReflector`: Specular spun anodized aluminum reflector bowl (`color = #e0e0e0`, roughness 0.22, metalness 0.85).
  - `DownlightLamp`: Emissive warm-white lamp face (`color = #ffffff`, emissive `#fff4e0`, emissive intensity 2.4, marked `selfLit(..., 'light-source')`).
  - `DownlightCan`: Galvanized steel upper housing, bar hangers, junction box, and armored whip (`color = #8f9298`, roughness 0.52, metalness 0.75).
- **Topology:**
  - 100% closed, manifold solid components (`is_manifold` passes for all edges).
  - Seamless UV coordinates unwrapped across all parts; no external bitmap textures required.

## Runtime integration

- **Integration Module:** `src/downlight-model.ts` exports `installDownlightModels`, constants for dimensions (`DOWNLIGHT_APERTURE_RADIUS`, `DOWNLIGHT_TRIM_RADIUS`, `DOWNLIGHT_CAN_DEPTH`, `DOWNLIGHT_TRIM_DROP`), and lifecycle management.
- **Soffit Ceiling Integration:** In `src/ceiling-soffit.ts`, when `plainWhite: true`:
  - Circular holes of radius `0.32` ft (`DOWNLIGHT_APERTURE_RADIUS`) are cut directly into the soffit slab geometry (`shape.holes.push(hole)`), allowing customers looking upward to look into the recess rather than a flat painted drywall face.
  - Hardware models are instanced at the verified fixture coordinates using shared geometries and materials.
  - Lamp materials are registered with `selfLit(..., 'light-source')` so the store lighting and emissive audit passes cleanly.
- **Fallback & Teardown Contract:**
  - A procedural `downlightFallback` group containing dark trim rings and emissive discs is displayed immediately until the 3D models load.
  - Upon successful load, fallback visibility is set to `false`. If loading fails, the procedural fallback remains visible so the store is never left dark.
  - Geometry and material resources are registered and disposed cleanly upon fixture or scene detachment.

## Resource costs and metrics

- Rebuild script: `tools/models/recessed-downlight.py`
- Blender source: `tools/models/recessed-downlight.blend`
- Runtime asset: `public/models/recessed-downlight.glb`
- Metrics: `tools/models/recessed-downlight-metrics.json`
- Triangle count: 1,736 triangles across 8 components merged into 4 material primitives.
- File size: 71,172 bytes.
- Textures: 0 external images.

## Verification

- Blender authoring and manifold checks: `tools/models/recessed-downlight.py`
- Model asset assertions: `tests/downlight-assets.test.ts`
- Soffit integration and clearance tests: `tests/downlight-integration.test.ts`
- Headless visual render check: `tools/verify-downlight.mjs`
- Full test and build suites: `npm test && npm run build`
