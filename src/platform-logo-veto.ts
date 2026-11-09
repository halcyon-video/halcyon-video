// RomM passes through IGDB's platform images, and a few are attached to the
// wrong platform upstream. A logo listed here is treated like one that failed
// to load: that run gets the lettered platform plaque. Data only — no logo is
// stored or shipped.
const MISATTRIBUTED_IGDB_LOGOS: Record<string, string> = {
  // RomM's `n64` platform reports this image, which is the iQue Player wordmark.
  pl78: 'iQue Player logo reported for Nintendo 64',
};

/** True when the URL is an IGDB platform image known to depict another platform. */
export function isMisattributedPlatformLogo(url: string | undefined): boolean {
  if (!url) return false;
  const m = /\/(pl\d+)\.[a-z0-9]+(?:[?#].*)?$/i.exec(url);
  return !!m && m[1].toLowerCase() in MISATTRIBUTED_IGDB_LOGOS;
}
