# Checkout counter millwork

The front counter loads an original Blender-authored GLB, with shield, U-square,
and standalone desk variants in laminate and rounded profiles. The editable
source is `tools/models/checkout-counter.blend`; collections hold each variant.
Only the shield laminate collection is visible when the file opens.

Each cabinet is a closed, welded mesh. Its cross-section contains the recessed
toe kick, eased panel edges, under-top reveal, contrasting inlay, rolled worktop
edges, and clerk-side finger rail. Narrow panel joints are recessed into the
surface. There are no overlapping box solids or floating trim strips. Material
boundaries split the mesh into glTF draw primitives during export, but the
authored cabinet topology remains continuous. The generator checks every edge
for manifoldness before export.

Regenerate with Blender installed:

```sh
blender -b -t 2 --python tools/models/checkout-counter.py
```

The script saves the Blender source and all six GLBs. Model units are feet,
matching the store. Blender coordinates `(x, -store_z, height)` export directly
to Three.js coordinates. Shield/U-square origins are `cx = 0, backZ = 0` from
`src/entrance/counter.ts`; the desk origin is the centre of its customer-facing
edge and its depth points along local positive Z. No bounding-box fitting or
rescaling is used at runtime.

The outer top remains at 3.54 feet and the inner work surface at 2.82 feet.
Counter navigation, staff gaps, collision shapes, terminal placements and bag
anchors still come from `counter.ts`. The original simple solids serve as the
collision rig and loading/error fallback; they are hidden when the GLB arrives.

`CounterBody`, `CounterTop`, `CounterInlay`, and `CounterWorktop` materials are
replaced with the active theme's finishes at load time. UVs follow the run and
the millwork section. Neutral plinth/reveal finishes stay with the model. The
loader refreshes shadows after installation and releases model resources if
the entrance is removed, including requests finishing after a rebuild.
