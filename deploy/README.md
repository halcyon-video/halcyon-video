# Run-forever deployment (issue #16)

Runs the Halcyon store 24/7 on the HTPC as a systemd **user** service that
auto-restarts on crash, OOM, or `kill -9`, and boots straight into the store
using cached media-server credentials (Jellyfin or Plex; no blocking dialogs
on an unattended restart).

## Quick install

```bash
cd media-server-video-store
./deploy/install.sh
# one-time, so it survives logout / starts on boot:
sudo loginctl enable-linger "$USER"
```

`install.sh` installs npm deps if needed, writes
`~/.config/systemd/user/halcyon.service` with this checkout's real path
substituted in, imports the graphical-session environment, and runs
`systemctl --user enable --now halcyon.service`.

## What it runs

By default the service launches `./launch.sh` — the project's documented
runtime: it starts the Vite dev server and opens Brave in `--app` fullscreen
kiosk mode. To run the **compiled Tauri binary** instead:

```bash
npm run tauri build
# then edit ExecStart in the unit (see the commented line in halcyon.service)
# to point at src-tauri/target/release/tauri-app, and re-run daemon-reload.
```

## Watchdog & memory self-heal

- `Restart=always`, `RestartSec=5` — any exit is restarted after 5s.
- `StartLimitIntervalSec=120` / `StartLimitBurst=10` — a hard crash loop backs
  off instead of hammering forever.
- `MemoryMax=4G` (`MemoryHigh=3G`) — a slow multi-day leak self-heals: the
  cgroup is OOM-killed at 4G and `Restart=always` brings the store right back.
  Lower it if the box is memory-tight; raise it for very large libraries.

## Operations

```bash
systemctl --user status halcyon          # state
journalctl --user -u halcyon -f          # live logs
systemctl --user restart halcyon         # manual restart
./deploy/uninstall.sh                         # remove the service
```

## Verifying the run-forever hardening

- **Idle / occlusion throttle** — append `?perf=1` to the URL (or launch.sh) to
  show the diagnostics HUD (STATE, HEAP, FRAMES, RES, DRAW, TRIS, GEO/TEX).
  - Leave the store visible and untouched: STATE settles to `idle` and the
    FRAMES counter stops climbing (the compositor renders nothing on demand).
  - Switch to another app / IPTV / a game: STATE shows `idle (rAF off)` and
    FRAMES freezes entirely — the render loop, ambient-TV textures, and the
    AudioContext are all suspended. Confirm with `top` / `radeontop` /
    `intel_gpu_top` that CPU and GPU are near-zero.
  - Switch back: instant wake, no flicker, audio resumes.
- **Multi-day soak** — leave `?perf=1` up overnight; GEO/TEX and DRAW should be
  flat (no leak) and HEAP should stay within ~10%.
- **Token expiry** — clear/scramble `jellyfin_token` in localStorage, then blur
  and refocus the window: the app validates the token on wake and silently
  re-authenticates from the cached `jellyfin_username`/`jellyfin_password`.

## Assumptions / caveats

- **Wayland/X11 env**: the unit relies on the user manager having
  `WAYLAND_DISPLAY` / `DISPLAY` / `XDG_RUNTIME_DIR` imported (install.sh does
  this; most desktop sessions do it automatically). If the store can't reach the
  display, uncomment and set the `Environment=` lines in `halcyon.service`.
- **Linger** is required for the service to run without an active graphical
  login (e.g. after a reboot into a display manager but before someone logs in,
  or on a headless-autologin kiosk). Enable it once with the `loginctl` command
  above.
- Untested against systemd on the target box in this change — the unit is
  deliberately conservative. Validate `systemctl --user status halcyon`
  after the first install.
