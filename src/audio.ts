// Small procedural sound engine for the store's immersion audio pass.
//
// Original material contacts and register tones, synthesized with WebAudio (oscillators +
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
    if (this.idleSuspended) return null; // discard hidden triggers; never queue a burst for wake
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
      this.noiseBuffer(this.ctx);
    } catch { /* no audio device — ensureCtx keeps handling that case */ }
  }

  // One reusable noise bed; each contact starts at a different point so rapid
  // browsing does not allocate/fill another audio buffer on the input thread.
  private noise: AudioBuffer | null = null;
  private lastEffect = new Map<string, number>();

  private start(effect: string, spacing = 0.045): AudioContext | null {
    const ctx = this.ensureCtx();
    if (!ctx) return null;
    const last = this.lastEffect.get(effect);
    if (last !== undefined && ctx.currentTime - last < spacing) return null;
    this.lastEffect.set(effect, ctx.currentTime);
    return ctx;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.5), ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  // Noise excites the material's broad resonance; it does not slide between
  // musical notes. Every contact has a short attack/release and disconnects
  // its entire graph when finished, including on a long-running kiosk.
  private contact(ctx: AudioContext, start: number, duration: number,
    frequency: number, peak: number, q = 0.7, pan = 0) {
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0; // silent even if the source starts on a fractional sample
    const attack = Math.min(0.006, duration * 0.15);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(MASTER_VOLUME * peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.00001, start + duration - 0.003);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(filter);
    filter.connect(gain);
    const panner = pan && ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(this.bus(ctx));
    } else gain.connect(this.bus(ctx));
    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect(); panner?.disconnect();
    };
    source.start(start, Math.random() * (0.5 - duration));
    source.stop(start + duration);
  }

  // A register's piezo confirmation: fixed pitch and short, softened edges.
  // The second harmonic gives it a small speaker's edge without a full square
  // wave's harsh upper harmonics. No success melody or game-style pitch bend.
  private beep(ctx: AudioContext, start: number, duration: number, frequency: number, peak: number) {
    for (const [multiple, level] of [[1, 1], [2, 0.12]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.frequency.value = frequency * multiple;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(MASTER_VOLUME * peak * level, start + 0.004);
      gain.gain.setValueAtTime(MASTER_VOLUME * peak * level, start + duration - 0.012);
      gain.gain.linearRampToValueAtTime(0, start + duration);
      osc.connect(gain);
      gain.connect(this.bus(ctx));
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(start);
      osc.stop(start + duration);
    }
  }

  // Carpet absorbs the heel impact: a dull, unpitched contact with a faint
  // sole brush. Walking distance still supplies the cadence at the call site.
  public playFootstep() {
    const ctx = this.start('footstep', 0.16);
    if (!ctx) return;
    this.footstepToggle = 1 - this.footstepToggle;
    const pan = this.footstepToggle ? 0.1 : -0.1;
    const t = ctx.currentTime + 0.005;
    const variation = 0.9 + Math.random() * 0.2;
    this.contact(ctx, t, 0.105, 170 * variation, 0.38, 0.6, pan);
    this.contact(ctx, t + 0.014, 0.07, 1100 * variation, 0.035, 0.5, pan);
  }

  // Case edge against its shelf, then a light plastic contact in the hand.
  // The former falling sine thump implied a drum hit after every selection.
  public playBoxPickup() {
    const ctx = this.start('pickup', 0.075);
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    this.contact(ctx, t, 0.095, 1000, 0.12, 0.65);
    this.contact(ctx, t + 0.055, 0.035, 520, 0.16, 1.1);
    this.contact(ctx, t + 0.067, 0.025, 2100, 0.045, 0.8);
  }

  // A closed case turning in the fingers: sleeve rub and two small shell
  // contacts. A hand turn does not need an air whoosh or a latch snapping shut.
  public playBoxFlip() {
    const ctx = this.start('flip', 0.1);
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    this.contact(ctx, t, 0.075, 1250, 0.065, 0.6);
    this.contact(ctx, t + 0.025, 0.022, 750, 0.1, 1);
    this.contact(ctx, t + 0.105, 0.03, 1650, 0.075, 0.8);
  }

  // One short register confirmation; also used by terminal confirmations.
  public playCheckoutChime() {
    const ctx = this.start('checkout', 0.18);
    if (!ctx) return;
    this.beep(ctx, ctx.currentTime + 0.005, 0.085, 2100, 0.16);
  }

  // A terminal rejects the input with a restrained double beep of the same
  // pitch, clearly distinct from success without the old descending melody.
  public playDenyBuzz() {
    const ctx = this.start('deny', 0.3);
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    this.beep(ctx, t, 0.06, 780, 0.13);
    this.beep(ctx, t + 0.105, 0.06, 780, 0.13);
  }

  // Flap contact, case edges against the chute, then the damped landing in
  // the cabinet. Broad low noise replaces the former bass-drum pitch drop.
  public playTapeReturn() {
    const ctx = this.start('return', 0.12);
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    this.contact(ctx, t, 0.055, 1150, 0.11, 0.8);
    this.contact(ctx, t + 0.055, 0.028, 1900, 0.13, 1.2);
    this.contact(ctx, t + 0.105, 0.035, 850, 0.1, 1);
    this.contact(ctx, t + 0.2, 0.13, 220, 0.48, 0.8);
    this.contact(ctx, t + 0.208, 0.06, 650, 0.12, 1.1);
    this.contact(ctx, t + 0.29, 0.035, 1350, 0.06, 1);
  }

  // Mechanical keyboard: key bottom-out and a lighter release, with a little
  // body under the click instead of a high-frequency electrical crackle.
  public playKeyClick() {
    const ctx = this.start('key', 0.035);
    if (!ctx) return;
    const t = ctx.currentTime + 0.002;
    const variation = 0.92 + Math.random() * 0.16;
    this.contact(ctx, t, 0.024, 700 * variation, 0.105, 1.2);
    this.contact(ctx, t + 0.002, 0.014, 2400 * variation, 0.075, 0.8);
    this.contact(ctx, t + 0.033, 0.016, 1600 * variation, 0.045, 1);
  }
}

export const retailAudio = new RetailAudio();
