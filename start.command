#!/usr/bin/env bash
# macOS click-to-start. Finder only runs a shell script on double-click when it
# is named `.command`, so this is a one-line shim onto the real launcher —
# see start.sh for what it actually does and the options it takes.
#
# First run: macOS quarantines files from a download rather than a clone. If
# double-clicking is refused, right-click -> Open once, or in Terminal:
#   xattr -d com.apple.quarantine start.command
exec "$(dirname "$0")/start.sh" "$@"
