import { invoke } from '@tauri-apps/api/core';
import { filterSteamTitles, steamTitle, type SteamGame, type SteamReview } from '../steam-catalog';
import type { Title } from './media-source-provider';
import { isExternalGameActive } from '../external-game-state.ts';
const nativeSteam = (): boolean => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
export const hasSteamNative = (): boolean => typeof window !== 'undefined' && (nativeSteam() || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
async function browserInvoke<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/__halcyon/steam/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw (typeof payload.error === 'string' ? payload.error : 'Steam could not complete this request.');
  return payload as T;
}
function steamInvoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return nativeSteam() ? invoke<T>(command, args) : browserInvoke<T>(command.replace(/^steam_/, ''), args);
}
let generation = 0;
let pending: Promise<Title[]> | null = null;
let current: Title[] = [];
let loadedTier = 'all';
let status = 'Connect Steam to browse your library.';
const listeners = new Set<() => void>();
export const steamStatus = (): string => status;
export function watchSteamStatus(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(message: string) { status = message; for (const listener of listeners) listener(); }
function message(error: unknown): string { return typeof error === 'string' ? error : 'Steam could not refresh. Please try again.'; }
function changed() { window.dispatchEvent(new Event('steam-catalog-changed')); }
export async function connectSteam(): Promise<void> {
  generation++; current = []; pending = null;
  changed();
  await steamInvoke('steam_connect');
  localStorage.setItem('steam_enabled', '1');
  localStorage.setItem('steam_configured', '1');
  publish('Sign in in the Steam window, then choose Refresh library.');
}
export async function disconnectSteam(): Promise<void> {
  generation++; current = []; pending = null;
  localStorage.removeItem('steam_enabled');
  changed();
  if (nativeSteam()) await steamInvoke('steam_disconnect');
  publish('Steam disconnected. Its games have been removed.');
}
export function loadSteamGames(force = false): Promise<Title[]> {
  if (!hasSteamNative() || localStorage.getItem('steam_enabled') !== '1') return Promise.resolve([]);
  if (isExternalGameActive()) return Promise.resolve(current);
  if (pending) return pending;
  const selectedTier = localStorage.getItem('bb_steam_review_tier') || 'all';
  if (!force && current.length && selectedTier === loadedTier) return Promise.resolve(current);
  const request = ++generation;
  const tier = localStorage.getItem('bb_steam_review_tier') || 'all';
  publish('Refreshing your Steam library…');
  const work = (async () => {
    const library = await steamInvoke<{ steamId: string; games: SteamGame[] }>('steam_library');
    if (generation !== request) return [];
    const reviews: Record<string, SteamReview> = {};
    if (tier !== 'all') {
      for (let i = 0; i < library.games.length; i += 20) {
        if (generation !== request) return [];
        if (isExternalGameActive()) throw 'Review refresh paused while a Steam game runs. Refresh after returning.';
        publish(`Checking Steam ratings: ${i} of ${library.games.length} games…`);
        Object.assign(reviews, await steamInvoke<Record<string, SteamReview>>('steam_reviews', { appIds: library.games.slice(i, i + 20).map(g => g.appid) }));
      }
    }
    if (generation !== request) return [];
    loadedTier = tier;
    current = filterSteamTitles(library.games.map(g => steamTitle(g, reviews[String(g.appid)])), tier).sort((a, b) => a.title.localeCompare(b.title));
    publish(`${current.length} of ${library.games.length} Steam games match. Close settings to stock the shelves.`);
    return current;
  })().catch((error) => {
    if (generation === request) publish(message(error));
    // A failed refresh does not authorize showing an old account's library.
    if (generation === request) current = [];
    throw error;
  }).finally(() => { if (pending === work) pending = null; });
  pending = work;
  return work;
}
export async function refreshSteam(): Promise<void> {
  await loadSteamGames(true);
  changed();
}
