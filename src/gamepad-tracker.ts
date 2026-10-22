// Tracks whether a gamepad has ever been connected to mitigate navigator.getGamepads() allocation overhead
export let gamepadEverConnected = false;

function checkActiveGamepads(): boolean {
  if (typeof navigator !== 'undefined' && navigator.getGamepads) {
    try {
      const gps = navigator.getGamepads();
      if (gps) {
        for (let i = 0; i < gps.length; i++) {
          if (gps[i] !== null) {
            return true;
          }
        }
      }
    } catch (e) {
      // Ignore errors if navigator.getGamepads fails in restricted environments
    }
  }
  return false;
}

// Initial check at script load time
if (checkActiveGamepads()) {
  gamepadEverConnected = true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('gamepadconnected', (e: Event) => {
    console.log('[GamepadTracker] Gamepad connected:', (e as GamepadEvent).gamepad?.id);
    gamepadEverConnected = true;
  });

  window.addEventListener('gamepaddisconnected', (e: Event) => {
    console.log('[GamepadTracker] Gamepad disconnected:', (e as GamepadEvent).gamepad?.id);
    if (!checkActiveGamepads()) {
      gamepadEverConnected = false;
      console.log('[GamepadTracker] No remaining active gamepads. Setting gamepadEverConnected to false.');
    }
  });
}

/**
 * False while the page is hidden: local pad input must be ignored then. Focus is deliberately
 * not consulted: kiosk, Tauri/WebKitGTK and Steam-launched windows can report themselves
 * unfocused while they are the only thing on screen, which left the store deaf to the pad.
 * Games launched from the store are covered separately by external-game-state.
 */
export function padInputAllowed(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.hidden;
}

let activeSlot = -1;

function padHasInput(g: Gamepad): boolean {
  for (let i = 0; i < g.buttons.length; i++) if (g.buttons[i]?.pressed) return true;
  for (let i = 0; i < g.axes.length; i++) if (Math.abs(g.axes[i] ?? 0) > 0.5) return true;
  return false;
}

/**
 * The pad the player is actually holding. With two controllers paired, the first slot can be an
 * idle one; follow whichever pad last pressed a button or pushed a stick, and fall back to the
 * first connected pad until one does.
 */
export function pickActiveGamepad(gps: ArrayLike<Gamepad | null>): Gamepad | null {
  const current = activeSlot >= 0 && activeSlot < gps.length ? gps[activeSlot] : null;
  if (!current || !padHasInput(current)) {
    for (let i = 0; i < gps.length; i++) {
      const g = gps[i];
      if (g && padHasInput(g)) { activeSlot = i; break; }
    }
  }
  const chosen = activeSlot >= 0 && activeSlot < gps.length ? gps[activeSlot] : null;
  if (chosen) return chosen;
  for (let i = 0; i < gps.length; i++) if (gps[i]) return gps[i];
  return null;
}
