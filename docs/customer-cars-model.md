# Original period customer cars (#392)

The parked customer cars are four original, unbadged late-1980s body styles: a
compact sedan, a two-door hatchback, a station wagon and a minivan. They replace
the earlier scripted hatchback and sedan. Each is an original interpretation of
period proportions, not a replica of a real make or model, and carries no logos,
wordmarks or lettering.

Editable named parts are in `tools/models/customer-cars.blend`, one collection
per style, lined up along X. Reproduce everything with Blender 5.1 or later:

```sh
blender -b --factory-startup --python-exit-code 1 -P /absolute/path/to/tools/models/customer-cars.py
```

The script writes the blend, `public/models/customer-car-<style>.glb` and the
lighter `customer-car-<style>-lite.glb`. It imports no geometry or images.

## Construction

Each body is one closed shell lofted through shaped cross-sections: a tucked
sill, a full-width character line, a beltline shoulder, a greenhouse with
tumblehome, a crowned roof and hood, and rounded corners in plan. Real wheel
arch openings are cut into the section line itself, with dark wheel-well liners
behind the tyres. Glass is part of the same skin: windshield, side and rear
windows are regions of the greenhouse, separated by body-colour A and C pillars
and blacked-out B pillars. The styles differ in their side silhouette (three
box, two box with a sloped hatch, long roof with an upright tailgate, one box
with a long raked windshield) and in their window and door layouts.

Wraparound bumpers are swept chamfered sections with a bright strip. Lamps,
indicators, side markers, the grille with bright bars, blank plates, mirrors,
door handles, door shut lines and a side protective strip are separate parts.
Tyres and dished wheel covers are revolved profiles. A dashboard and seats read
through the tinted glass. Every part has UVs for uniform finishes.

## Dimensions and coordinates

Feet. Blender X is across, -Y toward the nose and Z up; the Y-up glTF export puts
the nose on +Z. Origin is the ground midpoint and the exported minimum height is
zero. Runtime keeps the authored size (one uniform transform, effectively 1.0 for
these dimensions) and parks each car centred in its stall with the stall's yaw.

| Style | Model year | Length incl. bumpers | Width incl. mirrors | Height |
|---|---:|---:|---:|---:|
| Sedan | 1987 | 15.23 | 6.26 | 4.57 |
| Hatchback | 1987 | 13.63 | 6.10 | 4.53 |
| Station wagon | 1987 | 15.83 | 6.34 | 4.64 |
| Minivan | 1989 | 15.43 | 6.56 | 5.56 |

All fit the 9 by 18 foot stall contract with the existing clearance. A store set
before a style's model year never shows that style.

## Materials, detail levels and cost

Roles are BodyPaint, RubberTrim, WindowGlass, WheelMetal, Headlamp, TailLamp,
AmberLens and InteriorCloth, with the same finishes as the earlier cars, so they
share the existing shader programs. Exports batch parts by role: eight draws for
the full mesh, seven for the lite mesh, which drops the interior, handles, shut
lines, strips and grille bars and uses coarser sections and wheels.

| Style | Full triangles | Full bytes | Lite triangles | Lite bytes |
|---|---:|---:|---:|---:|
| Sedan | 8,008 | 292,148 | 4,324 | 165,996 |
| Hatchback | 7,780 | 285,364 | 4,228 | 164,284 |
| Station wagon | 8,168 | 302,008 | 4,356 | 171,028 |
| Minivan | 8,160 | 302,540 | 4,324 | 169,068 |

High quality loads the full meshes; medium and low load the lite meshes.

## Ownership and paint

`CustomerParking` gives each of the ten regulars one persistent car for the
store: body style and paint come from two separate stable hashes of the
customer's identity, so paint never follows from style. Assignments are resolved
over the whole roster, giving every regular a different paint from the
twelve-colour period palette, so concurrent cars stay distinguishable. A
regular's style stays the same across store years whenever that style exists in
the year. A car is parked exactly while its owner is in the store.

`CustomerVehicles` loads each eligible style once, shares its geometry and
finishes, and shares one BodyPaint material per source and colour across every
car wearing it. Loading silhouettes keep each style's declared envelope.
Teardown releases all of them.
