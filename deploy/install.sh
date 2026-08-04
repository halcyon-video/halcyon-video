#!/usr/bin/env bash
# Install the Halcyon store as a systemd --user service (issue #16).
# Idempotent: safe to re-run after a `git pull`.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_SRC="$REPO_DIR/deploy/halcyon.service"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_DST="$UNIT_DIR/halcyon.service"

echo "==> Repo:        $REPO_DIR"
echo "==> Unit target: $UNIT_DST"

# 1. Dependencies (Node modules). The default runtime is the Vite dev server +
#    Brave kiosk via launch.sh, so we just need node_modules present.
if [ ! -d "$REPO_DIR/node_modules" ]; then
  echo "==> Installing npm dependencies..."
  ( cd "$REPO_DIR" && npm install )
fi

# Optional: build the compiled Tauri binary instead of the dev-server path.
#   ( cd "$REPO_DIR" && npm run tauri build )
# then edit ExecStart in the unit to point at src-tauri/target/release/tauri-app.

# 2. Materialise the unit with this checkout's actual path substituted in.
mkdir -p "$UNIT_DIR"
sed "s|%h/media-server-video-store|$REPO_DIR|g" "$UNIT_SRC" > "$UNIT_DST"
echo "==> Wrote $UNIT_DST (WorkingDirectory + ExecStart -> $REPO_DIR)"

# 3. Import the graphical-session env so the --user manager can reach the display.
systemctl --user import-environment WAYLAND_DISPLAY DISPLAY XDG_RUNTIME_DIR 2>/dev/null || true

# 4. Enable + start.
systemctl --user daemon-reload
systemctl --user enable --now halcyon.service

echo
echo "==> Installed and started. Useful commands:"
echo "    systemctl --user status halcyon"
echo "    journalctl --user -u halcyon -f"
echo
echo "==> To keep it running after logout / on boot without an interactive login,"
echo "    enable lingering for this user (needs sudo, run once):"
echo "        sudo loginctl enable-linger \"$USER\""
