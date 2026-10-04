// Connection input and completed catalog work, shared by real-store boot paths.
export function shouldPauseStoreConnection(type: string, key?: string): boolean {
  return type === 'keydown' && key === 'Escape';
}
export function catalogLoadingReporter(
  update: (value: number, detail?: string) => void,
  onProgress?: (stage: string) => void,
): (stage: string) => void {
  let pages = 0;
  return stage => {
    onProgress?.(stage);
    if (stage === 'page') {
      update(20, `Receiving your library · ${++pages} pages received`);
      return;
    }
    const complete = /catalog (\d+) of (\d+)$/.exec(stage);
    if (complete) {
      const done = Number(complete[1]), total = Number(complete[2]);
      update(total > 0 ? 20 + 3 * done / total : 20, `Reading libraries · ${done} of ${total} complete`);
      return;
    }
    update(stage === 'done' ? 24 : 20, stage === 'settings'
      ? 'Restoring your store settings' : stage === 'done'
      ? 'Library received; preparing games and streaming stock' : `Reading your library · ${stage}`);
  };
}

export function requiresStoreSignIn(message: string): boolean {
  return /(?:HTTP(?: error)?|status|response)[ :]*401\b|\bunauthorized\b/i.test(message);
}
