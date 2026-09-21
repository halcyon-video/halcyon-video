#!/bin/sh
set -eu
root="${XDG_DATA_HOME:-$HOME/.local/share}/halcyon-steam-companion"
units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$root" "$units"
install -m 0755 "$(dirname "$0")/halcyon-steam-companion" "$root/halcyon-steam-companion"
cat > "$units/halcyon-steam-companion.service" <<EOF
[Unit]
Description=Halcyon Steam Companion
After=graphical-session.target

[Service]
Environment=HALCYON_STEAM_COMPANION=1
Environment=APPIMAGE_EXTRACT_AND_RUN=1
PassEnvironment=DISPLAY WAYLAND_DISPLAY XAUTHORITY DBUS_SESSION_BUS_ADDRESS XDG_RUNTIME_DIR
ExecStart=$root/halcyon-steam-companion
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now halcyon-steam-companion.service
printf '%s\n' 'Halcyon Steam Companion installed. Return to Halcyon and enable Steam.'
