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
  clearStreamingCheckoutMovie,
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
      drop(movieId?: string) {
        const idx = movieId != null
          ? carriedTapes.findIndex((m) => m.id === movieId)
          : carriedTapes.length - 1;
        if (idx === -1) return null;
        const [dropped] = carriedTapes.splice(idx, 1);
        this.count = carriedTapes.length;
        return dropped;
      },
      ids() {
        return carriedTapes.map((m) => m.id);
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
    backAction() {
      if (this.mode === 'inspect') {
        cancelStreamingServiceChoice(this);
        this.mode = 'browse';
        this.isFlipped = false;
        this.heroFace = 0;
        this.heroSpine = false;
        this.onConsoleLog('[System] Returned to shelf browse.', 'system');
        return true;
      }
      if (this.mode === 'checkout') {
        if (this.checkoutRunning) return true;
        const streamingMovie = getStreamingCheckoutMovie(this);
        if (streamingMovie) {
          if (typeof this.carried?.drop === 'function') this.carried.drop(streamingMovie.id);
          else this.carried?.clearAll(true);
          clearStreamingCheckoutMovie(this);
        }
        this.clerk?.releaseFromRegister?.();
        if (this.overviewStart) {
          this.enterOverview();
        } else {
          this.mode = 'library-select';
          if (this.onModeChange) this.onModeChange(this.mode);
          this.updateCameraTarget?.();
        }
        this.onConsoleLog('[System] Left the checkout counter.', 'system');
        return true;
      }
      return false;
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

test('getAvailableStreamingServices: returns empty array when no services are available', () => {
  const movie = createMockMovie({
    streamingServiceId: undefined,
    streamingServiceName: undefined,
    streamingUrl: undefined,
    streamingServices: undefined,
  });
  const services = getAvailableStreamingServices(movie);
  assert.deepEqual(services, []);
});

test('startStreamingServiceChoice: aborts and logs notification when movie has no available streaming services', () => {
  const scene = createMockScene();
  let loggedMsg = '';
  let loggedCategory = '';
  scene.onConsoleLog = (msg: string, cat?: string) => {
    loggedMsg = msg;
    loggedCategory = cat ?? '';
  };
  const movie = createMockMovie({
    streamingServiceId: undefined,
    streamingServiceName: undefined,
    streamingUrl: undefined,
    streamingServices: undefined,
  });

  const result = startStreamingServiceChoice(scene, movie);
  assert.equal(result, false);
  assert.equal(isStreamingChoiceActive(movie), false);
  assert.equal(scene.isFlipped, false);
  assert.equal(getStreamingChoiceState(scene), null);
  assert.equal(loggedMsg, '[System] No streaming services currently available for this title.');
  assert.equal(loggedCategory, 'system');
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

test('clearStreamingCheckoutMovie: removes movie from checkoutMovies and drops it from scene.carried', () => {
  const scene = createMockScene();
  const movie = createMockMovie({ id: 'streaming_101', title: 'The Matrix' });

  startStreamingServiceChoice(scene, movie);
  confirmStreamingServiceChoice(scene);
  assert.equal(scene.carried.count, 1);
  assert.equal(getStreamingCheckoutMovie(scene)?.id, movie.id);

  clearStreamingCheckoutMovie(scene);
  assert.equal(getStreamingCheckoutMovie(scene), null);
  assert.equal(scene.carried.count, 0);
});

test('clearStreamingCheckoutMovie: preserves existing physical rental tapes in carried stack', () => {
  const scene = createMockScene();
  const physicalMovie = createMockMovie({ id: 'physical_tape_1', title: 'Jurassic Park', streaming: false });
  const streamingMovie = createMockMovie({ id: 'streaming_202', title: 'Interstellar', streaming: true });

  // Player picks up a physical rental tape first
  scene.carried.take(physicalMovie);
  assert.equal(scene.carried.count, 1);

  // Player initiates streaming checkout
  startStreamingServiceChoice(scene, streamingMovie);
  confirmStreamingServiceChoice(scene);
  assert.equal(scene.carried.count, 2);
  assert.equal(getStreamingCheckoutMovie(scene)?.id, streamingMovie.id);

  // Clearing streaming checkout drops ONLY the streaming movie
  clearStreamingCheckoutMovie(scene);
  assert.equal(getStreamingCheckoutMovie(scene), null);
  assert.equal(scene.carried.count, 1);
  assert.equal(scene.carried.topMovie()?.id, physicalMovie.id);
});

test('clearStreamingCheckoutMovie: falls back to clearAll when drop is not available on carried', () => {
  const carriedTapes: Movie[] = [];
  const scene = createMockScene({
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
      // Note: no drop method provided
    },
  });
  const movie = createMockMovie({ id: 'streaming_303', title: 'Memento' });

  startStreamingServiceChoice(scene, movie);
  confirmStreamingServiceChoice(scene);
  assert.equal(scene.carried.count, 1);
  assert.equal(getStreamingCheckoutMovie(scene)?.id, movie.id);

  clearStreamingCheckoutMovie(scene);
  assert.equal(getStreamingCheckoutMovie(scene), null);
  assert.equal(scene.carried.count, 0);
});

test('backAction: backing out of checkout counter drops streaming movie from carried stack while preserving physical tapes', () => {
  const scene = createMockScene();
  const physicalMovie = createMockMovie({ id: 'physical_tape_1', title: 'Blade Runner', streaming: false });
  const streamingMovie = createMockMovie({ id: 'streaming_404', title: 'Alien', streaming: true });

  // Player has a physical tape
  scene.carried.take(physicalMovie);
  assert.equal(scene.carried.count, 1);

  // Player chooses streaming movie and flies to counter
  startStreamingServiceChoice(scene, streamingMovie);
  confirmStreamingServiceChoice(scene);
  assert.equal(scene.mode, 'checkout');
  assert.equal(scene.carried.count, 2);
  assert.equal(getStreamingCheckoutMovie(scene)?.id, streamingMovie.id);

  // Player backs out of the checkout counter
  const handled = scene.backAction();
  assert.equal(handled, true);
  assert.equal(scene.mode, 'overview');
  assert.equal(getStreamingCheckoutMovie(scene), null);
  // Physical tape is preserved, streaming movie is removed!
  assert.equal(scene.carried.count, 1);
  assert.equal(scene.carried.topMovie()?.id, physicalMovie.id);
});

test('backAction: backing out of inspect mode cancels active streaming service choice state', () => {
  const scene = createMockScene();
  const streamingMovie = createMockMovie({ id: 'streaming_501', title: 'Arrival', streaming: true });

  startStreamingServiceChoice(scene, streamingMovie);
  assert.equal(isStreamingChoiceActive(streamingMovie), true);
  assert.equal(scene.isFlipped, true);

  const handled = scene.backAction();
  assert.equal(handled, true);
  assert.equal(scene.mode, 'browse');
  assert.equal(isStreamingChoiceActive(streamingMovie), false);
  assert.equal(scene.isFlipped, false);

  // Re-inspecting that movie later starts fresh without stale choice state
  scene.mode = 'inspect';
  assert.equal(isStreamingChoiceActive(streamingMovie), false);
});

test('case flip: toggling case back to front cancels active streaming choice', () => {
  const scene = createMockScene();
  const streamingMovie = createMockMovie({ id: 'streaming_502', title: 'Ex Machina', streaming: true });

  startStreamingServiceChoice(scene, streamingMovie);
  assert.equal(isStreamingChoiceActive(streamingMovie), true);
  assert.equal(scene.isFlipped, true);

  // Simulate toggleFlip on a noRentalCase slot
  scene.isFlipped = !scene.isFlipped;
  if (!scene.isFlipped && isStreamingChoiceActive(streamingMovie)) {
    cancelStreamingServiceChoice(scene);
  }
  assert.equal(isStreamingChoiceActive(streamingMovie), false);
  assert.equal(scene.isFlipped, false);
});

test('mobileStoreTap: switching slots or touching outside cancels active streaming choice', () => {
  const scene = createMockScene();
  const streamingMovie = createMockMovie({ id: 'streaming_503', title: 'Her', streaming: true });

  startStreamingServiceChoice(scene, streamingMovie);
  assert.equal(isStreamingChoiceActive(streamingMovie), true);
  assert.equal(scene.mode, 'inspect');

  // Simulate mobileStoreTap resolving a picked slot and exiting inspect mode
  cancelStreamingServiceChoice(scene);
  scene.mode = 'browse';

  assert.equal(isStreamingChoiceActive(streamingMovie), false);
  assert.equal(scene.mode, 'browse');
});

