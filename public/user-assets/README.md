# user-assets — git-ignored real-brand customizations

Everything in this directory except this README is **git-ignored** (see the
`public/user-assets/*` block in `.gitignore`). It holds scans, reference
photos, and faithful recreations of REAL branded products — trademarked art
that must never land in the repo. The committed code always ships a generic
procedural fallback and only swaps in an asset from here when the file
actually exists (`src/user-assets.ts` → `tryLoadUserAssetTexture`; a 404 is
the normal "not installed" case and is silent).

Layout convention — one directory per asset. Fixtures skinned to a real
branded product live under `fixtures/`; whole-surface material scans (floor,
walls) live under `surfaces/`; store sign art (period chain signage
scans/recreations) lives under `signs/`:

```
user-assets/
  fixtures/
    <asset-name>/
      front.png        # the texture the app loads at runtime
      NOTES.md         # optional: where the art came from / license notes
  surfaces/
    <surface-name>/
      color.png / normal.png / roughness.png   # PBR maps the app loads
      NOTES.md         # source + license (CC0 scans, etc.)
                       # NB: the repo SHIPS 1K CC0 defaults for these at
                       # public/textures/surfaces/ — a drop-in here overrides
                       # them (e.g. with the full-res ambientCG packs)
  signs/
    <sign-id or slot-id>/
      default.png      # replaces that sign's procedural canvas art
      <theme-id>.png   # optional per-theme variant (bb-1990, bb-1993,
                       # bb-2000, bb-2010, owl-90s) — beats default.png
                       # while that theme is active
```

## signs/ — drop-in sign art (no code)

Every sign the store builds (`buildSignage` in `src/fixtures/signage.ts`)
looks here before settling for its procedural canvas art. Resolution order —
first file that exists wins:

1. `signs/<slot-id>/<theme-id>.png` — this one placement, this theme
2. `signs/<slot-id>/default.png` — this one placement, any theme
3. `signs/<sign-id>/<theme-id>.png` — every placement of the sign, this theme
4. `signs/<sign-id>/default.png` — every placement of the sign, any theme

Run `node tools/list-slots.mjs` for the full manifest: every slot id, every
catalog sign id, the carrier fixture each renders on, and the face size /
pixel aspect the PNG should match (e.g. `three-dollar-rental` hangs a
2 x 1.35 ft card → any PNG near 1024x691). `--json` emits the same as JSON;
`npm run build` runs its `--check` to fail on config typos. Ceiling genre
signs are dynamic: `signs/ceiling-nav-COMEDY/default.png` reskins the COMEDY
hanger wherever it appears, `signs/ceiling-nav-line-<N>/` one specific line.

The PNG is mapped 1:1 onto the sign's face, so bake any borders/margins into
the image. Alpha is honored on the die-cut '93 ribbon hangers and the
extruded wall lettering (transparent pixels cut away).

Data maps (normal, roughness, …) must load linear, not sRGB — pass
`{ srgb: false }` to `tryLoadUserAssetTexture` for those.

## clerk/ — a custom sprite sheet for the store clerk

The clerk is a Doom-style directional billboard whose sprite sheet is painted
procedurally at boot (`src/clerk-art.ts`). Drop a finished sheet here and it
replaces her art wholesale — the rig, roaming, and animation timing all stay:

```
user-assets/
  clerk/
    default.png      # your sheet, any theme
    <theme-id>.png   # optional per-theme variant (bb-1990, bb-1993, bb-2000,
                     # bb-2010, owl-90s) — beats default.png while that theme
                     # is active
```

**Getting a template:** open the store with `?clerk_template=1` on the URL
(any mode, the hosted demo included) and the current procedural sheet
downloads as `clerk-sprite-template.png` — edit that. It wears the active
theme's livery, so grab it under the theme you're customizing for.

The grid is the contract (the runtime pages cells by fraction, so any
resolution works as long as the layout matches):

- **5 rows** = directions, top to bottom: front, front-side, side, back-side,
  back — all drawn heading screen-RIGHT; the runtime mirrors them for the
  other three octants.
- **16 columns** = animation frames, left to right: idle 2, walk 4,
  stock-high 2, stock-mid 2, stock-low 2, talk 2, type 2.
- Cells must stay **2:3** (the template's are 256x384) — the in-store
  billboard is 5.7 ft tall at that aspect, so a different cell shape
  stretches the character.
- **Transparent background required** — the sprite renders with
  `alphaTest: 0.5`, so pixels below 50% alpha are cut (no soft glows).

An installed brand pack can carry the same files
(`brands/<pack-id>/clerk/…`), which beat this flat tree per file, like every
other asset kind.

## brand/ — drop your logo in a folder (the two-step rebrand)

The short way to make this store yours. **No setting, no manifest, no JSON.**

```
1. Put your logo in    public/user-assets/brand/logo.svg   (or logo.png)
2. Reload the store.
```

That is the whole procedure. The folder is `brand/` — **singular**; `brands/`
below is the multi-identity tier. On boot the store looks in it, and if it finds
art it builds an identity out of it:

- **`logo.svg`** — the biggest shape in the file becomes the emblem's
  **outline**. That one silhouette then does every job the built-in emblem does:
  it fills the 2D emblem, it extrudes into the 3D sign over the storefront, and
  it **die-cuts every signboard in the store** — the aisle-top boards, the NEW
  RELEASES cards, the ceiling hangers, the floating browse cursors. Every other
  shape in the file rides along in the file's own coordinates and keeps its own
  colour, so a lockup lands the way you drew it.
- **`logo.png`** — the art itself becomes the emblem, and its **alpha channel is
  traced** into that same silhouette, so the signs and the 3D sign still have a
  shape to cut to. A PNG with no transparency has no silhouette to find, and the
  signs fall back to a plain board (the diagnostic says so).
- **`brand.txt`** — optional, one line: your store's name. Without it the store
  keeps its own name; your artwork still lands everywhere.
- **`brand.json`** — optional. If it's there, `brand/` is simply a full brand
  pack (see below) and nothing is synthesized.

Colours are **sampled from the art**: the dominant ink becomes the emblem body
and the livery every sign keys off, and the strongest contrasting ink becomes
the lettering. The **room does not change** — walls, carpet and counter tops
keep the store's own palette. A logo is evidence about a logo, not about what
colour someone painted their walls, and repainting a whole store from the
dominant channel of a PNG is how "automatic" turns into "unusable". Repainting
the room is what a `brand.json` is for.

**Did it work?** The drawer's **Store Brand** page has a read-only *Dropped
Logo* row: which file was found, where the name came from, whether the
silhouette came through, and which colours were sampled. The same line is the
`Brand Pack` hint on the SERVICE MODE page. A drop that found nothing says so.

Precedence: `brand/` (this tier) **<** `bb_brand_pack` (an explicit pack) **<**
your own edits in the brand editor. Naming a pack is a deliberate choice, so it
wins — and while one is named, the drop folder is not consulted at all.

## brands/ — a whole store identity as files

A **brand pack** is one directory here that re-skins the store: name, emblem,
palette, display font, rendered strings, sign art, box wraps. It is the same
drop-in idea as `signs/` above, scaled up to the identity, and it exists so the
committed app can ship a neutral brand while a user's own (or a recreated real)
one lives entirely in this git-ignored tree. Reach for a pack over the `brand/`
drop when you want several identities to switch between, your own display font,
scanned box wraps, per-era palettes, or control over the rendered strings.

```
brands/<pack-id>/
  brand.json          # the manifest — the only required file
  fonts/*.ttf         # display faces the manifest names
  logo/emblem.png     # raster/vector emblem (logo.shape "image")
  signs/…  surfaces/…  fixtures/…    # same layout as the flat trees above
  wraps/{vhs,dvd}.png # flat [BACK | SPINE | FRONT] rental-case prints
  NOTES.md            # provenance, like every other asset dir
```

Activate it with `localStorage.bb_brand_pack = '<pack-id>'` — the Brand Pack row
on the drawer's SERVICE MODE page. No key, or a manifest that isn't installed,
means no pack: every surface keeps its built-in value.

`brand.json` requires only `version` and `id` (which must match the directory
name); every other field is an override and absence means "keep today's value":

```json
{
  "version": 1,
  "id": "my-video",
  "name": "MY VIDEO",
  "displayName": "My Video Rental",
  "appliesTo": ["bb-1990"],
  "fonts": [{ "family": "My Display", "file": "fonts/display.ttf",
              "descriptors": { "weight": "100 900" } }],
  "logo": { "shape": "rect", "bodyColor": "#0f4d3a", "textColor": "#f2e8c9",
            "mainText": "MY", "subText": "VIDEO", "fontFamily": "My Display" },
  "palette": { "primary": "#0f4d3a", "secondary": "#c9a227" },
  "themes": { "bb-2000": { "palette": { "wall": "#8b87bd" } } },
  "strings": { "pos-system-title": "MY VIDEO RENTAL SYSTEM" },
  "wraps": { "vhs": "wraps/vhs.png" },
  "signageSet": "my-video-signs"
}
```

- `logo` is a `LogoSpec` partial (`src/logo-spec.ts`) and takes the same fields
  the in-app brand editor writes, plus `pathD`/`pathTiltDeg` (`shape: "path"` —
  your own emblem outline as SVG path data), `imageSrc` (`shape: "image"`) and
  `wordmarkPathD` (a vector wordmark painted instead of type). Precedence is
  theme default < pack < your own `bb_logo` edits < your own emblem
  (`bb_emblem`).
- `logo.emblem` is a **built emblem** — the layered-shape document the in-app
  Emblem Editor writes (`src/emblem-doc.ts`: `{version, aspect, tilt, wordmark,
  layers[]}`). Shipping one rather than a `pathD` keeps the mark editable and
  re-inkable: layers naming `body`/`text`/`border` follow the palette, so the
  same emblem repaints itself when the era does. The silhouette, the die-cut
  signboards and the extruded storefront sign are all derived from it, so a
  pack that sets `emblem` should not also set `shape`/`pathD` — the emblem
  wins. Easiest way to author one: build it in the editor, then copy
  `localStorage.bb_emblem` into your `brand.json`.
- `fonts[].family` is the name your `logo.fontFamily` refers to; the file is
  registered under a private family so it can never collide with a host font.
- `themes.<theme-id>.palette` is that era's deviation from `palette`, merged
  after it. A chain that spans decades repaints; without this every era wears
  the one palette the pack was authored in.
- `strings` keys are the ids passed to `brandString()` in the source — grep for
  it to see the current list (e.g. `brand-wordmark`, `brand-wordmark-video`,
  `pos-system-title`, `clerk-greeting`, `terminal-exit-label`).
- `signs/`, `surfaces/` and `fixtures/` inside a pack are checked **before**
  the flat trees above, per candidate — so a hand-dropped per-slot PNG still
  beats a pack's sign-wide one.
- `wraps/*.png` must match the app's wrap geometry exactly; run
  `node tools/list-slots.mjs` for the pixel sizes and fold columns, and for the
  full manifest-field list. `npm run build` validates any installed
  `brand.json` and fails on a broken one.
