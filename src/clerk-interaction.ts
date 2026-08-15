import type { Movie } from './jellyfin';
import { recommend } from './clerk-recommend';
import { keyboardOwnedByControl } from './text-entry-focus';
import { brandString } from './brand-pack';

/**
 * Clerk interaction layer (T14 Phase C).
 *
 * Owns two small DOM surfaces — a proximity "Press E to talk" prompt and a
 * period-styled dialog box — plus the keyboard wiring. The 3D clerk drives it
 * with `setNear()` each frame and reads `isChatting()` to know when to face the
 * camera and play the talking pose. All scene coupling is through hooks so the
 * billboard renderer stays scene-agnostic.
 */

/**
 * A title the store DOESN'T stock but Jellyseerr could get: a collection gap
 * or a trending discovery pick, with the reason it earned (recommend-why.ts).
 * The clerk rotates these into her answers alongside the shelf stock.
 */
export interface ClerkSuggestion {
  movie: Movie;
  /** Sentence-case reason line, e.g. "You have 3 of the Alien films." */
  reason: string;
  /** Already ordered (this session or a prior one) — offer no Order option. */
  requested?: boolean;
}

export interface ClerkInteractionHooks {
  /** Only offer to talk while the player is free-roaming the floor. */
  isAvailable: () => boolean;
  /** Current library so recommendations rank real titles. */
  getMovies: () => Movie[];
  /**
   * The section the player is standing in right now, or null when they're
   * nowhere in particular (walkway, checkout). When present, the walk-up
   * "What do you recommend?" answer comes from THIS pool and names the
   * section — the same behaviour a clasp call gets, keyed off position
   * instead of a pressed plaque.
   */
  getLocalContext?: () => { movies: Movie[]; label: string | null; suggestions?: ClerkSuggestion[] } | null;
  /** Send a real Jellyseerr order for a suggested title. Resolves false on failure. */
  onRequest?: (movie: Movie) => Promise<boolean>;
  /** Open the existing diegetic search flow. */
  onSearch: () => void;
  /** Surface a chosen line (e.g. to the on-screen console log). */
  onLog?: (msg: string) => void;
  /** Optional short blip when the dialog opens/advances. */
  onBlip?: () => void;
}

const SMALL_TALK = [
  '"Please rewind" — but honestly these are all digital now.',
  'Friday nights get busy, so grab your picks early.',
  "We just restocked the new releases wall by the register.",
  "Membership's free — ask me and I'll set you up.",
  "If you liked that one, the sequel's on the back wall.",
];

const STYLE_ID = 'clerk-interaction-styles';

export class ClerkInteraction {
  private hooks: ClerkInteractionHooks;
  private prompt: HTMLDivElement;
  private dialog: HTMLDivElement;
  private near = false;
  private open = false;
  private smallTalkIdx = 0;
  // When the dialog was opened from a recommendation clasp, recommendations
  // come from that clasp's shelf rather than the whole library, and the wording
  // names the section. Cleared on close so the proximity chat is unaffected.
  private claspPool: Movie[] | null = null;
  private claspLabel: string | null = null;
  private claspSugs: ClerkSuggestion[] | null = null;
  // Rotation state for one conversation: alternate shelf picks with
  // Jellyseerr suggestions, and never repeat a shelf pick until the pool is
  // exhausted. All reset when the dialog opens or closes.
  private shownIds = new Set<string>();
  private recRoll = 0;
  private sugIdx = 0;
  // Number-key → action for the options currently on screen. Rebuilt each
  // render (optionList clears it); dispatched from onKeyDown.
  private optionActions = new Map<string, () => void>();
  // Full ordered option list for the current screen (button + its action),
  // rebuilt alongside optionActions — this is what ArrowUp/Down/Enter walk,
  // since the TV remote only has arrows/OK/Back and no number keys.
  private currentOptions: { el: HTMLButtonElement; action: () => void }[] = [];
  private selectedIndex = 0;

  constructor(hooks: ClerkInteractionHooks) {
    this.hooks = hooks;
    this.injectStyles();

    this.prompt = document.createElement('div');
    this.prompt.className = 'clerk-prompt';
    this.prompt.innerHTML = `<span class="clerk-key">E</span> Talk to the clerk`;
    document.body.appendChild(this.prompt);

    this.dialog = document.createElement('div');
    this.dialog.className = 'clerk-dialog';
    document.body.appendChild(this.dialog);

    window.addEventListener('keydown', this.onKeyDown, true);
  }

  /** Frame hook from the clerk: is the player close enough (and free-roaming)? */
  setNear(near: boolean) {
    const allowed = near && this.hooks.isAvailable();
    if (allowed === this.near) return;
    this.near = allowed;
    if (!allowed && this.open) this.close();
    this.prompt.classList.toggle('visible', this.near && !this.open);
  }

  /**
   * Open straight into a recommendation for one shelf section — what the clerk
   * says after being called over by a clasp. Bypasses the proximity gate on
   * purpose: she has walked to you, so "are you near her" is already answered.
   *
   * `label` is where the recommendation is scoped to — a section's name
   * (e.g. HORROR), or the library's name for a whole-library clasp — and
   * only affects wording.
   */
  openForClasp(movies: Movie[], label: string | null, suggestions: ClerkSuggestion[] = []) {
    this.claspPool = movies;
    this.claspLabel = label;
    this.claspSugs = suggestions;
    this.resetRotation();
    this.open = true;
    this.prompt.classList.remove('visible');
    this.hooks.onBlip?.();
    this.renderRecommendation();
    this.dialog.classList.add('visible');
  }

  /**
   * Open the full menu across the checkout counter (▲ at the register). Like
   * openForClasp this bypasses the proximity gate on purpose — that gate only
   * arms while free-roaming, and at the counter she is already parked at the
   * register facing you. Unlike a clasp there is no scoped pool: this is the
   * same walk-up menu the E key gives, so "What do you recommend?" scopes
   * itself from where you're standing.
   */
  openAtCounter() {
    if (this.open) return;
    this.claspPool = null;
    this.claspLabel = null;
    this.claspSugs = null;
    this.openMenu();
  }

  /** The clerk faces the camera + plays the talk pose while this is true. */
  isChatting(): boolean {
    return this.open;
  }

  /**
   * Test hook (`clerktalk` checkpoint): jump straight to the walk-up
   * recommendation — claspPool stays null, so this exercises the
   * getLocalContext ("where is the player standing") scoping. `rolls`
   * presses "Something else?" that many times, so odd values land on the
   * Jellyseerr-suggestion side of the rotation.
   */
  debugOpenRecommend(rolls = 0): void {
    this.open = true;
    this.resetRotation();
    this.prompt.classList.remove('visible');
    this.renderRecommendation();
    for (let i = 0; i < rolls; i++) this.renderRecommendation();
    this.dialog.classList.add('visible');
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.prompt.remove();
    this.dialog.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent) => {
    if (keyboardOwnedByControl()) return;

    if (this.open) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        this.moveSelection(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        this.moveSelection(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.currentOptions[this.selectedIndex]?.action();
        return;
      }
      const action = this.optionActions.get(e.key);
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        action();
      }
      return;
    }
    if (this.near && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      e.stopPropagation();
      this.openMenu();
    }
  };

  private openMenu() {
    this.open = true;
    this.resetRotation();
    this.prompt.classList.remove('visible');
    this.hooks.onBlip?.();
    this.renderMenu();
    this.dialog.classList.add('visible');
  }

  private close() {
    this.open = false;
    this.claspPool = null;
    this.claspLabel = null;
    this.claspSugs = null;
    this.resetRotation();
    this.optionActions.clear();
    this.dialog.classList.remove('visible');
    if (this.near) this.prompt.classList.add('visible');
  }

  private resetRotation() {
    this.shownIds.clear();
    this.recRoll = 0;
    this.sugIdx = 0;
  }

  private renderMenu() {
    this.dialog.innerHTML = '';
    this.dialog.appendChild(this.speech(
      brandString('clerk-greeting', 'Hey there! Welcome to Halcyon. What can I help you find?')));
    const opts = this.optionList();
    this.addOption(opts, '1', 'Looking for something specific', () => {
      this.close();
      this.hooks.onSearch();
    });
    this.addOption(opts, '2', 'What do you recommend?', () => this.renderRecommendation());
    this.addOption(opts, '3', 'Just browsing', () => this.renderSmallTalk());
    this.addOption(opts, 'Esc', 'Never mind', () => this.close());
    this.finishOptions(opts);
  }

  private renderRecommendation() {
    this.hooks.onBlip?.();
    const fromClasp = this.claspPool !== null;
    // Walked up to her instead of pressing a clasp? Her answer still depends
    // on where you're standing: the aisle's own pool when you're in one, the
    // whole store only when you're nowhere in particular.
    const local = fromClasp ? null : this.hooks.getLocalContext?.() ?? null;
    const pool = fromClasp ? this.claspPool! : local ? local.movies : this.hooks.getMovies();
    const label = fromClasp ? this.claspLabel : local?.label ?? null;
    const scoped = fromClasp || local !== null;
    const sugs = (fromClasp ? this.claspSugs : local?.suggestions) ?? [];

    // Alternate her answers between the shelf and the order book: even rolls
    // pitch something she can hand you, odd rolls something Jellyseerr can
    // get for you — so "Something else?" walks through both.
    const wantSuggestion = sugs.length > 0 && (this.recRoll % 2 === 1 || pool.length === 0);
    this.recRoll++;
    if (wantSuggestion) {
      this.renderSuggestion(sugs[this.sugIdx++ % sugs.length]);
      return;
    }

    const rec = this.pickOwned(pool);
    this.dialog.innerHTML = '';
    if (!rec) {
      this.dialog.appendChild(this.speech(
        scoped
          ? "This section's picked pretty clean right now — try me somewhere else."
          : "Hmm, the shelves are looking bare — check back in a bit!"
      ));
    } else {
      const { movie, reason } = rec;
      const yr = movie.year ? ` (${movie.year})` : '';
      const lead = label
        ? `If you're after ${label.toLowerCase()}, `
        : 'Oh, ';
      this.dialog.appendChild(this.speech(`${lead}you have to see "${movie.title}"${yr}. ${reason}`));
      this.hooks.onLog?.(`[Clerk] Recommends "${movie.title}"${yr} — ${reason}`);
    }
    const opts = this.optionList();
    this.addOption(opts, '1', scoped ? 'Something else?' : 'Anything else?',
      () => (scoped ? this.renderRecommendation() : this.renderMenu()));
    if (scoped) {
      this.addOption(opts, '2', 'Actually, let me search', () => {
        this.close();
        this.hooks.onSearch();
      });
    }
    this.addOption(opts, 'Esc', 'Thanks!', () => this.close());
    this.finishOptions(opts);
  }

  /**
   * "Something else?" has to actually show something else: demote what she's
   * already pitched this conversation, resetting once the pool runs dry.
   */
  private pickOwned(pool: Movie[]) {
    const fresh = pool.filter((m) => !this.shownIds.has(m.id));
    if (fresh.length === 0) this.shownIds.clear();
    const rec = recommend(fresh.length > 0 ? fresh : pool);
    if (rec) this.shownIds.add(rec.movie.id);
    return rec;
  }

  /** A title the store doesn't stock, with an offer to order it. */
  private renderSuggestion(sug: ClerkSuggestion) {
    const { movie } = sug;
    const yr = movie.year ? ` (${movie.year})` : '';
    const requested = sug.requested || !!movie.discoveryRequested;
    const tail = requested
      ? "It's already on order — keep an eye on the Coming Soon rack."
      : this.hooks.onRequest
        ? 'Want me to put in an order for it?'
        : 'Worth keeping an eye out for.';
    this.dialog.innerHTML = '';
    this.dialog.appendChild(this.speech(
      `Now, "${movie.title}"${yr} we don't have on the shelf yet — ${sug.reason} ${tail}`));
    this.hooks.onLog?.(`[Clerk] Suggests "${movie.title}"${yr} (Jellyseerr) — ${sug.reason}`);
    const opts = this.optionList();
    let key = 1;
    if (!requested && this.hooks.onRequest) {
      this.addOption(opts, String(key++), 'Order it for me', () => this.requestSuggestion(sug));
    }
    this.addOption(opts, String(key++), 'Something else?', () => this.renderRecommendation());
    this.addOption(opts, String(key++), 'Actually, let me search', () => {
      this.close();
      this.hooks.onSearch();
    });
    this.addOption(opts, 'Esc', 'Thanks!', () => this.close());
    this.finishOptions(opts);
  }

  private async requestSuggestion(sug: ClerkSuggestion) {
    this.hooks.onBlip?.();
    this.dialog.innerHTML = '';
    this.dialog.appendChild(this.speech('One sec, let me punch that in...'));
    this.optionActions.clear(); // no live options while the order is in flight
    const ok = await this.hooks.onRequest!(sug.movie).catch(() => false);
    if (!this.open) return; // player walked off while the order was in flight
    const yr = sug.movie.year ? ` (${sug.movie.year})` : '';
    this.dialog.innerHTML = '';
    if (ok) {
      sug.requested = true;
      this.dialog.appendChild(this.speech(
        `You got it — "${sug.movie.title}"${yr} is on order. It'll show up on the Coming Soon rack once it lands.`));
    } else {
      this.dialog.appendChild(this.speech(
        "Hm, the system's not taking orders right now. Come back and ask me again in a bit."));
    }
    const opts = this.optionList();
    this.addOption(opts, '1', 'Something else?', () => this.renderRecommendation());
    this.addOption(opts, 'Esc', 'Thanks!', () => this.close());
    this.finishOptions(opts);
  }

  private renderSmallTalk() {
    this.hooks.onBlip?.();
    const line = SMALL_TALK[this.smallTalkIdx % SMALL_TALK.length];
    this.smallTalkIdx++;
    this.dialog.innerHTML = '';
    this.dialog.appendChild(this.speech(line));
    const opts = this.optionList();
    this.addOption(opts, '1', 'Tell me more', () => this.renderSmallTalk());
    this.addOption(opts, '2', 'Back', () => this.renderMenu());
    this.addOption(opts, 'Esc', 'See ya', () => this.close());
    this.finishOptions(opts);
  }

  private speech(text: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'clerk-speech';
    const name = document.createElement('span');
    name.className = 'clerk-name';
    name.textContent = 'CLERK';
    // `text` may contain raw movie titles from Jellyfin — append it as a text
    // node (never innerHTML) so metadata markup can't inject script.
    el.append(name, text);
    return el;
  }

  private optionList(): HTMLDivElement {
    // A fresh render owns a fresh set of number-key shortcuts and a fresh
    // arrow-navigable option list, defaulting the selection to the first
    // option (finishOptions applies the highlight once options are added).
    this.optionActions.clear();
    this.currentOptions = [];
    this.selectedIndex = 0;
    const el = document.createElement('div');
    el.className = 'clerk-options';
    return el;
  }

  private addOption(list: HTMLElement, key: string, label: string, action: () => void) {
    const btn = document.createElement('button');
    btn.className = 'clerk-option';
    const keyEl = document.createElement('span');
    keyEl.className = 'clerk-key';
    keyEl.textContent = key;
    btn.append(keyEl, label);
    btn.onclick = () => action();
    // Number-key shortcut — dispatched from the single persistent onKeyDown
    // handler (see the map lookup there) rather than a per-option window
    // listener, so nothing accumulates as the dialog re-renders.
    if (/^\d$/.test(key)) this.optionActions.set(key, action);
    this.currentOptions.push({ el: btn, action });
    list.appendChild(btn);
  }

  /** ArrowUp/Down between options — wraps in both directions. */
  private moveSelection(delta: number) {
    const n = this.currentOptions.length;
    if (n === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + n) % n;
    this.applySelection();
  }

  private applySelection() {
    this.currentOptions.forEach((opt, i) => {
      opt.el.classList.toggle('selected', i === this.selectedIndex);
    });
  }

  /** Attach the finished option list to the dialog with the default (first) option highlighted. */
  private finishOptions(list: HTMLDivElement) {
    this.selectedIndex = 0;
    this.applySelection();
    this.dialog.appendChild(list);
  }

  private injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
    .clerk-prompt {
      position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%) translateY(8px);
      z-index: 60; pointer-events: none; opacity: 0; transition: opacity .18s, transform .18s;
      font-family: 'Courier New', monospace; font-weight: 700; letter-spacing: .04em;
      color: var(--bb-knockout, #eef3ff); background: rgba(10,18,40,.82);
      border: 1px solid var(--bb-secondary, #f2e8c9);
      padding: 8px 16px; border-radius: 6px; text-shadow: 0 1px 2px #000;
      box-shadow: 0 4px 18px rgba(0,0,0,.5);
    }
    .clerk-prompt.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
    .clerk-key {
      display: inline-block; min-width: 1.4em; text-align: center; margin-right: 8px;
      padding: 1px 6px; border-radius: 4px; background: #ffd54a; color: #10203f;
      font-weight: 800; box-shadow: inset 0 -2px 0 rgba(0,0,0,.25);
    }
    .clerk-dialog {
      position: fixed; left: 50%; bottom: 72px; transform: translateX(-50%) translateY(12px) scale(.98);
      z-index: 61; width: min(560px, 90vw); pointer-events: auto;
      opacity: 0; visibility: hidden; transition: opacity .2s, transform .2s;
      font-family: 'Courier New', monospace; color: #eef3ff;
      background: linear-gradient(180deg, rgba(17,30,64,.97), rgba(9,16,38,.97));
      border: 2px solid #1560bd; border-radius: 10px; padding: 18px 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.05);
    }
    .clerk-dialog.visible { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0) scale(1); }
    .clerk-speech { font-size: 15px; line-height: 1.5; margin-bottom: 14px; }
    .clerk-name {
      display: block; font-size: 11px; letter-spacing: .18em; color: #ffd54a;
      margin-bottom: 4px; font-weight: 800;
    }
    .clerk-options { display: flex; flex-direction: column; gap: 6px; }
    .clerk-option {
      display: flex; align-items: center; text-align: left; width: 100%;
      font-family: inherit; font-size: 14px; color: #eef3ff; cursor: pointer;
      background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.12);
      border-radius: 6px; padding: 8px 12px; transition: background .12s, border-color .12s;
    }
    .clerk-option:hover, .clerk-option:focus {
      background: rgba(21,96,189,.35); border-color: #3182d6; outline: none;
    }
    /* Keyboard/remote selection (ArrowUp/Down + Enter) — same gold-fill/
       navy-text treatment as .settings-row.selected in styles.css. */
    .clerk-option.selected {
      background: var(--crt-gold, #ffcc00); border-color: var(--crt-gold, #ffcc00);
      color: var(--crt-ink, #000a1c);
    }
    .clerk-option.selected .clerk-key {
      background: var(--crt-ink, #000a1c); color: var(--crt-gold, #ffcc00);
    }
    `;
    document.head.appendChild(style);
  }
}
