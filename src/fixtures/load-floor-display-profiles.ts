import { assetUrl, HOSTED_BUILD } from '../asset-url';
import { installFloorDisplayProfiles } from './floor-display-profile';

/** Optional local geometry contracts must settle before stock positions are built. */
export async function loadFloorDisplayProfiles(): Promise<void> {
  if (HOSTED_BUILD) return;
  try {
    const response = await fetch(assetUrl('user-assets/fixtures/floor-display-profiles.json'), { signal: AbortSignal.timeout(1500) });
    if (response.ok) installFloorDisplayProfiles(await response.json());
  } catch { /* Missing or invalid local assets leave the built-in displays intact. */ }
}
