// THE CHOSEN STREAMING SERVICES (GH #86), asked in more than one place (#96).
//
// Two terminals put the same question to the player: the opening-day setup
// flow (store-setup-flow.ts), which only ever runs on a bare first-run store,
// and the manager terminal (counter-terminal-flow.ts), which is reachable from
// the counter forever after. #96 is what happens when only the first one
// exists — a store that connected its media server before the picker shipped
// never saw opening day, so its only way in was typing a comma list into the
// settings drawer, which is not a choice a normie makes with a remote in their
// hand. So the rows, the CSV they persist to, and the pre-ticking against the
// current choice live HERE rather than inside whichever screen asked first,
// and both terminals render the identical checkbox list.
//
// Pure on purpose — no DOM, no settings.ts import — so it unit-tests under
// bare `node --test` next to store-setup-screens.ts, whose screen shape it
// builds. The EFFECTIVE csv comes in as an argument because resolving it is
// the caller's business: the registry default is what makes the hosted demo
// read as all eight chosen with nothing persisted (settings.ts), and a caller
// that reached for localStorage directly would show a demo visitor an empty
// picker in front of eight stocked streaming aisles.
import { DEFAULT_STREAMING_SERVICES, resolveEnabledServices } from './streaming-catalog.ts';
import type { SetupLibraryRow, SetupScreen } from './store-setup-screens.ts';

/** The setting both terminals write. Named here so the two flows can't drift. */
export const STREAMING_SERVICES_KEY = 'bb_streaming_services';
/** The master toggle that decides whether streaming aisles build at all. */
export const STREAMING_ENABLED_KEY = 'bb_streaming_enabled';

/**
 * The eight default services as checkbox rows, ticked to match `currentCsv`.
 * A service the CSV names that isn't one of the defaults (a hand-typed custom
 * entry) is appended rather than dropped — the picker must never be a way to
 * silently lose a choice made in the settings drawer.
 */
export function streamingChoiceRows(currentCsv: string | null | undefined): SetupLibraryRow[] {
  const chosen = resolveEnabledServices(currentCsv);
  const chosenIds = new Set(chosen.map((d) => d.id));
  const rows: SetupLibraryRow[] = DEFAULT_STREAMING_SERVICES.map((d) => ({
    id: d.id,
    name: d.name,
    carried: chosenIds.has(d.id),
  }));
  const defaultIds = new Set(DEFAULT_STREAMING_SERVICES.map((d) => d.id));
  for (const d of chosen) {
    if (!defaultIds.has(d.id)) rows.push({ id: d.id, name: d.name, carried: true });
  }
  return rows;
}

/** The ticked rows back as a `bb_streaming_services` value. Empty string is a
 *  legitimate answer: none chosen, no streaming aisles (owner ruling
 *  2026-08-21). */
export function streamingChoiceCsv(rows: SetupLibraryRow[]): string {
  return rows.filter((r) => r.carried).map((r) => r.id).join(',');
}

/**
 * The whole checkbox screen, ready to render through setupScreenLines.
 * `confirm` is what the last row says — the two callers are at different
 * points in a store's life, so opening day offers OPEN THE STORE while the
 * manager terminal, standing in an already-open store, offers to restock it.
 */
export function streamingChoiceScreen(currentCsv: string | null | undefined, confirm?: string): SetupScreen {
  return { kind: 'streaming', rows: streamingChoiceRows(currentCsv), row: 0, ...(confirm ? { confirm } : {}) };
}
