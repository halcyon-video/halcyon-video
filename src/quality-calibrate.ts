// Measured GPU quality calibration — replaces the WEBGL_debug_renderer_info
// regex guess (see three-scene.ts's softwareGL/integratedGL match) with an
// actual ~0.5-1s fill-rate micro-benchmark run on a throwaway WebGL2 canvas
// BEFORE the real StoreScene (and its expensive renderer) is constructed.
//
// Why the regex alone isn't enough: it string-matches the UNMASKED_RENDERER_
// WEBGL name, which Brave/Firefox privacy modes mask entirely, which no
// pattern here recognizes on Apple Silicon, and which happily waves an old,
// weak discrete GPU through to 'high' just because its name doesn't say
// "intel" or "vega". All three land on 'high' today — the most expensive
// tier (supersampled up to 2x pixel ratio, N8AO + bloom + bokeh) — on
// exactly the machines that most need protecting from it. Measuring the GPU
// instead of pattern-matching its name catches all three.
//
// Persistence contract (localStorage):
//   bb_quality        explicit user/harness override — sole authority when
//                      present; calibration never runs and is never
//                      consulted (see calibrateQualityIfNeeded's first line
//                      and readCalibratedQuality's callers in three-scene.ts).
//   bb_quality_auto    calibrated tier ('low'|'medium'|'high'), used only
//                      when bb_quality is absent.
//   bb_quality_ss      '1'|'0' — supersample grant (see classify() below).
//   bb_quality_sig     signature the calibration was measured under: GPU
//                      name + screen dims + devicePixelRatio + this file's
//                      CALIBRATION_VERSION. A mismatch (new machine, new
//                      monitor, DPR change, or a workload/threshold change
//                      that bumps the version) invalidates the cache and a
//                      fresh benchmark runs on the next boot.
//
// Call graph: main.ts's initializeStoreScene() awaits
// calibrateQualityIfNeeded() once, right before it dynamically imports
// three-scene.ts and constructs the StoreScene — behind the boot overlay,
// which is already up by default on first paint (index.html) and re-shown
// for rebuilds (showBootOverlay()). That import site sits AFTER main.ts's
// flat-mode early return, so 2.5D boots never pull this module (or its
// throwaway WebGL2 context) in at all — same reason StoreScene itself is a
// dynamic import there.
//
// Second caller (GH #138): boot-flow.ts's startDemoAndLoad() also awaits it,
// EARLIER and only in 3D mode, to size the public demo's synthetic catalog to
// what this GPU can actually carry instead of always building the fixed
// ~2,000-title store. Safe to call twice in one boot — the cache-signature
// check makes the second call (inside initializeStoreScene, moments later)
// an instant no-op.
//
// three-scene.ts's own effectiveQuality line then reads readCalibratedQuality()
// — synchronous, no benchmark — as the middle tier of a three-way waterfall:
// explicit bb_quality, else a valid calibration, else the original regex
// guess (kept forever: it's what covers first-boot-before-calibration and
// any calibration failure).

export type QualityTier = 'low' | 'medium' | 'high';

/** Bump whenever the benchmark workload or thresholds below change — it is
 * part of the cache signature, so a bump invalidates every stored result. */
export const CALIBRATION_VERSION = 1;

export interface CalibratedQuality {
  tier: QualityTier;
  supersample: boolean;
}

// ─── Renderer-name regexes ─────────────────────────────────────────────────
// Mirror three-scene.ts's softwareGL/integratedGL detection (~line 1766,
// 1773) exactly. Duplicated rather than imported because this module has to
// run against ITS OWN throwaway context before StoreScene (and its renderer)
// exist — there is no shared renderer to read the name off of yet. Keep in
// sync if the regexes there ever change.
const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software|basic render|warp/i;
const INTEGRATED_RE = /intel.*(uhd|hd graphics|iris)|iris ?xe|radeon\(tm\) graphics|vega \d|\bmali\b|adreno/i;
const INTEGRATED_EXCLUDE_RE = /arc|rtx|gtx|geforce|radeon rx/i;

// ─── Benchmark workload constants (deterministic — same on every machine) ──
const NORM_W = 1600;
const NORM_H = 900;
const BLEND_LAYERS = 8; // full-screen blended overdraw passes (glass/signage/bloom-composite shaped)
const PING_PONG_PASSES = 4; // RT ping-pong blur passes (N8AO/bloom composer-pass shaped)
const INSTANCE_COUNT = 16384; // instanced quads (shelving/case-geometry shaped)
const WARMUP_FRAMES = 5; // discarded — absorbs shader-compile/driver JIT stalls
const MEASURE_FRAMES = 20;
const MIN_VALID_FRAMES = 6; // fewer than this (wall-budget cutoff) -> treat as inconclusive
const WALL_BUDGET_MS = 1200; // circuit breaker so a struggling real GPU still returns promptly

// ─── Tier thresholds (median ms/frame of the above workload) ──────────────
// Empirically set against this workload on 2026-08-05, measured with a
// puppeteer probe driving a real-GPU headless Chrome (see the verification
// notes — this module has no test-time way to assert a live GPU number):
//   Radeon RX 9070 XT (owner's dev box, real dGPU, Chrome/ANGLE-GL): ~12.4ms
//     median — roughly 5x under HIGH_MAX_MS and 3x under SUPERSAMPLE_MAX_MS,
//     landing 'high' + the supersample grant with a wide margin either way.
// (Getting a real signal out of this workload took two rounds of tuning: the
// first pass used gl.finish() as the CPU/GPU sync point and always measured
// 0.0ms regardless of workload size — on this ANGLE/headless setup finish()
// returns once commands are queued, not once the GPU has actually finished
// them. Swapping to a gl.readPixels() readback, which cannot return before
// the sampled texel is actually rendered, is what produced a real number.)
//
// This synthetic workload is shaped like the real scene's composer chain
// (overdraw + RT ping-pong + instancing) but is not the same pixel count or
// shader cost, so its absolute ms is not comparable to a real frame's budget
// — only the RELATIVE ordering across GPU classes matters, which is what
// these boundaries encode: a mid-range-or-better discrete GPU clears
// HIGH_MAX_MS with room to spare, a typical Intel/AMD thin-and-light
// integrated part lands in the MEDIUM band (and the integratedGL prior below
// nudges borderline cases down a notch further), and anything slower than
// that — old/weak discrete parts included — settles at 'low'. The absolute
// numbers below are a reasoned estimate (this repo has exactly one real GPU
// to measure against): typical thin-and-light iGPUs are commonly cited as
// roughly 5-15x slower than a current-gen mid/high-end discrete part on
// shader-bound work like this, not 40-60x (this workload isn't purely
// FLOPS-bound — fill rate, texture bandwidth and per-draw overhead all
// matter too), so MEDIUM_MAX_MS gives that a generous multiple of headroom
// rather than a tight one.
const HIGH_MAX_MS = 60;
const SUPERSAMPLE_MAX_MS = 35; // subset of 'high' with enough headroom to render ABOVE native res
const MEDIUM_MAX_MS = 160;
const BOUNDARY_BAND = 0.85; // within 15% of a threshold counts as "near" it for the integratedGL prior

function computeSig(gpuName: string): string {
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const w = typeof screen !== 'undefined' ? screen.width : 0;
  const h = typeof screen !== 'undefined' ? screen.height : 0;
  return `v${CALIBRATION_VERSION}|${gpuName}|${w}x${h}|${dpr}`;
}

function isValidTier(v: string | null): v is QualityTier {
  return v === 'low' || v === 'medium' || v === 'high';
}

/**
 * Synchronous, no benchmark: reads back a previously-persisted calibration
 * IF its signature still matches this machine (same GPU name, screen, DPR,
 * and calibration version). Called from three-scene.ts's effectiveQuality
 * line. Returns null on any mismatch/absence — callers fall back to the
 * regex guess.
 */
export function readCalibratedQuality(gpuName: string): CalibratedQuality | null {
  if (typeof localStorage === 'undefined') return null;
  const tier = localStorage.getItem('bb_quality_auto');
  if (!isValidTier(tier)) return null;
  if (localStorage.getItem('bb_quality_sig') !== computeSig(gpuName)) return null;
  return { tier, supersample: localStorage.getItem('bb_quality_ss') === '1' };
}

// ─── Harness safety ─────────────────────────────────────────────────────────
// Belt-and-suspenders: the harness (harness.html -> harness-boot.ts ->
// harness.ts) never calls calibrateQualityIfNeeded() in the first place — it
// builds its StoreScene directly and never imports main.ts — but this keeps
// the invariant true even if that call graph ever changes, and documents it
// in one place. tools/shot.mjs always drives harness.html.
function isHarnessActive(): boolean {
  return typeof location !== 'undefined' && /harness\.html$/.test(location.pathname);
}

function classify(score: number, integratedGL: boolean): CalibratedQuality {
  let tier: QualityTier = score <= HIGH_MAX_MS ? 'high' : score <= MEDIUM_MAX_MS ? 'medium' : 'low';
  // Tie-breaker PRIOR near a boundary: an integrated-GPU name match nudges
  // the tier down a notch. The regex is an incomplete signal on its own
  // (see the module header), but near a threshold it's a reasonable prior
  // that this part shares memory bandwidth with the CPU and has less real
  // headroom than one fast synthetic score suggests.
  if (integratedGL) {
    if (tier === 'high' && score > HIGH_MAX_MS * BOUNDARY_BAND) tier = 'medium';
    else if (tier === 'medium' && score > MEDIUM_MAX_MS * BOUNDARY_BAND) tier = 'low';
  }
  const supersample = tier === 'high' && score <= SUPERSAMPLE_MAX_MS &&
    !(integratedGL && score > SUPERSAMPLE_MAX_MS * BOUNDARY_BAND);
  return { tier, supersample };
}

// ─── Throwaway WebGL2 probe context ────────────────────────────────────────

interface Probe {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
}

function openProbe(): Probe | null {
  try {
    const canvas = document.createElement('canvas'); // never attached to the DOM
    canvas.width = NORM_W;
    canvas.height = NORM_H;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      desynchronized: true,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;
    return gl ? { canvas, gl } : null;
  } catch {
    return null;
  }
}

function detectGpuName(gl: WebGL2RenderingContext): string {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return dbg
    ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
}

function disposeProbe(probe: Probe): void {
  probe.gl.getExtension('WEBGL_lose_context')?.loseContext();
}

// ─── Micro-benchmark ────────────────────────────────────────────────────────
// Fill-rate-bound blended full-screen quads + composer-shaped RT ping-pong +
// instanced geometry, at a fixed (not device-scaled) resolution so the score
// is comparable across machines. Everything it allocates is deleted before
// returning (or via the WEBGL_lose_context call in disposeProbe above).

const FULLSCREEN_VS = `#version 300 es
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

// Overdraw layer: a cheap-looking but real per-fragment ALU cost (fixed
// iteration count, no time/random input) standing in for the store's
// blended glass/signage/bloom-accumulate fill cost. The last layer samples
// the ping-ponged texture so that pass can't be dead-code-eliminated.
const BLEND_FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uSeed;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv * 8.0 + uSeed;
  float v = 0.0;
  for (int i = 0; i < 400; i++) {
    p = vec2(p.y, p.x) * 1.3 + vec2(sin(p.x * 3.1), cos(p.y * 2.7));
    v += sin(p.x) * cos(p.y);
  }
  v = fract(v * 0.1);
  vec3 base = mix(vec3(v, v * 0.6, 1.0 - v), texture(uTex, uv).rgb, 0.25);
  outColor = vec4(base, 0.18);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec4 sum = texture(uTex, uv) * 0.6;
  sum += texture(uTex, uv + uTexel * vec2(-1.5, -1.5)) * 0.1;
  sum += texture(uTex, uv + uTexel * vec2(1.5, -1.5)) * 0.1;
  sum += texture(uTex, uv + uTexel * vec2(-1.5, 1.5)) * 0.1;
  sum += texture(uTex, uv + uTexel * vec2(1.5, 1.5)) * 0.1;
  outColor = sum;
}`;

const INSTANCE_VS = `#version 300 es
layout(location = 0) in vec2 aOffset;
layout(location = 1) in float aScale;
const vec2 QUAD[6] = vec2[6](
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
  vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0)
);
void main() {
  vec2 local = QUAD[gl_VertexID] * aScale * 0.012;
  gl_Position = vec4(aOffset + local, 0.0, 1.0);
}`;

const INSTANCE_FS = `#version 300 es
precision mediump float;
out vec4 outColor;
void main() { outColor = vec4(0.2, 0.6, 0.9, 1.0); }`;

function compileProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  const ok = gl.getProgramParameter(prog, gl.LINK_STATUS) as boolean;
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!ok) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function frameYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeTarget(gl: WebGL2RenderingContext, own: { textures: WebGLTexture[]; framebuffers: WebGLFramebuffer[] }) {
  const tex = gl.createTexture()!;
  own.textures.push(tex);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, NORM_W, NORM_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  own.framebuffers.push(fbo);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { fbo, tex };
}

/** Runs the workload; returns the median frame ms, or null if inconclusive
 * (shader compile failure, or the wall-clock breaker cut it off too early). */
async function runBenchmark(gl: WebGL2RenderingContext): Promise<number | null> {
  const own: { buffers: WebGLBuffer[]; textures: WebGLTexture[]; framebuffers: WebGLFramebuffer[]; programs: WebGLProgram[]; vaos: WebGLVertexArrayObject[] } =
    { buffers: [], textures: [], framebuffers: [], programs: [], vaos: [] };
  try {
    const blendProg = compileProgram(gl, FULLSCREEN_VS, BLEND_FS);
    const blurProg = compileProgram(gl, FULLSCREEN_VS, BLUR_FS);
    const instProg = compileProgram(gl, INSTANCE_VS, INSTANCE_FS);
    if (!blendProg || !blurProg || !instProg) return null;
    own.programs.push(blendProg, blurProg, instProg);

    const instVao = gl.createVertexArray();
    const emptyVao = gl.createVertexArray();
    if (!instVao || !emptyVao) return null;
    own.vaos.push(instVao, emptyVao);

    gl.bindVertexArray(instVao);
    const instBuf = gl.createBuffer();
    if (!instBuf) return null;
    own.buffers.push(instBuf);
    const data = new Float32Array(INSTANCE_COUNT * 3);
    const cols = Math.ceil(Math.sqrt(INSTANCE_COUNT));
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      data[i * 3 + 0] = (cx / cols) * 2 - 1;
      data[i * 3 + 1] = (cy / cols) * 2 - 1;
      data[i * 3 + 2] = 0.6 + 0.4 * Math.sin(i * 0.618); // deterministic scale variation
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);

    const rtA = makeTarget(gl, own);
    const rtB = makeTarget(gl, own);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, NORM_W, NORM_H);

    const blendSeedLoc = gl.getUniformLocation(blendProg, 'uSeed');
    const blendResLoc = gl.getUniformLocation(blendProg, 'uRes');
    const blendTexLoc = gl.getUniformLocation(blendProg, 'uTex');
    const blurTexLoc = gl.getUniformLocation(blurProg, 'uTex');
    const blurTexelLoc = gl.getUniformLocation(blurProg, 'uTexel');

    const frame = () => {
      // 1) instanced "scene" pass (shelving/case-geometry shaped)
      gl.bindFramebuffer(gl.FRAMEBUFFER, rtA.fbo);
      gl.clearColor(0.05, 0.05, 0.08, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND);
      gl.useProgram(instProg);
      gl.bindVertexArray(instVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, INSTANCE_COUNT);

      // 2) composer-shaped RT ping-pong (N8AO/bloom shaped)
      gl.useProgram(blurProg);
      gl.bindVertexArray(emptyVao);
      gl.uniform2f(blurTexelLoc, 1 / NORM_W, 1 / NORM_H);
      let src = rtA;
      let dst = rtB;
      for (let i = 0; i < PING_PONG_PASSES; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(blurTexLoc, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const tmp = src;
        src = dst;
        dst = tmp;
      }

      // 3) fill-rate-bound blended composite onto the default framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(blendProg);
      gl.uniform2f(blendResLoc, NORM_W, NORM_H);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(blendTexLoc, 0);
      gl.bindVertexArray(emptyVao);
      for (let layer = 0; layer < BLEND_LAYERS; layer++) {
        gl.uniform1f(blendSeedLoc, layer * 0.37);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };

    // Sync point: gl.readPixels() forces the driver to actually wait for the
    // frame's GPU work to land before the 1 texel of data can be handed
    // back, which is a much more reliable CPU/GPU sync than gl.finish() —
    // measured empirically on this machine, finish() returned near-
    // instantly regardless of workload size (ANGLE/headless queues the
    // commands and doesn't block), which made every score read as 0.0ms.
    const pixelBuf = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuf);

    for (let i = 0; i < WARMUP_FRAMES; i++) {
      frame();
      sync();
      await frameYield();
    }

    const times: number[] = [];
    const t0 = performance.now();
    for (let i = 0; i < MEASURE_FRAMES; i++) {
      const f0 = performance.now();
      frame();
      sync();
      times.push(performance.now() - f0);
      if (performance.now() - t0 > WALL_BUDGET_MS) break;
      await frameYield();
    }
    if (times.length < MIN_VALID_FRAMES) return null;
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  } finally {
    for (const b of own.buffers) gl.deleteBuffer(b);
    for (const t of own.textures) gl.deleteTexture(t);
    for (const f of own.framebuffers) gl.deleteFramebuffer(f);
    for (const p of own.programs) gl.deleteProgram(p);
    for (const v of own.vaos) gl.deleteVertexArray(v);
  }
}

// ─── Entry point (called once from main.ts, before StoreScene construction) ─

/**
 * Measures this GPU and persists bb_quality_auto/bb_quality_ss/bb_quality_sig
 * — unless an explicit bb_quality override is set, the harness is active, a
 * valid cached calibration already matches this machine's signature, or the
 * GPU name says software rendering (forced to 'low' with no benchmark, and
 * nothing is persisted so the regex fallback keeps governing every boot).
 * Never throws — any failure just leaves the regex fallback in charge.
 *
 * Returns the resolved tier (the SAME value three-scene.ts's own
 * explicit-then-calibrated-then-regex waterfall will land on a moment later)
 * so a second caller can act on it directly, or null when nothing conclusive
 * was determined (no probe, harness, inconclusive benchmark) — in which case
 * three-scene.ts still has its own regex-on-the-real-renderer fallback, a
 * caller here does not.
 */
export async function calibrateQualityIfNeeded(): Promise<QualityTier | null> {
  if (typeof localStorage === 'undefined') return null;
  const explicit = localStorage.getItem('bb_quality');
  if (explicit) return isValidTier(explicit) ? explicit : null; // explicit override always wins, skips calibration entirely
  if (isHarnessActive()) return null;

  try {
    const probe = openProbe();
    if (!probe) {
      console.log('[calibrate] no WebGL2 context available on the probe canvas — falling back to renderer-name detection');
      return null;
    }
    const { gl } = probe;
    const gpuName = detectGpuName(gl);

    if (SOFTWARE_RE.test(gpuName)) {
      console.log(`[calibrate] ${gpuName} — software rendering, skipping benchmark (regex fallback forces low)`);
      disposeProbe(probe);
      return 'low';
    }

    const sig = computeSig(gpuName);
    const cachedTier = localStorage.getItem('bb_quality_auto');
    if (localStorage.getItem('bb_quality_sig') === sig && isValidTier(cachedTier)) {
      const ss = localStorage.getItem('bb_quality_ss') === '1';
      console.log(`[calibrate] ${gpuName} → ${cachedTier}${ss ? ' +supersample' : ''} (cached)`);
      disposeProbe(probe);
      return cachedTier;
    }

    const t0 = performance.now();
    const score = await runBenchmark(gl);
    const elapsedMs = performance.now() - t0;
    disposeProbe(probe);

    if (score == null) {
      console.log(`[calibrate] ${gpuName} — benchmark inconclusive after ${elapsedMs.toFixed(0)}ms, falling back to renderer-name detection`);
      return null;
    }

    const integratedGL = INTEGRATED_RE.test(gpuName) && !INTEGRATED_EXCLUDE_RE.test(gpuName);
    const { tier, supersample } = classify(score, integratedGL);
    localStorage.setItem('bb_quality_auto', tier);
    localStorage.setItem('bb_quality_ss', supersample ? '1' : '0');
    localStorage.setItem('bb_quality_sig', sig);
    console.log(`[calibrate] ${score.toFixed(1)}ms median (${gpuName}) → ${tier}${supersample ? ' +supersample' : ''} (${elapsedMs.toFixed(0)}ms)`);
    return tier;
  } catch (e) {
    console.log(`[calibrate] benchmark failed (${e instanceof Error ? e.message : e}) — falling back to renderer-name detection`);
    return null;
  }
}

// ─── Optional backstop (design point 8) ────────────────────────────────────
// If the store's own first ~10s of REAL frames run catastrophically over
// budget (median more than 2x the 60fps target), demote bb_quality_auto one
// tier for the NEXT boot. Only touches the AUTO path; an explicit bb_quality
// override is never silently overridden. One-shot per StoreScene lifetime —
// call it once after construction. Cheap: reads the always-on hitch tracer
// (src/perf-trace.ts via window.__perfTrace), no new instrumentation.
let backstopArmed = false;
export function armQualityBackstop(): void {
  if (backstopArmed) return; // one-shot per page load — a settings rebuild re-calls this
  if (typeof localStorage === 'undefined' || typeof window === 'undefined') return;
  if (localStorage.getItem('bb_quality')) return;
  backstopArmed = true;
  const tier = localStorage.getItem('bb_quality_auto');
  if (!isValidTier(tier) || tier === 'low') return; // nothing lower to fall back to
  setTimeout(() => {
    const trace = (window as unknown as { __perfTrace?: { report(): { frames: number; dtMs: { p50: number } } } }).__perfTrace;
    const report = trace?.report();
    if (!report || report.frames < 60) return; // not enough real frames captured yet
    const targetMs = 1000 / 60;
    if (report.dtMs.p50 > targetMs * 2) {
      const demoted: QualityTier = tier === 'high' ? 'medium' : 'low';
      localStorage.setItem('bb_quality_auto', demoted);
      console.log(`[calibrate] first ${report.frames} real frames p50=${report.dtMs.p50.toFixed(1)}ms (target ${targetMs.toFixed(1)}ms) — demoting ${tier} -> ${demoted} for next boot`);
    }
  }, 10_000);
}
