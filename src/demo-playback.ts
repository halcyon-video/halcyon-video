// The demo's playback/game block, extracted from main.ts (2026-08-27, file-budget).
//
// The public demo has no media or game server, so plays and game rentals
// land on a fullscreen PLAYBACK DISABLED or GAME PLAY DISABLED card instead
// of a stream or emulator. It follows the player's lifecycle: honors
// startHidden until revealVideoPlayback() (so the walk-to-the-exit play animation
// still runs over a live scene), pauses rendering while up, and closes through
// the same Back/Power input paths and return-to-entrance tail the real player's
// onClose uses. Open/closed state rides on the host's ui.isPlaybackActive — in
// demo mode the real player never opens.
//
// Everything main.ts owns (the ui flags, the console log, the live StoreScene,
// the HUD) arrives through initDemoPlayback's deps rather than being imported,
// so this module stays free of the boot graph.
import { PROJECT_PAGE_URL } from './counter-terminal.ts';

const BB_ARCHIVO_BLACK = 'BBArchivoBlack';

/** Just the slice of StoreScene this card parks and restarts. */
interface PlaybackScene {
  pauseAmbientTvs(): void;
  pauseRendering(): void;
  resumeRendering(): void;
  resumeAmbientTvs(): void;
  returnToEntrance(): void;
}

export interface DemoPlaybackDeps {
  /** main.ts's `ui` object — the card writes isPlaybackActive on it directly. */
  ui: { isPlaybackActive: boolean };
  /** The live StoreScene, fetched per call: main.ts rebuilds it on mode swaps. */
  scene(): PlaybackScene | null | undefined;
  log(message: string, type: 'system' | 'cec' | 'video'): void;
  /** Run after the card closes — main.ts refreshes the movie HUD here. */
  onClosed(): void;
}

let deps: DemoPlaybackDeps | null = null;
let activeKind: DemoOverlayKind = 'video';

export function initDemoPlayback(d: DemoPlaybackDeps) { deps = d; }

export type DemoOverlayKind = 'video' | 'game';

export function renderDemoOverlayHtml(kind: DemoOverlayKind = 'video'): string {
  const isGame = kind === 'game';
  const heading = isGame ? 'GAME PLAY DISABLED' : 'PLAYBACK DISABLED';
  const subtitle = isGame ? 'THIS PUBLIC DEMO HAS NO GAME SERVER' : 'THIS PUBLIC DEMO HAS NO MEDIA SERVER';
  const body = isGame
    ? 'Point Halcyon at your Romm server to play your retro game collection.'
    : 'Point Halcyon at your Jellyfin or Plex server to stream your own collection.';
  const linkText = PROJECT_PAGE_URL.replace(/^https?:\/\//, '');

  return `
      <div style="max-width:720px;width:100%;box-sizing:border-box;">
        <h1 style="font-family:${BB_ARCHIVO_BLACK},sans-serif;color:#ffa903;font-size:clamp(32px,5.5vw,76px);letter-spacing:0.06em;margin:0;line-height:1.1;">${heading}</h1>
        <p style="color:#8fa3c8;font-family:'Courier New',monospace;font-size:clamp(12px,1.4vw,17px);letter-spacing:0.22em;margin:18px 0 0;">${subtitle}</p>
        <p style="color:#c5d2e8;font-family:'Courier New',monospace;font-size:clamp(13px,1.3vw,16px);letter-spacing:0.04em;line-height:1.6;margin:28px auto 0;">${body}</p>
        <a id="demo-playback-project-link" href="${PROJECT_PAGE_URL}" target="_blank" rel="noopener noreferrer" style="display:inline-block;color:#ffa903;font-family:'Courier New',monospace;font-size:clamp(13px,1.3vw,16px);font-weight:bold;letter-spacing:0.06em;margin:12px auto 0;text-decoration:underline;text-underline-offset:4px;word-break:break-all;">${linkText}</a>
        <button id="demo-playback-back" style="margin:34px auto 0;display:block;min-height:52px;padding:15px 30px;border:0;border-radius:10px;cursor:pointer;font-family:${BB_ARCHIVO_BLACK},sans-serif;font-size:17px;letter-spacing:0.06em;background:#ffa903;color:#10214a;-webkit-tap-highlight-color:transparent;">BACK TO THE STORE</button>
        <p style="color:#55607a;font-family:'Courier New',monospace;font-size:12px;letter-spacing:0.25em;margin:20px 0 0;">OR PRESS ESC</p>
      </div>`;
}

function onOverlayKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' || e.key === 'Backspace') {
    e.preventDefault();
    closeDemoPlaybackOverlay();
  }
}

function ensureOverlay(kind: DemoOverlayKind = 'video'): HTMLElement {
  let el = typeof document !== 'undefined' ? document.getElementById('demo-playback-overlay') : null;
  if (!el && typeof document !== 'undefined') {
    el = document.createElement('div');
    el.id = 'demo-playback-overlay';
    // Same layer as the real player overlay (above the exit-door whiteout).
    el.style.cssText =
      'position:fixed;inset:0;z-index:2000;background:#000;display:none;' +
      'align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box;';
    // A visible target matters most on a PHONE, where "PRESS ESC" means
    // nothing and a black screen with no button reads as a hang: a visitor
    // aiming at the control they came from lands on this card instead, it
    // dismisses, and the page behind looks unchanged — so they conclude the
    // store is broken and leave (owner report 2026-08-27). The whole card
    // still dismisses on click as it always did, for mouse-only visitors with
    // no Back/Esc habit; the button is what tells everyone else where they
    // are and how to leave. Clicking the project link opens the external repo
    // without dismissing the card underneath.
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('#demo-playback-project-link')) {
        return;
      }
      closeDemoPlaybackOverlay();
    });
    document.body.appendChild(el);
  }
  if (el && (activeKind !== kind || !el.innerHTML.trim())) {
    activeKind = kind;
    el.innerHTML = renderDemoOverlayHtml(kind);
  }
  return el!;
}

export function openDemoPlaybackOverlay(title: string, startHidden = false, kind: DemoOverlayKind = 'video') {
  activeKind = kind;
  ensureOverlay(kind);
  if (!deps) return;
  deps.ui.isPlaybackActive = true;
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onOverlayKeydown);
  }
  if (kind === 'game') {
    deps.log(`[System] Demo mode: game emulation for "${title}" is disabled (no game server).`, 'system');
  } else {
    deps.log(`[Video] Demo mode: playback of "${title}" is disabled (no media server).`, 'video');
  }
  // Hidden launches are revealed by revealVideoPlayback() when the play
  // animation finishes — exactly like the real player's startHidden open.
  if (!startHidden) revealDemoPlaybackOverlay();
}

export function revealDemoPlaybackOverlay() {
  // Same yields as the real reveal: park the renderer behind the card.
  const scene = deps?.scene();
  scene?.pauseAmbientTvs();
  scene?.pauseRendering();
  const el = ensureOverlay(activeKind);
  if (el) el.style.display = 'flex';
}

export function closeDemoPlaybackOverlay() {
  if (deps) deps.ui.isPlaybackActive = false;
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onOverlayKeydown);
  }
  const overlay = typeof document !== 'undefined' ? document.getElementById('demo-playback-overlay') : null;
  if (overlay) overlay.style.display = 'none';
  // Mirror the real player's onClose tail: resume rendering and fade back in
  // from white standing at the entrance, in library-select.
  const scene = deps?.scene();
  scene?.resumeRendering();
  scene?.resumeAmbientTvs();
  scene?.returnToEntrance();
  deps?.onClosed();
  if (activeKind === 'game') {
    deps?.log('[System] Demo game rental screen dismissed. Returned through the entrance.', 'system');
  } else {
    deps?.log('[Video] Demo playback screen dismissed. Returned through the entrance.', 'video');
  }
}
