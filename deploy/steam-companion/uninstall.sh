#!/bin/sh
set -eu
root="${XDG_DATA_HOME:-$HOME/.local/share}/halcyon-steam-companion"
unit="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/halcyon-steam-companion.service"
systemctl --user disable --now halcyon-steam-companion.service 2>/dev/null || true
rm -f "$unit" "$root/halcyon-steam-companion"
# Revoke every browser-origin grant. Steam's own isolated login is retained so
# uninstalling the optional companion does not sign the native app out.
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/com.halcyonvideo.app/steam-companion-pairs.json"
rmdir "$root" 2>/dev/null || true
systemctl --user daemon-reload
printf '%s\n' 'Halcyon Steam Companion removed.'
