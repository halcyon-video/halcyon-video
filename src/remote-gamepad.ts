// Gamepad forwarding for the Remote Play viewer.
//
// A controller paired to the VIEWER's device never reaches the store: the
// store's own InputManager polls the Gamepad API on the HOST machine, which
// has no pad plugged in. TV browsers make this gap sting — TV Bro hands a
// page the gamepad but reserves the remote's BACK for itself, so a paired
// controller is the only input on a TV that can carry a real back button.
//
// Poll here and translate to the key vocabulary the viewer already sends —
// the host cannot tell a pad from a keyboard. The mapping mirrors the keyed
// half of src/input.ts's native pad support:
//   A          = select — Enter DOWN on press and UP on release, so the
//                host-side hold-select-to-checkout gesture works unchanged
//   B          = back (Escape, press edge)
//   D-pad or
//   left stick = arrows, with keyboard-cadence repeats (repeat: true matters:
//                InputManager routes held-▼ repeats into hold-to-dismiss)

export interface GamepadForwardOpts {
  sendKey(key: string, code: string, down: boolean, repeat: boolean): void;
  unmute(): void;
}

const REPEAT_DELAY_MS = 380; // matches remote-touch.ts / a typical keyboard
const REPEAT_EVERY_MS = 120;
const DEADZONE = 0.5;

type DirTest = (p: Gamepad) => boolean;
const DIRS: Array<[string, DirTest]> = [
  ['ArrowUp', (p) => !!p.buttons[12]?.pressed || p.axes[1] < -DEADZONE],
  ['ArrowDown', (p) => !!p.buttons[13]?.pressed || p.axes[1] > DEADZONE],
  ['ArrowLeft', (p) => !!p.buttons[14]?.pressed || p.axes[0] < -DEADZONE],
  ['ArrowRight', (p) => !!p.buttons[15]?.pressed || p.axes[0] > DEADZONE],
];

export function installGamepadForwarding(opts: GamepadForwardOpts): void {
  const dirState = new Map<string, { downAt: number; lastRepeat: number }>();
  let aDown = false;
  let bDown = false;
  let raf = 0;
  let padsSeen = 0;

  function poll(now: number): void {
    raf = 0;
    let pad: Gamepad | null = null;
    for (const p of navigator.getGamepads?.() ?? []) {
      if (p && p.connected) { pad = p; break; }
    }
    if (pad) {
      for (const [key, test] of DIRS) {
        const held = test(pad);
        const st = dirState.get(key);
        if (held && !st) {
          dirState.set(key, { downAt: now, lastRepeat: 0 });
          opts.unmute();
          opts.sendKey(key, key, true, false);
        } else if (held && st) {
          if (now - st.downAt > REPEAT_DELAY_MS && now - st.lastRepeat > REPEAT_EVERY_MS) {
            st.lastRepeat = now;
            opts.sendKey(key, key, true, true);
          }
        } else if (!held && st) {
          dirState.delete(key);
          opts.sendKey(key, key, false, false);
        }
      }
      const a = !!pad.buttons[0]?.pressed;
      if (a !== aDown) {
        aDown = a;
        opts.unmute();
        opts.sendKey('Enter', 'Enter', a, false);
      }
      const b = !!pad.buttons[1]?.pressed;
      if (b && !bDown) {
        opts.sendKey('Escape', 'Escape', true, false);
        opts.sendKey('Escape', 'Escape', false, false);
      }
      bDown = b;
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
