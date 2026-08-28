# Changelog

All notable changes to Halcyon Video, generated from commit history by
`tools/release-notes.mjs` — see `.github/workflows/announce.yml`, which runs
it on every version tag push. Deterministic and offline: no entry here was
written by a model.

## [v0.11.0] — 2026-08-28

### CHANGELOG
- V0.10.0
- V0.9.3

### General
- Feat(touch): give the 3D store real touch controls (Closes [#126](https://github.com/halcyon-video/halcyon-video/issues/126))
- Feat(operator): server-managed Jellyseerr/RomM credentials for hosted stores (Closes [#129](https://github.com/halcyon-video/halcyon-video/issues/129))
- Fix(plex): give the sync stage timeouts, so a hang fails fast and named (Closes [#128](https://github.com/halcyon-video/halcyon-video/issues/128))
- Fix(docker): brand drop-in overlay via bind mount for user-assets (Closes [#127](https://github.com/halcyon-video/halcyon-video/issues/127))
- Fix(mobile): a phone visitor lands in a store they can actually use
- Fix(announce): land the CHANGELOG on the master that exists, and never block the release

## [v0.10.0] — 2026-08-27

### General
- Fix(plex): probe a typed address at connect, and stop forcing it to http:// (Closes [#125](https://github.com/halcyon-video/halcyon-video/issues/125))
- Feat(setup): add a real credential reset — Forget This Server & Start Over (Closes [#124](https://github.com/halcyon-video/halcyon-video/issues/124))
- Feat(config): keep the store on the media server, not in one browser (Closes [#123](https://github.com/halcyon-video/halcyon-video/issues/123))

## [v0.9.3] — 2026-08-26

### Announce-fanout
- A lightweight tag has no message — stop announcing its commit

### CHANGELOG
- V0.9.2

### General
- Fix(layout): surface niche genres as their own 3D sections instead of dumping them in GENERAL (Closes [#117](https://github.com/halcyon-video/halcyon-video/issues/117))
- Fix(plex): prioritize LAN IP and forget account on server change (#120, #121)

## [v0.9.2] — 2026-08-25

### Android TV
- The store gets its own launcher tile, not a browser (Closes [#85](https://github.com/halcyon-video/halcyon-video/issues/85))

### CHANGELOG
- V0.9.1

### Mom & pop
- The till moves off the doorway and onto the side wall (Closes [#116](https://github.com/halcyon-video/halcyon-video/issues/116))

### README
- Document the Roku decision — no browser, no app coming

### General
- Fold the clerk teardown onto one line to hold the three-scene budget
- The emblem studio gets the pointer the player got
- The player's controls get a pointer you can actually see
- The clerk's sheet can hand out its own poses, not just its art
- Release picture for v0.9.1: the shelves, not the desk close-up
- Announce-fanout: cap Discord's embed, fix silent sentence-split data loss
- Announce-fanout: cap Discord's embed, fix silent sentence-split data loss
- Release picture for v0.9.1: the actual mom & pop interior, not the corporate store
- Release picture for v0.9.1: a properly sunset-lit interior
- Clean up clerk sprite, textures, and in-flight atlas swaps on scene teardown
- Clean up VR affordance click listener and add disposeVR on scene teardown

## [v0.9.1] — 2026-08-23

### CHANGELOG
- V0.9.0

### Mom & pop
- The props catch up with the moved desk, and the shop is one pick

### General
- Re-announce every channel by default — a bad post is bad everywhere
- Re-announce must run the current tooling, not the tree that got it wrong
- Re-announce must run the current tooling, not the tree that got it wrong
- A way to re-announce a release whose post went out wrong
- Announce posts must say what was added, not recite git log

## [v0.9.0] — 2026-08-23

### Announce
- Broadcast posts identify what Halcyon IS (Closes [#107](https://github.com/halcyon-video/halcyon-video/issues/107))
- A missing image must never cost the Mastodon post
- The release picture must show what actually shipped

### Announce fan-out
- Every post carries a picture, and the right MIME
- Make the demo link on Bluesky an actual link

### Announce the ship
- Fan a release out to Discord, Mastodon, Bluesky and X (Closes [#105](https://github.com/halcyon-video/halcyon-video/issues/105))

### Emblem editor
- Build the store's logo out of layered shapes (Closes [#34](https://github.com/halcyon-video/halcyon-video/issues/34))

### Mom & pop
- Its own building, a real door, and a set behind the till (Closes [#110](https://github.com/halcyon-video/halcyon-video/issues/110))
- A small shop's ceiling is a ceiling (Closes [#114](https://github.com/halcyon-video/halcyon-video/issues/114))
- No chrome overhead, no chain furniture on the desk (Closes [#112](https://github.com/halcyon-video/halcyon-video/issues/112))
- The store's shape becomes data, not another theme (Closes [#33](https://github.com/halcyon-video/halcyon-video/issues/33))

### Release announce
- Never let the missing screenshot harness kill a release

### Release notes
- A reverted commit never reaches the notes

### Streaming picker
- A way back in for a store that is already open (Closes [#96](https://github.com/halcyon-video/halcyon-video/issues/96))

### VR
- Carry a picked-up movie to the counter instead of warping to flat checkout (Closes [#97](https://github.com/halcyon-video/halcyon-video/issues/97))

### General
- Take the clerk sheet apart so one cell at a time is possible
- The emblem editor gets a workbench instead of a drawer (Closes [#111](https://github.com/halcyon-video/halcyon-video/issues/111))
- The 1993 signs are the 1993 store, not a switch you flip (Closes [#113](https://github.com/halcyon-video/halcyon-video/issues/113))
- Move the streaming stock out of main.ts, under the line budget
- Picking streaming services must actually stock the shelves
- A mixed store must not hand Plex a Jellyfin URL (Closes [#84](https://github.com/halcyon-video/halcyon-video/issues/84))
- One store, stocked from every server you have (Closes [#84](https://github.com/halcyon-video/halcyon-video/issues/84))
- Release notes generate themselves: CHANGELOG + auto-cut GitHub Release on tag push (Closes [#104](https://github.com/halcyon-video/halcyon-video/issues/104))
- Expose streaming-service and TMDB settings in drawer for existing stores (Closes [#96](https://github.com/halcyon-video/halcyon-video/issues/96))
- Atlas the low-res poster bank so the layer budget stops being a wall (Closes [#60](https://github.com/halcyon-video/halcyon-video/issues/60))
- Custom clerk sprite sheets: user-assets drop-in + template export (Closes [#98](https://github.com/halcyon-video/halcyon-video/issues/98))

## [v0.8.1] — 2026-08-21

### General
- VR headsets can enter VR without a keyboard

## [v0.8.0] — 2026-08-21

### Counter CRT
- Fit the whole menu ring instead of silently clipping it (Closes [#77](https://github.com/halcyon-video/halcyon-video/issues/77))

### README
- VR walk mode and streaming aisles join the quick answers

### Remote Play
- Cut the half-second of latency; forward viewer gamepads
- Ask the encoder for a real bitrate budget

### TV mode
- On-screen BACK the TV browser's pointer can click

### TV sniff
- Google TV devices say their model name, not GoogleTV

### Zero-setup streaming
- Bundled snapshot floor, demo defaults, opening-day picker

### General
- Fix playback routing unit tests for async transcode preflight
- Streaming sections work without Jellyseerr: stock straight from TMDB
- Shelve streaming-service titles; hand off to the service instead of playing (Closes [#86](https://github.com/halcyon-video/halcyon-video/issues/86))
- Pre-flight Plex's transcode decision before start.m3u8 (Closes [#76](https://github.com/halcyon-video/halcyon-video/issues/76))
- Wire WebGL context-loss recovery before boot, not after (Closes [#78](https://github.com/halcyon-video/halcyon-video/issues/78))
- TV-remote mode for the Remote Play viewer
- WebXR VR walk mode (v1) (Closes [#79](https://github.com/halcyon-video/halcyon-video/issues/79))
- Paint the boot overlay before the store build blocks the thread
- Keep a case's reflection probe alive across a re-bake and a rebuild

## [v0.7.8] — 2026-08-20

### General
- Hand a Remote Play viewer to the new canvas the moment the scene rebuilds (Closes [#73](https://github.com/halcyon-video/halcyon-video/issues/73))
- Move a ceiling TV on to another title instead of looping it forever (Closes [#70](https://github.com/halcyon-video/halcyon-video/issues/70))
- Release a dead ceiling-TV decoder before it poisons Remote Play's capture (Closes [#72](https://github.com/halcyon-video/halcyon-video/issues/72))
- Fix duplicate studio-spotlight facings and let users pick featured studios (Closes [#26](https://github.com/halcyon-video/halcyon-video/issues/26))
- Let PlexProvider notice its own connection instead of waiting to be told (Closes [#69](https://github.com/halcyon-video/halcyon-video/issues/69))
- Surface the poster layer budget shortfall on the counter terminal
- Delete the mismatched-id episode-path fallback in the 2.5D detail view (Closes [#71](https://github.com/halcyon-video/halcyon-video/issues/71))

## [v0.7.7] — 2026-08-19

### General
- Let the image build see the provider-boundary guard

## [v0.7.6] — 2026-08-19

### General
- Drill into a Plex series instead of asking it for a Jellyfin user id (Closes [#66](https://github.com/halcyon-video/halcyon-video/issues/66))
- Give the ceiling TVs the same segment loader the full-screen player uses
- Give a remote viewer a system menu they can see, and stop offering them 2.5D (Closes [#62](https://github.com/halcyon-video/halcyon-video/issues/62), [#65](https://github.com/halcyon-video/halcyon-video/issues/65))
- Put the remote viewer's controls back within reach, and name the playback keys (Closes [#63](https://github.com/halcyon-video/halcyon-video/issues/63), [#64](https://github.com/halcyon-video/halcyon-video/issues/64))
- Connect a saved session on a token, not on a Jellyfin user id
- Put a TV-Shows library's episodes on the ceiling TVs (Closes [#67](https://github.com/halcyon-video/halcyon-video/issues/67))
- Ask the provider for a series' episodes in 2.5D, not Jellyfin
- Fall back on the ceiling TVs when the stream never arrives
- Ask the store's own backend for the ceiling TVs' stream
- Take bug reports on the tracker, and quarantine outside input mechanically
- Say why a private Remote Play store can't start instead of "still booting"
- Point people at the Discord from the README and the issue chooser

## [v0.7.5] — 2026-08-17

### General
- Decode the inspected case's cover art at hero resolution
- Bound the resolution scaler's fps target to a rate it can actually buy (Closes [#61](https://github.com/halcyon-video/halcyon-video/issues/61))

## [v0.7.4] — 2026-08-16

### General
- Reschedule the texture upload drain on both lanes, not just the bulk one (Closes [#59](https://github.com/halcyon-video/halcyon-video/issues/59))
- Keep the cover box when there is no clamshell to stand in for it (Closes [#58](https://github.com/halcyon-video/halcyon-video/issues/58))
- Stop a long Plex server name from shoving the third login column off-screen

## [v0.7.3] — 2026-08-16

### README
- Say how to update, per install route

### General
- List a Plex server's libraries through the provider, not Jellyfin's

## [v0.7.2] — 2026-08-16

### General
- Mint the Plex sign-in code people can actually type
- Make the rental receipt readable from the couch
- A rented tape plays fullscreen, not on the back room's CRT

## [v0.7.1] — 2026-08-16

### General
- Fit the movie vertically on the store CRTs instead of stretching it

## [v0.7.0] — 2026-08-16

### README
- Call out Media Release Date, the CRT loop, and clone-and-click

### General
- Play a bundled loop on the store CRTs when there's nothing to stream
- Add a click-to-start launcher for a fresh clone
- Stamp the store date on screen while the catalog is pinned

## [v0.6.5] — 2026-08-15

### General
- Centre the portraits on the film strip's own line
- Hang the portraits bigger, and stop them glowing

## [v0.6.4] — 2026-08-15

### General
- Put the tip card in an acrylic holder, big enough to read
- Hang six actor portraits in the room, not eighteen
- Show the whole store rebranding, not just the tape
- The checkout counter follows the brand too
- Let a brand repaint the store's livery, not just its emblem

## [v0.6.3] — 2026-08-15

### General
- Take the 2010 wall band out — the back wall reads as clutter
- Slow the README GIFs down to something a person can read
- Put three real stores in the README instead of one invented logo
- Keep the box print legible when the house colour is light
- Show the rebrand at the top of the README, not 300 lines down
- Stop a dropped brand.txt from naming the store twice
- Stop the brand editor's font picker from painting in the system sans
- Never let a hidden text field hold the remote hostage
- Stop telling Plex users they are connected to Jellyfin

## [v0.6.2] — 2026-08-14

### General
- Keep the checkout bag's plastic on its own side of the contents
- Take the ceiling cornice around the stepped corner, not through it
- Play from the server the catalog came from

## [v0.6.1] — 2026-08-13

### General
- Play from the server the catalog came from

## [v0.6.0] — 2026-08-13

### 2.5D
- The flat stylesheet still wore the old gold

### README
- The store speaks Plex now

### General
- Bump nanoid past the indefinite-loop advisory
- Supply the store from Plex
- Move the direct-play decision out of the Jellyfin client
- Register the games-department ceiling sign as a real slot
- Reshoot every README screenshot for the cream livery

## [v0.5.4] — 2026-08-13

### Brand
- Cream house ink, one source of truth, live recolor

### Signage
- Period dressing deploys only in its own era

## [v0.5.3] — 2026-08-13

### General
- Read a Letterboxd feed into watch history
- Resolve the install's backend in one place
- Boot the store through the provider, not through Jellyfin
- Build every catalog artwork URL in one place
- Put a media-server boundary between the store and Jellyfin

## [v0.5.2] — 2026-08-13

### General
- Drain the mirrors a player can see before the loop sleeps (Closes [#11](https://github.com/halcyon-video/halcyon-video/issues/11))

## [v0.5.1] — 2026-08-13

### General
- Reshoot the 1993-dressing thumbnails from a clone without user-assets

## [v0.5.0] — 2026-08-13

### General
- Accept Overseerr wherever Jellyseerr is accepted
- Speak Jellyfin's own auth header, and stop sharing one device id

## [v0.4.1] — 2026-08-13

### General
- Say what rental mode costs you, and what the 1993 row actually does
- Never strand the player over the login screen when a session dies
- Warm the case shaders the store actually draws, not probe-less lookalikes

## [v0.4.0] — 2026-08-11

### README
- Cut the claims that don't ship, add a way to navigate

### Remote Play
- Touch controls, so "the store in your pocket" works on a phone

### General
- Stop a mirror from punching a black hole in another mirror's reflection
- Record why box-projected cubemap mirrors don't work in this room
- Stand a four-sided mirrored column in the back cross-aisle
- Spend the mirror refresh budget on reflections you can actually see
- Give the wire shelving and the walls the anisotropy they were missing
- Stop boot texture uploads from softening the store, and hold the settle cap
- Refresh the live mirrors at 20Hz instead of every frame
- Let the entrance view reach its settle frame, so it stops looking soft
- Fix private Remote Play instances switching their own stream off
- Render text subtitles client-side instead of re-encoding the film for them
- Bring back the arm64 image, on native runners instead of QEMU (Closes [#48](https://github.com/halcyon-video/halcyon-video/issues/48))
- Offer the 2D store to phones and WebGL2-less browsers instead of a dead end (Closes [#47](https://github.com/halcyon-video/halcyon-video/issues/47))

## [v0.3.1] — 2026-08-09

### General
- Answer to this machine's own names, not just localhost and raw IPs

## [v0.3.0] — 2026-08-09

### Ambient ceiling TVs
- Choose which libraries feed the playback pool (Closes [#39](https://github.com/halcyon-video/halcyon-video/issues/39))

### Opening day
- An empty store is empty -- no bin, no clerk, no ghost cursors
- Sign in to a server that lists no membership cards

### General
- The store has one navigation layer: the jump index IS the entrance view
- Offer 2D MODE from the jump index, not just the entrance overview
- Fix four input-ownership / state-restore bugs in store navigation
- Call floor fixtures the same thing on the cursors as in the index
- Run the tape-return chute back to the counter's inside face
- Close the open slot running under the checkout counter's top
- Put the checkout counter in the jump index
- Don't let F walk away from a docked counter CRT
- 1993 ceiling category wedges: solid lit equilateral bodies, per-genre colors, GAMES
- First-run as the store's opening day: NEW STORE SETUP on the counter CRT (Closes [#41](https://github.com/halcyon-video/halcyon-video/issues/41))
- Extract the boot/credentials flow out of main.ts into boot-flow.ts

## [v0.2.1] — 2026-08-08

### General
- Publish the Docker image amd64-only until arm64 gets a native runner

## [v0.2.0] — 2026-08-08

### Back room
- Props forward, receipt down to the bottom edge
- Shoot across the table, TV out of focus

### Ceiling genre nav
- Die-cut banners become ceiling-attached wedges (Closes [#23](https://github.com/halcyon-video/halcyon-video/issues/23))

### Checkout
- Up at the register talks to the clerk

### Coffee table
- Dark blonde wood, from a real scan

### Counter props
- Remove the HOT PIX preview-guide boxes (Closes [#9](https://github.com/halcyon-video/halcyon-video/issues/9))
- Glossy latex balloons, real desk phone clear of the snap frame (Closes [#21](https://github.com/halcyon-video/halcyon-video/issues/21), [#22](https://github.com/halcyon-video/halcyon-video/issues/22))

### Demo
- Build the games department

### Desk terminals
- Keyboard seated and readable, CRT pushed to the island's back (Closes [#20](https://github.com/halcyon-video/halcyon-video/issues/20))

### Docker
- Remote Play in the container + published multi-arch image
- One-command containerized deployment

### DVD wrap
- Blue cream-stock variant, typed-metadata passes extracted

### Entrance
- Size the terminal monitor off the real island depth

### Hero soft-cover
- Read art from the texture-array CPU mirrors

### Nav
- Browse cursor honors fixture-declared column counts; TV peek moves to the jump-index (Closes [#24](https://github.com/halcyon-video/halcyon-video/issues/24), [#31](https://github.com/halcyon-video/halcyon-video/issues/31))

### Outdoor lighting
- Scale the env-probe height with the ceiling preset

### Perf follow-up
- Poster cache unbounded by default, fps cap follows the supersample grant

### Performance
- Pace the render rate, calibrate quality by measurement, compress surfaces, bound poster caches

### Performance wave 2
- Idle partial-composite, miss-tolerant bounded poster caches, low-tier settle sharpness

### Previously Viewed
- Move it beside the front counter, right side

### Previously Viewed table
- Beside the register, and restocked after every watch (Closes [#28](https://github.com/halcyon-video/halcyon-video/issues/28))

### Promo faces
- One medium per face (Closes [#27](https://github.com/halcyon-video/halcyon-video/issues/27))

### README
- A four-GIF grid of what the store can look like
- Show the games department
- Answer the reflex questions above the fold

### Receipt
- Real rented titles, real checkout stamp, DUE BACK printed last and largest
- Overdrive the ink so it survives the room's light

### Rental receipt
- Redraw against a real 1995 register slip

### Settings UX
- Signpost the manager terminal at the counter
- Controls & Help page + measured drawer pagination
- Surface Performance group + Service Mode row on the index

### Shell
- Sill-stopped window jambs, ribbon posters both sides, mitred mirror cornice, vent fixes (Closes [#15](https://github.com/halcyon-video/halcyon-video/issues/15), [#16](https://github.com/halcyon-video/halcyon-video/issues/16), [#17](https://github.com/halcyon-video/halcyon-video/issues/17), [#18](https://github.com/halcyon-video/halcyon-video/issues/18), [#19](https://github.com/halcyon-video/halcyon-video/issues/19))

### Slatwall
- Anisotropic filtering for the aisle-length grazing angle

### Soffit cornice mirror
- Track the drawing buffer, drop the headless pin

### Splash emblem
- True Blue board — white letters + pinstripe on blue, text set straight

### Store plan
- Flush row chunks stay one section (Closes [#29](https://github.com/halcyon-video/halcyon-video/issues/29))

### Storefront
- Full-width panes on the sliding-gray front (#4) (Closes [#4](https://github.com/halcyon-video/halcyon-video/issues/4))

### Sub-nav
- Open the jump index from the shelf-select views

### TV peek
- Select jumps to the box of whatever's playing

### Vestibule
- Storefront-proportion glass cap + solid soffit on tall ceilings (Closes [#30](https://github.com/halcyon-video/halcyon-video/issues/30))

### Wall decor
- Span the portraits and film strip across all three back walls
- Featured-actor portraits + film-strip ribbon (high ceiling) (Closes [#25](https://github.com/halcyon-video/halcyon-video/issues/25))

### General
- Let the New Releases wall's window-side unit use the space it already sized (Closes [#6](https://github.com/halcyon-video/halcyon-video/issues/6))
- Face window posters at the street, not the sales floor (Closes [#5](https://github.com/halcyon-video/halcyon-video/issues/5))
- Take down the red rental-term cards over the entrance doors (Closes [#3](https://github.com/halcyon-video/halcyon-video/issues/3))
- Take down the red ceiling card over the back-wall floor displays (Closes [#2](https://github.com/halcyon-video/halcyon-video/issues/2))
- Scale the tip QR card up so it is actually worth scanning (Closes [#10](https://github.com/halcyon-video/halcyon-video/issues/10))
- Give the inspected case the reflections the shelf copies already have (Closes [#40](https://github.com/halcyon-video/halcyon-video/issues/40))
- Resume where you left off, on both player paths
- Signal who is driving the store era, and let a manual pick win (#42)
- Pin the store's catalog to a rolling point in time (#42)
- Ground the tapes and the receipt on the table
- Reshoot the living room: the shots predated everything in it
- Ship the coffee table's wood scan instead of hiding it in user-assets
- Call it the living room, not the back room
- Expose the emulator command as a setting
- Game sections describe their asymmetric end caps honestly (Closes [#38](https://github.com/halcyon-video/halcyon-video/issues/38))
- Assert case pairs actually fit, and fix the fat jewel case it caught
- Rental shells sit behind the parting plane, not across it
- Reshoot the games screenshots after the shell fix
- Rental shells stand on the shelf instead of sinking through it
- Launch.sh: flock the kiosk launcher against the boot-time double-start
- Bundle the DOM webfonts; disclose the two remaining outbound calls
- Store-layout: back out the not-yet-landed rowGroupId field
- Fixtures: declare the optional refreshStock hook on SlottedFixture
- Remove the FAST DROP signage from the vestibule glazing (Closes [#14](https://github.com/halcyon-video/halcyon-video/issues/14))
- Add aggregate npm test script running the whole suite
- Development snapshot (squashed)

## [v0.1.0] — 2026-08-04

### General
- Halcyon Video v0.1.0 — initial public release
