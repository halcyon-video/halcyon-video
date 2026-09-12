import * as THREE from 'three';
import type { Movie } from './jellyfin.ts';
import type { StoreScene } from './three-scene.ts';
import { DEFAULT_STREAMING_SERVICES, buildStreamingUrl, type StreamingServiceDef } from './streaming-catalog.ts';
import { retailAudio } from './audio.ts';

export const STANDARD_INK = '#211d19';

export interface StreamingServiceChoice {
  id: string;
  name: string;
  url?: string;
}

export interface StreamingServiceChoiceState {
  movie: Movie;
  services: StreamingServiceChoice[];
  selectedIndex: number;
}

let stockResolver: (() => Movie[]) | null = null;

export function setStreamingStockResolver(resolver: () => Movie[]): void {
  stockResolver = resolver;
}

export function getLoadedStreamingMovies(): Movie[] {
  return stockResolver ? stockResolver() : [];
}

const activeChoices = new WeakMap<StoreScene, StreamingServiceChoiceState>();
const movieChoices = new Map<string, StreamingServiceChoiceState>();
const checkoutMovies = new WeakMap<StoreScene, Movie>();

/** Row layout bounds for click/tap hit testing on the back texture */
interface RowRegion {
  index: number;
  y0: number;
  y1: number;
}
const serviceRowRegions = new Map<string, RowRegion[]>();

/**
 * Discover all available streaming services for a given movie.
 * Queries primary service on the movie object and matching titles across loaded streaming stock.
 * Deduplicates services by id.
 */
export function getAvailableStreamingServices(movie: Movie, additionalStock?: Movie[]): StreamingServiceChoice[] {
  const choices: StreamingServiceChoice[] = [];
  const seen = new Set<string>();

  const addChoice = (id: string, name: string, url?: string) => {
    const normId = id.trim().toLowerCase();
    if (!normId || seen.has(normId)) return;
    seen.add(normId);
    choices.push({ id: normId, name: name.toUpperCase(), url });
  };

  // 1. Primary service or multi-service list from the movie object
  if (Array.isArray(movie.streamingServices)) {
    for (const s of movie.streamingServices) {
      if (s && s.id) addChoice(s.id, s.name, s.url);
    }
  }
  if (movie.streamingServiceId) {
    addChoice(
      movie.streamingServiceId,
      movie.streamingServiceName || movie.streamingServiceId.toUpperCase(),
      movie.streamingUrl
    );
  }

  // 2. Matching titles across loaded streaming stock
  const allStreaming = additionalStock ?? getLoadedStreamingMovies();
  for (const m of allStreaming) {
    const matches = (typeof movie.tmdbId === 'number' && m.tmdbId === movie.tmdbId)
      || (m.title.toLowerCase() === movie.title.toLowerCase() && m.year === movie.year);
    if (matches) {
      if (Array.isArray(m.streamingServices)) {
        for (const s of m.streamingServices) {
          if (s && s.id) addChoice(s.id, s.name, s.url);
        }
      }
      if (m.streamingServiceId) {
        addChoice(
          m.streamingServiceId,
          m.streamingServiceName || m.streamingServiceId.toUpperCase(),
          m.streamingUrl
        );
      }
    }
  }

  return choices;
}

export function isStreamingChoiceActive(movie: Movie | null): boolean {
  if (!movie) return false;
  return movieChoices.has(movie.id);
}

export function getStreamingChoiceState(scene: StoreScene): StreamingServiceChoiceState | null {
  return activeChoices.get(scene) ?? null;
}

export function getStreamingChoiceKey(movie: Movie | null): string {
  if (!movie) return '';
  const state = movieChoices.get(movie.id);
  if (!state) return '';
  return `streaming_choice_${state.selectedIndex}_${state.services[state.selectedIndex]?.id ?? ''}`;
}

export function startStreamingServiceChoice(scene: StoreScene, movie: Movie): boolean {
  const services = getAvailableStreamingServices(movie);
  if (services.length === 0) {
    scene.onConsoleLog('[System] No streaming services currently available for this title.', 'system');
    return false;
  }
  const state: StreamingServiceChoiceState = {
    movie,
    services,
    selectedIndex: 0,
  };
  activeChoices.set(scene, state);
  movieChoices.set(movie.id, state);

  // Turn to back of Halcyon case to reveal service list
  scene.isFlipped = true;
  scene.heroFace = 2;
  scene.heroSpine = false;
  scene.selectedBackCoverRegionIdx = -1;

  try { retailAudio.playBoxFlip(); } catch {}
  scene.onConsoleLog(`[System] Checkout: select a streaming service for "${movie.title}".`, 'system');
  scene.requestRender();
  return true;
}

export function stepStreamingServiceChoice(scene: StoreScene, dir: number): boolean {
  const state = activeChoices.get(scene);
  if (!state || state.services.length <= 1) return false;

  state.selectedIndex = (state.selectedIndex + dir + state.services.length) % state.services.length;
  try { retailAudio.playKeyClick(); } catch {}
  scene.requestRender();
  return true;
}

export function confirmStreamingServiceChoice(scene: StoreScene): boolean {
  const state = activeChoices.get(scene);
  if (!state) return false;

  const chosen = state.services[state.selectedIndex] ?? state.services[0];
  const movie = state.movie;

  // Apply chosen service properties to movie
  movie.streamingServiceId = chosen.id;
  movie.streamingServiceName = chosen.name;
  if (chosen.url) {
    movie.streamingUrl = chosen.url;
  } else {
    const def = DEFAULT_STREAMING_SERVICES.find((d: StreamingServiceDef) => d.id === chosen.id);
    if (def) movie.streamingUrl = buildStreamingUrl(def, movie.title, movie.tmdbId ?? 0);
  }

  // Clear choice state before flight to counter
  activeChoices.delete(scene);
  movieChoices.delete(movie.id);
  serviceRowRegions.delete(movie.id);

  // Take tape into carried stack and fly to front counter
  scene.setCarryMode(true);
  scene.ensureCarried().take(movie, scene.getActiveSlotKey(), null, performance.now());
  checkoutMovies.set(scene, movie);

  try { retailAudio.playBoxPickup(); } catch {}
  scene.enterCheckout();
  scene.onConsoleLog(`[System] Taking "${movie.title}" to the counter for checkout on ${chosen.name}.`, 'system');
  scene.requestRender();
  return true;
}

export function cancelStreamingServiceChoice(scene: StoreScene): boolean {
  const state = activeChoices.get(scene);
  if (!state) return false;

  movieChoices.delete(state.movie.id);
  serviceRowRegions.delete(state.movie.id);
  activeChoices.delete(scene);

  scene.isFlipped = false;
  scene.heroFace = 0;
  scene.heroSpine = false;
  scene.requestRender();
  return true;
}

export function getStreamingCheckoutMovie(scene: StoreScene): Movie | null {
  return checkoutMovies.get(scene) ?? null;
}

export function clearStreamingCheckoutMovie(scene: StoreScene): void {
  const movie = checkoutMovies.get(scene);
  if (movie && scene.carried) {
    if (typeof scene.carried.drop === 'function') {
      scene.carried.drop(movie.id);
    } else {
      scene.carried.clearAll(true);
    }
  }
  checkoutMovies.delete(scene);
}

/**
 * Renders the plain black text service list in the back-panel label window of the Halcyon box.
 * No streaming logos, colored provider badges, or service-labelled aisles.
 */
export function drawStreamingChoiceOverlays(
  ctx: CanvasRenderingContext2D,
  L: { dvd2003?: boolean },
  movie: Movie,
): void {
  ctx.save();
  const state = movieChoices.get(movie.id);
  const selectedIdx = state ? state.selectedIndex : 0;
  const services = state ? state.services : getAvailableStreamingServices(movie);

  const wx = L.dvd2003 ? 60 : 115;
  const wMax = L.dvd2003 ? 290 : 280;
  let y = L.dvd2003 ? 140 : 152;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = STANDARD_INK;

  // Title at top of label window
  const titleSize = 22;
  ctx.font = `bold ${titleSize}px Arial, sans-serif`;
  ctx.fillText(movie.title.toUpperCase(), wx, y);
  y += titleSize + 6;

  // Header: CHECKOUT — SELECT SERVICE
  const headerSize = 14;
  ctx.font = `bold ${headerSize}px Arial, sans-serif`;
  ctx.fillText('CHECKOUT — SELECT SERVICE', wx, y);
  y += headerSize + 12;

  // Divider line
  ctx.strokeStyle = STANDARD_INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wx, y);
  ctx.lineTo(wx + wMax, y);
  ctx.stroke();
  y += 14;

  // Service options list (plain black text only)
  const rows: RowRegion[] = [];
  const rowH = 28;
  for (let i = 0; i < services.length; i++) {
    const isSelected = i === selectedIdx;
    const prefix = isSelected ? '▶  ' : '   ';
    const text = `${prefix}${services[i].name}`;

    ctx.font = isSelected ? `bold 16px Arial, sans-serif` : `15px Arial, sans-serif`;
    ctx.fillText(text, wx, y + 4);

    rows.push({ index: i, y0: y, y1: y + rowH });
    y += rowH;
  }
  serviceRowRegions.set(movie.id, rows);

  // Footer prompt hint
  y = Math.max(y + 16, L.dvd2003 ? 420 : 430);
  ctx.font = `bold 12px Arial, sans-serif`;
  ctx.fillText('OK TO CONFIRM  •  BACK TO CANCEL', wx, y);

  ctx.restore();
}

/**
 * Hit test a pointer click/tap on the back cover against the service rows.
 */
export function handleStreamingBackTap(scene: StoreScene, uv: THREE.Vector2): boolean {
  const state = activeChoices.get(scene);
  if (!state) return false;

  const rows = serviceRowRegions.get(state.movie.id);
  if (!rows || rows.length === 0) return false;

  // Texture V is bottom-up; canvas Y is top-down.
  const canvasH = 768;
  const canvasY = (1 - uv.y) * canvasH;

  const hitRow = rows.find((r) => canvasY >= r.y0 && canvasY <= r.y1);
  if (hitRow) {
    if (hitRow.index === state.selectedIndex) {
      confirmStreamingServiceChoice(scene);
    } else {
      state.selectedIndex = hitRow.index;
      try { retailAudio.playKeyClick(); } catch {}
      scene.requestRender();
    }
    return true;
  }
  return false;
}
