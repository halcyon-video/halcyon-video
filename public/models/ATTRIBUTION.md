# 3D Model Attribution

The six `checkout-counter-*.glb` variants are original Halcyon millwork, covered
by the repository's license. Editable Blender source and the reproducible
mesh-authoring script live in `tools/models/checkout-counter.blend` and
`tools/models/checkout-counter.py`. They contain no downloaded geometry,
textures, or chain trademarks. See `docs/checkout-counter-model.md` for the
construction and placement contract.

Downloaded from [Poly Pizza](https://poly.pizza) and [Sketchfab](https://sketchfab.com),
used for the store's prop dressing.

| File | Model | Author | License |
|---|---|---|---|
| `crt_monitor.glb` | [CRT Monitor](https://poly.pizza/m/8jVB0zIXKCv) | Jarlan Perez | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `keyboard.glb` | [Computer Keyboard](https://poly.pizza/m/vsqTUPFSw6) | Kenney | CC0 |
| `retro_tv.glb` | [Retro TV](https://poly.pizza/m/2tfjTOK1Lh4) | Alex Safayan | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `car_sedan.glb` | [Car](https://poly.pizza/m/Cz6yDaUcM9) | Quaternius | CC0 |
| `car_hatchback.glb` | [Car Hatchback](https://poly.pizza/m/BG0KAhmGDt) | Kay Lousberg | CC0 |
| `car_sports.glb` | [Sports Car](https://poly.pizza/m/1mkmFkAz5v) | Quaternius | CC0 |
| `coffee_table.glb` | [Table Coffee Glass](https://poly.pizza/m/gPANIgapqV) | Kenney | CC0 |
| `tv_ceiling.glb` / `tv_hero.glb` | [CRT-TV](https://sketchfab.com/3d-models/crt-tv-bc61b13e2ac2472dbfcdd1dd2fa8c584) | pawelk1568890 | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `balloon.glb` | [Balloon](https://poly.pizza/m/d1gDDhM7pTf) | Poly by Google | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `vcr.glb` * | [VCR Player](https://sketchfab.com/3d-models/vcr-player-98951dfd481b432b883b128222ea24ae) | twunnyphaiv | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `dvd_player.glb` * | [Basic Silver DVD Player](https://sketchfab.com/3d-models/basic-silver-dvd-player-3a57be3bc7584543a613ef9b8f7c0420) | rhcreations | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

\* Sketchfab downloads require an interactive (free) login, so these two are a
manual step: open the model page, Download → glTF/GLB, and save into
`public/models/` under exactly the file name above. The app
falls back to procedural/primitive stand-ins until the file exists — nothing
breaks on a fresh checkout. After downloading, sanity-check the first four
bytes are `glTF` and keep textures ≤ 2048px. (The originally vetted free TVs —
Zgon's "Old Television from 90's" and LiuMeowMeow's "TV Sony Trinitron", both
CC-BY 4.0 — remain vetted alternates
if the user-supplied TV ever needs replacing.)
