# Halcyon Video in a container.
#
#   docker compose up -d          # or:
#   docker build -t halcyon-video . && docker run --init -p 1420:1420 halcyon-video
#
# Serves http://<host>:1420 — first boot shows the Jellyfin login (append
# ?demo=1 for the synthetic demo library, no server needed). This runs the
# project's documented server runtime (`npm run serve`: vite preview plus the
# middleware in vite.config.ts), so the Jellyseerr/Romm integration proxy,
# F8 feedback pins and Remote Play signaling all work. Host-side extras
# (local mpv playback, Remote Play private instances, the TURN relay) stay
# off: they need mpv / a browser / coturn on the machine itself.

FROM node:22-alpine
WORKDIR /app

# Puppeteer is a devDependency for local visual tooling; its Chromium download
# is dead weight here (same trick as the Pages deploy workflow).
ENV PUPPETEER_SKIP_DOWNLOAD=1

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

RUN npm run build

EXPOSE 1420

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO /dev/null http://127.0.0.1:1420/ || exit 1

CMD ["npm", "run", "serve"]
