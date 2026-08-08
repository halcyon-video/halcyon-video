// The manager terminal's CONTROLLER — the state machine behind the clerk-desk
// CRT menu main.ts docks to on a Left press at the checkout counter.
//
// Extracted from main.ts (which sits at its enforced line budget) when the
// menu grew its first SUB-SCREEN: MEDIA RELEASE DATE (#42), the BIOS-style
// date picker that pins the catalog to a rolling point in time. Row labels
// stay in counter-terminal.ts (pure data the harness shares); the screen's
// state machine lives in media-date-screen.ts (pure, unit-tested); this file
// is only the glue — render onto the scene's CRT, route remote presses,
// persist the pin, trigger the rebuild.
//
// main.ts wires it once via initCounterTerminalFlow(deps) and forwards its
// input callbacks; nothing here touches DOM state beyond a keyboard listener
// for typed digits while the date screen is up.
import { counterTerminalLines } from './counter-terminal';
import {
  MediaDateScreenState,
  initMediaDateScreen,
  mediaDateScreenDigit,
  mediaDateScreenKey,
  mediaDateScreenLines,
  MediaDateKey,
} from './media-date-screen';
import {
  clearMediaReleasePin,
  loadMediaReleasePin,
  saveMediaReleasePin,
} from './media-release-date';

/** The one row that opens a CRT sub-screen instead of a power action. */
export const MEDIA_DATE_BUTTON_ID = 'btn-media-date';

interface TerminalScene {
  setTerminalText(lines: string[] | null, cursorLine?: number): void;
  enterSearchMode(): void;
  exitSearchMode(): void;
}

export interface CounterTerminalDeps {
  scene: () => TerminalScene | null;
  /** main.ts's ui-state object — the flow owns its isCounterTerminalOpen flag. */
  ui: { isCounterTerminalOpen: boolean; readonly isAnyOverlayOpen: boolean };
  /** Row ids in menu order (main.ts's counterTerminalButtons). */
  buttons: string[];
  /** Dispatch a menu row — main.ts's executePowerMenuAction. */
  execute: (btnId: string) => Promise<void>;
  keyClick: () => void;
  log: (msg: string) => void;
  /** Rebuild the store scene (pin changes take effect at the build funnel). */
  rebuild: () => Promise<void>;
}

let deps: CounterTerminalDeps | null = null;
let mode: 'menu' | 'date' = 'menu';
let menuIndex = 0;
let dateState: MediaDateScreenState | null = null;

export function initCounterTerminalFlow(d: CounterTerminalDeps): void {
  deps = d;
}

function render(): void {
  if (!deps) return;
  const scene = deps.scene();
  if (!scene) return;
  if (mode === 'date' && dateState) {
    const { lines, cursorLine } = mediaDateScreenLines(dateState, loadMediaReleasePin(), new Date());
    scene.setTerminalText(lines, cursorLine);
  } else {
    const { lines, cursorLine } = counterTerminalLines(deps.buttons, menuIndex);
    scene.setTerminalText(lines, cursorLine);
  }
}

// Typed digits are keyboard-only sugar for the date fields; the remote path
// is entirely arrows + OK. Capture-phase so the store's own key handling
// never sees them while the screen is up.
function onDigitKey(e: KeyboardEvent): void {
  if (mode !== 'date' || !dateState || !/^[0-9]$/.test(e.key)) return;
  dateState = mediaDateScreenDigit(dateState, e.key);
  deps?.keyClick();
  render();
  e.preventDefault();
  e.stopPropagation();
}

function enterDateScreen(): void {
  mode = 'date';
  dateState = initMediaDateScreen(loadMediaReleasePin(), new Date());
  window.addEventListener('keydown', onDigitKey, true);
  render();
}

function leaveDateScreen(): void {
  mode = 'menu';
  dateState = null;
  window.removeEventListener('keydown', onDigitKey, true);
}

export function counterTerminalOpen(): void {
  if (!deps) return;
  const scene = deps.scene();
  if (!scene || deps.ui.isAnyOverlayOpen) return;
  deps.ui.isCounterTerminalOpen = true;
  mode = 'menu';
  menuIndex = 0;
  scene.enterSearchMode(); // camera dock only — the text is ours
  render();
  deps.log('[Terminal] Manager terminal open at the counter.');
}

export function counterTerminalClose(): void {
  if (!deps || !deps.ui.isCounterTerminalOpen) return;
  leaveDateScreen();
  deps.ui.isCounterTerminalOpen = false;
  // Hands the camera back and resets the CRT to its idle rental screen.
  deps.scene()?.exitSearchMode();
  deps.log('[Terminal] Manager terminal closed.');
}

async function savePin(s: MediaDateScreenState): Promise<void> {
  if (!deps) return;
  const p = (n: number) => n.toString().padStart(2, '0');
  const date = `${s.year}-${p(s.month)}-${p(s.day)}`;
  saveMediaReleasePin({
    mediaReleaseDate: date,
    pinnedAt: new Date().toISOString(),
    ...(s.matchEra ? { matchEra: true } : {}),
  });
  deps.log(`[Terminal] Media Release Date pinned to ${date}${s.matchEra ? ' — store era follows the pin' : ''}. Restocking...`);
  counterTerminalClose();
  await deps.rebuild();
}

async function clearPin(): Promise<void> {
  if (!deps) return;
  if (!loadMediaReleasePin()) {
    // Nothing pinned — CLEAR is just a walk back to the menu.
    leaveDateScreen();
    render();
    return;
  }
  clearMediaReleasePin();
  deps.log('[Terminal] Media Release Date pin cleared — catalog is live. Restocking...');
  counterTerminalClose();
  await deps.rebuild();
}

/**
 * One remote/keyboard press while the terminal is docked. The menu keeps its
 * original moves (Up/Down step, OK runs the row, Right/Back step out); the
 * date screen maps the full BIOS set through media-date-screen's reducer.
 */
export async function counterTerminalInput(kind: MediaDateKey): Promise<void> {
  if (!deps || !deps.ui.isCounterTerminalOpen) return;

  if (mode === 'date' && dateState) {
    deps.keyClick();
    const { state, action } = mediaDateScreenKey(dateState, kind);
    dateState = state;
    if (action === 'save') return savePin(state);
    if (action === 'clear') return clearPin();
    if (action === 'back') {
      leaveDateScreen();
      render();
      return;
    }
    render();
    return;
  }

  switch (kind) {
    case 'up':
    case 'down': {
      const n = deps.buttons.length;
      menuIndex = (menuIndex + (kind === 'up' ? -1 : 1) + n) % n;
      deps.keyClick();
      render();
      return;
    }
    case 'ok': {
      const btnId = deps.buttons[menuIndex];
      if (btnId === MEDIA_DATE_BUTTON_ID) {
        deps.keyClick();
        enterDateScreen();
        return;
      }
      // Close first: several actions (settings drawer, logout) take over the
      // screen, and the docked camera must be handed back before they do.
      counterTerminalClose();
      await deps.execute(btnId);
      return;
    }
    case 'right':
    case 'back':
      // Right mirrors the Left press that reached for the terminal; Back is
      // the same step out.
      counterTerminalClose();
      return;
    case 'left':
      return; // already docked; Left is what opened it
  }
}
