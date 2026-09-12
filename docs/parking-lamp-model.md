# Parking-lot lamp family

`public/models/parking-lamp.glb` replaces the two simple pole/head fixtures in
`src/exterior-environment.ts`. This is an original generic shoebox luminaire,
not a claimed historical fixture replica. All dimensions beyond the existing height/anchors are
estimated design dimensions; no external geometry or texture was used.

Rebuild with Blender 5.2:

```sh
blender -b -t 2 -P "$(pwd)/tools/models/parking-lamp.py"
```

The editable `tools/models/parking-lamp.blend` retains 35 named physical parts.
The generator validates manifold edges and nonzero face areas, recalculates
normals, and unwraps each part with packed UV islands. The runtime export batches
parts by four material roles; no texture images, lights or animations are exported.

## Dimensions and construction

Numeric units are feet, matching the store; Blender's display scale is 0.3048 m.
Blender `(x, y, z)` exports to store `(x, z, -y)`. Origin is the pole center at
asphalt height. The short arm points along local store -Z, toward the stalls and
storefront. No runtime scale fitting or recentering is applied.

- Overall bounds: 0.78 ft wide × 13.2835 ft high × 2.0465 ft deep.
- Ground pad: 0.65 ft square; 0.64 ft square anchor plate, four exposed
  stud/washer/hex-nut assemblies, and a welded shaft socket.
- Hollow square shaft tapers from 0.26 to 0.17 ft, ending at 12.98 ft.
  A real service opening sits behind a gasket and removable screwed cover.
- Flanged mounting arm seats at source `(0, 0.562, 12.85)`.
- Hollow cast housing: 0.78 × 1.14 ft plan with sloping shoulder and sealed lid.
  Lens center is source `(0, 1.132, 12.88)`, store `(0, 12.88, -1.132)`.
  Separate recessed lens, gasket, retaining screws, hinge and latch make the
  underside and service construction readable. Parts are editable but static.

`PoleFinish` maps to the existing exterior pole finish. `LampLens` maps to the
existing shared self-lit head material. `FastenerMetal` and `SealRubber` retain
their authored finishes and receive the exterior environment clamp. UVs support
future per-role finishes; no new theme settings or interactions are introduced.

## Integration and lifecycle

The roots remain at `centerX ± 13.5`, `FRONT_GLASS_Z + 47`, y=0. These are the
existing stall boundaries. Navigation and parked-car placement are unchanged.
The original pole and box head stay visible until the single shared GLB load
succeeds, and stay visible on failure. Both instances share four geometries and
four live material roles. The parent exterior owns the pole/lens materials;
the model installer owns imported resources and detaches its instances on
teardown. Late results release their resources without entering a removed scene.
Repeated disposal is safe. Installation invokes the existing exterior callback,
which queues structural shadows and wakes rendering.

Pools remain 18 × 18 ft at the original roots, y=-0.02, with the original texture,
additive material and opacity. Day/sunset/night retain lens intensities
0.05/2.2/3.2 and pool opacities 0.04/0.15/0.5. No real lights or per-frame work
were added. The arm's modest lens offset does not move the existing baked pool.

## Cost and verification

The GLB is 179,568 bytes, 4,958 exported vertices, 2,598 triangles, four draw
primitives and zero textures.
Two installed lamps use eight draws and 5,196 triangles with shared geometry.
The original two pole/head fixtures used four draws and 88 triangles. Ground
pools remain two draws/four triangles; hidden fallback geometry remains allocated
until exterior teardown and is now explicitly disposed along with pool geometry.
See `tools/models/parking-lamp-metrics.json` for per-role source mesh counts.

`tests/parking-lamp.test.ts` parses the shipped GLB and checks bounds, orientation,
UVs/normals, roles, budget, shared resources, live lens remapping, fallback,
render refresh and normal/late/repeated teardown. `tools/verify-parking-lamp.mjs`
uses the existing StoreScene photograph harness pattern, with deliberate demo,
corporate/2000, low-quality, day/sunset/night settings, and takes in-store, lot,
side, rear and base views. Run it with an output directory and `before`/`after`
label. The before pass is captured before integration. Verification photographs
and test/build logs are delivered in the issue outbox rather than public assets.

Use `comparison` in place of the label to photograph the preserved fallback and
installed asset in the same scene, with fixed sky and sun overrides. This pass
also includes the lens underside. `--checks-only` checks both 40- and 80-foot
store widths, anchors, pool dimensions, all mode values, instance cost and
teardown without booting the full store. Set `LAMP_PORT` to isolate concurrent
verification servers (default 6264).
