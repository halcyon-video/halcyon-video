// Store configuration that follows the PERSON, not the browser (GH #123).
//
// Everything the setup terminal and the settings drawer decide — theme, store
// format, arrangement, brand pack, which libraries this store carries, which
// streaming services the player has — lived only in the localStorage of
// whichever browser happened to make the choice. Sign in from a laptop against
// the same server and you got opening day: bare shelves, setup terminal, do it
// all again. That is per-user data, and the media server is already the thing
// that knows who the user is.
//
// So: at boot the store asks the server for this user's saved configuration and
// applies it before anything reads a setting; from then on every change is
// pushed back. The backend decides whether it can hold any of this at all
// (ProviderCapabilities.userConfigStorage) — Jellyfin can, via a per-user
// per-client DisplayPreferences record; Plex has no equivalent surface a
// third-party client may write, so a Plex store stays configured per-machine.
//
// ── What travels, and what must not ──────────────────────────────────────────
//
// Inclusion is by PREFIX (`bb_*`, the app's whole settings family) minus an
// explicit skip-set, which is the same shape the remote-play seed uses. A
// prefix rule means a new setting syncs the day it is added, with no second
// registration to forget; the skip-set is where the exceptions are argued, in
// one place, in writing.
//
// Three families never travel, for three different reasons:
//
//  - DEVICE-LOCAL. Render mode, quality tier, AO, the frame-time budgets, the
//    fps cap, local-mpv playback. These describe a MACHINE, not a taste. The
//    kiosk's GPU settings arriving on a laptop is a worse store, not the same
//    one — and "2.5D" inherited by a machine that can run the 3D store is a
//    downgrade nobody asked for.
//  - SECRETS AND CONNECTION STATE. Tokens, server URLs, api keys, the
//    media_sources list. None of them carry the `bb_` prefix, so the rule
//    excludes them by construction rather than by vigilance — but it is worth
//    saying out loud that this is deliberate: credentials stay per-device, and
//    AUTHENTICATING is what setup means on a new machine. A config-sync feature
//    that also copied tokens around would be a credential-replication feature
//    wearing a settings hat.
//  - EPHEMERAL AND HOSTING STATE. What you are carrying right now, the rental
//    lockout clock, whether this box hosts Remote Play. Session facts about one
//    running store, not choices about how the store looks.
//
// ── Ordering, and why hydrate runs before the catalog fetch ──────────────────
//
// The carried-library choices ARE config, and they decide which libraries the
// catalog sync bothers to fetch. Hydrate therefore has to land before
// fetchCatalogFromAllSources or machine B pays to sync libraries machine A
// switched off, then hides them. See the call in boot-flow.ts's syncAllSources.
//
// ── Conflict handling ────────────────────────────────────────────────────────
//
// Deliberately none. The server's snapshot wins at boot, last write wins
// thereafter, and there is no merge UI — two machines editing one store's
// settings at the same second is not a real situation, and a dialog asking
// people to reconcile a theme id would be worse than either outcome.
import { primaryMediaSource, sessionForSource } from './media-sources';
import { providerForSource } from './providers/active-provider';
import { isDemoMode } from './demo-mode';
import type { UserConfigSnapshot } from './providers/media-source-provider';

// The key-space rules — what counts as store configuration, how a snapshot is
// taken, and how one is applied — live in their own import-free module so they
// can be unit-tested without a provider. Re-exported here because this is
// where callers already look.
export {
  HARNESS_PIN_KEY,
  isSyncedConfigKey,
  snapshotLocalConfig,
  applyConfigSnapshot,
} from './store-config-keys';
import { applyConfigSnapshot, snapshotLocalConfig } from './store-config-keys';

// ─── The server side ─────────────────────────────────────────────────────────

/**
 * Which server holds this store's configuration.
 *
 * The PRIMARY source, and only it. A multi-server store (GH #84) could ask
 * each of its servers, but then two answers can disagree and we are back to
 * needing the merge UI this feature deliberately doesn't have. One nominated
 * server holding the config is predictable: it is the one you connected first,
 * and the one whose libraries the store is mostly made of.
 *
 * Null whenever there is nothing to talk to — the demo, the opening-day empty
 * store, a games-only install — and every entry point below treats that as
 * "this install is configured locally", which is the pre-#123 behaviour.
 */
function configHost(): { server: string; session: ReturnType<typeof sessionForSource>; provider: ReturnType<typeof providerForSource> } | null {
  if (isDemoMode) return null;
  const source = primaryMediaSource();
  if (!source || !source.url || !source.token) return null;
  const provider = providerForSource(source);
  if (!provider.capabilities.userConfigStorage) return null;
  return { server: source.url, session: sessionForSource(source), provider };
}

/** A hung preferences call must not hold the store shut. */
const NETWORK_TIMEOUT_MS = 8000;

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export type HydrateOutcome =
  | { status: 'applied'; written: number; removed: number; pinned: string[] }
  | { status: 'empty' }        // server reachable, nothing saved there yet
  | { status: 'unsupported' }  // no server, demo mode, or a backend without it
  | { status: 'skipped' }      // already hydrated this session
  | { status: 'failed'; error: string };

let hydrated = false;

/**
 * Whether this session has earned the right to WRITE to the server.
 *
 * False until a hydrate has actually resolved, and it stays false when one
 * fails. This is the single most important rule in the module. Without it, a
 * laptop whose config fetch times out on a flaky network boots on local
 * defaults, the person nudges one setting, and the debounced push cheerfully
 * uploads that default store OVER the configuration they spent an evening
 * building — turning a transient network blip into permanent data loss on the
 * one machine that had a good copy. Read-before-write, or don't write.
 */
let pushAllowed = false;

/**
 * Pull this user's configuration off the server and apply it, once per boot.
 *
 * The once-guard is what lets the setup terminal call this EARLY — right after
 * authentication, before it draws the carried-library checkboxes, so those
 * boxes show the choices you already made on your other machine. The later
 * call from syncAllSources then does nothing, which is the point: the choices
 * you just made on the checkbox screen are newer than the server's copy and
 * must not be overwritten by it.
 *
 * Never throws and never blocks the boot on a bad server: a store that opens
 * with local settings beats a store that doesn't open.
 */
export async function hydrateStoreConfig(): Promise<HydrateOutcome> {
  if (hydrated) return { status: 'skipped' };
  const host = configHost();
  if (!host || !host.provider.loadUserConfig) return { status: 'unsupported' };
  hydrated = true;
  try {
    const snapshot = await withTimeout(
      host.provider.loadUserConfig(host.server, host.session),
      NETWORK_TIMEOUT_MS,
      'Store config fetch'
    );
    if (!snapshot || !snapshot.values || !Object.keys(snapshot.values).length) {
      // Nothing saved there yet, and that is a normal first run: this machine
      // becomes the one that seeds the account, so writing is allowed.
      pushAllowed = true;
      return { status: 'empty' };
    }
    const applied = applyConfigSnapshot(snapshot.values);
    pushAllowed = true;
    return { status: 'applied', ...applied };
  } catch (e: any) {
    // A first run against a server that has never held a record answers 404,
    // which lands here rather than as a null. Either way the local
    // configuration stands — this machine may well be the one that saves it.
    return { status: 'failed', error: String(e?.message ?? e) };
  }
}

/** Test/teardown seam: a log-out or member switch makes the next boot a fresh
 *  one, so the next store gets ITS user's configuration rather than skipping. */
export function resetStoreConfigSync(): void {
  hydrated = false;
  // Drops write permission with it, and cancels anything pending. Between one
  // member signing out and the next signing in, the localStorage on this
  // machine still holds the OUTGOING person's store — a timer that fired in
  // that gap would save it onto whoever just picked up the remote.
  pushAllowed = false;
  if (pushTimer !== null) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

// ─── Pushing changes back ────────────────────────────────────────────────────

/**
 * Long enough that dialling a cycle setting through six values is one save
 * rather than six, short enough that the push has almost always landed before
 * anyone closes the tab — which is what keeps the page-exit flush a backstop
 * instead of the main path.
 */
const PUSH_DEBOUNCE_MS = 1500;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight: Promise<void> | null = null;
let exitHookInstalled = false;

async function pushNow(opts?: { keepalive?: boolean }): Promise<void> {
  if (!pushAllowed) return;
  const host = configHost();
  if (!host || !host.provider.saveUserConfig) return;
  const snapshot: UserConfigSnapshot = {
    values: snapshotLocalConfig(),
    savedAt: new Date().toISOString(),
  };
  // The keepalive path is the page closing; there is no one left to retry, and
  // a rejected promise there would surface as an unhandled rejection in the
  // console of a document that no longer exists.
  const work = host.provider.saveUserConfig(host.server, host.session, snapshot);
  await (opts?.keepalive ? work.catch(() => {}) : withTimeout(work, NETWORK_TIMEOUT_MS, 'Store config save'));
}

/**
 * The tab is going away: get whatever is pending onto the server.
 *
 * `pagehide` rather than `beforeunload` because it is the one that fires on
 * mobile and on a backgrounded tab the OS reclaims, and because it doesn't
 * block the unload. Installed lazily on the first scheduled push, so this
 * module wires itself up and nothing in main.ts has to know it exists.
 */
function installExitHook(): void {
  if (exitHookInstalled || typeof window === 'undefined') return;
  exitHookInstalled = true;
  window.addEventListener('pagehide', () => {
    if (pushTimer === null) return; // nothing pending — the debounce already ran
    clearTimeout(pushTimer);
    pushTimer = null;
    void pushNow({ keepalive: true }).catch(() => {});
  });
}

/**
 * Note that the store's configuration changed; save it shortly.
 *
 * Called from the write paths rather than from a storage listener because
 * localStorage's `storage` event does not fire in the document that made the
 * change — the tab doing the configuring would be the one tab that never
 * noticed. Cheap and safe to call when nothing is connected: configHost()
 * returns null and the push is a no-op.
 */
export function scheduleConfigPush(): void {
  if (typeof window === 'undefined') return;
  installExitHook();
  if (pushTimer !== null) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushInFlight = pushNow().catch((e) => {
      // Losing a save is recoverable — the next change pushes the whole
      // snapshot again, so one failed round trip costs nothing but this line.
      console.warn(`[Config] Could not save store settings to the server: ${e?.message ?? e}`);
    });
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Save now and wait for it. For the moments where the next thing that happens
 * is a scene rebuild or the store opening, and a debounce timer might not
 * survive to fire — the setup terminal finishing is the case that matters.
 */
export async function flushConfigPush(): Promise<void> {
  if (pushTimer !== null) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  try {
    await pushNow();
  } catch (e: any) {
    console.warn(`[Config] Could not save store settings to the server: ${e?.message ?? e}`);
  }
  await pushInFlight?.catch(() => {});
}
