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
import { SetupScreen, setupScreenKey, setupScreenLines } from './store-setup-screens';
import {
  STREAMING_ENABLED_KEY,
  STREAMING_SERVICES_KEY,
  streamingChoiceCsv,
  streamingChoiceScreen,
} from './streaming-choice';
import { getSetting, setSetting } from './settings';
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

/** Rows that open a CRT sub-screen instead of running a power action. */
export const MEDIA_DATE_BUTTON_ID = 'btn-media-date';
/**
 * #96 — the way back into the streaming-services picker. Opening day
 * (store-setup-flow.ts) is the only other place it is offered, and a store
 * that connected its server before that shipped never had an opening day, so
 * without this row the choice was a fresh-install privilege. Deliberately its
 * own row rather than a step inside CHANGE SERVER / LOG OUT: re-authenticating
 * against a media server is a heavy, alarming thing to make someone do to tick
 * a box, and it drops the session on the way.
 */
export const STREAMING_BUTTON_ID = 'btn-streaming';

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
let mode: 'menu' | 'date' | 'streaming' = 'menu';
let menuIndex = 0;
let dateState: MediaDateScreenState | null = null;
let streamingState: SetupScreen | null = null;

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
  } else if (mode === 'streaming' && streamingState) {
    // Rendered by the setup terminal's own renderer, not a copy of it — the
    // player sees the identical checkbox list either way (#96).
    const { lines, cursorLine } = setupScreenLines(streamingState);
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

/**
 * #96 — the streaming-services checkbox list, pre-ticked from the CHOICE this
 * store is currently running. Read through getSetting, not localStorage: on
 * the hosted demo nothing is persisted and the registry default is all eight,
 * so a raw read would show a visitor an empty picker standing in front of
 * eight stocked streaming aisles.
 */
function enterStreamingScreen(): void {
  mode = 'streaming';
  streamingState = streamingChoiceScreen(getSetting<string>(STREAMING_SERVICES_KEY), 'SAVE AND RESTOCK');
  render();
}

function leaveStreamingScreen(): void {
  mode = 'menu';
  streamingState = null;
}

/** Both sub-screens dropped at once — whichever is up, the menu is the floor. */
function leaveSubScreens(): void {
  leaveDateScreen();
  leaveStreamingScreen();
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
  leaveSubScreens();
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
 * #96 — commit the streaming picks and restock. Ticking a service here has to
 * actually put aisles in the store, so the master toggle comes on with the
 * first choice: finding STREAMING-SERVICE SECTIONS switched off in a drawer
 * the player was never sent to, after they picked four apps at the counter,
 * reads as the feature being broken. Turning every box off is left alone —
 * that is someone saying "no streaming aisles", and the toggle is theirs.
 */
async function saveStreamingChoice(s: SetupScreen): Promise<void> {
  if (!deps || s.kind !== 'streaming') return;
  const csv = streamingChoiceCsv(s.rows);
  setSetting(STREAMING_SERVICES_KEY, csv);
  if (csv && !getSetting<boolean>(STREAMING_ENABLED_KEY)) setSetting(STREAMING_ENABLED_KEY, true);
  const count = csv ? csv.split(',').length : 0;
  deps.log(`[Terminal] Streaming services set to ${count ? csv : 'none'}. Restocking...`);
  counterTerminalClose();
  await deps.rebuild();
}

/**
 * One remote/keyboard press while the terminal is docked. The menu keeps its
 * original moves (Up/Down step, OK runs the row, Right/Back step out); the
 * date screen maps the full BIOS set through media-date-screen's reducer, and
 * the streaming picker through store-setup-screens' (#96).
 */
export async function counterTerminalInput(kind: MediaDateKey): Promise<void> {
  if (!deps || !deps.ui.isCounterTerminalOpen) return;

  if (mode === 'streaming' && streamingState) {
    deps.keyClick();
    // Back belongs to this file, not the reducer: on opening day the picker
    // is a step in a one-way flow with nowhere to go back TO, but here it is
    // a sub-screen and Back means "up a level" — the menu it opened from.
    if (kind === 'back') {
      leaveStreamingScreen();
      render();
      return;
    }
    const { state, action } = setupScreenKey(streamingState, kind);
    streamingState = state;
    if (action === 'open-store') return saveStreamingChoice(state);
    render();
    return;
  }

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
      if (btnId === STREAMING_BUTTON_ID) {
        deps.keyClick();
        enterStreamingScreen();
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
