// The demo's playback block, extracted from main.ts (2026-08-27, file-budget).
//
// The public demo has no media server, so every play that isn't a rented tape
// on the couch lands on a fullscreen PLAYBACK DISABLED card instead of a
// stream (a couch tape just ejects — see launchVideoPlayback). It follows the
// real player's lifecycle: honors startHidden until revealVideoPlayback() (so
// the walk-to-the-exit play animation still runs over a live scene), pauses
// rendering while up, and closes through the same Back/Power input paths and
// return-to-entrance tail the real player's onClose uses. Open/closed state
// rides on the host's ui.isPlaybackActive — in demo mode the real player never
// opens.
//
// Everything main.ts owns (the ui flags, the console log, the live StoreScene,
// the HUD) arrives through initDemoPlayback's deps rather than being imported,
// so this module stays free of the boot graph.
import { BB_ARCHIVO_BLACK } from './bundled-fonts';

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

export function initDemoPlayback(d: DemoPlaybackDeps) { deps = d; }

function ensureOverlay(): HTMLElement {
  let el = document.getElementById('demo-playback-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demo-playback-overlay';
    // Same layer as the real player overlay (above the exit-door whiteout).
    el.style.cssText =
      'position:fixed;inset:0;z-index:2000;background:#000;display:none;' +
      'align-items:center;justify-content:center;text-align:center;';
    el.innerHTML = `
      <div>
        <h1 style="font-family:${BB_ARCHIVO_BLACK},sans-serif;color:#ffa903;font-size:clamp(36px,6vw,84px);letter-spacing:0.06em;margin:0;">PLAYBACK DISABLED</h1>
        <p style="color:#8fa3c8;font-family:'Courier New',monospace;font-size:clamp(13px,1.5vw,19px);letter-spacing:0.25em;margin:20px 0 0;">THIS PUBLIC DEMO HAS NO MEDIA SERVER</p>
        <button id="demo-playback-back" style="margin:38px auto 0;display:block;min-height:52px;padding:15px 30px;border:0;border-radius:10px;cursor:pointer;font-family:${BB_ARCHIVO_BLACK},sans-serif;font-size:17px;letter-spacing:0.06em;background:#ffa903;color:#10214a;-webkit-tap-highlight-color:transparent;">BACK TO THE STORE</button>
        <p style="color:#55607a;font-family:'Courier New',monospace;font-size:12px;letter-spacing:0.25em;margin:22px 0 0;">OR PRESS ESC</p>
      </div>`;
    // A visible target matters most on a PHONE, where "PRESS ESC" means
    // nothing and a black screen with no button reads as a hang: a visitor
    // aiming at the control they came from lands on this card instead, it
    // dismisses, and the page behind looks unchanged — so they conclude the
    // store is broken and leave (owner report 2026-08-27). The whole card
    // still dismisses on click as it always did, for mouse-only visitors with
    // no Back/Esc habit; the button is what tells everyone else where they
    // are and how to leave.
    el.addEventListener('click', () => closeDemoPlaybackOverlay());
    document.body.appendChild(el);
  }
  return el;
}

export function openDemoPlaybackOverlay(title: string, startHidden: boolean) {
  ensureOverlay();
  if (!deps) return;
  deps.ui.isPlaybackActive = true;
  deps.log(`[Video] Demo mode: playback of "${title}" is disabled (no media server).`, 'video');
  // Hidden launches are revealed by revealVideoPlayback() when the play
  // animation finishes — exactly like the real player's startHidden open.
  if (!startHidden) revealDemoPlaybackOverlay();
}

export function revealDemoPlaybackOverlay() {
  // Same yields as the real reveal: park the renderer behind the card.
  const scene = deps?.scene();
  scene?.pauseAmbientTvs();
  scene?.pauseRendering();
  ensureOverlay().style.display = 'flex';
}

export function closeDemoPlaybackOverlay() {
  if (deps) deps.ui.isPlaybackActive = false;
  ensureOverlay().style.display = 'none';
  // Mirror the real player's onClose tail: resume rendering and fade back in
  // from white standing at the entrance, in library-select.
  const scene = deps?.scene();
  scene?.resumeRendering();
  scene?.resumeAmbientTvs();
  scene?.returnToEntrance();
  deps?.onClosed();
  deps?.log('[Video] Demo playback screen dismissed. Returned through the entrance.', 'video');
}
