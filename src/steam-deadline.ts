// Store boot waits for the Steam library, so a wedged Steam client or companion
// must never hold the loading meter forever: each call gives up after a bound
// and the store opens without Steam games until a refresh succeeds.
export const STEAM_CALL_TIMEOUT_MS = 30_000;
export function withSteamDeadline<T>(call: Promise<T>, ms = STEAM_CALL_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject('Steam did not answer in time. Refresh in Video Games settings to try again.'), ms); });
  return Promise.race([call, deadline]).finally(() => clearTimeout(timer));
}
