#!/usr/bin/env bash
# Halcyon Video — click-to-start.
#
# For someone who just cloned the repo and wants the store on screen: installs
# dependencies if they're missing, builds, serves on :1420, and opens a browser
# at it. Everything it does is a documented npm command — this file only saves
# you from running them in the right order and remembering the URL.
#
#   ./start.sh          build + serve, open the browser at your store
#   ./start.sh demo     …at the built-in demo catalog instead (no media server)
#   ./start.sh dev      vite dev server (hot reload) instead of a built bundle
#
# Env: HALCYON_PORT (default 1420), NO_BROWSER=1 to skip opening one.
#
# This is NOT launch.sh. That one is the owner's living-room kiosk cycle
# (git pull, port reclaim, fullscreen Brave, a run-forever lock); this one
# assumes nothing about your machine and never touches your git checkout.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${HALCYON_PORT:-1420}"
MODE=build
QUERY=""
for arg in "$@"; do
  case "$arg" in
    demo|--demo) QUERY="?demo=1" ;;
    dev|--dev) MODE=dev ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "start.sh: unknown option '$arg' (try: demo, dev, --help)" >&2; exit 2 ;;
  esac
done
URL="http://localhost:${PORT}/${QUERY}"

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m!!\033[0m %s\n\n' "$*" >&2; exit 1; }

# ── Node ────────────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || die "Node.js isn't installed (or isn't on PATH).
   Get the LTS build from https://nodejs.org — version 20 or newer — then run this again."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node $(node -v) is too old. This needs Node 20 or newer (22 is what CI and the
   Docker image use). https://nodejs.org"
fi

# ── Dependencies ────────────────────────────────────────────────────────────
# Reinstall when the lockfile is newer than the tree we installed from, so a
# `git pull` that changes dependencies doesn't leave you on stale ones.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  say "Installing dependencies (first run takes a couple of minutes)..."
  npm install
  touch node_modules
fi

# ── Port ────────────────────────────────────────────────────────────────────
# vite runs with --strictPort so it fails loudly rather than quietly moving to
# another port and leaving the browser we open pointed at nothing.
if (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null; then
  exec 3>&-
  die "Port ${PORT} is already in use — something else is serving there.
   Stop it, or run this with a different port:  HALCYON_PORT=1421 ./start.sh"
fi

# ── Serve ───────────────────────────────────────────────────────────────────
if [ "$MODE" = dev ]; then
  say "Starting the dev server..."
  npx vite --port "$PORT" --strictPort --host &
else
  say "Building..."
  npm run build
  say "Starting the server..."
  npx vite preview --port "$PORT" --strictPort --host &
fi
SERVER_PID=$!
# Take the server down with us however this script ends — including the window
# being closed, which is how most people will stop it.
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

# ── Open a browser once it actually answers ─────────────────────────────────
for _ in $(seq 1 120); do
  if (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null; then exec 3>&-; break; fi
  kill -0 "$SERVER_PID" 2>/dev/null || die "The server exited before it came up — scroll up for the error."
  sleep 0.5
done

say "Halcyon Video is running at ${URL}"
echo "    On another device on your network, use this machine's IP or hostname."
echo "    Press Ctrl-C to stop."
if [ -z "${NO_BROWSER:-}" ]; then
  for opener in xdg-open open wslview; do
    if command -v "$opener" >/dev/null 2>&1; then "$opener" "$URL" >/dev/null 2>&1 & break; fi
  done
fi

wait "$SERVER_PID"
