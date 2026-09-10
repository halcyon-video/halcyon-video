import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Movie } from '../src/jellyfin.ts';
import {
  getAvailableStreamingServices,
  isStreamingChoiceActive,
  getStreamingChoiceState,
  getStreamingChoiceKey,
  startStreamingServiceChoice,
  stepStreamingServiceChoice,
  confirmStreamingServiceChoice,
  cancelStreamingServiceChoice,
  drawStreamingChoiceOverlays,
  getStreamingCheckoutMovie,
  setStreamingStockResolver,
  handleStreamingBackTap,
} from '../src/streaming-checkout.ts';

function createMockMovie(extra: Partial<Movie> = {}): Movie {
  return {
    id: 'streaming_netflix_1001',
    title: 'Inception',
    year: 2010,
    genres: ['Action', 'Sci-Fi'],
    director: 'Christopher Nolan',
    rating: 'PG-13',
    overview: 'A thief who steals corporate secrets through dream-sharing technology.',
    localPath: '',
    streaming: true,
    streamingServiceId: 'netflix',
    streamingServiceName: 'NETFLIX',
    streamingUrl: 'https://www.netflix.com/search?q=Inception',
    ...extra,
  };
}

function createMockScene(extra: Record<string, any> = {}) {
  const carriedTapes: Movie[] = [];
  const scene: any = {
    mode: 'inspect',
    isFlipped: false,
    heroFace: 0,
    heroSpine: false,
    selectedBackCoverRegionIdx: -1,
    overviewStart: true,
    carried: {
      count: 0,
      take(movie: Movie) {
        carriedTapes.push(movie);
        this.count = carriedTapes.length;
      },
      topMovie() {
        return carriedTapes[carriedTapes.length - 1] ?? null;
      },
      clearAll() {
        carriedTapes.length = 0;
        this.count = 0;
      },
    },
    ensureCarried() {
      return this.carried;
    },
    setCarryMode: () => {},
    getActiveSlotKey: () => 'slot-1',
    enterCheckout() {
      this.mode = 'checkout';
    },
    enterOverview() {
      this.mode = 'overview';
    },
    returnToEntrance() {
      this.mode = 'overview';
    },
    requestRender: () => {},
    onConsoleLog: () => {},
    ...extra,
  };
  return scene;
}

test('getAvailableStreamingServices: resolves single service from movie', () => {
  const movie = createMockMovie({
    streamingServiceId: 'prime',
    streamingServiceName: 'AMAZON PRIME VIDEO',
    streamingUrl: 'https://www.amazon.com/gp/video',
  });
  const services = getAvailableStreamingServices(movie);
  assert.equal(services.length, 1);
  assert.equal(services[0].id, 'prime');
  assert.equal(services[0].name, 'AMAZON PRIME VIDEO');
  assert.equal(services[0].url, 'https://www.amazon.com/gp/video');
});

test('getAvailableStreamingServices: merges multiple services matching title across stock', () => {
  const stock: Movie[] = [
    createMockMovie({
      tmdbId: 1001,
      title: 'Dune',
      year: 2021,
      streamingServiceId: 'max',
      streamingServiceName: 'MAX',
      streamingUrl: 'https://play.max.com',
    }),
    createMockMovie({
      tmdbId: 1001,
      title: 'Dune',
      year: 2021,
      streamingServiceId: 'hulu',
      streamingServiceName: 'HULU',
      streamingUrl: 'https://www.hulu.com',
    }),
  ];
  setStreamingStockResolver(() => stock);
  try {
    const movie = createMockMovie({
      tmdbId: 1001,
      title: 'Dune',
      year: 2021,
      streamingServiceId: 'netflix',
      streamingServiceName: 'NETFLIX',
    });
    const services = getAvailableStreamingServices(movie);
    assert.equal(services.length, 3);
    assert.equal(services[0].id, 'netflix');
    assert.equal(services[1].id, 'max');
    assert.equal(services[2].id, 'hulu');
  } finally {
    setStreamingStockResolver(() => []);
  }
});

test('getAvailableStreamingServices: resolves services directly from movie.streamingServices array', () => {
  const movie = createMockMovie({
    streamingServices: [
      { id: 'netflix', name: 'Netflix', url: 'https://netflix.com' },
      { id: 'prime', name: 'Prime Video', url: 'https://primevideo.com' },
    ],
  });
  const services = getAvailableStreamingServices(movie);
  assert.equal(services.length, 2);
  assert.equal(services[0].id, 'netflix');
  assert.equal(services[1].id, 'prime');
});

test('getAvailableStreamingServices: falls back gracefully without crashing when unconfigured', () => {
  const movie = createMockMovie({
    streamingServiceId: undefined,
    streamingServiceName: undefined,
    streamingUrl: undefined,
  });
  const services = getAvailableStreamingServices(movie);
  assert.ok(services.length >= 1);
  assert.ok(services[0].id.length > 0);
  assert.ok(services[0].name.length > 0);
});

test('service choice lifecycle: start, step, confirm, cancel', () => {
  const scene = createMockScene();
  const movie = createMockMovie({
    streamingServiceId: 'netflix',
    streamingServiceName: 'NETFLIX',
  });

  // 1. Initial state
  assert.equal(isStreamingChoiceActive(movie), false);
  assert.equal(getStreamingChoiceKey(movie), '');

  // 2. Start service choice flips case to back
  const started = startStreamingServiceChoice(scene, movie);
  assert.equal(started, true);
  assert.equal(isStreamingChoiceActive(movie), true);
  assert.equal(scene.isFlipped, true);
  assert.equal(scene.heroFace, 2);

  const state = getStreamingChoiceState(scene);
  assert.ok(state);
  assert.equal(state.selectedIndex, 0);
  assert.ok(getStreamingChoiceKey(movie).startsWith('streaming_choice_0_'));

  // Manually append a second service to test stepping
  state.services.push({ id: 'prime', name: 'AMAZON PRIME VIDEO' });

  // 3. Step forward
  assert.equal(stepStreamingServiceChoice(scene, 1), true);
  assert.equal(state.selectedIndex, 1);
  assert.ok(getStreamingChoiceKey(movie).startsWith('streaming_choice_1_'));

  // Step with modulo wrap-around
  assert.equal(stepStreamingServiceChoice(scene, 1), true);
  assert.equal(state.selectedIndex, 0);

  // 4. Cancel service choice restores case to front
  assert.equal(cancelStreamingServiceChoice(scene), true);
  assert.equal(isStreamingChoiceActive(movie), false);
  assert.equal(scene.isFlipped, false);
  assert.equal(scene.heroFace, 0);

  // 5. Confirm service choice takes tape and flies to counter
  startStreamingServiceChoice(scene, movie);
  assert.equal(confirmStreamingServiceChoice(scene), true);
  assert.equal(isStreamingChoiceActive(movie), false);
  assert.equal(scene.mode, 'checkout');
  assert.equal(scene.carried.count, 1);
  assert.equal(getStreamingCheckoutMovie(scene)?.id, movie.id);
});

test('drawStreamingChoiceOverlays: renders plain black text service list without logos or badges', () => {
  const calls: { text: string; x: number; y: number; font?: string; fillStyle?: string }[] = [];
  const fakeCtx: any = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillText: (text: string, x: number, y: number) => {
      calls.push({ text, x, y, font: fakeCtx.font, fillStyle: fakeCtx.fillStyle });
    },
    textAlign: 'left',
    textBaseline: 'top',
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };

  const movie = createMockMovie({ title: 'The Matrix' });
  const layout: any = { dvd2003: false, standardVhs: true };

  drawStreamingChoiceOverlays(fakeCtx, layout, movie);

  // Assert title is drawn
  assert.ok(calls.some((c) => c.text === 'THE MATRIX'));
  // Assert header is drawn
  assert.ok(calls.some((c) => c.text === 'CHECKOUT — SELECT SERVICE'));
  // Assert selected row has plain text cursor
  assert.ok(calls.some((c) => c.text.startsWith('▶  ')));
  // Assert instructions are drawn
  assert.ok(calls.some((c) => c.text === 'OK TO CONFIRM  •  BACK TO CANCEL'));
  // Confirm standard print ink (black) is used
  assert.equal(fakeCtx.fillStyle, '#211d19');
});

test('handleStreamingBackTap: selects service row on tap and confirms on second tap', () => {
  const scene = createMockScene();
  const movie = createMockMovie({
    streamingServiceId: 'netflix',
    streamingServiceName: 'NETFLIX',
  });

  startStreamingServiceChoice(scene, movie);
  const state = getStreamingChoiceState(scene)!;
  state.services.push({ id: 'prime', name: 'AMAZON PRIME VIDEO' });

  // Simulate draw to register serviceRowRegions
  const fakeCtx: any = {
    save: () => {}, restore: () => {}, beginPath: () => {},
    moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fillText: () => {},
  };
  drawStreamingChoiceOverlays(fakeCtx, { dvd2003: false }, movie);

  // Row 0 is at y≈230-258, Row 1 is at y≈258-286 on a 768-high canvas.
  // In UV coordinates: uv.y = 1 - (canvasY / 768).
  // For canvasY = 270 (row 1): uv.y = 1 - 270/768 ≈ 0.648.
  const uvRow1 = { x: 0.2, y: 1 - 270 / 768 } as any;

  // First tap selects row 1
  assert.equal(handleStreamingBackTap(scene, uvRow1), true);
  assert.equal(state.selectedIndex, 1);

  // Second tap on already selected row 1 confirms the choice
  assert.equal(handleStreamingBackTap(scene, uvRow1), true);
  assert.equal(scene.mode, 'checkout');
});
