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
