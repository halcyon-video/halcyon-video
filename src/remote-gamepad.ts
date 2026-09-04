// Gamepad forwarding for the Remote Play viewer.
//
// A controller paired to the VIEWER's device never reaches the store on its own:
// the store's pad readers (InputManager and StoreScene walk-mode) poll the
// Gamepad API on the HOST machine, which has no pad plugged in. TV browsers make
// this gap sting — TV Bro hands a page the gamepad but reserves the remote's
// BACK for itself, so a paired controller is the only input on a TV that can
// carry a real back button.
//
// We poll the pad here and forward its RAW standard-mapping state (all axes +
// buttons) as {t:'pad'} frames. The host rebuilds a virtual pad from them and
// exposes it through navigator.getGamepads(), so EVERY native pad action works
// remotely — face/shoulder/start buttons, the d-pad, and both analog sticks
// (walk-mode movement and look) — with no per-button translation to maintain.

export interface GamepadForwardOpts {
  sendPad(axes: number[], buttons: boolean[], droppable: boolean): void;
  unmute(): void;
}

const AXIS_EPS = 0.02;      // ignore stick jitter below this
const NUM_BUTTONS = 17;     // standard mapping is 0..16 (incl. guide)
const NUM_AXES = 4;         // two sticks

export function installGamepadForwarding(opts: GamepadForwardOpts): void {
  let raf = 0;
  let padsSeen = 0;
  let lastAxes: number[] = [];
  let lastButtons: boolean[] = [];
  let sentNonNeutral = false;

  function poll(): void {
    raf = 0;
    let pad: Gamepad | null = null;
    for (const p of navigator.getGamepads?.() ?? []) {
      if (p && p.connected) { pad = p; break; }
    }
    if (pad) {
      const axes: number[] = [];
      for (let i = 0; i < NUM_AXES; i++) axes[i] = pad.axes[i] || 0;
      const buttons: boolean[] = [];
      for (let i = 0; i < NUM_BUTTONS; i++) buttons[i] = !!pad.buttons[i]?.pressed;

      let buttonEdge = buttons.length !== lastButtons.length;
      if (!buttonEdge) {
        for (let i = 0; i < buttons.length; i++) {
          if (buttons[i] !== lastButtons[i]) { buttonEdge = true; break; }
        }
      }
      let axisMoved = axes.length !== lastAxes.length;
      if (!axisMoved) {
        for (let i = 0; i < axes.length; i++) {
          if (Math.abs(axes[i] - (lastAxes[i] || 0)) > AXIS_EPS) { axisMoved = true; break; }
        }
      }
      const nonNeutral = buttons.some(Boolean) || axes.some((a) => Math.abs(a) > AXIS_EPS);

      // Send on any change, plus a final frame when returning to rest so the
      // host releases held buttons/sticks even if the last analog drift was shed.
      if (buttonEdge || axisMoved || (sentNonNeutral && !nonNeutral)) {
        if (buttonEdge && buttons.some(Boolean)) opts.unmute();
        // Analog-only drift is droppable under congestion; button edges and any
        // transition back to neutral must always land.
        const droppable = !buttonEdge && nonNeutral;
        opts.sendPad(axes, buttons, droppable);
        lastAxes = axes;
        lastButtons = buttons;
        sentNonNeutral = nonNeutral;
      }
    }
    if (padsSeen > 0) raf = requestAnimationFrame(poll);
  }

  window.addEventListener('gamepadconnected', () => {
    padsSeen++;
    if (!raf) raf = requestAnimationFrame(poll);
  });
  window.addEventListener('gamepaddisconnected', () => {
    padsSeen = Math.max(0, padsSeen - 1);
  });
  // A pad connected before the page loaded fires no event — probe once.
  for (const p of navigator.getGamepads?.() ?? []) {
    if (p && p.connected) {
      padsSeen++;
      if (!raf) raf = requestAnimationFrame(poll);
      break;
    }
  }
}
