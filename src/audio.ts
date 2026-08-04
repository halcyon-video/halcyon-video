// Small procedural sound engine for the store's immersion audio pass.
//
// Everything here is synthesized on the fly with WebAudio (oscillators +
// filtered noise envelopes) — no external asset downloads, no new deps. The
// AudioContext is created lazily on first trigger (browsers refuse to start
// one before a user gesture), and every sound is mixed quietly relative to
// MASTER_VOLUME so nothing competes with the store's ambient chime.
//
// The door chime itself already lived in three-scene.ts (StoreScene.playDoorChime)
// before this module existed; it is left in place and reused as-is for both
// entry and exit so we don't double up on "ding-dong" sounds.

const MASTER_VOLUME = 0.35; // ceiling every effect below is scaled against

class RetailAudio {
  private ctx: AudioContext | null = null;
  private lastFootstepTime = 0;
  private footstepToggle = 0; // alternates L/R pan on successive steps
  // Set true by the idle governor when the window is hidden/occluded (issue #16):
  // while true, ensureCtx() will NOT auto-resume a suspended context, so a stray
  // sound trigger during deep-idle can't spin the audio hardware back up.
  private idleSuspended = false;

  // Master bus: every effect routes through one gain on its way to the
  // speakers, so Remote Play (src/remote-play.ts) can tee the whole mix into
  // a MediaStreamAudioDestinationNode without touching individual sounds.
  private masterBus: GainNode | null = null;
  private remoteDest: MediaStreamAudioDestinationNode | null = null;

  private ensureCtx(): AudioContext | null {
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended' && !this.idleSuspended) this.ctx.resume().catch(() => {});
      return this.ctx;
    } catch {
      return null; // WebAudio unavailable — fail silent, never throw
    }
  }

  private bus(ctx: AudioContext): GainNode {
    if (!this.masterBus) {
      this.masterBus = ctx.createGain();
      this.masterBus.connect(ctx.destination);
      if (this.remoteDest) this.masterBus.connect(this.remoteDest);
    }
    return this.masterBus;
  }

  /**
   * Audio track of the store's SFX mix for the Remote Play WebRTC stream.
   * Constructing the context pre-gesture is allowed (same rule as prewarm —
   * it just sits suspended); returns null only when WebAudio is unavailable.
   * Not in this mix: the door chime (its own context in three-scene.ts) and
   * movie playback audio.
   */
  public captureRemoteTrack(): MediaStreamTrack | null {
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (!this.remoteDest) {
        // Materialize the bus BEFORE registering the destination so bus()
        // doesn't also connect it — that double path would sum the mix twice.
        const b = this.bus(this.ctx);
        this.remoteDest = this.ctx.createMediaStreamDestination();
        b.connect(this.remoteDest);
      }
      return this.remoteDest.stream.getAudioTracks()[0] ?? null;
    } catch {
      return null;
    }
  }

  // Idle governor hooks (issue #16): suspend the AudioContext when the store is
  // hidden/occluded (user on IPTV or a game) so the audio thread stops consuming
  // CPU, and resume it cleanly on wake. Both are no-ops if the context was never
  // created (nothing has made a sound yet), so they never force WebAudio to start.
  public suspendForIdle() {
    this.idleSuspended = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }
  public resumeFromIdle() {
    this.idleSuspended = false;
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // Boot-time prewarm (perf-trace: the FIRST sound trigger — i.e. the first
  // selection move's box-slide — used to pay `new AudioContext()`'s audio
  // device negotiation inside the keypress). Construction is allowed before a
  // user gesture (the context just sits suspended); ensureCtx() resumes it on
  // the first real trigger as before.
  public prewarm() {
    try {
      if (!this.ctx) this.ctx = new AudioContext();
    } catch { /* no audio device — ensureCtx keeps handling that case */ }
  }

  // Build a short buffer of white noise, useful as the seed for swishes,
  // whooshes and clicks once run through a filter + envelope.
  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ─── Carpet footsteps ───────────────────────────────────────────────────
  // Soft low thud (short filtered sine/triangle blip) layered with a faint
  // fabric-noise swish. Called every frame from the walk-movement update;
  // internally rate-limited so rapid calls (e.g. a lag spike) never machine
  // gun — the real cadence-vs-speed relationship is handled by the caller,
  // which only invokes this once per fixed distance travelled.
  public playFootstep() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = performance.now();
    if (now - this.lastFootstepTime < 160) return; // hard floor, belt & braces
    this.lastFootstepTime = now;

    const t0 = ctx.currentTime + 0.005;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    this.footstepToggle = this.footstepToggle === 0 ? 1 : 0;
    if (pan) pan.pan.value = (this.footstepToggle === 0 ? -1 : 1) * (0.12 + Math.random() * 0.08);

    const out = ctx.createGain();
    out.gain.value = MASTER_VOLUME * 0.28;
    if (pan) {
      out.connect(pan);
      pan.connect(this.bus(ctx));
    } else {
      out.connect(this.bus(ctx));
    }

    // Low thud: a short sine blip with a random pitch wobble per step.
    const thudFreq = 70 + Math.random() * 18;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = thudFreq;
    const thudGain = ctx.createGain();
    const thudDur = 0.09 + Math.random() * 0.03;
    thudGain.gain.setValueAtTime(0, t0);
    thudGain.gain.linearRampToValueAtTime(0.9, t0 + 0.008);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t0 + thudDur);
    osc.connect(thudGain);
    thudGain.connect(out);
    osc.start(t0);
    osc.stop(t0 + thudDur + 0.02);

    // Faint fabric swish: filtered noise, quieter and slightly longer than the thud.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 0.12);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800 + Math.random() * 800;
    filter.Q.value = 0.6;
    const swishGain = ctx.createGain();
    const swishDur = 0.07 + Math.random() * 0.02;
    swishGain.gain.setValueAtTime(0, t0);
    swishGain.gain.linearRampToValueAtTime(0.22, t0 + 0.01);
    swishGain.gain.exponentialRampToValueAtTime(0.001, t0 + swishDur);
    noise.connect(filter);
    filter.connect(swishGain);
    swishGain.connect(out);
    noise.start(t0);
    noise.stop(t0 + swishDur + 0.02);
  }

  // ─── Box pickup ─────────────────────────────────────────────────────────
  // Quiet slide-then-lift: a brief filtered noise slide (case sliding off
  // the shelf) followed by a soft low thump (lifted clear).
  public playBoxPickup() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.01;

    const out = ctx.createGain();
    out.gain.value = MASTER_VOLUME * 0.4;
    out.connect(this.bus(ctx));

    // Slide: noise through a filter that sweeps upward, like plastic on plastic.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 0.18);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(600, t0);
    filter.frequency.linearRampToValueAtTime(1400, t0 + 0.15);
    const slideGain = ctx.createGain();
    slideGain.gain.setValueAtTime(0, t0);
    slideGain.gain.linearRampToValueAtTime(0.5, t0 + 0.03);
    slideGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
    noise.connect(filter);
    filter.connect(slideGain);
    slideGain.connect(out);
    noise.start(t0);
    noise.stop(t0 + 0.2);

    // Lift: a soft low thump right as the slide finishes.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t0 + 0.15);
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.24);
    const liftGain = ctx.createGain();
    liftGain.gain.setValueAtTime(0, t0 + 0.15);
    liftGain.gain.linearRampToValueAtTime(0.6, t0 + 0.17);
    liftGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    osc.connect(liftGain);
    liftGain.connect(out);
    osc.start(t0 + 0.15);
    osc.stop(t0 + 0.32);
  }

  // ─── Box flip ───────────────────────────────────────────────────────────
  // Soft whoosh (the case turning through the air) plus a crisp little
  // plastic click as it settles showing the other side.
  public playBoxFlip() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.01;

    const out = ctx.createGain();
    out.gain.value = MASTER_VOLUME * 0.42;
    out.connect(this.bus(ctx));

    // Whoosh: noise through a bandpass filter sweeping down, like a quick turn.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 0.22);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(2400, t0);
    filter.frequency.exponentialRampToValueAtTime(700, t0 + 0.2);
    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0, t0);
    whooshGain.gain.linearRampToValueAtTime(0.4, t0 + 0.04);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    noise.connect(filter);
    filter.connect(whooshGain);
    whooshGain.connect(out);
    noise.start(t0);
    noise.stop(t0 + 0.24);

    // Click: a very short high click once the case lands on the new face.
    const clickNoise = ctx.createBufferSource();
    clickNoise.buffer = this.noiseBuffer(ctx, 0.02);
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 3500;
    const clickGain = ctx.createGain();
    const clickT = t0 + 0.19;
    clickGain.gain.setValueAtTime(0.5, clickT);
    clickGain.gain.exponentialRampToValueAtTime(0.001, clickT + 0.04);
    clickNoise.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(out);
    clickNoise.start(clickT);
    clickNoise.stop(clickT + 0.05);
  }

  // ─── Checkout chime ─────────────────────────────────────────────────────
  // A quick register-scanner "beep" followed by a cheerful two-note
  // confirmation tone, timed to land as the case drops into the rental bag.
  public playCheckoutChime() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.01;

    const tone = (freq: number, start: number, dur: number, peak: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t0 + start);
      g.gain.linearRampToValueAtTime(peak, t0 + start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + start + dur);
      osc.connect(g);
      g.connect(this.bus(ctx));
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.04);
    };

    // Scanner beep: a short flat square-ish blip.
    tone(2100, 0.0, 0.09, MASTER_VOLUME * 0.34, 'square');
    // Cheerful confirmation: a rising two-note major third.
    tone(880.0, 0.14, 0.22, MASTER_VOLUME * 0.46);
    tone(1108.73, 0.26, 0.32, MASTER_VOLUME * 0.43);
  }
  // ─── Deny buzz ──────────────────────────────────────────────────────────
  // A short, polite "nuh-uh" double-blip (T22): played when a take is refused
  // (carry capacity / duplicate) or checkout is attempted empty-handed.
  // Deliberately soft — a store clerk's "sorry!", not a game-show buzzer.
  public playDenyBuzz() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.01;

    const blip = (start: number, freq: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0 + start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t0 + start + 0.1);
      g.gain.setValueAtTime(0, t0 + start);
      g.gain.linearRampToValueAtTime(MASTER_VOLUME * 0.5, t0 + start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + start + 0.12);
      osc.connect(g);
      g.connect(this.bus(ctx));
      osc.start(t0 + start);
      osc.stop(t0 + start + 0.15);
    };
    blip(0.0, 320);
    blip(0.13, 262);
  }

  // ─── Tape return drop ───────────────────────────────────────────────────
  // A tape going through the RETURN TAPES HERE chute: the spring flap swings
  // (short mid noise burst), the case clatters against the chute throat (two
  // quick plastic ticks), then a muffled hollow thunk as it lands in the
  // return bin behind the counter. Fired once per case by the return ritual.
  public playTapeReturn() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.01;

    const out = ctx.createGain();
    out.gain.value = MASTER_VOLUME * 0.5;
    out.connect(this.bus(ctx));

    // Flap swing: a brief bandpass noise burst as the case pushes through.
    const flap = ctx.createBufferSource();
    flap.buffer = this.noiseBuffer(ctx, 0.09);
    const flapFilter = ctx.createBiquadFilter();
    flapFilter.type = 'bandpass';
    flapFilter.frequency.value = 900;
    flapFilter.Q.value = 0.8;
    const flapGain = ctx.createGain();
    flapGain.gain.setValueAtTime(0, t0);
    flapGain.gain.linearRampToValueAtTime(0.5, t0 + 0.012);
    flapGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    flap.connect(flapFilter);
    flapFilter.connect(flapGain);
    flapGain.connect(out);
    flap.start(t0);
    flap.stop(t0 + 0.1);

    // Plastic clatter: two quick hard ticks as the case knocks the throat.
    [0.05, 0.1].forEach((dt, i) => {
      const tick = ctx.createBufferSource();
      tick.buffer = this.noiseBuffer(ctx, 0.025);
      const tickFilter = ctx.createBiquadFilter();
      tickFilter.type = 'highpass';
      tickFilter.frequency.value = 2200 + i * 600 + Math.random() * 400;
      const tickGain = ctx.createGain();
      tickGain.gain.setValueAtTime(0.55 - i * 0.15, t0 + dt);
      tickGain.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.035);
      tick.connect(tickFilter);
      tickFilter.connect(tickGain);
      tickGain.connect(out);
      tick.start(t0 + dt);
      tick.stop(t0 + dt + 0.04);
    });

    // Bin thunk: a low, damped sine drop — the case landing on the pile
    // inside, muffled by the cabinet around it.
    const thunkT = t0 + 0.17;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, thunkT);
    osc.frequency.exponentialRampToValueAtTime(62, thunkT + 0.14);
    const thunkGain = ctx.createGain();
    thunkGain.gain.setValueAtTime(0, thunkT);
    thunkGain.gain.linearRampToValueAtTime(0.9, thunkT + 0.012);
    thunkGain.gain.exponentialRampToValueAtTime(0.001, thunkT + 0.22);
    osc.connect(thunkGain);
    thunkGain.connect(out);
    osc.start(thunkT);
    osc.stop(thunkT + 0.26);

    // A whisper of boxy resonance under the thunk (the bin's cavity).
    const body = ctx.createBufferSource();
    body.buffer = this.noiseBuffer(ctx, 0.16);
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 420;
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0, thunkT);
    bodyGain.gain.linearRampToValueAtTime(0.3, thunkT + 0.015);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, thunkT + 0.15);
    body.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(out);
    body.start(thunkT);
    body.stop(thunkT + 0.18);
  }

  // ─── Terminal keystroke ─────────────────────────────────────────────────
  // A tiny, dry click for the diegetic search terminal on the clerk's
  // monitor — a short high-passed noise tick, quiet enough to sit under
  // typing without becoming a machine gun during fast bursts.
  public playKeyClick() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.002;

    const out = ctx.createGain();
    out.gain.value = MASTER_VOLUME * 0.22;
    out.connect(this.bus(ctx));

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx, 0.03);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 4200 + Math.random() * 800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.025);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    noise.start(t0);
    noise.stop(t0 + 0.03);
  }
}

export const retailAudio = new RetailAudio();
