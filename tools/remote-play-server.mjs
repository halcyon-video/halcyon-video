// Remote Play server plugin (imported by vite.config.ts, dev + preview).
//
// Three jobs, all under /__remote/*:
//
//  1. Signaling mailbox — WebRTC handshake relay between the store host(s)
//     and /remote.html viewers. Long-poll GETs (~25s) instead of WebSockets
//     keep it dependency-free. Media never touches this server.
//  2. Seed store — when the real app hosts Remote Play it pushes its
//     Jellyfin credentials + bb_* look settings here (persisted to the
//     gitignored .remote-play-seed.json), so private instances can boot the
//     user's actual store, not just the demo.
//  3. TURN relay — an optional coturn child bound to this machine's VPN/LAN
//     address, so viewers with no direct path to the store (see startTurn)
//     still get a media route. Its credentials ride along in /__remote/status.
//  4. Instance manager (option 3: server-side rendering per visitor) — spawns
//     one headless Chromium per "private store" request, each running its own
//     StoreScene registered on the mailbox as host-<id>. Instances heartbeat
//     (/__remote/instance/beat) from src/remote-play.ts; a reaper kills any
//     with no heartbeat (crashed) or no viewers for a few minutes.
//
// Trust model matches the sibling endpoints (feedback pin, mpv): dev/preview
// server only, unauthenticated on the LAN, absent from production bundles.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";

const MAX_BODY = 256 * 1024; // an SDP runs ~10-20KB
const PEER_TTL_MS = 5 * 60 * 1000;
const LONG_POLL_MS = 25_000;

const CAP = Math.max(1, Number(process.env.REMOTE_PLAY_MAX_INSTANCES) || 2);
const IDLE_KILL_MS = Number(process.env.REMOTE_PLAY_IDLE_MS) || 180_000;
const BEAT_TIMEOUT_MS = 60_000; // crashed page: heartbeats stop
const BOOT_GRACE_MS = 90_000;   // full library boot can be slow — don't reap it

export function remotePlayPlugin() {
  // ── signaling mailbox ─────────────────────────────────────────────────────
  const boxes = new Map(); // peer -> { msgs, waiter, lastSeen }

  const box = (peer) => {
    let b = boxes.get(peer);
    if (!b) {
      b = { msgs: [], waiter: null, lastSeen: Date.now() };
      boxes.set(peer, b);
    }
    return b;
  };
  const json = (res, code, obj) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };
  // Release a peer's hanging long-poll with whatever is queued.
  const flush = (peer) => {
    const b = boxes.get(peer);
    if (b?.waiter && b.msgs.length) {
      const { res, timer } = b.waiter;
      clearTimeout(timer);
      b.waiter = null;
      json(res, 200, { msgs: b.msgs.splice(0) });
    }
  };
  const readBody = (req, res, cb) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total <= MAX_BODY) chunks.push(c);
    });
    req.on("end", () => {
      if (total > MAX_BODY) return json(res, 413, { error: "too large" });
      try {
        cb(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (err) {
        json(res, 400, { error: String(err) });
      }
    });
  };

  // ── seed store ────────────────────────────────────────────────────────────
  // REMOTE_PLAY_SEED points the seed somewhere persistent (a container's
  // volume mount); unset, it lives beside the checkout as always.
  const SEED_FILE =
    process.env.REMOTE_PLAY_SEED || path.join(process.cwd(), ".remote-play-seed.json");
  const validSeed = (s) =>
    s && typeof s === "object" && s.jellyfin_url && s.jellyfin_token ? s : null;
  let seed = null;
  try {
    seed = validSeed(JSON.parse(fs.readFileSync(SEED_FILE, "utf8")));
  } catch { /* no seed yet — instances fall back to the demo library */ }

  const SEED_KEY = /^(bb_|jellyfin_|jellyseerr_|romm_)/;
  // Never seeded into instances: hosting flags (an instance must not become a
  // second shared host), the kiosk's rental-lockout state, and credentials
  // the app itself never persists.
  const SEED_SKIP = new Set(["bb_remote_play", "bb_rental", "jellyfin_password"]);

  // ── TURN relay ────────────────────────────────────────────────────────────
  //
  // STUN alone only connects peers that can already reach each other. A viewer
  // arriving over a VPN (Tailscale) loads this page fine and still ends up with
  // no usable candidate pair: browsers don't enumerate the tunnel interface, so
  // the store offers only its LAN address (unroutable for that viewer) and a
  // public srflx whose hole punch fails on exactly the hostile NATs people run
  // a VPN to escape. A relay bound to the tunnel address fixes it — both sides
  // allocate through it and the media rides the same path the page came down.
  //
  // coturn is an OPTIONAL dependency: with the binary present we run one as a
  // child (its lifetime = the store server's), without it we say so once and
  // stay STUN-only, which is the LAN-only behaviour this shipped with.
  const TURN_PORT = Number(process.env.REMOTE_PLAY_TURN_PORT) || 3478;
  const TURN_MIN_PORT = Number(process.env.REMOTE_PLAY_TURN_MIN_PORT) || 49200;
  const TURN_MAX_PORT = Number(process.env.REMOTE_PLAY_TURN_MAX_PORT) || 49260;
  const TURN_TTL_S = 12 * 3600; // credential lifetime (viewers re-read /status)
  let turn = null; // { ip, port, secret, proc }

  /**
   * Address to hand out as the relay. Prefer a tailnet address (100.64.0.0/10,
   * the CGNAT range Tailscale allocates from) — the remote-viewer case relays
   * exist for — then a real LAN address. Container bridges (172.16/12) are
   * never routable for a viewer, so they must never win.
   */
  function pickRelayIp() {
    const v4 = [];
    for (const addrs of Object.values(os.networkInterfaces())) {
      for (const a of addrs ?? []) {
        if (a.family === "IPv4" && !a.internal) v4.push(a.address);
      }
    }
    return (
      v4.find((ip) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) ??
      v4.find((ip) => /^(192\.168\.|10\.)/.test(ip)) ??
      v4[0] ?? null
    );
  }

  function startTurn() {
    if (turn || process.env.REMOTE_PLAY_TURN === "0") return;
    let bin = "";
    try { bin = execSync("command -v turnserver", { encoding: "utf8" }).trim(); } catch { /* not installed */ }
    if (!bin) {
      console.log("[remote-play] no turnserver binary — STUN only (off-LAN viewers may not connect; install coturn)");
      return;
    }
    const ip = process.env.REMOTE_PLAY_TURN_IP || pickRelayIp();
    if (!ip) return;
    const secret = crypto.randomBytes(24).toString("hex");
    const confPath = path.join(os.tmpdir(), `halcyon-turn-${port()}.conf`);
    fs.writeFileSync(confPath, [
      `listening-port=${TURN_PORT}`,
      `relay-ip=${ip}`,
      `min-port=${TURN_MIN_PORT}`,
      `max-port=${TURN_MAX_PORT}`,
      "fingerprint",
      "use-auth-secret",
      `static-auth-secret=${secret}`,
      "realm=halcyon-video",
      // Both ends of a private instance's stream live on THIS machine, so the
      // relay must accept peers that share its own address.
      "allow-loopback-peers",
      // Unprivileged child: everything coturn would write under /var or /run
      // has to move somewhere this user owns.
      `pidfile=${path.join(os.tmpdir(), "halcyon-turn.pid")}`,
      `userdb=${path.join(os.tmpdir(), "halcyon-turn.db")}`,
      "no-tls",
      "no-dtls",
      "no-cli",
      "simple-log",
      "log-file=stdout",
      "",
    ].join("\n"), { mode: 0o600 });
    const proc = spawn(bin, ["-c", confPath], { stdio: ["ignore", "ignore", "pipe"] });
    proc.on("error", () => { turn = null; });
    proc.on("exit", (code) => {
      if (turn?.proc !== proc) return;
      turn = null;
      console.log(`[remote-play] turnserver exited (${code}) — back to STUN only`);
    });
    proc.stderr?.on("data", (d) => {
      const line = String(d).trim().split("\n")[0];
      if (line) console.log(`[turnserver] ${line}`);
    });
    turn = { ip, port: TURN_PORT, secret, proc };
    console.log(`[remote-play] TURN relay on ${ip}:${TURN_PORT} — viewers off the LAN can reach the store`);
  }

  /**
   * ICE config for both ends of a session. The TURN pair is a long-term
   * credential derived from the shared secret the coturn child was started
   * with (RFC 5766 "REST API" scheme): the username IS its expiry stamp, so
   * there is no user database and nothing minted here outlives the day.
   */
  function iceServers() {
    const list = [{ urls: "stun:stun.l.google.com:19302" }];
    if (turn) {
      const username = `${Math.floor(Date.now() / 1000) + TURN_TTL_S}:store`;
      const credential = crypto.createHmac("sha1", turn.secret).update(username).digest("base64");
      list.push({
        urls: [`turn:${turn.ip}:${turn.port}?transport=udp`, `turn:${turn.ip}:${turn.port}?transport=tcp`],
        username,
        credential,
      });
    }
    return list;
  }

  function stopTurn() {
    const proc = turn?.proc;
    turn = null;
    try { proc?.kill("SIGTERM"); } catch { /* already gone */ }
  }

  // ── instance manager ──────────────────────────────────────────────────────
  const instances = new Map(); // id -> { id, browser, starting, createdAt, lastBeat, zeroSince }
  let httpServer = null;
  let reaper = null;
  let reapedStale = false;

  const port = () => httpServer?.address()?.port ?? 1420;
  const marker = () => `--bb-remote-instance-p${port()}`;

  function killInstance(rec, why) {
    instances.delete(rec.id);
    const b = rec.browser;
    if (b) {
      b.close().catch(() => {
        try { b.process()?.kill("SIGKILL"); } catch { /* already gone */ }
      });
    }
    console.log(`[remote-play] instance ${rec.id} closed (${why})`);
  }
  function killAll() {
    for (const rec of [...instances.values()]) killInstance(rec, "server shutdown");
    stopTurn();
  }
  function killAllSync() {
    for (const rec of instances.values()) {
      try { rec.browser?.process()?.kill("SIGKILL"); } catch { /* already gone */ }
    }
    instances.clear();
    stopTurn();
  }

  function ensureReaper() {
    if (reaper) return;
    reaper = setInterval(() => {
      const now = Date.now();
      for (const rec of [...instances.values()]) {
        if (rec.starting || now - rec.createdAt < BOOT_GRACE_MS) continue;
        if (now - rec.lastBeat > BEAT_TIMEOUT_MS) killInstance(rec, "no heartbeat");
        else if (rec.zeroSince && now - rec.zeroSince > IDLE_KILL_MS) killInstance(rec, "no viewers");
      }
    }, 15_000);
    reaper.unref?.();
  }

  async function spawnInstance(fast) {
    // Reap browsers leaked by a previous crashed server (same recipe as
    // shot.mjs: chrome binary + our port-scoped marker argv).
    if (!reapedStale) {
      reapedStale = true;
      try { execSync(`pkill -f 'chrom.*${marker()}' 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* none */ }
    }
    const id = "i" + Math.random().toString(36).slice(2, 8);
    const rec = { id, browser: null, starting: true, createdAt: Date.now(), lastBeat: Date.now(), zeroSince: Date.now() };
    instances.set(id, rec);
    try {
      const puppeteer = (await import("puppeteer")).default;
      const browser = await puppeteer.launch({
        args: [
          "--no-sandbox", "--disable-setuid-sandbox",
          // Real GPU GL — a SwiftShader store is unusable, and the hardware
          // encoder is what makes N simultaneous streams cheap.
          "--enable-gpu", "--use-gl=angle", "--use-angle=gl-egl",
          // WebAudio may start without a gesture (remote input is synthetic,
          // so a gesture never "really" happens inside the instance).
          "--autoplay-policy=no-user-gesture-required",
          // Raw LAN IPs in ICE candidates: phones/TVs can't always resolve
          // the mDNS names Chrome would otherwise hide them behind.
          "--disable-features=WebRtcHideLocalIpsWithMdns",
          // Containers cap /dev/shm at 64MB, which kills the renderer once
          // texture traffic starts; route shm through /tmp instead.
          // HALCYON_CONTAINER is set by the Dockerfile.
          ...(process.env.HALCYON_CONTAINER ? ["--disable-dev-shm-usage"] : []),
          marker(),
        ],
        defaultViewport: { width: 1600, height: 900 },
      });
      rec.browser = browser;
      browser.on("disconnected", () => {
        if (instances.get(id) === rec) instances.delete(id);
      });
      const page = await browser.newPage();
      if (seed) {
        await page.evaluateOnNewDocument((kv) => {
          try {
            for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, String(v));
            // bb_remote_play is deliberately NOT written here, in either
            // direction. It is already stripped from the seed (SEED_SKIP) so
            // the owner's kiosk setting can't make this instance register as
            // the shared mirror; ?remoteId= is what makes it host, as host-<id>.
            // Writing an explicit "0" used to look harmless and was the bug:
            // applyLiveSettings() replays every EXPLICITLY-SET live setting
            // once the scene is built, so the instance hosted, finished
            // booting, then switched its own stream off and left the viewer
            // stuck on "Store is still booting…". Leaving the key absent is
            // what keeps it out of that replay.
          } catch { /* storage unavailable */ }
        }, seed);
      }
      const base = `http://localhost:${port()}`;
      // Unseeded fallback: a dev checkout boots the synthetic harness; a
      // clean clone / container has no harness rig, so it boots the real
      // shell in runtime demo mode instead.
      const hasHarness = ["harness.html", "dist/harness.html"].some((f) =>
        fs.existsSync(path.join(process.cwd(), f))
      );
      const url = seed
        ? `${base}/?remoteId=${id}`
        : hasHarness
          ? `${base}/harness.html?remoteId=${id}${fast ? "&fast=1&lib=200" : ""}`
          : `${base}/?remoteId=${id}&demo=1`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      rec.starting = false;
      ensureReaper();
      console.log(`[remote-play] private instance ${id} up (${seed ? "seeded library" : "demo library"})`);
      return id;
    } catch (err) {
      killInstance(rec, "spawn failed");
      throw err;
    }
  }

  // ── HTTP handler ──────────────────────────────────────────────────────────
  function handler(req, res, next) {
    const url = String(req.url ?? "");
    if (!url.startsWith("/__remote/")) return next();
    const now = Date.now();
    for (const [peer, b] of boxes) {
      if (!b.waiter && now - b.lastSeen > PEER_TTL_MS) boxes.delete(peer);
    }

    if (req.method === "GET" && url.startsWith("/__remote/poll")) {
      const peer = new URL(url, "http://x").searchParams.get("peer") ?? "";
      if (!peer) return json(res, 400, { error: "missing peer" });
      const b = box(peer);
      b.lastSeen = now;
      if (b.msgs.length) return json(res, 200, { msgs: b.msgs.splice(0) });
      // One waiter per peer: a newer poll releases the stale one empty.
      if (b.waiter) {
        clearTimeout(b.waiter.timer);
        json(b.waiter.res, 200, { msgs: [] });
      }
      const timer = setTimeout(() => {
        if (b.waiter?.res === res) {
          b.waiter = null;
          json(res, 200, { msgs: [] });
        }
      }, LONG_POLL_MS);
      b.waiter = { res, timer };
      req.on("close", () => {
        if (b.waiter?.res === res) {
          clearTimeout(b.waiter.timer);
          b.waiter = null;
        }
      });
      return;
    }

    if (req.method === "GET" && url.startsWith("/__remote/status")) {
      const host = boxes.get("host");
      const hostOnline = !!host && (!!host.waiter || now - host.lastSeen < 35_000);
      const running = [...instances.values()].length;
      return json(res, 200, {
        hostOnline,
        instances: { cap: CAP, running, seeded: !!seed },
        iceServers: iceServers(),
      });
    }

    if (req.method === "POST" && url.startsWith("/__remote/send")) {
      return readBody(req, res, (m) => {
        const to = String(m.to ?? "");
        if (!to || typeof m.type !== "string") return json(res, 400, { error: "need to/type" });
        const b = box(to);
        b.msgs.push({ from: String(m.from ?? ""), type: m.type, payload: m.payload });
        if (b.msgs.length > 64) b.msgs.splice(0, b.msgs.length - 64);
        box(String(m.from ?? "")).lastSeen = now; // sending marks presence too
        flush(to);
        return json(res, 200, {});
      });
    }

    if (req.method === "POST" && url.startsWith("/__remote/seed")) {
      return readBody(req, res, (body) => {
        if (!validSeed(body)) return json(res, 400, { error: "need jellyfin_url + jellyfin_token" });
        const clean = {};
        for (const [k, v] of Object.entries(body)) {
          if (SEED_KEY.test(k) && !SEED_SKIP.has(k) && typeof v === "string") clean[k] = v;
        }
        seed = clean;
        try { fs.writeFileSync(SEED_FILE, JSON.stringify(clean, null, 2)); } catch { /* ro fs — memory-only seed */ }
        return json(res, 200, {});
      });
    }

    if (req.method === "POST" && url.startsWith("/__remote/instance/beat")) {
      return readBody(req, res, (body) => {
        const rec = instances.get(String(body.id ?? ""));
        if (!rec) return json(res, 404, { error: "unknown instance" });
        rec.lastBeat = now;
        rec.zeroSince = Number(body.viewers) > 0 ? null : (rec.zeroSince ?? now);
        return json(res, 200, {});
      });
    }

    if (req.method === "POST" && url.startsWith("/__remote/instance")) {
      return readBody(req, res, (body) => {
        // A refreshed viewer reconnects to its still-warm store instead of
        // paying a fresh boot (id survives in sessionStorage).
        const reuse = instances.get(String(body.reuse ?? ""));
        if (reuse && !reuse.starting) {
          reuse.lastBeat = now;
          return json(res, 200, { id: reuse.id, fresh: false });
        }
        if (instances.size >= CAP) return json(res, 503, { error: "at capacity" });
        spawnInstance(!!body.fast)
          .then((id) => json(res, 200, { id, fresh: true }))
          .catch((err) => json(res, 500, { error: String(err) }));
      });
    }

    return json(res, 404, { error: "unknown /__remote endpoint" });
  }

  function attach(server) {
    httpServer = server.httpServer;
    server.middlewares.use(handler);
    server.httpServer?.once("close", killAll);
    // Only once the port is known — the relay's config path is port-scoped,
    // the same way the instance marker is.
    if (server.httpServer?.listening) startTurn();
    else server.httpServer?.once("listening", startTurn);
  }
  process.once("exit", killAllSync);

  return {
    name: "remote-play",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
