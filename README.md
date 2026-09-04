# Halcyon Video — a 3D video store for your media server

[![Discord](https://img.shields.io/badge/Discord-join%20the%20store-5865F2?logo=discord&logoColor=white)](https://discord.gg/SN6FnJgQe)
[![Live demo](https://img.shields.io/badge/demo-no%20signup%2C%20no%20server-E9A93D)](https://halcyon-video.github.io/halcyon-video/)
[![Version](https://img.shields.io/github/v/tag/halcyon-video/halcyon-video?label=version&color=4c9a72)](https://github.com/halcyon-video/halcyon-video/releases)
[![License](https://img.shields.io/badge/license-GPL--3.0-6a737d)](LICENSE)
[![Stars](https://img.shields.io/github/stars/halcyon-video/halcyon-video?color=6a737d)](https://github.com/halcyon-video/halcyon-video/stargazers)

**Your Jellyfin or Plex library, rebuilt as a walkable 1990s video rental store.** Every
movie you own is a case on a shelf. Browse the aisles under warm fluorescents,
pull *Back to the Future* off the wall, flip it over and read the back of the
box, carry it to the counter, and watch the clerk drop it in a bag that
crinkles around it. Then take it home to the living room and put it in the VCR.

It is not a menu with a skin on it. It's a store.

![The storefront at sunset](docs/screenshots/facade-sunset.jpg)

Walk in from the parking lot — brick facade, glazed-tile stripe, the blue
board on the gable, your movie posters in the windows.

![Standing just inside the doors](docs/screenshots/overview.jpg)

**Try it right now, no server, no signup:** https://halcyon-video.github.io/halcyon-video/ — the full store running
on a synthetic demo library. Or take the
[**45-second tour ▶**](https://youtu.be/TCkEpeL8Y3w) first.

**Got it running?** There's a [**Discord**](https://discord.gg/SN6FnJgQe) — setup help, release
notes, and `#your-store`, which is for screenshots of yours wearing whatever
livery you gave it. That last one is my favourite thing to get.

> **Heads-up:** the demo sizes its synthetic library to what your browser can
> actually carry — a few hundred titles on a phone or a modest laptop, the
> full ~2,000-title store on anything with real GPU headroom to spare. (It's
> built to live on a dedicated HTPC, where it idles near zero.)

### The same library, four ways

None of this is a preset you pick once. Era, lighting, floor plan and media
format are independent settings, and every combination is a store you can walk
around in. [More ↓](#make-it-yours)

| | |
|:--:|:--:|
| ![Four decades of fit-out](docs/screenshots/store-era.gif) | ![Day, sunset, night](docs/screenshots/time-of-day.gif) |
| **Four decades of fit-out** — board signage and VHS in 1990, the fascia-band era in 1993, arched plaques in 2000, wire-black DVD shelving in 2010. | **Day, sunset, night** — the light through the front glass, on eight measured-sun HDR skies. |
| ![Three floor plans](docs/screenshots/shelf-arrangement.gif) | ![VHS or DVD](docs/screenshots/media-format.gif) |
| **Three floor plans** — herringbone, straight, or diagonal shelf runs, packed to fit the room. | **VHS or DVD** — the whole store re-cased, on correctly-proportioned rental shells. |

### It doesn't have to be *my* store

Halcyon Video is a chain I made up. Paint over it.

Name, colors, emblem shape and typeface live in the store's own settings
drawer, and they don't stop at the sign over the door. Every rental clamshell
in the building is reprinted to match, down to the pinstripe and the small
print on the back — then the room itself follows: endcaps, wall bays, the
hanging aisle signs, the perimeter band, the checkout counter, even the
clerk's polo. The walls, the carpet and the ceiling stay the era's own, because
a logo is evidence about a logo, not about what colour someone painted their
walls. Same tape, same floor plan, three stores.

| | | |
|:--:|:--:|:--:|
| ![Banana Entertainment, brown on yellow](docs/screenshots/brand-case-banana.jpg) | ![Whatever Games, white on red with a black pinstripe](docs/screenshots/brand-case-whatever.jpg) | ![Video World, yellow on green](docs/screenshots/brand-case-videoworld.jpg) |
| ![The 1990 sales floor in Banana Entertainment livery](docs/screenshots/brand-store-banana.jpg) | ![The 1990 sales floor in Whatever Games livery](docs/screenshots/brand-store-whatever.jpg) | ![The 1990 sales floor in Video World livery](docs/screenshots/brand-store-videoworld.jpg) |
| ![A Banana Entertainment carry-out bag](docs/screenshots/brand-bag-banana.jpg) | ![A Whatever Games carry-out bag](docs/screenshots/brand-bag-whatever.jpg) | ![A Video World carry-out bag](docs/screenshots/brand-bag-videoworld.jpg) |
| **Banana Entertainment** — brown on yellow, set in Archivo Black. | **Whatever Games** — white on red, black pinstripe, set in Anton. | **Video World** — yellow on green, set in Bebas Neue. |

Rather draw it than type it? Put a `logo.svg` — or a PNG with alpha — in
**`public/user-assets/brand/`** and reload. The biggest shape in the file
becomes your emblem, every signboard in the store is cut to that silhouette,
and the house colors come out of the artwork itself. There's no setting to
switch on. The file being there is the setting.

That folder is git-ignored, so your brand stays on your machine and can't wander
into a commit. Per-era palettes, your own display font, scanned box wraps — that
tier is a **brand pack**: [Make it yours ↓](#make-it-yours)

### Does it…?

The short answers, so you don't have to go looking for them.

| | |
|---|---|
| **Run in Docker?** | Yes — one `docker run`, or `docker compose up -d` from a clone. [Quick start ↓](#quick-start) |
| **Do video games?** | Yes — point it at [RomM](https://github.com/rommapp/romm) and a whole department appears: per-platform bays, period-correct boxes and jewel cases. [More ↓](#the-games-department) |
| **Work with Plex?** | Yes — sign in with a plex.tv code and your servers show up. Emby is the next one ([#32](https://github.com/halcyon-video/halcyon-video/issues/32)). [More ↓](#plex) |
| **Run on a Raspberry Pi?** | Yes — **2.5D mode** runs the same store as plain HTML/CSS. [More ↓](#25d-mode--the-same-store-for-a-raspberry-pi) |
| **Work away from home?** | Yes — **Remote Play** streams the live store to any browser, with its own TURN relay for off-LAN viewers. [More ↓](#remote-play--the-store-in-your-pocket) |
| **Work in VR?** | Yes — **WebXR walk mode**: plug in a headset and first-person walk grows an **Enter VR** button. Stick to walk the aisles, trigger to pull a case off the shelf. |
| **Shelve my streaming services?** | Yes — pick your services (Netflix, Prime Video, Disney+, …) at the setup terminal and each becomes a browsable aisle that hands you off to the service to watch. No API key needed — a bundled snapshot stocks them out of the box. [More ↓](#integrations-at-a-glance) |
| **Look like *my* video store?** | Yes — brand, logo, colors, themes, fixtures and sign art are all data you drop in a folder, not code. [See it ↑](#it-doesnt-have-to-be-my-store) · [More ↓](#make-it-yours) |
| **Show me my library as it was in 1996?** | Yes — pin a **Media Release Date** and everything released after it leaves the store entirely. The pin rolls forward a day per day. [More ↓](#media-release-date--the-store-as-it-stood-on-a-date) |
| **Work with no media server at all?** | The demo does — it ships its own synthetic catalog, which is the link above. Shelving *your* files needs Jellyfin or Plex; there's no built-in folder scanner. |

### Jump to

**Get it running:** [Quick start](#quick-start) — one click, npm, Docker, or HTPC kiosk · [FAQ](#faq)

**See it:** [Browse the aisles](#browse-the-aisles) · [Pick up a case](#pick-up-a-case) · [Rent it like it's 1994](#rent-it-like-its-1994) · [The clerk](#the-clerk) · [Discovery](#discovery--the-store-stocks-what-youre-missing) · [Games](#the-games-department) · [Watching something](#watching-something)

**Set it up:** [Manager terminal](#the-manager-terminal) · [Make it yours](#make-it-yours) · [2.5D mode](#25d-mode--the-same-store-for-a-raspberry-pi) · [Remote Play](#remote-play--the-store-in-your-pocket) · [Integrations](#integrations-at-a-glance)

---

## What it is

A Vite + TypeScript + **three.js** app (optionally Tauri-wrapped) that connects
to **[Jellyfin](https://jellyfin.org/)** or **[Plex](https://www.plex.tv/)** and procedurally builds a period video
store from whatever you have: every library becomes an aisle, genres become
signposted sections, duplicate quality versions stack behind the face copy, the
worst-rated titles literally end up in the **Bargain Bin**. It runs 24/7 on an
HTPC as our family's way to pick a movie — and when nobody's touching it, it
renders *nothing at all* and idles at near-zero CPU/GPU for days.

The screenshots in this README show the store running its built-in demo
catalog — public-domain classics on every shelf, no media server attached
(the same thing the live demo link runs). Point it at your own server and every
case becomes something you own. This isn't a tech demo that gets old in five
minutes; it's how our family has picked a movie every night for months.

---

## Browse the aisles

![Browsing the Action section](docs/screenshots/browse-aisle.jpg)

- **A real floor plan.** Shelf runs pack the floor in herringbone, straight, or
  diagonal arrangements. Genre boards ride the shelf tops, category blades hang
  from the ceiling, and the New Releases wall wraps the back of the store
  backed by gold "NEW RELEASE RENTAL" clamshells.
- **Every case is your art** on a correctly-proportioned VHS or DVD rental case
  — 4K editions wear a **4K sticker**, popular titles show multiple copies deep
  on the shelf, and a title with both a 4K and 1080p version collapses to one
  box with the quality choice made at play time.
- **Move like a person.** Cursor-browse shelf to shelf with duplicate-skipping
  and over-the-top wrap, or press **F** and walk the store in first person —
  WASD, mouse-look, and click any case within reach to pick it up. No
  click-to-teleport, no Street-View lurching: you *walk*.
- **Doors swing open** as you approach. Footsteps alternate ears. The ceiling
  CRTs are playing something family-safe from your own library, with positional
  audio that gets louder as you walk under them.

![Three wall-mounted CRTs above the New Releases wall, all playing the same feed](docs/screenshots/store-tvs.gif)

**The screens are really playing.** Not a looping texture of a screen — a live
video decoding onto the tube, the same one on every set, panned into place so
it swells as you walk under it. Most eras hang two sets from the ceiling; the
2000 store mounts a bank of three flush to the back wall, above the case grid.
On Jellyfin they pull from libraries you pick (Settings → Playback → Overhead
TVs). Everywhere else — the demo, a first boot, a Plex install — they play a
bundled 30-second loop, because a dark tube reads as broken hardware.

![First-person walk mode](docs/screenshots/walk-mode.jpg)

**And if a headset is plugged in, you can stand in it.** First-person walk mode
offers an **Enter VR** button on WebXR hardware: left stick walks, right stick
snap-turns, the trigger pulls whatever case you're pointing at, squeeze backs
out. Same store, same shelves, at eye height.

### The New Releases wall

Your most recent arrivals, faced out floor-to-high with the multi-copy depth of
a real street date, under the "2-EVENING NEW RELEASE RENTAL $3" sign.

![The New Releases wall](docs/screenshots/new-releases.jpg)

---

## Pick up a case

![Inspecting a title](docs/screenshots/inspect.jpg)

Enter lifts the case into your hands — retail art in front, the store's rental
copy behind it. Flip it:

![The back of the box](docs/screenshots/back-of-box.jpg)

- **The back of the box is typed, not templated.** Real synopsis, director,
  cast, year, runtime, rating — plus genre-matched review pull-quotes ("AN
  EXPLOSIVE SCI-FI SPECTACLE!") and a bordered **technical specifications
  table** built from the file's actual media streams: aspect ratio, HDR10 /
  Dolby Vision, audio tracks, subtitles, the works.
- **Click an actor's name** to jump to that actor's shelf.
- **TV series are 3D season boxsets** — rotate the box to the side panel to
  pick an episode.
- The flip cycle ends on the **spine** — the rental copy angled with a sliver
  of front showing, exactly how you'd hold it deciding.

### The search terminal

Press `/` and the camera walks you behind the counter and docks to the clerk's
CRT. Type on amber phosphor; matches come back by title, director, or genre,
and Enter flies you to the title's spot on the shelf.

![SEARCH> HORROR](docs/screenshots/search-terminal.jpg)

---

## Rent it like it's 1994

![The checkout ritual](docs/screenshots/checkout-ritual.jpg)

- **Carry mode:** take a tape and it joins a hand-fanned stack at the bottom of
  your view. **C** walks you to the counter; **hold Enter** goes straight to
  checkout with a cream hold-meter pill.
- **The bag is a real soft body.** The glossy white pillow bag is a ~340-node
  cloth simulation — two welded sheets, die-cut handle punched through both
  layers. Drop a case in and the plastic visibly pushes out around it; pick it
  up and it droops and sways under gravity, then settles. (And then the solver
  goes to sleep, because nothing here is allowed to burn watts at idle.)

![The checkout bag, a 340-node cloth sim](docs/screenshots/checkout-bag.jpg)

- **The checkout exit is choreographed** — wrap, slide, a first-person
  walk-around while your bag waits at the counter's edge, grab, carry-out.
- **Rental mode** (optional, "hardcore") enforces real early-90s rental-chain
  rules on the wall clock: two tapes on a weeknight, due back **noon
  tomorrow**; four on a weekend, due **Monday 8 AM**. The store locks you out
  until then — DST-safe, with a diegetic DUE BACK slip.
- **Return them** through the classic **"▼ RETURN TAPES HERE ▼"** chute on the
  counter's entrance shoulder, one clatter-thunk at a time.

![The return chute](docs/screenshots/return-chute.jpg)

### The living room

After checkout you're **home** — rented clamshells and the receipt on the
coffee table, a CRT and VCR with a blinking clock. Inspect your tapes from the
couch, insert one, and the movie plays *on the TV in the room*, with positional
audio at the set.

![Home with your rentals](docs/screenshots/back-room.jpg)
![Reading the box on the couch](docs/screenshots/back-room-inspect.jpg)

### Snacks for tonight? (optional)

Flip on candy delivery and checkout adds one question — the wire rack's real
rows (gummy bears, popcorn, movie mints…), a quantity, a ZIP, and a hand-off
deep link to DoorDash. No payment in-app; off by default and byte-identical to
before when disabled.

---

## The clerk

![The clerk on the floor](docs/screenshots/clerk.jpg)

A Doom-style directional sprite — five hand-drawn views picked by the angle
between her heading and your camera, procedurally painted onto a sprite sheet
at boot. She isn't decoration:

- **She walks the store on grid-A\*** over the real floor plan — restocks
  shelves with a high/mid/low reach cycle, types at the terminal, idles at the
  register. (The pathfinder is pure math and unit-tested: `npm run test:nav`.)
- **"ASK FOR RECOMMENDATIONS!"** clasps clipped to the shelf lips summon her to
  wherever you're standing, and her suggestion is scoped to the section you're
  in.
- **Her reasons are true, never generated.** The recommendation engine only
  says things it can prove from your library: *"You have three of the Alien
  films"*, *"Because you have HEAT"*, director, actor, studio, genre — in that
  order of strength. It also learns your taste from what you inspect, with a
  gentle decay so it drifts as you do.
- **"Something else?"** rotates her through alternatives — including titles you
  *don't* own, with an **"Order it for me"** option (see below).

---

## Discovery — the store stocks what you're missing

With **[Jellyseerr](https://github.com/fallenbagel/jellyseerr)** connected — or
**[Overseerr](https://github.com/sct/overseerr)**, whose API Jellyseerr forked,
so either one answers — the store quietly merchandises around your collection:

- **Collection gaps**: own 3 of the 4 Alien films? The missing one stands on
  the shelf as an empty box with a blue **REQUEST** corner label. Select it and
  the label restamps **cream COMING SOON**, live, while the clerk toasts that
  she's ordered it.
- **Discover titles** — trending films you don't own — are shelved *inline*
  with your stock as request cases, not exiled to a separate row.
- **Staff picks from your actual watch history**: the overlap of
  "people-also-liked" lists across everything you've watched, overlap-ranked so
  a film recommended by three of your favorites beats one recommended by one.
  Owned winners sit unmarked on the shelf; not-owned winners take the **genre
  endcaps** wearing a **FOR YOU** starburst.
- **Not interested?** Hold **▼** on any suggested case and it's gone — from
  every shelf, permanently. The hold is deliberately a beat longer than
  checkout's, so you can change your mind mid-meter.
- No Jellyseerr configured? None of this is *hidden* — it's simply **never
  built**. The store doesn't hang an "ask me" button its clerk can't answer.

---

## The games department

Point it at **[RomM](https://github.com/rommapp/romm)** and a freestanding
gondola appears: per-platform bays with brand-colored blades — SNES and N64
cardboard boxes in landscape, PlayStation jewel cases, Genesis clamshells — 21
platform toggles, top-rated titles first. Off by default; zero requests when
disabled.

This is a **browsing** department: your ROM library, shelved and faced out the
way a rental store would have merchandised it. Picking a game up doesn't
currently start it playing.

![The video games department](docs/screenshots/games-department.jpg)

Every platform gets its own carton, at its own real-world proportions — a
Super Nintendo box is not a PlayStation jewel case wearing different art, and
neither is a movie case. Your RomM cover scans go on the shapes they were
printed for.

![Game shelves up close](docs/screenshots/games-shelf.jpg)

---

## Watching something

- **A full custom player**: seek bar with buffer fill, ±10s skip,
  quality/audio/subtitle menus, direct-play first with HLS transcode fallback,
  and a stall watchdog ladder that nudges, kicks, reloads, and finally swaps
  sources before it ever leaves you at a spinner.
- **Play files off disk with mpv** (default on, HTPC path): when the file lives
  on the same machine, the store hands it to mpv for **real HDR** via
  libplacebo and the **original lossless audio** — no transcode, no tens of GB
  of HLS segments. The remote still works: OK pauses, Up cycles subs, Down
  cycles audio, Left/Right scrub.
- Playback reports back to your media server (start/progress/stop), so resume
  points and watch history — which feed the staff picks — stay honest.

---

## The manager terminal

Press **Left** at the checkout counter, empty-handed, and the camera docks to
the clerk's desk CRT:

![MANAGER TERMINAL — SYSTEM CONTROL](docs/screenshots/manager-terminal.jpg)

System control is *diegetic*: settings, 2D mode, log out, quit — the same
actions as the glass-card power menu (`P`), rendered in 40-column amber.

### Settings — paginated, thumbnailed, remote-first

![Store Settings](docs/screenshots/settings.jpg)
![Store Look, with live thumbnails](docs/screenshots/settings-store-look.jpg)

Every option row carries a rendered thumbnail of what it actually changes.
A whole drawer session collapses into at most **one** rebuild or reload, fired
on close — never one per toggle.

**Five store themes**: Halcyon **1990** (board signage, VHS), **1993** (the
footage era — fascia bands, ribbon ceiling, balloon cluster, HOT PIX boxes,
VFD pole display, security camera, QUIK DROP window lettering), **2000**
(arched plaques), **2010** (DVD era, wire-black shelving), and **Night Owl
Video** — the late-night rival chain, with its own palette and counter. Plus
storefront presets, ceiling height, wall paint, marquee bulb chase, media
format, rental-wrap variants, and day / night / **sunset** (eight measured-sun
HDR skies) / street-view outside the glass.

![The same store at night](docs/screenshots/facade-night.jpg)

### Media Release Date — the store as it stood on a date

![The MEDIA RELEASE DATE screen on the counter CRT, with the store date stamped in the corner of the screen](docs/screenshots/media-release-date.jpg)

Pin the catalog to a day and the store becomes the store as it was on that day.
Anything released later is simply **gone** — not greyed out, not filtered in a
sidebar: not on a shelf, not in search, not on the New Releases wall, not a
staff pick, not something the clerk will offer you. A series that started in
time still shelves, but the episodes that hadn't aired yet aren't there either.
A library that is entirely too new doesn't even get an aisle.

The pin **rolls**. Set 12-JUN-1996 today and tomorrow the store is 13-JUN-1996 —
one real day per real day, permanently offset from now. Titles arrive on the
anniversary of their release, so a store pinned to 1996 goes on having new
release weeks.

- **The date is on screen**, bottom right, for as long as a pin is in effect —
  so an aisle with nothing recent in it reads as the whole point rather than as
  a sync that went wrong.
- **Match store era** puts the decor on the same clock, and crosses into the
  next era on the day the rolling date does. Leave it off and the two stay
  independent: a 2010-dressed store can carry a 1996 catalog.
- Recommendations can carry their own permanent **release-date window**, so a
  period store never gets offered something that came out last month.

Set it at the counter — **Left**, then **MEDIA RELEASE DATE**. Clearing the pin
restocks the store back to live.

### Membership cards

Jellyfin users appear as **laminated membership cards** — deterministic member
numbers, "MEMBER SINCE", the user's avatar, a glint sweep. Picking your card is
how you log in; cards flip over for password entry. Plex has no public user
list to draw cards from, so a Plex install signs in through the plex.tv PIN
screen instead.

---

## Make it yours

Halcyon Video is a fictional chain, and the whole identity — logo, colors,
fonts, signage, rental wraps — is **data, not hardcode**. Rebranding the store
is a two-step job:

1. Drop your logo — an `.svg` or a transparent `.png` — into
   `public/user-assets/brand/`.
2. Restart the app.

That's it. The shape of your mark becomes the extruded storefront sign, the
wordmark centers itself on every genre board, and the brand propagates to the
rental-case wraps, the checkout bag, the membership cards, the POS terminal,
the works. No manifest, no settings, presence = active.

**Docker:** If you're running via `docker compose`, the bind mount is already
configured in `docker-compose.yml` — just drop your files into
`public/user-assets/brand/` on the host and restart the container. A rebuild
is not required. If you customized the compose file, see the
[`docker-compose.yml`](docker-compose.yml) annotations for the brand mount.

One level deeper, a **brand pack** (`public/user-assets/brands/<id>/` with a
`brand.json`) controls everything individually: palette, display fonts, vector
emblem paths, per-sign art, wrap prints, rendered strings. There's also a live
**brand editor** in the settings drawer — emblem shape, both wordmark lines,
colors, tilt, storefront extrusion, and the typeface (four bundled display
faces, plus whatever your pack registers), with two complete original identities
in the box to start from (Megahit Video and Reel Time).

And if you don't have a logo at all, **build one**: the brand editor's *Emblem
Editor* page stacks primitive shapes — rectangles, ovals, wedges, stars, rings,
banners and type — each with its own colour, place and angle, and flattens the
pile into the store's mark. Shapes can be solid parts, cut-out holes, or ink
printed on the face, and what comes out has real transparency: empty space
stays empty. The **outline is the sign**, not artwork pasted on a board — make
an oval and the extruded storefront sign is an oval, punch a hole and the sign
has a window, and the same silhouette die-cuts every aisle header, wall mark
and box spine in the store. Export it as a transparent PNG if you want to take
it elsewhere. Run
`node tools/list-slots.mjs` for the full manifest of every overridable surface,
and `npm run build` validates an installed pack so a typo fails loudly.

Everything under `user-assets/` is **git-ignored by design**. If the store of
your childhood was a specific blue-and-gold chain with a torn-ticket sign,
your own recreation of it will fit these seams precisely — and it stays on
your machine, between you and your nostalgia. This repository ships no
third-party brand assets and never will: this project doesn't accept pull
requests, and third-party brand assets would be refused regardless.

---

## 2.5D mode — the same store for a Raspberry Pi

A second, coequal render mode: pure HTML/CSS, **no WebGL, no three.js
download**, ~instant on weak hardware — and still a *video store*, not a grid.
Every title is a dimensional case with a skewed spine that swings toward you on
focus.

![2.5D library select](docs/screenshots/flat-libraries.jpg)
![The 2.5D shelf](docs/screenshots/flat-shelf.jpg)

Same themes, same New Releases/genre/games/discovery rows, same search (`/`),
same detail-overlay back-of-box. Swap between 3D and 2.5D in-process from the
settings, power menu, or the manager terminal — no page reload.

---

## Remote Play — the store in your pocket

The HTPC *is* the render server. Open `/remote.html` on your phone and the live
canvas + the store's entire synthesized soundbus stream peer-to-peer over
WebRTC, with your touches flowing back as real input. Two flavors:

- **Shared kiosk mirror** — see and drive the same store as the person on the
  couch.
- **Private instances** — the server spawns a headless Chromium *per visitor*
  running the real store against the same library, reaped after a few idle
  minutes.

Idle costs nothing by construction: `captureStream()` only produces frames when
the render loop actually paints.

It runs fully headless, too: a Docker or server deployment with no TV
attached serves private instances only — that's the set-top-box setup. Point
any device's browser at `/remote.html` and the server does the rendering;
the box just decodes a video stream, so even the weakest smart-TV browser
walks the aisles at full fidelity. TV browsers (Fire TV, Android TV, and
friends) get the ten-foot treatment automatically: the remote's D-pad and OK
drive the store, BACK backs out instead of leaving the page, play/pause and
rewind/fast-forward do what they say during a film, and MENU recalls the
controls — add `?tv=1` if your TV's browser isn't recognized.

**On Android TV and Fire TV there is an app instead**, so there is no browser
to sideload and no address bar to drive with a d-pad: install the APK from
[`android-tv/`](android-tv/README.md) and the store gets a launcher tile like
any other TV app. Type your server's address once and it opens straight into
the aisles — and because the app owns the remote rather than a browser, BACK
is the store's back button, not the browser's. Until someone donates a login
(**Settings → Connection → Remote Play**, from any logged-in browser), the
instances boot the demo library. Instances are capped
(`REMOTE_PLAY_MAX_INSTANCES`, default 2) and viewers past the cap are turned
away until one frees up.

**No Roku app, and none planned for now** — Roku has no browser, no WebView,
and no WebRTC, so neither the 3D store nor the Remote Play thin client can run
there; supporting it would mean a full separate BrightScript/SceneGraph client
re-implementing what generic Jellyfin/Plex Roku channels already do. TV
support today means Fire TV and Android TV, with Apple TV next in line.
Tracked in [#82](https://github.com/halcyon-video/halcyon-video/issues/82) —
revisit if the platform ever grows a real web/WebRTC runtime.

**Apple TV is scoped but not built** — tvOS forbids WebViews in App Store
apps, so unlike the Fire TV/Android TV app above this needs a real native
SwiftUI + WebRTC client rather than a wrapper, and needs an Apple Developer
account plus a Mac with Xcode to build and sign, which this project doesn't
have yet. The wire protocol it would speak is documented in
[`docs/remote-play-protocol.md`](docs/remote-play-protocol.md) and the plan in
[`tvos/README.md`](tvos/README.md). Tracked in
[#81](https://github.com/halcyon-video/halcyon-video/issues/81).

> **Private instances need a GPU on the server** — they render the real 3D
> store, so the machine (or container) needs working hardware GL. In Docker
> that means mapping one in: `devices: [/dev/dri:/dev/dri]`, or
> `--device /dev/dri`. Without it the container has no WebGL at all and a
> private store can never start; `/remote.html` now says so instead of waiting.
> **Docker Desktop on macOS and Windows cannot pass a GPU to a container**, so
> private instances don't work there at all. Use the **shared mirror** instead:
> open the store in a browser on the Mac or PC itself (which has a GPU), turn
> **Settings → Connection → Remote Play** on, and leave that window open —
> viewers at `/remote.html` get that store. Linux hosts with a `/dev/dri`
> mapping get both flavors.

---

<details>
<summary><b>Little things you'll notice anyway</b> — the bargain bin, live-synthesized audio, the idle screensaver, F8 bug reports</summary>

<br>

- The **bargain bin** is genuinely your library's worst-audience-scored titles,
  leaning in a rummage jumble. Critic scores are pointedly ignored.
- **Four-sided collection displays** rotate a different collection (Jellyfin
  BoxSet or Plex collection, including Plex's rule-built smart collections)
  per face, re-picked daily.
- The candy rack, tape rewinder, "BE KIND — PLEASE REWIND" tents, EAS pedestals,
  the beige security camera aimed exactly along the overview vantage.
- All the retail audio is **synthesized live** — door chime, footsteps, case
  flips, checkout chime, the search terminal's key clicks. No sample files.
- A **film-look color pipeline**: PBR-neutral or AgX response, warm-white
  fluorescent grade (real stores ran ~3500K), an optional film-emulation LUT
  with floated blacks, vignette, animated grain.
- After 5 idle minutes: the **bouncing screensaver** — a rental clamshell (or,
  30% of the time, a DVD disc) with deliberately chunky 12 fps rotation,
  wall-bounce glow flashes, DVD-player style.
- Press **F8** anywhere to file a visual bug: it snapshots exactly what you saw
  plus the camera pose and config, replayable later shot-for-shot.

</details>

---

<details>
<summary><b>Built to run forever</b> — render-on-demand idle, no per-frame allocations, systemd kiosk deployment</summary>

<br>

This app's steady state is *days on a shelf*, and it's engineered like it:

- **Render-on-demand.** Idle composites nothing; the last frame just stays on
  screen. Occlusion or focus loss stops the rAF loop entirely, pauses the
  ambient TVs, and suspends audio — near-zero CPU/GPU until you touch it.
- **No per-frame allocations**, instanced meshes for every repeat, boot-time
  shader warm-up so nothing compiles mid-session, an always-on hitch tracer
  with span attribution, and a dynamic resolution scaler that measures your
  display's real refresh rate.
- **Kiosk deployment** (`deploy/install.sh`): a systemd user service with
  restart-always, crash-loop backoff, and a 4 GB memory ceiling so even a slow
  leak self-heals. Nightly ~4 AM maintenance reload (only while the screensaver
  is up) picks up new media; tokens self-heal on wake and every 6 hours.
- Line budgets are enforced by the build; features live in composable scene
  modules, not one god file.

</details>

---

## Integrations at a glance

| You have | You get |
|---|---|
| **Jellyfin or Plex** (one of them — or demo mode) | The store, browsing, walk mode, playback, rentals, living room, clerk, themes, brand editor |
| **Jellyseerr / Overseerr** (optional) | Recommendation clasps, REQUEST / COMING SOON cases, collection gaps, discovery shelving, staff picks, FOR YOU endcaps, "order it for me" |
| **RomM** (optional) | The video-game department: per-platform bays, real carton proportions, your cover scans |
| **The server on the same machine as the TV** | mpv playback — real HDR and original lossless audio, no transcode |
| A streaming subscription (Netflix, Prime Video, Disney+, etc.) | A shelved, browsable aisle that hands you off to the service instead of playing — stocked from a direct TMDB key, Jellyseerr, or (with neither) the bundled snapshot below, so a chosen service always stocks |
| Nothing at all | `?demo=1` — the full store on a synthetic library, no server, playback disabled |

Every integration degrades by *absence*, not error: unconfigured features are
never built, and callers never branch.

<details>
<summary><b>What talks to the internet</b> — nothing, unless you switch on Jellyseerr discovery (TMDB cover art) or Remote Play (one STUN query). Details ▸</summary>

<br>

The store is built to run on your own network. Fonts, textures and every other
asset ship inside the bundle, and your media server (Jellyfin or Plex),
Jellyseerr and RomM are your own servers at your own addresses — nothing is
fetched from a CDN to draw the store.

Two optional features are the exceptions, and only while you use them:

| Feature | Reaches | What for |
|---|---|---|
| **Jellyseerr discovery** | `image.tmdb.org` | Cover art for titles you *don't* own |
| **Streaming-service aisles** | `image.tmdb.org` (posters) + TMDB/Jellyseerr's API when configured | Cover art and title data for your streaming subscriptions — see below |
| **Remote Play** | `stun.l.google.com` | Finding your public address so a viewer outside your network can connect |

Jellyseerr returns a TMDB *path* rather than the image itself — its own web UI
fetches from that same CDN — so there is no copy on your server to serve
instead. Art for titles you already own always comes from your media server,
which is why the store proper works with the internet unplugged.

Remote Play sends no video through the STUN server: it is one question ("what
address did this reach you from?") and one answer, during connection setup. Your
own TURN relay carries the actual traffic when a direct link can't be made. Note
that the query happens whenever a session negotiates, including on your own LAN
— an offline-only mode that drops it is on the roadmap rather than done.

</details>

---

## Quick start

**Clone and click.** Grab the repo, then double-click the launcher for your
platform — it checks Node, installs dependencies the first time, builds, serves
on :1420, and opens your browser at it:

| | |
|---|---|
| **Windows** | `start.cmd` |
| **macOS** | `start.command` |
| **Linux** | `start.sh` |

Add `demo` (`./start.sh demo`) to open the built-in catalog instead of the login
screen, or `dev` for the hot-reloading dev server. `HALCYON_PORT=1421` moves it
off :1420. Nothing in there is magic — it runs the npm commands below in order:

```sh
git clone https://github.com/halcyon-video/halcyon-video
cd halcyon-video
npm install
npm run dev          # dev server on :1420 — first boot shows the login /
                     # membership cards; enter your server URL + credentials
```

**Docker — the no-fuss way:**

```sh
docker run -d --name halcyon --network host --restart unless-stopped \
  ghcr.io/halcyon-video/halcyon-video
```

…or, from a clone, `docker compose up -d` (builds the image locally; the
prebuilt image is published from releases). Then:

1. Open `http://<host>:1420` in a browser and log into your media server — or
   append `?demo=1` to try it with no server at all.
2. Open `http://<host>:1420/remote.html` on a phone, tablet, or set-top box:
   the **container** renders the store and streams it over WebRTC, with your
   taps flowing back as input — see [Remote Play](#remote-play--the-store-in-your-pocket).
   To stream *your* library (not the demo), log in once from any browser and
   flip **Settings → Connection → Remote Play** on; that donates your login
   to the server. This needs a GPU in the container (`--device /dev/dri`), so
   it is a Linux-host feature — on **Docker Desktop for Mac/Windows** use the
   shared mirror instead, as described under
   [Remote Play](#remote-play--the-store-in-your-pocket).

`--network host` is what lets WebRTC offer an address other devices can
actually reach; if you only want in-browser use, `-p 1420:1420` on a normal
bridge network works too. Reaching the container by a DNS name — your NAS
name, a reverse proxy, a custom domain — needs that name in
`HALCYON_ALLOWED_HOSTS` (outside a container the machine's own hostname,
`.local` name and tailnet name already work). All the knobs are annotated in
[`docker-compose.yml`](docker-compose.yml).

### Running a store for other people

Hosting Halcyon for friends, a household, or a small community? You can wire
**Jellyseerr and RomM up once, for everyone**, so a first-time visitor lands in
a stocked store without touching the setup terminal — and without you handing
out your API keys.

Set them on the **server**, not in the build:

```sh
HALCYON_ROMM_URL=http://romm.lan:8080  HALCYON_ROMM_APIKEY=user:password \
HALCYON_JELLYSEERR_URL=http://seerr.lan:5055  HALCYON_JELLYSEERR_APIKEY=… \
  npm run serve                    # or: docker run -e HALCYON_ROMM_URL=… …
```

(`HALCYON_SEERR_*` and `HALCYON_OVERSEERR_*` are accepted as aliases, same as
the stored keys.)

Visitors are told the service **address** and nothing else. The key stays in the
server's environment: it is never inlined into the bundle, never written to a
visitor's browser storage, and never attached to a request the browser can
inspect — the built-in proxy adds it host-side on the way out, and only for the
handful of endpoints the store itself calls (catalog reads, cover art, and
"order it for me"; not user lists, not settings, not deletes, not request
approvals). A visitor who enters their *own* address in Settings → Connection
gets their own server instead; yours is a default, not a lock.

**The two ways to do this expose very different things:**

| | Where the key lives | Who can read it |
|---|---|---|
| `HALCYON_*` (recommended for hosting) | The server's environment | Only you |
| `VITE_*` in `.env.local` | Baked into the built bundle | **Every visitor** — it's in the JavaScript they download |

The `VITE_*` variables are the single-household path, and they still work:
they now seed a visitor's connection settings on first boot whether or not
`VITE_JELLYFIN_*` auto-login is also configured. Just don't reach for them on
an instance strangers can open. Whichever is in force, the store says so in the
boot console on every launch.

Your media-server login (Jellyfin/Plex) is deliberately *not* covered by this —
visitors sign into their own account, so the store shelves their libraries and
their watch history. This is only about the shared, optional side services.

**HTPC / kiosk:**

```sh
./launch.sh                    # build + serve + browser fullscreen kiosk
./deploy/install.sh            # …or install the run-forever systemd service
sudo loginctl enable-linger $USER
```

**Demo, no server:** https://halcyon-video.github.io/halcyon-video/ — or append `?demo=1` to any deployment.

**Updating.** How you update depends on how you installed — and the two Docker
routes above do *not* update the same way:

| Installed with | Update with |
|---|---|
| `docker run ghcr.io/…` (prebuilt image) | `docker pull`, then recreate the container |
| `docker compose up -d` from a clone | `git pull`, then `docker compose up -d --build` |
| Clone + launcher, or `npm` | `git pull`, then re-run the launcher (or `npm install && npm run build`) |

```sh
# Prebuilt image — no clone involved, nothing to git pull:
docker pull ghcr.io/halcyon-video/halcyon-video
docker rm -f halcyon && docker run -d --name halcyon --network host \
  --restart unless-stopped ghcr.io/halcyon-video/halcyon-video

# From a clone — compose builds the image itself, so the new code arrives by git:
git pull && docker compose up -d --build
```

`docker compose pull` is **not** the compose update path. This repo's
[`docker-compose.yml`](docker-compose.yml) builds from the clone (`build: .`)
instead of naming a published image, so compose skips the service with
`No image to be pulled` and exits successfully — leaving you on the old build
with nothing on screen to say so. `git pull` is what fetches the new code and
`--build` is what turns it into a new image. (Uncomment the `image:` line in
that file to run the prebuilt image under compose instead; then it *is*
`docker compose pull`.)

A container started with `--restart unless-stopped` keeps running its existing
image forever — restarting it, or rebooting the host, never picks up a new
release on its own.

**Development:** `npm run build` must pass (tsc + line budgets +
signage-config validation). Unit suites: `npm run test:rental`, `test:nav`,
`test:why`, `test:picks`, `test:shelf`, `test:versions`, `test:promo`,
`test:comingsoon`.

---

## FAQ

**Is this like those 3D video-store websites?**
Related genre, different species. Those are hosted demos over *streaming
catalogs* — shelves of someone else's inventory, browsed with click-to-look
controls. This is **your** library: every case is a file you own on a server
you run, playable tonight in original quality. You walk it in true first
person, it's GPL-3.0 open source, and it's built to be a daily driver — ours
has been the family's movie picker, 24/7 on the living-room TV, for months.

**Do I need a gaming PC?**
No. Render-on-demand means it only draws when something changes, a dynamic
resolution scaler fits it to your hardware, and the **2.5D mode** runs the
whole store as HTML/CSS on a Raspberry Pi.

**Does it work with Plex or Emby?**
Plex, yes — see [below](#plex). Emby is next: the media layer is one module
behind a provider interface, so a backend is a new file rather than a fork of
the client, and [issue #32](https://github.com/halcyon-video/halcyon-video/issues/32)
is the one to watch or chime in on.

### Plex

Pick **PLEX** as the distributor on the opening-day terminal (or in the browser
login form) and press connect. Plex doesn't let other apps take your password,
so instead the store shows a short code: type it at
[plex.tv/link](https://plex.tv/link) on any device, and the servers on your
account appear — you don't have to know your server's address.

Everything the store does with a Jellyfin library it does with a Plex one:
shelves, artwork, collections as endcaps, series, resume points, watched state
feeding the clerk's recommendations, direct play with an HLS fallback.

Two differences worth knowing. The fanned **membership cards** don't appear —
Plex home users hang off your plex.tv account rather than being a list the
server hands out, so the card rack has nothing to draw and sign-in goes through
the code instead. And **actor portraits** on the wall décor stay generic: Plex
only returns cast photos on a per-title request, and fetching one request per
title to decorate a wall isn't worth what it costs a big library.

**Can I run it in Docker?**
Yes — see [Quick start](#quick-start). One `docker run` with `--network host`,
or `docker compose up -d` from a clone to build the image locally.

**Can I make it look like the video store I grew up with?**
See [Make it yours](#make-it-yours). The app ships a fictional brand and takes
whatever identity you drop in the folder — locally, on your machine.

**Why "Halcyon"?**
*Halcyon days* — a period remembered as idyllically happy and peaceful. Friday
night, new releases, a full bag. That's the register the whole app aims for.

---

## Roadmap

- Plex / Emby source adapters (most requested)
- A published desktop build — the Tauri shell exists in-tree but isn't
  released yet; it's what unlocks HDMI-CEC display control, system suspend,
  and launching a game in a native emulator
- More period fixtures and eras
- More clerk conversations, more rituals

---

## Support

![The tip jar on the counter](docs/screenshots/tip-jar.jpg)

There's a mug and a card by the register, and the card has a QR on it. If this
made you grin, you can [buy me a coffee on Ko-fi
(halcyonvideo)](https://ko-fi.com/halcyonvideo). No tiers, no paywall — the app is
GPL and complete either way. It just funds the next fixture. (Not for you? The
jar switches off in Store Look.)

---

## License, and how this project is run

**GPL-3.0.** Fork it, mod it, ship your own store — but keep it open.

**The source is open; the development is not. This project does not accept
pull requests.** It is one person's product, built for one living room and
shared because it turned out well — not a collaboration looking for
contributors. Bug reports are welcome and questions get answered; patches,
feature votes and design-by-committee are not the model here. If you want it
to go somewhere else, the license says you may: fork it and take it there.
See [CONTRIBUTING.md](CONTRIBUTING.md).

---

*Halcyon Video is a fictional brand created for this project. This repository
contains no third-party trademarks or brand assets: no real chain's name,
logo, trade dress, or typefaces are included or distributed. Movie artwork
visible in screenshots is the demo catalog's public-domain and CC-BY one-sheets
(see `public/demo-posters/ATTRIBUTION.md`); the game covers in the games-department
shots are library metadata from the author's personal RomM server. This project
is not affiliated with, endorsed by, or connected to any
video-rental company, past or present — it is a love letter to Friday nights
at all of them.*

*The streaming-service aisles' bundled offline snapshot
(`src/data/streaming-snapshot.json`, refreshed with
`tools/refresh-streaming-snapshot.mjs`) and any live TMDB/Jellyseerr lookup are
title data and poster art only — no service logos or marks. This product uses
the TMDB API but is not endorsed or certified by TMDB.*
