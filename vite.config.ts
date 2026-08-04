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
import { spawn } from "node:child_process";
// @ts-expect-error plain-js module, no declarations (see header note)
import { remotePlayPlugin } from "./tools/remote-play-server.mjs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
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

  function launch(file: string, startSeconds: number): string {
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
      "--",
      file,
    ];

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
        return json(200, { id: launch(file, Number(body.startSeconds) || 0) });
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

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [feedbackPinPlugin(), mpvPlayerPlugin(), integrationProxyPlugin(), remotePlayPlugin()],

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

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "0.0.0.0",
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
