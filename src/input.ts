// HTPC Input Management System for Project Blue Ticket
import { gamepadEverConnected } from './gamepad-tracker';
import { notifyUserActivity } from './video-case';
import { markUserActivity } from './user-activity';
import { keyboardOwnedByControl } from './text-entry-focus';

export interface InputCallbacks {
  onLeft: () => void;
  onRight: () => void;
  onUp: () => void;
  onDown: () => void;
  onEnter: () => void;
  onBack: () => void;
  onPower: () => void;
  onSearch: () => void;  // Open search overlay
  onActivity: () => void;  // Reset screensaver timer
  onIdle: () => void;      // Trigger screensaver
  onToggleWalkAround?: () => void; // Toggle first-person walk mode
  onCheckout?: () => void;     // T22: jump to the front-counter checkout point
  onReturnTape?: () => void;   // T22: put the top carried tape back on its shelf
  onNotInterested?: () => void; // "not interested" on an inspected missing-entry case
  // Hold-select-to-checkout: while this returns true (a tape is in hand and a
  // checkout is possible), pressing the select control (Enter/Space/E or
  // gamepad A) arms a hold timer instead of firing onEnter immediately —
  // a quick tap still fires onEnter on RELEASE; holding for HOLD_SELECT_MS
  // fires onHoldSelect (and swallows the release). Progress ticks 0..1 while
  // held so the UI can fill a meter; a lone 0 means the hold was cancelled.
  isHoldSelectArmed?: () => boolean;
  onHoldSelect?: () => void;
  onHoldSelectProgress?: (t: number) => void;
  // Hold-DOWN-to-dismiss: the same gesture on the down control. While this
  // returns true (an inspected case that can be crossed off), a quick tap
  // still does Down's normal job (flip the case / step an episode list) on
  // RELEASE, and holding for HOLD_DOWN_MS fires onHoldDown ("not interested").
  isHoldDownArmed?: () => boolean;
  onHoldDown?: () => void;
  onHoldDownProgress?: (t: number) => void;
}

/**
 * Press-and-hold gesture on one logical button. While `armed()` is true the
 * press is DEFERRED: releasing early fires `tap` (the button's normal job),
 * holding past `ms` fires `hold` and swallows the release. `progress` ticks
 * 0..1 while held so the UI can fill a meter; a lone 0 means cancelled.
 * An unarmed press goes straight through to `tap` with no timer at all, so
 * the gesture costs nothing on the buttons' normal path.
 */
class HoldGesture {
  private pending = false;
  private fired = false;
  private startedAt = 0;
  private ticker: number | null = null;
  private static readonly TICK_MS = 40;

  constructor(
    private readonly ms: number,
    private readonly armed: () => boolean,
    private readonly hold: () => void,
    private readonly tap: () => void,
    private readonly progress: (t: number) => void,
  ) {}

  /** Button went down. */
  press() {
    if (this.pending) return;
    if (!this.armed()) { this.tap(); return; }
    this.pending = true;
    this.fired = false;
    this.startedAt = Date.now();
    this.progress(0);
    this.ticker = window.setInterval(() => this.tick(), HoldGesture.TICK_MS);
  }

  /** Auto-repeat while held (keyboard key repeat / gamepad repeat timer). */
  repeat() {
    if (!this.pending) this.tap(); // a pending hold owns the repeats
  }

  /** Button came up: a completed hold already fired, an early release taps. */
  release() {
    if (!this.pending) return;
    this.pending = false;
    this.stop();
    if (!this.fired) {
      this.progress(0); // cancelled — clear any meter
      this.tap();
    }
    this.fired = false;
  }

  destroy() { this.stop(); }

  private tick() {
    // Something modal may have opened mid-hold — abandon the gesture
    // (swallow it entirely: firing the deferred tap into an overlay that
    // wasn't there at press time would activate a random control).
    if (!this.armed()) {
      this.fired = true; // release must not fire the tap either
      this.stop();
      this.progress(0);
      return;
    }
    const p = (Date.now() - this.startedAt) / this.ms;
    if (p >= 1) {
      this.fired = true;
      this.stop();
      this.progress(1);
      this.hold();
    } else {
      this.progress(p);
    }
  }

  private stop() {
    if (this.ticker !== null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
  }
}

export class InputManager {
  private callbacks: InputCallbacks;
  private idleTimeout: number = 300000; // 5 minutes in milliseconds (300,000 ms)
  private idleTimer: number | null = null;
  
  // Gamepad state tracking for edge detection
  private lastButtonsState: boolean[] = [];
  private lastHadActivity = false;
  private lastAxesState: number[] = [];
  private gamepadPollInterval: number | null = null;
  // Double-buffered scratch for pollGamepad — the poll runs at 60Hz whenever a
  // controller is connected, so it must not allocate arrays per tick. Current
  // and last states swap references instead of being re-created.
  private gamepadButtonsScratch: boolean[] = [];
  private gamepadAxesScratch: number[] = [0, 0];
  // Poll at full rate only while the user is awake; after the idle timeout
  // fires we downshift so a connected controller doesn't cost 60 ticks/sec for
  // days of screensaver time. A press during the slow poll still edge-detects
  // (and immediately restores the fast rate via handleActivity).
  private gamepadPollIdle = false;
  private static readonly GAMEPAD_POLL_MS = 16;
  private static readonly GAMEPAD_POLL_IDLE_MS = 150;
  // Standard-mapping buttons we track (see pollGamepad for the legend).
  // T22 appended 2 (X/Square → checkout) and 4 (LB → put a tape back).
  private static readonly GAMEPAD_BUTTONS = [0, 1, 3, 9, 12, 13, 14, 15, 5, 2, 4];

  // Gamepad auto-repeat state
  private repeatDirection: 'up' | 'down' | 'left' | 'right' | null = null;
  private repeatStartTime: number = 0;
  private repeatLastTriggerTime: number = 0;
  private readonly REPEAT_DELAY = 350;     // ms before starting repeat
  private readonly REPEAT_INTERVAL = 90;   // ms between repeats (rapid navigation)

  // Hold gestures (see InputCallbacks.isHoldSelectArmed / isHoldDownArmed).
  // One instance per logical button, shared by keyboard and gamepad — select
  // is one button whether it arrives as Enter or as pad A.
  private readonly holdSelect: HoldGesture;
  private readonly holdDown: HoldGesture;
  private static readonly HOLD_SELECT_MS = 650;
  // Longer than select's: crossing a title off is permanent, so the meter
  // wants a beat where you can still let go and change your mind.
  private static readonly HOLD_DOWN_MS = 900;

  constructor(callbacks: InputCallbacks) {
    this.callbacks = callbacks;
    this.holdSelect = new HoldGesture(
      InputManager.HOLD_SELECT_MS,
      () => !!(this.callbacks.onHoldSelect && this.callbacks.isHoldSelectArmed?.()),
      () => this.callbacks.onHoldSelect?.(),
      () => this.callbacks.onEnter(),
      (p) => this.callbacks.onHoldSelectProgress?.(p),
    );
    this.holdDown = new HoldGesture(
      InputManager.HOLD_DOWN_MS,
      () => !!(this.callbacks.onHoldDown && this.callbacks.isHoldDownArmed?.()),
      () => this.callbacks.onHoldDown?.(),
      () => this.callbacks.onDown(),
      (p) => this.callbacks.onHoldDownProgress?.(p),
    );
    this.setupKeyboardListeners();
    this.setupMouseListeners();
    this.setupGamepadListeners();
    this.resetIdleTimer();
  }

  // Keyboard navigation mappings
  private setupKeyboardListeners() {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Ignore HTPC shortcuts if user is focused on form inputs
      if (document.querySelector(".flat-detail-overlay") || document.querySelector(".flat-search-overlay")) {
        return;
      }

      // A VISIBLE field owns the keyboard; a focused field whose overlay is
      // already down is stranded and gets blurred so this very key lands in
      // the store (see text-entry-focus.ts — the login form used to leave the
      // remote dead for the whole session).
      if (keyboardOwnedByControl()) {
        return;
      }

      // Let browser chords through — the nav map below binds bare letters
      // (a/d/w/s/r/f/…), and without this guard a Ctrl+R / Cmd+R hits the 'r'
      // case, gets preventDefault()'d, and the page reload is swallowed. None
      // of the store shortcuts use a modifier, so ceding all Ctrl/Cmd combos is
      // safe and keeps reload / devtools working.
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      this.handleActivity();

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          this.callbacks.onLeft();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.callbacks.onRight();
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          this.callbacks.onUp();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          // Deferred only while the hold-to-dismiss gesture is armed; every
          // other time this is a plain immediate onDown (see HoldGesture).
          if (e.repeat) this.holdDown.repeat();
          else this.holdDown.press();
          break;
        case 'Enter':
        case ' ':
        case 'e':
        case 'E':
          e.preventDefault();
          // Key auto-repeat while a hold gesture is pending belongs to the
          // hold timer, not onEnter.
          if (e.repeat) this.holdSelect.repeat();
          else this.holdSelect.press();
          break;
        case 'Escape':
        case 'Backspace':
        case 'q':
        case 'Q':
          e.preventDefault();
          this.callbacks.onBack();
          break;
        case 'p':
        case 'P':
          this.callbacks.onPower();
          break;
        case '/':
          this.callbacks.onSearch();
          break;
        case 'f':
        case 'F':
          if (this.callbacks.onToggleWalkAround) {
            this.callbacks.onToggleWalkAround();
          }
          break;
        case 'c':
        case 'C':
          // T22: carry-mode checkout shortcut (no-op when unwired/disabled).
          if (this.callbacks.onCheckout) {
            e.preventDefault();
            this.callbacks.onCheckout();
          }
          break;
        case 'r':
        case 'R':
          // T22: put the top carried tape back.
          if (this.callbacks.onReturnTape) {
            e.preventDefault();
            this.callbacks.onReturnTape();
          }
          break;
        case 'x':
        case 'X':
          // "Not interested" on an inspected missing-entry case (no-op elsewhere).
          if (this.callbacks.onNotInterested) {
            e.preventDefault();
            this.callbacks.onNotInterested();
          }
          break;
      }
    });

    // Release side of the hold gestures: a tap (released before the hold
    // threshold) fires the normal action it deferred.
    window.addEventListener('keyup', (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
        case ' ':
        case 'e':
        case 'E':
          this.holdSelect.release();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          this.holdDown.release();
          break;
      }
    });
  }

  // A mouse-only user must be able to reset the idle timer and wake a paused
  // render loop (screensaver / occlusion recovery) — keyboard and gamepad were
  // previously the only activity sources, so mouse input could never wake the
  // store. mousemove is throttled; it fires in bursts of hundreds per second.
  private lastMouseActivity = 0;
  private setupMouseListeners() {
    window.addEventListener('pointerdown', () => this.handleActivity());
    window.addEventListener('mousemove', () => {
      const now = Date.now();
      if (now - this.lastMouseActivity < 250) return;
      this.lastMouseActivity = now;
      this.handleActivity();
    });
  }

  // Gamepad controller listener setups
  private setupGamepadListeners() {
    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      console.log(`[Input] Gamepad connected: ${e.gamepad.id}`);
      this.startGamepadPolling();
    });

    window.addEventListener('gamepaddisconnected', () => {
      console.log('[Input] Gamepad disconnected.');
      this.stopGamepadPolling();
    });

    // Check if any gamepad is already connected at start
    if (gamepadEverConnected) {
      console.log(`[Input] Active Gamepad found at startup`);
      this.startGamepadPolling();
    }
  }

  private startGamepadPolling() {
    if (this.gamepadPollInterval) return;

    // Poll gamepad inputs every 16ms (~60Hz) for responsive UI feel; the idle
    // downshift (see setGamepadPollIdle) swaps this for a slow heartbeat.
    this.gamepadPollInterval = window.setInterval(() => {
      this.pollGamepad();
    }, this.gamepadPollIdle ? InputManager.GAMEPAD_POLL_IDLE_MS : InputManager.GAMEPAD_POLL_MS);
  }

  private stopGamepadPolling() {
    if (this.gamepadPollInterval) {
      clearInterval(this.gamepadPollInterval);
      this.gamepadPollInterval = null;
    }
  }

  // Cheap no-op when the rate is already right; otherwise re-arm the interval
  // at the new cadence (only if polling is actually running).
  private setGamepadPollIdle(idle: boolean) {
    if (this.gamepadPollIdle === idle) return;
    this.gamepadPollIdle = idle;
    if (this.gamepadPollInterval) {
      this.stopGamepadPolling();
      this.startGamepadPolling();
    }
  }

  // Poll controller axis and button states
  private pollGamepad() {
    if (!gamepadEverConnected || !navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    if (!gamepads) return;
    let gp: Gamepad | null = null;
    for (let i = 0; i < gamepads.length; i++) {
      const g = gamepads[i];
      if (g !== null) {
        gp = g;
        break;
      }
    }
    if (!gp) return;

    // Handle Buttons (Standard Mapping)
    // Button 0: Face button A (Select)
    // Button 1: Face button B (Back/Cancel)
    // Button 3: Face button Y/Triangle (Search)
    // Button 9: Start (Power Menu)
    // Button 12: D-Pad Up
    // Button 13: D-Pad Down
    // Button 14: D-Pad Left
    // Button 15: D-Pad Right
    const buttonsToTrack = InputManager.GAMEPAD_BUTTONS;
    const buttonStates = this.gamepadButtonsScratch;
    buttonStates.length = buttonsToTrack.length;
    for (let i = 0; i < buttonsToTrack.length; i++) {
      buttonStates[i] = gp.buttons[buttonsToTrack[i]]?.pressed || false;
    }

    // D-pad Left stick axis tracking
    // Axis 0: horizontal (-1 left, +1 right)
    // Axis 1: vertical (-1 up, +1 down)
    const axesState = this.gamepadAxesScratch;
    axesState[0] = gp.axes[0] || 0;
    axesState[1] = gp.axes[1] || 0;

    // Initialize state arrays if empty (first tick's snapshot is discarded,
    // matching the pre-scratch behavior: next tick edge-detects against false)
    if (this.lastButtonsState.length === 0) {
      this.lastButtonsState = new Array(buttonStates.length).fill(false);
      this.lastAxesState = [0, 0];
      return;
    }

    // Edge-detect button press events (trigger on transition from false to true)
    let hasActivity = false;

    // Button 0 (A) -> Enter, with the hold-select-to-checkout gesture: while
    // armed, the press starts the shared hold timer and a quick release
    // delivers the deferred onEnter (mirrors the keyboard path exactly).
    if (buttonStates[0] && !this.lastButtonsState[0]) {
      this.holdSelect.press();
      hasActivity = true;
    }
    if (!buttonStates[0] && this.lastButtonsState[0]) {
      this.holdSelect.release();
      hasActivity = true;
    }
    // Button 1 (B) -> Back
    if (buttonStates[1] && !this.lastButtonsState[1]) {
      this.callbacks.onBack();
      hasActivity = true;
    }
    // Button 2 (Y/Triangle) -> Search
    if (buttonStates[2] && !this.lastButtonsState[2]) {
      this.callbacks.onSearch();
      hasActivity = true;
    }
    // Button 3 (Start / Menu) -> Power
    if (buttonStates[3] && !this.lastButtonsState[3]) {
      this.callbacks.onPower();
      hasActivity = true;
    }
    // Button 8 (R1) -> Toggle Walk Around
    if (buttonStates[8] && !this.lastButtonsState[8]) {
      if (this.callbacks.onToggleWalkAround) {
        this.callbacks.onToggleWalkAround();
      }
      hasActivity = true;
    }
    // Button 9 in our tracked list (pad button 2, X/Square) -> Checkout (T22)
    if (buttonStates[9] && !this.lastButtonsState[9]) {
      if (this.callbacks.onCheckout) {
        this.callbacks.onCheckout();
      }
      hasActivity = true;
    }
    // Button 10 in our tracked list (pad button 4, LB) -> Put tape back (T22)
    if (buttonStates[10] && !this.lastButtonsState[10]) {
      if (this.callbacks.onReturnTape) {
        this.callbacks.onReturnTape();
      }
      hasActivity = true;
    }
    // Left analog stick thresholds (axis values range -1 to +1)
    const stickThreshold = 0.5;

    const isUpPressed = buttonStates[4] || axesState[1] < -stickThreshold;
    const isDownPressed = buttonStates[5] || axesState[1] > stickThreshold;
    const isLeftPressed = buttonStates[6] || axesState[0] < -stickThreshold;
    const isRightPressed = buttonStates[7] || axesState[0] > stickThreshold;

    const wasUpPressed = this.lastButtonsState[4] || this.lastAxesState[1] < -stickThreshold;
    const wasDownPressed = this.lastButtonsState[5] || this.lastAxesState[1] > stickThreshold;
    const wasLeftPressed = this.lastButtonsState[6] || this.lastAxesState[0] < -stickThreshold;
    const wasRightPressed = this.lastButtonsState[7] || this.lastAxesState[0] > stickThreshold;

    // Down released — the release side of the hold-to-dismiss gesture (d-pad
    // down / stick down is the same logical button the keyboard's ▼ is).
    if (!isDownPressed && wasDownPressed) {
      this.holdDown.release();
      hasActivity = true;
    }

    // Detect new presses / holds without building per-tick arrays (60Hz path).
    // Priority order (up, down, left, right) matches the old array-based code.
    const newDir: 'up' | 'down' | 'left' | 'right' | null =
      (isUpPressed && !wasUpPressed) ? 'up'
      : (isDownPressed && !wasDownPressed) ? 'down'
      : (isLeftPressed && !wasLeftPressed) ? 'left'
      : (isRightPressed && !wasRightPressed) ? 'right'
      : null;
    const anyHeld = isUpPressed || isDownPressed || isLeftPressed || isRightPressed;

    const now = Date.now();

    if (newDir) {
      // Prioritize the newest press
      this.repeatDirection = newDir;
      this.repeatStartTime = now;
      this.repeatLastTriggerTime = now;

      // Trigger callback (down goes through its hold gesture, which passes
      // straight to onDown unless a dismiss hold is armed)
      if (newDir === 'up') this.callbacks.onUp();
      else if (newDir === 'down') this.holdDown.press();
      else if (newDir === 'left') this.callbacks.onLeft();
      else if (newDir === 'right') this.callbacks.onRight();
      hasActivity = true;
    } else if (anyHeld) {
      // No new presses, check if our current repeat direction is still held
      const repeatStillHeld =
        (this.repeatDirection === 'up' && isUpPressed) ||
        (this.repeatDirection === 'down' && isDownPressed) ||
        (this.repeatDirection === 'left' && isLeftPressed) ||
        (this.repeatDirection === 'right' && isRightPressed);
      if (repeatStillHeld) {
        // Check repeat timers
        const elapsed = now - this.repeatStartTime;
        if (elapsed >= this.REPEAT_DELAY) {
          const sinceLastTrigger = now - this.repeatLastTriggerTime;
          if (sinceLastTrigger >= this.REPEAT_INTERVAL) {
            if (this.repeatDirection === 'up') this.callbacks.onUp();
            else if (this.repeatDirection === 'down') this.holdDown.repeat();
            else if (this.repeatDirection === 'left') this.callbacks.onLeft();
            else if (this.repeatDirection === 'right') this.callbacks.onRight();
            hasActivity = true;
            this.repeatLastTriggerTime = now;
          }
        }
      } else {
        // Our repeat direction is no longer held, but other directions are. Pick one.
        this.repeatDirection = isUpPressed ? 'up' : isDownPressed ? 'down' : isLeftPressed ? 'left' : 'right';
        this.repeatStartTime = now;
        this.repeatLastTriggerTime = now;
      }
    } else {
      // Nothing is held
      this.repeatDirection = null;
    }

    if (hasActivity) {
      this.handleActivity();
      // Gamepad input never dispatches DOM pointerdown/keydown events, so
      // anything armed on those (e.g. VideoPlayer's audio-restore-on-gesture
      // workaround) is otherwise unreachable from a controller. Broadcast a
      // synthetic event those listeners can key off of alongside the real
      // ones — but only on the idle→active edge: the poll loop runs
      // continuously, and allocating an Event per tick while a stick is held
      // violates the no-per-frame-allocations rule.
      if (!this.lastHadActivity) window.dispatchEvent(new Event('gamepad-activity'));
    }
    this.lastHadActivity = hasActivity;

    // Save states for next loop iteration: swap current and last buffers so
    // neither is re-allocated (the old "last" becomes next tick's scratch).
    this.gamepadButtonsScratch = this.lastButtonsState;
    this.lastButtonsState = buttonStates;
    this.gamepadAxesScratch = this.lastAxesState;
    this.lastAxesState = axesState;
  }

  // Handle activity resets. onActivity is forwarded on EVERY activity, not
  // just the first after idle: main.ts uses it to heal a paused render loop
  // (spurious-blur occlusion recovery), which can happen without the idle
  // timer ever firing. The downstream handler is a cheap guarded no-op when
  // there is nothing to heal.
  private handleActivity() {
    // Texture uploads back off from burst to the polite per-frame budget
    // while the user is actually interacting (see processUploads in
    // video-case.ts).
    notifyUserActivity();
    // Stamp the shared input clock (src/user-activity.ts): every path into
    // here is REAL control input — keydown, pointerdown, throttled mousemove,
    // edge-detected gamepad presses / stick deflection — never bare polling.
    // StoreScene reads it to gate the IDLE render tier (30s) and the clerk's
    // go-to-sleep fade (5min).
    markUserActivity();
    this.setGamepadPollIdle(false);
    this.resetIdleTimer();
    this.callbacks.onActivity();
  }

  private resetIdleTimer() {
    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
    }
    this.idleTimer = window.setTimeout(() => {
      // Idle reached: a connected controller drops to the slow heartbeat poll
      // (still enough to catch a wake-up press) until the next activity.
      this.setGamepadPollIdle(true);
      this.callbacks.onIdle();
    }, this.idleTimeout);
  }

  // Allow dynamically changing the idle timeout (useful for debug testing)
  public setIdleTimeout(timeoutMs: number) {
    this.idleTimeout = timeoutMs;
    this.resetIdleTimer();
  }

  // Clean up listeners
  public destroy() {
    this.stopGamepadPolling();
    this.holdSelect.destroy();
    this.holdDown.destroy();
    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
    }
  }
}
