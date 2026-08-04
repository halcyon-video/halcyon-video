#!/bin/bash
# Native-window launcher: same freshness flow as launch.sh (pull main, build)
# but opens the Tauri app's own WebKit window instead of Brave. Tauri bakes
# ../dist into the binary at compile time, so the build step is what keeps a
# desktop launch current with main; when nothing changed it's a quick no-op
# rebuild. If the build fails the old binary still launches — the terminal
# window shows the error.

# Clear Steam's library runtime overrides to avoid crashing Node/cargo
unset LD_LIBRARY_PATH
unset LD_PRELOAD

# Desktop launches don't source .bashrc, so cargo isn't on PATH
export PATH="$HOME/.cargo/bin:$PATH"

cd "$(dirname "$0")"
git fetch
git pull
npm run tauri -- build --no-bundle
exec ./src-tauri/target/release/tauri-app
