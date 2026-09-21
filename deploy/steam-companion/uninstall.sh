#!/bin/sh
set -eu
root="${XDG_DATA_HOME:-$HOME/.local/share}/halcyon-steam-companion"
unit="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/halcyon-steam-companion.service"
systemctl --user disable --now halcyon-steam-companion.service 2>/dev/null || true
rm -f "$unit" "$root/halcyon-steam-companion"
rmdir "$root" 2>/dev/null || true
systemctl --user daemon-reload
printf '%s\n' 'Halcyon Steam Companion removed.'
