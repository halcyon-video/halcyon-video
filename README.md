# Halcyon Video — a 3D video store for your media server

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

> **Heads-up:** the demo boots the entire ~2,000-title store into your browser —
> expect a few GB of memory and real GPU use, and prefer a plugged-in machine
> over a laptop on battery. (It's built to live on a dedicated HTPC, where it
> idles near zero; a leaner demo is on the list.)

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

### Does it…?

The short answers, so you don't have to go looking for them.

| | |
|---|---|
| **Run in Docker?** | Yes — one `docker run`, or `docker compose up -d` from a clone. [Quick start ↓](#quick-start) |
| **Do video games?** | Yes — point it at [RomM](https://github.com/rommapp/romm) and a whole department appears: per-platform bays, period-correct boxes and jewel cases. [More ↓](#the-games-department) |
| **Work with Plex?** | Yes — Jellyfin and Plex both. Type the address and the store works out which one answered; Plex signs in with a code on `plex.tv/link`, and its Home users become the membership cards. Emby is not supported. [More ↓](#which-media-server) |
| **Run on a Raspberry Pi?** | Yes — **2.5D mode** runs the same store as plain HTML/CSS. [More ↓](#25d-mode--the-same-store-for-a-raspberry-pi) |
| **Work away from home?** | Yes — **Remote Play** streams the live store to any browser, with its own TURN relay for off-LAN viewers. [More ↓](#remote-play--the-store-in-your-pocket) |
| **Look like *my* video store?** | Yes — brand, logo, colors, themes, fixtures and sign art are all data you drop in a folder, not code. [More ↓](#make-it-yours) |
| **Work with no media server at all?** | The demo does — it ships its own synthetic catalog, which is the link above. Shelving *your* files needs Jellyfin; there's no built-in folder scanner. |

### Jump to

**Get it running:** [Quick start](#quick-start) — npm, Docker, or HTPC kiosk · [FAQ](#faq)

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

![First-person walk mode](docs/screenshots/walk-mode.jpg)

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

![SEARCH> GOONIES](docs/screenshots/search-terminal.jpg)

---

## Rent it like it's 1994

![The checkout ritual](docs/screenshots/checkout-ritual.jpg)

- **Carry mode:** take a tape and it joins a hand-fanned stack at the bottom of
  your view. **C** walks you to the counter; **hold Enter** goes straight to
  checkout with a gold hold-meter pill.
- **The bag is a real soft body.** The glossy white pillow bag is a ~340-node
  cloth simulation — two welded sheets, die-cut handle punched through both
  layers. Drop a case in and the plastic visibly pushes out around it; pick it
  up and it droops and sways under gravity, then settles. (And then the solver
  goes to sleep, because nothing here is allowed to burn watts at idle.)

![Tapes settled inside the bag](docs/screenshots/checkout-bag.jpg)

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

With **[Jellyseerr](https://github.com/fallenbagel/jellyseerr)** connected, the
store quietly merchandises around your collection:

- **Collection gaps**: own 3 of the 4 Alien films? The missing one stands on
  the shelf as an empty box with a blue **REQUEST** corner label. Select it and
  the label restamps **gold COMING SOON**, live, while the clerk toasts that
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
- Playback reports back to your server (start/progress/stop), so resume points and
  watch history — which feed the staff picks — stay honest.

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

### Membership cards

Server users appear as **laminated membership cards** — deterministic member
numbers, "MEMBER SINCE", the user's avatar, a glint sweep. Picking your card is
how you log in; cards flip over for password entry.

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

One level deeper, a **brand pack** (`public/user-assets/brands/<id>/` with a
`brand.json`) controls everything individually: palette, display fonts, vector
emblem paths, per-sign art, wrap prints, rendered strings. There's also a live
**brand editor** in the settings drawer with complete original presets in the
box (Megahit Video, Reel Time, and Night Owl — "OPEN ALL NIGHT"). Run
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
walks the aisles at full fidelity. Until someone donates a login
(**Settings → Connection → Remote Play**, from any logged-in browser), the
instances boot the demo library. Give the server hardware GL (`/dev/dri`)
for the smoothest streams; instances are capped (`REMOTE_PLAY_MAX_INSTANCES`,
default 2) and viewers past the cap are turned away until one frees up.

---

<details>
<summary><b>Little things you'll notice anyway</b> — the bargain bin, live-synthesized audio, the idle screensaver, F8 bug reports</summary>

<br>

- The **bargain bin** is genuinely your library's worst-audience-scored titles,
  leaning in a rummage jumble. Critic scores are pointedly ignored.
- **Four-sided collection displays** rotate a different collection per
  face, re-picked daily.
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
| **Jellyfin or Plex** (required — or demo mode) | The store, browsing, walk mode, playback, rentals, living room, clerk, themes, brand editor |
| **Jellyseerr** (optional) | Recommendation clasps, REQUEST / COMING SOON cases, collection gaps, discovery shelving, staff picks, FOR YOU endcaps, "order it for me" |
| **RomM** (optional) | The video-game department: per-platform bays, real carton proportions, your cover scans |
| **The server on the same machine as the TV** | mpv playback — real HDR and original lossless audio, no transcode |
| Nothing at all | `?demo=1` — the full store on a synthetic library, no server, playback disabled |

Every integration degrades by *absence*, not error: unconfigured features are
never built, and callers never branch.

<details>
<summary><b>What talks to the internet</b> — nothing, unless you switch on Jellyseerr discovery (TMDB cover art) or Remote Play (one STUN query). Details ▸</summary>

<br>

The store is built to run on your own network. Fonts, textures and every other
asset ship inside the bundle, and your media server, Jellyseerr and RomM are your own
servers at your own addresses — nothing is fetched from a CDN to draw the store.

Two optional features are the exceptions, and only while you use them:

| Feature | Reaches | What for |
|---|---|---|
| **Jellyseerr discovery** | `image.tmdb.org` | Cover art for titles you *don't* own |
| **Remote Play** | `stun.l.google.com` | Finding your public address so a viewer outside your network can connect |

Jellyseerr returns a TMDB *path* rather than the image itself — its own web UI
fetches from that same CDN — so there is no copy on your server to serve
instead. Art for titles you already own always comes from your own server, which is why
the store proper works with the internet unplugged.

Remote Play sends no video through the STUN server: it is one question ("what
address did this reach you from?") and one answer, during connection setup. Your
own TURN relay carries the actual traffic when a direct link can't be made. Note
that the query happens whenever a session negotiates, including on your own LAN
— an offline-only mode that drops it is on the roadmap rather than done.

</details>

---

## Quick start

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
   to the server.

`--network host` is what lets WebRTC offer an address other devices can
actually reach; if you only want in-browser use, `-p 1420:1420` on a normal
bridge network works too. Reaching the container by a DNS name — your NAS
name, a reverse proxy, a custom domain — needs that name in
`HALCYON_ALLOWED_HOSTS` (outside a container the machine's own hostname,
`.local` name and tailnet name already work). All the knobs are annotated in
[`docker-compose.yml`](docker-compose.yml).

**HTPC / kiosk:**

```sh
./launch.sh                    # build + serve + browser fullscreen kiosk
./deploy/install.sh            # …or install the run-forever systemd service
sudo loginctl enable-linger $USER
```

**Demo, no server:** https://halcyon-video.github.io/halcyon-video/ — or append `?demo=1` to any deployment.

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

<a id="which-media-server"></a>
**Does it work with Plex or Emby?**
Jellyfin and Plex both; Emby is not supported. The media layer sits behind one
interface (`src/media-backend.ts`) with a backend on either side of it, and the
store picks between them by asking the address you typed which one it is — so
there is no server type to declare, just an address.

The two differ in exactly three places you'll notice:

- **Signing in.** Jellyfin takes a name and password. Plex shows a four-letter
  code on the counter terminal that you approve at `plex.tv/link` from your
  phone — no keyboard needed on the HTPC, and the only route that works with
  two-factor auth. You can also paste an `X-Plex-Token` into the sign-in screen
  or `VITE_PLEX_TOKEN`, which is what a headless or scripted deploy wants.
- **Membership cards.** Jellyfin fans out its public user list; Plex fans out
  your **Plex Home** members, and picking one switches to that member's own
  token so watch state and resume points land on their history, not yours.
- **Speed.** A Plex sync is markedly faster — a section listing arrives whole
  instead of paged, and full metadata comes back comma-batched. A 458-title
  library syncs in about 3 seconds.

One Plex quirk worth knowing about, because it is Plex's and not ours: a Plex
Media Server only allows browser requests from `localhost`, and answers every
other origin with a fixed `app.plex.tv` CORS header — with no setting to add
your own, the way Jellyfin has. So a store served over the LAN
(`http://<host>:1420`) would have every request to Plex blocked by the browser.
Halcyon handles that itself: media-server traffic is routed through its own
`/plex-proxy` endpoint, host-side, where CORS doesn't apply. Nothing to
configure — but it is why Plex needs the app's server (`npm run dev` /
`npm run serve` / Docker) rather than a bare static host. The desktop build
doesn't go near this: its requests never touch a browser policy.

Everything downstream — shelves, collections, the Bargain Bin, staff picks,
4K stickers, quality-version pickers, resume, Jellyseerr requests — works the
same on both.

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
- VR walk mode experiments
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
visible in screenshots is library metadata from the author's personal library
server. This project is not affiliated with, endorsed by, or connected to any
video-rental company, past or present — it is a love letter to Friday nights
at all of them.*
