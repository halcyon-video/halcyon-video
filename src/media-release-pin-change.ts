import { clearMediaReleasePin, saveMediaReleasePin } from './media-release-date.ts';
import type { MediaReleasePin } from './media-release-date.ts';

/** Commit the terminal's pin and refresh both persisted config and the store. */
export async function applyMediaReleasePin(
  pin: MediaReleasePin | null,
  effects: { saveConfig: () => Promise<void>; rebuild: () => Promise<void> },
): Promise<void> {
  if (pin) saveMediaReleasePin(pin);
  else clearMediaReleasePin();
  // Start restocking immediately, without waiting on the preferences server.
  // Always rebuild on clear: storage may already be empty while the scene
  // still holds a filtered view. The fetched inventory and caches stay intact.
  await Promise.all([effects.saveConfig(), effects.rebuild()]);
}
