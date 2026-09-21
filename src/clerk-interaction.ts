import type { Movie } from './jellyfin';
import { recommend, isShelfRecommendation } from './clerk-recommend';
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
  /** Inspect this exact title; false means it no longer has a reachable case. */
  onShowMovie?: (movie: Movie) => boolean;
  /** Surface a chosen line (e.g. to the on-screen console log). */
  onLog?: (msg: string) => void;
  /** Optional short blip when the dialog opens/advances. */
  onBlip?: () => void;
}

const STYLE_ID = 'clerk-interaction-styles';

export class ClerkInteraction {
  private hooks: ClerkInteractionHooks;
  private prompt: HTMLButtonElement;
  private dialog: HTMLDivElement;
  private near = false;
  private open = false;
  private conversation = 0;
  private returnFocus: HTMLElement | null = null;
  private pendingOrders = new Set<string>();
  private requestedIds = new Set<string>();
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

    this.prompt = document.createElement('button');
    this.prompt.type = 'button';
    this.prompt.className = 'clerk-prompt';
    this.prompt.innerHTML = `<span class="clerk-key">E</span> Talk to the clerk`;
    this.prompt.onclick = () => { if (this.near && !this.open) this.openMenu(); };
    document.body.appendChild(this.prompt);

    this.dialog = document.createElement('div');
    this.dialog.className = 'clerk-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-label', 'Talk to the clerk');
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
    this.beginConversation();
    this.prompt.classList.remove('visible');
    this.hooks.onBlip?.();
    this.renderRecommendation();
    this.showDialog();
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
    this.beginConversation();
    this.resetRotation();
    this.prompt.classList.remove('visible');
    this.renderRecommendation();
    for (let i = 0; i < rolls; i++) this.renderRecommendation();
    this.showDialog();
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.close();
    this.prompt.remove();
    this.dialog.remove();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.open && keyboardOwnedByControl()) return;

    if (this.open) {
      // A modal owns store shortcuts as well as its own arrows. Do not let
      // movement, checkout or search handlers see a conversation keypress.
      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) return;
      e.stopImmediatePropagation();
      if (['Tab', ' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'Tab') this.moveSelection(e.shiftKey ? -1 : 1);
        else if (e.key === ' ' && !e.repeat) this.currentOptions[this.selectedIndex]?.action();
        return;
      }
      if (e.repeat && (e.key === 'Enter' || this.optionActions.has(e.key))) {
        e.preventDefault();
        return;
      }
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
    this.beginConversation();
    this.resetRotation();
    this.prompt.classList.remove('visible');
    this.hooks.onBlip?.();
    this.renderMenu();
    this.showDialog();
  }

  private beginConversation() {
    this.conversation++;
    if (!this.open) this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.open = true;
  }

  private showDialog() {
    this.dialog.classList.add('visible');
    this.currentOptions[this.selectedIndex]?.el.focus({ preventScroll: true });
  }

  private close() {
    this.conversation++;
    this.open = false;
    this.claspPool = null;
    this.claspLabel = null;
    this.claspSugs = null;
    this.resetRotation();
    this.optionActions.clear();
    this.currentOptions = [];
    this.dialog.classList.remove('visible');
    if (this.dialog.contains(document.activeElement)) this.returnFocus?.focus({ preventScroll: true });
    this.returnFocus = null;
    if (this.near) this.prompt.classList.add('visible');
  }

  private resetRotation() {
    this.shownIds.clear();
    this.recRoll = 0;
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
    this.addOption(opts, '3', 'Help me choose a genre', () => this.renderGenres());
    this.addOption(opts, '4', 'How does this work?', () => this.renderHelp());
    this.addOption(opts, 'Esc', 'Just browsing, thanks', () => this.close());
    this.finishOptions(opts);
  }

  private renderRecommendation() {
    this.hooks.onBlip?.();
    const fromClasp = this.claspPool !== null;
    // Walked up to her instead of pressing a clasp? Her answer still depends
    // on where you're standing: the aisle's own pool when you're in one, the
    // whole store only when you're nowhere in particular.
    const local = fromClasp ? null : this.hooks.getLocalContext?.() ?? null;
    const pool = (fromClasp ? this.claspPool! : local ? local.movies : this.hooks.getMovies()).filter(isShelfRecommendation);
    const label = fromClasp ? this.claspLabel : local?.label ?? null;
    const scoped = fromClasp || local !== null;
    const sugs = ((fromClasp ? this.claspSugs : local?.suggestions) ?? [])
      .filter((sug) => !this.shownIds.has(sug.movie.id));
    const fresh = pool.filter((movie) => !this.shownIds.has(movie.id));

    // Alternate her answers between the shelf and the order book: even rolls
    // pitch something she can hand you, odd rolls something Jellyseerr can
    // get for you — so "Something else?" walks through both.
    const wantSuggestion = sugs.length > 0 && (this.recRoll % 2 === 1 || fresh.length === 0);
    this.recRoll++;
    if (wantSuggestion) {
      this.shownIds.add(sugs[0].movie.id);
      this.renderSuggestion(sugs[0]);
      return;
    }

    const rec = this.pickOwned(pool);
    this.dialog.innerHTML = '';
    if (!rec) {
      this.dialog.appendChild(this.speech(
        pool.length
          ? "We've been through this selection. Want to try a different genre, or look for a title?"
          : scoped
            ? "I don't have an available pick in this section. Let's try another genre or search the store."
            : "I don't have an available pick yet. Choose your streaming apps at the counter to stock the store, or search what's here."
      ));
    } else {
      const { movie, reason } = rec;
      const yr = movie.year ? ` (${movie.year})` : '';
      const lead = label
        ? `If you're after ${label.toLowerCase()}, `
        : '';
      this.dialog.appendChild(this.speech(`${lead}I'd suggest "${movie.title}"${yr}. ${reason}`));
      this.hooks.onLog?.(`[Clerk] Recommends "${movie.title}"${yr} — ${reason}`);
    }
    const opts = this.optionList();
    let key = 1;
    if (rec && this.hooks.onShowMovie) {
      const movie = rec.movie;
      this.addOption(opts, String(key++), 'Show me that one', () => {
        if (this.hooks.onShowMovie!(movie)) this.close();
        else this.renderUnavailable();
      });
    }
    if (rec) this.addOption(opts, String(key++), 'Something else?', () => this.renderRecommendation());
    this.addOption(opts, String(key++), 'Try a different genre', () => this.renderGenres());
    this.addOption(opts, String(key++), 'Let me search', () => this.search());
    this.addOption(opts, 'Esc', 'Thanks, I will keep browsing', () => this.close());
    this.finishOptions(opts);
  }

  /**
   * Keep already shown picks out of this conversation, including at exhaustion.
   */
  private pickOwned(pool: Movie[]) {
    const fresh = pool.filter((m) => !this.shownIds.has(m.id));
    const rec = recommend(fresh);
    if (rec) this.shownIds.add(rec.movie.id);
    return rec;
  }

  /** A title the store doesn't stock, with an offer to order it. */
  private renderSuggestion(sug: ClerkSuggestion) {
    const { movie } = sug;
    const yr = movie.year ? ` (${movie.year})` : '';
    const requested = sug.requested || !!movie.discoveryRequested || this.requestedIds.has(movie.id);
    const pending = this.pendingOrders.has(movie.id);
    const tail = pending ? "I am still sending this request. You can keep browsing." : requested
      ? "The request is already in. It may still need approval or time to become available."
      : this.hooks.onRequest
        ? 'Want me to request it for you?'
        : 'Worth keeping an eye out for.';
    this.dialog.innerHTML = '';
    this.dialog.appendChild(this.speech(
      `Now, "${movie.title}"${yr} we don't have on the shelf yet — ${sug.reason} ${tail}`));
    this.hooks.onLog?.(`[Clerk] Suggests "${movie.title}"${yr} (Jellyseerr) — ${sug.reason}`);
    const opts = this.optionList();
    let key = 1;
    if (!requested && !pending && this.hooks.onRequest) {
      this.addOption(opts, String(key++), 'Request this title', () => this.requestSuggestion(sug));
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
    const id = sug.movie.id;
    if (!this.hooks.onRequest || this.pendingOrders.has(id)) return;
    if (this.requestedIds.has(id)) { this.renderSuggestion(sug); return; }
    const conversation = this.conversation;
    this.pendingOrders.add(id);
    this.hooks.onBlip?.();
    this.dialog.innerHTML = '';
    this.dialog.appendChild(this.speech('Let me send that request. You can keep browsing while I check.'));
    const pending = this.optionList(); // retire both number AND Enter actions
    this.addOption(pending, 'Esc', 'Keep browsing', () => this.close());
    this.finishOptions(pending);
    let ok = false;
    try { ok = await this.hooks.onRequest(sug.movie); } catch { /* show a retry */ }
    finally { this.pendingOrders.delete(id); }
    if (ok) {
      sug.requested = true;
      this.requestedIds.add(id);
    }
    // A completed request belongs to its original conversation, never a
    // newly opened chat. Keep its success recorded even if the user left.
    if (!this.open || conversation !== this.conversation) return;
    this.dialog.innerHTML = '';
    this.dialog.appendChild(this.speech(ok
      ? `The request for "${sug.movie.title}" is in. It may still need approval or time to become available.`
      : `I couldn't confirm the request for "${sug.movie.title}". You can try again or choose something else.`));
    const opts = this.optionList();
    let key = 1;
    if (!ok) this.addOption(opts, String(key++), 'Try the request again', () => this.requestSuggestion(sug));
    this.addOption(opts, String(key++), 'Something else?', () => this.renderRecommendation());
    this.addOption(opts, 'Esc', 'Thanks!', () => this.close());
    this.finishOptions(opts);
  }

  private search() {
    this.close();
    this.hooks.onSearch();
  }

  private renderGenres(page = 0) {
    const movies = this.hooks.getMovies().filter(isShelfRecommendation);
    const genres = [...new Set(movies.flatMap((movie) => movie.genres))].sort((a, b) => a.localeCompare(b));
    this.dialog.innerHTML = '';
    this.dialog.appendChild(this.speech(genres.length
      ? 'What are you in the mood for? These are the genres we have available.'
      : "There aren't enough titles to choose by genre yet. I can still help you search."));
    const opts = this.optionList();
    genres.slice(page * 5, page * 5 + 5).forEach((genre, i) => {
      this.addOption(opts, String(i + 1), genre, () => {
        this.claspPool = movies.filter((movie) => movie.genres.includes(genre));
        this.claspLabel = genre;
        this.claspSugs = [];
        this.resetRotation();
        this.renderRecommendation();
      });
    });
    if (genres.length > 5) this.addOption(opts, '6', 'More genres', () => this.renderGenres((page + 1) % Math.ceil(genres.length / 5)));
    this.addOption(opts, '7', 'Surprise me from the whole store', () => {
      this.claspPool = movies;
      this.claspLabel = null;
      this.claspSugs = [];
      this.resetRotation();
      this.renderRecommendation();
    });
    this.addOption(opts, '8', 'Let me search', () => this.search());
    this.addOption(opts, 'Esc', 'Keep browsing', () => this.close());
    this.finishOptions(opts);
  }

  private renderHelp() {
    this.dialog.innerHTML = '';
    this.dialog.appendChild(this.speech(
      'Open a case to read about a title. When you find something you want, choose checkout on the case. For streaming titles, you choose a service there, then head through the counter. I can help you find a title or suggest one.'));
    const opts = this.optionList();
    this.addOption(opts, '1', 'Help me find a title', () => this.search());
    this.addOption(opts, '2', 'Suggest something', () => this.renderRecommendation());
    this.addOption(opts, 'Esc', 'Got it, thanks', () => this.close());
    this.finishOptions(opts);
  }

  private renderUnavailable() {
    this.dialog.innerHTML = '';
    this.dialog.appendChild(this.speech("That case isn't available here anymore. Let's find you another."));
    const opts = this.optionList();
    this.addOption(opts, '1', 'Show me another pick', () => this.renderRecommendation());
    this.addOption(opts, '2', 'Let me search', () => this.search());
    this.addOption(opts, 'Esc', 'Keep browsing', () => this.close());
    this.finishOptions(opts);
  }

  private speech(text: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'clerk-speech';
    el.setAttribute('role', 'status');
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
    btn.type = 'button';
    const keyEl = document.createElement('span');
    keyEl.className = 'clerk-key';
    keyEl.textContent = key;
    btn.append(keyEl, label);
    btn.onclick = () => action();
    // Number-key shortcut — dispatched from the single persistent onKeyDown
    // handler (see the map lookup there) rather than a per-option window
    // listener, so nothing accumulates as the dialog re-renders.
    if (/^\d$/.test(key)) this.optionActions.set(key, action);
    const index = this.currentOptions.length;
    btn.onfocus = () => { this.selectedIndex = index; this.applySelection(); };
    this.currentOptions.push({ el: btn, action });
    list.appendChild(btn);
  }

  /** ArrowUp/Down between options — wraps in both directions. */
  private moveSelection(delta: number) {
    const n = this.currentOptions.length;
    if (n === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + n) % n;
    this.applySelection();
    this.currentOptions[this.selectedIndex]?.el.focus({ preventScroll: true });
    this.currentOptions[this.selectedIndex]?.el.scrollIntoView({ block: 'nearest' });
  }

  private applySelection() {
    this.currentOptions.forEach((opt, i) => {
      opt.el.classList.toggle('selected', i === this.selectedIndex);
      opt.el.tabIndex = i === this.selectedIndex ? 0 : -1;
    });
  }

  /** Attach the finished option list to the dialog with the default (first) option highlighted. */
  private finishOptions(list: HTMLDivElement) {
    this.selectedIndex = 0;
    this.applySelection();
    this.dialog.appendChild(list);
    this.dialog.scrollTop = 0;
    if (this.dialog.classList.contains('visible')) this.currentOptions[0]?.el.focus({ preventScroll: true });
  }

  private injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
    .clerk-prompt {
      position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%) translateY(8px);
      z-index: 60; pointer-events: none; visibility: hidden; opacity: 0; transition: opacity .18s, transform .18s;
      font-family: 'Courier New', monospace; font-size: 15px; min-height: 44px; font-weight: 700; letter-spacing: .04em;
      color: var(--bb-knockout, #eef3ff); background: rgba(10,18,40,.82);
      border: 1px solid var(--bb-secondary, #f2e8c9);
      padding: 8px 16px; border-radius: 0; text-shadow: 0 1px 2px #000;
      box-shadow: 0 4px 18px rgba(0,0,0,.5);
    }
    .clerk-prompt.visible { pointer-events: auto; visibility: visible; opacity: 1; transform: translateX(-50%) translateY(0); }
    .clerk-key {
      display: inline-block; min-width: 1.4em; text-align: center; margin-right: 8px;
      padding: 1px 6px; border-radius: 0; background: #ffd54a; color: #10203f;
      font-weight: 800; box-shadow: inset 0 -2px 0 rgba(0,0,0,.25);
    }
    .clerk-dialog {
      position: fixed; left: 50%; bottom: 72px; transform: translateX(-50%) translateY(12px) scale(.98);
      z-index: 61; box-sizing: border-box; width: min(560px, calc(100vw - 24px)); pointer-events: auto;
      max-height: calc(100dvh - 100px); overflow-y: auto; overscroll-behavior: contain;
      opacity: 0; visibility: hidden; transition: opacity .2s, transform .2s;
      font-family: 'Courier New', monospace; color: #eef3ff;
      background: linear-gradient(180deg, rgba(17,30,64,.97), rgba(9,16,38,.97));
      border: 3px double #c5d0df; border-radius: 0; padding: 18px 20px;
      box-shadow: 3px 4px 0 #080c18, inset 0 0 0 2px #202e4a;
    }
    body:has(.clerk-dialog.visible) .clasp-prompt { visibility: hidden; }
    .clerk-dialog.visible { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0) scale(1); }
    .clerk-speech { overflow-wrap: anywhere; font-size: 15px; line-height: 1.5; margin-bottom: 14px; }
    .clerk-name {
      display: block; font-size: 15px; letter-spacing: .18em; color: #ffd54a;
      margin-bottom: 4px; font-weight: 800;
    }
    .clerk-options { display: flex; flex-direction: column; gap: 6px; }
    .clerk-option {
      display: flex; align-items: center; text-align: left; width: 100%;
      font-family: inherit; font-size: 15px; min-height: 44px; color: #eef3ff; cursor: pointer;
      background: transparent; border: 1px solid transparent;
      border-radius: 0; padding: 8px 12px; transition: background .12s, border-color .12s;
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
    @media (max-width: 600px) {
      .clerk-dialog { bottom: max(12px, env(safe-area-inset-bottom)); padding: 16px; max-height: calc(100dvh - 32px); }
      .clerk-key { display: none; }
      .clerk-option { padding: 10px 12px; }
    }
    .clerk-option.selected .clerk-key {
      background: var(--crt-ink, #000a1c); color: var(--crt-gold, #ffcc00);
    }
    `;
    document.head.appendChild(style);
  }
}
