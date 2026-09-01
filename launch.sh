#!/bin/bash
# Clear Steam's library runtime overrides to avoid crashing Node/Brave
unset LD_LIBRARY_PATH
unset LD_PRELOAD

cd "$(dirname "$0")"
# Ensure GUI apps (mpv) can connect to the Wayland/X11 display
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$(ls /run/user/$(id -u)/xauth_* 2>/dev/null | head -1)}"

# Only one launcher at a time. On this machine two things start the kiosk at
# boot (the desktop autostart entry and the session watcher), and with no lock
# they collided: both built, both raced for :1420 — where the reclaim below
# kills the *sibling's* live server instead of a stale one — and both launched
# Brave on the same profile dir, whose singleton lock SIGKILLs the loser. The
# loser then fell through to the `kill $DEV_PID` at the bottom and took the
# survivor's server down with it, leaving a fullscreen browser pointed at a
# dead port and nothing left to notice. Whoever gets here first owns the kiosk;
# anyone arriving while it is up is redundant and leaves quietly. The lock is
# an open fd, so it clears on exit however this process dies.
exec 9>"${TMPDIR:-/tmp}/halcyon-kiosk-launch.lock"
if ! flock -n 9; then
  echo "kiosk launch already in progress or running; nothing to do"
  exit 0
fi

git fetch
git pull
npm run build
# A previous serve (or a crashed launch) may still hold :1420. vite's
# --strictPort makes OUR serve die silently then, and the readiness poll below
# would happily front the stale server — the "I pulled but the app is old"
# trap. The port is this launcher's by definition: reclaim it before serving.
if curl -s -o /dev/null --max-time 1 http://localhost:1420; then
  echo "Reclaiming :1420 from a previous serve..."
  fuser -k 1420/tcp 2>/dev/null || pkill -f 'vite (preview )?--port 1420' || true
  sleep 1
fi
npm run serve &
DEV_PID=$!

# Wait for Vite to be ready
until curl -s http://localhost:1420 > /dev/null 2>&1; do
  sleep 0.5
done

# Launch Brave in a separate user profile so it blocks the script (doesn't exit immediately)
# --force-color-profile=srgb: the store renders and tags its output as sRGB, but
# this machine's HDMI display is wide-gamut + HDR (kwinoutputconfig.json:
# highDynamicRange/wideColorGamut true). Without this flag Chromium composites
# sRGB content straight into the panel's native gamut with no conversion, which
# stretches every color outward — the "everything looks oversaturated and the
# contrast is greedy" symptom. Measured, the rendered frames are actually LESS
# saturated than a real store photo, so the extra chroma is added by the
# display path, not the grade. Drop this flag to see the difference.
#
# --disable-features=WebRtcHideLocalIpsWithMdns: when this kiosk hosts Remote
# Play (Connection settings toggle), it is the WebRTC peer phones/TVs connect
# to. By default Chromium hides its LAN IP behind an `abcd.local` (mDNS) ICE
# candidate; many phones can't resolve that, so /remote.html loads but the video
# never connects. Exposing the raw 192.168.x candidate lets them reach the
# store directly. (The server's private-instance headless Chromes already pass
# this — see tools/remote-play-server.mjs — this brings the shared kiosk in line.)
# The kiosk profile lives under ~/.local/share, NOT /tmp. /tmp on this box is
# tmpfs (RAM), so a profile there evaporates on every reboot — and the profile
# is where Chromium keeps localStorage, which is where the app keeps the media
# server URL, the auth token and every bb_* setting. That is the "why is it
# asking for my address and password again" bug: nothing was wrong with the
# app, the browser it runs in was handed a brand-new profile each boot.
# Migrate a live /tmp profile once so this change doesn't cost one more login.
BRAVE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/halcyon-brave"
if [ ! -d "$BRAVE_DIR" ]; then
  mkdir -p "$(dirname "$BRAVE_DIR")"
  for legacy in /tmp/radiant-carson-brave /tmp/halcyon-brave; do
    if [ -d "$legacy" ]; then
      echo "Migrating kiosk browser profile from $legacy (tmpfs) to $BRAVE_DIR..."
      cp -a "$legacy" "$BRAVE_DIR" && break
    fi
  done
fi
brave-browser --app=http://localhost:1420 --start-fullscreen --user-data-dir="$BRAVE_DIR" \
  --force-color-profile=srgb \
  --disable-features=WebRtcHideLocalIpsWithMdns

kill $DEV_PID
