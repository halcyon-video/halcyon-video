#!/usr/bin/env bash
# Rasterize the Android TV launcher banner from art/banner.svg.
#
# The banner is not original artwork: banner.svg re-lays the outlined paths
# already committed in src-tauri/icons/app-icon.svg onto a 16:9 canvas. Regenerate
# it (rather than editing a PNG) whenever the app icon changes.
#
#   ./art/make-banner.sh        # needs inkscape
set -euo pipefail
cd "$(dirname "$0")/.."
inkscape art/banner.svg -w 320  -h 180 -o app/src/main/res/drawable-xhdpi/banner.png
inkscape art/banner.svg -w 480  -h 270 -o app/src/main/res/drawable-xxhdpi/banner.png
echo "banner.png regenerated (xhdpi 320x180, xxhdpi 480x270)"
