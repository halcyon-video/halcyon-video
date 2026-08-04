#!/usr/bin/env bash
# Remove the Halcyon systemd --user service (issue #16).
set -euo pipefail

UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

systemctl --user disable --now halcyon.service 2>/dev/null || true
rm -f "$UNIT_DIR/halcyon.service"
systemctl --user daemon-reload

echo "==> Removed halcyon.service."
echo "    (Lingering, if enabled, is left as-is: sudo loginctl disable-linger \"$USER\" to undo.)"
