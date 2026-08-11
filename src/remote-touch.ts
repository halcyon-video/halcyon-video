// Touch controls for the Remote Play viewer.
//
// The README sells Remote Play as "the store in your pocket" and tells you to
// open /remote.html on a phone or tablet — but the viewer only ever listened
// for keydown/keyup, mousemove under pointer lock, and click. On a phone that
// means: no keyboard, no pointer lock (iOS Safari has none), and a tap that
// can pick a case but cannot MOVE the browse cursor. You got a live video of a
// store you could not walk. This is the input layer that was missing.
//
// It sends the same `{t:'key'}` messages the keyboard path already sends, so
// the host needs no changes at all — the data channel, the synthetic-event
// dispatch in remote-play.ts, and the store's InputManager are all untouched.
// Key names mirror src/input.ts exactly (verified against its dispatch block):
// arrows browse, Enter selects, q backs out, f toggles walk.
//
// Two behaviours worth keeping in mind:
//   - Press-and-hold repeats with `repeat: true`, like a held key. That is
//     load-bearing on ▼, where InputManager routes repeats into the
//     hold-to-dismiss gesture ("not interested"); a naive repeat that omitted
//     the flag would fire N separate taps and flip the case N times instead.
//   - Dragging on the video sends `look` deltas, which is what makes walk mode
//     usable without pointer lock. A drag suppresses the tap-to-pick click that
//     would otherwise fire at the end of the gesture.

export interface TouchControlOpts {
  stage: HTMLElement;
  sendKey(key: string, code: string, down: boolean, repeat: boolean): void;
  sendLook(dx: number, dy: number): void;
  unmute(): void;
  /** Set true while a drag is in flight so the click handler can skip it. */
  setDragging(v: boolean): void;
}

/**
 * A finger is the only pointer here — the same test the boot-time device gate
 * uses. A touchscreen laptop keeps its keyboard, and a 10-foot TV browser is
 * large and remote-driven, so neither wants a thumb D-pad painted over the
 * stream.
 */
export function isTouchPrimary(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches
      && window.matchMedia('(hover: none)').matches
      && Math.min(window.innerWidth, window.innerHeight) < 900;
}

const CSS = `
#rt-pad, #rt-actions { position: absolute; bottom: max(18px, env(safe-area-inset-bottom));
  z-index: 40; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent; }
#rt-pad { left: max(16px, env(safe-area-inset-left)); display: grid;
  grid-template-columns: repeat(3, 58px); grid-template-rows: repeat(3, 58px); }
#rt-actions { right: max(16px, env(safe-area-inset-right)); display: flex;
  flex-direction: column; gap: 10px; align-items: flex-end; }
.rt-btn {
  display: flex; align-items: center; justify-content: center;
  background: rgba(10, 25, 68, 0.62); color: #ffd23f;
  border: 1px solid rgba(120, 150, 230, 0.45); border-radius: 12px;
  font: 700 17px/1 system-ui, sans-serif; letter-spacing: 0.04em;
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
  transition: background 90ms, transform 90ms;
}
.rt-btn.rt-held { background: rgba(255, 210, 63, 0.85); color: #0a1944; transform: scale(0.94); }
#rt-pad .rt-btn { font-size: 21px; margin: 3px; }
#rt-actions .rt-btn { min-width: 76px; height: 50px; padding: 0 16px; }
#rt-actions .rt-ok { background: rgba(255, 210, 63, 0.9); color: #0a1944; border-color: #ffd23f; }
/* Landscape phones are short: shrink so the pad never eats the picture. */
@media (max-height: 460px) {
  #rt-pad { grid-template-columns: repeat(3, 46px); grid-template-rows: repeat(3, 46px); }
  #rt-actions .rt-btn { height: 42px; min-width: 66px; }
}`;

/** Grid placement for the D-pad's cross, by [column, row]. */
const PAD: Array<{ label: string; key: string; code: string; col: number; row: number }> = [
  { label: '▲', key: 'ArrowUp',    code: 'ArrowUp',    col: 2, row: 1 },
  { label: '◀', key: 'ArrowLeft',  code: 'ArrowLeft',  col: 1, row: 2 },
  { label: '▶', key: 'ArrowRight', code: 'ArrowRight', col: 3, row: 2 },
  { label: '▼', key: 'ArrowDown',  code: 'ArrowDown',  col: 2, row: 3 },
];

const ACTIONS: Array<{ label: string; key: string; code: string; cls?: string }> = [
  { label: 'OK',   key: 'Enter', code: 'Enter', cls: 'rt-ok' },
  { label: 'BACK', key: 'q',     code: 'KeyQ' },
  { label: 'WALK', key: 'f',     code: 'KeyF' },
];

const REPEAT_DELAY_MS = 380;   // matches a typical keyboard's first repeat
const REPEAT_EVERY_MS = 120;

export function installTouchControls(opts: TouchControlOpts): void {
  const { stage, sendKey, sendLook, unmute, setDragging } = opts;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /** Wire one button: down on press, `repeat: true` ticks while held, up on release. */
  const bind = (el: HTMLElement, key: string, code: string) => {
    let timer = 0;
    let interval = 0;
    let held = false;

    const press = (e: Event) => {
      e.preventDefault();      // no scroll, no double-tap zoom, no synthetic click
      e.stopPropagation();     // never reaches the stage's tap-to-pick handler
      if (held) return;
      held = true;
      el.classList.add('rt-held');
      unmute();
      sendKey(key, code, true, false);
      timer = window.setTimeout(() => {
        interval = window.setInterval(() => sendKey(key, code, true, true), REPEAT_EVERY_MS);
      }, REPEAT_DELAY_MS);
    };
    const release = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (!held) return;
      held = false;
      el.classList.remove('rt-held');
      clearTimeout(timer); clearInterval(interval);
      timer = 0; interval = 0;
      sendKey(key, code, false, false);
    };

    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    // A finger sliding off the button, or the OS stealing the gesture, must
    // still release the key — otherwise the host is left with it stuck down.
    el.addEventListener('touchcancel', release, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  const pad = document.createElement('div');
  pad.id = 'rt-pad';
  for (const b of PAD) {
    const el = document.createElement('div');
    el.className = 'rt-btn';
    el.textContent = b.label;
    el.style.gridColumn = String(b.col);
    el.style.gridRow = String(b.row);
    el.setAttribute('aria-label', b.key);
    bind(el, b.key, b.code);
    pad.appendChild(el);
  }

  const actions = document.createElement('div');
  actions.id = 'rt-actions';
  for (const b of ACTIONS) {
    const el = document.createElement('div');
    el.className = `rt-btn ${b.cls ?? ''}`.trim();
    el.textContent = b.label;
    el.setAttribute('aria-label', b.label);
    bind(el, b.key, b.code);
    actions.appendChild(el);
  }

  document.body.appendChild(pad);
  document.body.appendChild(actions);

  // ── Drag to look ──────────────────────────────────────────────────────────
  // Walk mode is driven by mouse-look, which needs pointer lock — unavailable
  // on iOS Safari and meaningless without a mouse. A one-finger drag on the
  // picture sends the same `look` deltas instead. Below the slop threshold the
  // gesture stays a tap, so tap-to-pick still works.
  const SLOP_PX = 8;
  let lastX = 0, lastY = 0, dragging = false, moved = 0;

  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
    moved = 0;
    dragging = false;
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - lastX;
    const dy = t.clientY - lastY;
    lastX = t.clientX;
    lastY = t.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved < SLOP_PX) return;
    if (!dragging) { dragging = true; setDragging(true); unmute(); }
    e.preventDefault();               // stop the page rubber-banding under the drag
    sendLook(dx, dy);
  }, { passive: false });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    // Cleared a frame later: the synthesized click lands after touchend, and
    // this flag is what tells the viewer's click handler to ignore it.
    setTimeout(() => setDragging(false), 0);
  };
  stage.addEventListener('touchend', endDrag, { passive: true });
  stage.addEventListener('touchcancel', endDrag, { passive: true });
}
