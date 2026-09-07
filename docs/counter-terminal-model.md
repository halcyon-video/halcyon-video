# Counter rental terminal model

The front-desk CRT rental terminal and its keyboard are original Halcyon
construction, authored as scripted Blender meshes (bpy/bmesh) by
`tools/models/counter-terminal.py`. The script writes the editable
`tools/models/counter-terminal.blend` and exports
`public/models/rental-terminal.glb` and `public/models/rental-keyboard.glb`.

They replace the downloaded `crt_monitor.glb` (Jarlan Perez, CC-BY 3.0) and
`keyboard.glb` (Kenney, CC0). The owner had approved that monitor's shape, so
its massing was measured and kept — square bezel, chin control strip, tapered
cabinet, pedestal foot, about 1.27 × 1.55 × 1.55 feet — but everything is
rebuilt as molded parts with real surface detail. No downloaded geometry, UVs
or imagery is in the new files.

## Construction

Monitor, one part per physical piece (collection *Terminal (editable)*):

- **Cabinet** — tapered rear shell with rounded top edges, carved side
  cooling-vent pockets, a rear service grille and label plate, and the
  pedestal neck.
- **Bezel** — separate frame with the funnelled tube opening and the chin
  strip's recess.
- **Chin controls** — three pressed buttons in a dark strip, power rocker and
  LED.
- **Pedestal** — swivel ring and foot.
- **Tube** and **Glass** — recessed tube face and the pillow-curved glass
  pane, both open surfaces on purpose.
- **Cable** — power cord exiting the rear plate and lying along the deck.

Keyboard (collection *Keyboard (editable)*): sloped shell with a recessed key
well, every key cap as its own rounded body (main block, function row, nav
cluster, numpad; dark caps for modifiers and the nav cluster), three lock
LEDs, and a cord out of the rear edge. Closed parts are checked for manifold
edges before export; the export copies are joined per model with smart-project
UVs (the editable parts keep their own topology).

## Materials

Each glTF primitive wears a named role. Base colours are factors so the
runtime can retint a role without discarding the maps.

| Role | Where | Maps |
|---|---|---|
| `CabinetABS`, `BezelABS` | monitor shell, bezel | baked AO in baseColor, ABS grain normal |
| `TrimDark` | control strip, vent slots, pedestal ring | baked AO, grain normal |
| `CableRubber` | both power cords | baked AO, grain normal |
| `CrtTube` | tube face (replaced at runtime by the screen material) | — |
| `CrtGlass` | pillow glass (replaced at runtime by the glass-reflection material) | — |
| `PowerLed` | power / lock LEDs | baked AO; runtime adds live emission |
| `KeyboardShell`, `KeyCaps`, `KeyCapsDark` | keyboard | baked AO, grain normal |

Ambient occlusion is baked in Cycles (monitor 512², keyboard 256²) with
every other object hidden from the renderer — the editable originals sit on
top of the export copies, and would otherwise blacken the bake. The 128² ABS
grain normal map is generated noise, tiled through `KHR_texture_transform`.
Its effective surface frequency is
set by the material mapping, so the smaller source retains the same molded
finish while keeping the monitor under its 500 KB shipping gate.

## Coordinates and runtime contract

Feet, Y-up, bottom at y=0, centred on x. The monitor's bezel faces −Z and
the keyboard's low front edge faces −Z; `src/entrance/index.ts` spins both by
π so they face the clerk, as the old models did.

Body bounds exclude the cable: the runtime measures fit boxes over every mesh
except those wearing `CableRubber` (monitor body x ±0.64, y 0..1.55,
z −0.56..0.99, cable to z 1.06; keyboard body 1.30 × 0.125 × 0.50, cord to
z 0.70). The loader then keeps the established contract unchanged: the
monitor is scaled to 1.55 ft by body height and shifted off the island's real
depth; the screen plane is fitted to the `CrtTube` box and recessed behind
the `CrtGlass` pane (the legacy `mat16` / `mat17` names are still honoured);
the keyboard is scaled to 0.85 ft wide and seated by its body's rear edge;
the box-monitor fallback, the search-terminal dock and the late-load disposal
guard are as before, and the station groups now release their geometry,
materials and maps when the entrance group is removed.

## Cost

| Export | Bytes | Triangles | Primitives | Textures |
|---|---|---|---|---|
| `rental-terminal.glb` | 379,812 | 5,468 | 7 | AO 512² + grain 128² |
| `rental-keyboard.glb` | 663,828 | 16,244 | 6 | AO 256² + grain 128² |

Two stations clone each model; geometry and textures are shared.

## Regenerate

```sh
cd /tmp && blender -b --python <repo>/tools/models/counter-terminal.py
```

Blender 4.2+ (built on 5.1), CPU bake, about a minute.
