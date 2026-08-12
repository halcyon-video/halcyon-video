# Halcyon Video in a container.
#
#   docker compose up -d          # or:
#   docker build -t halcyon-video . && docker run --init -p 1420:1420 halcyon-video
#
# Serves http://<host>:1420 — first boot shows the Jellyfin login (append
# ?demo=1 for the synthetic demo library, no server needed). This runs the
# project's documented server runtime (`npm run serve`: vite preview plus the
# middleware in vite.config.ts), so the Jellyseerr/Romm integration proxy,
# F8 feedback pins and the whole Remote Play stack work — including private
# instances: open /remote.html on a phone or set-top box and the CONTAINER
# renders the store and streams it over WebRTC (use host networking for
# that; see docker-compose.yml). The one host-side feature that stays off
# is local mpv playback, which only ever applies on the HTPC itself.

FROM node:22-alpine
WORKDIR /app

# Chromium renders Remote Play private instances server-side; coturn relays
# WebRTC for viewers the store can't reach directly (VPN / hostile NAT).
# This layer is ~800MB — most of the image — and it's what makes
# remote.html work out of the box on a headless server.
RUN apk add --no-cache chromium coturn nss freetype harfbuzz ca-certificates ttf-freefont

# Puppeteer is a devDependency for local visual tooling; skip its own
# Chromium download (same trick as the Pages deploy workflow) and point it
# at the system one. HALCYON_CONTAINER tells the Remote Play server to pass
# the container-survival flags to Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    HALCYON_CONTAINER=1

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .

# Optional autologin baked into the bundle at build time (in-app login is the
# normal flow). NOTE: values land in plain text in the served JS and the image
# layers — only bake credentials into an image that never leaves your network.
#   docker build -t halcyon-video \
#     --build-arg VITE_JELLYFIN_URL=http://jellyfin:8096 \
#     --build-arg VITE_JELLYFIN_USERNAME=... \
#     --build-arg VITE_JELLYFIN_PASSWORD=... .
ARG VITE_JELLYFIN_URL
ARG VITE_JELLYFIN_USERNAME
ARG VITE_JELLYFIN_PASSWORD
# Plex is configured with a URL + token instead of a name/password — see
# .env.local.example for where the token comes from.
ARG VITE_PLEX_URL
ARG VITE_PLEX_TOKEN

RUN npm run build

EXPOSE 1420

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO /dev/null http://127.0.0.1:1420/ || exit 1

CMD ["npm", "run", "serve"]
