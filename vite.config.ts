import { defineConfig } from "vite";
// @ts-expect-error node:fs/node:path have no type declarations without @types/node
// (not installed; vite.config.ts is outside tsconfig's "include" so this never
// hits the `npm run build` gate, only editor intellisense).
import * as fs from "node:fs";
// @ts-expect-error see above
import * as path from "node:path";
// @ts-expect-error see above
import * as os from "node:os";
// @ts-expect-error see above
import { spawn, execFileSync } from "node:child_process";
// @ts-expect-error see above
import * as net from "node:net";
// @ts-expect-error plain-js module, no declarations (see header note)
import { remotePlayPlugin } from "./tools/remote-play-server.mjs";
import {
  OPERATOR_CONFIG_PATH,
  operatorAuthHeaders,
  operatorRequestAllowed,
  operatorServiceForTarget,
  publicOperatorDefaults,
  readOperatorEnv,
} from "./src/operator-defaults";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// ─── Which Host headers this server answers to ────────────────────────────────
//
// vite answers only `localhost` and raw-IP Host headers by default, as a
// DNS-rebinding guard. That default is why `http://192.168.1.5:1420` loads the
// store while `http://my-htpc:1420` — the same machine, under the name people
// actually type — dies on "Blocked request. This host is not allowed".
//
// So this machine's OWN names are allowed automatically: its hostname, its
// `.local` mDNS name, and its tailnet MagicDNS name. That keeps the guard
// doing the job it exists for — a rebinding page reaches us under the
// ATTACKER's domain, which is still refused — while making the obvious way to
// reach your own server work out of the box. Any OTHER name (a reverse proxy,
// a NAS alias, a container reached by its host's name — inside a container the
// detected name is the CONTAINER's) goes in HALCYON_ALLOWED_HOSTS: a
// comma-separated list, where a leading dot (".example.com") matches
// subdomains. The value "all" turns the check off entirely — any site a viewer
// visits could then reach this server same-origin, including /dev-proxy, so
// prefer naming the hosts.

// 100.64.0.0/10, the CGNAT range tailscale hands out.
function hasTailnetAddress(): boolean {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of (addrs as any[]) ?? []) {
      if (addr.family !== "IPv4") continue;
      const [a, b] = String(addr.address).split(".").map(Number);
      if (a === 100 && b >= 64 && b <= 127) return true;
    }
  }
  return false;
}

// This node's MagicDNS name ("nobara.tail9ff35f.ts.net"), or null. Only shells
// out when a tailnet address is actually present, so a box without tailscale
// pays nothing; a wedged daemon is capped at 1.5s and falls back to null
// rather than hanging server startup.
function tailnetHostName(): string | null {
  if (!hasTailnetAddress()) return null;
  try {
    const out = execFileSync("tailscale", ["status", "--json"], {
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    const name = JSON.parse(out)?.Self?.DNSName;
    return typeof name === "string" && name ? name : null;
  } catch {
    return null;
  }
}

function ownHostNames(): string[] {
  const names = new Set<string>();
  const add = (n: unknown) => {
    // Host headers are case-insensitive and MagicDNS names arrive
    // fully-qualified with a trailing dot; normalize both away.
    const clean = String(n ?? "").trim().toLowerCase().replace(/\.$/, "");
    if (clean && clean !== "localhost") names.add(clean);
  };
  const hostname = os.hostname(); // short ("nobara") or an FQDN, per system
  add(hostname);
  const short = hostname.split(".")[0];
  add(short);
  add(`${short}.local`); // mDNS/avahi — how most LANs reach a NAS or HTPC
  add(tailnetHostName());
  add(host); // TAURI_DEV_HOST, when set
  return [...names];
}

// ─── Operator-provided connection defaults (GH #129) ─────────────────────────
//
// An operator hosting Halcyon for other people sets HALCYON_ROMM_URL /
// HALCYON_ROMM_APIKEY / HALCYON_JELLYSEERR_URL / HALCYON_JELLYSEERR_APIKEY (or
// the SEERR/OVERSEERR aliases) here, on the SERVER, and every visitor arrives
// with those services already wired up. The names are deliberately NOT
// `VITE_`-prefixed: vite inlines those into the bundle, which is precisely the
// thing this exists to avoid. The browser is told the service ADDRESS via
// /__halcyon/config below and never the key; /dev-proxy attaches the
// credential on the way out. Same env-var shape as HALCYON_ALLOWED_HOSTS
// above, so a `docker run -e ...` line configures the lot.
// @ts-expect-error process is a nodejs global
const operatorEnv = readOperatorEnv(process.env);
const operatorPublic = publicOperatorDefaults(operatorEnv);

// @ts-expect-error process is a nodejs global
const configuredHosts: string[] = (process.env.HALCYON_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h: string) => h.trim())
  .filter(Boolean);

const allowedHosts: string[] | true = configuredHosts.includes("all")
  ? true
  : [...ownHostNames(), ...configuredHosts];
// @ts-expect-error import.meta.dirname is a nodejs (>=21.2) global
const feedbackDir = path.join(import.meta.dirname, "feedback");
const MAX_FEEDBACK_BODY_BYTES = 20 * 1024 * 1024; // ~20MB: a full-res PNG dataURL + note text

// Existing zero-padded numeric ids directly under `dir` (e.g. "007"), or [].
function numericSubdirIds(dir: string): number[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d: any) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d: any) => parseInt(d.name, 10));
}

// Local-server endpoint backing the F8 "feedback pin" in-app hotkey (see
// src/main.ts openFeedbackPin/saveFeedbackPin): a user who can't read code
// flags a visual bug in place. Saves their comment + the exact replayable
// camera coords + a screenshot to feedback/NNN/, so the coding agent can
// later `npm run shot -- --walk <walk>` the exact view. Registered on BOTH
// the dev server and `vite preview` — the desktop launcher (launch.sh) runs
// the built dist through `npm run serve`, and pins must work from the couch,
// not just the editor. Only a server-less run (a bundled Tauri app) has no
// endpoint -- main.ts's save path handles the fetch failure.
function feedbackPinPlugin() {
  const feedbackMiddleware = (req: any, res: any, next: any) => {
    if (req.method !== "POST" || req.url !== "/__feedback") {
      next();
      return;
    }

    const chunks: any[] = [];
    let total = 0;
    let rejected = false;

    req.on("data", (chunk: any) => {
      if (rejected) return;
      total += chunk.length;
      if (total > MAX_FEEDBACK_BODY_BYTES) {
        rejected = true;
        res.statusCode = 413;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Payload too large" }));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });

    req.on("end", () => {
      if (rejected) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const { comment, walk, config, timestamp, png } = body;
        const pngPrefix = "data:image/png;base64,";
        if (typeof png !== "string" || !png.startsWith(pngPrefix)) {
          throw new Error("Missing/invalid png dataURL");
        }
        const pngBuffer = Buffer.from(png.slice(pngPrefix.length), "base64");

        // Next id accounts for both feedback/ and feedback/resolved/ so a
        // resolved entry moving out from under feedback/ never frees up
        // its number for reuse.
        const ids = [
          ...numericSubdirIds(feedbackDir),
          ...numericSubdirIds(path.join(feedbackDir, "resolved")),
        ];
        const nextId = ids.length ? Math.max(...ids) + 1 : 1;
        const id = String(nextId).padStart(3, "0");
        const entryDir = path.join(feedbackDir, id);
        fs.mkdirSync(entryDir, { recursive: true });

        fs.writeFileSync(
          path.join(entryDir, "note.json"),
          JSON.stringify({ comment, walk, config, timestamp }, null, 2)
        );
        fs.writeFileSync(path.join(entryDir, "shot.png"), pngBuffer);

        // Recent in-app console lines (e.g. [Player] playback narration)
        // ride along with the pin so playback bugs are debuggable from
        // disk without the user reading the on-screen log.
        if (Array.isArray(body.log) && body.log.length) {
          fs.writeFileSync(
            path.join(entryDir, "log.txt"),
            body.log.map(String).join("\n") + "\n"
          );
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ id }));
      } catch (err) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
  };
  return {
    name: "feedback-pin-endpoint",
    configureServer(server: any) {
      server.middlewares.use(feedbackMiddleware);
    },
    // `vite preview`, i.e. `npm run serve` — the desktop launcher's server.
    // Registering directly (not returning a post-hook) puts the endpoint
    // ahead of the built-in static handler, same as configureServer.
    configurePreviewServer(server: any) {
      server.middlewares.use(feedbackMiddleware);
    },
  };
}

// ─── Local mpv playback ───────────────────────────────────────────────────────
//
// Plays a title by handing mpv the file ON DISK, instead of streaming it from
// Jellyfin. Only viable because the server, the media and this app all live on
// one machine — and it's the only way to get the things the webview can't give
// us: real HDR output (mpv/libplacebo drives the display's HDR mode directly,
// Chromium has no HDR video path at all), the original lossless multichannel
// audio rather than a stereo AAC downmix, and instant seeking.
//
// It also removes the reason Jellyfin was writing tens of GB of HLS segments
// per film: the webview can't demux Matroska, so the server had to repackage
// every MKV onto disk as it played. mpv just opens the file.
//
// Same trust model as the feedback endpoint above: dev/preview server only, so
// it is absent from any production bundle. Paths are spawned as argv (never a
// shell string) and must resolve to a real file inside a configured media root,
// so a crafted request can't run an arbitrary binary or read outside the
// library.
function mpvPlayerPlugin() {
  // Roots a playable file must live under. Anything else is rejected even if it
  // exists — this endpoint runs unauthenticated on localhost.
  const MEDIA_ROOTS = ["/mnt/data1", "/mnt/data2", "/mnt/data3", "/mnt/data4"];
  const sessions = new Map<string, { position: number; exited: boolean; error?: string }>();
  let nextId = 1;

  // Written once at startup; merged with mpv's builtin bindings (see --input-conf).
  // Tuned for a TV remote, which only reaches us as arrows / OK / Back:
  // Up cycles subtitle tracks (ending on "off"), Down cycles audio languages
  // (both replace the default 60-second seeks — Left/Right still scrub), and
  // OK pauses (mpv's default Enter is "next playlist entry", which on a
  // single film just quits). Each cycle names the track it landed on via OSD.
  const inputConf = path.join(os.tmpdir(), "halcyon-mpv-input.conf");
  fs.writeFileSync(inputConf, [
    "ESC quit",
    "BS quit",
    "ENTER cycle pause",
    "KP_ENTER cycle pause",
    "UP cycle sub",
    "DOWN cycle audio",
    "",
  ].join("\n"));

  function launch(file: string, startSeconds: number, prefs?: { alang?: string; slang?: string; subsOff?: boolean }): string {
    const id = String(nextId++);
    const session = { position: startSeconds, exited: false } as {
      position: number; exited: boolean; error?: string;
    };
    sessions.set(id, session);

    const args = [
      "--fullscreen",
      "--ontop",
      // libplacebo renderer + colorspace hint: what actually flips the display
      // into HDR for an HDR10 source instead of tonemapping it down to SDR.
      "--vo=gpu-next",
      "--target-colorspace-hint=yes",
      "--hwdec=auto-safe",
      // Send the original track through untouched (5.1/7.1 stays intact); mpv
      // downmixes only if the sink can't take it.
      "--audio-channels=auto",
      // ESC and Backspace close the player and drop straight back to the store,
      // matching how Back works everywhere else in the app. mpv's own defaults
      // map ESC to "leave fullscreen", which would strand the movie playing
      // behind the store. A custom input.conf is MERGED with the builtin
      // bindings, so everything else (space, arrows, volume) still works.
      `--input-conf=${inputConf}`,
      // Seeks from the remote get a timestamp + progress bar, not just a bar —
      // with no mouse there's no other way to see where you landed.
      "--osd-on-seek=msg-bar",
      // Position on stdout so progress can be reported to Jellyfin without an
      // IPC socket; parsed below.
      "--term-status-msg=BBPOS:${=time-pos}",
      // Control socket for the desktop's tv-desktop-watcher service: it pauses
      // the film when the kiosk's virtual desktop loses the screen (same
      // leave-the-room behavior as the in-app player's MPRIS pause).
      "--input-ipc-server=/tmp/halcyon-mpv.sock",
      `--start=${Math.max(0, Math.floor(startSeconds))}`,
    ];
    // Settings ▸ Playback preferences (bb_audio_lang / bb_subtitles_default),
    // translated by playback-flow.ts's resolveMpvPrefArgs — mpv has no
    // Jellyfin-style track-index picker for a raw local file, so these go
    // straight through as ffmpeg-style language codes; "captions off" is the
    // precise --sid=no rather than an empty --slang, which would just leave
    // mpv's own default subtitle selection in charge.
    if (prefs?.alang) args.push(`--alang=${prefs.alang}`);
    if (prefs?.slang) args.push(`--slang=${prefs.slang}`);
    if (prefs?.subsOff) args.push("--sid=no");
    args.push("--", file);

    const child = spawn("mpv", args, { stdio: ["ignore", "pipe", "pipe"] });

    const onData = (buf: any) => {
      const text = String(buf);
      let m: any;
      const re = /BBPOS:([0-9.]+)/g;
      while ((m = re.exec(text)) !== null) session.position = parseFloat(m[1]);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (err: any) => {
      session.error = String(err?.message ?? err);
      session.exited = true;
    });
    child.on("close", () => {
      session.exited = true;
    });
    return id;
  }

  function handler(req: any, res: any, next: any) {
    const url = String(req.url ?? "");
    if (!url.startsWith("/__play")) {
      next();
      return;
    }
    const json = (code: number, body: any) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };

    // Poll: how far along is it, and has the user quit?
    if (req.method === "GET") {
      const id = new URL(url, "http://x").searchParams.get("id") ?? "";
      const s = sessions.get(id);
      if (!s) return json(404, { error: "unknown session" });
      if (s.exited) sessions.delete(id);
      return json(200, { position: s.position, exited: s.exited, error: s.error });
    }

    if (req.method !== "POST") return json(405, { error: "method" });

    const chunks: any[] = [];
    req.on("data", (c: any) => chunks.push(c));
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        const file = path.resolve(String(body.path ?? ""));
        if (!MEDIA_ROOTS.some((r: string) => file === r || file.startsWith(r + path.sep))) {
          return json(403, { error: "path outside media roots" });
        }
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return json(404, { error: "no such file" });
        }
        const prefs = {
          alang: typeof body.alang === "string" ? body.alang.slice(0, 32) : undefined,
          slang: typeof body.slang === "string" ? body.slang.slice(0, 32) : undefined,
          subsOff: body.subsOff === true,
        };
        return json(200, { id: launch(file, Number(body.startSeconds) || 0, prefs) });
      } catch (err) {
        return json(400, { error: String(err) });
      }
    });
  }

  return {
    name: "mpv-player-endpoint",
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    // launch.sh serves the built bundle via `vite preview`, so the endpoint has
    // to exist there too or local playback only works under `npm run dev`.
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
}

// Reverse proxy for integrations whose servers don't speak CORS (Jellyseerr,
// Romm): the browser build can't fetch them directly — the X-Api-Key /
// Authorization headers trigger a preflight those servers never answer, so
// every request dies before it leaves the browser (the Tauri shell dodges
// this via its Rust-side proxies). The client sends the real URL in an
// X-Proxy-Target header; being a custom header, any cross-origin use needs a
// preflight, which this middleware never approves — other sites can't use it
// as an open proxy.
function integrationProxyPlugin() {
  async function handler(req: any, res: any, next: any) {
    if (!req.url.startsWith("/dev-proxy")) return next();
    const json = (code: number, obj: any) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(obj));
    };
    const target = String(req.headers["x-proxy-target"] || "");
    if (!/^https?:\/\//.test(target)) return json(400, { error: "bad or missing X-Proxy-Target" });
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c);
      const headers: Record<string, string> = {};
      for (const h of ["x-api-key", "authorization", "content-type"]) {
        if (req.headers[h]) headers[h] = String(req.headers[h]);
      }
      const method = String(req.method || "GET");

      // Operator-managed credentials (GH #129). A client that holds no key of
      // its own sends none; if the target is one of the operator's own
      // servers, theirs is attached HERE, host-side, where the browser can
      // never read it. A client that DID send a credential keeps it — a
      // visitor with their own Romm is not rerouted onto the operator's.
      //
      // The endpoint allow-list is not optional: the operator's server address
      // is necessarily public (the browser has to name it as the proxy
      // target), so without it this would be an authenticated open door onto
      // their Romm/Jellyseerr for anyone who loaded the page.
      if (!headers["x-api-key"] && !headers["authorization"]) {
        const service = operatorServiceForTarget(operatorEnv, target);
        if (service) {
          if (!operatorRequestAllowed(service, method, target)) {
            return json(403, {
              error: `${method} ${target} is not an endpoint the store calls on the operator's ${service}`,
            });
          }
          Object.assign(headers, operatorAuthHeaders(service, operatorEnv[service]!));
        }
      }
      const r = await fetch(target, {
        method,
        headers,
        body: chunks.length && method !== "GET" && method !== "HEAD" ? Buffer.concat(chunks) : undefined,
      });
      res.statusCode = r.status;
      res.setHeader("Content-Type", r.headers.get("content-type") || "application/json");
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (err) {
      json(502, { error: String(err) });
    }
  }
  return {
    name: "integration-proxy",
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
}

// What this instance provides on its operator's behalf (GH #129): the service
// ADDRESSES and a flag saying the server holds the credential. Never the
// credential — this response is the whole client-visible surface of tier 2,
// and `publicOperatorDefaults` is what guarantees a key can't reach it.
// Answers `{}` when the operator configured nothing, which is every ordinary
// install; the client treats that, a 404 from a static host, and a network
// failure identically (operator-defaults.ts loadOperatorDefaults).
function operatorConfigPlugin() {
  function handler(req: any, res: any, next: any) {
    if ((req.url || "").split("?")[0] !== OPERATOR_CONFIG_PATH) return next();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    // Per-visitor and cheap to answer; a cached copy would outlive the
    // operator changing their env and restarting.
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(operatorPublic));
  }
  return {
    name: "halcyon-operator-config",
    configureServer(server: any) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(handler);
    },
  };
}

// Same rules vite applies to a Host header (see isHostAllowedWithoutCache):
// raw IPs and localhost always pass, entries match exactly, and a leading dot
// matches the domain plus its subdomains.
function isHostAllowed(allowedHosts: string[] | true, hostHeader: unknown): boolean {
  if (allowedHosts === true) return true;
  const raw = String(hostHeader ?? "").trim();
  if (!raw) return false;
  if (/^(?:file|.+-extension):/i.test(raw)) return true;
  if (raw[0] === "[") {
    // Bracketed IPv6 literal, e.g. "[::1]:1420".
    const end = raw.indexOf("]");
    return end > 0 && net.isIP(raw.slice(1, end)) === 6;
  }
  const colon = raw.indexOf(":");
  const hostname = (colon === -1 ? raw : raw.slice(0, colon)).toLowerCase();
  if (net.isIP(hostname) === 4) return true;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  return allowedHosts.some((allowed: string) =>
    allowed[0] === "."
      ? allowed.slice(1) === hostname || hostname.endsWith(allowed)
      : allowed === hostname
  );
}

// vite installs its own host check AFTER every plugin middleware — on both
// servers, since the configureServer / configurePreviewServer hook loops run
// first — so the endpoints above have always answered whatever the Host header
// said: the DNS-rebinding guard covered the static files and nothing else.
// That is backwards, because the endpoints are the dangerous half. /dev-proxy
// will fetch any URL and pass the caller's credentials through, /__play spawns
// a player, /__feedback writes to disk, and /__remote/status hands out live
// TURN credentials — under rebinding the attacker's page is same-origin, so
// its custom X-Proxy-Target header never triggers the preflight that is
// supposed to keep others out. Registering this first in `plugins` puts the
// allow-list back in front of all of them.
//
// It also replaces vite's own rejection message, which tells the reader to
// edit vite.config.js — the wrong advice here, and impossible inside the
// container. Ours names the env var and echoes back the host that was refused.
function hostGuardPlugin() {
  const attach = (isPreview: boolean) => (server: any) => {
    server.middlewares.use((req: any, res: any, next: any) => {
      const opts = isPreview ? server.config.preview : server.config.server;
      // Mirror vite: no check when it is disabled outright, or under https —
      // a rebinding attacker cannot present a valid cert for the name it takes.
      if (opts.allowedHosts === true || opts.https) return next();
      if (isHostAllowed(opts.allowedHosts ?? [], req.headers.host)) return next();

      // Echoed into a text/plain body, so the only real concern is a header
      // stuffed with control characters or length.
      const shown = String(req.headers.host ?? "")
        .replace(/[^\x20-\x7e]/g, "")
        .slice(0, 100);
      res.statusCode = 403;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(
        `Blocked request. This host (${JSON.stringify(shown)}) is not allowed.\n\n` +
          `Halcyon answers to localhost, raw IP addresses, and this machine's own\n` +
          `names (hostname, <hostname>.local, tailnet name). To reach it under a\n` +
          `different name — a reverse proxy, a NAS alias, a custom domain — name it:\n\n` +
          `    HALCYON_ALLOWED_HOSTS=${shown.split(":")[0] || "my.example.com"} npm run serve\n\n` +
          `Comma-separate several; a leading dot (".example.com") matches subdomains;\n` +
          `"all" disables this check, which is only safe on a network you trust.\n`
      );
    });
  };
  return {
    name: "halcyon-host-guard",
    configureServer: attach(false),
    configurePreviewServer: attach(true),
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    // First: everything below it answers only to an allowed Host header.
    hostGuardPlugin(),
    feedbackPinPlugin(),
    mpvPlayerPlugin(),
    integrationProxyPlugin(),
    operatorConfigPlugin(),
    remotePlayPlugin(),
  ],

  // Two entries: index.html (the real Tauri/Jellyfin app) and harness.html
  // (the synthetic-library demo — also what the GitHub Pages deploy serves,
  // see .github/workflows/deploy-demo.yml).
  build: {
    rollupOptions: {
      // Optional entries build only when present: the dev rigs
      // (harness.html, asset-viewer.html) exist in the dev tree but not in
      // release archives, and the build must work for both.
      input: Object.fromEntries(Object.entries({
        main: path.join(import.meta.dirname, "index.html"),
        harness: path.join(import.meta.dirname, "harness.html"),
        assetviewer: path.join(import.meta.dirname, "asset-viewer.html"),
        remote: path.join(import.meta.dirname, "remote.html"),
      }).filter(([, f]) => fs.existsSync(f))),
    },
  },

  preview: {
    allowedHosts,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "0.0.0.0",
    // launch.sh and the systemd unit serve the store from the DEV server, so
    // this needs the same allow-list as preview or reaching the kiosk by name
    // fails there too.
    allowedHosts,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
