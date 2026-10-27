# Single-slot return housing (#403)

The second tape-return style, beside the two-mouth interior chute of #219.
A hollow blue laminate saddle caps the return counter: a lettered front panel
hanging almost to the floor, a quarter-round crown over the counter top, side
cheeks the full depth of the band, and a short clip over the staff-side band
top. One opening a little bigger than a VHS case sits below the lettering, with
a tapered pale-metal throat behind it that ends on a dark baffle, and a pale
label plate beneath. There is no flap; the drop ritual slides each case through
the open throat and it vanishes behind the baffle.

## Contract and provenance

Feet, ground origin, width along X, front toward local +Z, counter band face at
Z 0. Blender coordinates are `(x, -store_z, height)` and export directly to
Three.js Y-up. Bounds: X ±1.35, Y 0.35–3.90, Z −1.49–0.345333. The face stands
at Z 1/3 like the chute, so both styles share the entrance anchors in
`src/entrance/index.ts` and the clerk nav footprint formula. The opening is
1.0 × 0.62 ft centred at (0, 2.41, 1/3); the throat narrows to 0.78 × 0.42 ft
at Z 0.06; the baffle sits at Z 0.03–0.05. The crown roll is 0.33 ft; the skin
is 0.14 ft; the rear clip runs Y 2.55–3.47 at Z −1.49. The lower plate is
1.12 × 0.73 ft at Y 1.22–1.95.

Proportions were read as fractions of the housing face off the owner-held
close-up (reference record `lenneth-tape-return-20261012`, circa 2000 by the
owner's estimate, no store location or dimensions): the face is about 0.78 as
wide as tall and hangs from a crown just proud of the counter top almost to the
base trim; the opening sits 0.33–0.51 of the way down and spans about 0.4 of
the width; the lower label 0.55–0.76 down. Those fractions were scaled to the
app's 3.54 ft counter band. The photograph is a single oblique view, so the
width is a judgement, not a measurement. The crown decal in the photo carries a
chain mark and is left off. No photo pixels or branded art are embedded;
`src/entrance/return-housing.ts` paints both "TAPE RETURN" labels at runtime in
the bundled Archivo Black face, sized to the measured ink run (the face is wider
than the photo's grotesque, so the cap height lands a little under the
measured 0.28 ft rather than squeezing the letters).

## Delivery and surfaces

- `tools/models/single-slot-return.py`: reproducible Blender authoring script.
- `tools/models/single-slot-return.blend`: editable named parts (7).
- `public/models/single-slot-return.glb`: runtime mesh, three draws.
- `tools/models/single-slot-return-metrics.json`: geometry and resource cost.

Run Blender with an absolute script path and `-b -t 2 -P`. Material roles are
the chute's: `ChuteLaminate` (recoloured to the theme's counter blue at
runtime), `ChuteSteel` (throat, plate), `ChuteReveal` (baffle), with the same
packed fine-grain normal and roughness images.

## Integration

`StorefrontSpec.returnStation` (`'return-tapes-here' | 'single-slot'`, from
`StoreFormatSpec.returnStation` or the `single-slot-return` Storefront preset)
picks the style; `ReturnSlot` takes it as a constructor argument and, for the
single slot, grows the fallback boxes and labels through `return-housing.ts`,
then `installReturnSlotModel` adopts the GLB against `SINGLE_SLOT_MODEL`'s
bounds and roles. The chute remains the default for every format and era, and
the tape-era gate (`defaultMedium === 'vhs'` plus `counterDressing`) applies to
both. `tests/return-chute-assets.test.ts` ray-tests the shipped GLB.
