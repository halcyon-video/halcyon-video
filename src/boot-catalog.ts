// Every catalog reads account settings (library selection, games/platform
// toggles, streaming services). Restore them before starting ANY loader, then
// retain parallel downloads so RomM does not wait for a large movie library.
export async function syncConfiguredCatalog<T>(
  restoreSettings: () => Promise<void>,
  loadLibraries: () => Promise<T>,
  loadSidecars: ReadonlyArray<() => Promise<void>>,
  libraryStall?: Promise<never>,
): Promise<T> {
  const restored = restoreSettings();
  const catalog = restored.then(loadLibraries);
  const [libraries] = await Promise.all([
    // The movie-sync watchdog covers settings + libraries. Sidecars retain
    // their own timeouts (a whole RomM library can take several minutes).
    libraryStall ? Promise.race([catalog, libraryStall]) : catalog,
    ...loadSidecars.map((load) => restored.then(load)),
  ]);
  return libraries;
}
