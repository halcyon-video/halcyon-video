// TV-remote controls for the Remote Play viewer.
//
// A television browser (Fire TV's Silk, Android TV's TV Bro, a smart TV's
// built-in) is the third kind of client after keyboards and touchscreens: it
// has a D-pad that already arrives as arrow keys, but everything else about a
// TV remote is wrong for the viewer as shipped. BACK is a browser-history key,
// so backing out of an aisle navigates the whole page away; the media keys
// (play/pause, rewind, fast-forward) reach the page as key names the store has
// never heard of; there is no H key to recall the controls legend; and on a
// 720p panel the min-dimension check in isTouchPrimary() can come out true and
// paint the phone thumb-pad over a screen ten feet away.
//
// Like remote-touch.ts, everything here becomes an ordinary `{t:'key'}`
// message — the host, the data channel, and the store's InputManager are
// untouched. Key names mirror src/input.ts: Escape backs out, Space is
// select/pause, arrows browse or seek.

export interface TvControlOpts {
  /** Forward one key press to the host (down and up are separate calls). */
  sendKey(key: string, code: string, down: boolean, repeat: boolean): void;
  /** Show/hide the controls legend (MENU on a TV remote has no other job). */
  toggleHint(): void;
}

/**
 * A ten-foot browser, detected by user agent; `?tv=1` / `?tv=0` overrides for
 * a TV the sniff misses (or a desktop pretending, as the verify rig does).
 * AFT* is the Fire TV hardware family; Google TV devices carry their model
 * name ("Google TV Streamer", "Chromecast") rather than any generic TV mark —
 * measured off a real Streamer's WebView UA on 2026-08-20; CrKey is the cast
 * receiver; the Tizen/webOS/Roku marks are other TVs whose remotes have the
 * same shape.
 */
export function isTvViewer(): boolean {
  const forced = new URLSearchParams(location.search).get('tv');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return /\bAFT[A-Za-z0-9]|Fire ?TV|Android ?TV|Google ?TV|Chromecast|CrKey|SMART-TV|SmartTV|BRAVIA|Tizen|Web[0O]S|Roku\b/i
    .test(navigator.userAgent);
}

// Remote-control keys → the store's own vocabulary. Play/pause maps to Space
// (select in the store, pause/resume in the player — one button, like the
// gamepad's A); rewind/fast-forward map to the arrows, which seek during
// playback and merely browse if pressed in the store. Names vary by platform:
// Android TV WebViews send MediaPlayPause, some TVs split MediaPlay/MediaPause,
// webOS sends GoBack (its keyCode 461 arrives under that name).
const KEY_MAP: Record<string, { key: string; code: string }> = {
  MediaPlayPause: { key: ' ', code: 'Space' },
  MediaPlay: { key: ' ', code: 'Space' },
  MediaPause: { key: ' ', code: 'Space' },
  MediaStop: { key: 'q', code: 'KeyQ' },
  MediaRewind: { key: 'ArrowLeft', code: 'ArrowLeft' },
  MediaFastForward: { key: 'ArrowRight', code: 'ArrowRight' },
  GoBack: { key: 'Escape', code: 'Escape' },
  BrowserBack: { key: 'Escape', code: 'Escape' },
  XF86Back: { key: 'Escape', code: 'Escape' },
};

// Keys that are the LEGEND's, not the host's: the remote's menu/context key.
const HINT_KEYS = new Set(['ContextMenu', 'Menu', 'Info']);

export interface TvControls {
  /**
   * Translate one keyboard event. Returns the store key to forward instead,
   * 'hint' when the key is the legend toggle (viewer-local, keydown only),
   * or null when the event is not a TV-remote special and the normal
   * keyboard path should handle it.
   */
  mapKey(e: KeyboardEvent): { key: string; code: string } | 'hint' | null;
}

export function installTvControls(opts: TvControlOpts): TvControls {
  // Swaps the legend to the TV wording (remote.html carries all three).
  document.body.classList.add('tv');

  // The BACK trap. TV browsers spend the remote's BACK key on history — one
  // press on a freshly opened page exits to the launcher. Park a sentinel
  // entry under us so BACK becomes a popstate we can turn into the store's
  // own back action, then immediately re-arm. The store never runs out of
  // Escapes; the browser never runs out of history.
  history.pushState({ bbTv: true }, '');
  window.addEventListener('popstate', () => {
    opts.sendKey('Escape', 'Escape', true, false);
    opts.sendKey('Escape', 'Escape', false, false);
    history.pushState({ bbTv: true }, '');
  });

  return {
    mapKey(e: KeyboardEvent): { key: string; code: string } | 'hint' | null {
      if (HINT_KEYS.has(e.key)) return 'hint';
      return KEY_MAP[e.key] ?? null;
    },
  };
}
