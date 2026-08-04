// Hitch tracer (always on, ~zero overhead): the surgical data collector behind
// the "runs perfectly forever" goal. Every rAF frame gets one row in a
// preallocated ring buffer; instrumented code writes timing spans ("how long
// did X take this frame") and counters ("X happened N times this frame") into
// the current row through integer slot handles. When a frame's wall-clock dt
// spikes past an EMA-based threshold, the whole row — spans, counters,
// renderer.info deltas, JS-heap delta — is snapshotted into a bounded hitch
// log, so every hitch arrives pre-attributed. `window.__perfTrace.report()`
// returns the lot as JSON; tools/shot.mjs --perf drives a deterministic
// tape-flip session and saves it.
//
// Design constraints (see CLAUDE.md "performance is the prime directive"):
// - No per-frame allocations: rows are slices of one Float32Array; span
//   bookkeeping is fixed-size typed arrays; strings only at registration.
// - Objects are allocated only when a hitch fires (rare by definition) or in
//   report() (on demand).
// - Optional deep mode (instrumentGL) wraps raw WebGL entry points to time
//   texture uploads / shader compiles / buffer writes; it allocates per GL
//   call, so it's opt-in via ?trace=1 and meant for profiling sessions only.

const FRAME_CAP = 2048; // ~34s of frames at 60Hz
// Generous headroom: instrumentGL alone registers ~24, and perfSlot THROWS
// when full — which nukes whatever module was registering (a boot-killer
// caught the hard way when slot #49 landed inside the renderer constructor).
const SLOT_CAP = 128;
const HITCH_CAP = 128;
const LONGTASK_CAP = 64;

interface RendererInfoLike {
  memory: { geometries: number; textures: number };
  render: { calls: number; triangles: number };
  programs?: unknown[] | null;
  autoReset: boolean;
  reset(): void;
}

export interface HitchSnapshot {
  /** performance.now() at the start of the offending frame */
  t: number;
  /** wall-clock duration of the frame, ms */
  dt: number;
  /** EMA frame time when the hitch fired (context for how bad dt is) */
  ema: number;
  /** every non-zero span/counter recorded during the frame */
  slots: Record<string, number>;
}

class PerfTrace {
  private slotNames: string[] = [];
  private slotIndex = new Map<string, number>();
  private data = new Float32Array(FRAME_CAP * SLOT_CAP);
  private dts = new Float32Array(FRAME_CAP);
  private starts = new Float64Array(FRAME_CAP);
  private spanT0 = new Float64Array(SLOT_CAP);
  private head = 0; // row currently accumulating
  private framesSeen = 0;
  private rowStart = 0;
  private emaDt = 16.7;
  private hitches: HitchSnapshot[] = [];
  private longTasks: { t: number; d: number }[] = [];
  private info: RendererInfoLike | null = null;
  private lastTextures = 0;
  private lastGeometries = 0;
  private lastPrograms = 0;
  private lastHeap = 0;
  private glDeep = false;

  // Built-in slots (registered first so their indices are stable in reports).
  private S_TEX_D = this.slot('texturesDelta');
  private S_GEO_D = this.slot('geometriesDelta');
  private S_PROG_D = this.slot('programsDelta');
  private S_HEAP_D = this.slot('heapDeltaMB');
  private S_CALLS = this.slot('drawCalls');

  /** Register (or look up) a named slot; call once at module scope, keep the index. */
  slot(name: string): number {
    let idx = this.slotIndex.get(name);
    if (idx === undefined) {
      if (this.slotNames.length >= SLOT_CAP) throw new Error(`perf-trace: out of slots registering "${name}"`);
      idx = this.slotNames.length;
      this.slotNames.push(name);
      this.slotIndex.set(name, idx);
    }
    return idx;
  }

  attachRenderer(renderer: { info: RendererInfoLike }) {
    this.info = renderer.info;
    // Accumulate render stats across ALL passes/targets of a frame (composer
    // passes, mirror + shadow renders) instead of three's per-render() reset;
    // frameTick() resets the counters at each row boundary. renderer.info's
    // live memory counters (used by the harness leak checks) are unaffected.
    this.info.autoReset = false;
    this.lastTextures = this.info.memory.textures;
    this.lastGeometries = this.info.memory.geometries;
    this.lastPrograms = this.info.programs?.length ?? 0;
  }

  /** Start timing a span this frame (re-entrant per slot: last begin wins). */
  begin(idx: number) {
    this.spanT0[idx] = performance.now();
  }

  /** Finish a span: adds elapsed ms into the current frame's row. */
  end(idx: number) {
    this.data[this.head * SLOT_CAP + idx] += performance.now() - this.spanT0[idx];
  }

  /** Bump a counter (or add an arbitrary value) in the current frame's row. */
  count(idx: number, n = 1) {
    this.data[this.head * SLOT_CAP + idx] += n;
  }

  /** Called once at the top of every rAF. Finalizes the previous frame's row. */
  frameTick(now: number) {
    if (this.framesSeen === 0) {
      this.rowStart = now;
      this.framesSeen = 1;
      if (this.info) this.info.reset();
      return;
    }
    const row = this.head;
    const base = row * SLOT_CAP;
    const dt = now - this.rowStart;
    this.dts[row] = dt;
    this.starts[row] = this.rowStart;

    if (this.info) {
      const mem = this.info.memory;
      const progs = this.info.programs?.length ?? 0;
      this.data[base + this.S_TEX_D] = mem.textures - this.lastTextures;
      this.data[base + this.S_GEO_D] = mem.geometries - this.lastGeometries;
      this.data[base + this.S_PROG_D] = progs - this.lastPrograms;
      this.data[base + this.S_CALLS] = this.info.render.calls;
      this.lastTextures = mem.textures;
      this.lastGeometries = mem.geometries;
      this.lastPrograms = progs;
      this.info.reset();
    }
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
    if (heap > 0) {
      this.data[base + this.S_HEAP_D] = this.lastHeap > 0 ? (heap - this.lastHeap) / 1048576 : 0;
      this.lastHeap = heap;
    }

    // Hitch: a frame notably longer than the recent norm. max(1.6×EMA, EMA+8ms)
    // fires on any missed vsync at 60/120Hz without flagging a machine that is
    // merely slow-but-steady.
    if (dt > Math.max(this.emaDt * 1.6, this.emaDt + 8)) {
      const slots: Record<string, number> = {};
      for (let i = 0; i < this.slotNames.length; i++) {
        const v = this.data[base + i];
        if (v !== 0) slots[this.slotNames[i]] = Math.round(v * 1000) / 1000;
      }
      this.hitches.push({ t: this.starts[row], dt: Math.round(dt * 100) / 100, ema: Math.round(this.emaDt * 100) / 100, slots });
      if (this.hitches.length > HITCH_CAP) this.hitches.shift();
    }
    this.emaDt += (dt - this.emaDt) * 0.05;

    this.framesSeen++;
    this.head = (row + 1) % FRAME_CAP;
    this.data.fill(0, this.head * SLOT_CAP, this.head * SLOT_CAP + SLOT_CAP);
    this.rowStart = now;
  }

  /** Opt-in deep mode: time raw GL upload/compile entry points (?trace=1). */
  instrumentGL(gl: WebGLRenderingContext | WebGL2RenderingContext | null) {
    if (!gl || this.glDeep) return;
    this.glDeep = true;
    const wrap = (fnName: string, msSlot: string, nSlot: string) => {
      const target = gl as unknown as Record<string, (...a: unknown[]) => unknown>;
      const orig = target[fnName];
      if (typeof orig !== 'function') return;
      const bound = orig.bind(gl);
      const sMs = this.slot(msSlot);
      const sN = this.slot(nSlot);
      target[fnName] = (...args: unknown[]) => {
        const t0 = performance.now();
        const r = bound(...args);
        const base = this.head * SLOT_CAP;
        this.data[base + sMs] += performance.now() - t0;
        this.data[base + sN]++;
        return r;
      };
    };
    wrap('texImage2D', 'glTexImgMs', 'glTexImgN');
    wrap('texSubImage2D', 'glTexSubMs', 'glTexSubN');
    wrap('texImage3D', 'glTexImg3Ms', 'glTexImg3N');
    wrap('texSubImage3D', 'glTexSub3Ms', 'glTexSub3N');
    wrap('compressedTexImage2D', 'glTexCmpMs', 'glTexCmpN');
    wrap('generateMipmap', 'glMipmapMs', 'glMipmapN');
    wrap('compileShader', 'glCompileMs', 'glCompileN');
    wrap('linkProgram', 'glLinkMs', 'glLinkN');
    wrap('getProgramParameter', 'glProgQMs', 'glProgQN');
    wrap('bufferData', 'glBufDataMs', 'glBufDataN');
    wrap('bufferSubData', 'glBufSubMs', 'glBufSubN');
    wrap('readPixels', 'glReadPxMs', 'glReadPxN');
  }

  private observeLongTasks() {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          this.longTasks.push({ t: Math.round(e.startTime * 10) / 10, d: Math.round(e.duration * 10) / 10 });
          if (this.longTasks.length > LONGTASK_CAP) this.longTasks.shift();
        }
      });
      obs.observe({ type: 'longtask', buffered: true });
    } catch {
      /* longtask unsupported (e.g. WebKitGTK) — dt spikes still catch stalls */
    }
  }

  /** Clear all captured data (keeps slot registrations and renderer hookup). */
  reset() {
    this.data.fill(0);
    this.dts.fill(0);
    this.framesSeen = 0;
    this.head = 0;
    this.emaDt = 16.7;
    this.hitches = [];
    this.longTasks = [];
    if (this.info) {
      this.lastTextures = this.info.memory.textures;
      this.lastGeometries = this.info.memory.geometries;
      this.lastPrograms = this.info.programs?.length ?? 0;
    }
    this.lastHeap = 0;
  }

  /** Full JSON report: frame-time distribution, per-slot totals, hitch log. */
  report() {
    const n = Math.min(this.framesSeen - 1, FRAME_CAP);
    const valid: number[] = [];
    for (let i = 0; i < n; i++) {
      // Ring rows other than the currently-accumulating one hold finalized dts.
      const row = (this.head - 1 - i + FRAME_CAP * 2) % FRAME_CAP;
      if (this.dts[row] > 0) valid.push(this.dts[row]);
    }
    const sorted = valid.slice().sort((a, b) => a - b);
    const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
    const totals: Record<string, number> = {};
    const maxes: Record<string, number> = {};
    for (let s = 0; s < this.slotNames.length; s++) {
      let sum = 0;
      let max = 0;
      for (let i = 0; i < n; i++) {
        const row = (this.head - 1 - i + FRAME_CAP * 2) % FRAME_CAP;
        const v = this.data[row * SLOT_CAP + s];
        sum += v;
        if (v > max) max = v;
      }
      if (sum !== 0) {
        totals[this.slotNames[s]] = Math.round(sum * 100) / 100;
        maxes[this.slotNames[s]] = Math.round(max * 100) / 100;
      }
    }
    return {
      frames: sorted.length,
      dtMs: {
        p50: Math.round(pct(50) * 100) / 100,
        p90: Math.round(pct(90) * 100) / 100,
        p99: Math.round(pct(99) * 100) / 100,
        max: Math.round((sorted[sorted.length - 1] ?? 0) * 100) / 100,
        mean: Math.round((valid.reduce((a, b) => a + b, 0) / (valid.length || 1)) * 100) / 100,
      },
      slotTotals: totals,
      slotMaxPerFrame: maxes,
      hitches: this.hitches.slice(),
      longTasks: this.longTasks.slice(),
      deepGL: this.glDeep,
    };
  }

  constructor() {
    if (typeof window !== 'undefined') {
      this.observeLongTasks();
      (window as unknown as Record<string, unknown>).__perfTrace = this;
    }
  }
}

export const perfTrace = new PerfTrace();

/** Register a named slot; module-scope call, keep the returned index. */
export function perfSlot(name: string): number {
  return perfTrace.slot(name);
}
